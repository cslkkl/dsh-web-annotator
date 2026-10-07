# DSH Web Annotator 架构说明

本文件只写不变的设计决策、契约与失败模式（“为什么”）。
文件级职责与“改哪”见各子树 `README.md`；用法见根 [README.md](../README.md)。

## 一、产品边界

- 主流程**扩展 Harness 原有 Browser**：点选或框选网页、就地输入评论或提问、发送到当前会话。
- 不提供独立的浏览器、不提供像素对比、不提供自动改源码引擎；修改源码由当前会话中的 Agent 完成。
- 页面中的文字、样式、源码标记一律是**引用资料**，不构成指令。

## 二、三个半端

| 半端        | 运行位置           | 产物                                   | 约束                                    |
| ----------- | ------------------ | -------------------------------------- | --------------------------------------- |
| 宿主入口    | Harness 宿主进程   | `lib/index.js`                         | 只声明名字；功能都在 Client 半端        |
| Client 半端 | Harness Web Client | `lib/client.js`                        | 反映射到 Browser 插槽；不得引 Node 模块 |
| 页面拾取器  | 被访问网页         | `lib/bridge.js`（开发页）/ 宿主 picker | 只使用浏览器全局；不得有 import         |

`lib/vite.js` 是开发期的第四个产物，只在 Vite `serve` 阶段挂载。

## 三、契约

### 3.1 picker 必须自包含

Desktop 只把 `annotatePage` 的**编译体**送进已批准的 guest：

```
element.executeJavaScript(`(${annotatePage.toString()})(${JSON.stringify(options)})`)
```

因此 `src/browser/page-inspector.ts` **不能有任何 import**：模块级绑定在 guest 中会变成未定义标识符。
判据：`scripts/check-layering.mjs` 的 `picker-self-contained`，以及 `tests/picker-source.test.ts`。

### 3.2 四份共享模块

`page-inspector.ts` / `protocol.ts` / `iframe-annotation.ts` / `screenshot.ts` 在宿主补丁中保留同步副本。

- 同步方向**单向**：本包是事实源，`npm run sync:browser-provider` 写入宿主检出。
- 宿主方构建前逐字节比对，不一致就拒绝构建。
- 模块清单只有一份：`scripts/shared-modules.mjs`。

### 3.3 插槽

Browser 补丁声明两个会话作用域的 list 子插槽：

| 插槽                                    | 贡献                           |
| --------------------------------------- | ------------------------------ |
| `sidebar.right.tab.browser.toolbar`     | “批注网页／退出批注”按钮       |
| `sidebar.right.tab.browser.annotations` | 批注队列、发送方式、预览与发送 |

Owner props 只暴露 tab ID、已知 URL、加载状态，以及受限的 `annotate(options)` / `cancelAnnotation()`。
回调**不暴露** DOM、guest 标识或任意求值器。

Chat 补丁声明增量 `conversation.message.user-text` chain。
该 chain 只接管**完整通过格式与协议校验**的本插件请求；其他消息走宿主 fallback。
被接管的请求默认只显示“N 条注释”与定位资料折叠：逐条卡片（序号、目标元素、评论或提问）
按需展开，避免长队列撑高聊天记录。

### 3.4 消息边界

本包的插件与页面之间有两种通道，都必须校验来源、origin 与载荷：

| 通道                                                | 用途                       | 校验                                                                                 |
| --------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| `dsh-browser-annotation-v1` + 独立 `MessageChannel` | Client 半端驱动页面 picker | 只接受 `window.parent`；origin 必须是 loopback HTTP 或显式配置；`options` 逐字段限长 |
| `__web-annotator__/bridge.js` 内联配置              | 开发页声明允许的父来源     | 只接受精确 HTTP(S) origin，不接受路径、凭据或通配符                                  |

### 3.5 存储

- 截图队列进 **IndexedDB**（库名 `dsh-web-annotator`），因为 localStorage 的共享配额会静默丢草稿。
- 键按**会话 + 完整 URL**（含 path / query / hash）隔离。
- 旧的 localStorage 记录只有在新键**提交成功之后**才删除。
- `dsh.layout-care.browser-annotations.v1` 是 alpha.8 及更早的键；读一次迁移，之后不再写入。
  它是唯一允许出现的退休名字，集中在 `src/client/legacy-names.ts`。

