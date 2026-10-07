# .github/ — 发布链路

- 约定与工作偏好 → 见 [AGENTS.md](AGENTS.md)。

## workflows

| 文件                                 | 触发                           | 做什么                                                                                                                                   |
| ------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [workflows/ci.yml](workflows/ci.yml) | `push` / `pull_request` / 手动 | Ubuntu 与 Windows 双跑：`npm run check` → 真实 Chromium 存储回归 → 校验补丁基线 → 构建宿主提供方 → 窄范围类型检查 → `npm pack --dry-run` |

`ci.yml` 会检出官方 Harness 的精确基线到 `.host-source`，并把该路径经
`DSH_HOST_CHECKOUT` 交给构建与校验脚本。`.host-source/` 已被 `.gitignore` 忽略。

## 不在这里的事

- **发布**：当前没有 `publish.yml`。分发走 GitHub Release 的预构建 tgz，
  步骤见 [../docs/distribution.md](../docs/distribution.md)。
- **分支保护**：在平台设置界面人工开启，不属仓库文件。

## 变更影响路由

- 改任一 workflow → 同步本文件与 [../docs/distribution.md](../docs/distribution.md)。
- 改 `npm run check` 的内容 → 同步根 [AGENTS.md](../AGENTS.md) 的常用命令与
  [../scripts/README.md](../scripts/README.md)。
