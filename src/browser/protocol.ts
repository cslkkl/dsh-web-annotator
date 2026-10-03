/** Validation for page and guest process results, not same-process slot props. */
import type { BrowserAnnotation, BrowserAnnotationOptions } from './page-inspector';

/** Result of one annotation operation. */
export type AnnotationResult = BrowserAnnotation | { cancelled: true };

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function string(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit;
}
function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e7;
}
function rect(value: unknown): boolean {
  return (
    object(value) &&
    number(value.x) &&
    number(value.y) &&
    number(value.width) &&
    number(value.height) &&
    value.width >= 0 &&
    value.height >= 0
  );
}
/** Validate bounded JSON evidence received from a visited document.
 * @param value - process or MessagePort result.
 * @returns whether the result can be retained and rendered.
 */
export function isAnnotationResult(value: unknown): value is AnnotationResult {
  if (!object(value)) return false;
  if (value.cancelled === true) return Object.keys(value).length === 1;
  if (
    (value.intent !== 'comment' && value.intent !== 'question') ||
    !string(value.note, 1000) ||
    !value.note.trim() ||
    !string(value.url, 8192) ||
    !string(value.title, 300)
  )
    return false;
  if (
    value.styleChanges !== undefined &&
    (!object(value.styleChanges) ||
      Object.keys(value.styleChanges).length > 10 ||
      !Object.entries(value.styleChanges).every(
        ([key, change]) =>
          [
            'color',
            'background-color',
            'opacity',
            'font-family',
            'font-size',
            'font-weight',
            'padding',
            'margin',
            'gap',
          ].includes(key) &&
          object(change) &&
          string(change.before, 1000) &&
          string(change.after, 1000),
      ))
  )
    return false;
  if (
    value.screenshot !== undefined &&
    (!object(value.screenshot) ||
      value.screenshot.mediaType !== 'image/jpeg' ||
      !string(value.screenshot.data, 4000000) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value.screenshot.data) ||
      !number(value.screenshot.width) ||
      !number(value.screenshot.height) ||
      value.screenshot.width <= 0 ||
      value.screenshot.width > 1600 ||
      value.screenshot.height <= 0 ||
      value.screenshot.height > 1600)
  )
    return false;
  try {
    if (!['http:', 'https:'].includes(new URL(value.url).protocol)) return false;
  } catch {
    return false;
  }
  if (
    !object(value.viewport) ||
    !number(value.viewport.width) ||
    !number(value.viewport.height) ||
    value.viewport.width <= 0 ||
    value.viewport.height <= 0
  )
    return false;
  const selection = value.selection;
  if (
    !object(selection) ||
    !['element', 'region', 'point'].includes(String(selection.kind)) ||
    !rect(selection.rect) ||
    !rect(selection.viewportRect) ||
    !object(selection.scroll) ||
    !number(selection.scroll.x) ||
    !number(selection.scroll.y) ||
    !Array.isArray(selection.candidates) ||
    selection.candidates.length > 12
  )
    return false;
  if (selection.kind === 'element' && selection.candidates.length !== 1) return false;
  for (const item of selection.candidates) {
    if (
      !object(item) ||
      !string(item.selector, 8192) ||
      !Array.isArray(item.shadowHosts) ||
      item.shadowHosts.length > 32 ||
      !item.shadowHosts.every((x) => string(x, 8192)) ||
      item.matchCount !== 1 ||
      !string(item.tag, 200) ||
      !string(item.text, 400) ||
      !rect(item.rect) ||
      !object(item.styles) ||
      Object.keys(item.styles).length > 16 ||
      !Object.entries(item.styles).every(([key, val]) => string(key, 100) && string(val, 1000)) ||
      (item.source !== undefined && !string(item.source, 1000))
    )
      return false;
  }
  try {
    return JSON.stringify({ ...value, screenshot: undefined }).length <= 64000;
  } catch {
    return false;
  }
}

/** Validate picker configuration crossing the iframe bridge.
 * @param value - parent message options.
 * @returns whether all localized fields are bounded strings.
 */
export function isAnnotationOptions(value: unknown): value is BrowserAnnotationOptions {
  return (
    object(value) &&
    (value.intent === 'comment' || value.intent === 'question') &&
    typeof value.dark === 'boolean' &&
    object(value.copy) &&
    [
      'select',
      'comment',
      'question',
      'placeholder',
      'settings',
      'save',
      'cancel',
      'parent',
      'child',
      'targetGone',
      'empty',
      'region',
      'point',
      'interact',
      'color',
      'background',
      'opacity',
      'font',
      'fontSize',
      'fontWeight',
      'spacing',
      'elementOnly',
      'invalidStyle',
      'applyStyles',
      'styleHint',
    ].every((key) => string(value.copy && object(value.copy) ? value.copy[key] : null, 500))
  );
}
