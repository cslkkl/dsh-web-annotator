# 验证

分三层：常规门禁、存储回归、真实宿主验收。三者不可互相替代。

## 一、常规门禁

```powershell
npm run check
```

格式 → lint → 分层 → 文档路径 → build → typecheck → 单元与真实 Vite 测试。
不读个人 Profile、不联网。覆盖范围见 [../tests/README.md](../tests/README.md)。
请求快照保存在 `tests/snapshots/annotation-request.zh.txt`。

## 二、存储回归（真实 Chromium）

```powershell
$env:WEB_ANNOTATOR_BROWSER_CHANNEL = 'msedge'   # 或 chrome
npm run test:storage
```

覆盖：旧键迁移只在新键提交后删除、超过 localStorage 配额的真实 JPEG 队列重载、
逐条编辑与会话隔离、写入失败保留并重试、只移除本次发送的 ID、显式删除持久数据。

结果写到 `integration/storage-verification.json`。

## 三、真实宿主验收

需要精确版本 Harness 0.2.0-rc.2、配套提供方、已安装 Chromium，以及一个打包产物。

```powershell
npm run build                      # 先产出 lib/
npm run build:host                 # 三个宿主提供方 → lib/host
npm pack
$env:WEB_ANNOTATOR_TARBALL = (Resolve-Path ./dsh-web-annotator-<版本>.tgz).Path
$env:WEB_ANNOTATOR_BUNDLED_HOST = '1'
npm run test:acceptance            # 真实 Browser + 打包产物 + replay 模型
```

测试 home 落在**仓库父目录**的 `work/`，由脚本创建并清理；不写个人 Profile。
`session/list` 的线上参数是 `_request`。

覆盖：工具栏挂载位置、点选不触发网页按钮、评论中的空格、按住空格操作网页、
真实拖动矩形、空白位置、Shadow DOM、滚动与 Escape、明暗主题、页面隔离、失败重试、
全屏与壁纸玻璃下的命中与恢复、属性框中文输入法确认、保存后编辑、分批勾选预览、
窄窗口、目标删除后的确认按钮、聊天内“N 条注释”折叠与逐条卡片、附件截图上的序号徽标
（在真实页面里重画后按像素判定）、混合队列的图片序号与附件入库、满队列分批发送。

这一套命令就是 [release workflow](../.github/workflows/release.yml) 在标签上跑的那一套：
**发出去的 tgz 必须就是这里验收过的那一份**，所以发布链路自己构建、自己验收、自己发，
不会「在别处重建一份同一份代码」再挂上去（换台机器重建，产物的 sourcemap 就变了字节）。
本机先跑一遍只是为了早失败，它不是发布门禁。

结果写到 `integration/annotation-artifacts/`（截图、请求正文、transcript、`report.json`）。

### 只验 replay 的部分

模型端使用官方 `dsh-llm-replay`，不调用真实模型。
replay 证明的是**请求路由与持久化日志**，不是模型真的改了源码。

## 四、打包一致性

```powershell
npm run verify:delivery
```

把当前 tgz 逐文件与验收时安装的运行时比对：`lib/**` 与 `cordis.patch.yml` 必须逐字节相同，
`package.json` 除 `devDependencies` 外必须相同。需要先跑过 `test:acceptance`。

## 五、验到了什么 / 没验什么

按版本记录的结论在 `integration/*.json`，不抄进本文档。以下边界在任何版本都成立：

| 项目                                            | 状态                                   |
| ----------------------------------------------- | -------------------------------------- |
| 带扩展的真实 Harness Web 中的批注流程           | 已验证                                 |
| 元素点选、矩形框选、空白位置、空格临时操作      | 已验证                                 |
| 图片与详细资料折叠、真实附件入库                | 已验证（截图边界用测试替代 Electron）  |
| 真实 DSH Desktop 的元素点选、属性卡片、原生截图 | 人工验证过，未随每次发布复验           |
| **真实模型据此修改源码**                        | **未验证**                             |
| **Electron 原生截图边界的自动化验收**           | **未验证**（Web 测试替代了该边界）     |
| 其他远程页面、跨源与嵌套 iframe 内部            | 逐个页面分别验收                       |
| 官方 monorepo 的覆盖率与平台门禁                | 未运行；本包的窄范围类型检查不等同于它 |
| 市场 UI 中的搜索与一键安装                      | 未验证                                 |

