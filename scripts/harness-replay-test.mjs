/** Credential-free integration fixture: real Harness Loader, API, Agent loop,
 * session journal and Client module roster, with the official replay adapter.
 * Run after building the plugin. No personal Harness profile is read or changed.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { connectHarness, startHarness } from './harness-test-helpers.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The checkout's parent directory. Test homes live there, never in the package. */
const defaultWorkspace = resolve(packageRoot, '..');
const reply1 = 'DSH Web Annotator replay: received the responsive repair request.';
const reply2 = 'DSH Web Annotator replay: preserved regions remain review conditions.';
const prompts = [
  'DSH Web Annotator integration: inspect horizontal overflow at 390px; preserve the desktop title.',
  'DSH Web Annotator integration: confirm that preserve annotations are checks, not guarantees.',
];
const exec = promisify(execFile);

function dependencyEntries(workspace) {
  const require = createRequire(import.meta.url);
  let cliEntry = process.env.DSH_CLI_ENTRY;
  if (!cliEntry) {
    try {
      cliEntry = join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js');
    } catch {
      if (process.env.APPDATA)
        cliEntry = join(process.env.APPDATA, 'npm/node_modules/@deepseek-ai/dsh/lib/bin.js');
    }
  }
  let replayEntry = process.env.DSH_REPLAY_ENTRY;
  if (!replayEntry) {
    try {
      replayEntry = require.resolve('@deepseek-ai/dsh-llm-replay');
    } catch {
      replayEntry = join(
        workspace,
        'work/web-annotator-replay-testdeps/node_modules/@deepseek-ai/dsh-llm-replay/lib/index.js',
      );
    }
  }
  if (!cliEntry) throw new Error('Set DSH_CLI_ENTRY to the Harness 0.2.0-rc.2 lib/bin.js file.');
  return { cliEntry: resolve(cliEntry), replayEntry: resolve(replayEntry) };
}

function textStream(text) {
  return {
    kind: 'chunks',
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text },
      { type: 'block-end', index: 0, block: { type: 'text', text } },
      { type: 'usage', usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
  };
}

function yamlString(value) {
  return JSON.stringify(value.replaceAll('\\', '/'));
}

/** Start a fresh owned Web fixture. The launchUrl is private auth material:
 * use it in browser navigation, never commit or print it.
 */
