/**
 * Documentation gate: catch knowledge that only exists in prose.
 *
 * Two failure modes this closes, both of which produce zero signal in code:
 * 1. a relative Markdown link to a file that was renamed, moved or deleted;
 * 2. an `npm run <x>` instruction for a script that no longer exists in `package.json`.
 *
 * Generated trees (`lib/`, `integration/`, `.host-source/`) are not documentation inputs,
 * so their contents are not scanned, though links into them from a document are checked.
 *
 * Exit codes: 0 = every link and script name resolves, 1 = a broken reference.
 *
 * Usage: `node scripts/check-doc-paths.mjs` (`npm run check:doc-paths`)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'lib', 'integration', '.host-source']);

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
/** `npm run x` / `npm run x --flag` anywhere in prose or YAML. */
const NPM_SCRIPT = /npm run ([a-zA-Z][\w:-]*)/g;

export function listDocuments(directory) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      out.push(...listDocuments(join(directory, entry.name)));
    } else if (entry.name.endsWith('.md')) out.push(join(directory, entry.name));
  }
  return out;
}

export function listWorkflows(directory) {
  const root = join(directory, '.github', 'workflows');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => join(root, name));
}

/** A link target is checkable when it points inside this repository. */
export function localTarget(target) {
  if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) return undefined;
  const path = target.split('#')[0].split('?')[0];
  return path || undefined;
}

/** Every broken reference in a tree. Pure so the gate's own behaviour is testable.
 * @param root - repository root to scan.
 * @param scripts - names that `npm run` may reference.
 * @returns repository-relative path, line and reason for each failure.
 */
export function brokenReferences(root, scripts) {
  const documents = listDocuments(root);
  const files = [...documents, ...listWorkflows(root)];
  const failures = [];
  for (const file of files) {
    const rel = relative(root, file).split('\\').join('/');
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const lineNumber = index + 1;
        for (const match of line.matchAll(MARKDOWN_LINK)) {
          const target = localTarget(match[1]);
          if (target === undefined) continue;
          if (!existsSync(resolve(dirname(file), decodeURIComponent(target))))
            failures.push({ rel, line: lineNumber, reason: `链接目标不存在：${match[1]}` });
        }
        for (const match of line.matchAll(NPM_SCRIPT)) {
          if (!scripts.has(match[1]))
            failures.push({
              rel,
              line: lineNumber,
              reason: `npm script 不存在：npm run ${match[1]}`,
            });
        }
      });
  }
  return { failures, scanned: files.length, documents: documents.length };
}

/**
 * GitHub resolves the repository's homepage README as
 * `.github/README.md` → `README.md` → `docs/README.md`.
 *
 * So a maintainer-facing `.github/README.md` silently replaces the user-facing
 * facade on the repository page: nothing in the build, the tests or the docs
 * gate notices, and the only visible symptom is that visitors read the wrong
 * document. The reference repository hit exactly this and deleted its copy.
 *
 * @param root - repository root.
 * @returns failures for a missing facade or a shadowing `.github/README.md`.
 */
export function homepageFailures(root) {
  const failures = [];
  if (!existsSync(join(root, 'README.md')))
    failures.push({ rel: 'README.md', line: 1, reason: '缺少根 README —— 仓库首页没有门面' });
  if (existsSync(join(root, '.github', 'README.md')))
    failures.push({
      rel: '.github/README.md',
      line: 1,
      reason: '它会顶掉仓库首页的根 README（GitHub 解析顺序：.github/ → 根 → docs/）',
    });
  return failures;
}

export function main() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const scripts = new Set(Object.keys(manifest.scripts ?? {}));
  const { failures, scanned, documents } = brokenReferences(ROOT, scripts);
  failures.push(...homepageFailures(ROOT));
  // "Scanned nothing" must not look identical to "passed".
  if (documents === 0) {
    console.error('没有扫到任何 .md 文档 —— 检查没有真的跑起来');
    process.exit(1);
  }
  if (failures.length === 0) {
    console.log(
      `文档检查通过：${String(scanned)} 份文件，${String(scripts.size)} 个 npm script，首页 README 未被顶掉`,
    );
    return;
  }
  for (const failure of failures)
    console.error(`FAIL ${failure.rel}:${String(failure.line)} —— ${failure.reason}`);
  console.error(`\n共 ${String(failures.length)} 处；文档与代码必须同时改。`);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
