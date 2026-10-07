/** Copy the shared picker modules into the local, reviewable host patch.
 * The four files are duplicated by design: the Browser provider must build without
 * this package, and `build-browser-provider.mjs` refuses to build when they differ.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SHARED_ANNOTATION_MODULES, hostCheckout, toHostSource } from './shared-modules.mjs';

const destination = resolve(
  hostCheckout(resolve),
  'packages/client/ui-sidebar-browser/src/client/annotation',
);
await mkdir(destination, { recursive: true });
for (const file of SHARED_ANNOTATION_MODULES) {
  const source = await readFile(join('src/browser', file), 'utf8');
  await writeFile(join(destination, file), toHostSource(source));
}
console.log(
  `Shared Browser picker modules synchronized (${String(SHARED_ANNOTATION_MODULES.length)} files).`,
);