export async function launchReplayFixture({
  workspace = defaultWorkspace,
  pluginRoot = packageRoot,
  port = 0,
  responses = [reply1, reply2],
  cliEntry,
  replayEntry,
  tarball = process.env.WEB_ANNOTATOR_TARBALL,
  previewTarball,
  onLog,
  browserProviderRoot,
  chatProviderRoot,
  layoutProviderRoot,
} = {}) {
  const entries = dependencyEntries(workspace);
  cliEntry = resolve(cliEntry || entries.cliEntry);
  replayEntry = resolve(replayEntry || entries.replayEntry);
  const replay = await import(pathToFileURL(replayEntry).href);
  const replayManifest = JSON.parse(
    await readFile(join(dirname(replayEntry), '../package.json'), 'utf8'),
  );
  const cliManifest = JSON.parse(
    await readFile(join(dirname(cliEntry), '../package.json'), 'utf8'),
  );
  assert.equal(
    replayManifest.version,
    '0.2.0-rc.2',
    'Replay must match the target Harness version.',
  );
  assert.equal(
    cliManifest.version,
    '0.2.0-rc.2',
    'The integration fixture targets Harness 0.2.0-rc.2.',
  );
  const work = join(resolve(workspace), 'work');
  await mkdir(work, { recursive: true });
  const runtime = await mkdtemp(join(work, 'web-annotator-replay-runtime-'));
  const testHome = join(runtime, 'home');
  const profileRoot = join(testHome, 'profiles/web-annotator-replay');
  const sessionsRoot = join(runtime, 'sessions');
  const overrideFile = join(runtime, 'replay.override.json');
  await writeFile(overrideFile, JSON.stringify(responses.map(textStream), null, 2) + '\n');
  // rc.2 explicitly supports a whole-script override with file === overrideFile.
  assert.equal(
    replay.loadReplayScript({ file: overrideFile, overrideFile }).length,
    responses.length,
  );
  const patch = join(runtime, 'harness.patch.yml');
  let initialized = false;
  if (tarball) {
    // Install the packed deliverable through the supported CLI into the fresh
    // profile. The source checkout is absent from this profile's bundle layer.
    const env = {
      ...process.env,
      DSH_HOME: testHome,
      DEEPSEEK_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
    };
    await exec(
      process.execPath,
      [
        cliEntry,
        '--profile',
        'web-annotator-replay',
        '--from-default-profile',
        'web',
        '--dump-config',
      ],
      { cwd: workspace, env, windowsHide: true, timeout: 60_000, maxBuffer: 2_000_000 },
    );
    await exec(
      process.execPath,
      [
        cliEntry,
        'plugin',
        '--profile',
        'web-annotator-replay',
        'add',
        '--ignore-scripts',
        resolve(tarball),
        ...(previewTarball ? [resolve(previewTarball)] : []),
      ],
      { cwd: workspace, env, windowsHide: true, timeout: 120_000, maxBuffer: 2_000_000 },
    );
    initialized = true;
  }
  const disabled = [
    'llm-deepseek',
    'llm-deepseek-account',
    'llm-pi-ai',
    'session-title-llm',
    'session-telemetry-otel',
    'desktop-product-telemetry',
    'product-analytics',
  ]
    .map((id) => `- id: ${id}\n  disabled: true\n`)
    .join('');
  await writeFile(
    patch,
    disabled +
      (browserProviderRoot ? '- id: ui-sidebar-browser\n  disabled: true\n' : '') +
      (chatProviderRoot ? '- id: ui-chat\n  disabled: true\n' : '') +
      (layoutProviderRoot ? '- id: ui-layout\n  disabled: true\n' : '') +
      '- id: agent-default-model\n  config:\n    provider: web-annotator-replay\n    model: web-annotator-test-model\n' +
      `- id: session-persistence-jsonl\n  config:\n    root: ${yamlString(sessionsRoot)}\n    compression: none\n` +
      '- insert:\n' +
      (browserProviderRoot
        ? `    - id: web-annotator-patched-browser\n      name: ${yamlString(join(browserProviderRoot, 'lib/index.js'))}\n`
        : '') +
      (chatProviderRoot
        ? `    - id: web-annotator-patched-chat\n      name: ${yamlString(join(chatProviderRoot, 'lib/index.js'))}\n`
        : '') +
      (layoutProviderRoot
        ? `    - id: web-annotator-patched-layout\n      name: ${yamlString(join(layoutProviderRoot, 'lib/index.js'))}\n`
        : '') +
      (tarball
        ? ''
        : `    - id: cslkkl-web-annotator\n      name: ${yamlString(join(pluginRoot, 'lib/index.js'))}\n`) +
      `    - id: web-annotator-official-replay\n      name: ${yamlString(replayEntry)}\n      config:\n` +
      `        file: ${yamlString(overrideFile)}\n        overrideFile: ${yamlString(overrideFile)}\n` +
      '        providers:\n          - id: web-annotator-replay\n            name: DSH Web Annotator Test Replay\n            models:\n' +
      '              - id: web-annotator-test-model\n                name: Replay (no provider I/O)\n                contextWindow: 128000\n                inputModalities: [text, image]\n                imageRequestTokens: 100\n',
  );
  const host = await startHarness({
    cliEntry,
    workspace,
    testHome,
    profile: 'web-annotator-replay',
    patch,
    port,
    initialize: !initialized,
    onLog,
    env: { DEEPSEEK_API_KEY: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' },
  });
  try {
    const api = await connectHarness(host.launchUrl);
    return {
      ...host,
      api,
      runtime,
      testHome,
      profileRoot,
      sessionsRoot,
      replayEntry,
      replay,
      tarball,
      expectedResponses: responses,
    };
  } catch (error) {
    await host.stop();
    throw error;
  }
}

async function journalPaths(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const paths = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...(await journalPaths(path)));
    else if (entry.isFile() && /^session(?:\.v\d+)?\.jsonl$/.test(entry.name)) paths.push(path);
  }
  return paths;
}

/** Read only durable current-format events through the official format reader. */
export async function readDurableJournal(fixture, sessionId) {
  const candidates = await journalPaths(fixture.sessionsRoot);
  for (const path of candidates) {
    const source = await readFile(path, 'utf8');
    let header;
    try {
      header = fixture.replay.parseSessionHeader(source);
    } catch {
      continue;
    } // The writer may be between contiguous append frames.
    if (header.id === sessionId) return { path, events: fixture.replay.parseSessionLog(source) };
  }
  return undefined;
}

