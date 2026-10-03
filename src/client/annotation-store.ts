/** Session-scoped annotations shared by Browser toolbar and review slots. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
import type { BrowserAnnotation } from '../browser/page-inspector';
import { isAnnotationResult } from '../browser/protocol';

/** A saved annotation has an independent queue identity. */
export interface SavedAnnotation {
  id: string;
  annotation: BrowserAnnotation;
}
interface State {
  byUrl: Record<string, SavedAnnotation[]>;
}

/** Validate durable browser storage before displaying retained annotations.
 * @param value - hydrated page queue.
 * @returns bounded valid annotations.
 */
export function readAnnotations(value: unknown): SavedAnnotation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (x): x is SavedAnnotation =>
        !!x &&
        typeof x === 'object' &&
        typeof x.id === 'string' &&
        x.id.length <= 100 &&
        isAnnotationResult(x.annotation) &&
        !('cancelled' in x.annotation),
    )
    .slice(0, 32);
}
/** @returns a fresh store declaration; the renderer owns its instances. */
export function createAnnotationStore() {
  return defineStore({
    init: (): State => ({ byUrl: {} }),
    persist: 'dsh.layout-care.browser-annotations.v1',
    actions: {
      add: (draft: State, url: string, value: SavedAnnotation) => {
        draft.byUrl ||= {};
        const notes = readAnnotations(draft.byUrl[url]);
        if (notes.length >= 32) throw new Error('annotation-limit');
        draft.byUrl[url] = [...notes, value];
      },
      remove: (draft: State, url: string, id: string) => {
        draft.byUrl[url] = readAnnotations(draft.byUrl?.[url]).filter((x) => x.id !== id);
      },
      sent: (draft: State, url: string, ids: string[]) => {
        draft.byUrl[url] = readAnnotations(draft.byUrl?.[url]).filter((x) => !ids.includes(x.id));
      },
    },
  });
}
export type AnnotationStore = ReturnType<typeof createAnnotationStore>;
