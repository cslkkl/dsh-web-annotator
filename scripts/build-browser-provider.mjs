/** Build a reviewable Browser provider from the exact rc.2 source checkout.
 * The published Harness installation is never changed by this script.
 */
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { SHARED_ANNOTATION_MODULES, hostCheckout, toHostSource } from './shared-modules.mjs';

const root = hostCheckout(resolve);
const source = join(root, 'packages/client/ui-sidebar-browser');
const output = resolve('integration/browser-provider');
await mkdir(join(output, 'lib'), { recursive: true });
for (const file of SHARED_ANNOTATION_MODULES) {
  const canonical = await readFile(join('src/browser', file), 'utf8');
  const target = toHostSource(canonical);
  const hostCopy = await readFile(join(source, 'src/client/annotation', file), 'utf8');
  if (target !== hostCopy)
    throw new Error(
      `Host annotation module differs: ${file}. Run scripts/sync-browser-provider.mjs.`,
    );
}
const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
manifest.peerDependencies = { '@deepseek-ai/cordis': '~4.0.4' };
delete manifest.devDependencies;
delete manifest.scripts;
await writeFile(join(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
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
await cp(join(source, 'README.md'), join(output, 'README.md'));
await build({
  entryPoints: [join(source, 'src/client/index.ts')],
  outfile: join(output, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  nodePaths: [resolve('node_modules')],
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-store',
  ],
  loader: { '.css': 'local-css' },
  sourcemap: true,
  banner: {
    js: "window.__ModuleLoader__.load({ id: '@deepseek-ai/dsh-client-ui-sidebar-browser', factory: function(require) { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: { js: 'return module.exports; } });' },
});
// Module CSS remains provider-owned; install it on the provider's own lifecycle.
const stylesheet = await readFile(join(output, 'lib/client.css'), 'utf8');
const bundle = await readFile(join(output, 'lib/client.js'), 'utf8');
const injection = `const cssDispose = () => { const style = document.createElement('style'); style.textContent = ${JSON.stringify(stylesheet)}; document.head.append(style); return () => style.remove(); };\n`;
await writeFile(
  join(output, 'lib/client.js'),
  bundle
    .replace('function apply(ctx) {', `function apply(ctx) {\n  ctx.effect(cssDispose);`)
    .replace('var exports = module.exports;', 'var exports = module.exports;\n' + injection),
);
console.log(`Patched Browser provider: ${output}`);
