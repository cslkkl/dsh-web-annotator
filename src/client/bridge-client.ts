import type {
  BridgeMethod,
  ScanResult,
  PickResult,
  RecheckResult,
  Protection,
} from '../shared/types';
import {
  isEvidence,
  isIssue,
  isProtectionCheck,
  isViewport,
  localPageUrl,
  REVIEW_LIMITS,
  sameEvidence,
} from '../shared/review';
export { isEvidence, localPageUrl } from '../shared/review';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function sameViewport(
  left: { width: number; height: number },
  right: { width: number; height: number },
): boolean {
  return left.width === right.width && left.height === right.height;
}
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: BridgeMethod;
  payload: object;
  generation: number;
};
export class PageBridge {
  private token = crypto.randomUUID();
  private pending = new Map<string, Pending>();
  private ready = false;
  private handshakeTimer?: ReturnType<typeof setInterval>;
  private handshakeTimeout?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private awaitingReady = false;
  private generation = 0;
  private connectedSource: Window | null = null;
  private readonly origin: string;
  private readonly target: string;
  constructor(
    private frame: HTMLIFrameElement,
    target: string,
    private state: (ready: boolean, error?: string) => void,
  ) {
    const url = localPageUrl(target);
    this.origin = url.origin;
    this.target = url.href;
    window.addEventListener('message', this.receive);
  }
  connect(): void {
    if (this.disposed) return;
    this.rejectAll('page-reloaded');
    this.clearHandshake();
    this.ready = false;
    this.awaitingReady = true;
    const generation = ++this.generation;
    this.token = crypto.randomUUID();
    this.connectedSource = this.frame.contentWindow;
    this.state(false);
    if (this.disposed || generation !== this.generation) return;
    if (!this.correctTarget() || !this.connectedSource) {
      this.awaitingReady = false;
      this.state(false, 'page-target-changed');
      return;
    }
    const hello = () => {
      if (this.disposed || generation !== this.generation || !this.awaitingReady) return;
      if (!this.correctTarget() || this.frame.contentWindow !== this.connectedSource) {
        this.clearHandshake();
        this.awaitingReady = false;
        this.state(false, 'page-target-changed');
        return;
      }
      try {
        this.connectedSource!.postMessage(
          { type: 'layout-care/connect', token: this.token },
          this.origin,
        );
      } catch {
        this.clearHandshake();
        this.awaitingReady = false;
        this.state(false, 'bridge-unavailable');
      }
    };
    hello();
    if (this.disposed || !this.awaitingReady || generation !== this.generation) return;
    this.handshakeTimer = setInterval(hello, 200);
    this.handshakeTimeout = setTimeout(() => {
      if (this.disposed || generation !== this.generation || !this.awaitingReady) return;
      this.clearHandshake();
      this.awaitingReady = false;
      this.state(false, 'bridge-unavailable');
    }, 7000);
  }
  request<T = ScanResult | PickResult | RecheckResult>(
    method: BridgeMethod,
    payload: object,
  ): Promise<T> {
    if (this.disposed || !this.ready) return Promise.reject(new Error('bridge-unavailable'));
    if (!this.correctTarget() || this.frame.contentWindow !== this.connectedSource) {
      this.ready = false;
      this.rejectAll('page-target-changed');
      this.state(false, 'page-target-changed');
      return Promise.reject(new Error('page-target-changed'));
    }
    const id = crypto.randomUUID();
    const generation = this.generation;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          if (method === 'pick' && !this.disposed && generation === this.generation) {
            try {
              this.connectedSource?.postMessage(
                {
                  type: 'layout-care/request',
                  token: this.token,
                  id: crypto.randomUUID(),
                  method: 'cancelPick',
                  payload: {},
                },
                this.origin,
              );
            } catch {
              /* The timed out page may already have navigated. */
            }
          }
          reject(new Error('request-timeout'));
        },
        method === 'pick' ? 65000 : 10000,
      );
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
        method,
        payload,
        generation,
      });
      try {
        this.connectedSource!.postMessage(
          { type: 'layout-care/request', token: this.token, id, method, payload },
          this.origin,
        );
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error('bridge-unavailable'));
      }
    });
  }
  private receive = (event: MessageEvent) => {
    if (
      this.disposed ||
      event.source !== this.connectedSource ||
      event.source !== this.frame.contentWindow ||
      event.origin !== this.origin ||
      !this.correctTarget()
    )
      return;
    const data = event.data;
    if (!record(data) || data.token !== this.token) return;
    if (data.type !== 'layout-care/ready' && data.type !== 'layout-care/result') return;
    let pageMatches = false;
    try {
      pageMatches =
        typeof data.pageUrl === 'string' && localPageUrl(data.pageUrl).href === this.target;
    } catch {
      /* Malformed URL is not the connected page. */
    }
    if (!pageMatches) {
      this.ready = false;
      this.awaitingReady = false;
      this.clearHandshake();
      this.rejectAll('page-target-changed');
      this.state(false, 'page-target-changed');
      return;
    }
    if (data.type === 'layout-care/ready' && data.version === 1 && this.awaitingReady) {
      this.clearHandshake();
      this.awaitingReady = false;
      this.ready = true;
      this.state(true);
      return;
    }
    if (data.type !== 'layout-care/result' || typeof data.id !== 'string') return;
    const pending = this.pending.get(data.id);
    if (!pending || pending.generation !== this.generation || !this.ready) return;
    this.pending.delete(data.id);
    clearTimeout(pending.timer);
    if (data.ok !== true) {
      pending.reject(
        new Error(
          data.ok === false &&
            typeof data.error === 'string' &&
            data.error.length > 0 &&
            data.error.length <= 500
            ? data.error
            : 'invalid-response',
        ),
      );
      return;
    }
    let encoded: string;
    try {
      encoded = JSON.stringify(data.result);
    } catch {
      pending.reject(new Error('invalid-response'));
      return;
    }
    if (
      typeof encoded !== 'string' ||
      encoded.length > 200000 ||
      !this.validResult(pending, data.result)
    ) {
      pending.reject(new Error('invalid-response'));
      return;
    }
    pending.resolve(data.result);
  };
  private validResult(pending: Pending, result: unknown): boolean {
    if (!record(result)) return false;
    if (pending.method === 'highlight') return typeof result.highlighted === 'boolean';
    if (pending.method === 'cancelPick') return typeof result.cancelled === 'boolean';
    if (!isViewport(result.viewport) || !this.matchesFrameViewport(result.viewport)) return false;
    if (pending.method === 'pick')
      return (
        isEvidence(result.element) &&
        record(pending.payload) &&
        result.mode === pending.payload.mode &&
        ['change', 'protect'].includes(result.mode as string)
      );
    if (pending.method === 'scan') {
      return (
        Array.isArray(result.issues) &&
        result.issues.length <= REVIEW_LIMITS.issues &&
        result.issues.every(
          (issue) =>
            isIssue(issue) &&
            sameViewport(issue.viewport, result.viewport as { width: number; height: number }),
        ) &&
        new Set(result.issues.map((issue) => issue.id)).size === result.issues.length &&
        typeof result.documentWidth === 'number' &&
        Number.isFinite(result.documentWidth) &&
        result.documentWidth >= result.viewport.width &&
        result.documentWidth <= 1e7 &&
        typeof result.truncated === 'boolean'
      );
    }
    if (pending.method === 'recheck') {
      if (
        !Array.isArray(result.checks) ||
        result.checks.length > REVIEW_LIMITS.protections ||
        !result.checks.every(isProtectionCheck) ||
        !record(pending.payload) ||
        !Array.isArray(pending.payload.protections)
      )
        return false;
      const protections = pending.payload.protections as Protection[];
      if (
        result.checks.length !== protections.length ||
        new Set(result.checks.map((check) => check.id)).size !== result.checks.length
      )
        return false;
      return result.checks.every((check) => {
        const protection = protections.find((value) => value.id === check.id);
        return (
          !!protection &&
          sameEvidence(check.before, protection.element) &&
          (check.status !== 'unchanged' ||
            sameViewport(protection.viewport, result.viewport as { width: number; height: number }))
        );
      });
    }
    return false;
  }
  private matchesFrameViewport(viewport: { width: number; height: number }): boolean {
    const width = this.frame.clientWidth;
    const height = this.frame.clientHeight;
    // The document client width can exclude a vertical scrollbar.
    return (
      (!width || (viewport.width <= width && width - viewport.width <= 24)) &&
      (!height || Math.abs(viewport.height - height) <= 2)
    );
  }
  private correctTarget(): boolean {
    try {
      return localPageUrl(this.frame.src).href === this.target;
    } catch {
      return false;
    }
  }
  private clearHandshake(): void {
    clearInterval(this.handshakeTimer);
    clearTimeout(this.handshakeTimeout);
    this.handshakeTimer = undefined;
    this.handshakeTimeout = undefined;
  }
  private rejectAll(reason: string): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.awaitingReady = false;
    this.generation++;
    this.connectedSource = null;
    this.clearHandshake();
    this.rejectAll('disposed');
    window.removeEventListener('message', this.receive);
  }
}
