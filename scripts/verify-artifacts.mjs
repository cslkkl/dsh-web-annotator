/**
 * Artifact-shape gate: assert what `lib/` actually exposes, by running it.
 *
 * Why this exists: several failures in this package are invisible to every other
 * check — the bundle builds, the tests pass, and the plugin simply does not
 * appear in the host, or appears with missing registrations. The only place
 * those can be caught is the built artifact itself.
 *
 * Method: the client bundle is evaluated with a stand-in module loader and a
 * stand-in `require`, and `apply` is actually called. Assertions are functional
 * (`typeof exports.apply === 'function'`, the exact `inject` list, the slots that
 * were registered) rather than substring matches, so a bundler upgrade that
 * changes the emitted syntax does not silently turn this gate into a no-op.
 *
 * Exit codes: 0 = every assertion passed, 1 = a missing or wrong artifact.
 *
 * Usage: `node scripts/verify-artifacts.mjs` (`npm run verify:artifacts`)
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

/** Modules the host loader provides. Anything else must not appear as a require. */
const CLIENT_EXTERNALS = [
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-primitives',
  'react',
  'react/jsx-runtime',
];

/** Slot names the client half must register; missing one drops a control silently. */
const REGISTERED_SLOTS = [
  'conversation.input.left',
  'conversation.message.user-text',
  'sidebar.right.tab.browser.annotations',
  'sidebar.right.tab.browser.toolbar',
];

const checks = [];
function check(name, body) {
  body();
  checks.push(name);
  console.log(`PASS ${name}`);
}

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const naming = JSON.parse(await readFile('dsh-plugin.naming.json', 'utf8'));
const patch = await readFile('cordis.patch.yml', 'utf8');
const client = await readFile('lib/client.js', 'utf8');
const bridge = await readFile('lib/bridge.js', 'utf8');

/** The rows this package inserts into the profile, in file order. */
function insertedRows() {
  const insert = /-\s*insert:\s*\n([\s\S]*)$/.exec(patch);
  assert.ok(insert, 'cordis.patch.yml 里找不到 insert 段 —— 产物入口无从校验');
  return [...insert[1].matchAll(/-\s*id:\s*(\S+)\s*\n\s*name:\s*(\S+)/g)].map((match) => ({
    id: match[1],
    name: match[2],
  }));
}

/** Evaluate the client bundle the way the host loader does, and run `apply`. */
function runClient() {
  const loaded = { id: undefined, factory: undefined };
  const required = [];
  const injected = [];
  const registered = [];
  const locales = [];
  const requireShim = (specifier) => {
    required.push(specifier);
    if (specifier === 'react') {
      return {
        useEffect: () => {},
        useRef: () => ({ current: 0 }),
        useState: () => [undefined, () => {}],
      };
    }
    if (specifier === 'react/jsx-runtime')
      return { Fragment: null, jsx: () => null, jsxs: () => null };
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
      return { Button: () => null, IconInspectOutlineRegular: () => null, Tooltip: () => null };
    }
    if (specifier === '@deepseek-ai/dsh-client-store') {
      return {
        defineStore: (spec) => ({
          ...spec,
          create: () => ({
            getSnapshot: () => ({}),
            store: { update: () => {}, set: () => {} },
            subscribe: () => {},
            actions: {},
          }),
        }),
      };
    }
    throw new Error(
      `客户端产物 require 了未预期的模块 ${specifier} —— 它要么被内联了，要么漏进了外部化清单`,
    );
  };
  const sandbox = {
    console,
    window: {
      __ModuleLoader__: {
        load: ({ id, factory }) => {
          loaded.id = id;
          loaded.factory = factory;
        },
      },
    },
  };
  sandbox.globalThis = sandbox;
  runInContext(client, createContext(sandbox));
  assert.equal(typeof loaded.factory, 'function', '客户端产物没有被 __ModuleLoader__.load 包装');
  const exported = loaded.factory(requireShim);
  const context = {
    effect: (body) => {
      body();
      return () => {};
    },
    locale: {
      register: (namespace) => {
        locales.push(namespace);
        return () => {};
      },
    },
    slots: {
      inject: (name, body) => {
        injected.push(name);
        return body();
      },
      register: (spec) => {
        registered.push(spec.name);
        return () => {};
      },
    },
    sidebarRight: { openTab: () => {} },
    sessions: { binding: () => undefined },
  };
  exported.apply(context);
  return { exported, loaded, required, injected, registered, locales };
}