export async function waitForDurableTurn(fixture, sessionId, turnCount, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const journal = await readDurableJournal(fixture, sessionId);
    if (journal && journal.events.filter((event) => event.type === 'turn/end').length >= turnCount)
      return journal;
    await delay(100);
  }
  throw new Error(`Durable turn ${turnCount} did not settle.\n${fixture.getLogs()}`);
}

function textOf(message) {
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/** Assert the stable semantic transcript, excluding generated identities and clocks. */
export function transcriptSnapshot(events) {
  return events
    .filter(
      (event) =>
        event.type === 'assistant/message' ||
        (event.type === 'user/message' && event.data.source?.kind === 'user'),
    )
    .map((event) => ({
      role: event.type === 'user/message' ? 'user' : 'assistant',
      text: textOf(event.type === 'user/message' ? event.data : event.data.message),
    }));
}

async function main() {
  const fixture = await launchReplayFixture({
    port: Number(process.env.WEB_ANNOTATOR_REPLAY_PORT || 18470),
  });
  if (process.argv.includes('--serve')) {
    const fixtureInfo = join(fixture.runtime, 'fixture-info.json');
    await writeFile(
      fixtureInfo,
      JSON.stringify(
        {
          launchUrl: fixture.launchUrl,
          baseUrl: fixture.api.baseUrl,
          runtime: fixture.runtime,
          sessionsRoot: fixture.sessionsRoot,
          replayEntry: fixture.replayEntry,
          expectedResponses: fixture.expectedResponses,
          tarball: fixture.tarball,
          ownerPid: process.pid,
          hostPid: fixture.process.pid,
        },
        null,
        2,
      ) + '\n',
    );
    // Only the private info path is printed. The root launch token stays in the
    // owned work directory, outside deliverables and version control.
    console.log(JSON.stringify({ fixtureInfo, baseUrl: fixture.api.baseUrl }));
    await new Promise((done) => {
      process.once('SIGTERM', done);
      process.once('SIGINT', done);
      process.stdin.on('data', (data) => {
        if (data.toString().trim() === 'stop') done();
      });
      process.stdin.resume();
    });
    await fixture.stop();
    return;
  }
  try {
    const catalog = await fixture.api.modelCatalog();
    assert.ok(
      JSON.stringify(catalog).includes('web-annotator-test-model'),
      'Replay route must be discoverable.',
    );
    const { sessionId } = await fixture.api.createSession({
      cwd: packageRoot,
      agentPreset: 'standard',
    });
    let journal;
    for (let i = 0; i < prompts.length; i++) {
      assert.deepEqual(await fixture.api.sendPrompt(sessionId, prompts[i]), { accepted: true });
      journal = await waitForDurableTurn(fixture, sessionId, i + 1);
    }
    const expected = prompts.flatMap((text, index) => [
      { role: 'user', text },
      { role: 'assistant', text: fixture.expectedResponses[index] },
    ]);
    const snapshot = transcriptSnapshot(journal.events);
    assert.deepEqual(snapshot, expected);
    const ends = journal.events.filter((event) => event.type === 'turn/end');
    assert.equal(ends.length, 2);
    assert.ok(
      ends.every((event) => event.data.reason.kind === 'completed'),
      'Both real Agent turns must complete successfully.',
    );
    const human = journal.events.filter(
      (event) => event.type === 'user/message' && event.data.source?.kind === 'user',
    );
    assert.equal(human.length, prompts.length);
    assert.ok(
      human.every((event) => event.data.source.rpcId),
      'Browser-style request ids must be durable.',
    );
    await writeFile(
      join(fixture.runtime, 'transcript.snapshot.json'),
      JSON.stringify(snapshot, null, 2) + '\n',
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          harnessVersion: '0.2.0-rc.2',
          adapter: '@deepseek-ai/dsh-llm-replay',
          turns: ends.length,
          messages: snapshot.length,
          snapshot: join(fixture.runtime, 'transcript.snapshot.json'),
        },
        null,
        2,
      ),
    );
  } finally {
    await fixture.stop();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
