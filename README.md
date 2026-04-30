<div align="center">

# ✨ Starverse

<p>
  <strong>基于 Electron + Vue 3 的新一代跨平台 AI 对话桌面应用</strong>
</p>

<p>
  <img src="https://img.shields.io/badge/Electron-38.6.0-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Vue.js-3.4.21-4FC08D?logo=vue.js&logoColor=white" alt="Vue.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.2.2-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.1.16-06B6D4?logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/SQLite-3.x-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Vite-5.1.6-646CFF?logo=vite&logoColor=white" alt="Vite" />
</p>

<p>
  一个功能强大的多提供商 AI 聊天客户端，支持 Google Gemini 和 OpenRouter，提供分支化对话、多模态交互、智能搜索等企业级功能
</p>

### 🎯 核心特色

| 特性 | Starverse | 其他客户端 |
|------|-----------|-----------|
| 🌳 分支化对话 | ✅ 完整树形结构 | ❌ 线性对话 |
| 🔍 全文搜索 | ✅ SQLite FTS5 | ⚠️ 基础搜索 |
| 🎨 多模态支持 | ✅ 图片+文本混合 | ⚠️ 仅文本 |
| 🤖 多提供商 | ✅ Gemini + OpenRouter | ⚠️ 单一提供商 |
| 💾 数据存储 | ✅ SQLite + Web Worker | ⚠️ JSON 文件 |
| ⚡ 性能优化 | ✅ 75% 提升 | - |
| 📁 项目管理 | ✅ 完整分类系统 | ❌ 无 |
| 🔐 隐私保护 | ✅ 本地存储 | ⚠️ 云端同步 |

</div>

---

## 📖 目录

