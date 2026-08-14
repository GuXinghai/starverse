# Starverse

Starverse 是一个本地优先的 AI 对话桌面客户端。它使用 Electron、Vue 3 和 TypeScript 构建，将对话、分支、项目、模型目录与偏好、路由和搜索索引持久化到当前 epoch-2 SQLite 数据库，同时通过受控的 Electron 主进程边界连接云端模型服务、本地推理运行时和自定义 OpenAI Chat Completions-compatible 服务。

> Starverse 正在持续开发。当前仓库适合开发、测试和架构验证；正式发行前仍需完成平台图标、代码签名、公证以及各平台安装包的安装、升级和卸载验证。

## 能力概览

- 多 Provider 流式文本对话，并保存每次回答使用的 Provider、模型和路由 provenance；部分 Provider 还支持图像生成。
- OpenRouter、OpenAI Responses、Google AI Studio、Anthropic Messages 和 DeepSeek 官方接口。
- LM Studio、Ollama 和自定义 loopback endpoint 等本地运行时。
- 可配置的 OpenAI Chat Completions-compatible Provider 实例、模型目录、endpoint、请求配置和响应解析。
- 对话分支、重试、重新生成、编辑后重发，以及新对话模板。
- Epoch-2 SQLite 持久化与 FTS5 全文搜索。
- 图片和文件附件、发送前兼容性检查、衍生文件与可选文档转换运行时。
- Markdown、语法高亮、KaTeX 数学公式和安全清理后的富文本展示。
- 中英文界面、模型目录与偏好、项目管理、网络代理和诊断工具。

## Provider 与运行时

| 类型 | 接入方式 | 说明 |
| --- | --- | --- |
| OpenRouter | OpenRouter API | 远程模型目录、凭据管理和流式聊天 |
| OpenAI | Responses API | 官方 Responses 协议与推理参数 |
| Google | Google AI Studio / Gemini API | 官方 Gemini 文本与多模态请求路径 |
| Anthropic | Messages API | 官方 Anthropic Messages 协议 |
| DeepSeek | DeepSeek API | 官方 DeepSeek 文本聊天路径 |
| OpenAI-compatible | Chat Completions-compatible | 用户定义 Provider、endpoint、认证、模型与解析配置 |
| LM Studio | 本地服务 | loopback 探测、模型管理和聊天 |
| Ollama | 本地服务 | loopback 探测、模型加载/卸载和聊天 |
| Local endpoint | 本地兼容服务 | 面向显式配置的 loopback endpoint |

可用模型取决于用户凭据、本地运行时和远端目录，仓库不承诺固定的模型数量。

表中的 Google 指 Google AI Studio Provider；Gemini 是其 API/模型家族称呼，不是另一个独立 Provider。

## 快速开始

### 环境要求

- Node.js `>=22.12 <23`
- npm `>=10 <11`
- Git

```bash
git clone https://github.com/GuXinghai/starverse.git
cd starverse
npm install
npm run electron:dev
```

`npm install` 会通过 `postinstall` 将 `better-sqlite3` 重建为 Node ABI；`npm run electron:dev` 会自动切换到 Electron ABI，并启动 Vite、Electron epoch-2 主进程和数据库运行时。

本文命令以当前 Windows/PowerShell 开发环境为基线；macOS/Linux 可复用同一组 npm scripts，但 `dev:clean` 等脚本包含平台专用命令。

如果只需要启动 Renderer/Vite 开发服务器：

