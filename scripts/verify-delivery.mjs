/** Reconcile documentation-only repacking with the packed runtime already exercised.
 * Requires the acceptance report of the packed artifact; run `npm run test:acceptance` first.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const report = JSON.parse(await readFile('integration/annotation-artifacts/report.json', 'utf8'));
const packageVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
const tarball = resolve(
  process.env.WEB_ANNOTATOR_TARBALL || `dsh-web-annotator-${packageVersion}.tgz`,
);
assert.ok(
  report.runtime && typeof report.runtime === 'string',
  'The acceptance report has no runtime directory; run npm run test:acceptance first.',
);
const installed = join(
  report.runtime,
  'home/profiles/web-annotator-replay/node_modules/dsh-web-annotator',
);
const files = execFileSync('tar', ['-tf', tarball], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter((x) => x && !x.endsWith('/'));
const changed = [];
const runtimeHashes = {};
for (const path of files) {
  const relative = path.replace(/^package\//, '');
  const delivered = execFileSync('tar', ['-xOf', tarball, path]);
  let tested;
  try {
    tested = await readFile(join(installed, relative));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!tested || !tested.equals(delivered)) changed.push(relative);
  if (relative.startsWith('lib/') || relative === 'cordis.patch.yml') {
    assert.ok(tested?.equals(delivered), `Runtime artifact changed after acceptance: ${relative}`);
    runtimeHashes[relative] = createHash('sha256').update(delivered).digest('hex');
  }
}
const manifest = JSON.parse(
  execFileSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' }),
);
const testedManifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
delete manifest.devDependencies;
delete testedManifest.devDependencies;
assert.deepEqual(
  manifest,
  testedManifest,
  'Runtime package metadata must match the accepted package',
);
const result = {
  testedTarballSha256: report.tarballSha256,
  deliveredTarballSha256: createHash('sha256')
    .update(await readFile(tarball))
    .digest('hex'),
  runtimeMatchesAcceptedPackage: true,
  changedPublishedFiles: changed,
  runtimeHashes,
  patch: JSON.parse(await readFile('integration/patch-verification.json', 'utf8')),
  acceptance: report,
};
await writeFile('integration/delivery-verification.json', JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      runtimeMatchesAcceptedPackage: true,
      changedPublishedFiles: changed,
      deliveredTarballSha256: result.deliveredTarballSha256,
    },
    null,
    2,
  ),
);
