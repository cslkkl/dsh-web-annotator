/** Build the fullscreen frame fix from the exact rc.2 checkout. */
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const source = resolve(
  process.env.DSH_HOST_CHECKOUT || '../harness-browser-integration',
  'packages/client/ui-layout',
);
const output = resolve('integration/layout-provider');
await mkdir(join(output, 'lib'), { recursive: true });
const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
manifest.peerDependencies = { '@deepseek-ai/cordis': '~4.0.4' };
delete manifest.devDependencies;
delete manifest.scripts;
await writeFile(join(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
await cp(join(source, 'README.md'), join(output, 'README.md'));
await build({
  entryPoints: [join(source, 'src/index.ts')],
  outfile: join(output, 'lib/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  nodePaths: [resolve('node_modules')],
  sourcemap: true,
});
await build({
  entryPoints: [join(source, 'src/client/index.ts')],
  outfile: join(output, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  define: { 'process.env.DSH_CLIENT_TITLE': JSON.stringify('DeepSeek Harness') },
  nodePaths: [resolve('node_modules')],
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-store',
  ],
  loader: { '.css': 'local-css', '.png': 'dataurl' },
  sourcemap: true,
  banner: {
    js: "window.__ModuleLoader__.load({ id: '@deepseek-ai/dsh-client-ui-layout', factory: function(require) { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: { js: 'return module.exports; } });' },
});
const stylesheet = await readFile(join(output, 'lib/client.css'), 'utf8');
const bundle = await readFile(join(output, 'lib/client.js'), 'utf8');
const injection = `const cssDispose = () => { const style = document.createElement('style'); style.textContent = ${JSON.stringify(stylesheet)}; document.head.append(style); return () => style.remove(); };\n`;
await writeFile(
  join(output, 'lib/client.js'),
  bundle
    .replace('function apply(ctx) {', 'function apply(ctx) {\n  ctx.effect(cssDispose);')
    .replace('var exports = module.exports;', 'var exports = module.exports;\n' + injection),
);
console.log(`Patched Layout provider: ${output}`);