不要用单测绿色代替真实宿主验收，也不要用 Web 结果代替 Desktop 结果。

## 六、按版本的验收记录

明细落在本地未入库的 `integration/*.json`；这里只留可复述的结论。

### 0.2.1（2026-10-12）

**插件行为与 0.2.0 完全相同**，改的只有文档与截图。本版存在的理由是：npm 的 README 取自
**已发布的包**，所以重做的首页在仓库里生效、在 npm 上要等一次发版（图不等 —— 图走 HEAD）。

| 项目                      | 结果                                                     |
| ------------------------- | -------------------------------------------------------- |
| 发布链                    | 通过；`published 0.2.1 to npm under the latest dist-tag` |
| `npm run test:acceptance` | **26 项 Browser 检查通过**，0 个页面错误                 |
| npm ↔ Release 字节一致    | `bf3229f0…`（两处 SHA-1 相同）                           |
| 通道                      | GitHub Latest + npm `latest`；`alpha` 仍停在预览版       |

文档侧这一轮修掉两处**事实错误**（不是排版偏好）：

- README 的 5 张截图停在 2026-10-04，早于输入框入口改成透明按钮，展示的是用户拿不到的界面；
  其中一张还带着已退休的产品名与一条失败提示（验收脚本故意中断提交留下的横幅）。
  新图按当前版本重截并逐张裁到对应段落讲的那块区域。
- [分发说明](distribution.md) 里「不能用 `releases/latest` 是因为本仓全是预发布版」这条理由
  在 0.2.0 之后已不成立。真实原因是**资产文件名带版本号**，`latest/download/<文件名>` 只去
  当前 Latest 里找同名资产 —— 发下一版就 404，比钉标签更糟。判据换成查资产清单，不依赖网络。

⚠️ **发完版别立刻看 npm 页面下结论。** 本次实测：发布成功后页面仍显示上一个版本的 README
与两张破图，几分钟后（硬刷新）才更新。先核对 registry 的 `dist-tags`。

### 0.2.0（2026-10-12）

第一个稳定版。改动只有版本号与文档：发布通道按版本号推导，所以本版自动进 GitHub 的 **Latest**
与 npm 的 **`latest`**（不需要改 workflow —— 那正是上一版改动的目的）。

| 项目                      | 结果                                                         |
| ------------------------- | ------------------------------------------------------------ |
| 发布链                    | 通过；通道判断为 `prerelease=false / npmTag=latest`          |
| `npm run test:acceptance` | **26 项 Browser 检查通过**，0 个页面错误                     |
| npm ↔ Release 字节一致    | 由同一次 CI 构建与验收，逐字节相同                           |
| GitHub 的 Latest          | 本版之后 `/releases/latest` 才第一次能解析（此前全是预发布） |

⚠️ **本版不声称下面三项已验证** —— 它们正是"稳定版"这个词最容易被误读的地方，逐项写清：

| 边界         | 状态                                                                 |
| ------------ | -------------------------------------------------------------------- |
| 原生 Desktop | **未验证**；只验到 Web composition，Electron 截图边界由 Web 测试替代 |
| 真实模型     | **未验证**；验收用官方 replay 适配器                                 |
| 兼容矩阵     | **未定**；精确支持 Harness 0.2.0-rc.2，其他版本未验                  |

### 0.2.0-alpha.13（2026-10-12）

本轮把**发布通道改成按版本号推导**：带预发布段的版本 → GitHub 的 Pre-release + npm 的预览
dist-tag；稳定版 → Latest + `latest`。判断在可测的 `releaseChannel()` 里，判据见
[tests/release-notes.test.ts](../tests/release-notes.test.ts)。

原先两处写死在 workflow 里（`--prerelease` 与 `--tag alpha`），后果是**给稳定版打标签会发出
一个「标着预发布、npm 上仍留在旧 alpha」的版本，而日志里看不出任何异常** —— 这类判断必须可测，
所以它从 YAML 搬进了脚本。

| 项目                      | 结果                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| 发布链                    | 通过；注解 `published 0.2.0-alpha.13 to npm under the alpha dist-tag`                    |
| `npm run test:acceptance` | **26 项 Browser 检查通过**，0 个页面错误（本机也跑了一遍，同样 26 项）                   |
| **通道按版本号生效**      | Release `prerelease=true`、npm `alpha` 指向 alpha.13，而 `latest` **未被抢**（仍在旧版） |
| npm ↔ Release 字节一致    | `18e02e6a…`（两处 SHA-1 相同）                                                           |

