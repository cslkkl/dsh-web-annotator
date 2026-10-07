# 决策：删掉 layout-care 遗留层并完成改名（2026-10-07）

状态：生效

## 问题

0.2 把产品从“右侧栏扫描 / 保留区域”改成“原有 Browser 内批注”，但旧实现整层留了下来：

- `src/bridge/`（扫描、证据采集、复查）、`src/shared/review.ts`、`src/shared/types.ts`
- `src/client/bridge-client.ts`、`review-storage.ts`、`copy.ts`、`styles.ts`
- 5 个只测旧流程的测试文件，占当时 44 个用例中的 28 个

代价有三条：

1. **旧流程仍然可达**：`src/bridge/index.ts` 同时装了新旧两套桥，`lib/bridge.js` 里既有扫描桥也有批注桥。
2. **改名只做了一半**：`__layout-care__/bridge.js`、`data-layout-care-source`、`__LAYOUT_CARE_CONFIG__`、
   `lc-*` 类名、`layout-care.*` 插槽 id、`LAYOUT_CARE_*` 环境变量全部并存。
3. **文档教的是旧流程**：`examples/responsive-demo` 与 `CONTRIBUTING.md` 仍在讲扫描与保留区域。

## 决策

- 四个半端收敛为三个：宿主入口、Client 半端、页面拾取器。`lib/bridge.js` 只由 `src/browser/bridge.ts` 构建。
- 运行时名字统一为 `web-annotator`：路由 `__web-annotator__/bridge.js`、
  属性 `data-web-annotator-source`、全局 `__WEB_ANNOTATOR_CONFIG__`、类名 `wa-*`、插槽 id `web-annotator.*`、
  环境变量 `WEB_ANNOTATOR_*`。
- **唯一保留的退休名字是旧存储键** `dsh.layout-care.browser-annotations.v1`，
  集中在 `src/client/legacy-names.ts`，读一次完成迁移，新键提交成功后才删除旧值。
- Vite 接入的 `layoutCare` 别名保留：它是对外公开的兼容承诺，不是内部残留。
- `src/browser/bridge.ts` 改成导出 `installAnnotationBridge(win, pick)` 并自带安装尾巴，
  拾取器可注入，于是传输层第一次可以脱离 DOM 被测试。

## 替代方案

- **保留旧层但标记 deprecated**：旧桥会被打进 `lib/bridge.js` 送给每个开发页，
  而它自己声明了 `window.__LAYOUT_CARE_BRIDGE_DISPOSE__`；留着等于永远背着两套协议。
- **一次改掉旧存储键，不写迁移**：alpha.7 / alpha.8 用户会静默丢掉未发送的草稿，
  而 CHANGELOG 已经承诺过存储键兼容。
- **把旧扫描流程做成交互开关**：与“主流程只扩展原有 Browser”冲突，
  且扫描桥的 DOM 证据采集与 picker 的手势层会互相抢指针事件。
- **让 `bridge.ts` 继续 import `annotatePage` 而不做注入**：那正是当前形态，
  结果是传输层只能靠真实浏览器验收，单元测试无法覆盖来源校验。

## 影响

- 源码从 22 个文件降到 14 个；测试从 44 个降到 16 个，但其中 28 个测的是已删流程，
  这轮补回 15 个覆盖当前产品的用例（传输层、picker 自包含、门禁自身）。
- 旧 Vite 集成若写死了 `__layout-care__` 路由或 `data-layout-care-source`，需要同步改名。
  这是本轮的对外破坏点，记入 CHANGELOG。
- `docs/harness-browser-annotation.patch` 必须重新生成（宿主副本里的属性名跟着改）。
