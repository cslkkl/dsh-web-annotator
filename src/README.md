# src/ — 源码手册

- 职责：宿主入口、开发期 Vite 插件、页面拾取器与协议、浏览器 Client 半端。
- 约束与工作偏好 → 见 [AGENTS.md](AGENTS.md)。

## 文件索引

| 文件                           | 职责                                                   | 关键导出                                                                | 被谁依赖                                                  |
| ------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `index.ts`                     | 宿主入口，只声明名字                                   | `name`、`apply`                                                         | `cordis.patch.yml` 的行                                   |
| `vite.ts`                      | 仅 `serve` 阶段：托管开发桥、给 JSX 原生标签加源码提示 | `webAnnotator`、`normalizeAllowedOrigins`、`serializeAnnotateJsxSource` | 使用方的 `vite.config.ts`、`examples/responsive-demo`     |
| `browser/page-inspector.ts`    | 自包含页面 picker：手势、属性卡片、证据采集            | `annotatePage`、各 `BrowserAnnotation*` 类型                            | `browser/bridge.ts`、宿主补丁、`client/index.tsx`（类型） |
| `browser/protocol.ts`          | 跨进程 / MessagePort 载荷校验                          | `isAnnotationResult`、`isAnnotationOptions`                             | `browser/bridge.ts`、`client/annotation-store.ts`         |
| `browser/prompt.ts`            | 请求格式与反向识别                                     | `annotationPrompt`、`annotationImagePrompt`、`readAnnotationPrompt`     | `client/index.tsx`                                        |
| `browser/bridge.ts`            | 开发页传输：来源校验、通道生命周期                     | `installAnnotationBridge`、`isAllowedParentOrigin`                      | `scripts/build.mjs`（打成 `lib/bridge.js`）               |
| `browser/iframe-annotation.ts` | 宿主侧：向桥接 iframe 发一次有界请求                   | `annotateIframe`                                                        | 宿主补丁                                                  |
| `browser/screenshot.ts`        | 在真实截图上标出选区并压成有界 JPEG                    | `markScreenshot`                                                        | 宿主补丁                                                  |
| `browser/slots.ts`             | Browser 补丁的插槽类型声明（原版 rc.2 没有）           | 模块增强                                                                | `client/index.tsx`                                        |
| `client/index.tsx`             | Client 半端：注册四个插槽与请求提交                    | `inject`、`apply`                                                       | Harness Client 加载器                                     |
| `client/annotation-store.ts`   | 会话级队列 + IndexedDB 持久化与迁移                    | `createAnnotationStore`、`readAnnotations`                              | `client/index.tsx`、存储验收脚本                          |
| `client/annotation-storage.ts` | IndexedDB 单键读写，事务结束即关连接                   | `annotationStorage`                                                     | `client/annotation-store.ts`                              |
| `client/annotation-copy.ts`    | 界面文案（中英）                                       | `zh`、`en`、`AnnotationCopyKey`                                         | `client/index.tsx`                                        |
| `client/legacy-names.ts`       | alpha.8 及更早的存储键，只读一次用于迁移               | `legacyAnnotationKey`                                                   | `client/annotation-store.ts`                              |

## 变更影响路由

- 改 `browser/` 四个共享模块 → `npm run sync:browser-provider` → 重生成补丁 → `npm run build:host`；
  同步清单见 [../scripts/README.md](../scripts/README.md)。
- 改 `browser/prompt.ts` → 快照 `../tests/snapshots/annotation-request.zh.txt` 与[架构 §3.6](../docs/architecture.md)。
- 改插槽名或 Owner props → 宿主补丁、[browser/README.md](browser/README.md)、[架构 §3.3](../docs/architecture.md)，
  并重跑真实宿主验收。
- 改存储键或迁移 → [client/README.md](client/README.md)、[架构 §3.5](../docs/architecture.md)、`npm run test:storage`。
- 改分层规则可表达的约束 → 同步 [../scripts/check-layering.mjs](../scripts/check-layering.mjs) 与
  [../tests/gates.test.ts](../tests/gates.test.ts)，并回填 [AGENTS.md](AGENTS.md)。

## 子目录

- 页面 picker、协议、提示格式 → [browser/README.md](browser/README.md)
- Client 半端、队列与存储 → [client/README.md](client/README.md)
