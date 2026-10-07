/** Session-scoped annotations shared by the Browser toolbar and the queue slot. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
import type { BrowserAnnotation } from '../browser/page-inspector';
import { isAnnotationResult } from '../browser/protocol';
import { annotationStorage } from './annotation-storage';
import { legacyAnnotationKey } from './legacy-names';

const persistenceKey = 'dsh.web-annotator.browser-annotations.v1';

function databaseAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function scopedKey(prefix: string, scopeKey: string | undefined): string {
  return scopeKey === undefined ? prefix : `${prefix}.${scopeKey}`;
}

function readLocalStorage(key: string): unknown {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? undefined : JSON.parse(stored);
  } catch {
    return undefined;
  }
}

function removeLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage may be disabled. */
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

/** Keep only queues whose key is still the page the annotation was saved on. */
function readQueues(value: unknown): State['byUrl'] {
  const byUrl: State['byUrl'] = {};
  if (!value || typeof value !== 'object' || !('byUrl' in value)) return byUrl;
  const raw = (value as { byUrl?: unknown }).byUrl;
  if (!raw || typeof raw !== 'object') return byUrl;
  for (const [url, items] of Object.entries(raw)) {
    const notes = readAnnotations(items).filter((x) => x.annotation.url === url);
    if (notes.length) byUrl[url] = notes;
  }
  return byUrl;
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
      const key = scopedKey(persistenceKey, scopeKey);
      const legacyKey = scopedKey(legacyAnnotationKey, scopeKey);
      let ready = false;
      let removed = false;
      let readable = databaseAvailable();
      let queue = Promise.resolve();
      let previous = instance.getSnapshot().byUrl;
      let revision = 0;
      let legacyRetired = false;
      const status = (storage: State['storage']) =>
        instance.store.update((draft) => {
          draft.storage = storage;
        });
      // The retired key is dropped only after the current key is durably committed.
      const retireLegacy = () => {
        removeLocalStorage(legacyKey);
        void annotationStorage(legacyKey, 'delete').catch(() => {});
      };
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
            if (!legacyRetired) {
              legacyRetired = true;
              retireLegacy();
            }
            removeLocalStorage(key);
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
        let available = true;
        let raw: unknown;
        try {
          raw = await annotationStorage(key, 'read');
        } catch {
          available = false;
        }
        if (removed) return;
        if (raw === undefined && available) {
          // Drafts written before the rename live under the retired key.
          try {
            raw = await annotationStorage(legacyKey, 'read');
          } catch {
            /* Treat an unreadable legacy row as absent. */
          }
        }
        if (raw === undefined) {
          raw = readLocalStorage(key) ?? readLocalStorage(legacyKey);
        }
        const byUrl = readQueues(raw);
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
          removeLocalStorage(key);
          removeLocalStorage(legacyKey);
          void queue
            .then(() => annotationStorage(key, 'delete'))
            .catch(() => {})
            .then(() => annotationStorage(legacyKey, 'delete'))
            .catch(() => {});
        },
      };
    },
  };
}
export type AnnotationStore = ReturnType<typeof createAnnotationStore>;
