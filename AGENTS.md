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
| `.github/workflows/**`                                                                  | [docs/publishing.md](docs/publishing.md) 的 workflows 表与发版节；逐 workflow 显式声明 `permissions`                                       |
| 版本号 / 对外契约                                                                       | `package.json` + 根 [README.md](README.md) + [CHANGELOG.md](CHANGELOG.md) + [docs/verification.md](docs/verification.md)                   |
| 新增可维护目录                                                                          | 双件（`AGENTS.md` 规则层 + `README.md` 文档层）缺一不可，并回填本文档地图                                                                  |

## 常用命令

```powershell
npm run check              # 提交前跑这个：格式 → lint → 分层 → 文档路径 → build → typecheck → 产物断言 → test
npm run format             # prettier --write
npm run demo               # 起 examples/responsive-demo（仅本机）
npm run annotate -- <目录>  # 给本地前端起批注服务（非门禁，见 scripts/README.md）
npm run test:storage       # 真实 Chromium 的 IndexedDB 回归
npm run build:host         # 构建三个宿主提供方并放入 lib/host
npm pack                   # 触发 prepack 完整性断言
npm run release:assets     # 汇总发布产物与 Release 正文（需先 npm pack）
```

`check` 的顺序有依赖：`build` 必须在 `typecheck` 与 `verify:artifacts` 之前（两者都读 `lib/`）。
改顺序前先看 [scripts/README.md](scripts/README.md)。

检查选择：代码 → `npm run check`；文档 → `npm run check:doc-paths` 加人工过链接；
配置 / 契约 → `npm run check:layering` 与相邻模块测试。加本地钩子之后，
「钩子绿了」不等于「门禁绿了」——钩子只跑格式与 lint。

验收脚本需要精确版本 Harness 与已安装 Chromium，见 [验证说明](docs/verification.md)。

## 文档地图

| 想知道                   | 去哪                                                        |
| ------------------------ | ----------------------------------------------------------- |
| 怎么用、怎么装           | [README.md](README.md)（英文 [README_en.md](README_en.md)） |
| 为什么这样设计、防错清单 | [docs/architecture.md](docs/architecture.md)                |
| 宿主补丁如何应用与构建   | [docs/browser-integration.md](docs/browser-integration.md)  |
| 验证到什么程度、还缺什么 | [docs/verification.md](docs/verification.md)                |
| 打包与市场收录           | [docs/distribution.md](docs/distribution.md)                |
| 下一步做什么             | [docs/roadmap.md](docs/roadmap.md)                          |
| 辅助文档区有什么         | [docs/README.md](docs/README.md)                            |
| 页面 picker 与协议       | [src/browser/README.md](src/browser/README.md)              |
| Client 半端与存储        | [src/client/README.md](src/client/README.md)                |
| 各目录怎么改             | [src/README.md](src/README.md)                              |
| 测试覆盖与运行           | [tests/README.md](tests/README.md)                          |
| 脚本做什么、何时跑       | [scripts/README.md](scripts/README.md)                      |
| 发布链路与 CI            | [docs/publishing.md](docs/publishing.md)                    |
| 当时为什么这么定         | [.agents/notes/](.agents/notes/)                            |

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
- 发布：[.github/workflows/release.yml](.github/workflows/release.yml) —— 推 `v*` 标签触发，
  自己构建、自己验收、自己发；**发出去的就是验收过的那一份**，步骤见
  [发布链路](docs/publishing.md) 的发版节。
- 本机门禁：`npm run check` 全绿（格式 / lint / 分层 7 条规则 / 文档路径 / build / typecheck / 单元测试）。
- **当前稳定版是 0.2.1**（GitHub Release 进 Latest、npm 进 `latest`；通道按版本号推导，
  见 [发布链路](docs/publishing.md)）。真实宿主 **26 项 Browser 检查通过**、0 个页面错误，
  npm 与 Release 是同一份字节。0.2.1 只改文档与截图，插件行为与 0.2.0 相同。
  alpha.10–alpha.13 由同一发布链发布（alpha.11 的 npm 那份是本机手发的，字节与 Release 不同 ——
  见 [验证说明](docs/verification.md)）。
- ⚠️ **稳定版不声称已验的三项**：原生 Desktop、真实模型、兼容矩阵。见
  [验证说明](docs/verification.md) —— **不要把未验证当已验证**。

## 待办

> 本区只放**跨模块、照做即可**的短条目；成轮的与未立项的方向进 [docs/roadmap.md](docs/roadmap.md)。
> 做完的立即删，历史去 `git log`。

- [ ] **把 Browser 补丁合入官方 Harness**，让用户不必依赖本包替换官方提供方。
      这是“用户能正常安装”的前置；在此之前安装说明必须写明会替换三行。
