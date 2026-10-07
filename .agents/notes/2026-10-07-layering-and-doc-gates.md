# 决策：把分层与文档路径落成门禁（2026-10-07）

状态：生效

## 问题

`docs/architecture.md` 与各子树 `AGENTS.md` 写着依赖方向，但**没有任何机器检查**：

- `page-inspector.ts` 一旦引入 import，Desktop 送进 guest 的编译体就会抛未定义标识符，
  而构建期、类型检查期、单元测试期都不报错。
- 改名 / 搬文件之后，代码里的旧路径当场编译失败，**文档里的旧路径零信号**。
- 文档里的 `npm run <脚本名>` 写错脚本名，读者要到手动执行时才发现。

## 决策

两个只用 `node:fs` / `node:path` 的门禁脚本，随 `npm run check` 跑：

- `scripts/check-layering.mjs`：7 条规则（5 条依赖方向 + 退休名字 + 「规则必须扫到文件」），
  规则表在脚本里，语义写在 [架构 §6](../../docs/architecture.md)。
  每条规则必须真的扫到文件，否则报 `rule-not-wired`。
- `scripts/check-doc-paths.mjs`：Markdown 相对链接是否还能解析；文档与 workflow 里的
  `npm run <脚本名>` 是否存在；`.github/README.md` 有没有顶掉仓库首页；
  [screenshots.json](../../screenshots.json) 与 `docs/images/` 是否双向一致。

后两项是后来补的，都是同一类**零信号**故障：首页被换成内部手册而全部门禁照绿；
截图清单与磁盘漂开只在市场条目里才看得出来。

两个脚本把纯函数导出，由 [tests/gates.test.ts](../../tests/gates.test.ts) 钉住各自踩过的静默 bug：

- 剥注释**必须保留换行与字节偏移**，否则报出的行号整体漂一格。
- 提取依赖**必须锚在行首**，否则 `{ import: '/v0/…' }` 这样的字符串会被当成依赖。

ESLint 也一并加上，并且把 `src/browser/**` 当作浏览器侧：picker 与 Client 半端都不该看到 Node 全局。

## 替代方案

- **照搬上游的分层规则表**：`channels/`、`ops/`、`setup/`、`contracts/` 在本仓都不存在，
  照搬只会得到一张空规则表 —— 而空规则表比没有规则更糟，它看起来像已生效。
- **只靠 ESLint 的 `no-restricted-imports`**：能表达依赖方向，但表达不了
  “文件必须零 import”和“退休名字不得回归”，也拿不到本仓的分层语义。
- **只写文档不写脚本**：这正是当前状态，而它已经失效过一次（改名只做了一半）。
- **先写脚本不写自测**：两份参考实现的脚本各出过一次静默 bug，没有自测就会复现。
- **让 CI 逐条重写 `check` 的步骤**：那样两份步骤清单没有判据保证同步 ——
  参考仓就漂过：它的 workflow 里格式检查的扩展名清单比 `package.json` 少 8 种，
  于是那批文件在 CI 上不在门禁里。本仓的 CI 直接调 `npm run check`，顺序只有一处事实源。
