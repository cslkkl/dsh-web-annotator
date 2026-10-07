/** Produce every runtime artifact the package ships. No source files are copied. */
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

/** Host entry: a named row in the profile; the Client half owns the feature. */
const host = {
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
};

/** Browser Client half: loaded by the Harness module loader, React stays external. */
const client = {
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-store',
  ],
  jsx: 'automatic',
  sourcemap: true,
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-web-annotator', factory: function(require) { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: { js: 'return module.exports; } });' },
};

/** Development-page transport served by `src/vite.ts` to bridge-enabled pages. */
const bridge = {
  entryPoints: ['src/browser/bridge.ts'],
  outfile: 'lib/bridge.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
};

/** Vite plugin: development-only bridge hosting and JSX source hints. */
const vite = {
  entryPoints: ['src/vite.ts'],
  outfile: 'lib/vite.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@babel/parser', 'vite'],
  sourcemap: true,
};

await mkdir('lib', { recursive: true });
await build(host);
await build(client);
await build(bridge);
await build(vite);
// Declarations are hand-written because the build does not run a type emitter.
await writeFile(
  'lib/index.d.ts',
  "export declare const name = 'cslkkl-web-annotator';\nexport declare function apply(): void;\n",
);
await writeFile(
  'lib/vite.d.ts',
  "import type { Plugin } from 'vite';\nexport interface WebAnnotatorOptions { allowedParentOrigins?: string[]; sourceAnnotations?: boolean }\nexport declare function webAnnotator(options?: WebAnnotatorOptions): Plugin;\n/** @deprecated Use WebAnnotatorOptions. */\nexport type LayoutCareOptions = WebAnnotatorOptions;\n/** @deprecated Use webAnnotator. */\nexport declare const layoutCare: typeof webAnnotator;\nexport default webAnnotator;\n",
);
