import assert from 'node:assert/strict';
import test from 'node:test';
import { en, zh } from '../src/client/annotation-copy';
import {
  PICKER_COPY_KEYS,
  annotationErrorKey,
  effectiveDelivery,
  pickerOptions,
} from '../src/client/annotation-view';
import { isAnnotationOptions } from '../src/browser/protocol';

/** Translate from the real Chinese table, so a missing key fails here rather than in the page. */
const translate = (key: keyof typeof zh): string => zh[key];

test('an unrecognized failure is reported as failure, never as success', () => {
  assert.equal(annotationErrorKey(new Error('annotation-unavailable')), 'unavailable');
  assert.equal(annotationErrorKey(new Error('annotation-timeout')), 'timeout');
  assert.equal(annotationErrorKey(new Error('annotation-page-changed')), 'pageChanged');
  assert.equal(annotationErrorKey(new Error('annotation-limit')), 'limit');
  // Anything else — a protocol error, a session that went away, a thrown string —
  // must land on the generic failure copy. Silence here is what hides a real error.
  assert.equal(annotationErrorKey(new Error('annotation-image-unavailable')), 'failed');
  assert.equal(annotationErrorKey(new Error('')), 'failed');
  assert.equal(
    annotationErrorKey('annotation-timeout'),
    'failed',
    'a bare string is not an error code',
  );
  assert.equal(annotationErrorKey(undefined), 'failed');
  assert.equal(annotationErrorKey(null), 'failed');
  assert.equal(annotationErrorKey({ message: 'annotation-timeout' }), 'failed');
});

test('the picker copy list is complete in both locale tables and in the wire validator', () => {
  // The module comment promises this test; the same 25 fields must exist in three places:
  // the options type, both locale tables, and the bridge validator in `protocol.ts`.
  for (const key of PICKER_COPY_KEYS) {
    assert.equal(typeof zh[key], 'string', `zh 缺少 picker 字段 ${key}`);
    assert.equal(typeof en[key], 'string', `en 缺少 picker 字段 ${key}`);
  }
  assert.equal(new Set(PICKER_COPY_KEYS).size, PICKER_COPY_KEYS.length, '字段列表有重复');

  // The wire validator carries its own copy of the list; both directions are pinned here
  // without touching that synchronized module.
  const complete = pickerOptions(translate, false);
  assert.equal(isAnnotationOptions(complete), true, '组装出的选项必须能通过跨进程校验');
  for (const key of PICKER_COPY_KEYS) {
    const { [key]: _dropped, ...rest } = complete.copy;
    assert.equal(
      isAnnotationOptions({ ...complete, copy: rest }),
      false,
      `删掉 ${key} 后校验仍然通过 —— protocol.ts 的字段表比 PICKER_COPY_KEYS 短`,
    );
  }
});

test('the picker options carry the caller-supplied theme and default to asking', () => {
  assert.deepEqual(pickerOptions(translate, false), {
    intent: 'question',
    dark: false,
    copy: Object.fromEntries(PICKER_COPY_KEYS.map((key) => [key, zh[key]])),
  });
  // Only the component can read the host theme, so it must arrive as data.
  assert.equal(pickerOptions(translate, true).dark, true);
});

test('delivery falls back to location details whenever images cannot satisfy it', () => {
  const cases: [Parameters<typeof effectiveDelivery>, string][] = [
    [['details', 0, 0], 'details'],
    [['details', 3, 3], 'details'],
    [['image', 0, 3], 'details'],
    [['image', 2, 3], 'details'],
    [['image', 3, 3], 'image'],
    [['both', 0, 3], 'details'],
    [['both', 1, 3], 'both'],
    [['both', 3, 3], 'both'],
    // A selection that vanished from the queue must not send a screenshot request.
    [['image', 0, 0], 'details'],
    [['both', 0, 0], 'details'],
  ];
  for (const [args, expected] of cases)
    assert.equal(
      effectiveDelivery(...args),
      expected,
      `effectiveDelivery(${args.join(', ')}) 应为 ${expected}`,
    );
});
