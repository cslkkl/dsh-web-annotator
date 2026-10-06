# 验证

常规 `npm run check` 执行格式、构建、类型与单元 / 真实 Vite 测试。请求快照保存在 `tests/snapshots/annotation-request.zh.txt`。它不能替代 Browser 集成验收。

完整验收需要精确版本 Harness 0.2.0-rc.2、配套 Browser 提供方，以及 Microsoft Edge（或通过 `LAYOUT_CARE_BROWSER_CHANNEL` 指定已安装 Chromium）。先按照 [Browser 接入](browser-integration.md) 构建本地扩展。

```powershell
npm run check
npm run test:storage
npm run build:browser-provider
npm run typecheck:browser-provider
npm run build:chat-provider
npm run typecheck:chat-provider
npm run build:layout-provider
npm run typecheck:layout-provider
npm run build:host
npm pack
$env:LAYOUT_CARE_TARBALL = (Resolve-Path ./dsh-web-annotator-0.2.0-alpha.8.tgz).Path
$env:WEB_ANNOTATOR_BUNDLED_HOST = '1'
npm run test:acceptance
```

`DSH_CLI_ENTRY` 可指定 Harness `lib/bin.js` 的绝对路径；默认使用当前机器安装的 CLI。脚本在仓库旁 `work/` 创建独立 Harness home，通过正式 `dsh plugin` 安装一个打包产物，用包内提供方运行原有 Browser，并从已安装产物加载 Vite 连接。单包模式不挂载源码目录的提供方，也不安装第二个预览 bundle。它不改变个人 Profile。

验收检查元素点选不会触发网页按钮、评论里的空格能正常输入、按住空格能操作网页、松开恢复选取、真实拖动矩形、空白位置、Shadow DOM、滚动与 Escape、明暗主题、页面隔离、失败重试，以及预览的请求是否精确进入会话持久化日志。

属性卡片另外检查 CSS 值校验、修改要求保留、取消前不改写页面、真实字段与明暗截图。`expanded-light.png` 与 `expanded-dark.png` 展示展开卡片。

草稿生命周期验收通过浏览器时钟模拟超过两分钟的编辑时间，确认草稿和选择仍在，之后能保存或取消。修复前该检查会因为编辑器自动关闭而失败；连接握手仍有三秒超时。

全屏验收分别覆盖首页和已有对话，在普通样式与实际壁纸插件的玻璃层叠边界下检查网页命中、网页输入可用、后方聊天不可见且不能获取焦点，以及退出后同一输入组件与草稿恢复。修复前玻璃场景的点击会命中后方输入框；修复后命中 Browser 的 iframe。截图为 `fullscreen-hero-glass.png` 与 `fullscreen-active-glass.png`。

简洁编辑浮层另外检查空内容无法保存、换行自动增高、选项面板的边界、Esc 和点击外部关闭面板后保留草稿。`composer-light.png` 与 `composer-dark.png` 是真实注入浮层的截图。

模型端使用官方 `dsh-llm-replay@0.2.0-rc.2`，不会调用真实模型。`integration/annotation-artifacts/` 保存截图、检查结果、发送内容和真实日志生成的 transcript；报告含打包产物 SHA256。人工审阅截图后才能判断布局质量。

图片验收使用真实浏览器捕获的网页像素，运行实际标注代码，在测试的 MessagePort 边界提供这些图片以替代 Electron 捕获。随后走正式 Client 提交、Host 图片验证与持久化附件引用，分别验收图片和混合模式。Chat 验收覆盖默认折叠、展开、页面刷新与普通用户消息回退；`message-collapsed.png` 与 `image-submitted.png` 展示实际聊天输出。

2026-10-03 将插件及 Browser / Chat 配套扩展安装到实际 DSH Desktop，校验安装后的运行文件并通过应用菜单正常重启。在 `https://github.com/cslkkl?tab=repositories` 人工验证原生元素点选、展开属性卡片、保存批注后的真实视口截图与蓝框，以及图片、定位资料和混合发送选项。图片预览只含网页 URL、批注文字与简短对应说明。测试批注未提交给真实模型。

2026-10-04 验收 `dsh-web-annotator@0.2.0-alpha.7` 单包产物：42 项常规检查和 18 项真实 Harness Web 验收通过。在没有宿主 `node_modules` 的源码副本中构建三套提供方，补充明确的 token-meter 开发依赖，避免构建依赖本机全局安装。独立 Profile 只安装一个 tgz，不挂载源码提供方；全部运行文件及 bundle patch 与已验收包逐字节一致。随后通过官方 CLI 卸载这个包，确认三套官方行恢复启用，并冷启动 Harness 成功读取会话列表。

alpha.7 当时的单包验证覆盖 Windows Web composition，未重新进行原生 Desktop 验收。预览包通过 GitHub Release 分发；npm 和市场收录尚未发布，市场中搜索和一键安装未验证。

Desktop 原生图片提交和模型识图、其他远程页面、真实模型修改源码，以及完整官方 monorepo 的覆盖率 / 平台门禁均未验证。这里的宿主类型检查覆盖 Browser、Chat 和 Layout Client，并使用安装的 rc.2 声明及精确基线的 Client 构建环境类型；不等同于官方全仓检查。当前稀疏检出使用已发布 CLI 的依赖目录，未提供 vitest，不能运行官方全仓 GUI 门禁。发布稳定版前应完成这些检查。

## alpha.8 发布前检查

2026-10-06：常规检查包含 44 项单元与真实 Vite 测试。`npm run test:storage` 另在实际 Chromium 中验证旧草稿迁移、约 8.4 MB 的真实 JPEG 队列重载、会话隔离、写入失败保留和恢复、只移除本次发送的 ID，以及明确删除持久数据。原先同一队列会触发 localStorage 配额错误。CI 在 Windows 与 Linux 中运行这些存储回归。

单包产物通过 24 项真实 Harness Web 验收，另覆盖属性框中文输入法确认、保存后编辑、分批勾选预览、窄窗口和放大内容、目标删除后的确认按钮、混合队列的图片序号与真实附件入库，以及满队列时分批发送一条后保留其他 31 条并重新启用添加。Electron 截图边界沿用测试替代，未重新验收此版本的原生 Desktop 或真实模型。Docker 在本机不可用，本轮未运行容器发布冒烟。
