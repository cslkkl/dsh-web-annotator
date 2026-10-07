/** Check the exported patch against original files from the exact Git base.
 * `DSH_HOST_CHECKOUT` selects the Harness checkout, exactly as the provider builds do.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { HOST_BASE_COMMIT, hostCheckout } from './shared-modules.mjs';

const checkout = hostCheckout(resolve);
const patch = resolve('docs/harness-browser-annotation.patch');
const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
assert.equal(base, HOST_BASE_COMMIT, 'The reviewed patch base changed; re-review before building.');
const tracked = new Set(
  execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
    cwd: checkout,
    encoding: 'utf8',
  }).split('\n'),
);
const content = await readFile(patch, 'utf8');
const files = [...content.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].map((match) => match[2]);
await mkdir('integration', { recursive: true });
const temporary = await mkdtemp(resolve('integration/patch-check-'));
try {
  // Without an isolated Git root, apply from this subdirectory silently skips
  // patch paths as outside the parent plugin repository's current prefix.
  execFileSync('git', ['init', '--quiet', temporary]);
  for (const file of files) {
    if (!tracked.has(file)) continue;
    const target = join(temporary, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, execFileSync('git', ['show', `HEAD:${file}`], { cwd: checkout }));
  }
  execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', '--check', patch], {
    cwd: temporary,
    stdio: 'inherit',
  });
  execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', patch], {
    cwd: temporary,
    stdio: 'inherit',
  });
  for (const file of files)
    assert.deepEqual(
      await readFile(join(temporary, file)),
      await readFile(join(checkout, file)),
      file,
    );
} finally {
  // The probe is a scratch tree; leaving it behind makes the next run's diff unreadable.
  await rm(temporary, { recursive: true, force: true });
}
await writeFile(
  'integration/patch-verification.json',
  JSON.stringify({ base, files, appliesToBase: true, matchesReviewedSource: true }, null, 2) + '\n',
);
console.log(
  `Patch applies to its exact base and reproduces ${String(files.length)} reviewed files.`,
);
