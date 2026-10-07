# tests/ — 规则层

继承 [../AGENTS.md](../AGENTS.md)。

tests/ 特有约束：

- **只测当前产品**：旧布局扫描 / 保留区域流程已删除，不要再为它补用例。
- **运行时是 `node:test` + `tsx`**，不是 vitest；不要引入第二个测试运行器。
  fake timer 用 `context.mock.timers`。
- **不 mock Harness 宿主**：需要真实宿主时用 `../scripts/` 下的验收脚本，不在这里造假 Context。
- **不写依赖个人 Profile 或网络的用例**：本目录必须能在 `npm ci` 后离线全绿。
- **改动 `src/` 的公开契约时先补判据再改行为**；每条断言要能独立失败。
- **快照只在明确要求时更新**，见 [README.md](README.md) 的写入方式。
- 覆盖范围与运行方式见 [README.md](README.md)。
