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
