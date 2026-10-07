# .github/ — 规则层

继承 [../AGENTS.md](../AGENTS.md)。

.github/ 特有约束：

- **每个 workflow 显式声明 `permissions`**：默认值读不到，漏了声明的症状是 403。
- **`ci.yml` 只读**：不写回仓库、不发布、不推标签。
  **`release.yml` 只写 Release**（`contents: write`），且只由 `v*` 标签或手动传标签触发；
  它不改版本号、不打标签、不动分支 —— 版本号必须在打标签前已经在 `package.json` 里 bump 过。
- **发布必须用验收过的那一份产物**：`release.yml` 自己构建、自己验收、自己发，
  不把「在别处重建的同一份代码」当成同一个字节流（理由见 [../docs/publishing.md](../docs/publishing.md) 的发版节）。
- **安装一律 frozen 模式**（`npm ci`），不在 CI 里解析新版本。
- **Node 版本只从 [../.node-version](../.node-version) 读**，不要在两处各写一遍。
- **CI 用的宿主检出路径通过 `DSH_HOST_CHECKOUT` 传给脚本**，
  脚本必须认这个变量，否则 CI 看不到 `.host-source`。
- ⚠️ **本目录不许放 `README.md`** —— GitHub 的首页 README 解析顺序是
  `.github/README.md` → 根 `README.md` → `docs/README.md`，放了前者会把面向用户的
  根 README 顶掉，而 CI 与全部门禁照绿。判据：`npm run check:doc-paths` 的
  `homepageFailures`；规则原文见根 [AGENTS.md](../AGENTS.md) 活跃坑。
- 有哪些 workflow、各跑什么见 [../docs/publishing.md](../docs/publishing.md)。
