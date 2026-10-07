import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { RULES, listSources, specifiersOf, stripComments } from '../scripts/check-layering.mjs';
import {
  brokenReferences,
  homepageFailures,
  listDocuments,
  listWorkflows,
  localTarget,
  screenshotFailures,
} from '../scripts/check-doc-paths.mjs';

const root = resolve(import.meta.dirname, '..');
const sources = listSources(join(root, 'src')).map((file) =>
  file
    .slice(root.length + 1)
    .split('\\')
    .join('/'),
);

/** The gate's own two silent failure modes: comment stripping must not shift line numbers,
 * and specifier extraction must not read a string or an object key as a dependency.
 */
test('comment stripping preserves byte offsets and line numbers', () => {
  const source = [
    'const a = 1;',
    '// import x from "./ghost"',
    '/* import y from "./dead" */',
    'const b = 2;',
  ].join('\n');
  const stripped = stripComments(source);
  assert.equal(stripped.split('\n').length, source.split('\n').length);
  assert.equal(stripped.length, source.length);
  assert.equal(specifiersOf(stripped).length, 0, 'commented examples must not be dependencies');
  assert.equal(specifiersOf(source).length, 0, 'comments are stripped before extraction anyway');
});

test('specifier extraction ignores object keys and string values', () => {
  const source = [
    "import { readFile } from 'node:fs/promises';",
    "import './side-effect';",
    "export { x } from './re-export';",
    "const route = { import: '/v0/management/plugins/import' };",
    'const text = "import evil from \'evil\'";',
  ].join('\n');
  assert.deepEqual(
    specifiersOf(source).map((item) => item.spec),
    ['node:fs/promises', './side-effect', './re-export'],
  );
  assert.deepEqual(
    specifiersOf(source).map((item) => item.line),
    [1, 2, 3],
  );
});

test('every layering rule is wired to at least one real source file', () => {
  for (const rule of RULES) {
    assert.ok(
      sources.some((rel) => rule.files(rel)),
      `${rule.id} matches no file in src/, so the rule enforces nothing`,
    );
  }
  // The picker rule is the load-bearing one: the guest runs its compiled body alone.
  const picker = RULES.find((rule) => rule.id === 'picker-self-contained');
  assert.ok(picker);
  assert.deepEqual(
    sources.filter((rel) => picker.files(rel)),
    ['src/browser/page-inspector.ts'],
  );
});

test('layering rules reject the dependencies they exist to prevent', () => {
  const violation = (id: string, specifier: string): string | null => {
    const rule = RULES.find((candidate) => candidate.id === id);
    assert.ok(rule, `missing rule ${id}`);
    return rule.violation(specifier);
  };
  assert.match(violation('picker-self-contained', './protocol') ?? '', /未定义标识符/);
  assert.match(violation('browser-no-client', '../client/annotation-store') ?? '', /Client/);
  assert.equal(violation('browser-no-client', './protocol'), null);
  assert.match(violation('client-no-node', 'node:crypto') ?? '', /宿主模块/);
  assert.match(violation('client-no-bridge', '../browser/screenshot.ts') ?? '', /宿主实现/);
  assert.equal(violation('client-no-bridge', '../browser/prompt'), null);
  assert.match(violation('host-no-client', './client/index') ?? '', /Client/);
});

test('the doc gate reads Markdown, workflows and only in-repository link targets', () => {
  const documents = listDocuments(root).map((file) =>
    file
      .slice(root.length + 1)
      .split('\\')
      .join('/'),
  );
  assert.ok(documents.includes('README.md'));
  assert.ok(documents.includes('docs/architecture.md'));
  assert.ok(!documents.some((rel) => rel.startsWith('lib/') || rel.startsWith('node_modules/')));
  assert.ok(listWorkflows(root).length >= 1);
  assert.equal(localTarget('docs/architecture.md#native'), 'docs/architecture.md');
  assert.equal(localTarget('https://example.com/x'), undefined);
  assert.equal(localTarget('#section'), undefined);
  assert.equal(localTarget('mailto:a@b.c'), undefined);
});

