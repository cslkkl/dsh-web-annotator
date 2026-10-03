/** Helpers for integration tests against the real Harness 0.2.0-rc.2 Web host.
 * No mock app, profile edits, model configuration, or package installation occurs here.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { isAbsolute, relative, resolve } from 'node:path';

const RPC_ENDPOINT = /^[A-Za-z0-9_$.-]+(?:\/[A-Za-z0-9_$.-]+)*$/;

function localUrl(input) {
  const url = new URL(input);
  const local =
    url.hostname === 'localhost' ||
    url.hostname === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  if (url.protocol !== 'http:' || !local || url.username || url.password) {
    throw new Error('Harness test helpers require a local HTTP host.');
  }
  return url;
}

function redactLaunchTokens(text) {
  return text.replace(/([?&]token=)[^\s"'<>]+/g, '$1[redacted]');
}

function childOf(root, target) {
  const path = relative(resolve(root), resolve(target));
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
}

/** Start an existing isolated profile with an optional workspace overlay.
 * Pass a .js CLI entry (the installed @deepseek-ai/dsh package's bin), not dsh.cmd.
 * The returned launchUrl contains an authentication token; keep it in memory.
 */
export async function startHarness({
  cliEntry,
  workspace,
  testHome,
  profile = 'layout-care-test',
  patch,
  port = 0,
  initialize = false,
  timeoutMs = 60_000,
  env = {},
  onLog,
}) {
  if (!cliEntry || !isAbsolute(cliEntry))
    throw new Error('Pass an absolute Harness CLI entry path.');
  if (!workspace || !testHome || !childOf(workspace, testHome)) {
    throw new Error('The isolated Harness home must be a child of the test workspace.');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
  const args = [cliEntry, '--profile', profile];
  if (initialize) args.push('--from-default-profile', 'web');
  if (patch) args.push('--patch', resolve(patch));
  args.push('--no-open', '--port', String(port));
  const processHandle = spawn(process.execPath, args, {
    cwd: resolve(workspace),
    env: { ...process.env, ...env, DSH_HOME: resolve(testHome) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let rawLogs = '';
  let launchUrl;
  let ready;
  let fail;
  const readiness = new Promise((resolveReady, rejectReady) => {
    ready = resolveReady;
    fail = rejectReady;
  });
  const collect = (data) => {
    const text = data.toString();
    rawLogs = (rawLogs + text).slice(-250_000);
    onLog?.(redactLaunchTokens(text));
    const match = rawLogs.match(/dsh web:\s*(https?:\/\/[^\s]+)/);
    if (match && !launchUrl) {
      launchUrl = localUrl(match[1]).href;
      ready(launchUrl);
    }
  };
  processHandle.stdout.on('data', collect);
  processHandle.stderr.on('data', collect);
  processHandle.once('error', fail);
  processHandle.once('exit', (code, signal) => {
    if (!launchUrl)
      fail(
        new Error(
          `Harness exited before readiness (${code ?? signal}).\n${redactLaunchTokens(rawLogs)}`,
        ),
      );
  });
  const timer = setTimeout(
    () => fail(new Error(`Harness readiness timed out.\n${redactLaunchTokens(rawLogs)}`)),
    timeoutMs,
  );
  try {
    await readiness;
  } catch (error) {
    processHandle.kill();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  return {
    process: processHandle,
    launchUrl,
    getLogs: () => redactLaunchTokens(rawLogs),
    async stop() {
      if (processHandle.exitCode !== null || processHandle.signalCode !== null) return;
      const ended = once(processHandle, 'exit');
      processHandle.kill('SIGTERM');
      const forced = setTimeout(() => processHandle.kill('SIGKILL'), 5_000);
      try {
        await ended;
      } finally {
        clearTimeout(forced);
      }
    },
  };
}

/** Authenticate using the launch URL's ordinary root token exchange.
 * The signed cookie remains private to this returned test client.
 */
export async function connectHarness(launchUrl, { timeoutMs = 30_000 } = {}) {
  const authenticated = localUrl(launchUrl);
  const exchanged = await fetch(authenticated, {
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const setCookies = exchanged.headers.getSetCookie();
  const cookie = setCookies.map((value) => value.split(';', 1)[0]).join('; ');
  if (!cookie || ![301, 302, 303, 307, 308].includes(exchanged.status)) {
    throw new Error(
      `Harness token exchange did not issue a signed cookie (HTTP ${exchanged.status}).`,
    );
  }
  const baseUrl = new URL(exchanged.headers.get('location') || './', authenticated);
  baseUrl.search = '';
  baseUrl.hash = '';
  const rpc = async (endpoint, args = {}, { signal } = {}) => {
    if (!RPC_ENDPOINT.test(endpoint)) throw new Error('Invalid Harness RPC endpoint.');
    const rpcId = randomUUID();
    const response = await fetch(new URL(`api/${endpoint}`, baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin: baseUrl.origin },
      body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }),
      signal: signal || AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Harness ${endpoint}: HTTP ${response.status}.`);
    const envelope = await response.json();
    if (
      envelope.type !== 'server-response' ||
      envelope.rpcId !== rpcId ||
      typeof envelope.result?.ok !== 'boolean'
    ) {
      throw new Error(`Harness ${endpoint}: invalid response envelope.`);
    }
    if (!envelope.result.ok) {
      const failure = envelope.result.error;
      const error = new Error(`${failure.code}: ${failure.message}`);
      error.code = failure.code;
      error.details = failure.details;
      throw error;
    }
    return envelope.result.value;
  };
  return {
    baseUrl: baseUrl.href,
    rpc,
    createSession: (request = {}) => rpc('session/create', { request }),
    listSessions: (request = {}) => rpc('session/list', { _request: request }),
    // Page reads need the exact follow opening watermark, not just a Session id.
    readSession: (request) => rpc('session/page', { request }),
    sendPrompt: (
      sessionId,
      text,
      { mode = 'queue', clientTimeZone = 'Asia/Shanghai', signal } = {},
    ) =>
      rpc(
        'session/prompt',
        {
          request: {
            sessionId,
            requestId: randomUUID(),
            mode,
            content: [{ type: 'text', text }],
            clientTimeZone,
          },
        },
        { signal },
      ),
    cancel: (sessionId) => rpc('session/cancel', { request: { sessionId } }),
    modelCatalog: () => rpc('session/modelCatalog'),
  };
}
