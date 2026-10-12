/**
 * Serve a local frontend over HTTP with the annotation bridge injected.
 *
 * Why this exists: the Harness Browser accepts HTTP(S) addresses only, and in the Web
 * client only a page that carries the bridge can be annotated. A local file therefore
 * cannot be annotated on its own, no matter where it is opened. This command supplies
 * both halves at once: an HTTP origin on loopback, and the bridge in every HTML response.
 *
 * Not a gate: it serves the developer's own project and changes no project file.
 * Depends only on Node builtins so it runs after a frozen install.
 *
 * Exit codes: 0 = served until interrupted, 1 = a premise failed (missing bridge,
 * missing directory, bad arguments).
 *
 * Usage:
 *   node scripts/annotate-serve.mjs <directory> [--port 4180]
 *   node scripts/annotate-serve.mjs --proxy http://127.0.0.1:5173 [--port 4180]
 *   npm run annotate -- <directory>
 */
import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The visited page asks the parent for one picker through this fixed route. */
const BRIDGE_ROUTE = '/__web-annotator__/bridge.js';
/** A bridge bundle always carries this global; its absence means a wrong or stale file. */
const BRIDGE_MARKER = '__DSH_PAGE_ANNOTATION_BRIDGE_DISPOSE__';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

/**
 * Locate the bridge bundle. This package's own build output is the fact source; an
 * installed profile is the fallback, because a developer may run this before `npm run build`.
 * @param explicit - value of `--bridge`, when given.
 * @returns absolute path of an existing bridge bundle.
 */
export function resolveBridge(explicit) {
  const candidates = explicit
    ? [resolve(explicit)]
    : [
        join(ROOT, 'lib', 'bridge.js'),
        join(
          homedir(),
          '.dsh',
          'profiles',
          'web',
          'node_modules',
          'dsh-web-annotator',
          'lib',
          'bridge.js',
        ),
        join(
          homedir(),
          '.dsh',
          'profiles',
          'desktop',
          'node_modules',
          'dsh-web-annotator',
          'lib',
          'bridge.js',
        ),
      ];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error(
    `找不到 bridge.js。先跑 npm run build，或用 --bridge <路径> 指定。\n已试过：\n  ${candidates.join('\n  ')}`,
  );
}

/**
 * Insert the configuration script and the bridge script into one HTML document.
 * Order matters: the bridge reads `window.__WEB_ANNOTATOR_CONFIG__` as it executes.
 * @param html - response body of an HTML document.
 * @returns the document with both tags injected exactly once.
 */
export function injectBridge(html) {
  if (html.includes(BRIDGE_ROUTE)) return html;
  const tags = `<script>window.__WEB_ANNOTATOR_CONFIG__={"allowedParentOrigins":[]};</script><script src="${BRIDGE_ROUTE}" defer></script>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tags}</head>`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (match) => `${match}${tags}`);
  return `${tags}${html}`;
}

/**
 * Parse command-line arguments.
 * @param argv - `process.argv.slice(2)`.
 * @returns the target directory or proxy upstream, plus the port and bridge override.
 */
export function parseArgs(argv) {
  const args = { directory: undefined, port: 4180, bridge: undefined, proxy: undefined };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--port') args.port = Number(argv[++i]);
    else if (value === '--bridge') args.bridge = argv[++i];
    else if (value === '--proxy') args.proxy = argv[++i];
    else if (value === '--help' || value === '-h') args.help = true;
    else if (value.startsWith('-')) throw new Error(`未知参数：${value}`);
    else if (args.directory === undefined) args.directory = value;
    else throw new Error(`只接受一个目录，多余的是：${value}`);
  }
  if (args.help) return args;
  if (!args.proxy && !args.directory) throw new Error('缺少目录，或改用 --proxy <地址>。');
  if (args.proxy && args.directory) throw new Error('--proxy 与目录不能同时给。');
  if (args.proxy) {
    const upstream = new URL(args.proxy);
    if (!['http:', 'https:'].includes(upstream.protocol))
      throw new Error(`--proxy 只接受 HTTP(S) 地址：${args.proxy}`);
  }
  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65535)
    throw new Error(`端口不合法：${String(args.port)}`);
  return args;
}

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type ?? 'text/plain; charset=utf-8' });
  res.end(body);
}

