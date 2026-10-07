# 决策：把"能测的判据"从 .tsx 里移出去（2026-10-07）

状态：生效

## 问题

三条用户可见的判定原先住在 `src/client/index.tsx`：picker 的 25 个文案字段、错误码到文案的映射、以及"实际能发哪种方式"的降级。判据一条都写不出来，因为该文件 `import { Button } from '@deepseek-ai/dsh-client-ui-primitives'`，而 primitives 依赖只有浏览器宿主才注入的模块 —— Node 侧根本加载不了这个文件。

后果具体有三条：

1. 错误码映射默认落到"通用失败"，而**默认成成功**会掩盖真实错误，这类分支没判据最危险。
2. picker 的字段表在**三个地方**各写一份（选项类型、两张文案表、`protocol.ts` 的跨进程校验），漂开时页面少一行文字，没有任何报错。
3. 发送方式降级（有图才能发图）是纯三元表达式，混在组件里，改错只会静默发出没有附件的请求。

## 决策

- 判定下沉到不含 JSX、不引 UI 包的 `.ts` 兄弟文件。当前有两份：`src/client/annotation-view.ts`（picker 选项、错误码、发送方式降级）与 `src/client/annotation-thumbnail.ts`（目标元素标签、徽标锚点、截图像素重画）。
- 只有组件能读宿主主题，所以主题作为参数传入：`pickerOptions(translate, dark)`，`interaction` 读取留在组件里。
- `PICKER_COPY_KEYS` 作为字段表的**单一来源**；`tests/annotation-view.test.ts` 逐字段删掉一个再断言 `isAnnotationOptions` 拒绝，从而把 `protocol.ts` 的字段表钉住 —— 不必改那个同步模块。
- 未登记的错误码一律落到 `failed`，由 `tests/annotation-view.test.ts` 明确钉住"不许默认成成功"。
- 规则写进 `tests/README.md`：**这块逻辑想要单元判据，它就不能住在 `.tsx` 里。**

## 替代方案

- **在 `.tsx` 里导出这些函数，测试自己 mock 掉 primitives**：`require` 解析在 Node 侧就失败，得给测试加一层模块替身，等于把"能不能测"变成"测试环境的配置正确不正确"。
- **把这些判定挪进 `protocol.ts`**：那是四份同步模块之一，改动要跑 `sync:browser-provider` 并重新生成宿主补丁；为纯前端判定付这个代价不值。
- **只加类型约束，不写判据**：`Record<AnnotationCopyKey, string>` 能保证"用到的键存在"，保证不了"没有没人用的键"，也保证不了错误码不默认成成功。
- **让 picker 自己去读主题**：那会把 DOM 读带进纯函数，等于把刚拆出来的东西又塞回去。

## 影响

- `index.tsx` 减少约 40 行，只剩渲染与接线；`annotation-view.ts` 有 4 项判据，全部能在 Node 里跑。
- 文案表新增了死键判据（`tests/annotation-copy.test.ts`），并因此删掉 3 个遗留键。
- 代价是多两个文件、多一次参数传递（`dark`）。判断标准清楚，后续同类逻辑照此办理。
