/** Development-page transport for the existing Harness Browser iframe. */
import { annotatePage } from './page-inspector';
import { isAnnotationOptions } from './protocol';

const allowed = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' &&
        (url.hostname === 'localhost' ||
          url.hostname === '[::1]' ||
          /^127(?:\.\d{1,3}){3}$/.test(url.hostname))) ||
      (window.__LAYOUT_CARE_CONFIG__?.allowedParentOrigins || []).includes(origin)
    );
  } catch {
    return false;
  }
};
let current: MessagePort | undefined;
declare global {
  interface Window {
    __LAYOUT_CARE_CONFIG__?: { allowedParentOrigins?: string[] };
    __DSH_PAGE_ANNOTATION_BRIDGE_DISPOSE__?: () => void;
  }
}
const lifecycle = new AbortController();
function dispose() {
  lifecycle.abort();
  current?.postMessage({ cancelled: true });
  current?.close();
  current = undefined;
  window.__DSH_PAGE_ANNOTATION_CANCEL__?.();
}
if (typeof window !== 'undefined') {
  window.__DSH_PAGE_ANNOTATION_BRIDGE_DISPOSE__?.();
  window.__DSH_PAGE_ANNOTATION_BRIDGE_DISPOSE__ = dispose;
  window.addEventListener('pagehide', dispose, { once: true, signal: lifecycle.signal });
}
if (typeof window !== 'undefined')
  window.addEventListener(
    'message',
    (event) => {
      if (
        window === parent ||
        event.source !== parent ||
        !allowed(event.origin) ||
        event.data?.channel !== 'dsh-browser-annotation-v1' ||
        event.data?.type !== 'start' ||
        !isAnnotationOptions(event.data.options) ||
        event.ports.length !== 1
      )
        return;
      const port = event.ports[0];
      current?.postMessage({ cancelled: true });
      current?.close();
      window.__DSH_PAGE_ANNOTATION_CANCEL__?.();
      current = port;
      port.onmessage = (message) => {
        if (message.data?.type === 'cancel' && current === port)
          window.__DSH_PAGE_ANNOTATION_CANCEL__?.();
      };
      port.postMessage({ ready: true });
      void annotatePage(event.data.options).then((result) => {
        if (current !== port) return;
        port.postMessage(result);
        port.close();
        current = undefined;
      });
    },
    { signal: lifecycle.signal },
  );
