/** Bounded annotation requests to a bridge-enabled iframe owned by Browser. */
import type { BrowserAnnotationOptions } from './page-inspector';
import { isAnnotationResult, type AnnotationResult } from './protocol';

/** Request one picker without exposing the iframe or an evaluator to plugins.
 * @param frame - provider-owned iframe.
 * @param url - controller-known HTTP(S) page.
 * @param options - picker copy and theme.
 * @param signal - operation lifetime.
 * @returns saved evidence or cancellation; rejects when the page has no bridge.
 */
export function annotateIframe(
  frame: HTMLIFrameElement,
  url: string,
  options: BrowserAnnotationOptions,
  signal: AbortSignal,
): Promise<AnnotationResult> {
  if (signal.aborted) return Promise.resolve({ cancelled: true });
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    let ended = false;
    let ready = false;
    const handshake = setTimeout(() => {
      if (!ready) finish(undefined, new Error('annotation-unavailable'));
    }, 3000);
    function finish(value?: AnnotationResult, error?: Error) {
      if (ended) return;
      ended = true;
      channel.port1.postMessage({ type: 'cancel' });
      channel.port1.close();
      channel.port2.close();
      clearTimeout(handshake);
      signal.removeEventListener('abort', cancel);
      frame.removeEventListener('load', cancel);
      if (error) reject(error);
      else resolve(value || { cancelled: true });
    }
    function cancel() {
      finish({ cancelled: true });
    }
    signal.addEventListener('abort', cancel, { once: true });
    frame.addEventListener('load', cancel, { once: true });
    channel.port1.onmessage = (event) => {
      if (event.data?.ready === true && !ready) {
        ready = true;
        clearTimeout(handshake);
        return;
      }
      if (!isAnnotationResult(event.data)) {
        finish(undefined, new Error('annotation-invalid'));
        return;
      }
      if (!('cancelled' in event.data) && event.data.url !== url) {
        finish(undefined, new Error('annotation-page-changed'));
        return;
      }
      finish(event.data);
    };
    try {
      if (!frame.contentWindow) {
        finish(undefined, new Error('annotation-unavailable'));
        return;
      }
      frame.contentWindow.postMessage(
        { channel: 'dsh-browser-annotation-v1', type: 'start', options },
        new URL(url).origin,
        [channel.port2],
      );
      frame.focus();
    } catch (error) {
      finish(undefined, error instanceof Error ? error : new Error('annotation-unavailable'));
    }
  });
}