test('the doc gate refuses a .github index that would displace the repository homepage', async () => {
  // This repository has no such file; the guard exists because the failure is invisible:
  // the homepage changes while every gate stays green.
  assert.deepEqual(homepageFailures(root), []);
  assert.ok(!listDocuments(root).some((file) => file.endsWith(join('.github', 'README.md'))));

  const directory = await mkdtemp(join(tmpdir(), 'web-annotator-home-'));
  try {
    await mkdir(join(directory, '.github'), { recursive: true });
    // A missing facade is a failure too: a bare docs tree has no user-facing entry.
    assert.deepEqual(
      homepageFailures(directory).map((failure) => failure.rel),
      ['README.md'],
    );
    await writeFile(join(directory, 'README.md'), '# facade\n');
    assert.deepEqual(homepageFailures(directory), []);
    await writeFile(join(directory, '.github', 'README.md'), '# internal handbook\n');
    const [shadowing] = homepageFailures(directory);
    assert.equal(shadowing?.rel, '.github/README.md');
    assert.match(shadowing?.reason ?? '', /顶掉仓库首页/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the screenshot manifest and the shipped images agree in both directions', async () => {
  // A hand-maintained duplicate of a directory listing: a new screenshot that ships
  // undeclared is only visible in a marketplace listing, and a renamed one leaves the
  // manifest pointing at nothing. Neither breaks a build.
  assert.deepEqual(screenshotFailures(root), []);

  const directory = await mkdtemp(join(tmpdir(), 'web-annotator-shots-'));
  const images = join(directory, 'docs', 'images');
  try {
    assert.deepEqual(
      screenshotFailures(directory).map((failure) => failure.reason),
      ['缺少截图声明文件'],
      '没有清单文件时不能算通过',
    );
    await mkdir(images, { recursive: true });
    await writeFile(join(images, 'shot.png'), 'png');
    await writeFile(join(images, 'README.md'), '# not an image\n');

    // Declared but absent.
    await writeFile(join(directory, 'screenshots.json'), '["docs/images/gone.png"]\n');
    assert.match(screenshotFailures(directory)[0]?.reason ?? '', /声明了不存在的截图/);

    // Present but undeclared — the non-image file must not be demanded.
    await writeFile(join(directory, 'screenshots.json'), '[]\n');
    assert.deepEqual(
      screenshotFailures(directory).map((failure) => failure.reason),
      ['未声明的截图：docs/images/shot.png（新增截图要同批登记）'],
    );

    // A screenshot outside the one directory is a failure even when it exists.
    await writeFile(join(directory, 'elsewhere.png'), 'png');
    await writeFile(
      join(directory, 'screenshots.json'),
      '["elsewhere.png","docs/images/shot.png"]\n',
    );
    assert.match(screenshotFailures(directory)[0]?.reason ?? '', /截图只有一个家/);

    // Malformed manifests must fail rather than silently pass.
    await writeFile(join(directory, 'screenshots.json'), '{ not json\n');
    assert.match(screenshotFailures(directory)[0]?.reason ?? '', /不是合法 JSON/);
    await writeFile(join(directory, 'screenshots.json'), '["docs/images/shot.png",42]\n');
    assert.match(screenshotFailures(directory)[0]?.reason ?? '', /字符串路径数组/);

    await writeFile(join(directory, 'screenshots.json'), '["docs/images/shot.png"]\n');
    assert.deepEqual(screenshotFailures(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the doc gate fails on a renamed file and on a removed npm script', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'web-annotator-docs-'));
  try {
    await mkdir(join(directory, 'docs'), { recursive: true });
    await writeFile(join(directory, 'docs', 'present.md'), '# present\n');
    await writeFile(join(directory, 'broken.md'), '[gone](docs/missing.md)\n');
    await writeFile(
      join(directory, 'docs', 'scripts.md'),
      'Run `npm run definitely-not-a-script`.\n',
    );
    const { failures, documents } = brokenReferences(directory, new Set(['check']));
    assert.equal(documents, 3);
    assert.deepEqual(
      failures.map((failure) => [failure.rel, failure.line, failure.reason]),
      [
        ['broken.md', 1, '链接目标不存在：docs/missing.md'],
        ['docs/scripts.md', 1, 'npm script 不存在：npm run definitely-not-a-script'],
      ],
    );
    // A present target and a real script must not be reported.
    await writeFile(join(directory, 'ok.md'), '[here](docs/present.md)\n\n`npm run check`\n');
    assert.equal(brokenReferences(directory, new Set(['check'])).failures.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
