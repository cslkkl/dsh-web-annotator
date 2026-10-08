# 安装与市场发布

## 当前状态

包名 `dsh-web-annotator`，源码在 [cslkkl/dsh-web-annotator](https://github.com/cslkkl/dsh-web-annotator)。
预构建包通过 GitHub Release 分发，面向精确 Harness **0.2.0-rc.2**，用户不需要编译。
版本号见 [../package.json](../package.json)；npm 尚未发布。
社区目录的条目已提交、**等待维护者审阅**（[awesome-dsh-plugin#6833](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6833)），
**提交不等于收录**：合并并被目录同步之后，才能声明该市场可搜索、可安装。

安装包带有 Browser、Chat、Layout 的派生提供方。整个 bundle 的启用、禁用或卸载由官方插件管理负责；
要恢复官方界面，卸载整个 bundle 后重启。不要单独禁用其中一个组件，因为主插件需要它们提供的接口。

旧的两个 Layout Care 预览包（`dsh-layout-care`、`dsh-layout-care-browser-preview`）应先移除再安装新包，
避免同时挂载两套提供方。

## 公开发布顺序

1. 源码推到公开仓库，设置 `dsh-plugin` topic。
2. bump `package.json` 的版本号与 `CHANGELOG.md` 的对应一节，推 `main`；再推 `v<版本>` 标签。
   [release workflow](../.github/workflows/release.yml) 随后跑门禁、打包产物验收与交付一致性，
   再建出挂着预构建 `.tgz`（外加源码 ZIP 与验证记录）的预览 Release，标明精确宿主版本与 SHA-256。
   alpha 若发 npm，用预览 dist-tag，不把预览冒充稳定版。
3. 完成稳定版所需的原生截图、真实模型与兼容验收后，发布稳定 npm 版本并设置 `latest`。
4. 向社区目录提交 [marketplace 条目](marketplace/cslkkl__dsh-web-annotator.yml)。
   合并并被目录同步后，才能声明该市场可搜索、可安装。
5. 在新 Profile 中走一遍搜索、安装、重启、批注、卸载，记录精确市场与宿主版本。

## 各渠道的收录规则

| 渠道                                   | 要求                                                                             | 本项目的做法                                            |
| -------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| DSH 官方插件管理页 / CLI               | 预构建包声明合法 `dsh.bundle.patch`，可安装 npm spec 或本地 tgz                  | 安装一个预构建包                                        |
| `dshmarket`（awesome-dsh-plugin 目录） | 向目录仓库提交插件 YAML，维护者审阅合并；仓库须创建满一天并带 `dsh-plugin` topic | 条目用 `tarball` 指向已发布的 Release tgz，不必先发 npm |
| 按 GitHub topic 自动发现的市场         | 仓库带 `dsh-plugin` topic；安装方式取决于各市场                                  | 标签便于发现，不等于安装已验收                          |
| Desktop 的 `dsh-community-market`      | 目录解析唯一 npm 包名，要求 npm `latest` 是稳定精确版本                          | alpha 不满足；先验收稳定版再发布 `latest`               |

以上是查阅公开实现得到的规则，未在市场 UI 中实际安装本项目。
其他版本或来源的行为需要分别确认。收录结果由市场维护者决定。
命名协调用的 `dsh-plugin-registry` 是另一个机制，不等于市场目录。

## 条目里的 tarball 必须跟着版本走

[marketplace 条目](marketplace/cslkkl__dsh-web-annotator.yml) 的 `tarball` 钉的是**具体标签**
（`releases/download/v<版本>/…`），不是 `releases/latest/download/…`：

- **为什么不能用 `latest`**：本仓所有 Release 都是预发布版，`/releases/latest` **解析不到任何 Release**
  （实测 `latest/download/<文件>` 直接 404）。上游两种写法都接受，而这里只有钉标签一种可用。
- **代价**：钉标签意味着**每发一版都要同步改这一行**，否则市场指向的是旧包。
  上游的每日探测会在 URL 404 时把 tarball 从站点上摘掉（不会报错，只是静默回落成源码安装），
  所以这行漏改不会有红信号 —— 判据是发版后手跑一次
  `curl -sI https://github.com/cslkkl/dsh-web-annotator/releases/download/v<版本>/dsh-web-annotator-<版本>.tgz`。

上游要求 `url` 与仓库完全一致、描述只说功能且**必须属实**（会被对着代码核），
仓库需创建满一天、带 `dsh-plugin` topic、`package.json` 声明 `dsh.bundle`。
提交前可在目录仓库检出里用 `readEntries()` / `validateEntries()` / `tarballProblem()` 与
`check-submission.mjs --only-list` 自检 —— 全部通过再提 PR。

## 规则来源

- [DSH 插件发布说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/docs/user/develop/basic/publish.zh.md)
- [dshmarket 的 Submit your plugin](https://github.com/dsh-market/dsh-market#submit-your-plugin)
- [awesome-dsh-plugin 贡献指南](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)
- [Desktop Community Market 安装规则](https://github.com/anywhere-labs/dsh-desktop/blob/master/dsh-community-market/docs/install-and-uninstall.zh.md)
