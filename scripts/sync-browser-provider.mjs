/** Update the three shared picker modules in the local, reviewable host patch. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const destination = resolve(
  '../harness-browser-integration/packages/client/ui-sidebar-browser/src/client/annotation',
);
await mkdir(destination, { recursive: true });
for (const file of ['page-inspector.ts', 'protocol.ts', 'iframe-annotation.ts', 'screenshot.ts']) {
  const source = await readFile(join('src/browser', file), 'utf8');
  await writeFile(
    join(destination, file),
    source
      .replaceAll("'./page-inspector'", "'./page-inspector.ts'")
      .replaceAll("'./protocol'", "'./protocol.ts'"),
  );
}
console.log('Shared Browser picker modules synchronized.');
