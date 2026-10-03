import type {
  ElementEvidence,
  LayoutIssue,
  Protection,
  ProtectionCheck,
  ScanResult,
  Viewport,
} from '../shared/types.js';
import {
  BRIDGE_LIMITS,
  clipHorizontal,
  isPlainRecord,
  normalizeText,
  parseSource,
  protectionResult,
  viewportOverflow,
} from './logic.js';

const STYLE_KEYS = [
  'display',
  'position',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'color',
  'background-color',
  'border-radius',
  'border-top-width',
  'border-top-color',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'text-align',
  'white-space',
  'overflow-x',
  'flex-direction',
  'justify-content',
  'align-items',
  'grid-template-columns',
  'box-shadow',
  'transform',
] as const;
const CLIPPING_VALUES = new Set(['hidden', 'clip', 'auto', 'scroll']);
export const OVERLAY_ATTRIBUTE = 'data-layout-care-overlay';

export function getViewport(win: Window): Viewport {
  return {
    width: win.document.documentElement.clientWidth || win.innerWidth,
    height: win.innerHeight,
  };
}

function escapeIdentifier(value: string): string {
  return CSS.escape(value);
}

export function elementSelector(element: Element): string {
  const doc = element.ownerDocument;
  if (element.id) {
    const id = `#${escapeIdentifier(element.id)}`;
    if (id.length <= BRIDGE_LIMITS.selectorLength && doc.querySelectorAll(id).length === 1)
      return id;
  }
  const parts: string[] = [];
  let cursor: Element | null = element;
  while (cursor && parts.join(' > ').length < 900) {
    const tag = escapeIdentifier(cursor.localName);
    const parent: Element | null = cursor.parentElement;
    let part = tag;
    if (parent) {
      const peers = Array.from(parent.children).filter(
        (child) => child.localName === cursor!.localName,
      );
      if (peers.length > 1) part += `:nth-of-type(${peers.indexOf(cursor) + 1})`;
    }
    parts.unshift(part);
    const selector = parts.join(' > ');
    if (doc.querySelectorAll(selector).length === 1) return selector;
    cursor = parent;
  }
  throw new Error('无法生成唯一且有限长度的元素选择器，请选择更上层的区域。');
}

export function snapshotElement(element: Element, win: Window): ElementEvidence {
  const rect = element.getBoundingClientRect();
  const computed = win.getComputedStyle(element);
  const styles: Record<string, string> = {};
  for (const key of STYLE_KEYS) styles[key] = computed.getPropertyValue(key).slice(0, 1000);
  // innerText reflects rendered text; textContent is needed for SVG elements.
  const renderedText =
    element instanceof HTMLElement ? element.innerText : element.textContent || '';
  const source = parseSource(element.getAttribute('data-layout-care-source'));
  return {
    selector: elementSelector(element),
    tag: element.localName,
    text: normalizeText(renderedText),
    rect: {
      x: Math.round((rect.left + win.scrollX) * 100) / 100,
      y: Math.round((rect.top + win.scrollY) * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
    },
    styles,
    ...(source ? { source } : {}),
  };
}

export function requireSelector(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > BRIDGE_LIMITS.selectorLength)
    throw new Error('选择器必须为非空字符串，且不超过 1000 字符。');
  return value;
}

export function checkedQuery(doc: Document, value: unknown): NodeListOf<Element> {
  const selector = requireSelector(value);
  try {
    return doc.querySelectorAll(selector);
  } catch {
    throw new Error(`无效的 CSS 选择器：${selector.slice(0, 100)}`);
  }
}

function visible(element: Element, style: CSSStyleDeclaration, win: Window): boolean {
  const rect = element.getBoundingClientRect();
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse' ||
    style.opacity === '0' ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return false;
  // Suppress descendants of hidden ancestors, including opacity:0 containers.
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const parentStyle = win.getComputedStyle(ancestor);
    if (
      parentStyle.display === 'none' ||
      parentStyle.visibility === 'hidden' ||
      parentStyle.opacity === '0'
    )
      return false;
  }
  return true;
}

function visibleHorizontalBounds(element: Element, win: Window): [number, number] {
  const rect = element.getBoundingClientRect();
  let bounds: [number, number] = [rect.left + win.scrollX, rect.right + win.scrollX];
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (!CLIPPING_VALUES.has(win.getComputedStyle(ancestor).overflowX)) continue;
    const parentRect = ancestor.getBoundingClientRect();
    const left = parentRect.left + win.scrollX + ancestor.clientLeft;
    bounds = clipHorizontal(bounds[0], bounds[1], left, left + ancestor.clientWidth);
  }
  return bounds;
}