```bash
npm run dev
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run electron:dev` | 重建 Electron ABI，并启动完整桌面开发环境 |
| `npm run dev` | 启动 Renderer/Vite 开发服务器 |
| `npm run build` | 类型检查、构建 Renderer/native epoch 产物并调用 electron-builder |
| `npm run test:prepare` | 手动重建 Node native ABI（数据库/native 测试前按需执行） |
| `npm test` | 仅运行 unit partition（不会自动重建 ABI） |
| `npm run test:unit` | 显式运行 unit partition（与 `npm test` 相同范围） |
| `npm run test:watch` | 监听模式运行 unit partition |
| `npm run test:ui` | 运行 jsdom UI partition |
| `npm run test:integration` | 运行 integration partition |
| `npm run test:model-catalog:smoke` | 运行模型目录查询与详情的 focused smoke |
| `npm run test:model-picker:smoke` | 按 unit/UI/integration 三阶段运行 model-picker mixed smoke |
| `npm run test:ui:slow -- path/to/one.slow.test.ts` | 一次运行一个 slow UI 文件 |
| `npm run test:integration:slow -- path/to/one.slow.test.ts` | 一次运行一个 slow integration 文件 |
| `npm run test:coverage` | 生成 unit partition 覆盖率 |
| `npm run test:runner-ui` | 启动 Vitest dashboard（不是 UI partition） |
| `node scripts/check-test-partitions.mjs` | 校验测试发现、owner、override 和 slow 规则 |
| `npm run lint` | 运行 ESLint |
| `npm run test:electron-smoke` | 自动重建 Electron ABI、构建并运行 Electron shell smoke |
| `npm run test:packaged-identity-smoke` | 验证打包身份和临时 user-data 隔离 |
| `npm run test:epoch-database:electron` | 在 Electron ABI 下验证 fresh epoch-2 数据库启动 |
| `npm run test:model-provider-identity:fresh-profile` | 运行模型/Provider identity fresh-profile smoke |
| `npm run verify:ssot` | 运行 unit partition 及 SSOT、UI、网络出口和 Git 治理门禁 |
| `npm run gate:network-egress` | 检查生产网络出口是否经过已分类边界 |
| `npm run gate:generation-v2-zero-residual` | 检查已删除的旧 Generation V2 路径和残留引用 |
| `npm run gate:model-identity-purge` | 检查模型/Provider identity hard-cut 边界 |
| `npm run gate:docs` | 检查文档入口链接和新增文档最小元数据 |
| `npm run storybook` | 启动 Storybook |

### `better-sqlite3` ABI

Node/Vitest 与 Electron 使用不同的 native ABI，同一时间只有一个目标有效：

```bash
# Node 脚本、数据库测试和 Vitest 前
npm run rebuild:node

# Electron 手工运行或 smoke 前
npm run rebuild:electron
```

如果看到 `NODE_MODULE_VERSION` 或 `better-sqlite3` native binding 错误，请为即将运行的环境重建，然后重试原命令。不要提交 `node_modules`、native binary 或仅由重建产生的锁文件变化。

测试准备是手动步骤：数据库/native Node 测试前按需执行 `npm run test:prepare`。`npm test` 保持 unit-only 且不会隐式切换 native ABI；`npm run test:electron-smoke` 会在脚本内部重建 Electron ABI，其他 Electron smoke 或手工启动前仍应先执行 `npm run rebuild:electron`。

测试分层规则、slow 单文件约束、已删除的 `infra/db/worker.filePipeline.test.ts`
边界，以及 model-picker 的 mixed split 说明见
[`docs/maintenance/test-strategy.md`](docs/maintenance/test-strategy.md)。

## 架构概览

```text
Vue Renderer
  src/ui-app · src/ui-kit · src/next
          │
          │ narrow preload APIs + validated IPC contracts
          ▼
Electron Main
  epoch-2 bootstrap · credentials · provider transports · catalog sync · file services
          │
          ├── remote providers / loopback runtimes
          │
          └── better-sqlite3 (main-process ownership)
                    ▼
              epoch-2 SQLite repositories
              schema manifest · FTS5 · recovery checks
```

- `src/ui-app/`：应用界面和聊天编排。
- `src/ui-kit/`：可复用聊天组件与富文本渲染。
- `src/next/`：对话、分支、消息、Provider、模型目录、文件和状态领域逻辑。
- `src/shared/`：跨进程契约、Provider-neutral 协议和共享安全逻辑。
- `electron/`：窗口、preload、IPC、凭据、网络传输和系统服务。
- `infra/db/`：SQLite schema、Generation V2 repositories 和数据契约。
- `infra/files/`：文件管道、衍生任务、转换与 managed runtime 生命周期。

Provider 请求、凭据解析和 epoch-2 数据库连接由 Electron 主进程拥有。Renderer 只能使用 preload 暴露的窄接口，不能直接读取主进程凭据或打开 SQLite。

## 数据与安全边界

Starverse 默认将应用数据放在 Electron `appData` 根下的 `Starverse` 产品目录：

- `<appData>/Starverse/workspace/epoch-2/starverse.db`：当前对话、消息、分支、项目、模型目录/偏好、路由、Generation V2 数据和搜索索引。
- `<appData>/Starverse/config.json`：应用配置，以及官方 Provider 的受保护凭据记录。
- `<appData>/Starverse/workspace/epoch-2/assets`、`plugins`、`runtimes`：受 epoch-2 布局管理的附件、插件和运行时目录。
- `<appData>/Starverse/workspace/epoch-2/debug/generation-raw.sqlite`：独立的原始请求调试存储（仅在相关调试路径启用时使用）。

