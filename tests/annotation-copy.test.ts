import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { en, zh } from '../src/client/annotation-copy';

const root = resolve(import.meta.dirname, '..');
/** The table itself is the only file allowed to name a key without using it. */
const TABLE = join(root, 'src', 'client', 'annotation-copy.ts');

/** Production sources that could reference a copy key, minus the table itself. */
function translatableSources(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) out.push(...translatableSources(full));
    else if (/\.(ts|tsx|mjs)$/.test(entry) && full !== TABLE) out.push(full);
  }
  return out;
}

/** Only production code counts: a key reached solely from a test is still dead in the page. */
const sources = translatableSources(join(root, 'src'));

test('the dead-key scan reads the real tree and the real table, so it cannot pass vacuously', () => {
  assert.ok(sources.length > 5, `只扫到 ${sources.length} 个源文件 —— 扫描范围错了`);
  assert.ok(!sources.includes(TABLE), '文案表本身进了扫描集 —— 那样每个键都会"被引用"');
  const keys = Object.keys(zh);
  assert.ok(keys.length > 40, `只读到 ${keys.length} 个文案键 —— 解析错了`);
  assert.deepEqual(keys, Object.keys(en), '两张表的键必须一一对应');
});

test('every declared copy key is referenced by production code, so no dead key ships', () => {
  // A dead key is invisible: nothing renders it, but the next person reading the table
  // believes the interface shows that string somewhere. Removing three such leftovers
  // (`draft` / `inserted` / `addMore`, from the retired "add to composer" flow) is what
  // this pins. The rule and this judgement come from the reference repository.
  const body = sources.map((file) => readFileSync(file, 'utf8')).join('\n');
  const quoted = (key: string) =>
    body.includes(`'${key}'`) || body.includes(`"${key}"`) || body.includes(`\`${key}\``);
  const dead = Object.keys(zh).filter((key) => !quoted(key));
  assert.deepEqual(
    dead,
    [],
    `没有任何生产代码引用的文案键：${dead.join(', ')} —— 要么删掉，要么接上`,
  );
});