### 3.6 请求格式

- 评论与提问分别保留意图。
- 图片模式只发批注正文、网页 URL 与对应截图，不含 DOM JSON。
- 混合模式用 `screenshotIndex` 明确“第 N 张图对应第几条批注”，不位移未附图的批注。
- 附件在 Client 半端重画：截图角上叠加与附图序号一致的序号徽标，重画不可用时保留宿主截图，
  证据不因绘制失败而丢失。
- 单条批注 ≤ 1000 字符；一页 ≤ 32 条；请求 ≤ 64000 字符。
- 页面文字不能闭合 JSON 代码块；识别时逐条重放并比对完整文本。

## 四、失败模式

| 失败                | 行为                                                         |
| ------------------- | ------------------------------------------------------------ |
| 发送失败            | 保留全部批注，只有**成功发送的已选 ID** 被移除               |
| 存储失败            | 内存内容仍可用，界面提示“刷新前先发送”                       |
| 页面导航 / 目标被删 | 目标消失时禁用确认，`targetGone` 提示重新选择                |
| 握手超时            | 开发页 3 秒，Desktop picker 65 秒；超时后取消 picker 并报错  |
| 重复连接            | 同一可信父页面可轮换 token；新连接取消旧的 picker 与在途请求 |
| 处理函数抛出        | 通道返回 `{cancelled:true}` 并关闭，不留下悬挂通道           |

## 五、否定式约束（做不到就明说）

- Web 不能突破跨源与嵌入策略；iframe 内网页需要目标页面自己启用开发连接。
- closed Shadow DOM 与嵌套 iframe 内部不提供精确元素证据；只定位外层载体。
- 不把 CSS selector 或网页 source 提示当作准确的源码文件，需在工作区核实。
- 模型能否识别图片取决于当前模型的图片能力。

## 六、分层与门禁

依赖方向（`npm run check:layering` 逐条拦）：

| 规则                    | 含义                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| `picker-self-contained` | 页面 picker 不得有任何 import                                       |
| `browser-no-client`     | 页面半端不得依赖 Client 半端                                        |
| `client-no-bridge`      | Client 半端不得依赖宿主 picker 之外的页面半端实现                   |
| `client-no-node`        | 浏览器半端不得依赖 Node 内置模块                                    |
| `host-no-client`        | 宿主入口与 Vite 插件不得依赖 Client 半端                            |
| `no-retired-names`      | 不得重新引入已退休的运行时名字（`src/client/legacy-names.ts` 除外） |

每条规则必须真的扫到文件，否则报 `rule-not-wired`：没扫到就等于没生效。

### 6.1 两个类型检查项目

依赖方向只靠脚本拦不够：类型系统也要能表达"这一半看不到那一半的全局"。

| 项目                                            | 覆盖                                                 | `lib`                                               | 拦住什么                                           |
| ----------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| [tsconfig.json](../tsconfig.json)               | `src/index.ts`、`src/vite.ts`                        | `ES2022`（**无 DOM**）                              | 宿主半边用 `document` / `window`（报 `TS2584`）    |
| [tsconfig.client.json](../tsconfig.client.json) | `src/browser/`、`src/client/`、`tests/`、`examples/` | `ES2022` + `DOM` + `DOM.Iterable`，`jsx: react-jsx` | 浏览器半边误用宿主模块（另由 `client-no-node` 拦） |

`npm run typecheck` 依次跑两个项目。合成一个 program 时两边互相污染：
宿主文件能用 DOM 全局、浏览器文件能 `import 'node:fs'`，而类型检查**都通过**。

## 七、分发

- 一个预构建包同时包含插件与 Browser / Chat / Layout 三个派生提供方。
- 包内 `cordis.patch.yml` 禁用官方三行，再插入包内提供方；卸载整个 bundle 即撤销替换。
- `npm pack` 由 `prepack` 拦截：缺少产物、版本不符或补丁哈希不符时拒绝打包。

## 八、防错清单

每条都来自一次真实故障或已核实的机制，改动前先读。
**编号是稳定的：只增不重排，删掉的条目留下空缺号**，否则引用会指到别处。
**只收录已挂判据的条目** —— 没有判据的规则留在散文里（如 [tests/README.md](../tests/README.md)
的「判据不能住在 `.tsx` 里」、根 [AGENTS.md](../AGENTS.md) 活跃坑里的 `--from-default-profile`），
否则这张表会变成一个会漂的家。

