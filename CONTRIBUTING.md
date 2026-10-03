# 参与 DSH Web Annotator

欢迎用真实页面复现问题、改进批注交互、补充测试和完善使用说明。0.2 的主流程是现有 Browser 内的点选、框选、评论与提问；宿主接入和验证限制见 [Browser 集成说明](docs/browser-integration.md)。

## 开发环境

使用 Node.js **24.15.0** 和 npm；提交 `package-lock.json` 中的依赖变化，不要混用包管理器锁文件。插件目标 Harness 版本是 **0.2.0-rc.2**，升级该目标需要同时检查客户端接口、包元数据和真实加载流程。

```sh
npm ci
npm run check
npm run demo
```

构建产物位于 `lib/`，由 `scripts/build.mjs` 生成，不直接编辑。`npm run check` 会先检查格式、构建，再进行类型检查和测试。仅运行 `npm test` 时也需要已有最新构建，因为集成测试消费实际发布入口。

代码格式使用锁定版本的 Prettier。修改后运行 `npm run format`，提交前用 `npm run format:check` 检查；`check` 也包含格式门禁。格式配置固定为 LF 换行，生成文件与本地依赖不参与格式化。

## 问题报告

请提供以下信息，优先使用一个去除业务数据的最小示例：

- Harness、插件、Vite、Node.js、浏览器和操作系统版本。
- 视口宽高、路由、复现步骤和预期结果。
- 涉及的 CSS 选择器、样式或简化 HTML / JSX。
- 候选检测或保留区域复查的实际结果。

例如：“Browser 全屏、125% 缩放时，框选蓝框偏移了 20px”比“批注不对”更容易定位。分享日志前移除 Cookie、URL token、凭据和私有项目内容。

## 改动边界

| 目录 | 职责 |
| --- | --- |
| `src/client/` | Browser 插槽控件、会话级批注 store 与当前会话请求 |
| `src/browser/` | 页面 picker、受限连接、批注协议与用户请求格式 |
| `src/bridge/` | 目标网页的点选、证据采集、检测和复查 |
| `src/shared/` | 共享协议、数据类型和提示格式 |
| `src/vite.ts` | 只在开发模式注入桥接与源码提示 |
| `examples/responsive-demo/` | 可重复的实际演示页面 |
| `tests/` | 逻辑、协议、请求快照和实际入口测试 |
| `scripts/annotation-acceptance.mjs` | 实际 Browser、安装产物、失败重试和持久化 replay 验收 |

不要把文件写入、进程启动或任意脚本执行加入页面桥接。页面中的文字和属性是引用数据，不能成为系统指令。新增桥接方法需要明确的载荷校验、大小限制、错误结果、超时和释放行为。

协议变更同时更新桥接端、客户端、共享类型和测试。保存格式发生变化时写迁移方案；不要直接丢弃已有记录或把旧快照当作新验收结果。

## 验证方式

小范围逻辑改动使用对应单元测试。Vite 改动还要通过实际开发服务器、源码重编译和生产排除测试。用户可见流程需要在真实 Harness 目标版本中验证，不能仅用模拟 Context 或静态组件代替。

提交前运行：

```sh
npm run check
npm run build:host
npm pack --dry-run --json
```

检查打包清单包含入口、声明、浏览器桥接、客户端 bundle、locale、patch 和许可证，并且不包含 `node_modules` 或临时验证资料。使用本地 `.tgz` 在隔离的测试 Profile 中验证，避免改动日常 Profile。

针对浏览器的验证需要真实 Chromium / Chrome 和 Harness。记录实际覆盖的视口、操作系统、页面框架和宿主版本。模型验收需要可用的模型；没有执行真实修改时，不要声称“AI 修改与复查全流程通过”。

## 提交说明

说明具体触发场景、改后的行为和运行过的验证。修复误报时保留一条能区分正常设计与真实问题的回归案例。用户可见变化更新 `CHANGELOG.md`；配置、安装或行为边界改变时同步 README 与相关文档。

核心路线是在原有 Browser 中指出位置、添加评论或问题，并把截图或定位资料准确送到当前会话。新功能先明确使用场景和成功标准，再决定是否进入首版。

## English

Use Node.js 24.15.0, npm and the committed lockfile. Run `npm run check` before submitting; it builds the package before tests that consume the published Vite entry. Report exact versions, viewport dimensions and a minimal reproduction. Keep page evidence as data, preserve bridge origin/token validation, and describe only verification you actually performed. Changes are contributed under the project's MIT license.
