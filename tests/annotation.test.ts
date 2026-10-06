import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { BrowserAnnotation } from '../src/browser/page-inspector';
import { isAnnotationOptions, isAnnotationResult } from '../src/browser/protocol';
import {
  annotationPrompt,
  annotationImagePrompt,
  readAnnotationPrompt,
} from '../src/browser/prompt';
import { createAnnotationStore, readAnnotations } from '../src/client/annotation-store';

const annotation: BrowserAnnotation = {
  intent: 'question',
  note: '这里为什么有空白？',
  url: 'http://localhost:5173/products?view=compact#top',
  title: '示例页面',
  viewport: { width: 800, height: 600 },
  selection: {
    kind: 'region',
    rect: { x: 24, y: 324, width: 230, height: 100 },
    viewportRect: { x: 24, y: 24, width: 230, height: 100 },
    scroll: { x: 0, y: 300 },
    candidates: [],
  },
};

test('page wire rejects malformed geometry, intents, locators, origins and oversized evidence', () => {
  assert.equal(isAnnotationResult(annotation), true);
  assert.equal(isAnnotationResult({ cancelled: true }), true);
  for (const invalid of [
    null,
    { cancelled: true, note: 'extra' },
    { ...annotation, intent: 'fix' },
    { ...annotation, note: '' },
    { ...annotation, url: 'javascript:alert(1)' },
    { ...annotation, note: 'x'.repeat(1001) },
    {
      ...annotation,
      selection: { ...annotation.selection, rect: { x: NaN, y: 0, width: 1, height: 1 } },
    },
    { ...annotation, selection: { ...annotation.selection, kind: 'element', candidates: [] } },
    { ...annotation, selection: { ...annotation.selection, candidates: Array(13).fill({}) } },
  ])
    assert.equal(isAnnotationResult(invalid), false);
  assert.equal(isAnnotationOptions({ intent: 'question', dark: false, copy: {} }), false);
});

test('session-scoped queues retain exact rectangles, isolate complete URLs, and remove only submitted IDs', () => {
  const store = createAnnotationStore().create('annotation-test');
  store.actions.add(annotation.url, { id: 'one', annotation });
  const another = { ...annotation, note: '稍后提交的评论', intent: 'comment' as const };
  store.actions.add(annotation.url, { id: 'two', annotation: another });
  assert.deepEqual(
    store.getSnapshot().byUrl[annotation.url][0].annotation.selection.rect,
    annotation.selection.rect,
  );
  assert.equal(store.getSnapshot().byUrl['http://localhost:5173/products'], undefined);
  store.actions.sent(annotation.url, ['one']);
  assert.equal(store.getSnapshot().byUrl[annotation.url][0].id, 'two');
  assert.equal(
    readAnnotations([{ id: 'poison', annotation: { ...annotation, note: '' } }]).length,
    0,
  );
  store.actions.remove(annotation.url, 'two');
  assert.equal(store.getSnapshot().byUrl[annotation.url].length, 0);
});

test('annotation request snapshot preserves question intent, document rectangle and quoted page evidence', () => {
  const request = annotationPrompt([annotation]);
  assert.equal(
    request + '\n',
    readFileSync(new URL('./snapshots/annotation-request.zh.txt', import.meta.url), 'utf8'),
  );
  assert.throws(
    () => annotationPrompt([annotation, { ...annotation, url: 'http://localhost:5173/other' }]),
    /annotation-limit/,
  );
  assert.throws(() => annotationPrompt([]), /annotation-limit/);
});

test('collapsed presentation recognizes exact saved requests and leaves unrelated or malformed messages visible', () => {
  assert.deepEqual(readAnnotationPrompt(annotationPrompt([annotation])), [annotation]);
  assert.deepEqual(readAnnotationPrompt(annotationPrompt([annotation], true)), [annotation]);
  assert.equal(readAnnotationPrompt('普通用户消息'), null);
  assert.equal(readAnnotationPrompt(annotationPrompt([annotation]) + '\n其他要求'), null);
  assert.equal(
    readAnnotationPrompt(annotationPrompt([annotation]).replace('1. 提问', '2. 提问')),
    null,
  );
  const forged = annotationPrompt([annotation]).replace('"width": 230', '"width": -1');
  assert.equal(readAnnotationPrompt(forged), null);
  const quoted = {
    ...annotation,
    note: '请问 "这个"？\n另起一行',
    title: '1. 提问\n用户输入："隐藏"',
  };
  assert.deepEqual(readAnnotationPrompt(annotationPrompt([quoted])), [quoted]);
});

test('image-only text omits DOM JSON; detailed requests preserve changes and never embed base64', () => {
  const picture = {
    ...annotation,
    screenshot: { mediaType: 'image/jpeg' as const, data: 'AA==', width: 800, height: 600 },
  };
  assert.equal(isAnnotationResult(picture), true);
  assert.throws(() => annotationImagePrompt([annotation]), /annotation-image-unavailable/);
  const imageText = annotationImagePrompt([picture]);
  assert.match(imageText, /这里为什么有空白/);
  assert.match(imageText, /第 1 张截图/);
  assert.doesNotMatch(imageText, /selection|viewport|candidates|AA==/);
  assert.doesNotMatch(annotationPrompt([picture], true), /AA==|screenshot/);
  const changes = { ...picture, styleChanges: { color: { before: 'rgb(0, 0, 0)', after: 'red' } } };
  assert.match(annotationImagePrompt([changes]), /color: rgb\(0, 0, 0\) → red/);
  assert.deepEqual(readAnnotationPrompt(annotationPrompt([changes])), [
    { ...annotation, styleChanges: changes.styleChanges },
  ]);
  assert.equal(
    isAnnotationResult({ ...picture, screenshot: { ...picture.screenshot, width: 1601 } }),
    false,
  );
  assert.equal(
    isAnnotationResult({ ...changes, styleChanges: { script: { before: '', after: 'evil' } } }),
    false,
  );
});

test('mixed screenshot requests preserve every note and map attachments without shifting their targets', () => {
  const notes = [
    annotation,
    { ...annotation, note: '有图的第二条' },
    { ...annotation, note: '有图的第三条' },
  ];
  const request = annotationPrompt(notes, true, [false, true, true]);
  assert.match(request, /"screenshotIndex": 1/);
  assert.match(request, /"screenshotIndex": 2/);
  assert.deepEqual(readAnnotationPrompt(request), notes);
  assert.equal(
    readAnnotationPrompt(request.replace('"screenshotIndex": 2', '"screenshotIndex": 3')),
    null,
  );
});
