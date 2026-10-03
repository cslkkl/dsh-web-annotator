/** Carry notices for every package represented in the built source maps. */
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';

const own = JSON.parse(await readFile('package.json', 'utf8'));
const packages = new Map();
const bases = ['lib', ...['browser', 'chat', 'layout'].map((x) => `integration/${x}-provider/lib`)];
for (const base of bases) {
  for (const mapName of (await readdir(base)).filter((x) => x.endsWith('.map'))) {
    const map = JSON.parse(await readFile(join(base, mapName), 'utf8'));
    for (const source of map.sources) {
      let directory = dirname(resolve(base, source));
      for (;;) {
        let metadata;
        try {
          metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (metadata) {
          if (metadata.name !== own.name)
            packages.set(`${metadata.name}@${metadata.version}`, { metadata, directory });
          break;
        }
        const parent = dirname(directory);
        if (parent === directory)
          throw new Error(`No owning package for bundled source: ${source}`);
        directory = parent;
      }
    }
  }
}
const sections = [];
for (const [name, { metadata, directory }] of [...packages].sort(([a], [b]) =>
  a.localeCompare(b, 'en'),
)) {
  const notices = [];
  for (const file of (await readdir(directory)).filter((x) =>
    /^(license|licence|copying|notice)(\.|$)/i.test(x),
  )) {
    if ((await stat(join(directory, file))).isFile())
      notices.push(await readFile(join(directory, file), 'utf8'));
  }
  if (
    !notices.length &&
    metadata.name.startsWith('@deepseek-ai/dsh-') &&
    metadata.license === 'MIT'
  ) {
    notices.push(await readFile('licenses/deepseek-harness-MIT.txt', 'utf8'));
  }
  if (!notices.length) throw new Error(`Missing license notice for bundled package: ${name}`);
  sections.push(`## ${name}\n\n${notices.join('\n\n').trim()}\n`);
}
await writeFile(
  'lib/THIRD_PARTY_LICENSES.md',
  `# Bundled third-party license notices\n\n${sections.join('\n')}`,
);
console.log(`Retained license notices for ${packages.size} bundled packages.`);
