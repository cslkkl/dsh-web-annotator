# .github/ — 规则层

继承 [../AGENTS.md](../AGENTS.md)。

.github/ 特有约束：

- **每个 workflow 显式声明 `permissions`**：默认值读不到，漏了声明的症状是 403。
- **CI 只读**：不写回仓库、不发布、不推标签。
- **安装一律 frozen 模式**（`npm ci`），不在 CI 里解析新版本。
- **Node 版本只从 [../.node-version](../.node-version) 读**，不要在两处各写一遍。
- **CI 用的宿主检出路径通过 `DSH_HOST_CHECKOUT` 传给脚本**，
  脚本必须认这个变量，否则 CI 看不到 `.host-source`。
- 有哪些 workflow、各跑什么见 [README.md](README.md)。
