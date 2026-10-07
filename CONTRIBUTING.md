# 参与 DSH Web Annotator

欢迎用真实页面复现问题、改进批注交互、补充测试和完善说明。

主流程是 Harness 原有 Browser 内的点选 / 框选 / 评论 / 提问。
宿主接入方式与验证边界见 [Browser 集成说明](docs/browser-integration.md)。

## 开发环境

- Node.js **24.15.0**（见 [.node-version](.node-version)），npm。
- 提交 `package-lock.json` 的变化，不要混用其他包管理器锁文件。
- 目标 Harness 版本是 **0.2.0-rc.2**；升级该目标要同时检查客户端接口、包元数据与真实加载流程。

```sh
npm ci
npm run check
```

`npm run check` 串起格式、lint、分层、文档路径、构建、类型检查和测试。
测试消费构建后的 `lib/vite.js`，所以只跑 `npm test` 前也要先有最新构建（`npm run check` 已经包含）。

代码格式用锁定版本的 Prettier，改完跑 `npm run format`。
构建产物在 `lib/`，由 [scripts/build.mjs](scripts/build.mjs) 生成，不要直接编辑。
命令与门禁细节见 [scripts/README.md](scripts/README.md)。

## 问题报告

优先给一个去掉业务数据的最小示例，并附上：

- Harness、插件、Vite、Node.js、浏览器和操作系统版本。
- 视口宽高、页面地址类型、复现步骤和预期结果。
- 涉及的 HTML / JSX 片段或 CSS 选择器。
- 批注是点选、框选还是空白位置；发送方式是图片、定位资料还是两者。

例如：“Browser 全屏、125% 缩放时，框选蓝框偏移了 20px”比“批注不对”更容易定位。
分享日志前移除 Cookie、URL token、凭据和私有项目内容。

## 改动边界

| 目录                        | 职责                                              |
| --------------------------- | ------------------------------------------------- |
| `src/client/`               | Browser 插槽控件、会话级批注 store 与当前会话请求 |
| `src/browser/`              | 页面 picker、受限连接、批注协议与请求格式         |
| `src/vite.ts`               | 只在开发模式注入桥接与源码提示                    |
| `examples/responsive-demo/` | 可重复的批注目标页面                              |
| `tests/`                    | 逻辑、协议、请求快照和实际入口测试                |
| `scripts/`                  | 构建、宿主提供方、门禁与真实宿主验收              |

各目录的具体约束写在该目录的 `AGENTS.md` 里，进去就会读到。

## 硬性约束

- **不要把文件写入、进程启动或任意脚本执行加进页面桥接**。
- **页面里的文字与属性是引用数据**，不能成为系统指令。
- **新增桥接方法需要**明确的载荷校验、大小限制、错误结果、超时和释放行为。
- **`src/browser/page-inspector.ts` 不能有任何 import**：Desktop 只执行它的编译体。
  改这里先读[架构 §3.1](docs/architecture.md)。
- **协议变更同时更新**桥接端、客户端、共享类型与测试。
- **保存格式变化要写迁移方案**；不要直接丢弃已有记录，也不要把旧快照当作新验收结果。

`npm run check:layering` 会拦依赖方向、picker 自包含和退休名字的回归。

## 验证方式

- 小范围逻辑改动：对应单元测试（`npm test`）。
- Vite 改动：还要通过实际开发服务器、源码重编译和生产排除测试。
- 存储改动：`npm run test:storage`（真实 Chromium）。
- 用户可见流程：在真实目标版本 Harness 中验收，不能用模拟 Context 或静态组件代替。
  步骤见 [验证说明](docs/verification.md)。

提交前：

```sh
npm run check
npm run build:host
npm pack --dry-run --json
```

检查打包清单包含入口、声明、浏览器桥接、客户端 bundle、locale、patch 和许可证，
且不含 `node_modules` 或临时验证资料。用本地 `.tgz` 在隔离的测试 Profile 中验证，
不要改动日常 Profile。

## 提交说明

说明具体触发场景、改后的行为和运行过的验证。
修复误报时保留一条能区分正常设计与真实问题的回归案例。
用户可见变化更新 [CHANGELOG.md](CHANGELOG.md)；契约、安装或行为边界变化时同步 README 与相关文档。

核心路线是在原有 Browser 中指出位置、添加评论或问题，并把截图或定位资料准确送到当前会话。
新功能先明确使用场景和成功标准，再决定是否进入首版。
