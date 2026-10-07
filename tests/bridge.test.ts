import assert from 'node:assert/strict';
import test from 'node:test';
import { installAnnotationBridge, isAllowedParentOrigin } from '../src/browser/bridge';
import type { BrowserAnnotation, BrowserAnnotationOptions } from '../src/browser/page-inspector';

const copyKeys = [
  'select',
  'comment',
  'question',
  'placeholder',
  'settings',
  'save',
  'cancel',
  'parent',
  'child',
  'targetGone',
  'empty',
  'region',
  'point',
  'interact',
  'color',
  'background',
  'opacity',
  'font',
  'fontSize',
  'fontWeight',
  'spacing',
  'elementOnly',
  'invalidStyle',
  'applyStyles',
  'styleHint',
] as const;

function options(): BrowserAnnotationOptions {
  return {
    intent: 'question',
    dark: false,
    copy: Object.fromEntries(copyKeys.map((key) => [key, key])) as BrowserAnnotationOptions['copy'],
  };
}

const saved: BrowserAnnotation = {
  intent: 'question',
  note: '这里为什么有空白？',
  url: 'http://localhost:5173/',
  title: '示例页面',
  viewport: { width: 800, height: 600 },
  selection: {
    kind: 'point',
    rect: { x: 24, y: 324, width: 0, height: 0 },
    viewportRect: { x: 24, y: 24, width: 0, height: 0 },
    scroll: { x: 0, y: 300 },
    candidates: [],
  },
};

/** The bridge only posts, closes and subscribes; a record is enough to observe it. */
function fakePort() {
  const port = {
    posted: [] as unknown[],
    closed: false,
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage(value: unknown) {
      port.posted.push(value);
    },
    close() {
      port.closed = true;
    },
    deliver(value: unknown) {
      port.onmessage?.({ data: value });
    },
  };
  return port;
}
type FakePort = ReturnType<typeof fakePort>;

/** A visited page whose only legitimate caller is its own parent frame. */
function environment(configured: string[] = []) {
  const parent = {};
  const events = new EventTarget();
  const win = Object.assign(events, {
    parent,
    __WEB_ANNOTATOR_CONFIG__: { allowedParentOrigins: configured },
    __DSH_PAGE_ANNOTATION_CANCEL__: undefined as undefined | (() => void),
  }) as unknown as Window & { __DSH_PAGE_ANNOTATION_CANCEL__?: () => void };
  let cancels = 0;
  win.__DSH_PAGE_ANNOTATION_CANCEL__ = () => {
    cancels++;
  };
  function send(
    data: unknown,
    origin = 'http://localhost:5140',
    source: unknown = parent,
    ports: unknown[] = [],
  ) {
    const event = new Event('message');
    Object.defineProperties(event, {
      data: { value: data },
      origin: { value: origin },
      source: { value: source },
      ports: { value: ports },
    });
    events.dispatchEvent(event);
  }
  return {
    win,
    send,
    get cancels() {
      return cancels;
    },
  };
}

const start = (value: unknown = options()) => ({
  channel: 'dsh-browser-annotation-v1',
  type: 'start',
  options: value,
});

function resolver() {
  const settlement: ((value: BrowserAnnotation | { cancelled: true }) => void)[] = [];
  const calls: BrowserAnnotationOptions[] = [];
  return {
    calls,
    /** Each start gets its own pending picker, as `annotatePage` does. */
    pick: (value: BrowserAnnotationOptions) => {
      calls.push(value);
      return new Promise<BrowserAnnotation | { cancelled: true }>((resolve) => {
        settlement.push(resolve);
      });
    },
    settle: (index: number, value: BrowserAnnotation | { cancelled: true }) =>
      settlement[index]!(value),
  };
}

test('parent origins permit loopback HTTP, exact configured origins and nothing else', () => {
  assert.equal(isAllowedParentOrigin('http://localhost:5140', []), true);
  assert.equal(isAllowedParentOrigin('http://127.0.0.1:5140', []), true);
  assert.equal(isAllowedParentOrigin('http://127.9.9.9:5140', []), true);
  assert.equal(isAllowedParentOrigin('https://localhost:5140', []), false);
  assert.equal(isAllowedParentOrigin('http://localhost.attacker.test:5140', []), false);
  assert.equal(isAllowedParentOrigin('http://127.0.0.1.attacker.test:5140', []), false);
  assert.equal(isAllowedParentOrigin('http://127.0.0.1:5140/', []), false);
  assert.equal(isAllowedParentOrigin('https://harness.example.com', []), false);
  assert.equal(
    isAllowedParentOrigin('https://harness.example.com', ['https://harness.example.com']),
    true,
  );
  assert.equal(
    isAllowedParentOrigin('https://harness.example.com/path', ['https://harness.example.com']),
    false,
  );
  for (const invalid of ['null', 'file:///preview', 'javascript:alert(1)', '', 'not a url'])
    assert.equal(isAllowedParentOrigin(invalid, ['https://harness.example.com']), false, invalid);
});

