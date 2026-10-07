/** Names retired by the 0.2 rename, kept only so existing drafts are not lost.
 *
 * Nothing may add a new entry here: each one is a read-once migration source that
 * `annotation-store.ts` consumes before it writes the current key.
 */

/** Persistence and IndexedDB key used by `dsh-layout-care` and alpha.7/alpha.8. */
export const legacyAnnotationKey = 'dsh.layout-care.browser-annotations.v1';