const client_ = runClient();

check('客户端产物由宿主模块加载器包装，id 就是包名', () => {
  assert.equal(client_.loaded.id, manifest.name);
});

check('客户端导出 apply 与 inject，且 inject 是去重的非空字符串列表', () => {
  assert.equal(typeof client_.exported.apply, 'function');
  const inject = client_.exported.inject;
  assert.ok(Array.isArray(inject) && inject.length > 0, 'inject 必须是非空数组，少它插件不激活');
  assert.ok(inject.every((name) => typeof name === 'string' && name.length > 0));
  assert.equal(new Set(inject).size, inject.length);
});

check('apply 注册了四个插槽，且注册的是服务而不是被内联的宿主代码', () => {
  assert.deepEqual([...client_.registered].sort(), REGISTERED_SLOTS);
  // Every registration also declares the slot it waits for; a mismatch means the
  // contribution lands in a slot the host never declares.
  assert.deepEqual([...client_.injected].sort(), REGISTERED_SLOTS);
  assert.deepEqual(client_.locales, ['webAnnotatorAnnotations']);
});

check('客户端只 require 宿主提供的外部模块，其余一律没有内联', () => {
  assert.deepEqual([...client_.required].sort(), CLIENT_EXTERNALS);
  assert.doesNotMatch(
    client,
    /process\.env\.NODE_ENV/,
    'React 被内联了 —— 加载时会抛 process is not defined',
  );
});

check('包名在四处保持同一个字符串：产物加载器 id、patch 行、naming.json、manifest', () => {
  const rows = insertedRows();
  const main = rows.find((row) => row.name === manifest.name);
  assert.ok(main, `cordis.patch.yml 没有插入 name=${manifest.name} 的行`);
  assert.equal(client_.loaded.id, manifest.name);
  assert.equal(naming.plugin.packageName, manifest.name);
  // The naming manifest is a separate registration; if the patch grows a row and
  // this file does not, the profile loads something the manifest never declared.
  assert.deepEqual(
    rows.map((row) => row.id).sort(),
    [...naming.names.loaderIds].sort(),
    'patch 插入的行 id 与 dsh-plugin.naming.json 的 loaderIds 不一致',
  );
  assert.equal(main.id, naming.names.pluginNames[0]);
});

check('开发页桥接产物是自包含 IIFE，只装一个全局且不含已退休的协议', () => {
  const installed = [];
  const sandbox = {
    console,
    window: {
      addEventListener: (type) => installed.push(type),
      parent: {},
    },
    AbortController,
  };
  sandbox.globalThis = sandbox;
  runInContext(bridge, createContext(sandbox));
  assert.equal(typeof sandbox.window.__DSH_PAGE_ANNOTATION_BRIDGE_DISPOSE__, 'function');
  assert.deepEqual(installed.sort(), ['message', 'pagehide']);
  assert.match(bridge, /dsh-browser-annotation-v1/);
  assert.match(bridge, /__WEB_ANNOTATOR_CONFIG__/);
  for (const retired of ['layout-care', 'scanDocument', 'recheckProtections', 'data-layout-care'])
    assert.doesNotMatch(bridge, new RegExp(retired), `桥接产物里残留了已退休的实现：${retired}`);
});

console.log(`\n产物断言通过：${String(checks.length)} 项`);
