# Responsive demo

从插件仓库根目录运行 `npm run build`，再运行 `npm run demo`。示例地址为 `http://127.0.0.1:4177`；它只监听本机，不需要外部服务。Vite 会加载构建后的 `lib/vite.js` 和 `lib/bridge.js`。

在 Harness 的 DSH Web Annotator 侧栏中打开此地址，使用 390 px 手机视口：

1. 扫描布局。`#mobile-card` 的 560 px 固定宽度会造成页面横向溢出。
2. 将 `#protected-header` 选为保留区域，填写需要保留的要求。
3. 为卡片添加批注，或把扫描候选加入修改清单。
4. 点击页面上的“应用示例修复”。卡片改为 `width: min(100%, 560px)`。
5. 再扫描并复查保留区域：溢出消失，页眉内容和布局不变。
6. 点击“还原布局问题”后可重复验收。

`#intentional-carousel` 是有意设计的 `overflow-x: auto` 容器。作品可以横向滚动，但不应被标记为页面越界。点选 React 原生 DOM 元素可以看到 `src/main.tsx` 的文件、行和列提示。

示例按钮用于验证检测与复查流程，并不代表 AI 已修改源码。真实项目中由当前 Harness 会话中的 AI 修改文件，并通过 Vite 热更新反映结果。
