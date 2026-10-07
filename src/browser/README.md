# browser/ — 页面半端手册

- 职责：在**被访问网页**内完成拾取与取证；在宿主侧完成有界请求与截图标注。
- 约束与工作偏好 → 见 [AGENTS.md](AGENTS.md)。

## 文件索引

| 文件                   | 运行位置                        | 职责                                                 | 关键导出                                                                                                              |
| ---------------------- | ------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `page-inspector.ts`    | 被访问网页（含 Electron guest） | 点击 / 拖动 / 空格临时操作、属性卡片、证据采集       | `annotatePage`、`BrowserAnnotation`、`BrowserAnnotationOptions`、`BrowserAnnotationElement`、`BrowserAnnotationImage` |
| `protocol.ts`          | 两侧                            | 载荷校验：形状、限长、origin、矩形                   | `isAnnotationResult`、`isAnnotationOptions`、`AnnotationResult`                                                       |
| `prompt.ts`            | Client 半端                     | 生成请求文本；反向识别已保存的请求                   | `annotationPrompt`、`annotationImagePrompt`、`readAnnotationPrompt`、`AnnotationDelivery`                             |
| `bridge.ts`            | 开发页（Vite `serve`）          | 只接受本页 parent 的 `MessageChannel` 启动           | `installAnnotationBridge`、`isAllowedParentOrigin`                                                                    |
| `iframe-annotation.ts` | 宿主补丁                        | 向桥接 iframe 发一次有界请求，处理握手 / 取消 / 超时 | `annotateIframe`                                                                                                      |
| `screenshot.ts`        | Client 半端                     | 在真实像素上画出选区并压成有界 JPEG                  | `markScreenshot`                                                                                                      |
| `slots.ts`             | 编译期                          | 声明原版 rc.2 缺失的两个 Browser 子插槽              | 模块增强                                                                                                              |

### 共享模块

`page-inspector.ts`、`protocol.ts`、`iframe-annotation.ts`、`screenshot.ts` 在宿主补丁里保留同步副本。
宿主副本把 `'./page-inspector'` / `'./protocol'` 改写成带 `.ts` 的写法，其余逐字节相同。

- 同步：`npm run sync:browser-provider`
- 构建时比对：`scripts/build-browser-provider.mjs`，不一致直接失败

## 插槽契约

Browser 补丁声明两个**会话作用域 list** 子插槽，Owner props 相同：

| 插槽                                    | Owner props                                                          |
| --------------------------------------- | -------------------------------------------------------------------- |
| `sidebar.right.tab.browser.toolbar`     | `tabId`、`url`、`loading`、`annotate(options)`、`cancelAnnotation()` |
| `sidebar.right.tab.browser.annotations` | 同上，外加贡献方自己注入的提交动作                                   |

回调返回 `BrowserAnnotation | { cancelled: true }`，永不暴露 DOM、guest 标识或求值器。
定义见 `slots.ts`；设计理由见[架构 §3.3](../../docs/architecture.md)。

## 变更影响路由

- 改四个共享模块 → 同步 → 重生成补丁 → `npm run build:host`（编号见[架构 §8](../../docs/architecture.md) 的 F8–F13）。
- 改 `prompt.ts` → 快照 `../../tests/snapshots/annotation-request.zh.txt`（写入方式见 [../../tests/README.md](../../tests/README.md)）。
- 改 `bridge.ts` 的来源规则 → `../../tests/bridge.test.ts` 与 `../../tests/vite.test.ts`。
- 改插槽名或 props → 宿主补丁、[../../docs/architecture.md](../../docs/architecture.md)、真实宿主验收。
- 改 `page-inspector.ts` 的对外行为 → `../../tests/picker-source.test.ts` 与打包产物验收。
  它是 F1 的保护对象：**不要为了让别处复用而给它加 import**。

## 已知边界

- closed Shadow DOM 与嵌套 iframe 内部只定位外层载体。
- `source` 提示是 JSX 提示，不是源码事实，需要 Agent 在工作区核实。
- 空格暂停期间页面接收正常按键；输入框内的空格不受影响。
