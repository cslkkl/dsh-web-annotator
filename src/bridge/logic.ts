import type { ElementEvidence, ProtectionCheck, Viewport } from '../shared/types.js';

export const BRIDGE_LIMITS = Object.freeze({
  elements: 5000,
  issues: 80,
  protections: 80,
  selectors: 30,
  selectorLength: 1000,
  textLength: 400,
});
export const GEOMETRY_TOLERANCE = 2;

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isAllowedParentOrigin(origin: string, configured: readonly string[] = []): boolean {
  try {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return false;
    if (configured.includes(origin)) return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function validToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= 200 &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  );
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, BRIDGE_LIMITS.textLength);
}

export function parseSource(value: string | null): ElementEvidence['source'] {
  if (!value || value.length > 500) return undefined;
  const match = /^(.*):(\d+):(\d+)$/.exec(value);
  if (!match || !match[1]) return undefined;
  const line = Number(match[2]);
  const column = Number(match[3]);
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1)
    return undefined;
  return { file: match[1], line, column };
}

export function compareEvidence(
  before: ElementEvidence,
  after: ElementEvidence,
  savedViewport: Viewport,
  currentViewport: Viewport,
): string[] {
  const changes: string[] = [];
  if (
    savedViewport.width !== currentViewport.width ||
    savedViewport.height !== currentViewport.height
  ) {
    changes.push(
      `视口不一致：${savedViewport.width}×${savedViewport.height} → ${currentViewport.width}×${currentViewport.height}；请恢复相同尺寸后复查。`,
    );
  }
  if (before.tag !== after.tag) changes.push(`元素类型：${before.tag} → ${after.tag}`);
  if (before.text !== after.text)
    changes.push(`可见文本：${before.text || '（空）'} → ${after.text || '（空）'}`);
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (Math.abs(before.rect[key] - after.rect[key]) > GEOMETRY_TOLERANCE)
      changes.push(`${key}：${before.rect[key]} → ${after.rect[key]} px`);
  }
  for (const key of new Set([...Object.keys(before.styles), ...Object.keys(after.styles)])) {
    if (before.styles[key] !== after.styles[key])
      changes.push(`${key}：${before.styles[key] || '（无）'} → ${after.styles[key] || '（无）'}`);
  }
  return changes
    .slice(0, 45)
    .map((change) => (change.length > 1500 ? `${change.slice(0, 1499)}…` : change));
}

export function protectionResult(
  id: string,
  before: ElementEvidence,
  matches: ElementEvidence[],
  savedViewport: Viewport,
  currentViewport: Viewport,
): ProtectionCheck {
  if (!matches.length)
    return { id, before, status: 'missing', changes: ['原元素已找不到，请重新选择保护区域。'] };
  if (matches.length > 1)
    return {
      id,
      before,
      status: 'ambiguous',
      changes: ['选择器匹配多个元素，请重新选择保护区域。'],
    };
  const after = matches[0]!;
  const changes = compareEvidence(before, after, savedViewport, currentViewport);
  return { id, before, after, changes, status: changes.length ? 'changed' : 'unchanged' };
}

export function viewportOverflow(left: number, right: number, viewportWidth: number): boolean {
  return left < -GEOMETRY_TOLERANCE || right > viewportWidth + GEOMETRY_TOLERANCE;
}

export function clipHorizontal(
  left: number,
  right: number,
  clipLeft: number,
  clipRight: number,
): [number, number] {
  return [Math.max(left, clipLeft), Math.min(right, clipRight)];
}
