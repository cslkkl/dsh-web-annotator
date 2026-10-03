import assert from 'node:assert/strict';
import test from 'node:test';
import { PageBridge } from '../src/client/bridge-client';
import type { ElementEvidence } from '../src/shared/types';

const url = 'http://127.0.0.1:4177/page?mode=preview';
const origin = 'http://127.0.0.1:4177';
const viewport = { width: 390, height: 844 };
const element: ElementEvidence = {
  selector: '#card',
  tag: 'article',
  text: 'card',
  rect: { x: 16, y: 80, width: 560, height: 200 },
  styles: { color: 'rgb(0, 0, 0)' },
};

function environment() {
  const messages: Record<string, unknown>[] = [];
  const source = {
    postMessage: (message: Record<string, unknown>, target: string) => {
      assert.equal(target, origin);
      messages.push(message);
    },
  };
  const events = new EventTarget();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  const frame = {
    src: url,
    contentWindow: source,
    clientWidth: 390,
    clientHeight: 844,
  } as unknown as HTMLIFrameElement;
  function emit(data: unknown, from: unknown = source, fromOrigin = origin) {
    const event = new Event('message');
    const message = data && typeof data === 'object' ? { pageUrl: url, ...data } : data;
    Object.defineProperties(event, {
      data: { value: message },
      source: { value: from },
      origin: { value: fromOrigin },
    });
    events.dispatchEvent(event);
  }
  function restore() {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
  return { messages, frame, source, emit, restore };
}

test('parent accepts results only from the active iframe, exact origin and current token', async () => {
  const env = environment();
  const states: boolean[] = [];
  const bridge = new PageBridge(env.frame, url, (ready) => states.push(ready));
  try {
    bridge.connect();
    const token = env.messages[0]!.token;
    env.emit({ type: 'layout-care/ready', token, version: 1 }, {});
    env.emit({ type: 'layout-care/ready', token, version: 1 }, env.source, 'http://127.0.0.1:4178');
    assert.deepEqual(states, [false]);
    env.emit({ type: 'layout-care/ready', token, version: 1 });
    const pending = bridge.request('scan', { ignoreSelectors: [] });
    const request = env.messages.at(-1)!;
    const response = {
      type: 'layout-care/result',
      token,
      id: request.id,
      ok: true,
      result: { issues: [], viewport, documentWidth: 390, truncated: false },
    };
    env.emit({ ...response, token: 'wrong' });
    env.emit(response, {});
    env.emit(response, env.source, 'http://127.0.0.1:4178');
    env.emit(response);
    assert.deepEqual(await pending, response.result);
    env.emit({ type: 'layout-care/ready', token, version: 1 });
    assert.deepEqual(states, [false, true]);
  } finally {
    bridge.dispose();
    env.restore();
  }
});

test('reload rejects pending requests and old-token ready responses cannot revive a new generation', async () => {
  const env = environment();
  const states: boolean[] = [];
  const bridge = new PageBridge(env.frame, url, (ready) => states.push(ready));
  try {
    bridge.connect();
    const oldToken = env.messages[0]!.token;
    env.emit({ type: 'layout-care/ready', token: oldToken, version: 1 });
    const pending = bridge.request('scan', { ignoreSelectors: [] });
    const rejection = assert.rejects(pending, /page-reloaded/);
    bridge.connect();
    await rejection;
    env.emit({ type: 'layout-care/ready', token: oldToken, version: 1 });
    assert.deepEqual(states, [false, true, false]);
  } finally {
    bridge.dispose();
    env.restore();
  }
});

test('late ready after handshake timeout and callbacks after disposal never reactivate connection', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const env = environment();
  const states: { ready: boolean; error?: string }[] = [];
  const bridge = new PageBridge(env.frame, url, (ready, error) => states.push({ ready, error }));
  try {
    bridge.connect();
    const token = env.messages[0]!.token;
    context.mock.timers.tick(7001);
    env.emit({ type: 'layout-care/ready', token, version: 1 });
    assert.deepEqual(states, [
      { ready: false, error: undefined },
      { ready: false, error: 'bridge-unavailable' },
    ]);
    bridge.dispose();
    context.mock.timers.tick(10000);
    assert.equal(states.length, 2);
  } finally {
    bridge.dispose();
    env.restore();
  }
});

