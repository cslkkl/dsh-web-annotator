# DSH Web Annotator · 网页批注与提问

在 Harness 原有 Browser 标签页里，点击或框选网页，然后就地添加评论、向当前 Agent 提问。

**0.2.0-alpha.7 是预览版，精确支持 Harness 0.2.0-rc.2。** 一个预构建安装包包含插件和 Browser、Chat、Layout 扩展，安装后正常重启 Desktop 即可试用。源码已公开，预构建包通过 GitHub Release 分发。扩展尚未合入官方 Harness；npm 尚未发布，插件市场尚未收录。

![真实 Harness Browser 中的框选批注](docs/images/annotation-region.png)

## 安装

从 [预览 Release](https://github.com/cslkkl/dsh-web-annotator/releases/tag/v0.2.0-alpha.7) 下载 `dsh-web-annotator-0.2.0-alpha.7.tgz`，在 DSH 插件管理页选择该本地包，或使用官方 CLI：

```sh
dsh plugin --profile desktop add --ignore-scripts /absolute/path/dsh-web-annotator-0.2.0-alpha.7.tgz
```

只安装这一个包，然后正常退出并重开 Desktop。使用其他 Profile 时替换 `desktop`。包内已有运行产物，不需要用户编译或放行构建脚本。

该 bundle 在启用期间替换官方 Browser、Chat 和 Layout 提供方。请先确认 Harness 内核是 **0.2.0-rc.2**，不要在其他版本或另一套同类提供方上混装。卸载整个 bundle 会撤销这些替换，重启后恢复官方提供方。

旧本地预览用户先通过插件管理移除 `dsh-layout-care` 和 `dsh-layout-care-browser-preview`，再安装新包，避免重复挂载。批注存储键保持兼容。详见 [安装和市场发布](docs/distribution.md)。

## 使用方式

1. 在当前会话点击“批注网页”，打开 Harness 原有的 Browser。
2. 输入网页地址，点击 Browser 工具栏中“刷新”左边的“批注网页”。
3. 点击元素或空白位置，或者拖动鼠标框选区域，在选区旁输入内容。
4. 浮层默认只有选项图标、输入区和圆形 ✓。点击左侧图标展开同一张卡片，查看所选标签、颜色、字体等属性，也可切换“评论／提问”和元素层级。属性改动随批注发送给 AI 修改源码，保存前不改写网页。点击 ✓ 或按 Enter 保存；Shift+Enter 换行并自动增高，Esc 先收起卡片，再取消批注。
5. 需要操作网页时按住空格键，松开回到批注。批注输入框里的空格正常用于打字，编辑不受两分钟时限限制。
6. 可继续添加多条批注，选择“图片”“定位资料”或“图片＋定位资料”，预览后发送到当前会话。桌面版保存时捕获视口，蓝框或蓝圈标出选区；有截图时默认发送图片。旧批注或无法截图的页面显示提示，可发送定位资料。

图片通过 Harness 的正式图片附件流程发送。图片模式只发送你的批注、网页 URL 和对应图片；详细模式保留坐标与 DOM 证据，但聊天默认只显示批注正文，点击“查看定位资料”展开完整资料。模型是否能直接识别图片取决于当前模型的图片能力。

框选保留真实矩形，DOM 候选仅供定位。批注按会话和完整 URL 保留；发送失败后仍保留，成功后只移除这次发送的记录。提问会要求 Agent 回答问题；评论按实际内容处理。修改源码由当前 Agent 完成。

Browser 全屏时，后方聊天界面隐藏并暂停交互；退出后恢复原有输入框和草稿，兼容壁纸玻璃效果。

![实际展开的属性卡片](docs/images/annotation-expanded.png)

## 当前支持范围

| 能力 | 状态 |
| --- | --- |
| 原有 Browser 工具栏与网页内批注浮层 | 在带扩展的真实 Harness Web 中已验证 |
| 元素点选、空白位置、矩形框选、空格临时操作 | 已验证 |
| 多条批注、预览、失败重试、会话请求和持久化日志 | 已验证，模型端使用官方 replay |
| Web 本地 Vite 页面 | 需要本包的开发页面连接 |
| Desktop 原生网页 | 已在实际 DSH Desktop 验证元素点选、展开属性卡片及原生截图预览 |
| GitHub 等远程页面 | 当前 GitHub 仓库列表页的 Desktop 点选与截图已验证；Web 仍受 iframe 嵌入和跨源限制，其他页面需分别验收 |
| 图片附件与详细资料折叠 | 真实 Web composition 与附件入库已验证；Desktop 原生捕获、蓝框标记及三种发送选项已人工验证 |
| 真实模型修改源码 | 尚未验收 |
| iframe 内部与 closed Shadow DOM 的子元素 | 仅定位外层载体，不能穿透 |

源码与浏览器问题可在项目中长期维护：MIT 许可证，独立命名，锁定依赖，协议校验，单元测试、请求快照和真实宿主验收脚本。旧版布局扫描逻辑保留在内部模块；0.2 的主流程是 Browser 内批注。

## 接入自己的 Vite 页面

开发项目安装本地打包产物后，在 Vite 配置里启用：

```ts
import { defineConfig } from 'vite';
import { webAnnotator } from 'dsh-web-annotator/vite';

export default defineConfig({ plugins: [webAnnotator()] });
```

这只在开发服务器中生效。JSX/TSX 原生标签可附带文件、行、列提示；生产构建不注入连接脚本或源码标记。连接默认允许 HTTP loopback 的 Harness；其他来源通过 `allowedParentOrigins` 指定精确 HTTP(S) origin。

## 构建与验收

Node.js 24.15.0，Harness 精确目标为 0.2.0-rc.2。常规检查不读取个人 Profile：

```sh
npm ci
npm run check
```

打包前还需构建包内宿主提供方；缺少它们时 `npm pack` 会明确失败，避免发布一个批注按钮不可用的包。宿主源码基线为官方 tag `dsh-v0.2.0-rc.2`，commit `639ed015397290b3745d163aafe02ffee4aa3f84`。补丁与构建步骤见 [Browser 接入说明](docs/browser-integration.md)，完整验收见 [验证说明](docs/verification.md)。不要把测试 Profile 的配置复制到日常 Profile：测试配置禁用了真实模型并启用 replay。

源码职责与安全边界见 [架构](docs/architecture.md)，后续优先级见 [路线图](docs/roadmap.md)。
