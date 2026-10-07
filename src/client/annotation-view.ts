/** Picker configuration and error-to-copy mapping — pure, so Node can test them.
 *
 * Why this is not in `index.tsx`: that file imports the host's UI primitives, which
 * depend on modules only the browser host injects, so a Node test cannot import it.
 * Anything judgement-shaped that lives there is untestable. See
 * [../../tests/README.md](../../tests/README.md).
 *
 * @module dsh-web-annotator/client/annotation-view
 */
import type { BrowserAnnotationOptions } from '../browser/page-inspector';
import type { AnnotationCopyKey } from './annotation-copy';

/** Every localized field the injected picker needs, in the order it is defined.
 * The same set is validated field-by-field in `src/browser/protocol.ts`; the two must
 * agree, and `tests/annotation-view.test.ts` pins that they do. */
export const PICKER_COPY_KEYS = [
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
] as const satisfies readonly (keyof BrowserAnnotationOptions['copy'])[];

/** Error codes the picker and the submission path raise, mapped to the copy shown.
 * An unrecognized failure is reported as the generic failure, never as success. */
const ERROR_COPY: Record<string, AnnotationCopyKey> = {
  'annotation-unavailable': 'unavailable',
  'annotation-timeout': 'timeout',
  'annotation-page-changed': 'pageChanged',
  'annotation-limit': 'limit',
};

/** @param error - anything thrown by the picker or a submission.
 * @returns the copy key describing it. */
export function annotationErrorKey(error: unknown): AnnotationCopyKey {
  const code = error instanceof Error ? error.message : '';
  return ERROR_COPY[code] ?? 'failed';
}

/** Assemble the picker options from translated copy.
 * The caller supplies `dark`, because only it can read the host's theme attribute.
 * @param translate - the slot's `t`, already bound to this plugin's namespace.
 * @param dark - whether the host page is in dark mode.
 * @returns bounded options for one picker session.
 */
export function pickerOptions(
  translate: (key: AnnotationCopyKey) => string,
  dark: boolean,
): BrowserAnnotationOptions {
  const copy = Object.fromEntries(
    PICKER_COPY_KEYS.map((key) => [key, translate(key)]),
  ) as BrowserAnnotationOptions['copy'];
  return { intent: 'question', dark, copy };
}

/** Provider-captured screenshots are optional per note, so the chosen delivery may not
 * be satisfiable. `image` needs every selected note to have one; `both` needs at least
 * one; `details` always works.
 * @param choice - what the user selected.
 * @param imageCount - selected notes that actually carry a screenshot.
 * @param noteCount - selected notes in total.
 * @returns the delivery that can actually be sent.
 */
export function effectiveDelivery(
  choice: 'image' | 'details' | 'both',
  imageCount: number,
  noteCount: number,
): 'image' | 'details' | 'both' {
  if (choice === 'details' || noteCount === 0 || imageCount === 0) return 'details';
  if (choice === 'image' && imageCount < noteCount) return 'details';
  return choice;
}
