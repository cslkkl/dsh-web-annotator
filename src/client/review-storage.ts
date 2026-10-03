import { emptyReview, isReview, localPageUrl, REVIEW_LIMITS, type Review } from '../shared/review';

export interface ReviewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function keyFor(sessionId: string, url: string): string {
  if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 200)
    throw new Error('invalid-session');
  return `layout-care:review:v1:${encodeURIComponent(sessionId)}:${encodeURIComponent(localPageUrl(url).href)}`;
}

/** Load only a valid bounded review belonging to this session and full page URL. */
export function loadReview(storage: ReviewStorage, sessionId: string, url: string): Review {
  const fallback = emptyReview(url);
  try {
    const raw = storage.getItem(keyFor(sessionId, fallback.url));
    if (!raw || raw.length > REVIEW_LIMITS.review) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isReview(parsed) && parsed.url === fallback.url ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Persist a valid review. Storage/quota failures are reported by the false return value. */
export function saveReview(storage: ReviewStorage, sessionId: string, review: Review): boolean {
  try {
    if (!isReview(review)) return false;
    storage.setItem(keyFor(sessionId, review.url), JSON.stringify(review));
    return true;
  } catch {
    return false;
  }
}

/** Acquire browser storage inside the recovery boundary; its getter can throw. */
export function loadBrowserReview(
  sessionId: string,
  url: string,
  getStorage: () => ReviewStorage = () => window.localStorage,
): Review {
  try {
    return loadReview(getStorage(), sessionId, url);
  } catch {
    return emptyReview(url);
  }
}

/** Storage may be denied before setItem is reached. Keep in-memory work usable. */
export function saveBrowserReview(
  sessionId: string,
  review: Review,
  getStorage: () => ReviewStorage = () => window.localStorage,
): boolean {
  try {
    return saveReview(getStorage(), sessionId, review);
  } catch {
    return false;
  }
}
