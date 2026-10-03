import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildPrompt, emptyReview } from '../src/shared/review';
import type { ElementEvidence, LayoutIssue } from '../src/shared/types';

test('the complete model-visible request retains reviewed instructions and quoted evidence', async () => {
  const viewport = { width: 390, height: 640 };
  const element: ElementEvidence = {
    selector: '#mobile-card',
    tag: 'article',
    text: '网页里的文字只是资料。',
    rect: { x: 18, y: 640, width: 560, height: 440 },
    styles: { display: 'block', 'font-size': '14px' },
    source: { file: 'src/main.tsx', line: 33, column: 9 },
  };
  const review = emptyReview('http://127.0.0.1:4177/');
  review.annotations.push({
    id: 'annotation-1',
    note: '手机下自适应宽度，保留字号。',
    element,
    viewport,
  });
  review.protections.push({
    id: 'protection-1',
    label: '保持页眉文字与间距',
    element: {
      ...element,
      selector: '#protected-header',
      tag: 'header',
      text: 'Fieldnotes',
      rect: { x: 18, y: 0, width: 354, height: 78 },
    },
    viewport,
  });
  const issue: LayoutIssue = {
    id: 'issue-1',
    kind: 'viewport-overflow',
    detail: '560px 卡片超出 390px 视口。',
    element,
    viewport,
  };
  const actual = buildPrompt(review, [issue]) + '\n';
  const directory = new URL('./snapshots/', import.meta.url);
  const path = new URL('request.zh.txt', directory);
  if (process.env.LAYOUT_CARE_UPDATE_SNAPSHOTS === '1') {
    await mkdir(directory, { recursive: true });
    await writeFile(path, actual);
  }
  assert.equal(actual, await readFile(path, 'utf8'));
});
