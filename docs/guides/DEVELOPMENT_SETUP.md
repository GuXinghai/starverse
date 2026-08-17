# 开发环境配置指南

> **Status**: active
> **Document Role**: guide
> **Last updated**: 2026-08-14
>
> 2026-08-14 重写：原指南基于 2025-12 的旧基线（Node 18、`data.db`、Worker 线程、`dev:vite`/`typecheck` 等脚本）；已按 [README](../../README.md) 与 `package.json` 的现行事实重写。

**目标读者**: 新入职开发人员、贡献者
**预计用时**: 15 分钟

## 前置要求

| 软件 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | `>=22.12 <23` | `package.json` `engines` |
| npm | `>=10 <11` | 同上 |
| Git | 任意近期版本 | |
| VS Code | 最新版（可选） | 推荐 Vue - Official、ESLint、Tailwind CSS IntelliSense 插件 |

## 安装

```bash
git clone https://github.com/GuXinghai/starverse.git
cd starverse
npm install
```

`npm install` 的 `postinstall` 会把 `better-sqlite3` 重建为 Node ABI。本文命令以当前 Windows/PowerShell 环境为基线；macOS/Linux 可复用同一组 npm scripts，但 `dev:clean` 等脚本包含平台专用命令。

## 启动

| 命令 | 用途 |
| --- | --- |
| `npm run electron:dev` | **完整桌面开发环境**：自动重建 Electron ABI，并启动 Vite + Electron 主进程 + epoch-2 数据库运行时 |
| `npm run dev` | 仅启动 Renderer/Vite 开发服务器（不启动 Electron） |

`dev:clean`（Windows）会先结束 `electron.exe` 再启动 dev 服务器。

## better-sqlite3 ABI（重要）

Node/Vitest 与 Electron 使用不同的 native ABI，同一时间只有一个目标有效：

```bash
npm run rebuild:node      # 数据库测试 / Node 脚本 / Vitest 前
npm run rebuild:electron  # Electron 手工启动或 smoke 前
```

看到 `NODE_MODULE_VERSION` 或 native binding 错误时，为当前环境重建后重试原命令。不要提交 `node_modules`、native binary 或仅由重建产生的锁文件变化。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm test` / `npm run test:unit` | unit partition（不会自动重建 ABI） |
| `npm run test:ui` | jsdom UI partition |
| `npm run test:integration` | integration partition |
| `npm run test:prepare` | 手动重建 Node ABI（数据库/native 测试前） |
| `node scripts/check-test-partitions.mjs` | 校验测试发现、owner、override、slow 规则 |
| `npm run lint` / `npm run lint:changed` | ESLint（全部 / 变更文件） |
| `npm run verify:ssot` | unit 测试 + SSOT/UI/网络出口/Git 治理门禁 |
| `npm run gate:docs` | 文档入口链接与新增文档元数据检查 |
| `npm run storybook` | Storybook（端口 6006） |

测试分层规则与 slow 约束见 [测试策略](../maintenance/test-strategy.md)。

## 类型检查与提交前检查

```bash
npx tsc --noEmit --pretty false
npx vue-tsc --noEmit
npm run lint:changed
npm run gate:docs
git diff --check
```

## 数据目录（epoch-2）

应用数据位于 Electron `appData` 下的 `Starverse` 产品目录：

- `<appData>/Starverse/workspace/epoch-2/starverse.db` — 主数据库（对话、消息、分支、项目、模型目录/偏好、路由、FTS5 索引）
- `<appData>/Starverse/config.json` — 应用配置与官方 Provider 受保护凭据
- `<appData>/Starverse/workspace/epoch-2/assets`、`plugins`、`runtimes` — 附件、插件与运行时

应用不再打开旧的 `chat.db`；schema digest 不匹配时会显示确认对话框，确认后先备份数据库再重建。无头或自动化启动可显式设置 `SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH=1` 跳过对话框。

## 常见问题

- **native binding 报错** → 见上文 ABI 一节。
- **只看到 Renderer、没有 Electron 窗口** → 用 `npm run electron:dev` 而非 `npm run dev`。
- **需要网络出口诊断** → `npm run gate:network-egress`；抓包用 `npm run dev:netlog`。
- **打包身份验证** → `npm run test:packaged-identity-smoke`。

## 相关文档

- [文档导航中心](INDEX.md)
- [测试策略](../maintenance/test-strategy.md)
- [本地运行时工作目录规范](../maintenance/local-runtime-workdirs.md)
- [故障排查](TROUBLESHOOTING.md)
