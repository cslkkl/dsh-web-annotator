# 决策：宿主版本精确钉死，不放宽兼容声明（2026-10-14）

状态：生效

## 问题

本包在启用期间替换官方 Browser、Chat、Layout 三个提供方，而这三份提供方**是从宿主源码派生重建的**：
`build:{browser,chat,layout}-provider` 读 `DSH_HOST_CHECKOUT` 指向的宿主检出，把 `packages/client/ui-*`
的源码连同本包的改动一起打成 `lib/host/*`。包里装的是**上游代码的副本**，不是薄插件。

代价有三条：

1. **宿主升级即失效**：`0.2.1-alpha.2` 上线后，0.2.1 版被版本守卫明确拒绝
   （`要求 … 0.2.0-rc.2 …`），批注功能在用户机器上直接不可用。
2. **每次都要重新派生并重合并**：补丁的合并面是 **21 个官方既有文件 / +184 行**（其中 13 个是代码，
   +156 行；另外 5 个新增 picker 文件 / +1231 行不参与冲突）。上游搬动代码时冲突集中在这里
   —— 0.2.2 迁移就是上游把消息流拆出 `conversation.chat.flow`、`ChatNodeList` 移进新文件造成的。
3. **用户会问"为什么不放宽版本"**：这个问题的答案不看代码推不出来，于是每次都要重讲一遍。

## 决策

- `engines.dsh` 与四个 dsh 包的 `peerDependencies`（`api-session-controller`、
  `client-ui-primitives`、`client-ui-sidebar-browser`、`client-ui-sidebar-right`）
  以及全部 `devDependencies` 都**精确钉死**当前宿主版本，不用 `^` / `~` / 区间。
- `cordis.patch.yml` 禁用官方 `ui-sidebar-browser`/`ui-chat`/`ui-layout` 三行，
  插入 `cslkkl-web-annotator-{browser,chat,layout}` 三个派生提供方。
- 宿主版本变化时**改版本号并重新派生**，不做兼容层、不做运行时探测。
- 迁移照 [../../docs/browser-integration.md](../../docs/browser-integration.md) 走：
  切宿主检出到新基线 → 重新生成补丁 → `verify:browser-patch` → 重建提供方 → 跑真实宿主验收。
  `docs/harness-browser-annotation.patch` 是生成物，不要手改。

## 替代方案

- **放宽版本区间，或加一句"兼容声明"**：不成立。包内嵌的是上游代码副本，放宽声明只是让
  **过期的上游代码在新宿主上继续运行** —— 从"响亮拒绝"退化成"运行时静默出错"，而后者正是
  本包最该避免的失败方式。宿主版本在本仓出现在 **23 个文件**里（`engines`、4 个 dsh peer、
  `package-lock.json`、`scripts/package-host.mjs` 的断言、`shared-modules.mjs` 的
  `HOST_BASE_COMMIT`、两个 workflow、验收脚本、以及全部对外文档），放宽一处等于其余各处的断言全部失效。
- **不替换提供方，改用官方插槽**：官方 `ui-sidebar-browser` **不为自己声明任何子槽**
  （只往 `sidebar.right.pane.tab` 注入），所以想在那张标签页里加界面只能改它；
  `conversation.chat.node` 的 `children` 为空，消息正文没有插槽孔。免补丁的两条路都更差：
  按 `priority` 遮蔽 keyed 的 `user` 渲染器要**重写 14.9 KB 的气泡**（官方组件不导出，无法委托），
  DOM 增强（竞品路线）在上游改结构时**静默降级**成原始文本。
- **像竞品那样自建一个右栏标签页**：`zhxnix/dsh-sidebar-annotations` 实测只用官方
  `sidebar.right.pane.tab` / `conversation.input.dock` / `conversation.input.left`，零替换、
  零版本耦合。代价是**放弃本包的产品前提**（规则 1：只扩展原有 Browser），变成第二个平行预览面。
  记在这里是为了确认这是取舍，不是没想到。
- **把扩展点提给上游，让用户不必依赖替换**：官方 `CONTRIBUTING.md` 明说不接受外部 PR
  （"we cannot accept external pull requests at the moment"），Issues 亦关闭，渠道只剩 Discussions。
  Pinpoint 走过这条路（DECISIONS D13 上游化 `preview.toolbar`/`preview.footer`），
  最终在 D18 整体撤退并把上游改动删掉。所以它是长期方向，不是当下可执行的降耦手段。
  `ui-layout` 那 12 行通用修复已按此提交 Discussion（#9555），但不作为待办依赖。

## 影响

- **换来**：失败方式响亮 —— 版本不匹配时安装期直接拒绝，不会装上一个悄悄跑旧代码的包。
- **换来**：合并面被压到 21 个文件 / +184 行，其中 8 个是文档；新增的 picker 与协议
  （5 个文件 / +1231 行）永远不参与冲突。0.2.2 迁移的 8 个冲突文件全部出自那 21 个之中。
- **付出**：每次宿主升级都要重新派生三个提供方并重新合并补丁，见
  [../../docs/browser-integration.md](../../docs/browser-integration.md)。
- **对外可观察**：安装说明必须写明"启用期间替换官方三行"；0.2.2 的迁移与验收记录见
  [../../docs/verification.md](../../docs/verification.md)。
