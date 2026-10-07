# responsive-demo — 规则层

继承 [../../AGENTS.md](../../AGENTS.md)。

本示例是**被批注的目标页面**，不是插件的一部分：

- **不要在这里教已经删掉的扫描 / 保留区域流程** —— 主流程是 Browser 内点选 / 框选 + 评论 / 提问。
- **保留用于定位的稳定锚点**：`#protected-header`、`#mobile-card`、`#intentional-carousel`。
  验收与文档都按这些 id 描述。
- **它通过构建产物接入**：`vite.config.ts` 引 `../../lib/vite.js`，所以先 `npm run build`。
- 只在开发期生效；生产构建不注入连接脚本或源码标记。
- 用法见 [README.md](README.md)。
