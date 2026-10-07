# browser/ — 规则层

继承 [../AGENTS.md](../AGENTS.md)。

browser/ 特有约束：

- **`page-inspector.ts` 必须保持零 import 且可独立执行**：Desktop 只把 `annotatePage` 的编译体
  送进 guest。不要为了复用而引入模块级辅助函数 —— 在 guest 中它们是未定义标识符。
- **picker 只用浏览器全局**：`document`、`window`、`CSS`、`ResizeObserver`、`location` 等。
  不要引用宿主、Node、React 或本包其他模块。
- **跨进程载荷必须先校验再使用**：`protocol.ts` 限长每个字段，`iframe-annotation.ts` 校验
  origin / pageUrl / 端口数。新增字段要同时加校验与判据。
- **四份共享模块改动后跑 `npm run sync:browser-provider`**；清单在
  [../../scripts/shared-modules.mjs](../../scripts/shared-modules.mjs)。
- **选区矩形是权威**：`selection.rect` 是文档坐标的真实范围；`candidates` 只是区域内采样，
  不代表整个选区。不要用父元素替代矩形。
- **文案来自 options**：picker 不内置任何自然语言，`copy` 由 Client 半端传入并逐字段限长。
- 文件清单与“改哪”见 [README.md](README.md)。
