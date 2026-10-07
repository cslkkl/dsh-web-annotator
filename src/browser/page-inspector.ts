/** Data returned by one explicit, in-page annotation gesture. */
export interface BrowserAnnotation {
  /** Provider-captured viewport with the saved area marked; never part of DOM evidence. */
  readonly screenshot?: BrowserAnnotationImage;
  /** Requested CSS values for the precisely selected element. */
  readonly styleChanges?: Record<string, { before: string; after: string }>;
  readonly intent: 'comment' | 'question';
  readonly note: string;
  readonly url: string;
  readonly title: string;
  readonly viewport: { width: number; height: number };
  readonly selection: {
    kind: 'element' | 'region' | 'point';
    /** CSS pixels in the document, never substituted with a parent element. */
    rect: { x: number; y: number; width: number; height: number };
    viewportRect: { x: number; y: number; width: number; height: number };
    scroll: { x: number; y: number };
    candidates: BrowserAnnotationElement[];
  };
}

/** Bounded JPEG capture supplied by Browser, not by a visited page. */
export interface BrowserAnnotationImage {
  readonly mediaType: 'image/jpeg';
  readonly data: string;
  readonly width: number;
  readonly height: number;
}

/** Bounded DOM evidence; candidates do not redefine a point or region. */
export interface BrowserAnnotationElement {
  selector: string;
  shadowHosts: string[];
  matchCount: number;
  tag: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
  source?: string;
}

/** Copy and theme supplied by the owning Harness plugin, never by the page. */
export interface BrowserAnnotationOptions {
  readonly intent: 'comment' | 'question';
  readonly dark: boolean;
  readonly copy: {
    select: string;
    comment: string;
    question: string;
    placeholder: string;
    settings: string;
    save: string;
    cancel: string;
    parent: string;
    child: string;
    targetGone: string;
    empty: string;
    region: string;
    point: string;
    interact: string;
    color: string;
    background: string;
    opacity: string;
    font: string;
    fontSize: string;
    fontWeight: string;
    spacing: string;
    elementOnly: string;
    invalidStyle: string;
    applyStyles: string;
    styleHint: string;
  };
}

declare global {
  interface Window {
    __DSH_PAGE_ANNOTATION_CANCEL__?: () => void;
  }
}

/**
 * Run a bounded picker inside the inspected document. This function is self-contained
 * so Desktop can execute its compiled body in an approved guest, without a preload.
 * @param options - localized copy, initial intent, and host theme.
 * @returns the saved annotation, or a cancellation when no annotation was saved.
 */
