# 安装与市场发布

## 当前状态

2026-10-06：包名 `dsh-web-annotator`，版本 `0.2.0-alpha.8`。源码位于 [cslkkl/dsh-web-annotator](https://github.com/cslkkl/dsh-web-annotator)，预构建包通过 [GitHub Release](https://github.com/cslkkl/dsh-web-annotator/releases/tag/v0.2.0-alpha.8) 分发，面向精确 Harness **0.2.0-rc.2**，无需用户编译。npm 尚未发布，也尚未被任何市场收录。预览 Release 不等于市场上架完成。

安装包带有 Browser、Chat、Layout 的派生提供方。整个 bundle 的启用、禁用或卸载由官方插件管理负责；要恢复官方界面，卸载整个 bundle 后重启。不要单独禁用其中一个组件，因为主插件需要它们提供的接口。旧 Layout Care 两个预览包应先移除，再安装新包。

## 不同市场的收录方式

DSH 有多个社区市场，规则不同；发布 GitHub 仓库不会立即出现在所有市场。

| 渠道                                       | 当前查到的要求                                                                       | 本项目的发布方式                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| DSH 官方插件管理页 / CLI                   | 预构建包声明合法 `dsh.bundle.patch`，可安装 npm spec 或本地 tgz                      | 安装一个预构建包                                                        |
| `dshmarket`，使用 awesome-dsh-plugin 目录  | 向目录仓库提交插件 YAML，由维护者审阅合并；仓库至少创建满一天并带 `dsh-plugin` topic | 本项目条目通过 `tarball` 指向已发布的预构建 Release tgz，无需先发布 npm |
| 按 GitHub topic 自动发现的市场             | 公开仓库带 `dsh-plugin` topic；实际安装方式取决于各市场                              | 标签便于发现，不等于安装已验收                                          |
| Desktop 的 `dsh-community-market` 新版实现 | 目录解析唯一 npm 包名，npm `latest` 是稳定精确版本，并带合法 bundle patch            | alpha 不满足稳定版要求；先验收稳定版，再发布对应 `latest`               |

以上是 2026-10-04 查阅的公开实现，未在市场 UI 实际安装本项目，其他版本或来源的行为需分别确认。

## 公开发布顺序

1. 将源码推到 `cslkkl/dsh-web-annotator`，设置 `dsh-plugin` topic。
2. 发布已验收的预构建 `.tgz` 至 GitHub Release，标明预览版和精确宿主版本。alpha 的 npm 发布应使用预览 dist-tag，不把预览冒充稳定版。
3. 完成稳定版所需的原生图片提交、真实模型与兼容验收后，发布稳定 npm 版本并设置 `latest`。npm `repository` 必须指回公开仓库。
4. 向 `awesome-dsh-plugin/awesome-dsh-plugin` 提交 `docs/marketplace/cslkkl__dsh-web-annotator.yml`。合并并被目录同步后，才能声明该市场可搜索和安装。
5. 在市场中用新的测试 Profile 走搜索、安装、重启、批注及卸载，再记录精确市场与宿主版本。

收录结果由市场维护者决定。命名协调的 `dsh-plugin-registry` 是另一个机制，不等于市场目录。

最快的当前路线是通过 Release tgz 申请 `dshmarket` 目录收录，不必等待 npm 稳定版。候选条目已带钉住版本的 `tarball` URL，避免市场尝试安装没有预构建产物的 GitHub 源码。仓库创建于北京时间 2026-10-04 01:09:55，满足一天要求的时间为 2026-10-05 01:09:55 之后。条目准备完成不代表已提交或获准收录。

## 规则来源

- [DSH 插件发布说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/docs/user/develop/basic/publish.zh.md)
- [dshmarket 的 Submit your plugin](https://github.com/dsh-market/dsh-market#submit-your-plugin)
- [awesome-dsh-plugin 贡献指南](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)
- [Desktop Community Market 安装规则](https://github.com/anywhere-labs/dsh-desktop/blob/master/dsh-community-market/docs/install-and-uninstall.zh.md)

## alpha.8 草稿迁移

更新后会把原 localStorage 中的批注和截图迁移到 IndexedDB，提交成功后才清除旧值；迁移失败会保留旧值并提示。旧 alpha.7 无法读取新数据库，若要降级，请先发送需要保留的草稿。卸载插件不会自动删除 IndexedDB 中的未发送批注。
