# 发布链路

CI 与发布相关的事实都写在这里。

⚠️ **不要在本目录之外再建 `.github/README.md`。** GitHub 的首页 README 解析顺序是
`.github/README.md` → 根 `README.md` → `docs/README.md`。放了前者，仓库首页会变成这份
维护者文档，把面向用户的根 README 顶掉。判据：本仓只有根 `README.md` 与本案的
`docs/README.md`，`.github/` 下只有 `workflows/`。

## workflows

| 文件                                                      | 触发                                  | 做什么                                                                                                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [workflows/ci.yml](../.github/workflows/ci.yml)           | `push` / `pull_request` / 手动        | Ubuntu 与 Windows 双跑：`npm run check` → 真实 Chromium 存储回归 → 校验补丁基线 → 构建宿主提供方 → 窄范围类型检查 → `npm pack --dry-run --json`（经 `prepack` 做产物完整性断言）                                             |
| [workflows/release.yml](../.github/workflows/release.yml) | `push` 标签 `v*` / 手动（显式 `tag`） | 构建并验收**要发布的那个** tgz，再建 Release，最后发 npm：`npm run check` → 存储回归 → 补丁校验 → 构建宿主提供方 → `npm pack` → 真实宿主验收 → `verify:delivery` → 挂上 tgz、源码 ZIP 与验证记录 → Trusted Publishing 发 npm |

`ci.yml` 检出官方 Harness 的精确基线到 `.host-source`，并把该路径经 `DSH_HOST_CHECKOUT`
交给构建与校验脚本。`.host-source/` 已被 `.gitignore` 忽略。
Node 版本只从 [../.node-version](../.node-version) 读。

CI 不跑 `test:acceptance` / `test:harness`：它们需要打包产物、真实 Chromium 与一个完整
Harness 安装。**发布链路自己跑这一套** —— 那是发版门禁，不是日常门禁，见下。

## 发版

版本号必须在打标签**之前**已经在 `package.json` 里 bump 过，并且 `CHANGELOG.md` 里要有
对应的一节：Release 正文就从那里取（`npm run release:assets`），
**缺这一节时脚本直接失败**，不会退化成一份空正文。

```powershell
# 1. 改 package.json 的 version、CHANGELOG 的对应一节，以及市场条目的 tarball 行
#    （见 [分发说明](distribution.md) 的「条目里的 tarball 必须跟着版本走」—— 漏改不报错）
# 2. 打标签再推 —— 这一下触发发布
git tag v<版本>
git push origin v<版本>
```

`release.yml` 随后在 Windows runner 上依次：核对标签与 `package.json` 一致 → `npm run check`
→ 真实 Chromium 存储回归 → 打补丁并按精确基线校验 → `build:host` → 窄范围类型检查
→ `npm pack` → 安装精确版本 Harness 并用**打包产物**跑 `test:acceptance` →
`verify:delivery` → `npm run release:assets` → 建（或更新）Release 并挂附件
→ 发 npm（见下）。

⚠️ **验收失败就不发。** 这是「交付的 tgz 与验收时安装的运行时逐字节一致」的唯一可靠路径：
换一台机器、换一个检出目录名重建 provider，产物里的 sourcemap `sources` 会带上那个目录名
（实测 `../../../../harness-browser-integration/packages/...` 会变成 `-alt` 版本，字节就不同了），
所以发布必须用**验收用的那一份**，而不是另建一份。

想在没有 Release 的情况下重来一遍，用 `workflow_dispatch` 传一个**已存在**的标签重跑；
它是幂等的：Release 已存在就更新正文与附件。

⚠️ **runner 与开发机不一样。** 第一次跑通之前会依次踩到三处差别：Harness CLI 的安装位置
（`setup-node` 把全局前缀指到工具缓存，不是 `%APPDATA%\npm`）、插件管理器装 tgz 要靠
`pnpm`（runner 上没有）、界面语言取自 `navigator.languages`（en-US 的机器上渲染成英文，
而验收断言的是中文按钮）。三处都写在 [release.yml](../.github/workflows/release.yml)
对应步骤的注释里 —— 症状都是「验收挂了」，而真正的原因都不在报错里。

⚠️ **别只看 workflow 的颜色。** 第一次发 alpha.10 时 workflow 全绿，Release 上却**没有安装包**
（`npm pack` 的产物在仓库根目录，而上传只挂附件目录），所以
[`npm run release:assets`](../scripts/README.md) 现在自己断言附件齐不齐；复核时也要亲眼看一下
Release 的附件列表。

## npm 发布

