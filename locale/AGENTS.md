# locale/ — 规则层

继承 [../AGENTS.md](../AGENTS.md)。

locale/ 特有约束：

- **这两个文件被宿主直接读取，代码一个字节都不读** —— 坏了零信号，只静默回落成包名。
- **只放宿主认识的键**（`meta.title`、`meta.description`），界面文案在
  [../src/client/annotation-copy.ts](../src/client/annotation-copy.ts)。
- **改完必须跑 `npm run format:check`**：JSON 语法错误不会被任何运行路径发现。
- 各文件职责见 [README.md](README.md)。