⚠️ **第一次运行在验收步骤失败，第二次通过，其间没有改任何代码。** 失败原因是浏览器控制台
报了一个 `404`，而 Chrome 的那条消息**不带 URL**，所以当时无法判断是哪个资源。这暴露的是
**诊断缺陷**而不是产品缺陷：现在脚本会记录 4xx/5xx 响应的 URL，断言消息会把它带出来，
`report.json` 里也留一份 `failedResponses`（通过时也留，好让"断言之后才到达的偶发 404"有痕迹）。
判定仍是 `errors` 必须为空 —— 只加证据，不放宽标准。

### 0.2.0-alpha.12（2026-10-12）

本轮**不改插件代码**（界面行为与 alpha.11 相同），改的是发布链路：新增 npm 一路，
认证走 OIDC Trusted Publishing，仓库里不存 token。本版同时是那条 Trusted Publisher
连接的激活发布 —— 新建的连接有 2 天期限，过期即不可编辑。

| 项目                       | 结果                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| 发布链                     | 23 步一次通过；npm 那步的注解是 `published 0.2.0-alpha.12 to npm under the alpha dist-tag` |
| `npm run test:acceptance`  | 打包产物 + 包内提供方，**26 项 Browser 检查通过**，0 个页面错误                            |
| `npm run verify:delivery`  | 交付的 tgz 与验收时安装的运行时逐字节一致，无变更文件                                      |
| **npm ↔ Release 字节一致** | 新增判据：npm 上 `dist.shasum` 与 Release 附件的 SHA-1 **完全相同**                        |

最后那条是本轮真正要证的东西。alpha.11 是**在本机打的包**，与 Release 附件有 22 个文件不同 ——
差异只在 provider 产物里写进的检出目录名（`../harness-browser-integration/…` 对 `.host-source/…`）
以及三份发布后才改的文档，代码等价，但「发出去的就是验收过的那一份」在 npm 这条渠道上不成立。
现在由 CI 在同一个 job 里构建、验收、发布，两个渠道拿到同一份字节。

⚠️ **`latest` 会滞后**：npm 只在**全新包的首个版本**强制占用 `latest`，之后 `--tag alpha`
不会去动它，所以 `latest` 停在 alpha.11。这不等于「预览冒充稳定版」，但 Desktop 社区市场
仍不满足（它要求 `latest` 是稳定精确版本）。

### 0.2.0-alpha.11（2026-10-11）

本轮只有一个改动：输入框左侧的“批注网页”从 `variant="toolbar"` 改成 `ghost`。
`toolbar` 是给 Browser 标签页工具栏准备的实心样式，放在输入框那一排会显得像被选中，
与旁边同为透明的“工作区内修改”不一致；Browser 工具栏里的同名按钮**保持实心**不变。

| 项目                      | 结果                                                            |
| ------------------------- | --------------------------------------------------------------- |
| `npm run check`           | 49 项单元测试全绿                                               |
| `npm run test:storage`    | 4 项通过                                                        |
| `npm run test:acceptance` | 打包产物 + 包内提供方，**26 项 Browser 检查通过**，0 个页面错误 |
| `npm run verify:delivery` | 交付的 tgz 与验收时安装的运行时逐字节一致，无变更文件           |
| Release                   | 三个附件齐全（tgz / 源码 ZIP / 验证记录），发布链一次通过       |

判据不是“看着顺眼”，而是量出来的：在隔离 profile 里用 `getComputedStyle` 取相邻控件的
`background-color`，改后“批注网页”与“工作区内修改”同为 `rgba(0, 0, 0, 0)`。
宿主提供方、补丁与存储格式都没动，因此这一版不可能影响已有草稿。

这一版还多了一层只可能由人给出的证据：alpha.11 以**已发布的 URL** 装进本机 `web` profile、
重启之后，**由人确认输入框那一行的按钮确实变透明了**。“量出来是透明的”与“看起来是透明的”
在这里是两件事，所以两条分开记。

### 0.2.0-alpha.10（2026-10-08）

本轮改动是聊天内的批注呈现（折叠成“N 条注释”与逐条卡片、附件上的序号徽标重画），
并把从未发布过的 0.2.0-alpha.9 一并带出去。**整条发布链路在本机完整跑了一遍**，
与 [release workflow](../.github/workflows/release.yml) 在标签上跑的是同一套命令：

