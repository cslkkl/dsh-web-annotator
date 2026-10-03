/** Narrow Client typecheck against installed rc.2 declarations, without a monorepo build. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const target = process.argv.includes('--chat')
  ? 'chat'
  : process.argv.includes('--layout')
    ? 'layout'
    : 'browser';
const source = resolve(
  `../harness-browser-integration/packages/client/ui-${target === 'browser' ? 'sidebar-browser' : target}/src`,
);
const config = resolve(`integration/${target}-provider/tsconfig.check.json`);
const paths = {
  react: [resolve('node_modules/@types/react/index.d.ts')],
  'react/*': [resolve('node_modules/@types/react/*')],
  'react-dom': [resolve('node_modules/@types/react-dom/index.d.ts')],
  '@tanstack/react-virtual': [resolve('node_modules/@tanstack/react-virtual/dist/esm/index.d.ts')],
};
for (const name of await readdir('node_modules/@deepseek-ai')) {
  const directory = resolve('node_modules/@deepseek-ai', name);
  const manifest = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'));
  for (const [subpath, entry] of Object.entries(manifest.exports || {})) {
    const types = typeof entry === 'object' && entry !== null ? entry.types : undefined;
    if (typeof types === 'string')
      paths[manifest.name + (subpath === '.' ? '' : subpath.slice(1))] = [
        resolve(directory, types),
      ];
  }
}
await writeFile(
  config,
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        allowImportingTsExtensions: true,
        types: target === 'layout' ? ['client-build-environment'] : [],
        typeRoots: [
          resolve('../harness-browser-integration/scripts/types'),
          resolve('node_modules/@types'),
        ],
        paths,
      },
      include: [`${source}/**/*`],
    },
    null,
    2,
  ),
);
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', config], {
  stdio: 'inherit',
});
