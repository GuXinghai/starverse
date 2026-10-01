# Starverse

[English](README.md) | [简体中文](README.zh-CN.md)

Starverse 是一个本地优先的 AI 对话桌面客户端。它使用 Electron、Vue 3 和 TypeScript 构建，将对话和设置保存在你的设备上，并连接云端模型服务、本地推理运行时和自定义 OpenAI Chat Completions-compatible 服务。

> Starverse 正在持续开发。当前仓库适合开发、测试和架构验证；正式发行前仍需完成平台图标、代码签名、公证以及各平台安装包的安装、升级和卸载验证。

## 能力概览

- 跨多个服务商的流式对话，并保存每次回答使用的服务商、模型和路由来源。
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
| Anthropic | Messages API | 官方 Anthropic Messages 协议（不再维护，逐步移除，见下文声明） |
| DeepSeek | DeepSeek API | 官方 DeepSeek 文本聊天路径 |
| OpenAI-compatible | Chat Completions-compatible | 用户定义 Provider、endpoint、认证、模型与解析配置 |
| LM Studio | 本地服务 | loopback 探测、模型管理和聊天 |
| Ollama | 本地服务 | loopback 探测、模型加载/卸载和聊天 |
| Local endpoint | 本地兼容服务 | 面向显式配置的 loopback endpoint |

可用模型取决于用户凭据、本地运行时和远端目录，仓库不承诺固定的模型数量。

表中的 Google 指 Google AI Studio Provider；Gemini 是其 API/模型家族称呼，不是另一个独立 Provider。

### Anthropic 原生接入维护状态

截至 2026-08-23，Anthropic Messages 原生接入已冻结，不再新增功能或修复问题，并计划逐步移除原生接入及相关引用。

需要 Claude 模型的用户可配置兼容网关或其他提供接入的服务商；Starverse 不保证第三方渠道的可用性或行为。

## 快速开始

以下是从源码启动开发环境的流程，不是正式安装包的安装说明。

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

以上启动命令目前包含 Windows shell 语法（`chcp` 和命令串联）。虽然配置了 macOS 与 Linux 打包目标，但不应将这些启动脚本视为已经验证的跨平台流程。如果原生依赖需要从源码编译，请安装对应平台的 C/C++ 构建工具。

启动后，配置云端服务商凭据或连接正在运行的本地服务，再选择模型开始对话。可用模型取决于所连接的服务。

如果 Electron ABI 已准备好，可使用以下命令启动 Vite 和 Electron，而不重新构建原生 ABI：

```bash
npm run dev
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run electron:dev` | 重建 Electron ABI，并启动完整桌面开发环境 |
| `npm run dev` | 启动 Vite 和 Electron，不重新构建原生 ABI |
| `npm run build` | 类型检查、构建 Renderer/native epoch 产物并调用 electron-builder |
| `npm run test:prepare` | 手动重建 Node native ABI（数据库/native 测试前按需执行） |
| `npm test` | 仅运行单元测试分区，不会自动重建 ABI |
| `npm run test:ui` | 运行 jsdom 界面测试分区 |
| `npm run test:integration` | 运行集成测试分区 |
| `npm run lint` | 运行 ESLint |
| `npm run test:electron-smoke` | 自动重建 Electron ABI、构建并运行 Electron shell smoke |
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

数据库和原生模块相关的 Node 测试需要手动准备 ABI；`npm test` 仅运行单元测试分区，不会隐式切换 ABI。`npm run electron:dev`、`npm run test:electron-smoke` 和 `npm run test:epoch-database:electron` 会自动重建 Electron ABI。其他 Electron 命令请先查看 package script；如果没有自动准备 ABI，则手动重建。

测试分区、专项启动检查、慢测试文件规则与其他验证命令见[测试策略](docs/maintenance/test-strategy.md)和 package.json。

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
- `infra/db/`：SQLite 数据库结构、数据仓库和数据契约。
- `infra/files/`：文件管道、衍生任务、转换与 managed runtime 生命周期。

Provider 请求、凭据解析和 epoch-2 数据库连接由 Electron 主进程拥有。Renderer 只能使用 preload 暴露的窄接口，不能直接读取主进程凭据或打开 SQLite。

## 数据与安全边界

Starverse 默认将应用数据放在 Electron `appData` 根下的 `Starverse` 产品目录：

- `<appData>/Starverse/workspace/epoch-2/starverse.db`：当前对话、消息、分支、项目、模型目录/偏好、路由、Generation V2 数据和搜索索引。
- `<appData>/Starverse/config.json`：应用配置，以及官方 Provider 的受保护凭据记录。
- `<appData>/Starverse/workspace/epoch-2/assets`、`plugins`、`runtimes`：受 epoch-2 布局管理的附件、插件和运行时目录。
- `<appData>/Starverse/workspace/epoch-2/debug/generation-raw.sqlite`：独立的原始请求调试存储（仅在相关调试路径启用时使用）。

OpenAI-compatible 服务商的配置和凭据记录由 `starverse.db` 的专用表管理，与官方服务商的 `config.json` 记录分开。epoch-2 不打开旧的 `chat.db`。交互式启动时，数据库结构不匹配会触发确认提示，然后备份并重建数据库；重建后的活动数据库不保留原数据库内容。

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

LibreOffice 是可选的托管运行时。转换可用性取决于格式、平台、已安装运行时和本地环境；列出这些任务不表示每种转换在所有平台上都可用。

## 构建与打包

```bash
npm run build
```

当前 electron-builder 配置包含 Windows NSIS x64、macOS DMG 和 Linux AppImage 目标。配置了目标不代表已经验证该平台的正式安装包。正式分发前仍需完成：

- 配置平台图标、代码签名和 macOS notarization。
- 在目标操作系统上验证安装、升级、卸载和 native dependency。
- 验证可选 runtime 与文件转换能力的打包行为。

## 文档导航

- [文档状态索引](docs/DOC_STATUS_INDEX.md)
- [开发指南总入口](docs/guides/INDEX.md)
- [当前系统架构](docs/architecture/CURRENT_SYSTEM_ARCHITECTURE.md)
- [Provider 架构](docs/architecture/provider-architecture/README.md)
- [OpenAI-compatible 重建决策与验收](docs/architecture/provider-architecture/openai-chat-compatible/REBUILD_MASTER_PLAN.md)
- [文件管道](docs/file-pipeline/README.md)
- [维护者入口](docs/maintenance/maintainer-entry.md)
- [本地运行时工作目录规范](docs/maintenance/local-runtime-workdirs.md)
- [变更记录](CHANGELOG.md)
- [Agent 与任务入口](docs/AGENT_INDEX.md)

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
