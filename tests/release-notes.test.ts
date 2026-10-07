import assert from 'node:assert/strict';
import test from 'node:test';
import { changelogSection, releaseNotes } from '../scripts/release-assets.mjs';

const changelog = [
  '# Changelog',
  '',
  '## 0.2.0-alpha.10 — 聊天内批注呈现',
  '',
  '- 聊天里把批注收成计数胶囊。',
  '- 附件截图重画序号徽标。',
  '',
  '## 0.2.0-alpha.9 — 清理 0.1 遗留层',
  '',
  '- 删掉旧布局扫描层。',
  '',
].join('\n');

test('a changelog section stops at the next version and keeps its own bullets', () => {
  const section = changelogSection(changelog, '0.2.0-alpha.10');
  assert.match(section ?? '', /计数胶囊/);
  assert.match(section ?? '', /序号徽标/);
  assert.doesNotMatch(section ?? '', /旧布局扫描层/, '下一版的内容不能混进来');
  assert.doesNotMatch(section ?? '', /^## /m, '标题不属于正文');
  // The last section has no following heading to stop at.
  assert.equal(changelogSection(changelog, '0.2.0-alpha.9'), '- 删掉旧布局扫描层。');
});

test('a version prefix never claims a longer version, and absence is reported', () => {
  // `0.2.0-alpha.1` is a prefix of `0.2.0-alpha.10`; matching it would publish the
  // wrong release body, which reads as success.
  assert.equal(changelogSection(changelog, '0.2.0-alpha.1'), undefined);
  assert.equal(changelogSection(changelog, '0.2.0-alpha.11'), undefined);
  assert.equal(
    changelogSection('## 0.2.0-alpha.10\n\n', '0.2.0-alpha.10'),
    undefined,
    '空正文要报缺失，不能当成一节空正文发出去',
  );
});

test('release notes carry the section, the hash and the tag they were built from', () => {
  const notes = releaseNotes({
    section: '## 正文\n\n- 一条改动',
    version: '0.2.0-alpha.10',
    tag: 'v0.2.0-alpha.10',
    commit: 'abc1234',
    tarball: 'dsh-web-annotator-0.2.0-alpha.10.tgz',
    sourceArchive: 'dsh-web-annotator-source-0.2.0-alpha.10.zip',
    sha256: 'f'.repeat(64),
    acceptance: { checks: 26, errors: 0 },
  });
  assert.match(notes, /一条改动/);
  assert.match(notes, /0\.2\.0-alpha\.10\.tgz/);
  assert.match(notes, /f{64}/);
  assert.match(notes, /v0\.2\.0-alpha\.10/);
  assert.match(notes, /abc1234/);
  assert.match(notes, /26 项 Browser 检查通过/);
  // Without an acceptance run the notes must not invent a number.
  const bare = releaseNotes({
    section: '- 一条改动',
    version: '0.2.0-alpha.10',
    tag: 'v0.2.0-alpha.10',
    commit: 'abc1234',
    tarball: 't.tgz',
    sourceArchive: 's.zip',
    sha256: 'a'.repeat(64),
  });
  assert.doesNotMatch(bare, /项 Browser 检查通过/);
});