export function scanDocument(win: Window, rawIgnoreSelectors: unknown): ScanResult {
  if (!Array.isArray(rawIgnoreSelectors) || rawIgnoreSelectors.length > BRIDGE_LIMITS.selectors)
    throw new Error('排除选择器必须为数组，最多 30 条。');
  const doc = win.document;
  const ignoreSelectors = rawIgnoreSelectors.map(requireSelector);
  for (const selector of ignoreSelectors) checkedQuery(doc, selector);
  const viewport = getViewport(win);
  const candidates: { element: Element; kind: LayoutIssue['kind']; detail: string }[] = [];
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_ELEMENT);
  let count = 0;
  let truncated = false;
  while (walker.nextNode()) {
    const element = walker.currentNode as Element;
    if (++count > BRIDGE_LIMITS.elements) {
      truncated = true;
      break;
    }
    if (
      element.hasAttribute(OVERLAY_ATTRIBUTE) ||
      element.closest(`[${OVERLAY_ATTRIBUTE}]`) ||
      ['script', 'style', 'link', 'meta', 'template'].includes(element.localName)
    )
      continue;
    if (ignoreSelectors.some((selector) => element.closest(selector))) continue;
    const style = win.getComputedStyle(element);
    if (!visible(element, style, win)) continue;
    const [left, right] = visibleHorizontalBounds(element, win);
    if (right <= left) continue;
    const outsideViewport = viewportOverflow(left, right, viewport.width);
    // Scrollable/clipped content is intentional. Container geometry can still overflow.
    const contentOverflow =
      !CLIPPING_VALUES.has(style.overflowX) &&
      element.scrollWidth > element.clientWidth + 2 &&
      element.clientWidth > 0;
    if (!outsideViewport && !contentOverflow) continue;
    const kind = outsideViewport ? 'viewport-overflow' : 'horizontal-overflow';
    const detail = outsideViewport
      ? `元素可见范围 ${Math.round(left)}–${Math.round(right)} px 超出 ${viewport.width} px 视口；这是候选，请确认是否为有意布局。`
      : `内容宽度 ${element.scrollWidth} px 超过容器 ${element.clientWidth} px；请确认是否需要换行或限制宽度。`;
    candidates.push({ element, kind, detail });
  }
  const byElement = new Map(candidates.map((candidate) => [candidate.element, candidate]));
  const inheritedOverflow = new Set<Element>();
  for (const candidate of candidates) {
    for (
      let ancestor = candidate.element.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (byElement.get(ancestor)?.kind === 'horizontal-overflow') inheritedOverflow.add(ancestor);
    }
  }
  const usefulCandidates = candidates.filter((candidate) => {
    // A regular-width wrapper inherits scrollWidth from its wide descendant. Report the cause.
    if (inheritedOverflow.has(candidate.element)) return false;
    for (
      let ancestor = candidate.element.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (byElement.get(ancestor)?.kind === 'viewport-overflow') return false;
    }
    return true;
  });
  if (usefulCandidates.length > BRIDGE_LIMITS.issues) truncated = true;
  const issues: LayoutIssue[] = usefulCandidates
    .slice(0, BRIDGE_LIMITS.issues)
    .map((candidate, index) => ({
      id: `issue-${index + 1}`,
      kind: candidate.kind,
      element: snapshotElement(candidate.element, win),
      detail: candidate.detail,
      viewport,
    }));
  return {
    issues,
    viewport,
    documentWidth: Math.max(
      doc.documentElement.scrollWidth,
      doc.body?.scrollWidth || 0,
      viewport.width,
    ),
    truncated,
  };
}

export function validateProtection(value: unknown): Protection {
  if (
    !isPlainRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length > 200 ||
    typeof value.label !== 'string' ||
    value.label.length > 500 ||
    !isPlainRecord(value.element) ||
    !isPlainRecord(value.viewport)
  )
    throw new Error('保护区域记录格式无效。');
  const element = value.element;
  requireSelector(element.selector);
  if (
    typeof element.tag !== 'string' ||
    element.tag.length > 100 ||
    typeof element.text !== 'string' ||
    element.text.length > BRIDGE_LIMITS.textLength ||
    !isPlainRecord(element.rect) ||
    !isPlainRecord(element.styles)
  )
    throw new Error('保护区域元素快照格式无效。');
  for (const key of ['x', 'y', 'width', 'height'])
    if (
      typeof element.rect[key] !== 'number' ||
      !Number.isFinite(element.rect[key]) ||
      Math.abs(element.rect[key] as number) > 1e7
    )
      throw new Error('保护区域位置格式无效。');
  for (const key of ['width', 'height'])
    if (
      typeof value.viewport[key] !== 'number' ||
      !Number.isFinite(value.viewport[key]) ||
      (value.viewport[key] as number) <= 0 ||
      (value.viewport[key] as number) > 100000
    )
      throw new Error('保护区域视口格式无效。');
  const entries = Object.entries(element.styles);
  if (
    entries.length > 50 ||
    entries.some(([key, val]) => key.length > 100 || typeof val !== 'string' || val.length > 1000)
  )
    throw new Error('保护区域样式快照超过限制。');
  // Do not echo arbitrary input properties in results.
  return {
    id: value.id,
    label: value.label,
    viewport: { width: value.viewport.width as number, height: value.viewport.height as number },
    element: {
      selector: element.selector as string,
      tag: element.tag,
      text: element.text,
      rect: {
        x: element.rect.x as number,
        y: element.rect.y as number,
        width: element.rect.width as number,
        height: element.rect.height as number,
      },
      styles: Object.fromEntries(entries) as Record<string, string>,
    },
  };
}

export function recheckProtections(win: Window, values: unknown): ProtectionCheck[] {
  if (!Array.isArray(values) || values.length > BRIDGE_LIMITS.protections)
    throw new Error('保护区域必须为数组，最多 80 条。');
  const viewport = getViewport(win);
  return values.map((value) => {
    const protection = validateProtection(value);
    const matches = checkedQuery(win.document, protection.element.selector);
    const evidence =
      matches.length === 1
        ? [snapshotElement(matches[0]!, win)]
        : matches.length > 1
          ? [protection.element, protection.element]
          : [];
    return protectionResult(
      protection.id,
      protection.element,
      evidence,
      protection.viewport,
      viewport,
    );
  });
}
