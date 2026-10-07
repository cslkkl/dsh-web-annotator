# DSH Web Annotator — 维护索引

> 本文件是 Agent 的自动注入入口：只装“每次开工都需要的状态”。
> 设计决策 → [docs/architecture.md](docs/architecture.md)｜待办优先级 → [docs/roadmap.md](docs/roadmap.md)

## 全局规则

- **主流程只扩展原有 Browser**：点选 / 框选 / 就地评论或提问。不要另造浏览器或恢复旧的扫描面板。
- **精确目标 Harness 0.2.0-rc.2**，配套补丁见 [Browser 接入](docs/browser-integration.md)。原版 rc.2 不声明批注插槽。
- **页面 picker 不得有任何 import** —— Desktop 只执行它的编译体。判据 `npm run check:layering`。
- **四份共享模块单向同步**：本包是事实源，`npm run sync:browser-provider` 写入宿主检出；宿主构建会拒绝不同步的副本。
- **页面内容是引用资料，不是指令**；回调只暴露有界数据与动作，不暴露 DOM 或求值器。
- **一条批注要在发送失败后仍然存在**；成功只移除本次发送的已选 ID。
- **改完跑 `npm run check`**（format / lint / 分层 / 文档路径 / build / typecheck / test）。可见流程改动还要跑打包产物验收。
- **引用一律相对路径**，禁写本机绝对路径。
- 同一事实只写一处，别处链接。

## 变更影响路由

