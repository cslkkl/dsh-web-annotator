import '../browser/bridge';
import type { BridgeMethod, BridgeResponse, PickResult } from '../shared/types.js';
import {
  checkedQuery,
  getViewport,
  OVERLAY_ATTRIBUTE,
  recheckProtections,
  scanDocument,
  snapshotElement,
} from './dom.js';
import { isAllowedParentOrigin, isPlainRecord, validToken } from './logic.js';

declare global {
  interface Window {
    __LAYOUT_CARE_CONFIG__?: { allowedParentOrigins?: string[] };
    __LAYOUT_CARE_BRIDGE_DISPOSE__?: () => void;
  }
}

const METHODS = new Set<BridgeMethod>(['scan', 'pick', 'highlight', 'recheck', 'cancelPick']);

/** Shift-click selects the containing element, without expanding to the entire document. */
export function pickTarget(
  element: Element | null,
  selectParent: boolean,
  doc: Pick<Document, 'body' | 'documentElement'>,
): Element | null {
  if (!element || !selectParent) return element;
  const parent = element.parentElement;
  return parent && parent !== doc.body && parent !== doc.documentElement ? parent : element;
}

/** Install the development-page bridge. Disposal removes every listener, overlay and timer. */
export function installBridge(win: Window): () => void {
  const doc = win.document;
  let binding: { origin: string; token: string } | null = null;
  let disposed = false;
  let overlay: HTMLElement | null = null;
  let box: HTMLElement | null = null;
  let banner: HTMLElement | null = null;
  let highlighted: Element | null = null;
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  let activePick: {
    mode: 'change' | 'protect';
    resolve: (result: PickResult) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;
  const inFlight = new Set<string>();
  const configuredOrigins = Array.isArray(win.__LAYOUT_CARE_CONFIG__?.allowedParentOrigins)
    ? win
        .__LAYOUT_CARE_CONFIG__!.allowedParentOrigins!.filter((value) => typeof value === 'string')
        .slice(0, 30)
    : [];

  function ensureOverlay() {
    if (overlay) return;
    overlay = doc.createElement('div');
    overlay.setAttribute(OVERLAY_ATTRIBUTE, '');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const shadow = overlay.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent =
      ':host{all:initial}*{box-sizing:border-box}.box{position:fixed;display:none;border:2px solid #2563eb;background:rgba(37,99,235,.07);pointer-events:none}.banner{position:fixed;top:12px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 24px);padding:10px 16px;border-radius:8px;color:#fff;background:#172033;font:13px/1.5 system-ui,sans-serif;box-shadow:0 2px 14px #0003;pointer-events:none}';
    box = doc.createElement('div');
    box.className = 'box';
    banner = doc.createElement('div');
    banner.className = 'banner';
    banner.style.display = 'none';
    shadow.append(style, box, banner);
    doc.documentElement.append(overlay);
  }

  function drawHighlight() {
    if (!box || !highlighted?.isConnected) {
      if (box) box.style.display = 'none';
      return;
    }
    const rect = highlighted.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    box.style.borderColor = activePick?.mode === 'protect' ? '#15803d' : '#2563eb';
  }

  function clearHighlight() {
    highlighted = null;
    if (box) box.style.display = 'none';
  }

  function endPick(error?: Error, element?: Element) {
    const pick = activePick;
    if (!pick) return;
    activePick = null;
    clearTimeout(pick.timeout);
    if (banner) banner.style.display = 'none';
    clearHighlight();
    if (error) pick.reject(error);
    else if (element) {
      try {
        pick.resolve({
          mode: pick.mode,
          element: snapshotElement(element, win),
          viewport: getViewport(win),
        });
      } catch (captureError) {
        pick.reject(captureError instanceof Error ? captureError : new Error('无法读取选中元素。'));
      }
    } else pick.reject(new Error('元素选择已取消。'));
  }

  function pickElement(mode: 'change' | 'protect'): Promise<PickResult> {
    endPick(new Error('已开始新的元素选择，前一次选择已取消。'));
    clearTimeout(highlightTimer);
    ensureOverlay();
    banner!.textContent =
      mode === 'protect'
        ? '点击需要保留的区域 · Shift + 点击选择父级 · Esc 取消'
        : '点击需要修改的元素 · Shift + 点击选择父级 · Esc 取消';
    banner!.style.display = 'block';
    return new Promise((resolve, reject) => {
      activePick = {
        mode,
        resolve,
        reject,
        timeout: setTimeout(() => endPick(new Error('选择超时，请重新开始。')), 59000),
      };
    });
  }

  function eventElement(event: Event): Element | null {
    const candidate = event.composedPath()[0];
    return candidate instanceof Element &&
      candidate !== doc.documentElement &&
      candidate !== doc.body &&
      !candidate.closest(`[${OVERLAY_ATTRIBUTE}]`)
      ? candidate
      : null;
  }
  function onPointerMove(event: PointerEvent) {
    if (!activePick) return;
    highlighted = pickTarget(eventElement(event), event.shiftKey, doc);
    drawHighlight();
  }
  function onPointerDown(event: PointerEvent) {
    if (!activePick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function onClick(event: MouseEvent) {
    if (!activePick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const element = pickTarget(eventElement(event), event.shiftKey, doc);
    if (element) endPick(undefined, element);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (!activePick || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    endPick(new Error('元素选择已取消。'));
  }

  function send(id: string, success: boolean, value: unknown, requestBinding = binding) {
    if (!requestBinding || disposed) return;
    const response: BridgeResponse = success
      ? {
          type: 'layout-care/result',
          token: requestBinding.token,
          id,
          pageUrl: win.location.href,
          ok: true,
          result: value as Extract<BridgeResponse, { ok: true }>['result'],
        }
      : {
          type: 'layout-care/result',
          token: requestBinding.token,
          id,
          pageUrl: win.location.href,
          ok: false,
          error: (value instanceof Error ? value.message : String(value)).slice(0, 500),
        };
    win.parent.postMessage(response, requestBinding.origin);
  }

  async function execute(method: BridgeMethod, payload: unknown): Promise<unknown> {
    if (!isPlainRecord(payload)) throw new Error('请求参数必须为对象。');
    switch (method) {
      case 'scan':
        return scanDocument(win, payload.ignoreSelectors);
      case 'pick': {
        if (payload.mode !== 'change' && payload.mode !== 'protect')
          throw new Error('未知的选择模式。');
        return pickElement(payload.mode);
      }
      case 'highlight': {
        const matches = checkedQuery(doc, payload.selector);
        if (matches.length !== 1)
          throw new Error(matches.length ? '选择器匹配多个元素，无法高亮。' : '目标元素已找不到。');
        ensureOverlay();
        highlighted = matches[0]!;
        drawHighlight();
        highlighted.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        drawHighlight();
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(clearHighlight, 4000);
        return { highlighted: true };
      }
      case 'recheck':
        return { checks: recheckProtections(win, payload.protections), viewport: getViewport(win) };
      case 'cancelPick': {
        const cancelled = !!activePick;
        endPick(new Error('元素选择已取消。'));
        return { cancelled };
      }
    }
  }

  function onMessage(event: MessageEvent) {
    if (disposed || win.parent === win || event.source !== win.parent || !isPlainRecord(event.data))
      return;
    const data = event.data;
    if (data.type === 'layout-care/connect') {
      if (!validToken(data.token) || !isAllowedParentOrigin(event.origin, configuredOrigins))
        return;
      if (binding && binding.origin !== event.origin) return;
      if (binding && binding.token !== data.token) {
        // The same trusted parent can restart a connection after iframe load or HMR.
        endPick(new Error('连接已更新，前一次元素选择已取消。'));
        clearTimeout(highlightTimer);
        clearHighlight();
        inFlight.clear();
      }
      binding = { origin: event.origin, token: data.token };
      win.parent.postMessage(
        { type: 'layout-care/ready', token: data.token, version: 1, pageUrl: win.location.href },
        event.origin,
      );
      return;
    }
    if (
      !binding ||
      event.origin !== binding.origin ||
      data.token !== binding.token ||
      data.type !== 'layout-care/request'
    )
      return;
    if (typeof data.id !== 'string' || !data.id.length || data.id.length > 100) return;
    if (!METHODS.has(data.method as BridgeMethod)) {
      send(data.id, false, new Error('未知的桥接方法。'));
      return;
    }
    const requestBinding = binding;
    const key = `${requestBinding.token}:${data.id}`;
    if (inFlight.has(key)) return;
    if (inFlight.size >= 10) {
      send(data.id, false, new Error('待处理请求过多。'));
      return;
    }
    inFlight.add(key);
    void execute(data.method as BridgeMethod, data.payload)
      .then(
        (value) => send(data.id as string, true, value, requestBinding),
        (error) => send(data.id as string, false, error, requestBinding),
      )
      .finally(() => inFlight.delete(key));
  }

  win.addEventListener('message', onMessage);
  win.addEventListener('pointermove', onPointerMove, true);
  win.addEventListener('pointerdown', onPointerDown, true);
  win.addEventListener('click', onClick, true);
  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('scroll', drawHighlight, true);
  win.addEventListener('resize', drawHighlight);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    endPick(new Error('页面桥已关闭。'));
    clearTimeout(highlightTimer);
    win.removeEventListener('message', onMessage);
    win.removeEventListener('pointermove', onPointerMove, true);
    win.removeEventListener('pointerdown', onPointerDown, true);
    win.removeEventListener('click', onClick, true);
    win.removeEventListener('keydown', onKeyDown, true);
    win.removeEventListener('scroll', drawHighlight, true);
    win.removeEventListener('resize', drawHighlight);
    win.removeEventListener('pagehide', dispose);
    overlay?.remove();
    overlay = box = banner = null;
    binding = null;
    inFlight.clear();
    if (win.__LAYOUT_CARE_BRIDGE_DISPOSE__ === dispose) delete win.__LAYOUT_CARE_BRIDGE_DISPOSE__;
  };
  win.addEventListener('pagehide', dispose);
  return dispose;
}

if (typeof window !== 'undefined') {
  window.__LAYOUT_CARE_BRIDGE_DISPOSE__?.();
  window.__LAYOUT_CARE_BRIDGE_DISPOSE__ = installBridge(window);
}
