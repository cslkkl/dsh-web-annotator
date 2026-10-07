import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { parse } from '@babel/parser';
import type { ResolvedConfig } from 'vite';
import {
  annotateJsxSource,
  webAnnotator,
  normalizeAllowedOrigins,
  serializeBridgeConfig,
} from '../src/vite.js';

test('explicit parent origins are normalized and reject paths, credentials and wildcards', () => {
  assert.deepEqual(
    normalizeAllowedOrigins([
      'http://localhost:3000/',
      'http://localhost:3000',
      'https://example.com',
    ]),
    ['http://localhost:3000', 'https://example.com'],
  );
  for (const invalid of [
    '*',
    'null',
    'file:///preview',
    'https://user:secret@example.com',
    'https://example.com/path',
    'https://example.com/?q=x',
    'https://example.com/#fragment',
  ]) {
    assert.throws(() => normalizeAllowedOrigins([invalid]), /DSH Web Annotator:/);
  }
  assert.throws(
    () => normalizeAllowedOrigins(Array.from({ length: 33 }, () => 'https://example.com')),
    /at most 32/,
  );
});

test('configuration stays data and is emitted only by a serve-only Vite plugin', () => {
  assert.equal(
    serializeBridgeConfig(['https://example.com']),
    '{"allowedParentOrigins":["https://example.com"]}',
  );
  assert.throws(() => serializeBridgeConfig(['https://example.com/</script>']), /exact HTTP/);
  assert.equal(webAnnotator().apply, 'serve');
  assert.throws(
    () => webAnnotator({ sourceAnnotations: 'false' as unknown as boolean }),
    /must be a boolean/,
  );
});

test('JSX source hints identify intrinsic nodes without rewriting component names, comments or strings', () => {
  const code = `const text = "<div />";\n// <button />\nconst View = () => <Panel><section {...props}><input /><my-widget /></section></Panel>;`;
  const result = annotateJsxSource(code, 'src/View.tsx');
  assert.equal(result.annotations, 3);
  assert.match(result.code, /<Panel>/);
  assert.match(result.code, /<section data-web-annotator-source=\{"src\/View.tsx:3:27"\}/);
  assert.match(result.code, /const text = "<div \/>";/);
  assert.match(result.code, /\/\/ <button \/>/);
  assert.doesNotThrow(() =>
    parse(result.code, { sourceType: 'module', plugins: ['jsx', 'typescript'] }),
  );
  assert.equal(result.code.split('\n').length, code.split('\n').length);
  assert.deepEqual(result.map.sources, ['src/View.tsx']);
  assert.deepEqual(result.map.sourcesContent, [code]);
});

test('existing markers survive, fragments work and quoted file paths remain valid JSX', () => {
  const code = `<><div data-web-annotator-source="existing"/><svg><path d="M0 0" /></svg><UI.Button /></>`;
  const result = annotateJsxSource(code, 'src/quoted"name.tsx');
  assert.equal(result.annotations, 2);
  assert.match(result.code, /data-web-annotator-source="existing"/);
  assert.match(result.code, /<UI.Button \/>/);
  assert.doesNotThrow(() => parse(result.code, { plugins: ['jsx', 'typescript'] }));
});

test('malformed JSX is rejected instead of receiving a regex-based rewrite', () => {
  assert.throws(() => annotateJsxSource('<div><span></div>', 'broken.tsx'));
});

test('HTML bridge URL respects the Vite base and includes the exact configured origins', () => {
  const plugin = webAnnotator({ allowedParentOrigins: ['https://harness.example.com'] });
  assert.equal(typeof plugin.configResolved, 'function');
  (plugin.configResolved as (config: ResolvedConfig) => void)({
    base: '/preview/',
    root: resolve('fixture'),
  } as ResolvedConfig);
  assert.equal(typeof plugin.transformIndexHtml, 'function');
  const tags = (
    plugin.transformIndexHtml as () => {
      tag: string;
      attrs?: Record<string, unknown>;
      children?: string;
    }[]
  )();
  assert.equal(tags[1].attrs?.src, '/preview/__web-annotator__/bridge.js');
  assert.equal(tags[1].attrs?.defer, true);
  assert.equal(
    tags[0].children,
    'window.__WEB_ANNOTATOR_CONFIG__={"allowedParentOrigins":["https://harness.example.com"]};',
  );
});

test('development source transform is scoped to project JSX and supports an explicit opt-out', () => {
  const projectRoot = resolve('fixture');
  const plugin = webAnnotator();
  (plugin.configResolved as (config: ResolvedConfig) => void)({
    base: '/',
    root: projectRoot,
  } as ResolvedConfig);
  const warnings: string[] = [];
  const transform = plugin.transform as (
    this: { warn: (message: string) => void },
    code: string,
    id: string,
  ) => { code: string } | null;
  const run = (code: string, id: string) =>
    transform.call({ warn: (message) => warnings.push(message) }, code, id);
  assert.match(run('<div />', resolve(projectRoot, 'src/View.tsx'))!.code, /src\/View.tsx:1:1/);
  assert.equal(run('<div />', resolve(projectRoot, 'node_modules/pkg/View.tsx')), null);
  assert.equal(run('<div />', resolve(projectRoot, '../other/View.tsx')), null);
  assert.equal(run('const html = "<div />";', resolve(projectRoot, 'src/View.ts')), null);
  assert.equal(run('<div><span></div>', resolve(projectRoot, 'src/Broken.tsx')), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /source hints unavailable/);
  const disabled = webAnnotator({ sourceAnnotations: false });
  assert.equal(
    (disabled.transform as typeof transform).call(
      { warn: () => assert.fail('should not parse when disabled') },
      '<div />',
      resolve(projectRoot, 'src/View.tsx'),
    ),
    null,
  );
});