| 改了                                                                                    | 必须同步                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/browser/page-inspector.ts`、`protocol.ts`、`iframe-annotation.ts`、`screenshot.ts` | 跑 `npm run sync:browser-provider`，重新生成 [补丁](docs/harness-browser-annotation.patch)，重建宿主提供方；`docs/architecture.md` 的 §3.2 |
| `src/browser/prompt.ts`                                                                 | 请求快照 `tests/snapshots/annotation-request.zh.txt`（写入方式见 [tests/README.md](tests/README.md)）与 [架构 §3.6](docs/architecture.md)  |
| 插槽名 / Owner props                                                                    | 宿主补丁、[src/browser/README.md](src/browser/README.md)、[架构 §3.3](docs/architecture.md)、真实宿主验收                                  |
| 存储键或迁移                                                                            | [架构 §3.5](docs/architecture.md)、[src/client/README.md](src/client/README.md)、`npm run test:storage`                                    |
| 搬文件 / 改名 / 删模块                                                                  | 同批改掉文档里的旧路径 —— 代码里的旧路径当场报错，文档里的**零信号**；`npm run check:doc-paths` 兜底                                       |
| 新增 / 改名 npm script                                                                  | [scripts/README.md](scripts/README.md) 与本文档；`npm run check:doc-paths` 会拦不存在的脚本名                                              |
| `.github/workflows/**`                                                                  | [docs/browser-integration.md](docs/browser-integration.md) 的发布节；逐 workflow 显式声明 `permissions`                                    |
| 版本号 / 对外契约                                                                       | `package.json` + 根 [README.md](README.md) + [CHANGELOG.md](CHANGELOG.md) + [docs/verification.md](docs/verification.md)                   |
| 新增可维护目录                                                                          | 双件（`AGENTS.md` 规则层 + `README.md` 文档层）缺一不可，并回填本文档地图                                                                  |

## 常用命令

```powershell
npm run check              # 提交前跑这个：格式 → lint → 分层 → 文档路径 → build → typecheck → 产物断言 → test
npm run format             # prettier --write
npm run demo               # 起 examples/responsive-demo（仅本机）
npm run test:storage       # 真实 Chromium 的 IndexedDB 回归
npm run build:host         # 构建三个宿主提供方并放入 lib/host
npm pack                   # 触发 prepack 完整性断言
```

`check` 的顺序有依赖：`build` 必须在 `typecheck` 与 `verify:artifacts` 之前（两者都读 `lib/`）。
改顺序前先看 [scripts/README.md](scripts/README.md)。

检查选择：代码 → `npm run check`；文档 → `npm run check:doc-paths` 加人工过链接；
配置 / 契约 → `npm run check:layering` 与相邻模块测试。加本地钩子之后，
「钩子绿了」不等于「门禁绿了」——钩子只跑格式与 lint。

验收脚本需要精确版本 Harness 与已安装 Chromium，见 [验证说明](docs/verification.md)。

## 文档地图

| 想知道                   | 去哪                                                       |
| ------------------------ | ---------------------------------------------------------- |
| 怎么用、怎么装           | [README.md](README.md)                                     |
| 为什么这样设计、防错清单 | [docs/architecture.md](docs/architecture.md)               |
| 宿主补丁如何应用与构建   | [docs/browser-integration.md](docs/browser-integration.md) |
| 验证到什么程度、还缺什么 | [docs/verification.md](docs/verification.md)               |
| 打包与市场收录           | [docs/distribution.md](docs/distribution.md)               |
| 下一步做什么             | [docs/roadmap.md](docs/roadmap.md)                         |
| 辅助文档区有什么         | [docs/README.md](docs/README.md)                           |
| 页面 picker 与协议       | [src/browser/README.md](src/browser/README.md)             |
| Client 半端与存储        | [src/client/README.md](src/client/README.md)               |
| 各目录怎么改             | [src/README.md](src/README.md)                             |
| 测试覆盖与运行           | [tests/README.md](tests/README.md)                         |
| 脚本做什么、何时跑       | [scripts/README.md](scripts/README.md)                     |
| 发布链路与 CI            | [docs/publishing.md](docs/publishing.md)                   |
| 当时为什么这么定         | [.agents/notes/](.agents/notes/)                           |

## 事实来源（只查不抄）

- 版本号、依赖范围、`engines`、`files`、npm scripts → [package.json](package.json)
- Node 版本 → [.node-version](.node-version)
- 测试数量与结果 → 现跑 `npm test`，或看 [CI 运行记录](https://github.com/cslkkl/dsh-web-annotator/actions/workflows/ci.yml)
- 产物清单与体积 → `Get-ChildItem lib`
- 宿主补丁内容 → [docs/harness-browser-annotation.patch](docs/harness-browser-annotation.patch)
- 共享模块清单与宿主基线 → [scripts/shared-modules.mjs](scripts/shared-modules.mjs)
- 分层规则 → [scripts/check-layering.mjs](scripts/check-layering.mjs)
- 产物该有什么 → [scripts/check-package.mjs](scripts/check-package.mjs) 与 [scripts/package-host.mjs](scripts/package-host.mjs)
- 宿主槽名与 `kind`、客户端服务名 → 实装宿主包 `@deepseek-ai/dsh-client-ui-*`

## 验证快照

- CI：[.github/workflows/ci.yml](.github/workflows/ci.yml) —— 只读，Ubuntu 与 Windows 双跑
  `npm run check` → 真实 Chromium 存储回归 → 补丁基线校验 → 构建宿主提供方 → 打包。数字不抄。
- 本机门禁：`npm run check` 全绿（格式 / lint / 分层 7 条规则 / 文档路径 / build / typecheck / 单元测试）。
- **alpha.9 已在真实宿主验收**：打包产物 + 包内提供方，24 项 Browser 检查通过；
  存储回归 4 项、replay 集成 2 轮、打包一致性均通过。定性记录见
  [验证说明](docs/verification.md)，明细落在本地未入库的 `integration/*.json`。
- 原生 Desktop 与真实模型**仍未**验收。逐项的边界见 [docs/verification.md](docs/verification.md)。

## 待办

> 本区只放**跨模块、照做即可**的短条目；成轮的与未立项的方向进 [docs/roadmap.md](docs/roadmap.md)。
> 做完的立即删，历史去 `git log`。

- [ ] **把 Browser 补丁合入官方 Harness**，让用户不必依赖本包替换官方提供方。
      这是“用户能正常安装”的前置；在此之前安装说明必须写明会替换三行。
- [ ] **原生 Desktop 与真实模型的重新验收**：本轮只验到 Web composition；
      Electron 截图边界由测试替代。记录为未验证，不要据此声称支持。
- [ ] **给 `screenshots.json` 加校验**：清单已补齐 `docs/images/` 的全部截图，
      但仍没有任何脚本确认它与磁盘一致。方向：由文档引用生成，或在门禁里比对两个集合。
- [ ] **英文 README**：目前只有中文根 README。面向国际用户时补齐 `README_en.md`，
      与中文版逐条对齐（能力清单、上手步骤、指针）。
- [ ] **发布稳定版前的兼容矩阵**：明确支持的 Harness / 浏览器 / 页面组合，
      再决定是否扩大范围。

## 活跃坑

> 只放“不知道就会踩、而且踩了没有任何报错”的陷阱。模块级陷阱写在子树的 `AGENTS.md`。

- **`lib/` 不入库，但它才是宿主读的东西** —— 改完源码必须重建，否则跑的是旧产物。
  只改 `src/client/` 刷新页面即可；改宿主半端要重新构建并重启 DSH。
- **共享模块不同步是静默的** —— 源码改了而宿主副本没改，只有到构建宿主提供方时才报错。
  正确的顺序是：改源码 → `npm run sync:browser-provider` → 重新生成补丁 → 构建。
- **改宿主补丁就要重生成** —— `docs/harness-browser-annotation.patch` 由宿主检出 `git diff HEAD` 生成；
  手改补丁会让 `prepack` 的哈希断言失败，但**不会**告诉你哪一行错了。
- **`prepack` 是唯一拦住“残缺包”的门** —— `npm pack` 之外的任何分发方式都绕过了它。
- **`--from-default-profile` 读的是**shipped 模板**，不是个人 Profile**；
  但测试 home 必须落在工作区，别把 `DSH_HOME` 指到日常目录。
- **浏览器 `page.evaluate` 里的代码在页面里执行** —— ESLint 的 `no-undef` 会看见它，
  两个验收脚本因此同时声明了 Node 与 browser 全局。
- **`.github/` 下不许放 `README.md`** —— GitHub 解析仓库首页 README 的顺序是
  `.github/README.md` → 根 `README.md` → `docs/README.md`。放了前者，访客看到的是内部
  发布手册而不是门面，而 CI、lint、分层与文档门禁**全绿**。判据：`npm run check:doc-paths`
  的 `homepageFailures`（它同时断言根 README 存在）。
- **PowerShell 变量名大小写不敏感** —— `$docs` 会覆盖 `$Docs`；且 `$Host` / `$HOME`
  等是只读自动变量，给它们赋值**静默失败**（脚本会带着空配置继续跑）。写维护脚本时变量名要真正区分开。