认证走 **Trusted Publishing（OIDC）**，与 [dsh-cpa-switch](https://github.com/cslkkl/dsh-cpa-switch)
同一套做法：**仓库里不存任何 npm token**，npm 侧凭「本仓库的 `release.yml`」授权，
所以 `release.yml` 里必须有 `id-token: write`。**不要**加 `NPM_TOKEN` secret ——
OIDC 已替代它，加了反而会在 token 过期后静默回到「workflow 能跑、包发不出去」的状态。
配好之后建议把包的 Publishing access 改成「**Require two-factor authentication and
disallow bypass 2fa tokens**」，堵掉 token 这条并行通道。

环境要求 npm CLI ≥ 11.5.1（Node 24 自带的够新），registry 由 `setup-node` 的
`registry-url` 显式钉到 `https://registry.npmjs.org`。

### npm 侧怎么配（一次性）

Trusted Publishing 配在**已存在的包**上，所以顺序不能颠倒：先让包存在，再配连接。
登录 npmjs.com → **Packages → 本包 → Settings → Trusted publishing** →
**Add trusted publisher** → 选 **GitHub Actions**：

| 字段                 | 值                                               |
| -------------------- | ------------------------------------------------ |
| Organization or user | `cslkkl`                                         |
| Repository           | `dsh-web-annotator`                              |
| Workflow filename    | `release.yml`（**只填文件名**，不带 `.github/`） |
| Environment name     | 留空                                             |

⚠️ **`Allowed actions` 里必须勾 `Allow npm publish`。** 2026-09-03 之后新建的连接
**默认只允许 `npm stage publish`**（暂存发布，要人工批准才上线）。漏勾时包只会进暂存区，
而 **workflow 依然全绿** —— 症状是「CI 成功、npm 上看不到新版本」，最难查的一类。
`Allow npm dist-tag` 不用勾：发稳定版用的是 `npm publish --tag latest`，属于 publish 权限。

⚠️ **字段建好不可改** —— provider 与必填项一旦创建即固定，填错只能删掉重建。

⚠️ **新建的连接有 2 天激活期**：必须在 2 天内成功发布一次，否则连接**过期且不可编辑**，
只能删除重建。所以「配好」与「发一版」要挨着做；而为了激活而发的那一版本身也得有内容，
不要为了跑通链路发一个空版本。

包还不存在时，`release.yml` 里的 npm 这一步会**明确警告后跳过**（Release 已经建好了，
缺的只是 npm 这一路），不会让发布无故变红。

### 备用路径：本机手发

OIDC 不可用时，所有者可在本机发布，但**只用于建包这类一次性动作**。本机打包的字节与
CI 验收过的那份**不同**：provider 产物里会写进检出目录名（`../harness-browser-integration/…`
而不是 `.host-source/…`），sourcemap 也跟着变 —— 长期走这条路等于让「发出去的就是验收过的
那一份」失效。首个版本之后一律由 CI 发。

⚠️ 本机 `npm` 若指向镜像（如 `registry.npmmirror.com`），`npm login` / `npm publish` 会报
`Public registration is not allowed` —— 镜像只读，不提供账号与发布。发布时显式指定官方源：

```powershell
npm publish <tgz 或 .> --registry=https://registry.npmjs.org --access public --tag alpha
```

装包仍走镜像（快），所以**不要**改全局 registry。

### dist-tag 与 `latest`

发布命令固定 `--tag alpha`，用户按 `@alpha` 取预览版。

⚠️ **全新包的第一个版本会被 npm 强制占住 `latest`** —— 包必须有一个 `latest`，
`--tag alpha` 拦不住这件事。所以在**还没有稳定版**期间，`latest` 会指向某个 alpha。
这不等于「预览冒充稳定版」（用户显式要 `@alpha` 拿到的才是我们承诺的那条），
但意味着 Desktop 社区市场**仍不会收录**：它要求 `latest` 是稳定精确版本
（见 [分发说明](distribution.md)）。发稳定版时才把 `latest` 指过去。

### 发布后复核

1. `npm view dsh-web-annotator dist-tags` —— `alpha` 应指向刚发的版本。
2. `npm install dsh-web-annotator@alpha` 真装一次。
   ⚠️ 头几分钟可能报 `ETARGET … No matching version found`：那是 npm/CDN 的**传播延迟**，
   而 `npm view` 同时已经能看到新版本。**等几分钟再试，不是失败。**

## 不在这里的事

- **分支保护**：在平台设置界面人工开启，不是仓库文件。
- **市场条目**：向目录仓库提 PR，见 [分发说明](distribution.md)。

## 截图声明

[screenshots.json](../screenshots.json) 是随包发布的截图清单，供市场条目引用。
它是"目录清单"的手写副本，所以由 `npm run check:doc-paths` **双向**校验：
声明的文件必须存在，`docs/images/` 下的截图必须都已登记。
新增截图要同批登记，否则门禁报红。

## 门禁的分工

| 层              | 时机        | 做什么                                                                                              |
| --------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| 本地 pre-commit | 提交前      | 只跑秒级的格式化与 lint，能自动修的自动修，见 [.pre-commit-config.yaml](../.pre-commit-config.yaml) |
| `npm run check` | 提交前 / CI | format → lint → 分层 → 文档路径 → build → typecheck → 产物断言 → 测试                               |
| CI              | push / PR   | 上面全部，另加真实 Chromium 存储回归、补丁基线校验、宿主提供方构建与打包                            |

`check` 的顺序有依赖：`build` 必须在 `typecheck` 与 `verify:artifacts` 之前，
因为两者都读 `lib/`（类型检查读 `lib/vite.d.ts`，产物断言读 `lib/client.js`）。
调整顺序前先看 [../scripts/README.md](../scripts/README.md) 的依赖说明。

钩子按**暂存文件**跑，`check` 跑全量 —— 「钩子绿了」不等于「门禁绿了」。
钩子的 `files:` 与 `package.json` 的 `format:check` glob 是两个家，
由 `tests/format-scope.test.ts` 钉住「门禁 ⊇ 钩子」这个方向。

## 变更影响路由

- 改任一 workflow → 同步本文件与 [分发说明](distribution.md)。
- 改 `npm run check` 的内容或顺序 → 同步根 [AGENTS.md](../AGENTS.md) 的常用命令、
  [../scripts/README.md](../scripts/README.md) 与本案的门禁分工表。
- 改钩子的 `files:` 或 `format:check` 的 glob → 另一处必须同步；
  判据 `tests/format-scope.test.ts` 会拦。
