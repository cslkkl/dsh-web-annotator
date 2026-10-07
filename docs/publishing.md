# 发布链路

CI 与发布相关的事实都写在这里。

⚠️ **不要在本目录之外再建 `.github/README.md`。** GitHub 的首页 README 解析顺序是
`.github/README.md` → 根 `README.md` → `docs/README.md`。放了前者，仓库首页会变成这份
维护者文档，把面向用户的根 README 顶掉。判据：本仓只有根 `README.md` 与本案的
`docs/README.md`，`.github/` 下只有 `workflows/`。

## workflows

| 文件                                            | 触发                           | 做什么                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [workflows/ci.yml](../.github/workflows/ci.yml) | `push` / `pull_request` / 手动 | Ubuntu 与 Windows 双跑：`npm run check` → 真实 Chromium 存储回归 → 校验补丁基线 → 构建宿主提供方 → 窄范围类型检查 → `npm pack --dry-run --json`（经 `prepack` 做产物完整性断言） |

`ci.yml` 检出官方 Harness 的精确基线到 `.host-source`，并把该路径经 `DSH_HOST_CHECKOUT`
交给构建与校验脚本。`.host-source/` 已被 `.gitignore` 忽略。
Node 版本只从 [../.node-version](../.node-version) 读。

CI 不跑 `test:acceptance` / `test:harness`：它们需要打包产物、真实 Chromium 与一个完整
Harness 安装，属于发版前的本机验收，见 [验证说明](verification.md)。

## 不在这里的事

- **发布**：本仓没有 `publish.yml`。分发走 GitHub Release 的预构建 tgz，
  步骤见 [分发说明](distribution.md)。
- **分支保护**：在平台设置界面人工开启，不是仓库文件。

## 截图声明

[screenshots.json](../screenshots.json) 是随包发布的截图清单，供市场条目引用。
它是"目录清单"的手写副本，所以由 `npm run check:doc-paths` **双向**校验：
声明的文件必须存在，`docs/images/` 下的截图必须都已登记。
新增截图要同批登记，否则门禁报红。

## 门禁的分工

| 层              | 时机        | 做什么                                                                                              |
| --------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| 本地 pre-commit | 提交前      | 只跑秒级的格式化与 lint，能自动修的自动修，见 [.pre-commit-config.yaml](../.pre-commit-config.yaml) |
| `npm run check` | 提交前 / CI | format → lint → 分层 → 文档路径 → build → typecheck → 产物断言 → 测试                               |
| CI              | push / PR   | 上面全部，另加真实 Chromium 存储回归、补丁基线校验、宿主提供方构建与打包                            |

`check` 的顺序有依赖：`build` 必须在 `typecheck` 与 `verify:artifacts` 之前，
因为两者都读 `lib/`（类型检查读 `lib/vite.d.ts`，产物断言读 `lib/client.js`）。
调整顺序前先看 [../scripts/README.md](../scripts/README.md) 的依赖说明。

钩子按**暂存文件**跑，`check` 跑全量 —— 「钩子绿了」不等于「门禁绿了」。
钩子的 `files:` 与 `package.json` 的 `format:check` glob 是两个家，
由 `tests/format-scope.test.ts` 钉住「门禁 ⊇ 钩子」这个方向。

## 变更影响路由

- 改任一 workflow → 同步本文件与 [分发说明](distribution.md)。
- 改 `npm run check` 的内容或顺序 → 同步根 [AGENTS.md](../AGENTS.md) 的常用命令、
  [../scripts/README.md](../scripts/README.md) 与本案的门禁分工表。
- 改钩子的 `files:` 或 `format:check` 的 glob → 另一处必须同步；
  判据 `tests/format-scope.test.ts` 会拦。
