# docs/ — 规则层

继承 [../AGENTS.md](../AGENTS.md)。

docs/ 特有约束：

- **只放辅助文档**：设计决策、宿主接入、验证记录、分发与优先级。
  文件级清单归各子树 `README.md`，不写在这里。
- **写“为什么”，不写步骤手册**：`architecture.md` 是设计圣经；
  操作步骤进 `browser-integration.md` 或 `verification.md`。
- **不抄会漂的值**：版本号、测试数量、产物哈希都指向自更新来源（`package.json`、
  CI 记录、`integration/*.json`），不要写死在正文里。
- **`harness-browser-annotation.patch` 是生成物**：由宿主检出 `git diff HEAD` 生成，
  不要手改。生成方式见 [browser-integration.md](browser-integration.md)。
- **相对链接必须可解析**：`npm run check:doc-paths` 会拦；改文件名时同批改引用。
- 有什么文档、改哪见 [README.md](README.md)。
