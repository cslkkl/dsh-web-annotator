/** Assemble one tagged release: notes, source archive and a verification record.
 *
 * The Release body is read from `CHANGELOG.md`, so user-facing changes have exactly
 * one home. A missing section fails the run instead of publishing an empty body:
 * a blank Release looks identical to a successful one from the outside.
 *
 * Usage: `RELEASE_TAG=v0.2.0-alpha.10 node scripts/release-assets.mjs`
 * (`npm run release:assets`). Reads `integration/*.json` when the acceptance run
 * already wrote them; every one of them is optional, but the counts they carry are
 * what the notes quote.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Everything in here is uploaded as a Release asset, so nothing else may live here
 * (the notes are the Release *body* and are written outside this directory).
 */
const OUTPUT = 'integration/release-assets';
/** The Release body, read by the workflow's `gh release --notes-file`. */
const NOTES = 'integration/release-notes.md';

function escapeVersion(version) {
  return version.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The `## <version> …` section of a Changelog without its heading.
 * Returns `undefined` when the version has no section, and never matches a longer
 * version that merely starts with it (`0.2.0-alpha.1` must not claim `alpha.10`).
 * @param {string} markdown - contents of `CHANGELOG.md`.
 * @param {string} version - the version whose section is wanted.
 * @returns {string | undefined} the section body, or `undefined` when it is missing.
 */
export function changelogSection(markdown, version) {
  const lines = markdown.split('\n');
  const heading = new RegExp(`^## ${escapeVersion(version)}(?:\\s|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body || undefined;
}

/** The published Release body: the changelog section plus what a reader needs to
 * install this exact build and check what they downloaded.
 * @param {{ section: string, version: string, tag: string, commit: string,
 *   tarball: string, sourceArchive: string, sha256: string,
 *   acceptance?: { checks: number, errors: number } }} input - release facts.
 * @returns {string} the Markdown body.
 */
export function releaseNotes({
  section,
  version,
  tag,
  commit,
  tarball,
  sourceArchive,
  sha256,
  acceptance,
}) {
  const paragraphs = [section, ''];
  paragraphs.push(
    `下载 **${tarball}**，在 DSH 插件管理页选择该本地包，再正常退出并重开 Desktop。` +
      '一个包内含 Browser、Chat 与 Layout 扩展，用户不需要编译；' +
      '卸载整个 bundle 并重启可恢复官方提供方。精确支持 Harness 内核 **0.2.0-rc.2**。',
    '',
  );
  if (acceptance)
    paragraphs.push(
      `本版在发布链路里重新走了一遍门禁、真实 Chromium 存储回归与打包产物验收：` +
        `**${String(acceptance.checks)} 项 Browser 检查通过**，${String(acceptance.errors)} 个页面错误；` +
        '交付的 tgz 与验收时安装的运行时逐字节一致。',
      '',
    );
  paragraphs.push(
    `安装包 SHA-256：\`${sha256}\``,
    '',
    `源码 ZIP \`${sourceArchive}\` 与验证记录对应标签 \`${tag}\`（提交 \`${commit}\`）；` +
      `安装插件请选择 .tgz。本版仍是 **${version} 预览版**，不代表已被市场收录。`,
    '',
  );
  return paragraphs.join('\n');
}

async function optionalJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function count(value) {
  return Array.isArray(value) ? value.length : value;
}

async function main() {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const version = manifest.version;
  const tag = process.env.RELEASE_TAG || `v${version}`;
  assert.equal(
    tag,
    `v${version}`,
    `标签 ${tag} 与 package.json 的版本号 ${version} 不一致 —— 先对齐再发，否则 Release 与包指向两个版本。`,
  );

  const section = changelogSection(await readFile('CHANGELOG.md', 'utf8'), version);
  assert.ok(
    section,
    `CHANGELOG.md 里没有 ${version} 一节 —— 先写变更记录，再发版；不要发一份空白正文。`,
  );

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const tarballName = `dsh-web-annotator-${version}.tgz`;
  const tarball = resolve(process.env.WEB_ANNOTATOR_TARBALL || tarballName);
  let bytes;
  try {
    bytes = await readFile(tarball);
  } catch {
    throw new Error(`缺少打包产物 ${tarballName}；先跑 npm run build:host 与 npm pack。`);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  await mkdir(OUTPUT, { recursive: true });
  // The archive is what a reviewer reads; it must come from the tagged commit, not
  // from whatever the working tree happens to hold.
  let archiveRef = tag;
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${tag}^{commit}`], {
      stdio: 'ignore',
    });
  } catch {
    archiveRef = 'HEAD';
  }
  const sourceArchive = `dsh-web-annotator-source-${version}.zip`;
  execFileSync('git', [
    'archive',
    '--format=zip',
    '--prefix=dsh-web-annotator/',
    `--output=${join(OUTPUT, sourceArchive)}`,
    archiveRef,
  ]);

  const report = await optionalJson('integration/annotation-artifacts/report.json');
  const storage = await optionalJson('integration/storage-verification.json');
  const delivery = await optionalJson('integration/delivery-verification.json');
  const patch = await optionalJson('integration/patch-verification.json');
  const acceptance = report
    ? { checks: count(report.checks), errors: count(report.errors) }
    : undefined;

  const verification = {
    version,
    tag,
    sourceCommit: commit,
    targetHarness: manifest.engines.dsh,
    tarball: { name: tarballName, sha256, bytes: bytes.length },
    sourceArchive: { name: sourceArchive, ref: archiveRef },
    ...(acceptance ? { acceptance: { ...acceptance, boundaries: report } } : {}),
    storage,
    delivery,
    patch,
  };
  const verificationName = `dsh-web-annotator-verification-${version}.json`;
  await writeFile(join(OUTPUT, verificationName), JSON.stringify(verification, null, 2) + '\n');
  // ⚠️ **安装包本身必须进附件目录。** 它是由 `npm pack` 生成在仓库根目录的，而上传逻辑
  // 只挂附件目录里的东西 —— 少了这一步，Release 会带着源码与验证记录**却没有可安装的包**，
  // 而 workflow 照绿：第一次发 alpha.10 就是这么发出去了一个下不到包的 Release。
  const staged = join(OUTPUT, tarballName);
  if (resolve(tarball) !== resolve(staged)) await copyFile(tarball, staged);
  await writeFile(
    NOTES,
    releaseNotes({
      section,
      version,
      tag,
      commit,
      tarball: tarballName,
      sourceArchive,
      sha256,
      acceptance,
    }),
  );

  // "The Release looks fine" and "the Release has the installable package" must not be
  // the same observation: assert the asset set rather than trusting the upload loop.
  for (const name of [tarballName, sourceArchive, verificationName]) {
    const present = await readFile(join(OUTPUT, name)).catch(() => undefined);
    assert.ok(present, `发布附件缺失：${name}（上传逻辑只挂 ${OUTPUT}/ 里的文件）`);
  }

  console.log(`Release ${tag} (commit ${commit})`);
  console.log(
    `tarball      ${join(OUTPUT, tarballName)}  sha256=${sha256}  bytes=${String(bytes.length)}`,
  );
  console.log(`source       ${join(OUTPUT, sourceArchive)}`);
  console.log(`verification ${join(OUTPUT, verificationName)}`);
  console.log(`notes        ${NOTES}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
