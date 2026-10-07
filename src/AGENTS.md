# src/ — 规则层

继承根规则，见 [../AGENTS.md](../AGENTS.md)。

src/ 特有约束：

- **依赖方向单向**：`src/client/` 可以依赖 `src/browser/` 的类型与提示格式；
  `src/browser/` **不得**依赖 `src/client/`。由 `npm run check:layering` 拦。
- **`src/browser/page-inspector.ts` 不得有任何 import** —— Desktop 只执行它的编译体，
  模块级绑定在 guest 中会变成未定义标识符。改这里先读[架构 §3.1](../docs/architecture.md)。
- **四份共享模块改动后必须跑 `npm run sync:browser-provider`**，否则宿主构建会拒绝。
  清单只有一份，在 [../scripts/shared-modules.mjs](../scripts/shared-modules.mjs)。
- **浏览器半端不得引 Node 内置模块**（`node:*`、`fs`、`path` 等）；那是宿主入口的事。
  由 `npm run check:layering` 的 `client-no-node` 拦。
- **宿主半边不得用 DOM 全局**：`src/index.ts` 与 `src/vite.ts` 属宿主项目
  [tsconfig.json](../tsconfig.json)，`lib` 只有 `ES2022`，用 `document` / `window`
  会当场报 `TS2584`；浏览器半边属 [tsconfig.client.json](../tsconfig.client.json)，
  才拿到 DOM 与 `jsx`。两个项目各跑一次 `tsc`，合成一个会互相污染。
- **退休名字不得重新出现**：`layout-care` 系列名字已删除，只有
  [client/legacy-names.ts](client/legacy-names.ts) 允许保留旧的存储键用于一次性迁移。
- **类型检查已开到最严档**：`noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` /
  `noUnusedLocals` / `noUnusedParameters` / `verbatimModuleSyntax` / `isolatedModules`
  都在 [tsconfig.json](../tsconfig.json) 里。**为过检查而加 `any`、`!` 或 `as` 要修根因** ——
  非空断言只在"此处上一行已保证"时使用，并在同一处说明理由。
- **`jsx` 运行时两处必须一致**：类型检查用 `react-jsx`（自动运行时），
  客户端构建 [scripts/build.mjs](../scripts/build.mjs) 必须给 `jsx: 'automatic'`；
  写成 `transform` 会生成 `React.createElement`，而组件里已经不再导入 `React`。
- **改完跑 `npm run check`**，不要只看构建通过。
- 文件清单与“改哪”见 [README.md](README.md)，不写在这里。
