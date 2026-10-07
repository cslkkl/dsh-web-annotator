# scripts/ — 规则层

继承 [../AGENTS.md](../AGENTS.md)。

scripts/ 特有约束：

- **门禁脚本只用 `node:fs` / `node:path`**，不引第三方依赖：frozen 安装之后要能直接跑。
- **门禁脚本必须断言“前提成立”**：扫到 0 个文件、规则没匹配到任何文件，都要报失败，
  否则“没跑起来”和“通过”长得一模一样。
- **判据要可测**：把纯函数导出，由 [../tests/gates.test.ts](../tests/gates.test.ts) 钉住。
  两个门禁脚本各踩过一次静默 bug（行号漂移、把字符串当依赖），别再踩。
- **构建脚本读宿主检出时一律走 `hostCheckout()`**（认 `DSH_HOST_CHECKOUT`），
  不要各自拼 `../harness-browser-integration`。
- **共享模块清单只有一份**：[shared-modules.mjs](shared-modules.mjs)。
  不要在同步脚本或构建脚本里重抄文件名。
- **测试 home 必须在工作区内**，并且只在临时目录里创建；不得读写个人 Profile。
- **临时目录必须清理**：探针留下的目录会让下一次 diff 不可读。
- 每个脚本做什么、何时跑见 [README.md](README.md)。
