# responsive-demo — 响应式验收页面

用于验收批注流程的目标页面。从插件仓库根目录先 `npm run build`，再 `npm run demo`。
地址是 `http://127.0.0.1:4177`，只监听本机。

`vite.config.ts` 引构建后的 `lib/vite.js`；开发服务器托管
`__web-annotator__/bridge.js` 并把允许的父来源内联进页面。

## 页面里有什么

| 锚点                    | 用途                                              |
| ----------------------- | ------------------------------------------------- |
| `#protected-header`     | 页眉，适合演示“只改一处、别动这里”                |
| `#mobile-card`          | 初始宽度 560 px，在窄视口下会横向溢出             |
| `#intentional-carousel` | 有意使用 `overflow-x: auto`，属于正常设计而非缺陷 |

`src/main.tsx` 的原生 DOM 元素带 `data-web-annotator-source` 提示（由 Vite 插件注入），
点选后可以在批注里看到文件名、行与列。

## 验收方式

1. 在 Harness 里打开“批注网页”，输入上面的地址。
2. 用 390 px 左右的视口，点选或框选 `#mobile-card`，写下要求。
3. 点选 `#protected-header`，写明“这块保持原样”。
4. 点选 `#intentional-carousel`，确认横滚区域不会被当作问题。
5. 预览并发送到当前会话，由 Agent 修改源码；Vite 热更新会立刻反映结果。

页面上的按钮只切换示例状态，用来演示“改前 / 改后”，不代表 AI 已经改过源码。

## 常见问题

- 页面能打开但无法批注：检查是否跑了 `npm run build`（`lib/bridge.js` 缺失时 Vite 中间件返回 500）。
- 从非 loopback 来源连接：在 `webAnnotator({ allowedParentOrigins })` 里写精确的 HTTP(S) origin。
