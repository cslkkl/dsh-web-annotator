/** Session-scoped annotations shared by Browser toolbar and review slots. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
import type { BrowserAnnotation } from '../browser/page-inspector';
import { isAnnotationResult } from '../browser/protocol';
import { annotationStorage } from './annotation-storage';

const persistenceKey = 'dsh.layout-care.browser-annotations.v1';
function databaseAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

/** A saved annotation has an independent queue identity. */
export interface SavedAnnotation {
  id: string;
  annotation: BrowserAnnotation;
}
interface State {
  byUrl: Record<string, SavedAnnotation[]>;
  storage: 'loading' | 'saving' | 'saved' | 'failed';
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
  const handle = defineStore({
    init: (): State => ({
      byUrl: {},
      storage: databaseAvailable() ? 'loading' : 'failed',
    }),
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
      edit: (draft: State, url: string, id: string, note: string) => {
        if (!note.trim() || note.length > 1000) throw new Error('annotation-invalid-note');
        const item = draft.byUrl[url]?.find((x) => x.id === id);
        if (item) item.annotation = { ...item.annotation, note: note.trim() };
      },
      sent: (draft: State, url: string, ids: string[]) => {
        draft.byUrl[url] = readAnnotations(draft.byUrl?.[url]).filter((x) => !ids.includes(x.id));
      },
    },
  });
  // Keep the framework's shared identity, while using its public factory to attach async persistence.
  return {
    ...handle,
    spec: { ...handle.spec, persist: persistenceKey },
    create(scopeKey?: string) {
      const instance = handle.create(scopeKey);
      const key = scopeKey === undefined ? persistenceKey : `${persistenceKey}.${scopeKey}`;
      let ready = false;
      let removed = false;
      let readable = databaseAvailable();
      let queue = Promise.resolve();
      let previous = instance.getSnapshot().byUrl;
      let revision = 0;
      const status = (storage: State['storage']) =>
        instance.store.update((draft) => {
          draft.storage = storage;
        });
      const write = (byUrl: State['byUrl']) => {
        if (!readable) {
          status('failed');
          return;
        }
        const current = ++revision;
        status('saving');
        queue = queue.then(async () => {
          if (removed) return;
          try {
            await annotationStorage(key, 'write', { byUrl });
            // Migration only removes the legacy value after a committed durable copy.
            try {
              localStorage.removeItem(key);
            } catch {
              /* Storage may be disabled. */
            }
            if (current === revision) status('saved');
          } catch {
            if (current === revision) status('failed');
          }
        });
      };
      instance.subscribe(() => {
        const { byUrl } = instance.getSnapshot();
        if (!ready || byUrl === previous) return;
        previous = byUrl;
        write(byUrl);
      });
      const hydrate = async () => {
        let raw: unknown;
        let available = true;
        try {
          raw = await annotationStorage(key, 'read');
        } catch {
          available = false;
        }
        if (removed) return;
        if (raw === undefined) {
          try {
            raw = JSON.parse(localStorage.getItem(key) || 'null');
          } catch {
            /* Keep an empty queue. */
          }
        }
        const byUrl: State['byUrl'] = {};
        if (
          raw &&
          typeof raw === 'object' &&
          'byUrl' in raw &&
          raw.byUrl &&
          typeof raw.byUrl === 'object'
        ) {
          for (const [url, items] of Object.entries(raw.byUrl)) {
            const notes = readAnnotations(items).filter((x) => x.annotation.url === url);
            if (notes.length) byUrl[url] = notes;
          }
        }
        readable = available;
        instance.store.set({ byUrl, storage: available ? 'saved' : 'failed' });
        previous = byUrl;
        ready = true;
        if (available && Object.keys(byUrl).length) write(byUrl);
      };
      if (databaseAvailable()) void hydrate();
      else ready = true;
      return {
        ...instance,
        clearPersisted() {
          removed = true;
          try {
            localStorage.removeItem(key);
          } catch {
            /* Storage may be disabled. */
          }
          void queue.then(() => annotationStorage(key, 'delete')).catch(() => {});
        },
      };
    },
  };
}
export type AnnotationStore = ReturnType<typeof createAnnotationStore>;