OpenAI-compatible Provider 的实例、endpoint、配置 revision 和凭据 revision 由 `starverse.db` 的专用表管理；它们不等同于官方 Provider 的 `config.json` 凭据记录。当前 epoch-2 不打开旧的 `chat.db`；schema digest 不匹配时默认 fail-closed，只有显式设置 `SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH=1` 才会执行备份并重建。

主要边界包括：

- 主窗口启用 sandbox 和 context isolation，并关闭 Node integration。
- epoch-2 主数据库使用受控的 journal、schema manifest 和完整性检查；搜索使用 FTS5。调试用原始请求库与主数据库分离。
- Provider 凭据优先使用 Electron `safeStorage` 加密，并只在主进程解析。
- OpenAI-compatible 网络请求在主进程执行地址/DNS 审计、重定向限制、代理路由和凭据转发检查。
- IPC 输入通过显式契约和 schema 验证。
- 捕获的扩展字段和诊断信息在持久化或展示前执行边界限制与脱敏。

“本地优先”表示会话和配置默认保存在本机，并不表示应用完全离线。发送消息、同步远端模型目录、下载插件或处理远程 URL 时，数据会按用户选择发送到相应服务。

## 文件、转换与插件

文件进入聊天前会经过类型识别、资产持久化和 Send Plan 检查。仓库包含图片处理、DOCX/XLSX 文本处理、PDF/HTML/Office 衍生任务，以及 managed engine/plugin 的安装、验证、恢复和隔离机制。

LibreOffice 属于可选 managed runtime。其可用性取决于平台、安装方式和本地环境；相关 smoke 默认不会替用户下载或安装大型运行时。大型 runtime、模型、解压包、诊断 profile 和生成产物不应放在 Vite watch 范围内，详见 [本地运行时工作目录规范](docs/maintenance/local-runtime-workdirs.md)。

## 构建与打包

```bash
npm run build
```

当前 electron-builder 配置包含 Windows NSIS x64、macOS DMG 和 Linux AppImage target。生产身份由 `io.github.guxinghai.starverse` / `Starverse` 固定，开发和 E2E 运行时只使用明确的 `.dev` / `.e2e` 后缀；正式分发前仍需要完成至少以下工作：

- 配置平台图标、代码签名和 macOS notarization。
- 在目标操作系统上验证安装、升级、卸载和 native dependency。
- 验证可选 runtime 与文件转换能力的打包行为。

因此，配置中存在 target 不代表仓库当前提供经过验证的正式跨平台安装包。

## 文档导航

- [Agent 与任务入口](docs/AGENT_INDEX.md)
- [文档状态索引](docs/DOC_STATUS_INDEX.md)
- [开发指南总入口](docs/guides/INDEX.md)
- [架构总览](docs/architecture/OVERVIEW.md)
- [Provider 架构](docs/architecture/provider-architecture/README.md)
- [OpenAI-compatible 重建决策与验收](docs/architecture/provider-architecture/openai-chat-compatible/REBUILD_MASTER_PLAN.md)
- [文件管道](docs/file-pipeline/README.md)
- [维护者入口](docs/maintenance/maintainer-entry.md)
- [本地运行时工作目录规范](docs/maintenance/local-runtime-workdirs.md)
- [变更记录](CHANGELOG.md)

文档包含现行规范、历史记录和阶段性调查。实施前请结合 [文档状态索引](docs/DOC_STATUS_INDEX.md) 判断其权威级别，并以当前源码和测试为最终依据。

## 贡献

1. 从最新 `main` 创建工作分支。
2. 保持改动范围清晰，不混入生成文件或 native rebuild 产物。
3. 根据改动运行相应测试、类型检查和门禁。
4. 提交 Pull Request，并在描述中列出验证命令与已知限制。

源码、文档和配置文件统一使用 UTF-8。提交前建议至少运行：

```bash
npx tsc --noEmit --pretty false
npx vue-tsc --noEmit
npm run lint:changed
npm run gate:docs
git diff --check
```

数据库密集型测试前请先切换到 Node ABI；Electron smoke 应作为最终步骤切换到 Electron ABI（`npm run test:electron-smoke` 会在脚本内部完成该切换）。

## License

[MIT](LICENSE) © Starverse contributors.