| 编号 | 怎么踩的                              | 后果（报不报错）                                   | 判据                                                                               |
| ---- | ------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| F1   | 在 `page-inspector.ts` 里加 import    | guest 里模块级绑定变成未定义标识符——**构建期不报** | `check:layering` 的 `picker-self-contained`；`tests/picker-source.test.ts`         |
| F2   | 浏览器半端 `import 'node:fs'`         | 产物内联宿主模块——构建不报                         | `check:layering` 的 `client-no-node`                                               |
| F3   | 页面半端依赖 Client 半端              | 运行位置错配——构建不报                             | `check:layering` 的 `browser-no-client`                                            |
| F4   | Client 半端依赖宿主 picker 实现       | 宿主代码被打进浏览器产物                           | `check:layering` 的 `client-no-bridge`                                             |
| F5   | 宿主入口或 Vite 插件依赖 Client 半端  | 产物边界破掉                                       | `check:layering` 的 `host-no-client`                                               |
| F6   | 重新引入 `layout-care` 运行时名字     | 静默并存两套协议                                   | `check:layering` 的 `no-retired-names`（豁免 `src/client/legacy-names.ts`）        |
| F7   | 新增规则但没匹配到任何文件            | 规则**看起来像已生效**                             | `check:layering` 的 `rule-not-wired`                                               |
| F8   | 改了四份共享模块却没同步宿主副本      | 中间一路静默，到宿主构建才报错                     | `scripts/build-browser-provider.mjs` 逐字节比对；清单 `scripts/shared-modules.mjs` |
| F9   | 改了宿主检出但没重生成补丁            | `prepack` 哈希断言失败，但**不告诉你哪一行错了**   | `npm run verify:browser-patch`                                                     |
| F10  | 产物缺失或过期就分发                  | 装完批注按钮不可用——只有用户会碰到                 | `prepack`（`scripts/check-package.mjs`）                                           |
| F11  | 客户端产物少一个 `inject`             | 插件**静默不出现**                                 | `npm run verify:artifacts`                                                         |
| F12  | React 被内联进客户端产物              | 加载时 `process is not defined`，插件激活失败      | `verify:artifacts` 的 require 清单断言                                             |
| F13  | 包名 / loader id / patch 行 id 漂移   | profile 解析不到，或区块静默不渲染                 | `verify:artifacts` 的三处一致断言                                                  |
| F14  | 在 `.github/` 下放 `README.md`        | 仓库首页被换成内部手册，**全部门禁照绿**           | `check:doc-paths` 的 `homepageFailures`                                            |
| F15  | 文件改名后没改文档里的路径            | 零信号                                             | `check:doc-paths` 的链接检查                                                       |
| F16  | 文档里写了不存在的 `npm run <脚本名>` | 读者手动执行时才发现                               | `check:doc-paths` 的脚本名检查                                                     |
| F17  | 新增截图没登记                        | 只在市场条目里看得出来                             | `check:doc-paths` 的 `screenshotFailures`                                          |
| F18  | 格式门禁比本地钩子窄                  | 被漏掉的那批文件格式没有任何信号                   | `tests/format-scope.test.ts`（只钉「门禁 ⊇ 钩子」一个方向）                        |
| F19  | 宿主半边用了 `document` / `window`    | ——**当场报** `TS2584`                              | [tsconfig.json](../tsconfig.json) 无 DOM；§6.1                                     |
| F20  | 把 `check` 改成 typecheck 先于 build  | `TS2307`：类型检查要读 `lib/vite.d.ts`             | §6.1 与 [../scripts/README.md](../scripts/README.md) 的顺序说明                    |
| F21  | 未登记的错误码默认当成成功            | 真实错误被掩盖                                     | `tests/annotation-view.test.ts`                                                    |
| F22  | picker 字段表三处漂开                 | 页面少一行文字，不报错                             | `tests/annotation-view.test.ts` 的逐字段删除断言                                   |
| F23  | 文案表里留了没人引用的键              | 表里说有、界面里没有                               | `tests/annotation-copy.test.ts`                                                    |
