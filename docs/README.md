# docs/ — 辅助文档索引

- 约束与写作偏好 → 见 [AGENTS.md](AGENTS.md)。

| 文档                                             | 回答什么                                           | 改它的时机                   |
| ------------------------------------------------ | -------------------------------------------------- | ---------------------------- |
| [architecture.md](architecture.md)               | 不变的设计决策、契约、失败模式、分层与编号防错清单 | 契约、边界或门禁变化时       |
| [browser-integration.md](browser-integration.md) | 宿主补丁是什么、怎么应用、怎么构建与打包           | 补丁、提供方或打包流程变化时 |
| [verification.md](verification.md)               | 验到了什么程度、哪些**没有**验证                   | 每次真实验收之后             |
| [distribution.md](distribution.md)               | 安装方式、各市场收录规则、发布顺序                 | 分发渠道或版本状态变化时     |
| [publishing.md](publishing.md)                   | CI 跑什么、门禁怎么分工、`.github/` 的规矩         | workflow 或门禁串联变化时    |
| [roadmap.md](roadmap.md)                         | 维护优先级与未立项方向                             | 优先级变化时                 |
| [images/](images/)                               | 文档截图                                           | 界面变化时同时更新           |
| [marketplace/](marketplace/)                     | 向社区目录提交的条目                               | 提交或更新市场条目时         |

## 生成物

[harness-browser-annotation.patch](harness-browser-annotation.patch) 由宿主检出生成，不是手写文档：

```powershell
git -C ../harness-browser-integration diff HEAD --output docs/harness-browser-annotation.patch
```

生成后必须跑 `npm run verify:browser-patch` 确认它仍能应用到精确基线。
生成产物不得入库到别处；`prepack` 会用它的哈希拦住不一致的包。