test('disposal inside the connecting callback prevents all handshake timers and sends', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const env = environment();
  const bridge = new PageBridge(env.frame, url, () => bridge.dispose());
  try {
    bridge.connect();
    context.mock.timers.tick(20000);
    assert.equal(env.messages.length, 0);
  } finally {
    bridge.dispose();
    env.restore();
  }
});

test('responses reject mismatched viewport, wrong pick mode, malformed source and contradictory checks', async () => {
  const env = environment();
  const bridge = new PageBridge(env.frame, url, () => {});
  try {
    bridge.connect();
    const token = env.messages[0]!.token;
    env.emit({ type: 'layout-care/ready', token, version: 1 });
    const cases: { method: 'scan' | 'pick' | 'recheck'; payload: object; result: object }[] = [
      {
        method: 'scan',
        payload: { ignoreSelectors: [] },
        result: {
          issues: [],
          viewport: { width: 1280, height: 844 },
          documentWidth: 1280,
          truncated: false,
        },
      },
      {
        method: 'pick',
        payload: { mode: 'protect' },
        result: { mode: 'change', element, viewport },
      },
      {
        method: 'pick',
        payload: { mode: 'change' },
        result: {
          mode: 'change',
          element: { ...element, source: { file: '../secret', line: 1, column: 1 } },
          viewport,
        },
      },
      {
        method: 'recheck',
        payload: { protections: [{ id: 'p1', label: 'card', element, viewport }] },
        result: {
          viewport,
          checks: [
            {
              id: 'p1',
              status: 'unchanged',
              before: element,
              after: { ...element, text: 'changed' },
              changes: [],
            },
          ],
        },
      },
    ];
    for (const item of cases) {
      const promise = bridge.request(item.method, item.payload);
      const rejection = assert.rejects(promise, /invalid-response/);
      env.emit({
        type: 'layout-care/result',
        token,
        id: env.messages.at(-1)!.id,
        ok: true,
        result: item.result,
      });
      await rejection;
    }
  } finally {
    bridge.dispose();
    env.restore();
  }
});

test('changing the complete target URL invalidates an existing connection before sending requests', async () => {
  const env = environment();
  const states: string[] = [];
  const bridge = new PageBridge(env.frame, url, (_, error) => {
    if (error) states.push(error);
  });
  try {
    bridge.connect();
    const token = env.messages[0]!.token;
    env.emit({ type: 'layout-care/ready', token, version: 1 });
    env.frame.src = 'http://127.0.0.1:4177/other';
    await assert.rejects(bridge.request('scan', { ignoreSelectors: [] }), /page-target-changed/);
    assert.deepEqual(states, ['page-target-changed']);
    assert.equal(env.messages.length, 1);
  } finally {
    bridge.dispose();
    env.restore();
  }
});

test('actual page navigation invalidates the connection even when the iframe src attribute is unchanged', async () => {
  const env = environment();
  const states: string[] = [];
  const bridge = new PageBridge(env.frame, url, (_, error) => {
    if (error) states.push(error);
  });
  try {
    bridge.connect();
    const token = env.messages[0]!.token;
    env.emit({ type: 'layout-care/ready', token, version: 1 });
    const pending = bridge.request('scan', { ignoreSelectors: [] });
    const rejected = assert.rejects(pending, /page-target-changed/);
    env.emit({
      type: 'layout-care/result',
      pageUrl: 'http://127.0.0.1:4177/other',
      token,
      id: env.messages.at(-1)!.id,
      ok: true,
      result: { issues: [], viewport, documentWidth: 390, truncated: false },
    });
    await rejected;
    assert.deepEqual(states, ['page-target-changed']);
    await assert.rejects(bridge.request('scan', { ignoreSelectors: [] }), /bridge-unavailable/);
  } finally {
    bridge.dispose();
    env.restore();
  }
});
