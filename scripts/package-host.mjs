/** Stage the exact-version providers inside the single installable package. */
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { HOST_BASE_COMMIT } from './shared-modules.mjs';

const output = resolve('lib/host');
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const targets = ['browser', 'chat', 'layout'];
await mkdir(output, { recursive: true });
const runtimeHashes = {};
for (const target of targets) {
  const directory = `${target}-provider`;
  const source = resolve('integration', directory);
  const destination = join(output, directory);
  const provider = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  assert.equal(provider.version, '0.2.0-rc.2');
  assert.equal(
    provider.name,
    `@deepseek-ai/dsh-client-ui-${target === 'browser' ? 'sidebar-browser' : target}`,
  );
  // The runtime is already bundled. Do not ship workspace dependencies or
  // declarations/exports that this narrow build does not generate.
  const metadata = {
    name: provider.name,
    version: provider.version,
    description: `DSH Web Annotator's patched ${target} provider; derived from DeepSeek Harness`,
    type: 'module',
    license: 'MIT',
    main: './lib/index.js',
    exports: {
      '.': './lib/index.js',
      './client': './lib/client.js',
      './package.json': './package.json',
    },
    dsh: provider.dsh,
  };
  await mkdir(join(destination, 'lib'), { recursive: true });
  await writeFile(join(destination, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
  for (const file of await readdir(join(source, 'lib'))) {
    await cp(join(source, 'lib', file), join(destination, 'lib', file));
    runtimeHashes[`${directory}/lib/${file}`] = createHash('sha256')
      .update(await readFile(join(destination, 'lib', file)))
      .digest('hex');
  }
  for (const required of ['index.js', 'client.js', 'client.css']) {
    assert.ok(
      runtimeHashes[`${directory}/lib/${required}`],
      `Missing provider artifact: ${required}`,
    );
  }
  await cp(join(source, 'README.md'), join(destination, 'README.md'));
  await cp('licenses/deepseek-harness-MIT.txt', join(destination, 'LICENSE'));
}
await cp('THIRD_PARTY_NOTICES.md', join(output, 'THIRD_PARTY_NOTICES.md'));
await writeFile(
  join(output, 'bundle.json'),
  JSON.stringify(
    {
      packageName: manifest.name,
      packageVersion: manifest.version,
      targetHarness: '0.2.0-rc.2',
      upstreamCommit: HOST_BASE_COMMIT,
      patchSha256: createHash('sha256')
        .update(await readFile('docs/harness-browser-annotation.patch'))
        .digest('hex'),
      runtimeHashes,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Single-package host providers ready: ${output}`);
