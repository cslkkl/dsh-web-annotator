import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrowserAnnotation } from '../src/browser/page-inspector';
import {
  annotationMark,
  annotationTarget,
  badgeCaptures,
} from '../src/client/annotation-thumbnail';

const element: BrowserAnnotation = {
  intent: 'question',
  note: '这个是什么',
  url: 'https://github.com/cslkkl',
  title: 'KKLCSL',
  viewport: { width: 800, height: 600 },
  selection: {
    kind: 'element',
    rect: { x: 400, y: 600, width: 160, height: 40 },
    viewportRect: { x: 400, y: 300, width: 160, height: 40 },
    scroll: { x: 0, y: 300 },
    candidates: [
      {
        selector: 'a.follow',
        shadowHosts: [],
        matchCount: 1,
        tag: 'a',
        text: '  Follow\n  KKLCSL  ',
        rect: { x: 400, y: 600, width: 160, height: 40 },
        styles: {},
      },
    ],
  },
};

function withCandidate(text: string) {
  return {
    ...element,
    selection: {
      ...element.selection,
      candidates: [{ ...element.selection.candidates[0]!, text }],
    },
  };
}

test('chat cards label the nearest candidate with its tag and flattened text', () => {
  assert.deepEqual(annotationTarget(element), { tag: 'a', text: 'Follow KKLCSL' });
  const target = annotationTarget(withCandidate('长'.repeat(60)));
  assert.equal(target?.text.length, 32);
  assert.ok(target?.text.endsWith('…'));
  assert.equal(
    annotationTarget({ ...element, selection: { ...element.selection, candidates: [] } }),
    undefined,
  );
});

test('a badge scales with the capture, sits on the frame corner, and stays inside the image', () => {
  const mark = annotationMark(element, 1600, 1200);
  assert.deepEqual(mark?.frame, { x: 800, y: 600, width: 320, height: 80 });
  assert.deepEqual(mark?.anchor, { x: 787, y: 587 });
  const unscaled = annotationMark(element, 800, 600);
  assert.deepEqual(unscaled?.frame, { x: 400, y: 300, width: 160, height: 40 });
  assert.deepEqual(unscaled?.anchor, { x: 387, y: 287 });
  // A frame flush against the capture edge keeps the whole badge visible.
  const flush = {
    ...element,
    selection: { ...element.selection, viewportRect: { x: 0, y: 0, width: 160, height: 40 } },
  };
  assert.deepEqual(annotationMark(flush, 800, 600)?.anchor, { x: 13, y: 13 });
});

test('a point keeps its exact capture position and unusable geometry has no mark', () => {
  const point = {
    ...element,
    selection: {
      ...element.selection,
      kind: 'point' as const,
      viewportRect: { x: 200, y: 100, width: 0, height: 0 },
    },
  };
  assert.deepEqual(annotationMark(point, 800, 600)?.anchor, { x: 200, y: 100 });
  assert.equal(annotationMark(point, 0, 600), undefined);
  assert.equal(
    annotationMark({ ...element, viewport: { width: 0, height: 600 } }, 800, 600),
    undefined,
  );
  const notANumber = {
    ...point,
    selection: { ...point.selection, viewportRect: { x: NaN, y: 0, width: 0, height: 0 } },
  };
  assert.equal(annotationMark(notANumber, 800, 600), undefined);
  // An image too small for the badge keeps its centre instead of flipping the bounds.
  assert.deepEqual(annotationMark(point, 20, 20)?.anchor, { x: 10, y: 10 });
});

test('an environment without canvas keeps the provider capture, and a missing capture fails', async () => {
  const picture = {
    ...element,
    screenshot: { mediaType: 'image/jpeg' as const, data: 'AA==', width: 800, height: 600 },
  };
  // Node has no Image or canvas, so the redraw falls back to the captured evidence.
  assert.deepEqual(await badgeCaptures([picture]), [picture.screenshot]);
  await assert.rejects(() => badgeCaptures([element]), /annotation-image-unavailable/);
});
