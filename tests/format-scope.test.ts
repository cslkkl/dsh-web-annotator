import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

/** This repository's own syntaxes. Reproduced here only as a sanity floor for the
 * parsers below — the real check is that the gate covers whatever the hook covers. */
const KNOWN = ['ts', 'tsx', 'mts', 'js', 'mjs', 'cjs', 'json', 'md', 'yml', 'yaml', 'css', 'html'];

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const hookFile = readFileSync(join(root, '.pre-commit-config.yaml'), 'utf8');

/** Extensions from a Prettier `--check "**\/*.{a,b,c}"` argument. Returns null when the
 * argument is not that shape, so the caller can tell "no glob" from "empty glob". */
function extensionsFromPrettierGlob(command: string | undefined): string[] | null {
  const match = /\*\*\/\*\.\{([^}]+)\}/.exec(command ?? '');
  return match?.[1] ? match[1].split(',').map((ext) => ext.trim().toLowerCase()) : null;
}

/** Extensions from a pre-commit `files:` regex alternation. Returns null when the hook
 * has no `files:` key, and an empty list when the alternation is empty. */
function extensionsFromHook(yaml: string): string[] | null {
  const block = /\n\s+files:\s*(.+)/.exec(yaml);
  if (!block) return null;
  const inner = /\\\.\(([^)]*)\)/.exec(block[1] ?? '');
  if (!inner?.[1]) return [];
  return inner[1]
    .split('|')
    .map((ext) =>
      ext
        .replace(/[\\^$]/g, '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

test('the two parsers read the real files, so the containment check below is not vacuous', () => {
  // Self-proof: a parser that silently returns [] or null would make every assertion pass.
  const gate = extensionsFromPrettierGlob(manifest.scripts['format:check']);
  const hook = extensionsFromHook(hookFile);
  assert.ok(gate && gate.length > 0, 'format:check 必须写成 "**/*.{…}" 形式，解析器读到了空值');
  assert.ok(hook && hook.length > 0, '.pre-commit-config.yaml 的 prettier 钩子必须带 files:');
  for (const ext of gate)
    assert.ok(KNOWN.includes(ext), `format:check 里出现了未登记的扩展名 ${ext}`);
  for (const ext of hook) assert.ok(KNOWN.includes(ext), `钩子里出现了未登记的扩展名 ${ext}`);
  // The parsers must actually distinguish shapes, not always succeed.
  assert.equal(extensionsFromPrettierGlob('prettier --check "src/**/*.ts"'), null);
  assert.equal(extensionsFromHook('repos:\n  - repo: local\n'), null);
});

test('the format gate covers every extension the local hook formats', () => {
  // Direction only: gate ⊇ hook. The hook is the wider one and runs on staged files,
  // so anything it formats must also be checked by the gate. The reverse is not
  // required — the gate may legitimately cover more.
  const gate = extensionsFromPrettierGlob(manifest.scripts['format:check']);
  const hook = extensionsFromHook(hookFile);
  assert.ok(gate && hook);
  const missing = hook.filter((ext) => !gate.includes(ext));
  assert.deepEqual(
    missing,
    [],
    `钩子会格式化但门禁不检查的扩展名：${missing.join(', ')} —— 这些文件的格式没有任何信号`,
  );
});

test('the format gate matches the write command it is the check for', () => {
  // `format` and `format:check` drifting apart means the fix command does not fix
  // what the check reports.
  assert.deepEqual(
    extensionsFromPrettierGlob(manifest.scripts.format),
    extensionsFromPrettierGlob(manifest.scripts['format:check']),
  );
});
