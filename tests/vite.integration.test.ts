import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build, createServer } from 'vite';
import { webAnnotator } from '../lib/vite.js';

const initialCard = `const identity = <T,>(value: T): T => value;\ntype Props = { title?: string };\nexport function Card({ title = 'before' }: Props) {\n  return <section id="card"><h1>{identity(title)}</h1><input aria-label="name" /></section>;\n}\ndocument.body.dataset.demo = String(Card({ title: 'hello' }));\n`;
const testRequire = createRequire(import.meta.url);
const reactAliases = ['react/jsx-dev-runtime', 'react/jsx-runtime'].map((find) => ({
  find,
  replacement: testRequire.resolve(find),
}));

async function fixture() {
  // Windows CI exposes TEMP through an 8.3 alias (RUNNER~1). Vite checks
  // canonical file paths, so its root must use the same canonical directory.
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'web-annotator-vite-')));
  await mkdir(join(directory, 'src'));
  await writeFile(
    join(directory, 'index.html'),
    '<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="/src/Card.tsx"></script></body></html>',
  );
  await writeFile(join(directory, 'src', 'Card.tsx'), initialCard);
  return directory;
}

test('packaged Vite entry serves its bridge and preserves TSX source hints across invalidation', async () => {
  const directory = await fixture();
  const server = await createServer({
    configFile: false,
    root: directory,
    base: '/sandbox/',
    logLevel: 'silent',
    resolve: { alias: reactAliases },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [webAnnotator({ allowedParentOrigins: ['https://harness.example.com'] })],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  try {
    await server.listen();
    const address = server.httpServer!.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    const htmlResponse = await fetch(`${origin}/sandbox/`);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    assert.match(html, /window\.__WEB_ANNOTATOR_CONFIG__/);
    assert.match(html, /https:\/\/harness\.example\.com/);
    assert.match(html, /\/sandbox\/__web-annotator__\/bridge\.js/);
    const bridge = await fetch(`${origin}/sandbox/__web-annotator__/bridge.js`);
    assert.equal(bridge.status, 200);
    assert.match(bridge.headers.get('content-type')!, /text\/javascript/);
    assert.equal(bridge.headers.get('cache-control'), 'no-store');
    assert.equal(bridge.headers.get('x-content-type-options'), 'nosniff');
    assert.match(await bridge.text(), /dsh-browser-annotation-v1/);
    const head = await fetch(`${origin}/sandbox/__web-annotator__/bridge.js`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');

    const transformed = await server.transformRequest('/src/Card.tsx');
    assert.ok(transformed);
    assert.match(transformed.code, /data-web-annotator-source/);
    assert.match(transformed.code, /src\/Card\.tsx:4:10/);
    assert.ok(transformed.map, 'source hints must retain a sourcemap');
    await writeFile(join(directory, 'src', 'Card.tsx'), initialCard.replace("'before'", "'after'"));
    server.moduleGraph.invalidateAll();
    const updated = await server.transformRequest('/src/Card.tsx');
    assert.ok(updated);
    assert.match(updated.code, /after/);
    assert.match(updated.code, /src\/Card\.tsx:4:10/);
    assert.equal(
      (updated.code.match(/data-web-annotator-source/g) ?? []).length,
      3,
      're-transforming must not duplicate source hints',
    );
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a real Vite production build excludes both bridge injection and source markers', async () => {
  const directory = await fixture();
  try {
    const result = await build({
      configFile: false,
      root: directory,
      logLevel: 'silent',
      resolve: { alias: reactAliases },
      plugins: [webAnnotator()],
      build: { write: false, minify: false },
    });
    assert.ok(!Array.isArray(result) && 'output' in result);
    const published = result.output
      .map((asset) => (asset.type === 'chunk' ? asset.code : String(asset.source)))
      .join('\n');
    assert.doesNotMatch(
      published,
      /__WEB_ANNOTATOR_CONFIG__|__web-annotator__\/bridge|data-web-annotator-source/,
    );
    assert.equal(
      await readFile(join(directory, 'src', 'Card.tsx'), 'utf8'),
      initialCard,
      'development tooling must not edit the source file',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
