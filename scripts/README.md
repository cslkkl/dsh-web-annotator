# scripts/ — 脚本手册

- 约定与工作偏好 → 见 [AGENTS.md](AGENTS.md)。
- 全部是 ESM `.mjs`，只在本地或 CI 运行，不随包发布。

## 门禁（随 `npm run check`）

`check` 的顺序是**有依赖的**，不是随手排的：

```
format:check → lint → check:layering → check:doc-paths → build → typecheck → verify:artifacts → test
```

`build` 必须在 `typecheck` **之前**：`examples/responsive-demo/vite.config.ts` 与
`tests/vite.integration.test.ts` 都 `import '../../lib/vite.js'`，类型检查读的是
`lib/vite.d.ts`。没有 `lib/` 时类型检查会报 `TS2307`。
`verify:artifacts` 也读 `lib/`，所以同样在 `build` 之后。

| 脚本                   | npm                | 做什么                                                                                          |
| ---------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `check-layering.mjs`   | `check:layering`   | 依赖方向、picker 自包含、退休名字。规则见 [../docs/architecture.md](../docs/architecture.md) §6 |
| `check-doc-paths.mjs`  | `check:doc-paths`  | Markdown 相对链接是否还在；文档里的 `npm run <脚本名>` 是否存在；首页 README 有没有被顶掉       |
| `verify-artifacts.mjs` | `verify:artifacts` | 用宿主加载器的方式**执行** `lib/client.js` 与 `lib/bridge.js`，断言导出面与注册行为             |
| `check-package.mjs`    | `prepack`          | `npm pack` 前断言产物齐全、版本与补丁哈希一致                                                   |
| `build.mjs`            | `build`            | 四个产物：`lib/index.js`、`lib/client.js`、`lib/bridge.js`、`lib/vite.js`                       |

`verify-artifacts.mjs` 断言的是**行为**不是子串：它用替身 `__ModuleLoader__` 求值客户端产物、
真的调一次 `apply(ctx)`，再看注册了哪些插槽；暴露的 `inject` 列表少一项，插件在宿主里
**静默不出现**，那是别的门禁看不到的。

## 宿主提供方

| 脚本                             | npm                                        | 做什么                                                            |
| -------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `shared-modules.mjs`             | —                                          | 共享模块清单、导入改写、宿主基线 commit、`DSH_HOST_CHECKOUT` 解析 |
| `sync-browser-provider.mjs`      | `sync:browser-provider`                    | 把四份共享模块写入宿主检出                                        |
| `build-browser-provider.mjs`     | `build:browser-provider`                   | 先逐字节比对共享模块，再从宿主检出构建 Browser 提供方             |
| `build-chat-provider.mjs`        | `build:chat-provider`                      | 构建 Chat 提供方（用户正文 chain）                                |
| `build-layout-provider.mjs`      | `build:layout-provider`                    | 构建 Layout 提供方（全屏遮挡修复）                                |
| `typecheck-browser-provider.mjs` | `typecheck:{browser,chat,layout}-provider` | 针对已安装 rc.2 声明的窄范围类型检查                              |
| `package-host.mjs`               | `build:host` 的一部分                      | 把三个提供方放进 `lib/host`，记录逐文件哈希与补丁哈希             |
| `collect-licenses.mjs`           | `build:host` 的一部分                      | 从 source map 反查被打包依赖，生成 `lib/THIRD_PARTY_LICENSES.md`  |
| `verify-browser-patch.mjs`       | `verify:browser-patch`                     | 在独立 Git root 中把补丁应用到精确基线，并逐字节比对宿主检出      |

`sync-browser-provider.mjs` 是唯一写入本仓之外文件的脚本，目标是宿主检出本身。

## 验收

| 脚本                                | npm                                | 需要什么                                         |
| ----------------------------------- | ---------------------------------- | ------------------------------------------------ |
| `annotation-storage-acceptance.mjs` | `test:storage`                     | 真实 Chromium（`WEB_ANNOTATOR_BROWSER_CHANNEL`） |
| `annotation-acceptance.mjs`         | `test:acceptance` / `test:browser` | 精确版本 Harness + 打包产物 + Chromium           |
| `harness-test-helpers.mjs`          | —                                  | 被上面两个脚本 import；启动隔离 home 的 Harness  |
| `harness-replay-test.mjs`           | `test:harness`                     | 同上；官方 `dsh-llm-replay` 适配器               |
| `verify-delivery.mjs`               | `verify:delivery`                  | 先跑过 `test:acceptance`，并保留当时的 tgz       |

测试 home 落在仓库的**父目录** `work/`（`defaultWorkspace`），不在包内。
`work/` 与 `integration/` 都被 `.gitignore` 忽略。

## 环境变量

| 变量                                         | 用途                                                |
| -------------------------------------------- | --------------------------------------------------- |
| `DSH_HOST_CHECKOUT`                          | 宿主检出路径，默认 `../harness-browser-integration` |
| `DSH_CLI_ENTRY`                              | Harness `lib/bin.js` 绝对路径                       |
| `DSH_REPLAY_ENTRY`                           | `dsh-llm-replay` 入口                               |
| `WEB_ANNOTATOR_TARBALL` / `_PREVIEW_TARBALL` | 打包产物路径                                        |
| `WEB_ANNOTATOR_BROWSER_CHANNEL`              | Chromium 通道，默认 `msedge`                        |
| `WEB_ANNOTATOR_BUNDLED_HOST`                 | `1` = 只用包内提供方验收                            |
| `WEB_ANNOTATOR_REPLAY_PORT`                  | replay 夹具端口，默认 `18470`                       |

## 变更影响路由

- 新增或改名脚本 → 同步 `package.json`、本文档、根 [AGENTS.md](../AGENTS.md)、
  [../docs/verification.md](../docs/verification.md)；`npm run check:doc-paths` 会拦失效引用。
- 改共享模块清单 → [shared-modules.mjs](shared-modules.mjs) 一处；
  [../docs/architecture.md](../docs/architecture.md) §3.2 说明为什么要同步。
- 改门禁规则 → [../tests/gates.test.ts](../tests/gates.test.ts) 与
  [../docs/architecture.md](../docs/architecture.md) §6。