- [ ] **原生 Desktop 与真实模型的重新验收**：本轮只验到 Web composition；
      Electron 截图边界由测试替代。记录为未验证，不要据此声称支持。
- [ ] **发布稳定版前的兼容矩阵**：明确支持的 Harness / 浏览器 / 页面组合，
      再决定是否扩大范围。

## 活跃坑

> 只放"不知道就会踩、而且踩了没有任何报错"的陷阱。模块级陷阱写在子树的 `AGENTS.md`。
> **编号化的防错清单在 [架构 §8](docs/architecture.md)** —— 那条是索引，这里只留本仓最容易踩、
> 且还没有编号的几条。

- **`lib/` 不入库，但它才是宿主读的东西** —— 改完源码必须重建，否则跑的是旧产物。
  只改 `src/client/` 刷新页面即可；改宿主半端要重新构建并重启 DSH。
  这条同时是 F10（残缺包）与 F20（`check` 顺序）的前提。
- **共享模块不同步、补丁没重生成、产物残缺** —— 都是同一条链上的静默失败，
  看 [架构 §8](docs/architecture.md) 的 F8–F13，别凭记忆走顺序。
- **`--from-default-profile` 读的是 shipped 模板，不是个人 Profile**；
  但测试 home 必须落在工作区，别把 `DSH_HOME` 指到日常目录。
- **浏览器 `page.evaluate` 里的代码在页面里执行** —— ESLint 的 `no-undef` 会看见它，
  两个验收脚本因此同时声明了 Node 与 browser 全局。
- **PowerShell 变量名大小写不敏感** —— `$docs` 会覆盖 `$Docs`；且 `$Host` / `$HOME`
  等是只读自动变量，给它们赋值**静默失败**（脚本会带着空配置继续跑）。写维护脚本时变量名要真正区分开。
- **本机 `npm` 指向镜像（`registry.npmmirror.com`）时，登录与发布都报
  `Public registration is not allowed`** —— 镜像只读，不提供账号与发布，与地区、账号都无关。
  装包继续用镜像（快），只在发布命令上显式 `--registry=https://registry.npmjs.org`。
  同理 `release.yml` 里的 `registry-url` 不能省，否则 runner 继承到镜像就发不出去。
- **npm 连接里的 `Allowed actions` 默认不含直接发布** —— 2026-09-03 之后新建的 Trusted
  Publisher 连接默认只允许 `npm stage publish`。漏勾 `Allow npm publish` 时，包只进暂存区等人工批准，
  而 **workflow 全绿**：症状是「CI 成功、npm 上没有新版本」。另外新建的连接**有 2 天激活期**，
  过期后连字段都不可改，只能删掉重建。
- **发布成功后头几分钟装不上** —— `npm install <包>@<tag>` 可能报
  `ETARGET … No matching version found`，而 `npm view` 同时已经能看到新版本：那是 npm/CDN 的
  传播延迟。**等几分钟，不是失败**，别急着改版本号重发（重发会被拒，版本号不能复用）。
- **别删「已发布 README 引用过的截图」** —— npm 页面把相对路径的图**重写成
  `raw.githubusercontent.com/<repo>/HEAD/docs/images/<name>`**，取的是**仓库 HEAD**、
  不是包内副本。所以从 HEAD 删掉一个文件名，已发布版本的 npm 页面当场变破图
  （本仓实踩：删 `annotation-region.png` 后 npm 上出现一张 0×0）。
  换图时**沿用文件名**，或确认已发布版本的 README 不再引用它。
- **README 的改动在 npm 上要等下一次发版，而且发完之后页面还会滞后** —— npm 的 README 取自
  **已发布的包**，而图取自 HEAD，所以「仓库里改好了」与「npm 页面上是新的」是两个状态。
  发完版立刻去看还可能看到**上一个版本**的 README 与几张破图（实测约几分钟），
  硬刷新才变 —— **别据此判断发布失败**，先核对 registry 的 `dist-tags`。
- **`releases/latest/download/<文件名>` 不是「永远指向最新版」** —— 安装包的**文件名里带版本号**，
  而这个 URL 只去**当前 Latest 那个 Release** 里找同名资产，所以它只在文件名碰巧属于当前 Latest
  时可用：发下一版时 Latest 一移动，旧文件名就 **404**。市场条目的 `tarball` 因此必须钉具体标签
  （`releases/download/v<版本>/…`），每发一版同步改，漏改**没有红信号**。
  判据不依赖网络实测：`gh api repos/<owner>/<repo>/releases/latest --jq '.assets[].name'`
  看清单里有没有那个文件名。细节见 [分发说明](docs/distribution.md)。
