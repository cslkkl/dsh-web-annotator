# Browser 集成

原版 Harness rc.2 不声明批注插槽。本包配套的补丁扩展三个包：

| 包                                   | 补丁做什么                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/client/ui-sidebar-browser` | 声明 `sidebar.right.tab.browser.toolbar` 与 `...annotations` 子插槽；工具栏贡献渲染在“刷新”左侧；新增受限 picker 与桌面截图 |
| `packages/client/ui-chat`            | 声明增量 `conversation.message.user-text` chain，让插件折叠自己识别的批注消息                                               |
| `packages/client/ui-layout`          | 右栏全屏时隐藏并将后方主内容设为 inert，避免壁纸玻璃层叠让聊天输入框浮到网页上方                                            |

补丁尚未合入官方 Harness。这是当前安装会替换官方三行的原因。

## 补丁是什么

[docs/harness-browser-annotation.patch](harness-browser-annotation.patch) 是宿主检出的 `git diff HEAD`，
基线 commit 记在 [../scripts/shared-modules.mjs](../scripts/shared-modules.mjs)（`HOST_BASE_COMMIT`）。

它是**生成物**，不要手改。重新生成：

```powershell
git -C ../harness-browser-integration diff HEAD --output docs/harness-browser-annotation.patch
npm run verify:browser-patch
```

`verify:browser-patch` 会在独立的临时 Git root 里把补丁应用到精确基线，
再与宿主检出逐字节比对。不这么做时 `git apply` 会静默跳过路径，看不出问题。

## 应用与构建

在插件目录旁检出 `harness-browser-integration`，切到基线 commit：

```sh
git apply --check /absolute/path/to/harness-browser-annotation.patch
git apply /absolute/path/to/harness-browser-annotation.patch
```

回到插件目录：

```powershell
npm run sync:browser-provider      # 改了共享 picker 模块之后必须跑
npm run build:browser-provider     # 比对四份共享模块，再从宿主检出构建
npm run build:chat-provider
npm run build:layout-provider
npm run typecheck:browser-provider
npm run typecheck:chat-provider
npm run typecheck:layout-provider
npm run build:host                 # 三个提供方 + 许可证 → lib/host
```

构建脚本读 `DSH_HOST_CHECKOUT`（默认 `../harness-browser-integration`），
CI 与发布链路用这个变量指向 `.host-source`。

四份共享模块在本包与宿主副本之间必须逐字节相同（只有 import 后缀不同），
清单在 [../scripts/shared-modules.mjs](../scripts/shared-modules.mjs)。
`build-browser-provider` 会在不一致时直接失败。同步方向是单向的：本包是事实源。

局部类型检查针对已安装 rc.2 声明，不能替代官方 monorepo 的全仓检查。

## 单包分发

三个提供方就绪后 `npm pack`。`prepack` 检查产物齐全、版本一致、补丁哈希一致，
缺失或过期时拒绝打包。`lib/host/bundle.json` 记录宿主来源与逐文件哈希。

包内 [cordis.patch.yml](../cordis.patch.yml) 禁用官方三行，再插入包内提供方。
Loader 的按 ID patch 里 `name` 只能断言已有名称、不能重命名，因此用新的行 ID。
卸载整个 bundle 后这些替换随 bundle 层撤销。

## 开发页连接

Web 侧只向 Browser 自己拥有的 iframe 发送有界请求。目标页面需要启用本包的 Vite 连接：

```ts
import { defineConfig } from 'vite';
import { webAnnotator } from 'dsh-web-annotator/vite';

export default defineConfig({ plugins: [webAnnotator()] });
```

插件只在 `serve` 阶段生效：托管 `__web-annotator__/bridge.js`、内联允许的父来源、
给 JSX 原生标签加 `data-web-annotator-source` 提示。生产构建不注入连接脚本或标记。

连接默认允许 HTTP loopback 来源；其他来源通过 `allowedParentOrigins` 指定精确 HTTP(S) origin。

## Web 与 Desktop 的差别

|                          | Web                           | Desktop                             |
| ------------------------ | ----------------------------- | ----------------------------------- |
| picker                   | iframe 内由本包的开发连接提供 | 宿主执行 `annotatePage` 的编译体    |
| 截图                     | 无原生捕获                    | 保存后调用 guest 的 `capturePage()` |
| 图片经 Canvas 标注与缩放 | —                             | 是                                  |
| 导航 / 视口 / 滚动变化   | 拒绝混用                      | 拒绝混用截图                        |
| 捕获失败                 | —                             | 保留定位资料                        |

Desktop 的 guest / 导航 / 关闭 / 快捷键仍需真机验收，不能用 Web 结果代替。
