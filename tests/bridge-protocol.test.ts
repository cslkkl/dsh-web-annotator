import assert from 'node:assert/strict';
import test from 'node:test';
import { installBridge, pickTarget } from '../src/bridge/index.js';

function environment() {
  const messages: { message: unknown; origin: string }[] = [];
  const parent = {
    postMessage(message: unknown, origin: string) {
      messages.push({ message, origin });
    },
  };
  const events = new EventTarget();
  const node = () => ({
    style: {},
    setAttribute() {},
    append() {},
    attachShadow() {
      return { append() {} };
    },
    remove() {},
  });
  const win = Object.assign(events, {
    parent,
    document: { createElement: node, documentElement: node() },
    location: { href: 'http://127.0.0.1:4177/' },
  }) as unknown as Window;
  function message(data: unknown, origin = 'http://localhost:5140', source: unknown = parent) {
    const event = new Event('message');
    Object.defineProperties(event, {
      data: { value: data },
      origin: { value: origin },
      source: { value: source },
    });
    events.dispatchEvent(event);
  }
  return { win, parent, messages, message };
}
const token = 'bridge-test-token-1234567890';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('Shift selection chooses the containing card and never expands to body or documentElement', () => {
  const body = {} as HTMLElement;
  const documentElement = {} as HTMLElement;
  const doc = { body, documentElement };
  const card = { parentElement: body } as unknown as Element;
  const artwork = { parentElement: card } as unknown as Element;
  const rootChild = { parentElement: documentElement } as unknown as Element;
  assert.equal(pickTarget(artwork, false, doc), artwork);
  assert.equal(pickTarget(artwork, true, doc), card);
  assert.equal(pickTarget(card, true, doc), card);
  assert.equal(pickTarget(rootChild, true, doc), rootChild);
  assert.equal(pickTarget(null, true, doc), null);
});

test('handshake rejects foreign sources and origins, permits token rotation only from the same bound parent and origin', () => {
  const env = environment();
  const dispose = installBridge(env.win);
  env.message({ type: 'layout-care/connect', token }, 'http://localhost:5140', {});
  env.message({ type: 'layout-care/connect', token }, 'https://attacker.example');
  assert.equal(env.messages.length, 0);
  env.message({ type: 'layout-care/connect', token });
  assert.deepEqual(env.messages[0], {
    message: { type: 'layout-care/ready', token, version: 1, pageUrl: 'http://127.0.0.1:4177/' },
    origin: 'http://localhost:5140',
  });
  env.message({ type: 'layout-care/connect', token: 'replacement-token-123456789' });
  env.message({ type: 'layout-care/connect', token }, 'http://localhost:5141');
  assert.equal(env.messages.length, 2);
  dispose();
});

test('every request validates source, origin and token; unknown executable methods fail explicitly', async () => {
  const env = environment();
  const dispose = installBridge(env.win);
  env.message({ type: 'layout-care/connect', token });
  const request = {
    type: 'layout-care/request',
    token,
    id: 'r1',
    method: 'cancelPick',
    payload: {},
  };
  env.message({ ...request, token: 'wrong-token-123456789' });
  env.message(request, 'http://localhost:5141');
  env.message(request, 'http://localhost:5140', {});
  await flush();
  assert.equal(env.messages.length, 1);
  env.message({ ...request, method: 'eval', payload: { code: 'alert(1)' } });
  assert.equal((env.messages[1]!.message as { ok: boolean }).ok, false);
  env.message(request);
  await flush();
  assert.deepEqual(env.messages[2], {
    message: {
      type: 'layout-care/result',
      token,
      id: 'r1',
      pageUrl: 'http://127.0.0.1:4177/',
      ok: true,
      result: { cancelled: false },
    },
    origin: 'http://localhost:5140',
  });
  dispose();
});

test('token rotation cancels an old pending pick and its cancellation response retains the original token', async () => {
  const env = environment();
  const dispose = installBridge(env.win);
  try {
    env.message({ type: 'layout-care/connect', token });
    env.message({
      type: 'layout-care/request',
      token,
      id: 'pick-old',
      method: 'pick',
      payload: { mode: 'change' },
    });
    const newToken = 'replacement-token-123456789';
    env.message({ type: 'layout-care/connect', token: newToken });
    await flush();
    assert.equal((env.messages[1]!.message as { token: string }).token, newToken);
    const response = env.messages[2]!.message as {
      token: string;
      id: string;
      ok: boolean;
      error: string;
    };
    assert.equal(response.token, token);
    assert.equal(response.id, 'pick-old');
    assert.equal(response.ok, false);
    assert.match(response.error, /取消/);
    env.message({
      type: 'layout-care/request',
      token,
      id: 'stale',
      method: 'cancelPick',
      payload: {},
    });
    await flush();
    assert.equal(env.messages.length, 3);
  } finally {
    dispose();
  }
});

test('invalid payloads return bounded errors and disposal removes message handling', async () => {
  const env = environment();
  const dispose = installBridge(env.win);
  env.message({ type: 'layout-care/connect', token });
  env.message({
    type: 'layout-care/request',
    token,
    id: 'r2',
    method: 'cancelPick',
    payload: null,
  });
  await flush();
  const failure = env.messages[1]!.message as { ok: boolean; error: string };
  assert.equal(failure.ok, false);
  assert.ok(failure.error.length <= 500);
  dispose();
  dispose();
  env.message({ type: 'layout-care/connect', token });
  assert.equal(env.messages.length, 2);
});
