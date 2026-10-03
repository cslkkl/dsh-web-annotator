import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
await mkdir('lib', { recursive: true });
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
});
await writeFile(
  'lib/index.d.ts',
  "export declare const name = 'cslkkl-web-annotator';\nexport declare function apply(): void;\n",
);
await build({
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
  jsx: 'transform',
  sourcemap: true,
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-web-annotator', factory: function(require) { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: { js: 'return module.exports; } });' },
});
if (existsSync('src/bridge/index.ts'))
  await build({
    entryPoints: ['src/bridge/index.ts'],
    outfile: 'lib/bridge.js',
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
  });
if (existsSync('src/vite.ts')) {
  await build({
    entryPoints: ['src/vite.ts'],
    outfile: 'lib/vite.js',
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    external: ['@babel/parser', 'vite'],
    sourcemap: true,
  });
  await writeFile(
    'lib/vite.d.ts',
    "import type { Plugin } from 'vite';\nexport interface WebAnnotatorOptions { allowedParentOrigins?: string[]; sourceAnnotations?: boolean }\nexport declare function webAnnotator(options?: WebAnnotatorOptions): Plugin;\n/** @deprecated Use WebAnnotatorOptions. */\nexport type LayoutCareOptions = WebAnnotatorOptions;\n/** @deprecated Use webAnnotator. */\nexport declare const layoutCare: typeof webAnnotator;\nexport default webAnnotator;\n",
  );
}
