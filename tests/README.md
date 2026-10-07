# tests/ — 覆盖范围与运行

- 运行：`npm test`（= `tsx --test tests/*.test.ts`），随 `npm run check` 一起跑。
- 这些用例不读个人 Profile、不联网、不需要 Harness 安装。

## 覆盖范围

| 文件                         | 覆盖                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `annotation.test.ts`         | 页面载荷校验、会话级队列与发送语义、请求快照、图片 / 混合发送、折叠识别                 |
| `annotation-copy.test.ts`    | 文案表没有死键：每个键都要被**生产代码**引用；两张表的键一一对应                        |
| `annotation-message.test.ts` | 聊天侧卡片与附件徽标：目标元素标签、徽标锚点与边界、无 canvas 时保留宿主截图            |
| `annotation-view.test.ts`    | 浏览器侧纯判据：错误码到文案、picker 字段表与跨进程校验一致、发送方式降级               |
| `bridge.test.ts`             | 开发页传输：来源与 origin 白名单、通道生命周期、取消、二次启动、处置幂等                |
| `picker-source.test.ts`      | picker 编译体自包含（无 import / require），可在 guest 中具现                           |
| `gates.test.ts`              | 分层与文档门禁自身：行号不漂、不误读字符串、规则真的扫到文件、断链与失效脚本名会被拦    |
| `release-notes.test.ts`      | Release 正文取自 `CHANGELOG` 的哪一节：版本前缀不越界、缺一节要报缺失、缺验收数字时不编 |
| `format-scope.test.ts`       | 「格式门禁 ⊇ 本地钩子」这一方向，并自证两个解析器读的是真文件                           |
| `vite.test.ts`               | Vite 插件：origin 规范化、内联配置不可闭合脚本、JSX 源码提示、作用域与关闭              |
| `vite.integration.test.ts`   | 真实 Vite dev server 托管桥接；生产构建排除注入与标记                                   |

## 为什么有些逻辑专门放在 `.ts`

含 JSX 或引 `@deepseek-ai/dsh-client-ui-primitives` 的组件文件，Node 侧**加载不了**
（primitives 依赖浏览器宿主注入的模块）。所以判据与文案一律下沉到不含 JSX 的
`.ts` 兄弟文件 —— 例如 [../src/client/annotation-view.ts](../src/client/annotation-view.ts)
与 [../src/client/annotation-thumbnail.ts](../src/client/annotation-thumbnail.ts)。
判断标准：**这块逻辑想要单元判据，它就不能住在 `.tsx` 里。**

## 夹具与快照

- `fixtures/annotation-page.html`：验收脚本使用的可批注页面。
  它带 `data-web-annotator-source`，picker 会读取并写进证据。
- `snapshots/annotation-request.zh.txt`：`annotationPrompt` 的完整输出。
  更新方式：先确认改动是有意的，再跑

  ```powershell
  $env:WEB_ANNOTATOR_UPDATE_SNAPSHOTS = '1'; npm test; Remove-Item Env:WEB_ANNOTATOR_UPDATE_SNAPSHOTS
  ```

## 不属于这里

需要精确版本 Harness、真实 Chromium 或打包产物的检查在 `../scripts/`，
见 [../scripts/README.md](../scripts/README.md) 与 [../docs/verification.md](../docs/verification.md)。
