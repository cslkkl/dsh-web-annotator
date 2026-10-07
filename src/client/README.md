# client/ — 浏览器 Client 半端手册

- 职责：把批注控件挂到 Harness 原有 Browser 的插槽上，并管理队列、视图与提交。
- 约束与工作偏好 → 见 [AGENTS.md](AGENTS.md)。

## 文件索引

| 文件                      | 职责                                                                         | 关键导出                                                                         | 打包形态                                                       |
| ------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `index.tsx`               | 注册四个插槽：工具栏按钮、批注队列、聊天内折叠视图、输入条入口               | `inject`、`apply`                                                                | `lib/client.js`（CJS + `__ModuleLoader__` 包装，React 外部化） |
| `annotation-store.ts`     | 声明会话级 store，附加异步持久化与旧键迁移                                   | `createAnnotationStore`、`readAnnotations`、`SavedAnnotation`、`AnnotationStore` | 同上                                                           |
| `annotation-storage.ts`   | IndexedDB 单键读 / 写 / 删；事务结束即关连接                                 | `annotationStorage`                                                              | 同上                                                           |
| `annotation-view.ts`      | 从 tsx 里抽出的纯逻辑：picker 选项、错误码到文案、实际可用的发送方式         | `pickerOptions`、`annotationErrorKey`、`effectiveDelivery`、`PICKER_COPY_KEYS`   | 同上；改后必测 `tests/annotation-view.test.ts`                 |
| `annotation-thumbnail.ts` | 聊天侧呈现用的纯逻辑与实际落笔：目标元素标签、徽标锚点、带序号徽标的截图重画 | `annotationTarget`、`annotationMark`、`badgeCaptures`                            | 同上                                                           |
| `annotation-copy.ts`      | 中英文文案与 `LocaleNamespaceMap` 增强                                       | `zh`、`en`、`AnnotationCopyKey`                                                  | 同上                                                           |
| `legacy-names.ts`         | alpha.8 及更早的持久化键，只读一次                                           | `legacyAnnotationKey`                                                            | 同上                                                           |

## 注册的插槽

| 插槽                                    | 用途                                               | 依赖的 Owner props                                        |
| --------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `sidebar.right.tab.browser.toolbar`     | “批注网页 / 退出批注”                              | `annotate`、`cancelAnnotation`、`url`、`tabId`、`loading` |
| `sidebar.right.tab.browser.annotations` | 队列、勾选、编辑、发送方式、预览、发送             | 同上；贡献方再注入 `submitAnnotations`                    |
| `conversation.message.user-text`        | 折叠本插件自己的请求：默认“N 条注释”，展开逐条卡片 | chain `{ text }`                                          |
| `conversation.input.left`               | 打开 Browser 标签的入口                            | `sidebarRight.openTab`                                    |

聊天侧的两层呈现各自独立：附件是宿主按正式图片流程渲染的缩略图（Client 半端在发送前重画，
叠加与附图序号一致的蓝底白字徽标），正文是这里的“N 条注释”开关与逐条卡片。
队列里的“预览发送内容”用的是同一次重画结果，所以预览的图和真正发出去的附件一致。
卡片元素可聚焦，键盘可展开与收起；定位资料仍是同一个 `<details>`，默认收起。

## 存储

- 库：IndexedDB `dsh-web-annotator`，表 `queues`。
- 键：`dsh.web-annotator.browser-annotations.v1[.<sessionId>]`。
- 旧键：`dsh.layout-care.browser-annotations.v1[.<sessionId>]`，读到即迁移，
  新键提交成功后才删除旧值（localStorage 与 IndexedDB 都清）。
- 队列按**会话 + 完整 URL** 隔离；每页上限 32 条，单条 ≤ 1000 字符。

## 变更影响路由

- 改存储键或迁移 → [../../docs/architecture.md](../../docs/architecture.md) 的 §3.5、
  `npm run test:storage`、`scripts/annotation-acceptance.mjs` 的满队列用例（它直接写队列键）。
- 改插槽 id 或注册形状 → `scripts/annotation-acceptance.mjs` 会按按钮文案与 `.wa-*` 选择器定位。
- 改 `.wa-*` 类名 → 同步上述验收脚本。
- 改聊天侧卡片或徽标 → [../../docs/architecture.md](../../docs/architecture.md) 的 §3.3 / §3.6、
  本文的“注册的插槽”，以及 `tests/annotation-message.test.ts`（目标标签、徽标锚点、无 canvas 回退）。
- 改文案键 → `annotation-copy.ts` 的 `en` 必须同步补齐（类型会强制）。
  **加键要同时接上使用它的生产代码**，没有引用的键会被删掉；判据 `tests/annotation-copy.test.ts`。
- 改 picker 的字段表 → `tests/annotation-view.test.ts` 会逐字段比对
  `src/browser/protocol.ts` 的跨进程校验；两边漂开就在那里报红，不必改那个同步模块。
- 改错误码 → `annotation-view.ts` 的 `ERROR_COPY`；未登记的码一律落到 `failed`，
  不许默认当成成功。判据同上。
- 改 `inject` 列表 → `package.json` 的 `dsh.client.inject`。

## 已知边界

- 队列状态在内存中始终可用；存储失败只提示，不清空内容。
- 发送失败保留全部批注；成功只移除本次勾选并发送成功的 ID。
- 徽标重画只在浏览器里做：拿不到 `Image` / canvas 时（例如单元测试的 Node 环境）保留宿主
  已画好的截图，绝不为了加序号而丢掉证据。