/** Serve a directory tree, injecting the bridge into HTML responses only. */
function staticHandler(root, bridgeSource) {
  return async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    if (pathname === BRIDGE_ROUTE) return send(res, 200, bridgeSource, MIME['.js']);
    const relativePath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const target = resolve(root, `.${normalize(relativePath)}`);
    // The resolved path must stay inside the served root: `..` and encoded variants alike.
    if (target !== root && !target.startsWith(root + sep))
      return send(res, 403, '禁止访问根目录之外的文件。');
    let stat;
    try {
      stat = statSync(target);
    } catch {
      return send(res, 404, `404 Not Found: ${pathname}`);
    }
    if (stat.isDirectory()) {
      res.writeHead(301, { Location: `${pathname}/` });
      res.end();
      return;
    }
    const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream';
    if (!type.startsWith('text/html')) {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size });
      createReadStream(target).pipe(res);
      return;
    }
    send(res, 200, injectBridge(await readFile(target, 'utf8')), MIME['.html']);
  };
}

/**
 * Proxy a project's own dev server so the bridge reaches pages that server produces.
 * Bodies are requested uncompressed because HTML has to be rewritten before delivery.
 */
function proxyHandler(upstreamUrl, bridgeSource) {
  const upstream = new URL(upstreamUrl);
  return (req, res) => {
    if (req.url === BRIDGE_ROUTE) return send(res, 200, bridgeSource, MIME['.js']);
    const forwarded = httpRequest(
      {
        hostname: upstream.hostname,
        port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: upstream.host, 'accept-encoding': 'identity' },
      },
      (response) => {
        const headers = { ...response.headers };
        // Rewritten or re-framed bodies make the upstream framing headers wrong.
        delete headers['content-length'];
        delete headers['content-encoding'];
        if (!String(response.headers['content-type'] ?? '').includes('text/html')) {
          res.writeHead(response.statusCode ?? 502, headers);
          response.pipe(res);
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const html = injectBridge(Buffer.concat(chunks).toString('utf8'));
          res.writeHead(response.statusCode ?? 200, { ...headers, 'content-type': MIME['.html'] });
          res.end(html);
        });
      },
    );
    forwarded.on('error', (error) => send(res, 502, `上游不可达：${error.message}`));
    req.pipe(forwarded);
  };
}

function usage() {
  return [
    '用法：',
    '  npm run annotate -- <目录> [--port 4180]        服务本地目录',
    '  npm run annotate -- --proxy <地址> [--port 4180]  套在已有 dev server 前面',
    '  --bridge <路径>                                  指定 bridge.js（默认用本包 lib/）',
    '',
    '启动后在 Harness 里点「批注网页」，输入打印出来的地址。',
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const bridgePath = resolveBridge(args.bridge);
  const bridgeSource = readFileSync(bridgePath, 'utf8');
  if (!bridgeSource.includes(BRIDGE_MARKER))
    throw new Error(`${bridgePath} 不是批注桥接产物（缺少 ${BRIDGE_MARKER}）。`);

  let root;
  if (args.directory !== undefined) {
    root = resolve(args.directory);
    if (!existsSync(root)) throw new Error(`目录不存在：${root}`);
    if (!statSync(root).isDirectory()) throw new Error(`不是目录：${root}`);
    if (!existsSync(join(root, 'index.html')))
      console.warn(`提示：${root} 下没有 index.html，根路径会 404；直接访问具体 .html 即可。`);
  }

  const handler = args.proxy
    ? proxyHandler(args.proxy, bridgeSource)
    : staticHandler(root, bridgeSource);

  createServer((req, res) => {
    void Promise.resolve(handler(req, res)).catch((error) => {
      send(res, 500, error instanceof Error ? error.message : String(error));
    });
  }).listen(args.port, '127.0.0.1', () => {
    console.log(`批注服务已启动：http://127.0.0.1:${String(args.port)}`);
    console.log(args.proxy ? `代理上游：${args.proxy}` : `服务目录：${root}`);
    console.log(`桥接产物：${bridgePath}`);
    console.log('只监听 127.0.0.1。在 Harness 里点「批注网页」，输入上面的地址。');
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // A hand-run tool: report a failed premise as one line plus the usage, not a stack trace.
  try {
    main();
  } catch (error) {
    console.error(`annotate-serve: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`\n${usage()}`);
    process.exitCode = 1;
  }
}
