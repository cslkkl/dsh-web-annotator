/** Development-page transport for the existing Harness Browser iframe.
 *
 * This bundle runs inside the visited page, so every message is untrusted input:
 * only the page's own parent may connect, only from an allowed origin, and only
 * with a validated option payload. The picker itself stays in `page-inspector.ts`.
 */
import {
  annotatePage,
  type BrowserAnnotation,
  type BrowserAnnotationOptions,
} from './page-inspector';
import { isAnnotationOptions } from './protocol';

/** The saved result or an explicit cancellation, as produced by the picker. */
export type AnnotationOutcome = BrowserAnnotation | { cancelled: true };

/** Origins permitted to drive the picker. Loopback only, plus explicit configuration. */
export function isAllowedParentOrigin(origin: string, configured: readonly string[]): boolean {
  try {
    const url = new URL(origin);
    if (url.origin !== origin) return false;
    if (configured.includes(origin)) return ['http:', 'https:'].includes(url.protocol);
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' ||
        url.hostname === '[::1]' ||
        /^127(?:\.\d{1,3}){3}$/.test(url.hostname))
    );
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    /** Inline configuration emitted by `src/vite.ts` before this bundle loads. */
    __WEB_ANNOTATOR_CONFIG__?: { allowedParentOrigins?: string[] };
    __DSH_PAGE_ANNOTATION_BRIDGE_DISPOSE__?: () => void;
  }
}

/** Install the picker transport. Disposal closes the channel and any active picker.
 * @param win - the visited page's own window.
 * @param pick - the picker to run; injectable so the transport can be tested without a DOM.
 * @returns a disposer that removes every listener and open channel. Calling it twice is a no-op.
 */
export function installAnnotationBridge(
  win: Window,
  pick: (options: BrowserAnnotationOptions) => Promise<AnnotationOutcome> = annotatePage,
): () => void {
  const lifecycle = new AbortController();
  const configured = win.__WEB_ANNOTATOR_CONFIG__?.allowedParentOrigins ?? [];
  let current: MessagePort | undefined;
  let disposed = false;
  const release = (port: MessagePort) => {
    port.onmessage = null;
    port.close();
    if (current === port) current = undefined;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    lifecycle.abort();
    const port = current;
    if (port) {
      port.postMessage({ cancelled: true });
      release(port);
    }
    win.__DSH_PAGE_ANNOTATION_CANCEL__?.();
  };
  win.addEventListener(
    'message',
    (event) => {
      if (
        disposed ||
        win === win.parent ||
        event.source !== win.parent ||
        !isAllowedParentOrigin(event.origin, configured) ||
        event.data?.channel !== 'dsh-browser-annotation-v1' ||
        event.data?.type !== 'start' ||
        !isAnnotationOptions(event.data.options) ||
        event.ports.length !== 1
      )
        return;
      const port = event.ports[0]!;
      // A page may only hold one picker at a time; the previous channel is told why it ended.
      if (current) {
        current.postMessage({ cancelled: true });
        release(current);
      }
      win.__DSH_PAGE_ANNOTATION_CANCEL__?.();
      current = port;
      port.onmessage = (message) => {
        if (message.data?.type === 'cancel' && current === port)
          win.__DSH_PAGE_ANNOTATION_CANCEL__?.();
      };
      port.postMessage({ ready: true });
      const settle = (value: AnnotationOutcome) => {
        if (disposed || current !== port) return;
        port.postMessage(value);
        release(port);
      };
      let started: Promise<AnnotationOutcome>;
      try {
        started = pick(event.data.options);
      } catch {
        settle({ cancelled: true });
        return;
      }
      void started.then(settle, () => {
        settle({ cancelled: true });
      });
    },
    { signal: lifecycle.signal },
  );
  win.addEventListener('pagehide', dispose, { once: true, signal: lifecycle.signal });
  return dispose;
}

if (typeof window !== 'undefined') {
  window.__DSH_PAGE_ANNOTATION_BRIDGE_DISPOSE__?.();
  window.__DSH_PAGE_ANNOTATION_BRIDGE_DISPOSE__ = installAnnotationBridge(window);
}
