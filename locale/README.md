# locale/ — 包元数据文案

| 文件      | 语言 | 内容                             |
| --------- | ---- | -------------------------------- |
| `zh.json` | 中文 | `meta.title`、`meta.description` |
| `en.json` | 英文 | 同上                             |

宿主按 `package.json` 的 `exports["./locale/*.json"]` 读取，用于插件管理页显示名称与说明。
两边的键必须一致；只有值不同。

界面文案不在这里，在 [../src/client/annotation-copy.ts](../src/client/annotation-copy.ts)。