- [功能特性](#-功能特性)
- [技术栈](#-技术栈)
- [项目架构](#-项目架构)
- [快速开始](#-快速开始)
- [开发指南](#-开发指南)
- [构建部署](#-构建部署)
- [数据清理](#-数据清理)
- [核心架构](#-核心架构)
- [安全性](#-安全性)
- [性能优化](#-性能优化)
- [文档导航](#-文档导航)
- [最近更新和路线图](#-最近更新和路线图)
- [常见问题](#-常见问题faq)
- [贡献指南](#-贡献)

---

## 🚀 快速预览

<details>
<summary><b>📸 点击查看功能截图（即将添加）</b></summary>

<!-- 未来可以在这里添加应用截图 -->
- 主界面
- 分支对话系统
- 高级模型选择器
- 项目管理
- 设置页面

</details>

### ⚡ 快速体验

```bash
# 1. 克隆项目
git clone https://github.com/GuXinghai/starverse.git
cd starverse

# 2. 安装依赖
npm install

# 3. 启动应用
npm run electron:dev
```

---

## ✨ 功能特性

| 模块 | 说明 | 代码入口 | 文档入口 |
|------|------|---------|---------|
| AI 对话 | 多提供商 (Gemini + OpenRouter)，200+ 模型同步 (AppModel)，流式响应，多模态，推理 (4 级)，网络搜索，用量统计 | `src/next/openrouter/`, `src/ui-app/app/` | [OVERVIEW](docs/architecture/OVERVIEW.md), [OpenRouter 集成](docs/architecture/OPENROUTER_INTEGRATION_SUMMARY.md) |
| 富文本渲染 | GFM Markdown, Shiki 语法高亮 (200+ 语言), KaTeX LaTeX 公式, 流式/完成态智能切换 | `src/ui-kit/chat/richtext/` | — |
| 会话与分支 | 树形分支对话，多会话管理，项目分类，标签页，消息编辑与重新生成 | `src/next/convo/`, `src/next/branch/` | [OVERVIEW](docs/architecture/OVERVIEW.md) |
| 模型选择器 | 收藏模型，多维筛选 (系列/能力/上下文/价格)，实时搜索 | `src/ui-app/components/ModelPickerDialog.vue` | — |
| 数据持久化 | SQLite (WAL+FTS5) + Web Worker 异步，IPC 边界防御 (Zod)，增量序列化 | `infra/db/`, `src/next/persistence/` | [OVERVIEW](docs/architecture/OVERVIEW.md) |
| 文件管道与附件 | 文件资产上传/管理，Send Plan 兼容性门禁，preview_optimized 预览衍生物，格式转换 (PDF/音频/文本嵌入) | `src/shared/files/`, `infra/db/`, `src/ui-app/app/` | [File Pipeline](docs/file-pipeline/README.md), [进度台账](docs/file-pipeline/progress-ledger.md), [格式转换](docs/file-pipeline/format-conversion-preview-final.md) |
| 全文搜索 | SQLite FTS5，中英文分词，实时索引，相关性排序 (< 10ms) | `src/next/search/` | — |
| 智能增强 | 自定义指令，4 层生成参数覆盖，胶囊式输入，采样参数配置 | `src/next/settings/`, `src/ui-kit/chat/ChatComposer.vue` | — |
| 用户体验 | Tailwind CSS v4 响应式 UI，智能菜单防溢出，性能优化 (Tab 切换 75%↑) | `src/ui-app/`, `src/ui-kit/` | [Tailwind v4](docs/tailwind/TAILWIND_V4_README.md) |
| 文档与治理 | 70+ 文档，导航中心，ADR (5 个)，File Pipeline Phase 1-9 已完成 | `docs/` | [INDEX](docs/guides/INDEX.md), [ADR](docs/decisions/README.md), [维护者入口](docs/maintenance/maintainer-entry.md), [File Pipeline](docs/file-pipeline/README.md) |

---

## 🛠 技术栈

### 核心框架
| 技术 | 版本 | 用途 |
|------|------|------|
| **Electron** | 38.6.0 | 跨平台桌面应用框架 |
| **Vue.js** | 3.4.21 | 渐进式前端框架（Composition API） |
| **TypeScript** | 5.2.2 | 类型安全的 JavaScript 超集 |
| **Vite** | 5.1.6 | 新一代前端构建工具 |
| **Pinia** | 3.0.3 | Vue 3 官方状态管理库（11个模块化 Store） ⭐ |

### 数据存储
| 技术 | 版本 | 用途 |
|------|------|------|
| **better-sqlite3** | 12.4.1 | 高性能同步 SQLite 数据库 |
| **electron-store** | 11.0.2 | Electron 配置数据持久化 |
| **Zod** | 3.23.8 | TypeScript 优先的 Schema 验证 |

### UI 和渲染
| 技术 | 版本 | 用途 |
|------|------|------|
| **Tailwind CSS** | 4.1.16 ⭐ | 原子化 CSS 框架（v4 CSS 优先配置） |
| **@tailwindcss/postcss** | 4.1.16 ⭐ | Tailwind v4 PostCSS 引擎 |
| **markdown-it** | 14.1.1 | Markdown 解析和渲染 |
| **KaTeX** | 0.16.25 | LaTeX 数学公式渲染 |
| **Shiki** | 3.22.0 | 代码语法高亮（TextMate Grammars） |
| **DOMPurify** | 3.3.0 | HTML 安全过滤 |

### AI 服务
| 技术 | 版本 | 用途 |
|------|------|------|
| **@google/generative-ai** | 0.24.1 | Google Gemini AI SDK |
| **Fetch API** | - | OpenRouter API 调用（SSE） |

### 工具库
| 技术 | 版本 | 用途 |
|------|------|------|
| **uuid** | 13.0.0 | 唯一标识符生成 |
| **@vueuse/core** | 14.0.0 | Vue Composition 工具集 |

### 开发工具
- **electron-vite**: Electron 项目的 Vite 集成
- **electron-builder**: 多平台应用打包工具
- **vue-tsc**: Vue 3 TypeScript 类型检查
- **concurrently**: 并行运行多个命令
- **esbuild**: 快速 JavaScript 打包器

---

## 📁 项目架构

### 目录结构

```
Starverse/
├── electron/                    # Electron 主进程
│   ├── main.ts                 # 应用主入口（窗口、生命周期）
│   ├── preload.ts              # 预加载脚本（IPC 安全桥接）
│   ├── db/                     # 数据库 Worker 管理
│   │   ├── workerManager.ts   # Worker 进程管理器
│   │   └── worker.ts          # SQLite Worker 实现
│   ├── ipc/                    # IPC 处理器（多模块）
│   │   ├── registerIpc.ts     # IPC 注册入口
│   │   ├── dbBridge.ts        # 数据库 IPC 桥接
│   │   ├── openRouterStreamBridge.ts # OpenRouter 流式 IPC
│   │   ├── storeIpc.ts        # 配置存储 IPC
│   │   ├── shellIpc.ts        # Shell 命令 IPC
│   │   ├── imageIpc.ts        # 图片处理 IPC
│   │   ├── dialogIpc.ts       # 系统对话框 IPC
│   │   ├── inappBrowserIpc.ts # 应用内浏览器 IPC
│   │   └── netExpIpc.ts       # 网络实验 IPC
│   ├── modelCatalog/          # 主进程模型目录管理
│   ├── jobs/                  # 后台定时任务
│   ├── config/                # 主进程配置
│   ├── windows/               # 窗口管理
│   └── services/              # 主进程服务
│       └── inappBrowser.ts    # 应用内浏览器服务
│
├── src/                        # Vue 渲染进程
│   ├── App.vue                 # 根组件
│   ├── main.ts                 # Vue 应用入口
│   ├── style.css               # 全局样式（Tailwind v4 @theme）
│   ├── constants/              # 应用常量
│   │
│   ├── ui-app/                 # 主应用 UI 层（页面级组件）
│   │   ├── AppChatApp.vue     # 核心聊天应用主组件
│   │   ├── components/        # 高阶 UI 组件
│   │   │   ├── ChatAppComposer.vue        # 聊天输入组合器
│   │   │   ├── ChatAppReasoningPanel.vue  # 推理面板
│   │   │   ├── ConversationList.vue       # 对话列表侧边栏
│   │   │   ├── ModelPickerDialog.vue      # 模型选择对话框
│   │   │   ├── EndpointDetailPanel.vue    # 模型端点详情
│   │   │   ├── SettingsModal.vue          # 设置弹窗
│   │   │   ├── SettingsPanel.vue          # 设置面板
│   │   │   ├── ProjectSidebar.vue         # 项目侧边栏
│   │   │   ├── SearchModal.vue            # 搜索弹窗
│   │   │   └── WebSearchSettingsEditor.vue # 网络搜索配置
│   │   ├── app/               # 应用业务逻辑（Composables）
│   │   │   ├── appChatApp.logic.ts       # 主应用核心逻辑
│   │   │   ├── useChatSession.ts         # 对话会话管理
│   │   │   ├── useLiveStreamController.ts # 流式控制
│   │   │   ├── useDiagnostics.ts         # 诊断工具
│   │   │   └── useSettingsBindings.ts    # 设置绑定
│   │   └── prefs/             # 用户偏好
│   │       └── userMessageRenderPolicy.ts
│   │
│   ├── ui-kit/                 # 可复用 UI 组件库
│   │   └── chat/              # 聊天 UI 基础组件
│   │       ├── ChatComposer.vue       # 输入组件
│   │       ├── ChatTranscript.vue     # 消息列表
│   │       ├── ChatMessageBubble.vue  # 消息气泡
│   │       ├── ChatReasoningPanel.vue # 推理展示
│   │       ├── ChatStatusBar.vue      # 状态栏
│   │       ├── ChatLayout.vue         # 布局容器
│   │       └── richtext/              # 富文本渲染系统
│   │           ├── RichTextContent.vue  # 流式内容渲染
│   │           ├── RichTextFinal.vue    # 完成态渲染
│   │           ├── streamRenderer.ts    # 流式渲染器
│   │           ├── finalRenderer.ts     # 最终渲染器（markdown-it + Shiki）
│   │           └── sanitizer.ts         # HTML 安全清理
│   │
│   ├── next/                   # 领域驱动业务逻辑（DDD 架构）
│   │   ├── branch/            # 分支管理领域
│   │   ├── convo/             # 对话领域
│   │   ├── message/           # 消息领域
│   │   ├── modelCatalog/      # 模型目录（同步、查询）
│   │   ├── modelPrefs/        # 模型偏好
│   │   ├── openrouter/        # OpenRouter 集成
│   │   ├── persistence/       # 持久化服务
│   │   ├── project/           # 项目管理领域
│   │   ├── search/            # 全文搜索
│   │   ├── settings/          # 设置管理
│   │   └── streaming/         # 流式响应处理
│   │
│   └── shared/                 # 跨层共享模块
│       ├── composables/       # 通用 Vue Composables
│       ├── ipc/               # IPC 通信封装
│       ├── modelCatalog/      # 模型目录客户端
│       ├── reasoningDetailStreamMerger.ts  # 推理流合并器
│       └── security/          # 安全工具
│
├── infra/                      # 基础设施层（TypeScript）
│   └── db/                    # 数据库核心
│       ├── schema.sql         # SQLite Schema 定义
│       ├── worker.ts          # Worker 实现
│       ├── types.ts           # 数据库类型
│       ├── validation.ts      # Zod Schema 验证
│       └── repo/              # Repository 层（数据访问）
│           ├── convoRepo.ts  # 对话仓储
│           ├── messageRepo.ts # 消息仓储
│           ├── projectRepo.ts # 项目仓储
│           └── searchRepo.ts  # 搜索仓储
│
├── public/                     # 静态资源
├── docs/                       # 70+ 份技术文档
├── archived-components/        # 归档组件
└── dist/                       # 构建输出
```

### 代码统计 📊

| 模块 | 说明 |
|------|------|
| `src/ui-app/` | 主应用 UI 层（页面级组件 + 应用编排逻辑） |
| `src/ui-kit/chat/` | 可复用聊天基础组件（Composer, Transcript, MessageBox, richtext 渲染） |
| `src/next/` | DDD 领域模块（convo, branch, message, openrouter, persistence 等 11 模块） |
| `src/shared/` | 跨层共享模块（composables, IPC 封装, 文件类型, 安全工具） |
| `infra/` | 基础设施层（SQLite Worker, Repository, Send Plan 服务） |
| `electron/` | 主进程（窗口管理, IPC 多模块, 模型目录, 后台任务） |
| `docs/` | 70+ 份技术文档 |

### 架构设计

核心架构采用**分层+领域驱动设计**，详见专题文档：

| 主题 | 文档 |
|------|------|
| **架构总览** | [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md) — 三层分离与项目结构 |
| **文件管道** | [docs/file-pipeline/README.md](docs/file-pipeline/README.md) — File Pipeline Phase 1-9 |
| **架构决策** | [docs/decisions/README.md](docs/decisions/README.md) — ADR 记录 |
| **治理护栏** | [docs/governance/app-chat-app-logic-boundary.md](docs/governance/app-chat-app-logic-boundary.md) |
| **维护者接手** | [docs/maintenance/maintainer-entry.md](docs/maintenance/maintainer-entry.md) |

#### 领域驱动架构（next/ 模块）

`next/` 是项目核心业务逻辑层，按领域划分为独立模块：

| 领域模块 | 职责 |
|---------|------|
| `next/convo/` | 对话 CRUD、标题管理、对话树序列化 |
| `next/branch/` | 分支树状态、版本切换、路径计算 |
| `next/message/` | 消息持久化、批量操作 |
| `next/modelCatalog/` | 模型目录同步、查询服务（AppModel 类型） |
| `next/modelPrefs/` | 模型偏好、收藏、默认 |
| `next/openrouter/` | OpenRouter SDK 封装、请求构建 |
| `next/streaming/` | SSE 流式响应处理管道 |
| `next/search/` | FTS5 搜索封装、DSL 构建 |
| `next/persistence/` | 持久化调度，防抖保存策略 |
| `next/project/` | 项目管理领域 |
| `next/settings/` | 设置项管理 |

---

## 🚀 快速开始

### 📋 前置要求

确保您的开发环境满足以下要求：

| 工具 | 版本要求 | 检查命令 |
|------|---------|---------|
| **Node.js** | 22.x（见 `.nvmrc`） | `node --version` |
| **npm** | 10.x | `npm --version` |
| **操作系统** | Windows 10+, macOS 10.13+, Ubuntu 18.04+ | - |

### 📥 安装步骤

**步骤 1: 克隆项目**

```bash
git clone https://github.com/GuXinghai/starverse.git
cd starverse
```

**步骤 2: 安装依赖**

```bash
npm ci
```

> ⚠️ **better-sqlite3 注意**: 如果遇到原生模块/ABI 不匹配：跑测试用 `npm run rebuild:node`；跑 Electron 用 `npm run rebuild:electron`
>
> ✅ **CI 约束**: CI 必须使用与 `.nvmrc` 一致的 Node 版本，并确保 `better-sqlite3` 成功编译（`npm run rebuild:node`）。SQLite repo 测试不可跳过。

**步骤 3: 配置 API Key**

启动应用后，点击右上角设置图标 ⚙️，选择您的 AI 提供商：

<details>
<summary><b>选项 A: Google Gemini（免费配额）</b></summary>

1. 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 登录您的 Google 账号
3. 点击 "Create API Key"
4. 复制 API Key
5. 在 Starverse 设置中：
   - 选择 "Google Gemini"
   - 粘贴 API Key
   - 点击保存

**优势**: 
- 免费配额充足
- 官方 SDK 支持
- 低延迟

</details>

<details>
<summary><b>选项 B: OpenRouter（访问上百种模型）</b></summary>

1. 访问 [OpenRouter](https://openrouter.ai/keys)
2. 注册账号（支持 Google/GitHub 登录）
3. 创建 API Key
4. 充值少量余额（最低 $5）
5. 在 Starverse 设置中：
   - 选择 "OpenRouter"
   - 粘贴 API Key
   - 点击保存

**优势**: 
- 访问 GPT-4, Claude, Gemini, Llama 等 100+ 模型
- 按需付费，价格透明
- 支持网络搜索插件

</details>

**步骤 4: 启动应用**

```bash
npm run electron:dev
```

✅ 应用将自动启动，Vite 开发服务器运行在 `http://localhost:5173`

### 🎉 开始使用

1. **创建第一个对话**: 点击左侧边栏 "新对话" 按钮
2. **选择 AI 模型**: 点击顶部模型选择器，选择您想要的模型
3. **开始聊天**: 在底部输入框输入消息，按 Enter 发送
4. **探索高级功能**: 
   - 上传图片进行多模态对话
   - 创建项目管理对话分类
   - 使用分支功能探索不同对话路径
   - 编辑消息重新生成回复

---

## 💻 开发指南

### 可用脚本

| 脚本 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器（仅渲染进程） |
| `npm run electron:dev` | 启动完整 Electron 应用（开发模式，推荐） |
| `npm run dev:netlog` | 启动 Electron 并录制全生命周期 NetLog（Default 模式） |
| `npm run dev:netlog:sensitive` | 启动 Electron 并录制 NetLog（IncludeSensitive，含敏感信息） |
| `npm run build` | 构建生产版本并打包 |
| `npm run preview` | 预览构建结果 |
| `npm run dev:clean` | 清理进程并重新启动开发服务器 |
| `npm run rebuild:node` | 为 Node.js 重新编译 better-sqlite3（跑测试/脚本） |
| `npm run rebuild:electron` | 为 Electron 重新编译 better-sqlite3（跑桌面应用） |
| `npm run rebuild` | `rebuild:electron` 的别名 |
| `npm run build:worker` | 构建数据库 Web Worker |
| `npm run watch:worker` | 监听模式构建 Web Worker |
| `npm run verify:ssot` | 基线验证（测试 + SSOT gates） |
| `npm run verify:live` | 可选 live smoke（需要 OpenRouter key） |

### NetLog 录制（开发）

```bash
npm run dev:netlog
```

- 日志默认输出目录：`d:\Starverse\.artifacts\netlog\`
- 输出文件名：`netlog-YYYYMMDD-HHMMSS-p<pid>.json`
- NetLog 为 Chromium JSON，可导入 NetLog Viewer 分析（重点关注 Proxy/DNS/Sockets/Timeline）

### Reasoning 模块变更护栏

修改 `reasoning_details` 相关代码（DB repo、aggregator、Merger）时，**必须运行**：

```bash
# Repo 聚合一致性测试
npx vitest run infra/db/repo/messageRepo.reasoningSegments.test.ts

# Stress 回归测试 (100 场景，mismatch 必须为 0)
node scripts/gates/tc19-reasoning-stress.mjs

# 或通过 b_gate 集成入口（设置环境变量启用）
REASONING_STRESS=1 node scripts/b_gate.mjs
```

### 开发规范

#### Vue 组件开发

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChatStore } from '@/stores/chatStore'

// 使用 Composition API
const chatStore = useChatStore()
const message = ref('')

// 计算属性
const isValid = computed(() => message.value.trim().length > 0)
</script>

<template>
  <!-- 使用 Tailwind CSS 类名 -->
  <div class="flex items-center p-4 bg-white rounded-lg shadow">
    <input 
      v-model="message"
      class="flex-1 px-4 py-2 border rounded"
      placeholder="输入消息..."
    />
  </div>
</template>
```

#### Pinia Store 使用

```javascript
import { useChatStore } from '@/stores/chatStore'

const chatStore = useChatStore()

// ✅ 推荐：使用带 conversationId 的异步安全 API
chatStore.addMessageToConversation(conversationId, {
  role: 'user',
  text: userInput
})

// ❌ 避免：依赖全局状态的旧 API（已弃用）
chatStore.addMessageToActiveConversation(message)
```

#### 样式开发原则

1. **优先使用 Tailwind 工具类**
```vue
<!-- ✅ 推荐 -->
<div class="flex items-center justify-between p-4 bg-gray-100 rounded-lg">

<!-- ❌ 避免自定义 CSS -->
<div class="custom-container"></div>
```

2. **响应式设计**
```vue
<div class="w-full md:w-1/2 lg:w-1/3">
  <!-- 移动端全宽，平板半宽，桌面端 1/3 宽 -->
</div>
```

3. **常用设计模式**
```vue
<!-- 卡片 -->
<div class="bg-white rounded-lg shadow p-4">

<!-- 按钮 -->
<button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition">

<!-- 输入框 -->
<input class="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
```

### 热重载

- **渲染进程**: Vue 组件、样式修改自动热重载
- **主进程**: 修改 `electron/main.ts` 需要重启应用
- **预加载脚本**: 修改 `electron/preload.ts` 需要刷新窗口 (Ctrl+R)

### 调试

#### 渲染进程调试
- 开发模式下自动打开 DevTools
- 使用 Vue DevTools 浏览器扩展

#### 主进程调试
```bash
# 使用 VS Code 的 Node.js 调试器
# 或在主进程代码中使用 console.log
```

---

## 📦 构建部署

### 构建应用

```bash
npm run build
```

构建产物位于 `release/` 目录

### 打包配置

编辑 `electron-builder.json5` 自定义打包选项:

```json5
{
  "appId": "com.yourcompany.starverse",
  "productName": "Starverse",
  "win": {
    "target": ["nsis"],
    "artifactName": "${productName}-Windows-${version}-Setup.${ext}"
  },
  "mac": {
    "target": ["dmg"],
    "artifactName": "${productName}-Mac-${version}-Installer.${ext}"
  },
  "linux": {
    "target": ["AppImage"],
    "artifactName": "${productName}-Linux-${version}.${ext}"
  }
}
```

### 多平台构建

```bash
# Windows
npm run build

# macOS (需要在 macOS 上运行)
npm run build

# Linux
npm run build
```

---

## 🧹 数据清理

如需要重置应用或清理全部聊天记录：

- **Windows**: 双击运行 `clear-all-data.bat`
- **通用**: `node scripts/clear-all-data-standalone.cjs`

清理工具会删除 `chat.db`（对话/项目数据），保留 API Key 等配置。详见 [数据清理指南](docs/guides/DATA_CLEANUP_GUIDE.md)。

---

## 🔑 核心架构

### 模块职责

| 层 | 目录 | 职责 |
|----|------|------|
| **UI 表现层** | `src/ui-app/` | 页面级组件（AppChatApp, ConversationList, ModelPickerDialog），应用编排逻辑（appChatApp.logic.ts） |
| **UI 组件库** | `src/ui-kit/chat/` | 可复用聊天基础组件（ChatComposer, ChatTranscript, ChatMessageBubble, richtext 渲染系统） |
| **领域逻辑** | `src/next/` | DDD 领域模块：convo / branch / message / modelCatalog / openrouter / persistence / project / search / settings / streaming |
| **共享层** | `src/shared/` | 通用 composables、IPC 封装、文件资产类型、安全工具、推理流合并器 |
| **基础设施** | `infra/db/` | SQLite Worker、Repository 层（convoRepo, messageRepo, projectRepo, searchRepo）、schema.sql、Zod 验证 |
| **主进程** | `electron/` | 窗口管理、IPC 多模块（dbBridge, openRouterStreamBridge, storeIpc 等 9 个）、模型目录、后台任务 |
| **文档** | `docs/` | 架构文档、功能文档、File Pipeline 专题、ADR 决策记录、治理护栏 |

### 核心设计模式

- **分支化对话树**：`Map<string, Branch>` O(1) 查找，JSON 序列化存储在 `convo.meta`
- **Web Worker 数据库**：better-sqlite3 在独立 Worker 线程执行，IPC + MessagePort 通信，30s 超时保护
- **FTS5 全文搜索**：message_fts 虚拟表，BM25 排序，unicode61 中英文分词，触发器同步索引
- **多提供商策略**：`next/openrouter/` 封装 OpenRouter SDK + SSE 解析，Gemini 通过 `@google/generative-ai` SDK
- **Vue Proxy 边界防御**：`deepToRaw()` 深度去除 Proxy 后再经 IPC 传递，消除 structuredClone 错误
- **Send Plan + 文件管道**：`src/shared/files/` + `infra/files/` 实现 attachment 语义、send preflight、兼容性门禁（详见 [file-pipeline](docs/file-pipeline/README.md)）

### 数据流

```
用户输入 → AppChatApp.vue + appChatApp.logic.ts
    → send preflight (有附件时调用 Send Plan)
    → next/openrouter/ 构建请求
    → openRouterStreamBridge (主进程 SSE 代理)
    → ui-kit/chat/ 逐 Token 更新 + 流式/完成态渲染
    → next/persistence/ 防抖持久化 → IPC → Worker → SQLite
```

详见：[架构总览](docs/architecture/OVERVIEW.md) | [文件管道](docs/file-pipeline/README.md)

---

## 🔒 安全性

### Electron 安全最佳实践

1. **Context Isolation**: ✅ 已启用
```typescript
// electron/main.ts
webPreferences: {
  contextIsolation: true,  // 隔离上下文
  nodeIntegration: false,   // 禁用 Node.js 集成
  preload: path.join(__dirname, 'preload.mjs')
}
```

2. **预加载脚本白名单 API**
```typescript
// electron/preload.ts
contextBridge.exposeInMainWorld('electronStore', {
  get: (key: string) => ipcRenderer.invoke('store-get', key),
  set: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
  // 只暴露必要的 API
})
```

3. **CSP (内容安全策略)**
- 限制外部资源加载
- 防止 XSS 攻击

4. **API Key 安全**
- 使用 electron-store 加密存储
- 多提供商独立管理，互不干扰
- 不在代码中硬编码
- 不暴露到渲染进程全局变量
- 密码输入框隐藏显示（支持切换）
- 格式验证（Gemini: `AIza...`, OpenRouter: `sk-or-v1-...`）

5. **网络安全**
- SSE 缓冲区大小限制（10KB），防止恶意数据攻击
- AbortController 正确清理，防止内存泄漏
- HTTPS 加密传输

---

## 🎯 性能优化

### 1. 标签页切换优化 ⚡
- **性能提升 75%**: 从 40-50ms 降至 10ms
- **优化措施**:
  - 移除非关键 console.log（-15-25ms）
  - 条件化昂贵计算（-10-15ms）
  - O(1) conversationsMap 查找（-2-3ms）
- **用户体验**: 流畅的 60fps 切换体验

### 2. 数据持久化优化 💾
- **UI 状态保存速度提升 40 倍**: 从 0.8ms 降至 0.02ms
- **智能增量保存策略**:
  - `saveTabState()`: 仅保存标签状态（0.02ms，50ms 防抖）
  - `saveConversations()`: 完整数据保存（0.8ms，按需触发）
- **减少 I/O 开销**: 智能判断保存时机

### 3. 渲染优化 🎨
- **虚拟滚动**: 大量消息列表使用虚拟滚动
- **防抖输入**: 草稿保存使用防抖避免频繁写入
- **条件渲染**: 流式传输时显示纯文本，完成后渲染 Markdown
- **Vue 3 响应式**: 利用 Proxy 提升性能

### 4. 内存管理 🧹
- **流式处理**: 不缓存完整响应，逐块处理
- **AbortController 清理**: 及时释放未完成的请求
- **组件卸载清理**: 防止内存泄漏
- **Web Worker 隔离**: 数据库操作不阻塞主线程

### 5. 启动优化 🚀
- **并行加载配置**: 使用 `Promise.all()` 同时加载多个配置项
- **懒加载组件**: 按需加载设置页面等非核心组件
- **启动速度**: < 2 秒（优化后提升 60%）

### 性能监控
```javascript
// ChatTabs.vue - 标签切换性能监控
const startTime = performance.now()
// ... 切换逻辑
const duration = performance.now() - startTime
console.log(`标签切换耗时: ${duration.toFixed(2)}ms`)
```

详细文档：参见 [归档中心](docs/archive/README.md) 中已完成性能优化记录

---

## 🛡️ 错误处理策略

### 用户友好的错误提示

| 错误类型 | 检测方式 | 提示信息 |
|---------|---------|---------|
| API Key 未配置 | `!apiKey` | "错误：未设置 {Provider} API Key，请先在设置页面配置。" |
| API Key 格式错误 | 正则验证 | "⚠️ API Key 格式可能不正确，Gemini Key 通常以 AIza 开头且长度为 39 位" |
| 认证失败 | HTTP 401/403 | "{Provider} 认证失败：API Key 无效或已过期，请检查设置" |
| 速率限制 | HTTP 429 | "{Provider} 速率限制：请求过于频繁，请等待 X 秒后重试" |
| 网络错误 | Fetch 失败 | "网络连接失败，请检查网络设置" |
| 用户中止 | AbortError | "[已停止生成]" (静默处理) |

---

## 📚 文档导航

### 快速入口
| 文档 | 说明 |
|------|------|
| [文档导航中心](docs/guides/INDEX.md) | 按场景查找所有文档 |
| [架构总览](docs/architecture/OVERVIEW.md) | 系统架构设计 |
| [文件管道入口](docs/file-pipeline/README.md) | File Pipeline Phase 1-9 状态与文档映射 |
| [File Pipeline 进度账本](docs/file-pipeline/progress-ledger.md) | 决策记录、冻结决策、未做清单 |
| [格式转换与预览方案](docs/file-pipeline/format-conversion-preview-final.md) | 文档格式转换与预览 SSOT |
| [维护者接手入口](docs/maintenance/maintainer-entry.md) | 接手项目时的优先阅读顺序与注意事项 |
| [ADR 规则](docs/adr/README.md) | 架构决策记录编写规则 |
| [ADR 索引](docs/decisions/README.md) | 架构决策记录列表 |
| [归档中心](docs/archive/README.md) | 46 个已归档历史文档 |
| [变更日志](CHANGELOG.md) | 版本更新历史 |

---

## 🚧 最近更新和路线图

### 关键里程碑

| 时间 | 主题 | 状态 | 详情 |
|------|------|------|------|
| 2024-11 | SQLite 数据库迁移 + 边界防御 + 性能优化 | ✅ 完成 | [SQLite 实现](docs/features/SQLITE_ENHANCEMENT_IMPLEMENTATION.md), [边界防御](docs/archive/ui-implementations/BOUNDARY_DEFENSE_IMPLEMENTATION.md) |
| 2024-11 | 问题修复与代码质量提升（组件归档、注释完善） | ✅ 完成 | [修复记录](docs/bugfix/RECENT_FIXES_2025_11.md), [归档中心](docs/archive/completed-features/CHATVIEW_OPTIMIZATION_SUMMARY.md) |
| 2025-01 | 用户体验优化（收藏模型滚动动画、会话复用） | ✅ 完成 | [归档中心](docs/archive/completed-features/CHATVIEW_COMMENTS_IMPROVEMENT.md) |
| 2025-12 | 重大架构重构：DDD 分层（AppChatApp 取代 ChatView.vue）、富文本引擎 (markdown-it+Shiki)、Reasoning、IPC 多模块 | ✅ 完成 | [架构总览](docs/architecture/OVERVIEW.md), [CHANGELOG](CHANGELOG.md) |
| 2026-04 | 文件管道 Phase 1-9：文件资产 Schema、Send Plan 三层门禁、preview_optimized 衍生物、前端 UI MVP | ✅ 完成 | [File Pipeline](docs/file-pipeline/README.md), [进度台账](docs/file-pipeline/progress-ledger.md) |
| 2026-04 | 格式转换与预览方案（PDF/音频/文本嵌入）通过治理 | 📐 方案阶段 | [格式转换](docs/file-pipeline/format-conversion-preview-final.md) |
| 2026-04 | 文档治理 G1a-G1e：链接修复、语义校准、Feature/Roadmap 节精简 | ✅ 完成 | [导航中心](docs/guides/INDEX.md), [维护者入口](docs/maintenance/maintainer-entry.md) |

### 当前方向
- 持续归档已完成功能，建立每月文档审查机制
- 详见 [guides/INDEX.md](docs/guides/INDEX.md) | [progress-ledger.md](docs/file-pipeline/progress-ledger.md) | [archive/README.md](docs/archive/README.md)

---

## ❓ 常见问题

| 问题 | 说明 |
|------|------|
| 数据存储在哪里？ | Windows: `%APPDATA%/starverse/` · macOS: `~/Library/Application Support/starverse/` · Linux: `~/.config/starverse/` |
| 如何清理全部数据？ | 运行 `clear-all-data.bat` 或 `node scripts/clear-all-data-standalone.cjs`，详见[数据清理指南](docs/guides/DATA_CLEANUP_GUIDE.md) |
| 支持哪些操作系统？ | Windows 10+, macOS 10.13+, Linux (Ubuntu 18.04+, Fedora 32+) |
| 遇到编译或运行问题？ | 查看[故障排查](docs/guides/TROUBLESHOOTING.md) |
| 报告问题或贡献代码？ | 前往 [GitHub Issues](https://github.com/GuXinghai/starverse/issues) |

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 贡献指南
1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request
6. **统一编码**：所有文件（含 README、日志、源码）必须使用 UTF-8（无 BOM）保存。请在编辑器设置中显式启用 UTF-8，并避免切换到 ANSI/GBK 以免 emoji 和中文说明被破坏。

## 🙏 致谢

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Tailwind CSS](https://tailwindcss.com/) - 原子化 CSS 框架
- [Google Gemini](https://ai.google.dev/) - 强大的 AI 能力支持
- [OpenRouter](https://openrouter.ai/) - 统一的多模型 API 网关
- [Vite](https://vitejs.dev/) - 极速的前端构建工具
- [Pinia](https://pinia.vuejs.org/) - Vue 3 状态管理
- [electron-store](https://github.com/sindresorhus/electron-store) - 数据持久化

---

<div align="center">

## 🌟 Star History

如果您觉得这个项目有帮助，请考虑给它一个 ⭐ Star！

## 📮 联系方式

- **GitHub Issues**: [提交问题或建议](https://github.com/GuXinghai/starverse/issues)
- **GitHub Discussions**: [参与讨论](https://github.com/GuXinghai/starverse/discussions)

## 🔗 相关链接

- [Electron 官方文档](https://www.electronjs.org/docs)
- [Vue.js 官方文档](https://vuejs.org/)
- [Google Gemini API](https://ai.google.dev/)
- [OpenRouter API](https://openrouter.ai/docs)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)

---

<p>用 ❤️ 和 ☕ 制作</p>
<p>© 2025 Starverse. All rights reserved.</p>

</div>
