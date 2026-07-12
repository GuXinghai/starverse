# Starverse

Starverse 是一个本地优先的 AI 对话桌面客户端。它使用 Electron、Vue 3 和 TypeScript 构建，将对话、分支、项目、模型偏好和搜索索引持久化到本机 SQLite，同时通过受控的 Electron 主进程边界连接云端模型服务、本地推理运行时和自定义 OpenAI Chat Completions-compatible 服务。

> Starverse 正在持续开发。当前仓库适合开发、测试和架构验证；正式发行前仍需完善应用标识、签名、公证和各平台安装包验证。

## 能力概览

- 多 Provider 流式对话，并保存每次回答使用的 Provider、模型和路由信息。
- OpenRouter、OpenAI Responses、Google AI Studio、Anthropic Messages 和 DeepSeek 官方接口。
- LM Studio、Ollama 和自定义 loopback endpoint 等本地运行时。
- 可配置的 OpenAI Chat Completions-compatible Provider 实例、模型目录、请求配置和响应解析。
- 对话分支、重试、重新生成、编辑后重发，以及新对话模板。
- SQLite WAL 持久化与 FTS5 全文搜索。
- 图片和文件附件、发送前兼容性检查、衍生文件与可选文档转换运行时。
- Markdown、语法高亮、KaTeX 数学公式和安全清理后的富文本展示。
- 中英文界面、模型目录与偏好、项目管理和诊断工具。

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

## 快速开始

### 环境要求

- Node.js `>=22 <23`
- npm `>=10 <11`
- Git

```bash
git clone https://github.com/GuXinghai/starverse.git
cd starverse
npm install
npm run electron:dev
```

`npm install` 会通过 `postinstall` 将 `better-sqlite3` 重建为 Node ABI；`npm run electron:dev` 会自动切换到 Electron ABI，并启动数据库 Worker、Vite 和 Electron。

如果只需要启动 Renderer/Vite 开发服务器：

```bash
npm run dev
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run electron:dev` | 重建 Electron ABI，并启动完整桌面开发环境 |
| `npm run dev` | 启动 Renderer/Vite 开发服务器 |
| `npm run build` | 类型检查、构建数据库 Worker、构建 Renderer 并调用 electron-builder |
| `npm test` | 重建 Node ABI，并运行全部 Vitest 测试 |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run test:ui` | 启动 Vitest UI |
| `npm run test:coverage` | 生成测试覆盖率 |
| `npm run lint` | 运行 ESLint |
| `npm run db:verify` | 使用 Node ABI 验证数据库 |
| `npm run test:electron-smoke` | 构建并运行 Electron shell smoke |
| `npm run test:electron-compatible-e2e` | 运行 OpenAI-compatible Electron E2E smoke |
| `npm run verify:ssot` | 运行全量测试与仓库治理门禁 |
| `npm run gate:network-egress` | 检查生产网络出口是否经过已分类边界 |
| `npm run gate:no-legacy-compatible` | 检查已淘汰的 compatible 身份和路径 |
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

## 架构概览

```text
Vue Renderer
  src/ui-app · src/ui-kit · src/next
          │
          │ narrow preload APIs + validated IPC contracts
          ▼
Electron Main
  credentials · provider transports · catalog sync · file services
          │
          ├── remote providers / loopback runtimes
          │
          └── Node Worker thread
                    ▼
              SQLite repositories
              WAL · FTS5 · migrations
```

- `src/ui-app/`：应用界面和聊天编排。
- `src/ui-kit/`：可复用聊天组件与富文本渲染。
- `src/next/`：对话、分支、消息、Provider、模型目录、文件和状态领域逻辑。
- `src/shared/`：跨进程契约、Provider-neutral 协议和共享安全逻辑。
- `electron/`：窗口、preload、IPC、凭据、网络传输和系统服务。
- `infra/db/`：SQLite schema、Node Worker runtime 和 repositories。
- `infra/files/`：文件管道、衍生任务、转换与 managed runtime 生命周期。

Provider 请求和密钥解析由 Electron 主进程拥有。Renderer 只能使用 preload 暴露的窄接口，不能直接读取主进程凭据。

## 数据与安全边界

Starverse 默认将应用数据放在 Electron `userData` 目录：

- `chat.db`：对话、消息、分支、项目、模型目录、路由和搜索索引。
- `config.json`：应用配置和凭据载荷。

主要边界包括：

- 主窗口启用 sandbox 和 context isolation，并关闭 Node integration。
- SQLite 使用 WAL；搜索使用 FTS5。
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

当前 electron-builder 配置包含 Windows NSIS x64、macOS DMG 和 Linux AppImage target，但应用标识仍包含开发期占位配置。正式分发前需要完成至少以下工作：

- 设置最终 `appId` 和产品名称。
- 配置平台图标、代码签名和 macOS notarization。
- 在目标操作系统上验证安装、升级、卸载和 native dependency。
- 验证可选 runtime 与文件转换能力的打包行为。

因此，配置中存在 target 不代表仓库当前提供经过验证的正式跨平台安装包。

## 文档导航

- [Agent 与任务入口](docs/AGENT_INDEX.md)
- [文档状态索引](docs/DOC_STATUS_INDEX.md)
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
git diff --check
```

数据库密集型测试前请先切换到 Node ABI；Electron smoke 应作为最终步骤切换到 Electron ABI。

## License

[MIT](LICENSE) © Starverse contributors.