export function annotatePage(
  options: BrowserAnnotationOptions,
): Promise<BrowserAnnotation | { cancelled: true }> {
  window.__DSH_PAGE_ANNOTATION_CANCEL__?.();
  const doc = document;
  const originalUrl = location.href;
  const originalFocus = doc.activeElement;
  const root = doc.createElement('div');
  root.setAttribute('data-dsh-page-annotation', '');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const shadow = root.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = `
    :host{all:initial;color-scheme:${options.dark ? 'dark' : 'light'}}
    *{box-sizing:border-box}
    .outline{position:fixed;pointer-events:none;border:2px solid #2979ff;border-radius:5px;background:#2979ff0c}
    .hint{position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:8px 12px;border-radius:8px;background:#181a20;color:#fff;font:13px/20px system-ui;max-width:calc(100vw - 24px);pointer-events:none}
    .editor,.options{position:fixed;pointer-events:auto;border:0;background:${options.dark ? '#292a2d' : '#fff'};color:${options.dark ? '#ededee' : '#303338'};box-shadow:0 0 0 .5px ${options.dark ? '#55565b' : '#dcdfe3'},0 2px 8px #00000014;font:14px/22px system-ui}
    .editor{border-radius:26px;corner-shape:round;padding:7px 8px;width:min(384px,calc(100vw - 24px));overflow:hidden;max-height:calc(100vh - 24px);display:flex;flex-direction:column}
    .editor.expanded{width:min(420px,calc(100vw - 24px));border-radius:24px;padding:0}
    .expanded>.row{padding:12px 14px;flex:none}
    .expanded>.row>.save{display:none}
    .expanded textarea{max-height:min(66px,20vh)}
    .editor:focus-within{box-shadow:0 0 0 .5px ${options.dark ? '#85868b' : '#bfc4cc'},0 2px 8px #00000014}
    .row{display:flex;align-items:center;gap:10px}
    button,select,textarea{font:inherit;color:inherit}
    button{border:0;border-radius:8px;padding:6px 8px;background:transparent;cursor:pointer;flex:none}
    button:disabled{opacity:.4;cursor:default}
    button:hover:not(:disabled){background:${options.dark ? '#3b3c40' : '#f0f1f3'}}
    button:focus-visible,select:focus-visible{outline:2px solid #2979ff;outline-offset:2px}
    .options-toggle,.save{display:flex;align-items:center;justify-content:center;padding:0;width:30px;height:30px;border-radius:50%;corner-shape:round}
    .options-toggle{color:${options.dark ? '#bdc0c5' : '#737880'}}
    .save,.save:disabled{background:${options.dark ? '#797c82' : '#a2a5a9'};color:#fff;opacity:1}
    .save:not(:disabled){background:${options.dark ? '#d2d3d6' : '#777c83'};color:${options.dark ? '#242529' : '#fff'}}
    .save:hover:not(:disabled){background:${options.dark ? '#eeeff1' : '#60656d'}}
    textarea{display:block;flex:1;width:100%;min-width:0;height:22px;max-height:110px;resize:none;border:0;background:transparent;padding:0;margin:0;outline:0;line-height:22px;overflow-y:auto}
    textarea::placeholder{color:${options.dark ? '#aaaeb5' : '#888e96'};opacity:1}
    .options{position:static;box-shadow:none;flex:1;min-height:0;overflow:auto;font-size:14px;line-height:22px;scrollbar-width:thin}
    .target-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 20px;background:${options.dark ? '#35363a' : '#f4f4f4'}}
    .target{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${options.dark ? '#c9ccd1' : '#656b73'}}
    .target-controls{display:flex;gap:2px;flex:none}
    .target-controls button{font-size:13px;padding:0;width:24px;height:24px}
    .properties{padding:12px 20px;display:grid;gap:10px}
    .property{display:grid;grid-template-columns:minmax(90px,1fr) minmax(0,180px);align-items:center;gap:12px;color:${options.dark ? '#c9ccd1' : '#6e747b'}}
    .field{display:flex;align-items:center;gap:9px;border:.5px solid ${options.dark ? '#57595f' : '#dedfe2'};border-radius:13px;padding:7px 10px;min-width:0}
    .field input{font:13px/20px ui-monospace,monospace;background:transparent;color:inherit;border:0;outline:0;width:100%;min-width:0}
    .field:focus-within{border-color:${options.dark ? '#a2a5ac' : '#a5a9b1'}}
    .swatch{width:22px;height:22px;border-radius:7px;flex:none;box-shadow:inset 0 0 0 .5px #8886}
    .intent{display:flex;align-items:center;justify-content:space-between;padding:0 20px 12px;gap:8px;font-size:13px;color:${options.dark ? '#c9ccd1' : '#6e747b'}}
    select{font:inherit;border:.5px solid ${options.dark ? '#57595f' : '#dedfe2'};background:transparent;border-radius:10px;padding:5px 8px;max-width:160px}
    .footer{border-top:.5px solid ${options.dark ? '#44464b' : '#eee'};display:flex;align-items:center;justify-content:space-between;padding:10px 12px;flex:none}
    .footer>.cancel{border:.5px solid ${options.dark ? '#55565b' : '#e5e6e9'};border-radius:20px;padding:6px 12px;font-size:13px}
    .style-hint{font-size:12px;line-height:18px;margin:3px 0;color:${options.dark ? '#adb1b8' : '#8a9097'}}
    .error{color:${options.dark ? '#ffb0a9' : '#b82920'};font-size:12px;padding:3px 40px 1px}
    .hidden{display:none!important}
  `;
  const outline = doc.createElement('div');
  outline.className = 'outline hidden';
  const hint = doc.createElement('div');
  hint.className = 'hint';
  hint.textContent = options.copy.select;
  const editor = doc.createElement('form');
  editor.className = 'editor hidden';
  editor.setAttribute('aria-label', options.copy.placeholder);
  const row = doc.createElement('div');
  row.className = 'row';
  // The injected picker reuses the shared SlidersTwoOutline and CheckOutline artwork.
  function icon(parts: readonly (readonly [string, Record<string, string>])[]) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [name, value] of Object.entries({
      width: '18',
      height: '18',
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.3',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    }))
      svg.setAttribute(name, value);
    for (const [tag, attributes] of parts) {
      const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
      svg.append(node);
    }
    return svg;
  }
  const settings = doc.createElement('button');
  settings.type = 'button';
  settings.className = 'options-toggle';
  settings.title = options.copy.settings;
  settings.setAttribute('aria-label', options.copy.settings);
  settings.setAttribute('aria-expanded', 'false');
  settings.setAttribute('aria-haspopup', 'dialog');
  settings.append(
    icon([
      ['path', { d: 'M2.3 5h5.85M12.05 5h1.65' }],
      ['circle', { cx: '9.95', cy: '5', r: '1.45' }],
      ['path', { d: 'M2.3 11h1.65M7.85 11h5.85' }],
      ['circle', { cx: '5.75', cy: '11', r: '1.45' }],
    ]),
  );
  const optionsPanel = doc.createElement('section');
  optionsPanel.className = 'options hidden';
  optionsPanel.setAttribute('role', 'dialog');
  optionsPanel.setAttribute('aria-label', options.copy.settings);
  const intentRow = doc.createElement('div');
  intentRow.className = 'intent';
  const intentLabel = doc.createElement('span');
  intentLabel.textContent = options.copy.comment + ' / ' + options.copy.question;
  const intent = doc.createElement('select');
  intent.setAttribute('aria-label', options.copy.comment + ' / ' + options.copy.question);
  for (const [value, label] of [
    ['comment', options.copy.comment],
    ['question', options.copy.question],
  ]) {
    const option = doc.createElement('option');
    option.value = value!;
    option.textContent = label!;
    intent.append(option);
  }
  intent.value = options.intent;
  const input = doc.createElement('textarea');
  input.placeholder = options.copy.placeholder;
  input.setAttribute('aria-label', options.copy.placeholder);
  input.maxLength = 1000;
  const save = doc.createElement('button');
  save.type = 'submit';
  save.className = 'save';
  save.disabled = true;
  save.append(
    icon([
      [
        'path',
        { d: 'M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4' },
      ],
    ]),
  );
  save.title = options.copy.save;
  save.setAttribute('aria-label', options.copy.save);
  row.append(settings, input, save);
  const targetLabel = doc.createElement('span');
  targetLabel.className = 'target';
  const controls = doc.createElement('div');
  controls.className = 'controls';
  function control(label: string, glyph: string) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.textContent = glyph + '  ' + label;
    controls.append(button);
    return button;
  }
  const parent = control(options.copy.parent, '↑');
  const child = control(options.copy.child, '↓');
  const cancel = control(options.copy.cancel, '×');
  const error = doc.createElement('div');
  error.className = 'error hidden';
  error.setAttribute('role', 'alert');
  intentRow.append(intentLabel, intent);
  const targetRow = doc.createElement('div');
  targetRow.className = 'target-row';
  controls.className = 'target-controls';
  cancel.remove();
  parent.textContent = '↑';
  child.textContent = '↓';
  targetRow.append(targetLabel, controls);
  const properties = doc.createElement('div');
  properties.className = 'properties';
  const styleHint = doc.createElement('p');
  styleHint.className = 'style-hint';
  const fields = new Map<
    string,
    { input: HTMLInputElement; before: string; swatch?: HTMLElement }
  >();
  for (const [property, label] of [
    ['color', options.copy.color],
    ['background-color', options.copy.background],
    ['opacity', options.copy.opacity],
    ['font-family', options.copy.font],
    ['font-size', options.copy.fontSize],
    ['font-weight', options.copy.fontWeight],
    ['gap', options.copy.spacing],
  ]) {
    const item = doc.createElement('label');
    item.className = 'property';
    const labelText = doc.createElement('span');
    labelText.textContent = label!;
    const field = doc.createElement('div');
    field.className = 'field';
    const value = doc.createElement('input');
    value.setAttribute('aria-label', label!);
    value.dataset.property = property;
    value.maxLength = 1000;
    let swatch: HTMLElement | undefined;
    if (property === 'color' || property === 'background-color') {
      swatch = doc.createElement('span');
      swatch.className = 'swatch';
      swatch.setAttribute('aria-hidden', 'true');
      field.append(swatch);
    }
    field.append(value);
    item.append(labelText, field);
    properties.append(item);
    fields.set(property!, { input: value, before: '', ...(swatch ? { swatch } : {}) });
  }
  properties.append(styleHint);
  const footer = doc.createElement('div');
  footer.className = 'footer hidden';
  cancel.className = 'cancel';
  cancel.textContent = options.copy.cancel;
  const expandedSave = save.cloneNode(true) as HTMLButtonElement;
  footer.append(cancel, expandedSave);
  optionsPanel.append(targetRow, properties, intentRow);
  editor.append(row, optionsPanel, error, footer);
  shadow.append(style, outline, hint, editor);
  const surface = doc.createElement('div');
  surface.style.cssText =
    'position:fixed;inset:0;pointer-events:auto;cursor:crosshair;touch-action:none';
  shadow.prepend(surface);
  doc.documentElement.append(root);

  let target: Element | null = null;
  let hovered: Element | null = null;
  let selection: {
    kind: 'element' | 'region' | 'point';
    rect: { x: number; y: number; width: number; height: number };
  } | null = null;
  let gesture: {
    id: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    dragging: boolean;
  } | null = null;
  let suspended = false;
  let suppressClick = false;
  const descendants: Element[] = [];
  let animation = 0;
  let ended = false;
  let settle!: (value: BrowserAnnotation | { cancelled: true }) => void;
  const result = new Promise<BrowserAnnotation | { cancelled: true }>((resolve) => {
    settle = resolve;
  });
  const lifecycle = new AbortController();
  function changes(): Record<string, { before: string; after: string }> {
    if (selection?.kind !== 'element') return {};
    return Object.fromEntries(
      [...fields].flatMap(([key, field]) => {
        let after = field.input.value.trim();
        if ((key === 'font-size' || key === 'gap') && /^\d+(\.\d+)?$/.test(after)) after += 'px';
        return after === field.before ? [] : [[key, { before: field.before, after }]];
      }),
    );
  }
  function refreshProperties(element: Element | null) {
    const computed = element ? getComputedStyle(element) : null;
    for (const [key, field] of fields) {
      field.before = computed?.getPropertyValue(key) || '';
      field.input.value = field.before;
      field.input.disabled = !element;
      if (field.swatch) field.swatch.style.background = field.before;
    }
    properties.classList.toggle('area', !element);
    for (const field of fields.values())
      field.input.closest('.property')?.classList.toggle('hidden', !element);
    styleHint.textContent = element ? options.copy.styleHint : options.copy.elementOnly;
  }
  for (const [key, field] of fields) {
    field.input.addEventListener(
      'input',
      () => {
        if (field.swatch && CSS.supports(key, field.input.value))
          field.swatch.style.background = field.input.value;
        intent.value = 'comment';
        error.classList.add('hidden');
        draw();
      },
      { signal: lifecycle.signal },
    );
    field.input.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
          event.preventDefault();
          event.stopPropagation();
          submit(event);
        }
      },
      { signal: lifecycle.signal },
    );
  }
  const observer = new ResizeObserver(draw);

  function finish(value: BrowserAnnotation | { cancelled: true }) {
    if (ended) return;
    ended = true;
    lifecycle.abort();
    cancelAnimationFrame(animation);
    observer.disconnect();
    root.remove();
    if (window.__DSH_PAGE_ANNOTATION_CANCEL__ === dismiss)
      delete window.__DSH_PAGE_ANNOTATION_CANCEL__;
    if (originalFocus instanceof HTMLElement && originalFocus.isConnected)
      originalFocus.focus({ preventScroll: true });
    settle(value);
  }
  function dismiss() {
    finish({ cancelled: true });
  }
  window.__DSH_PAGE_ANNOTATION_CANCEL__ = dismiss;
  function showError(message: string) {
    error.textContent = message;
    error.classList.remove('hidden');
  }
  function valid(element: Element | null): element is Element {
    return (
      !!element &&
      element !== doc.body &&
      element !== doc.documentElement &&
      !element.closest('[data-dsh-page-annotation]')
    );
  }
  function hit(x: number, y: number): Element | null {
    surface.style.pointerEvents = 'none';
    editor.style.pointerEvents = 'none';
    let node = doc.elementFromPoint(x, y);
    while (node?.shadowRoot) {
      const inner = node.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === node) break;
      node = inner;
    }
    surface.style.pointerEvents = suspended ? 'none' : 'auto';
    editor.style.pointerEvents = 'auto';
    return valid(node) ? node : null;
  }
  function rectInDocument(element: Element) {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
  }
  function gestureRect(x: number, y: number) {
    return {
      x: Math.min(gesture!.x, x),
      y: Math.min(gesture!.y, y),
      width: Math.max(1, Math.abs(x - gesture!.x)),
      height: Math.max(1, Math.abs(y - gesture!.y)),
    };
  }
  function selector(element: Element): string {
    const scope = element.getRootNode() as Document | ShadowRoot;
    if (element.id) {
      const id = '#' + CSS.escape(element.id);
      if (scope.querySelectorAll(id).length === 1) return id;
    }
    const pieces: string[] = [];
    let node: Element | null = element;
    while (node) {
      let part = node.localName;
      const peers = node.parentElement
        ? Array.from(node.parentElement.children).filter((x) => x.localName === node!.localName)
        : [];
      if (peers.length > 1) part += `:nth-of-type(${peers.indexOf(node) + 1})`;
      pieces.unshift(part);
      const path = pieces.join(' > ');
      if (scope.querySelectorAll(path).length === 1 && scope.querySelector(path) === element)
        return path;
      node = node.parentElement;
    }
    return pieces.join(' > ');
  }
  function locator(element: Element) {
    const shadowHosts: string[] = [];
    let scope = element.getRootNode();
    while (scope instanceof ShadowRoot) {
      shadowHosts.unshift(selector(scope.host));
      scope = scope.host.getRootNode();
    }
    return {
      selector: selector(element),
      shadowHosts,
      matchCount: (element.getRootNode() as Document | ShadowRoot).querySelectorAll(
        selector(element),
      ).length,
    };
  }
  function draw() {
    if (ended) return;
    if (location.href !== originalUrl) {
      dismiss();
      return;
    }
    if (suspended) return;
    const node = target || hovered;
    if (selection?.kind === 'element' && !target?.isConnected) {
      outline.classList.add('hidden');
      showError(options.copy.targetGone);
      save.disabled = expandedSave.disabled = true;
      return;
    }
    save.disabled = expandedSave.disabled =
      !selection || (!input.value.trim() && !Object.keys(changes()).length);
    const documentRect =
      selection?.kind === 'element' && target
        ? rectInDocument(target)
        : selection?.rect || (node?.isConnected ? rectInDocument(node) : null);
    if (!documentRect) {
      outline.classList.add('hidden');
      return;
    }
    const rect = {
      left: documentRect.x - scrollX,
      top: documentRect.y - scrollY,
      width: documentRect.width,
      height: documentRect.height,
      bottom: documentRect.y - scrollY + documentRect.height,
    };
    outline.classList.remove('hidden');
    Object.assign(outline.style, {
      left: `${rect.left - (selection?.kind === 'point' ? 5 : 0)}px`,
      top: `${rect.top - (selection?.kind === 'point' ? 5 : 0)}px`,
      width: `${selection?.kind === 'point' ? 10 : rect.width}px`,
      height: `${selection?.kind === 'point' ? 10 : rect.height}px`,
      borderStyle: selection?.kind === 'region' ? 'dashed' : 'solid',
    });
    if (editor.classList.contains('hidden')) return;
    const width = editor.getBoundingClientRect().width;
    const height = editor.getBoundingClientRect().height;
    const left = Math.max(12, Math.min(rect.left, innerWidth - width - 12));
    const below = rect.bottom + 8;
    const above = rect.top - height - 8;
    const top = Math.max(
      12,
      Math.min(
        below + height <= innerHeight - 12 ? below : above >= 12 ? above : rect.top + 8,
        innerHeight - height - 12,
      ),
    );
    Object.assign(editor.style, { left: `${left}px`, top: `${top}px` });
  }
  function setOptions(open: boolean, restoreFocus = false) {
    optionsPanel.classList.toggle('hidden', !open);
    editor.classList.toggle('expanded', open);
    footer.classList.toggle('hidden', !open);
    settings.setAttribute('aria-expanded', String(open));
    draw();
    if (open) settings.focus({ preventScroll: true });
    else if (restoreFocus) settings.focus({ preventScroll: true });
  }
  settings.addEventListener(
    'click',
    () => {
      setOptions(optionsPanel.classList.contains('hidden'));
    },
    { signal: lifecycle.signal },
  );
  intent.addEventListener(
    'change',
    () => {
      setOptions(false);
      input.focus({ preventScroll: true });
    },
    { signal: lifecycle.signal },
  );
  input.addEventListener(
    'input',
    () => {
      input.style.height = '22px';
      input.style.height = `${Math.min(110, input.scrollHeight)}px`;
      error.classList.add('hidden');
      draw();
    },
    { signal: lifecycle.signal },
  );
  function track() {
    draw();
    if (!ended) animation = requestAnimationFrame(track);
  }
  function choose(element: Element) {
    if (!valid(element)) return;
    observer.disconnect();
    target = element;
    selection = { kind: 'element', rect: rectInDocument(element) };
    observer.observe(element);
    hint.classList.add('hidden');
    editor.classList.remove('hidden');
    error.classList.add('hidden');
    const where = locator(element);
    targetLabel.textContent = `<${element.localName}>`;
    targetLabel.title = [...where.shadowHosts, where.selector].join(' › ');
    refreshProperties(element);
    parent.disabled =
      !valid(element.parentElement) && !(element.getRootNode() instanceof ShadowRoot);
    child.disabled = descendants.length === 0;
    draw();
    if (!animation) animation = requestAnimationFrame(track);
    input.focus({ preventScroll: true });
  }
  function chooseArea(
    kind: 'region' | 'point',
    rect: { x: number; y: number; width: number; height: number },
  ) {
    observer.disconnect();
    target = null;
    selection = { kind, rect };
    hint.classList.add('hidden');
    editor.classList.remove('hidden');
    error.classList.add('hidden');
    targetLabel.textContent =
      kind === 'region'
        ? `${options.copy.region} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`
        : options.copy.point;
    parent.disabled = child.disabled = true;
    targetLabel.title = '';
    refreshProperties(null);
    draw();
    if (!animation) animation = requestAnimationFrame(track);
    input.focus({ preventScroll: true });
  }
  function isOverlay(event: Event) {
    return event.composedPath().includes(root);
  }
  window.addEventListener(
    'pointermove',
    (event) => {
      if (suspended || !editor.classList.contains('hidden')) return;
      if (gesture && gesture.id === event.pointerId) {
        gesture.dragging ||=
          Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) >= 5;
        if (gesture.dragging) {
          selection = {
            kind: 'region',
            rect: gestureRect(event.clientX + scrollX, event.clientY + scrollY),
          };
          draw();
          return;
        }
      }
      const node = hit(event.clientX, event.clientY);
      hovered = event.shiftKey && valid(node?.parentElement || null) ? node!.parentElement : node;
      draw();
    },
    { capture: true, signal: lifecycle.signal },
  );
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (suspended) {
        suppressClick = false;
        return;
      }
      if (isOverlay(event) && !event.composedPath().includes(surface)) return;
      setOptions(false);
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = true;
      if (event.button !== 0 || !editor.classList.contains('hidden')) return;
      gesture = {
        id: event.pointerId,
        x: event.clientX + scrollX,
        y: event.clientY + scrollY,
        clientX: event.clientX,
        clientY: event.clientY,
        dragging: false,
      };
      surface.setPointerCapture(event.pointerId);
    },
    { capture: true, signal: lifecycle.signal },
  );
  window.addEventListener(
    'pointerup',
    (event) => {
      if (!gesture || gesture.id !== event.pointerId || suspended) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const current = gesture;
      const area = gestureRect(event.clientX + scrollX, event.clientY + scrollY);
      gesture = null;
      if (surface.hasPointerCapture(event.pointerId))
        surface.releasePointerCapture(event.pointerId);
      if (
        current.dragging ||
        Math.hypot(event.clientX - current.clientX, event.clientY - current.clientY) >= 5
      )
        chooseArea('region', area);
      else {
        const node = hit(event.clientX, event.clientY);
        descendants.length = 0;
        if (node) choose(event.shiftKey && valid(node.parentElement) ? node.parentElement : node);
        else
          chooseArea('point', {
            x: event.clientX + scrollX,
            y: event.clientY + scrollY,
            width: 0,
            height: 0,
          });
      }
    },
    { capture: true, signal: lifecycle.signal },
  );
  function abortGesture() {
    if (!gesture) return;
    if (surface.hasPointerCapture(gesture.id)) surface.releasePointerCapture(gesture.id);
    gesture = null;
    if (editor.classList.contains('hidden')) selection = null;
    draw();
  }
  window.addEventListener('pointercancel', abortGesture, {
    capture: true,
    signal: lifecycle.signal,
  });
  window.addEventListener(
    'click',
    (event) => {
      if (isOverlay(event) && !event.composedPath().includes(surface)) return;
      if (suspended && !suppressClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    },
    { capture: true, signal: lifecycle.signal },
  );
  function resume() {
    if (!suspended) return;
    suspended = false;
    surface.style.pointerEvents = 'auto';
    hint.textContent = options.copy.select;
    if (selection) {
      editor.classList.remove('hidden');
      hint.classList.add('hidden');
    } else hint.classList.remove('hidden');
    draw();
  }
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (optionsPanel.classList.contains('hidden')) dismiss();
        else setOptions(false, true);
        return;
      }
      // The comment editor owns spaces. The page receives normal keys while suspended.
      if (isOverlay(event) && !event.composedPath().includes(surface)) return;
      if (event.code === 'Space' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        abortGesture();
        suspended = true;
        setOptions(false);
        surface.style.pointerEvents = 'none';
        outline.classList.add('hidden');
        editor.classList.add('hidden');
        hint.classList.remove('hidden');
        hint.textContent = options.copy.interact;
      } else if (!suspended && !isOverlay(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true, signal: lifecycle.signal },
  );
  window.addEventListener(
    'keyup',
    (event) => {
      if (event.code === 'Space' && suspended) {
        event.preventDefault();
        event.stopImmediatePropagation();
        resume();
      }
    },
    { capture: true, signal: lifecycle.signal },
  );
  window.addEventListener(
    'blur',
    () => {
      abortGesture();
      resume();
    },
    { signal: lifecycle.signal },
  );
  doc.addEventListener(
    'visibilitychange',
    () => {
      if (doc.hidden) {
        abortGesture();
        resume();
      }
    },
    { signal: lifecycle.signal },
  );
  window.addEventListener('pagehide', dismiss, { once: true, signal: lifecycle.signal });
  parent.addEventListener(
    'click',
    () => {
      if (!target) return;
      const scope = target.getRootNode();
      const node = target.parentElement || (scope instanceof ShadowRoot ? scope.host : null);
      if (valid(node)) {
        setOptions(false);
        descendants.push(target);
        choose(node);
      }
    },
    { signal: lifecycle.signal },
  );
  child.addEventListener(
    'click',
    () => {
      const node = descendants.pop();
      if (node?.isConnected) {
        setOptions(false);
        choose(node);
      }
    },
    { signal: lifecycle.signal },
  );
  cancel.addEventListener('click', dismiss, { signal: lifecycle.signal });
  function evidence(element: Element): BrowserAnnotationElement {
    const where = locator(element);
    const computed = getComputedStyle(element);
    const styles: Record<string, string> = {};
    for (const name of [
      'display',
      'position',
      'font-size',
      'font-family',
      'color',
      'background-color',
      'padding',
      'margin',
      'gap',
      'opacity',
      'font-weight',
    ])
      styles[name] = computed.getPropertyValue(name).slice(0, 1000);
    const source = element
      .closest('[data-web-annotator-source]')
      ?.getAttribute('data-web-annotator-source')
      ?.slice(0, 1000);
    return {
      ...where,
      tag: element.localName,
      text: (element instanceof HTMLElement ? element.innerText : element.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400),
      rect: rectInDocument(element),
      styles,
      ...(source ? { source } : {}),
    };
  }
  function candidates(rect: { x: number; y: number; width: number; height: number }) {
    const found = new Set<Element>();
    // Bounded samples also reach open Shadow DOM and avoid scanning the whole page.
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 5; col++) {
        const node = hit(
          rect.x - scrollX + (rect.width * (col + 0.5)) / 5,
          rect.y - scrollY + (rect.height * (row + 0.5)) / 5,
        );
        if (node) found.add(node);
      }
    return [...found].slice(0, 12).map(evidence);
  }
  function submit(event: Event) {
    event.preventDefault();
    if (
      !selection ||
      (selection.kind === 'element' && !target?.isConnected) ||
      location.href !== originalUrl
    ) {
      showError(options.copy.targetGone);
      return;
    }
    const styleChanges = changes();
    for (const [property, { after }] of Object.entries(styleChanges)) {
      if (
        !CSS.supports(property, after) ||
        (property === 'opacity' && !(Number(after) >= 0 && Number(after) <= 1))
      ) {
        showError(options.copy.invalidStyle);
        setOptions(true);
        fields.get(property)?.input.focus();
        return;
      }
    }
    if (!input.value.trim() && !Object.keys(styleChanges).length) {
      showError(options.copy.empty);
      input.focus();
      return;
    }
    const rect = selection.kind === 'element' ? rectInDocument(target!) : selection.rect;
    const items = selection.kind === 'element' ? [evidence(target!)] : candidates(rect);
    finish({
      intent: intent.value === 'question' ? 'question' : 'comment',
      note: input.value.trim() || options.copy.applyStyles,
      ...(Object.keys(styleChanges).length ? { styleChanges } : {}),
      url: originalUrl,
      title: doc.title.slice(0, 300),
      viewport: { width: innerWidth, height: innerHeight },
      selection: {
        kind: selection.kind,
        rect,
        viewportRect: { ...rect, x: rect.x - scrollX, y: rect.y - scrollY },
        scroll: { x: scrollX, y: scrollY },
        candidates: items,
      },
    });
  }
  editor.addEventListener('submit', submit, { signal: lifecycle.signal });
  input.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        event.stopPropagation();
        submit(event);
      }
    },
    { signal: lifecycle.signal },
  );
  animation = requestAnimationFrame(track);
  return result;
}