| 项目                      | 结果                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run check`           | 格式 / lint / 分层 7 条规则 / 文档路径 / build / typecheck / 产物断言 / **49 项单元测试**全绿 |
| `npm run test:storage`    | 4 项通过：旧键迁移只在新键提交后删除、>8 MB 队列重载、写入失败保留与重试、显式删除            |
| `npm run test:acceptance` | 打包产物 + 包内提供方，**26 项 Browser 检查通过**，0 个页面错误                               |
| `npm run verify:delivery` | 交付的 tgz 与验收时安装的运行时逐字节一致，无变更文件                                         |
| `npm run release:assets`  | Release 正文、源码 ZIP 与验证记录齐备                                                         |
| `npm pack`                | `prepack` 完整性断言通过                                                                      |

本轮新增的两项机器判据：折叠状态的文案与展开后的卡片数，以及在本页里重画附件后
按像素确认序号徽标落在所选范围的角上。

发布链路本身的顺序也是这一轮修的：`ci.yml` 里的 `verify:browser-patch` 曾经排在打补丁**之前**，
在干净的 `.host-source` 上第一个文件就必挂；已改成先 apply 再 verify，`release.yml` 同序。

**仍未验收**：原生 Desktop 的 guest / 截图 / 快捷键、真实模型改动源码、其他远程页面、
官方 monorepo 门禁、市场 UI 安装。不要据此声称这些已支持。

### 0.2.0-alpha.9（2026-10-07，打好了包但从未发布）

这一版 bump 了版本号、也打过 tgz，却没有推标签、没有建 Release，随后又被 alpha.10 覆盖，
所以它的改动随 alpha.10 一并发布 —— **不要**把它当成一个用户下载得到的版本。

本轮改动是删除 0.1 遗留层、统一 `web-annotator` 命名并迁移存储键，因此重点验证真实的安装与发送路径。

| 项目                           | 结果                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `npm run check`                | 格式 / lint / 分层 7 条规则 / 文档路径 / build / typecheck / 单元测试全绿          |
| `npm run test:storage`         | 4 项通过：旧键迁移只在新键提交后删除、>8 MB 队列重载、写入失败保留与重试、显式删除 |
| `npm run test:harness`         | 真实 Harness 0.2.0-rc.2 + 官方 replay，2 轮对话通过                                |
| `npm run test:acceptance`      | 打包产物 + 包内提供方，**24 项 Browser 检查通过**，0 个页面错误                    |
| `npm run verify:browser-patch` | 补丁可应用到精确基线，并复现 26 个已审阅文件                                       |
| `npm run verify:delivery`      | 交付的 tgz 与验收时运行的包逐字节一致，无变更文件                                  |
| `npm pack`                     | `prepack` 完整性断言通过                                                           |

验收还确认了一件与本轮修复直接相关的事：测试 home 现在落在**检出目录的父目录** `work/` 下，
不再越级写到上层目录。

**仍未验收**：原生 Desktop 的 guest / 截图 / 快捷键、真实模型改动源码、其他远程页面、
官方 monorepo 门禁、市场 UI 安装。不要据此声称这些已支持。

### 未发布记录（2026-10-07）

聊天内批注呈现最初是在`未发布`状态下验的：只改 Client 半端的呈现与发送前的附件重画，
宿主提供方与补丁未动，所以当时按“本包 + 已构建提供方”跑真实宿主验收，没有重新打包 tgz。
那一批改动已并入 0.2.0-alpha.10 的验收（见上），这里只留当时的边界结论。

## 七、手工验收清单（无自动化时）

无法跑脚本时的最小手工路径：

1. 安装打包 tgz，重启 Desktop。
2. 打开 Browser，确认工具栏出现“批注网页”，且位于“刷新”左侧。
3. 点选一个元素，确认网页自身的按钮没有触发。
4. 框选一块区域，确认矩形与选区一致。
5. 输入中文并切换输入法确认，确认不会误保存。
6. 按住空格操作网页，松开回到批注。
7. 发送到当前会话，确认聊天里只显示“N 条注释”，展开后逐条给出目标元素与你的输入，
   点“查看定位资料”能看到完整请求；图片模式再看一眼截图上的序号徽标。
8. 卸载 bundle，重启，确认官方 Browser 恢复。
