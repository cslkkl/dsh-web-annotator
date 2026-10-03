# Browser 集成预览

原版 Harness rc.2 没有 Browser 批注插槽。此仓库配套的补丁扩展 `packages/client/ui-sidebar-browser` 与 `packages/client/ui-chat`：Browser 增加批注插槽、受限 picker 和桌面截图；Chat 声明用户正文 chain，让插件折叠自己识别的批注消息。它尚未合入官方 Harness。

批注按钮位于原有 Browser 工具栏中，紧挨“刷新”按钮左侧。点击后在当前网页里点选或框选，并就地输入评论或问题。

[下载 / 审阅配套补丁](harness-browser-annotation.patch)。补丁也更新 Browser 包和 Sidebar 子系统的中英文说明。

## 源码基线与构建

在插件目录旁检出 `harness-browser-integration`，使用官方 tag `dsh-v0.2.0-rc.2`（commit `639ed015397290b3745d163aafe02ffee4aa3f84`）。在该检出里应用 `harness-browser-annotation.patch`，不要对其他版本直接套用。

```sh
git apply --check /absolute/path/to/harness-browser-annotation.patch
git apply /absolute/path/to/harness-browser-annotation.patch
```

回到插件目录运行 `npm run build:browser-provider`，生成 `integration/browser-provider`。这个局部构建不修改已安装的 Harness，CSS 跟随提供方的插件生命周期。改动共同 picker 后运行 `node scripts/sync-browser-provider.mjs`，重新审查补丁；构建会拒绝不同步的共同模块。

Chat 提供方用 `npm run build:chat-provider` 构建，`npm run typecheck:chat-provider` 做局部类型检查；它保留原有消息容器、附件与操作，只增加正文呈现 chain。

Layout 提供方用 `npm run build:layout-provider` 构建，`npm run typecheck:layout-provider` 做局部类型检查。它只在右栏全屏时隐藏并将主内容设为 inert，保持组件及尺寸，避免玻璃主题创建的层叠上下文让聊天输入框覆盖网页。退出全屏恢复原有草稿。

完整官方构建请按 Harness 仓库说明进行。当前预览脚本不是完整 monorepo 发布管线。精确声明的局部检查可用 `npm run typecheck:browser-provider`，不能替代官方检查。

## 单包分发与独立验收

三个提供方构建完成后，运行 `npm run build:host` 将它们放入主包的 `lib/host`，然后运行 `npm pack`。一个 `dsh-web-annotator-0.2.0-alpha.7.tgz` 同时包含插件、宿主扩展和许可证，无需用户额外编译。可用 `DSH_HOST_CHECKOUT` 指定其他位置的同一精确基线检出。

安装包自己的 `cordis.patch.yml` 禁用 stock Browser、Chat 和 Layout 行，再插入包内扩展提供方。Loader 的按 ID patch 中 `name` 只能断言已有名称，不能重命名，因此使用新的行 ID。卸载整个 bundle 后这些替换随 bundle 层撤销。

`prepack` 检查三套提供方、主包入口、精确版本和补丁哈希，缺少或过期时拒绝打包。`lib/host/bundle.json` 记录宿主来源与产物哈希，保留原始 MIT 许可证和 bundle 依赖的许可证。这不是官方 Harness 发行版，尚未公开发布。

验收使用独立 Profile、官方 replay 模型和临时会话日志。设置 `WEB_ANNOTATOR_BUNDLED_HOST=1` 后，脚本只安装这个打包产物，不挂载源码路径的提供方。测试配置禁用真实模型，不能复制到日常 Profile。

在日常 Profile 中试用时，通过官方 `dsh plugin --profile <profile> add --ignore-scripts <插件tgz绝对路径>` 安装，并正常退出后重开 Desktop。由旧的本地 Layout Care 预览包迁移时，先通过官方插件管理移除 `dsh-layout-care` 和 `dsh-layout-care-browser-preview`，再安装新包，避免同时挂载两套提供方。已有批注的存储键和页面连接协议保持兼容；Vite 项目可改用新包的 `webAnnotator`，新包也提供旧 `layoutCare` 函数别名。

GitHub 源码没有提交 `lib`；市场安装应使用发布到 npm 的预构建包或 GitHub Release 的 `.tgz`，不能把需要旁边宿主检出的源码 URL 当作可直接安装包。市场收录见 [分发说明](distribution.md)。

## Web 与 Desktop

Web 提供方只向 Browser 自己拥有的 iframe 发送有界请求。目标页面需启用本包的 Vite 开发连接，并允许 Harness 的精确来源；iframe 的嵌入政策仍然生效。

Desktop 提供方针对 main 已批准的 webview，执行固定 picker 的编译函数，并在保存后调用 guest 的 `capturePage()`。图片经 Canvas 标注与缩放，以 JPEG 附件发送；导航、视口或滚动位置变化会拒绝混用截图，捕获失败保留定位资料。Web 不提供原生视口捕获，因此没有截图时只提供定位资料。此实现还需要真实 DSH Desktop 的 guest / 导航 / 关闭 / 快捷键验收，不能依据 Web 测试声称任意远程页面已经支持。
