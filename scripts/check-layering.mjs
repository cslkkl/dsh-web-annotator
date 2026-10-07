/**
 * Layering gate: keep the declared dependency directions out of "silently wrong" territory.
 *
 * Why this exists: `docs/architecture.md` and the per-directory `AGENTS.md` describe which
 * half may depend on which, but nothing enforced it. A violation here does not fail a build
 * or a test — it fails in the visited page, in the Electron guest, or in the host process.
 *
 * Exit codes: 0 = every rule passed, 1 = a violation or a broken premise.
 * Depends only on `node:fs` / `node:path` so it runs after a frozen install with no toolchain.
 *
 * Usage: `node scripts/check-layering.mjs` (`npm run check:layering`)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/**
 * Rules. `files` receives the repository-relative POSIX path (`src/browser/prompt.ts`).
 * `violation` returns `null` when the specifier is allowed, or the reason it is not.
 */
export const RULES = [
  {
    id: 'picker-self-contained',
    title: '页面 picker 不得有任何 import（Desktop 只执行它的编译体）',
    // `annotatePage` is stringified and run inside the guest, so a module-level import
    // becomes a free identifier there. See docs/browser-integration.md.
    files: (rel) => rel === 'src/browser/page-inspector.ts',
    violation: (spec) => `picker 依赖了 ${spec}（guest 中会成为未定义标识符）`,
  },
  {
    id: 'browser-no-client',
    title: '页面半端不得依赖浏览器 Client 半端',
    files: (rel) => rel.startsWith('src/browser/'),
    violation: (spec) =>
      /(?:^|\/)client\//.test(spec) ? `页面半端引用了 Client 模块 ${spec}` : null,
  },
  {
    id: 'client-no-bridge',
    title: 'Client 半端不得依赖宿主 picker 之外的页面半端实现',
    files: (rel) => rel.startsWith('src/client/'),
    violation: (spec) =>
      /^\.\.\/browser\/(bridge|iframe-annotation|screenshot)\.ts$/.test(spec)
        ? `Client 半端引用了宿主实现 ${spec}`
        : null,
  },
  {
    id: 'client-no-node',
    title: '浏览器半端不得依赖 Node 内置模块',
    files: (rel) => rel.startsWith('src/client/') || rel.startsWith('src/browser/'),
    violation: (spec) =>
      /^node:/.test(spec) || /^(fs|path|crypto|url|os|child_process)$/.test(spec)
        ? `浏览器产物会内联宿主模块 ${spec}`
        : null,
  },
  {
    id: 'host-no-client',
    title: '宿主入口与 Vite 插件不得依赖浏览器 Client 半端',
    files: (rel) => rel === 'src/index.ts' || rel === 'src/vite.ts',
    violation: (spec) => (/(?:^|\/)client\//.test(spec) ? `宿主模块引用了 Client ${spec}` : null),
  },
];

/** Retired identifiers that must not come back through a new call site. */
const RETIRED_NAMES = ['__layout-care__', 'data-layout-care-source', '__LAYOUT_CARE_CONFIG__'];
/** The single, reviewed home for the retired storage key that older drafts still use. */
const LEGACY_NAMES_FILE = 'src/client/legacy-names.ts';

/** Recursively list `.ts` / `.tsx` under a directory. */
export function listSources(directory) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...listSources(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Replace comments with equal-length whitespace: byte offsets and newlines survive, so
 * reported line numbers stay correct and examples inside comments are not read as code.
 */
export function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, head) => head + ' '.repeat(match.length - head.length));
}

/**
 * Every module specifier in a file, with its line number.
 * Both patterns are anchored to the start of a line so string values and object keys are
 * never mistaken for a dependency.
 */
export function specifiersOf(text) {
  const found = [];
  const patterns = [
    /(?:^|\n)[ \t]*(?:import|export)\b[^'"]{0,400}?\bfrom\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)[ \t]*import\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index + match[0].search(/\S/);
      found.push({ spec: match[1], line: text.slice(0, start).split('\n').length, at: start });
    }
  }
  found.sort((a, b) => a.at - b.at);
  return found.map(({ spec, line }) => ({ spec, line }));
}

export function main() {
  // Premise assertions: "scanned nothing" must not look identical to "passed".
  if (!existsSync(SRC)) {
    console.error(`缺少源目录 ${relative(ROOT, SRC)}`);
    process.exit(1);
  }
  const files = listSources(SRC);
  if (files.length === 0) {
    console.error('src/ 下没有扫到任何 .ts/.tsx —— 检查没有真的跑起来');
    process.exit(1);
  }

  const failures = [];
  const covered = new Set();
  for (const full of files) {
    const rel = relative(ROOT, full).split('\\').join('/');
    const text = stripComments(readFileSync(full, 'utf8'));
    for (const rule of RULES) {
      if (!rule.files(rel)) continue;
      covered.add(rule.id);
      for (const { spec, line } of specifiersOf(text)) {
        const reason = rule.violation(spec);
        if (reason !== null) failures.push({ rule: rule.id, rel, line, reason });
      }
    }
    if (rel !== LEGACY_NAMES_FILE) {
      text.split('\n').forEach((line, index) => {
        for (const retired of RETIRED_NAMES)
          if (line.includes(retired))
            failures.push({
              rule: 'no-retired-names',
              rel,
              line: index + 1,
              reason: `重新引入了已退休的名字 ${retired}`,
            });
      });
    }
  }

  // A rule whose file selector matches nothing is worse than no rule: it reads as enforced.
  for (const rule of RULES)
    if (!covered.has(rule.id))
      failures.push({
        rule: 'rule-not-wired',
        rel: 'scripts/check-layering.mjs',
        line: 1,
        reason: `${rule.id} 没有匹配任何文件，规则实际未生效`,
      });

  const titles = new Map(RULES.map((rule) => [rule.id, rule.title]));
  titles.set('no-retired-names', '不得重新引入已退休的运行时名字');
  titles.set('rule-not-wired', '每条规则都必须真的扫到文件');

  if (failures.length === 0) {
    console.log(`分层检查通过：${String(files.length)} 个源文件，${String(titles.size)} 条规则`);
    return;
  }
  for (const failure of failures)
    console.error(
      `FAIL [${failure.rule}] ${failure.rel}:${String(failure.line)} —— ${failure.reason}`,
    );
  console.error('\n违反规则：');
  for (const id of new Set(failures.map((failure) => failure.rule)))
    console.error(`  - ${id}：${titles.get(id) ?? ''}`);
  console.error(`\n共 ${String(failures.length)} 处；规则与理由见 docs/architecture.md`);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
