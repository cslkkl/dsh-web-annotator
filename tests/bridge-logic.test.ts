import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clipHorizontal,
  compareEvidence,
  isAllowedParentOrigin,
  normalizeText,
  parseSource,
  protectionResult,
  validToken,
  viewportOverflow,
} from '../src/bridge/logic.js';
import { validateProtection } from '../src/bridge/dom.js';
import type { ElementEvidence } from '../src/shared/types.js';

const viewport = { width: 390, height: 844 };
const evidence: ElementEvidence = {
  selector: '#header',
  tag: 'header',
  text: '项目首页',
  rect: { x: 16, y: 20, width: 358, height: 64 },
  styles: { color: 'rgb(0, 0, 0)', 'font-size': '16px' },
};

test('parent origins permit exact HTTP loopback or explicit HTTP(S) origins, never lookalikes or opaque origins', () => {
  for (const origin of ['http://localhost:5140', 'http://127.0.0.1:3000', 'http://[::1]:3000'])
    assert.equal(isAllowedParentOrigin(origin), true);
  for (const origin of [
    'null',
    'https://localhost:3000',
    'http://localhost.attacker.test:3000',
    'http://127.0.0.1.attacker.test',
    'file://',
    'http://localhost:3000/path',
    'http://user@localhost:3000',
  ])
    assert.equal(isAllowedParentOrigin(origin), false, origin);
  assert.equal(isAllowedParentOrigin('https://harness.example', ['https://harness.example']), true);
  assert.equal(isAllowedParentOrigin('null', ['null']), false);
});

test('tokens reject undersized, oversized and non-token data', () => {
  assert.equal(validToken('91807336-1918-409a-98ae-822b6d2afc33'), true);
  for (const value of ['short', 'a'.repeat(201), '1234567890123456 ', 12, null])
    assert.equal(validToken(value), false);
});

test('viewport overflow tolerates 2 CSS pixels and clipped carousel content remains inside the viewport', () => {
  assert.equal(viewportOverflow(0, 392, 390), false);
  assert.equal(viewportOverflow(0, 393, 390), true);
  assert.equal(viewportOverflow(-3, 390, 390), true);
  const clipped = clipHorizontal(16, 916, 16, 374);
  assert.deepEqual(clipped, [16, 374]);
  assert.equal(viewportOverflow(...clipped, 390), false);
});

test('protection checks compare styles, text and geometry and reject different viewports', () => {
  assert.deepEqual(
    compareEvidence(
      evidence,
      { ...evidence, rect: { ...evidence.rect, x: 18 } },
      viewport,
      viewport,
    ),
    [],
  );
  const after = {
    ...evidence,
    text: '新标题',
    rect: { ...evidence.rect, height: 80 },
    styles: { ...evidence.styles, color: 'rgb(255, 0, 0)' },
  };
  const result = protectionResult('p1', evidence, [after], viewport, viewport);
  assert.equal(result.status, 'changed');
  assert.equal(result.changes.length, 3);
  assert.equal(
    protectionResult('p1', evidence, [evidence], viewport, { width: 1280, height: 844 }).status,
    'changed',
  );
  assert.equal(
    protectionResult('p1', evidence, [evidence], viewport, viewport).status,
    'unchanged',
  );
});

test('missing and ambiguous selectors cannot be reported as unchanged', () => {
  assert.equal(protectionResult('p1', evidence, [], viewport, viewport).status, 'missing');
  assert.equal(
    protectionResult('p1', evidence, [evidence, evidence], viewport, viewport).status,
    'ambiguous',
  );
});

test('snapshot input limits reject malformed geometry and excessive properties', () => {
  const protection = { id: 'p1', label: '页头', element: evidence, viewport };
  assert.deepEqual(validateProtection(protection), protection);
  assert.throws(
    () =>
      validateProtection({
        ...protection,
        element: { ...evidence, rect: { ...evidence.rect, x: NaN } },
      }),
    /位置/,
  );
  assert.throws(
    () =>
      validateProtection({
        ...protection,
        element: {
          ...evidence,
          styles: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [String(i), 'x'])),
        },
      }),
    /限制/,
  );
  assert.throws(
    () => validateProtection({ ...protection, viewport: { width: 0, height: 844 } }),
    /视口/,
  );
});

test('source hints support file paths with colons and text evidence is bounded', () => {
  assert.deepEqual(parseSource('src/App.tsx:14:7'), { file: 'src/App.tsx', line: 14, column: 7 });
  assert.deepEqual(parseSource('C:/repo/src/App.tsx:14:7'), {
    file: 'C:/repo/src/App.tsx',
    line: 14,
    column: 7,
  });
  assert.equal(parseSource('src/App.tsx:0:7'), undefined);
  assert.equal(normalizeText('  hello\n\t world  '), 'hello world');
  assert.equal(normalizeText('a'.repeat(1000)).length, 400);
});