test('the bridge ignores every start that is not the page parent on an allowed origin with one valid port', () => {
  const env = environment();
  const fake = resolver();
  const dispose = installAnnotationBridge(env.win, fake.pick);
  const rejected: [unknown, string, unknown, FakePort[]][] = [
    [start(), 'https://attacker.example', env.win.parent, [fakePort()]],
    [start(), 'http://localhost:5140', {}, [fakePort()]],
    [
      { ...start(), channel: 'other-channel' },
      'http://localhost:5140',
      env.win.parent,
      [fakePort()],
    ],
    [{ ...start(), type: 'stop' }, 'http://localhost:5140', env.win.parent, [fakePort()]],
    [start({}), 'http://localhost:5140', env.win.parent, [fakePort()]],
    [start({ ...options(), dark: 'no' }), 'http://localhost:5140', env.win.parent, [fakePort()]],
    [
      start({ ...options(), copy: { ...options().copy, save: 'x'.repeat(501) } }),
      'http://localhost:5140',
      env.win.parent,
      [fakePort()],
    ],
    [start(), 'http://localhost:5140', env.win.parent, []],
    [start(), 'http://localhost:5140', env.win.parent, [fakePort(), fakePort()]],
  ];
  for (const [data, origin, source, ports] of rejected) {
    env.send(data, origin, source, ports);
    for (const port of ports)
      assert.deepEqual(port.posted, [], `${JSON.stringify(data)} → ${JSON.stringify(port.posted)}`);
  }
  assert.equal(fake.calls.length, 0, 'no rejected start may reach the picker');
  assert.equal(env.cancels, 0);
  dispose();
});

test('an accepted start acknowledges, runs the injected picker and closes on the saved result', async () => {
  const env = environment();
  const fake = resolver();
  const dispose = installAnnotationBridge(env.win, fake.pick);
  const port = fakePort();
  env.send(start(), 'http://localhost:5140', env.win.parent, [port]);
  assert.deepEqual(port.posted, [{ ready: true }]);
  assert.equal(fake.calls.length, 1);
  assert.equal(port.closed, false);
  fake.settle(0, saved);
  await Promise.resolve();
  assert.deepEqual(port.posted, [{ ready: true }, saved]);
  assert.equal(port.closed, true);
  dispose();
});

test('a picker that throws or rejects answers with a cancellation instead of leaving the channel open', async () => {
  const env = environment();
  const throws = installAnnotationBridge(env.win, () => {
    throw new Error('no DOM');
  });
  const first = fakePort();
  env.send(start(), 'http://localhost:5140', env.win.parent, [first]);
  assert.deepEqual(first.posted, [{ ready: true }, { cancelled: true }]);
  assert.equal(first.closed, true);
  throws();

  const failing = installAnnotationBridge(env.win, () => Promise.reject(new Error('no DOM')));
  const second = fakePort();
  env.send(start(), 'http://localhost:5140', env.win.parent, [second]);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(second.posted, [{ ready: true }, { cancelled: true }]);
  assert.equal(second.closed, true);
  failing();
});

test('a second start supersedes the first channel and a cancel request reaches the page picker', async () => {
  const env = environment();
  const fake = resolver();
  const dispose = installAnnotationBridge(env.win, fake.pick);
  const first = fakePort();
  env.send(start(), 'http://localhost:5140', env.win.parent, [first]);
  assert.deepEqual(first.posted, [{ ready: true }]);
  const second = fakePort();
  env.send(start(), 'http://localhost:5140', env.win.parent, [second]);
  assert.deepEqual(
    first.posted,
    [{ ready: true }, { cancelled: true }],
    'the replaced channel is told',
  );
  assert.equal(first.closed, true);
  assert.deepEqual(second.posted, [{ ready: true }]);
  assert.equal(env.cancels, 2, 'starting a picker and cancel are both forwarded to the page');
  second.deliver({ type: 'cancel' });
  assert.equal(env.cancels, 3);
  second.deliver({ type: 'other' });
  assert.equal(env.cancels, 3, 'unrelated channel traffic is ignored');
  // The superseded picker can no longer post onto either channel.
  fake.settle(0, saved);
  await Promise.resolve();
  assert.deepEqual(second.posted, [{ ready: true }]);
  assert.equal(second.closed, false);
  dispose();
});

test('disposal releases the active channel, ignores late results and stops further starts', async () => {
  const env = environment();
  const fake = resolver();
  const dispose = installAnnotationBridge(env.win, fake.pick);
  const port = fakePort();
  env.send(start(), 'http://localhost:5140', env.win.parent, [port]);
  assert.deepEqual(port.posted, [{ ready: true }]);
  dispose();
  assert.deepEqual(port.posted, [{ ready: true }, { cancelled: true }]);
  assert.equal(port.closed, true);
  assert.equal(env.cancels, 2, 'the accepted start and the disposal each reach the page picker');
  fake.settle(0, saved);
  await Promise.resolve();
  assert.deepEqual(port.posted, [{ ready: true }, { cancelled: true }], 'late results are dropped');
  const after = fakePort();
  env.send(start(), 'http://localhost:5140', env.win.parent, [after]);
  assert.deepEqual(after.posted, []);
  assert.equal(fake.calls.length, 1);
  dispose();
  assert.equal(env.cancels, 2, 'disposal is idempotent');
});

test('an explicit parent origin is accepted for a remote harness host and no other remote origin is', () => {
  const env = environment(['https://harness.example.com']);
  const fake = resolver();
  const dispose = installAnnotationBridge(env.win, fake.pick);
  const port = fakePort();
  env.send(start(), 'https://harness.example.com', env.win.parent, [port]);
  assert.deepEqual(port.posted, [{ ready: true }]);
  assert.equal(fake.calls.length, 1);
  const rejected = fakePort();
  env.send(start(), 'https://other.example.com', env.win.parent, [rejected]);
  assert.deepEqual(rejected.posted, []);
  assert.equal(fake.calls.length, 1);
  dispose();
});
