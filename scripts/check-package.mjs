/** Fail packing an incomplete or stale installable bundle. No build at install time. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
let bundle;
try {
  bundle = JSON.parse(await readFile('lib/host/bundle.json', 'utf8'));
} catch {
  throw new Error(
    'Missing host providers. Follow docs/browser-integration.md and run npm run build:host.',
  );
}
assert.equal(bundle.packageName, manifest.name);
assert.equal(bundle.packageVersion, manifest.version);
assert.equal(bundle.targetHarness, manifest.engines.dsh);
assert.equal(
  bundle.patchSha256,
  createHash('sha256')
    .update(await readFile('docs/harness-browser-annotation.patch'))
    .digest('hex'),
  'Host patch changed; rebuild providers before packing.',
);
for (const [path, expected] of Object.entries(bundle.runtimeHashes)) {
  assert.equal(
    createHash('sha256')
      .update(await readFile(`lib/host/${path}`))
      .digest('hex'),
    expected,
    `Staged provider changed: ${path}`,
  );
}
for (const file of [
  'lib/index.js',
  'lib/client.js',
  'lib/bridge.js',
  'lib/vite.js',
  'lib/THIRD_PARTY_LICENSES.md',
])
  await readFile(file);
console.log('Complete prebuilt bundle verified; consumers need no build scripts.');
