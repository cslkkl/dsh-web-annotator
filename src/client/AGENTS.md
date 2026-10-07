# client/ — 规则层

继承 [../AGENTS.md](../AGENTS.md)。

client/ 特有约束：

- **不得引 Node 内置模块** —— 这一半打进浏览器 bundle，`node:*` 会被内联或直接失败。
- **不得引 `browser/bridge.ts`、`iframe-annotation.ts`、`screenshot.ts`**：
  前两个属于页面 / 宿主侧，截图标注由宿主补丁调用。类型与提示格式可以引。
- **一次发送只移除捕获到的已选 ID**：不要整队清空，也不要移除并发添加的批注。
- **持久化只走 `annotation-storage.ts`**：不要直接开 IndexedDB 或退回 localStorage 存队列。
  indexDB 写入提交成功之后才允许删除旧值。
- **退休的存储键只读一次**：新键写在 `annotation-store.ts`，旧键只出现在
  [legacy-names.ts](legacy-names.ts)。分层门禁会拦重新引入的 `layout-care` 名字。
- **文案进 `annotation-copy.ts`**，与 `AnnotationCopyKey` 一一对应；不要在组件里写死中英文。
- **注册必须可逆**：插槽贡献一律包在 `ctx.effect()` 里。
- **改完跑 `npm test`**；存储相关改动还要跑 `npm run test:storage`（真实 Chromium）。
- 文件清单与“改哪”见 [README.md](README.md)。
