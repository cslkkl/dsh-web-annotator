import assert from 'node:assert/strict';
import test from 'node:test';
import { annotatePage } from '../src/browser/page-inspector';

/** Desktop runs only the compiled body of the picker inside an approved guest, so a
 * module-level import would compile into a free identifier and throw in the page.
 * See docs/architecture.md and docs/browser-integration.md.
 */
test('the picker body is self-contained because the guest executes its source alone', () => {
  const source = annotatePage.toString();
  assert.doesNotMatch(source, /^\s*import\b/m, 'the picker must not import anything');
  assert.doesNotMatch(source, /\brequire\s*\(/);
  assert.doesNotMatch(source, /\bimport\s*\(/, 'dynamic import would also need a module system');
  // The only thing crossing into the guest is the option payload.
  const materialized = new Function(`return (${source});`)() as (options: unknown) => unknown;
  assert.equal(typeof materialized, 'function');
  assert.equal(materialized.length, 1);
});

test('the picker rejects a foreign option payload instead of throwing inside the guest', async () => {
  // The bridge validates options first; this pins that a missing global is the only failure mode.
  await assert.rejects(async () => {
    await annotatePage(undefined as never);
  });
});
