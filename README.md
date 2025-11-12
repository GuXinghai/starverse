<div align="center">

# ✨ Starverse

<p>
  <strong>基于 Electron + Vue 3 的跨平台 AI 对话桌面应用</strong>
</p>

<p>
  <img src="https://img.shields.io/badge/Electron-38.6.0-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Vue.js-3.4.21-4FC08D?logo=vue.js&logoColor=white" alt="Vue.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.2.2-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.1.16-06B6D4?logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vite-5.1.6-646CFF?logo=vite&logoColor=white" alt="Vite" />
</p>

<p>
  一个优雅的多提供商 AI 聊天客户端，支持 Google Gemini 和 OpenRouter，提供多会话管理、标签页切换、流式响应等功能
</p>

</div>

---

## 📖 目录

- [功能特性](#-功能特性)
- [技术栈](#-技术栈)
- [项目架构](#-项目架构)
- [快速开始](#-快速开始)
- [开发指南](#-开发指南)
- [构建部署](#-构建部署)
- [核心功能说明](#-核心功能说明)
- [安全性](#-安全性)
- [许可证](#-许可证)

---

## ✨ 功能特性

### 🤖 AI 对话能力
- **多提供商支持**: 支持 Google Gemini 和 OpenRouter 双提供商，可自由切换
- **多模型支持**: 
  - Gemini: gemini-pro, gemini-1.5-flash, gemini-2.0-flash-exp 等
  - OpenRouter: 支持 GPT-4, Claude, Gemini, Llama 等上百种模型
- **多模态支持**: 
  - 上传图片到 AI 模型进行分析（GPT-4o、Gemini 1.5+、Claude 3）
  - 接收 AI 生成的图片
  - 支持消息编辑时添加/移除图片
  - 图片点击使用系统默认应用打开
  - 统一处理多种格式（URL、base64、data URI、inline_data）
- **网络搜索集成**:
  - OpenRouter Web 搜索插件支持
  - 三档搜索深度：快速、普通、深入
  - 灵活引擎配置：native、exa 或自动选择
  - 每条消息可独立启用/禁用
- **流式响应**: 实时流式输出 AI 回复
- **上下文管理**: 完整的对话历史管理
- **用量可视化**:
  - 实时解析 OpenRouter usage chunk
  - 显示 Token 统计和 Credits 费用
  - 数据持久化到分支元数据

### 📝 富文本渲染
- **Markdown 支持**: GitHub Flavored Markdown (GFM)
  - 标题、列表、表格、引用、链接、图片
  - 加粗、斜体、删除线
- **代码高亮**: highlight.js 语法高亮
  - 支持 200+ 编程语言
  - GitHub 浅色主题
- **LaTeX 数学公式**: KaTeX 公式渲染
  - 行内公式：`$E = mc^2$`
  - 块级公式：`$$\int_0^1 x^2 dx$$`
- **智能渲染**: 
  - 流式传输时显示纯文本
  - 完成后渲染 Markdown
  - 无语言代码块作为 Markdown 渲染

### 💬 会话管理
- **多会话**: 创建和管理无限数量的对话
- **智能复用**: 创建新会话时智能复用空白聊天
  - 只复用默认名称（"新对话"）的空白会话
  - 保护已重命名但未开始的会话
- **项目管理**:
  - 创建项目对对话进行分类管理
  - 项目重命名和删除
  - 对话快速分配到项目
  - 项目筛选视图（全部/未分配/指定项目）
  - 右键菜单快速移动对话
- **标签页模式**: 类似浏览器的多标签界面
- **会话持久化**: electron-store 自动保存
- **会话操作**: 重命名、删除、清空消息

### 🌳 分支化对话系统
- **树形对话历史**: 任意消息处创建新分支
- **多版本回复**: 同一位置的多个 AI 回复可自由切换
- **路径导航**: 清晰展示当前路径和分支结构
- **分支管理**: 删除单个版本或整个分支树
- **多模态分支**: 完全支持文本和图像混合消息

### 🎯 高级模型选择器
- **收藏模型**: 快速访问常用 AI 模型
  - 智能滚动动画：模型名称过长时自动滚动
  - 四阶段动画：停顿 → 阅读 → 压缩 → 循环
  - 自适应窗口大小变化
- **智能筛选**: 
  - 模型系列筛选（GPT、Claude、Gemini、Llama）
  - 多模态能力筛选（文本、图像、音频）
  - 上下文长度筛选（自适应分位数滑块）
  - 价格区间筛选
- **实时搜索**: 模糊搜索模型名称、ID 和描述
- **多维排序**: 按名称、上下文长度或价格排序
- **详细信息**: 显示模型描述、定价、上下文长度等

### ✏️ 消息编辑
- **编辑用户消息**: 双击或点击编辑按钮修改已发送消息
- **重新生成**: 编辑后自动触发 AI 重新生成回复
- **图片管理**: 编辑时可添加或移除图片附件
- **历史保留**: 编辑操作创建新分支，保留原有路径
- **智能去重**: 编辑未改动内容时不生成冗余版本
- **边界处理**: 无回复的提问也可触发首次生成

### 💾 数据持久化
- **SQLite 存储**:
  - 项目管理独立存储（完整 CRUD 操作）
  - 对话归档功能（archive/restore）
  - FTS5 全文搜索支持（中英文分词）
  - 外键约束确保数据一致性
- **边界防御机制**:
  - IPC 边界统一去代理化
  - 消除 Vue Proxy structuredClone 错误
  - Web Worker 异步数据库操作
  - 增量序列化优化大型对话保存

### � 智能对话增强 ⭐ 新增
- **自定义指令**: 为每个对话设置专属的系统提示词
  - 持久化保存，无需每次输入
  - 不占用消息历史，不影响上下文长度
  - 支持角色扮演、格式控制、专业领域限定等场景
  - 兼容 Gemini 和 OpenRouter
- **采样参数配置**: 精细控制 AI 生成行为
  - 温度（Temperature）：0-2，控制随机性
  - Top-P/Top-K：核采样和词汇截断
  - 频率/存在惩罚：减少重复，鼓励新话题
  - 最大输出长度：限制回复长度
  - 随机种子：实现可重现输出
  - 每个对话独立配置，持久化保存

### �🎨 用户体验
- **现代化 UI**: 基于 Tailwind CSS 的精美界面设计
- **响应式布局**: 自适应不同窗口大小
- **🎯 智能菜单定位** ⭐ 最新:
  - ✅ 主菜单和子菜单独立 Teleport 到 body
  - ✅ 智能防溢出算法（优先级: 右→下/上→左）
  - ✅ 响应窗口大小、滚动、DPI 变化
  - ✅ 防止被容器的 overflow 裁剪
  - ✅ 正确的 z-index 层级管理
- **⚡ 性能优化** ⭐ 最新:
  - ✅ 标签页切换性能提升 75%（40-50ms → 10ms）
  - ✅ 持久化优化：UI 状态保存速度提升 40 倍（0.8ms → 0.02ms）
  - ✅ 智能增量保存策略（标签状态 vs 完整数据）
  - ✅ O(1) 对话查找性能（conversationsMap）
  - ✅ 条件化昂贵计算（减少多实例重复计算）
- **加载动画**: 优雅的应用初始化和消息加载动画
- **草稿保存**: 自动保存输入框的草稿内容
- **鼠标悬停预览**: 消息悬停显示编辑和分支控制按钮
- **滚动优化**: 支持拖动滚动条时暂停自动滚动

### ⚙️ 配置管理
- **多提供商配置**: 可视化选择 Gemini 或 OpenRouter
- **API Key 管理**: 安全存储和配置多个 API Key
- **模型切换**: 每个会话可独立选择 AI 模型
- **设置界面**: 友好的设置面板，集中管理所有配置

### 🔧 开发者体验
- **完善的代码注释**:
  - ChatView.vue: 800+ 行详细注释（26% 覆盖率）
  - 架构说明、算法解释、性能考量文档化
  - 所有组件通过注释质量审查
- **代码质量保障**:
  - TypeScript 严格模式，零编译错误
  - 移除非关键调试日志，保留错误追踪
  - 模块化架构，职责清晰
  - 边界防御实施（IPC 层）

### 🔧 技术特性
- **持久化架构**:
  - SQLite 数据库（对话、消息、项目）
  - better-sqlite3 + Web Worker（异步操作）
  - FTS5 全文搜索（中英文分词）
  - 增量序列化优化
- **安全性保障**:
  - Electron 上下文隔离
  - 预加载脚本安全桥接
  - API Key 加密存储
  - structuredClone 边界防御

---

## 🛠 技术栈

### 核心框架
| 技术 | 版本 | 用途 |
|------|------|------|
| **Electron** | 38.6.0 | 跨平台桌面应用框架 |
| **Vue.js** | 3.4.21 | 渐进式前端框架（Composition API） |
| **TypeScript** | 5.2.2 | 类型安全的 JavaScript 超集 |
| **Vite** | 5.1.6 | 新一代前端构建工具 |

### 工具库
| 技术 | 版本 | 用途 |
|------|------|------|
| **Tailwind CSS** | 4.1.16 | 原子化 CSS 框架 |
| **Pinia** | 3.0.3 | Vue 3 官方状态管理库 |
| **electron-store** | 11.0.2 | Electron 数据持久化（兼容模式） |
| **better-sqlite3** | 12.4.1 | 高性能 SQLite 数据库 ⭐ |
| **@google/generative-ai** | 0.24.1 | Google Gemini AI SDK |
| **marked** | 16.4.1 | Markdown 解析和渲染 |
| **KaTeX** | 0.16.25 | LaTeX 数学公式渲染 |
| **highlight.js** | 11.11.1 | 代码语法高亮 |
| **uuid** | 13.0.0 | 唯一标识符生成 |
| **DOMPurify** | 3.3.0 | HTML 安全过滤 |
| **Zod** | 3.23.8 | TypeScript 优先的 Schema 验证 |

### 开发工具
- **electron-vite**: Electron 项目的 Vite 集成
- **electron-builder**: 多平台应用打包工具
- **vue-tsc**: Vue 3 TypeScript 类型检查
- **concurrently**: 并行运行多个命令

---

## 📁 项目架构

### 目录结构

```
Starverse/
├── electron/                    # Electron 主进程
│   ├── main.ts                 # 主进程入口（窗口管理、IPC 通信）
│   ├── preload.ts              # 预加载脚本（安全桥接）
│   ├── electron-env.d.ts       # Electron 类型定义
│   ├── db/                     # SQLite 数据库 ⭐ 新增
│   │   ├── worker.ts          # 数据库 Web Worker（异步操作）
│   │   ├── types.ts           # 数据库类型定义
│   │   ├── validation.ts      # 数据验证 Schema
│   │   ├── repos/             # 数据访问层
│   │   │   ├── ConvoRepo.ts  # 对话仓储
│   │   │   └── ProjectRepo.ts # 项目仓储
│   │   └── migrations/        # 数据库迁移
│   └── ipc/                    # IPC 处理器 ⭐ 新增
│       └── dbHandlers.ts      # 数据库 IPC 处理
│
├── src/                        # Vue 渲染进程
│   ├── components/             # Vue 组件
│   │   ├── ChatTabs.vue        # 标签页组件
│   │   ├── ChatView.vue        # 单个聊天视图
│   │   ├── TabbedChatView.vue  # 多标签聊天容器
│   │   ├── ConversationList.vue # 对话列表侧边栏
│   │   ├── ModelSelector.vue   # 模型选择器
│   │   ├── FavoriteModelSelector.vue ⭐ # 收藏模型快速选择
│   │   ├── QuickModelSearch.vue # 快速模型搜索
│   │   ├── AdvancedModelPickerModal.vue ⭐ # 高级模型选择器
│   │   ├── MessageBranchController.vue ⭐ # 消息分支控制器
│   │   ├── ContentRenderer.vue  # Markdown/代码渲染器
│   │   ├── AttachmentPreview.vue # 图片附件预览
│   │   ├── DeleteConfirmDialog.vue # 删除确认对话框
│   │   └── SettingsView.vue    # 设置页面
│   │
│   ├── stores/                 # Pinia 状态管理
│   │   ├── index.ts            # appStore（全局状态）
│   │   ├── chatStore.js        # chatStore（对话管理）
│   │   ├── branchTreeHelpers.ts ⭐ # 分支树辅助函数
│   │   ├── CHAT_STORE_GUIDE.md # Store API 使用指南
│   │   └── README.md           # 状态管理文档
│   │
│   ├── services/               # 业务逻辑服务
│   │   ├── aiChatService.js    # AI 服务路由器（多提供商支持）
│   │   ├── geminiService.js    # Gemini API 封装（向后兼容）
│   │   ├── chatPersistence.ts  # 对话持久化服务 ⭐
│   │   ├── projectPersistence.ts # 项目持久化服务 ⭐
│   │   ├── searchService.ts    # 搜索服务（FTS5）⭐
│   │   ├── db/                 # 数据库服务 ⭐ 新增
│   │   │   └── index.ts       # 数据库 IPC 封装
│   │   └── providers/          # AI 提供商实现
│   │       ├── GeminiService.js     # Gemini 服务
│   │       └── OpenRouterService.js # OpenRouter 服务
│   │
│   ├── types/                  # TypeScript 类型定义
│   │   ├── electron.d.ts       # Window 接口扩展
│   │   └── chat.ts             # 聊天类型定义 ⭐
│   │
│   ├── utils/                  # 工具函数 ⭐ 新增
│   │   ├── electronBridge.ts  # Electron API 桥接
│   │   └── ipcSanitizer.js    # IPC 数据清理
│   │
│   ├── App.vue                 # 根组件
│   ├── main.ts                 # Vue 应用入口
│   └── style.css               # 全局样式
│
├── public/                     # 静态资源
│   └── serializeWorker.js     # 序列化 Web Worker ⭐
│
├── infra/                      # 基础设施 ⭐ 新增
│   └── db/                    # 数据库模块（TypeScript）
│       ├── repos/            # 数据仓储层
│       ├── types.ts          # 类型定义
│       └── validation.ts     # 数据验证
├── docs/                       # 项目文档
│   ├── CHAT_STORE_API.md       # ChatStore API 文档
│   ├── CHATVIEW_UPDATE_SUMMARY.md
│   ├── CHATVIEW_OPTIMIZATION_SUMMARY.md ⭐ # ChatView 优化总结
│   ├── PERFORMANCE_OPTIMIZATION_COMPLETE.md ⭐ # 性能优化文档
│   ├── ARCHIVED_COMPONENTS.md ⭐ # 组件归档说明
│   ├── CLEANUP_SUMMARY.md ⭐ # 代码清理总结（最新）
│   ├── CODE_CLEANUP_REPORT.md ⭐ # Proxy 处理清理报告
│   ├── BOUNDARY_DEFENSE_IMPLEMENTATION.md ⭐ # 边界防御实施
│   ├── SQLITE_ENHANCEMENT_IMPLEMENTATION.md ⭐ # SQLite 增强
│   ├── RECENT_FIXES_2025_11.md ⭐ # 11月问题修复汇总
│   ├── DEBUG_MODEL_LIST.md
│   ├── FOCUS_ISSUE_REPORT.md
│   └── OPENROUTER_INTEGRATION_SUMMARY.md  # OpenRouter 接入重构总结
│
├── archived-components/        # 归档的组件 ⭐ 新增
│   ├── README.md              # 归档说明
│   ├── HelloWorld.vue         # Vite 模板示例
│   ├── ModelSelector.vue      # 旧版模型选择器
│   └── StartupSplash.vue      # 未实现的启动画面
│
├── dist-electron/              # Electron 构建输出
├── release/                    # 应用打包输出
│
├── electron-builder.json5      # Electron Builder 配置
├── electron.vite.config.ts     # Electron Vite 配置
├── vite.config.ts              # Vite 配置
├── tailwind.config.js          # Tailwind CSS 配置
├── tsconfig.json               # TypeScript 配置
└── package.json                # 项目依赖和脚本
```

### 架构设计

#### 1. **三层架构**

```
┌─────────────────────────────────────────────┐
│           Electron 主进程 (main.ts)          │
│  - 窗口管理                                  │
│  - IPC 通信处理                              │
│  - electron-store 数据持久化                 │
└──────────────────┬──────────────────────────┘
                   │ IPC Bridge
                   │ (preload.ts)
┌──────────────────┴──────────────────────────┐
│         Vue 渲染进程 (src/)                  │
│  ┌─────────────────────────────────────┐    │
│  │  UI 层 (Components)                 │    │
│  │  - ChatTabs                         │    │
│  │  - ChatView                         │    │
│  │  - ConversationList                 │    │
│  │  - SettingsView (多提供商配置)       │    │
│  └──────────────┬──────────────────────┘    │
│                 │                           │
│  ┌──────────────┴──────────────────────┐    │
│  │  状态管理层 (Pinia Stores)           │    │
│  │  - appStore: 多提供商配置管理        │    │
│  │  - chatStore: 对话和消息管理         │    │
│  └──────────────┬──────────────────────┘    │
│                 │                           │
│  ┌──────────────┴──────────────────────┐    │
│  │  服务层 (Services)                   │    │
│  │  - aiChatService: 统一 AI 路由器     │    │
│  │    ├─ GeminiService                 │    │
│  │    └─ OpenRouterService             │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

#### 2. **状态管理架构**

**appStore** (全局应用状态)
- 多提供商配置 (`activeProvider`, `geminiApiKey`, `openRouterApiKey`)
- API Key 管理和持久化
- 应用初始化状态 (`isAppReady`)
- 全局配置管理

**chatStore** (对话状态)
- 对话会话管理（`conversations`）
- 标签页状态（`openConversationIds`, `activeTabId`）
- 模型列表（`availableModels`）
- 提供原子化 API，支持异步安全操作

#### 3. **多提供商服务架构 (策略模式)**

```
┌──────────────────────────────────┐
│      aiChatService (路由器)       │
│  - getProviderContext()          │
│  - listAvailableModels()         │
│  - streamChatResponse()          │
└──────────────┬───────────────────┘
               │
        根据 activeProvider 路由
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼──────────┐  ┌──────▼──────────┐
│GeminiService │  │OpenRouterService│
│- Google SDK  │  │- Fetch + SSE    │
└──────────────┘  └─────────────────┘
```

#### 4. **进程间通信 (IPC)**

```typescript
// 预加载脚本暴露的安全 API
window.electronStore = {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<boolean>
  delete: (key: string) => Promise<boolean>
}
```

#### 5. **数据流**

```
用户输入
  ↓
ChatView 组件
  ↓
aiChatService.streamChatResponse(appStore, ...)
  ↓
根据 appStore.activeProvider 路由
  ↓
┌─────────────┬─────────────┐
│             │             │
Gemini API    OpenRouter API
  ↓             ↓
流式响应      流式响应 (SSE)
  ↓             ↓
└─────────────┴─────────────┘
  ↓
chatStore.appendTokenToMessage()
  ↓
Vue 响应式更新 UI
```

---

## 🚀 快速开始

### 前置要求

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **操作系统**: Windows / macOS / Linux

### 安装步骤

1. **克隆项目**

```bash
git clone https://github.com/GuXinghai/starverse.git
cd starverse
```

2. **安装依赖**

```bash
npm install
```

3. **配置 API Key**

**选项 A：使用 Google Gemini**
- 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
- 创建 API Key
- 在应用设置页面选择 "Google Gemini"
- 输入 API Key

**选项 B：使用 OpenRouter**
- 访问 [OpenRouter](https://openrouter.ai/keys)
- 注册并创建 API Key
- 在应用设置页面选择 "OpenRouter"
- 输入 API Key
- 可访问 GPT-4, Claude, Gemini 等上百种模型

4. **启动开发环境**

```bash
npm run electron:dev
```

应用将自动启动，Vite 开发服务器运行在 `http://localhost:5173`

---

## 💻 开发指南

### 可用脚本

```bash
# 启动 Vite 开发服务器（仅渲染进程）
npm run dev

# 启动完整 Electron 应用（开发模式）
npm run electron:dev

# 构建生产版本并打包
npm run build

# 预览构建结果
npm run preview

# 清理进程并重新启动开发服务器
npm run dev:clean
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

### 完全清理聊天记录

如果遇到数据损坏或需要重置应用，可以使用以下工具完全清理所有聊天记录和项目数据：

#### 方法 1：一键清理（推荐）

**Windows 批处理脚本** - 双击运行：
```bash
clear-all-data.bat
```

**PowerShell 脚本** - 右键使用 PowerShell 运行：
```bash
.\clear-all-data.ps1
```

#### 方法 2：使用 Node.js 脚本

**独立清理脚本**（推荐，无需 Electron 运行时）：
```bash
node scripts/clear-all-data-standalone.cjs
```

**Electron 内清理脚本**：
```bash
node scripts/clear-all-data.js
```

### 清理内容

清理工具会删除以下数据：

✅ **SQLite 数据库文件**
- `chat.db` - 主数据库
- `chat.db-wal` - 预写日志
- `chat.db-shm` - 共享内存

✅ **对话和项目数据**
- 所有聊天记录
- 所有项目和分类
- 打开的标签页记录
- 收藏的模型列表

🛡️ **保留的数据**
- API 密钥配置
- 模型选择偏好
- 提供商设置
- 其他应用设置

### 注意事项

⚠️ **使用前请确保**：
1. 已完全关闭 Starverse 应用
2. 已备份重要的聊天记录（如需保留）
3. 理解此操作不可逆

💡 **清理后首次启动**：
- 应用会自动创建新的数据库
- 创建一个新的空对话
- 所有项目列表为空

📖 **详细说明**：参见 [数据清理指南](docs/DATA_CLEANUP_GUIDE.md)

---

## 🔑 核心功能说明

### 1. 会话管理系统

#### 创建新会话
```javascript
const conversationId = chatStore.createConversation()
chatStore.openConversationInTab(conversationId)
```

#### 发送消息
```javascript
await chatStore.sendMessage(conversationId, userInput)
// 自动处理：
// - 添加用户消息到历史
// - 调用 Gemini API
// - 流式接收并显示 AI 回复
```

#### 会话操作
```javascript
// 重命名会话
chatStore.renameConversation(conversationId, newTitle)

// 删除会话
chatStore.deleteConversation(conversationId)

// 清空消息
chatStore.clearConversationMessages(conversationId)
```

### 2. 多提供商服务架构

#### 统一路由器 (aiChatService)
```javascript
// 自动根据 appStore.activeProvider 路由请求
import { aiChatService } from '@/services/aiChatService'

// 获取可用模型列表
const models = await aiChatService.listAvailableModels(appStore)

// 流式对话
const stream = aiChatService.streamChatResponse(
  appStore,
  history,
  modelName,
  userMessage,
  abortSignal
)

for await (const chunk of stream) {
  console.log(chunk) // 实时接收文本片段
}
```

#### 提供商实现
```javascript
// GeminiService - 使用 Google 官方 SDK
import { GoogleGenerativeAI } from '@google/generative-ai'

// OpenRouterService - 使用 Fetch API + SSE 解析
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ model, messages, stream: true })
})
```

### 3. 流式响应实现

#### Gemini 流式处理
```javascript
export async function* streamChatResponse(apiKey, history, modelName, userMessage, signal) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelName })
  
  const result = await model.generateContentStream({
    contents: [...history, { parts: [{ text: userMessage }] }],
    signal: signal
  })
  
  for await (const chunk of result.stream) {
    yield chunk.text()
  }
}
```

#### OpenRouter SSE 流式处理
```javascript
export async function* streamChatResponse(apiKey, history, modelName, userMessage, baseUrl, signal) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelName,
      messages: history.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.text
      })),
      stream: true
    }),
    signal: signal
  })
  
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const jsonStr = line.slice(5).trim()
        if (jsonStr === '[DONE]') return
        
        const chunk = JSON.parse(jsonStr)
        const content = chunk.choices?.[0]?.delta?.content
        if (content) yield content
      }
    }
  }
}
```

### 4. 数据持久化

```typescript
// 保存对话数据
await window.electronStore.set('conversations', conversations.value)

// 加载对话数据
const savedConversations = await window.electronStore.get('conversations')
```

### 4. 模型动态加载

```javascript
// 自动获取所有支持 generateContent 的模型
const models = await geminiService.listAvailableModels(apiKey)
// 返回: ['models/gemini-pro', 'models/gemini-1.5-flash', ...]
```

### 4. 富文本渲染系统

#### ContentRenderer 组件
智能渲染 AI 回复中的 Markdown、LaTeX 和代码：

```vue
<template>
  <ContentRenderer :content="message.text" />
</template>
```

#### 渲染流程
```javascript
// 1. 提取 LaTeX 公式（避免被 Markdown 处理）
text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
  const rendered = katex.renderToString(formula, { displayMode: true })
  return placeholder // 使用占位符
})

// 2. Markdown 转 HTML
let html = marked(text, { renderer, breaks: true, gfm: true })

// 3. 替换占位符为渲染后的公式
html = html.replace(placeholder, renderedFormula)
```

#### 智能代码块渲染
```javascript
renderer.code = function({ text, lang }) {
  // 无语言或 text/markdown/md → 作为 Markdown 渲染
  if (!lang || ['text', 'markdown', 'md'].includes(lang)) {
    return `<div class="nested-markdown">${marked(text)}</div>`
  }
  
  // 其他语言 → 语法高亮
  const highlighted = hljs.highlight(text, { language: lang }).value
  return `<pre><code class="hljs">${highlighted}</code></pre>`
}
```

#### 性能优化
```javascript
// 流式传输中：显示纯文本
<p v-if="isMessageStreaming(index)">{{ message.text }}</p>

// 流式完成后：完整渲染
<ContentRenderer v-else :content="message.text" />
```

#### 支持的格式

**Markdown 基础语法**
```markdown
# 标题 1-6 级
**加粗** *斜体* ~~删除线~~
- 无序列表
1. 有序列表
> 引用块
[链接](url)
![图片](url)
```

**LaTeX 数学公式**
```markdown
行内公式：$E = mc^2$
块级公式：
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

**代码块**
````markdown
```python
def hello():
    print("Hello, World!")
```

```
无语言代码块会被当作 Markdown 渲染
### 这个标题会正常显示
```
````

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

### 1. 启动优化
- **并行加载配置**: 使用 `Promise.all()` 同时加载多个配置项
- **懒加载组件**: 按需加载设置页面等非核心组件
- **启动速度**: < 2 秒（优化后提升 60%）

### 2. 渲染优化
- **虚拟滚动**: 大量消息列表使用虚拟滚动
- **防抖输入**: 草稿保存使用防抖避免频繁写入
- **Vue 3 响应式**: 利用 Proxy 提升性能

### 3. 内存管理
- **流式处理**: 不缓存完整响应，逐块处理
- **AbortController 清理**: 及时释放未完成的请求
- **对话持久化**: 定期保存，避免数据丢失

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

## 📚 更多文档

### 核心功能文档 ⭐
- [分支化聊天管理系统完整实现](./docs/BRANCH_CHAT_SYSTEM_COMPLETE.md) 🌳 **新增**
- [高级模型选择器实现总结](./docs/ADVANCED_MODEL_PICKER_IMPLEMENTATION.md) 🎯 **新增**
- [分支树架构重构完成](./docs/BRANCH_TREE_REFACTOR_COMPLETE.md) 🔧
- [OpenRouter 接入重构总结](./docs/OPENROUTER_INTEGRATION_SUMMARY.md) ⭐ 
- [系统默认应用打开图片](./docs/SYSTEM_IMAGE_OPENER.md) ⭐

### 优化与测试指南
- [自适应分位数滑块测试指南](./docs/QUANTILE_SLIDER_TEST_GUIDE.md) 🧪 **新增**
- [分支树重构测试指南](./docs/REFACTOR_TEST_GUIDE.md)
- [ChatView 优化总结](./docs/CHATVIEW_OPTIMIZATION_SUMMARY.md)
- [DOM 清理验证](./docs/DOM_CLEANUP_VERIFICATION.md)

### API 与开发文档
- [Chat Store API 使用指南](./src/stores/CHAT_STORE_GUIDE.md)
- [ChatView 更新说明](./docs/CHATVIEW_UPDATE_SUMMARY.md)
- [模型列表调试文档](./docs/DEBUG_MODEL_LIST.md)

### 问题修复记录
- [全部修复完成总结](./docs/ALL_FIXES_COMPLETE.md) 
- [优先级修复总结](./docs/PRIORITY_FIXES_SUMMARY.md)
- [焦点问题报告](./docs/FOCUS_ISSUE_REPORT.md)

---

## 🚧 已知问题和路线图

### 最近更新 ✨

**2025年1月6日** - 用户体验优化
- ✨ **新增：收藏模型滚动动画**
  - 模型名称过长时自动启用智能滚动播放
  - 四阶段环带算法：停顿（500ms）→ 阅读（50px/s）→ 压缩（4倍速）→ 循环
  - 响应窗口大小变化，自动重新计算
  - 完整的代码注释文档（689行新增）
- ✨ **优化：新建会话复用逻辑**
  - 只复用默认名称（"新对话"）的空白会话
  - 保护已重命名但未开始的会话，避免误覆盖

详见 [docs/RECENT_UPDATES_2025_01.md](docs/RECENT_UPDATES_2025_01.md)

---

**2025年11月** - 重要问题修复
- ✅ **修复：编辑无回复提问时的边界处理**
  - 编辑未改动内容时不再生成冗余版本
  - 无回复的提问也可触发首次生成
- ✅ **修复：删除提问分支时路径错乱**
  - 删除分支后自动重建有效路径
  - 智能选择下一个可用分支并保持路径完整性
- ✅ **修复：多模态模型重新生成时图片不显示**
  - 统一处理多种图片格式（URL、base64、data URI、inline_data 等）
  - 支持 OpenRouter 各种模型的图片返回格式
  - 增强去重逻辑，避免重复渲染

详见 [docs/RECENT_FIXES_2025_11.md](docs/RECENT_FIXES_2025_11.md)

---

**2025年11月9日** - 性能优化与代码质量提升 ⭐
- ✅ **性能优化：标签页切换性能提升 75%**
  - 优化前：40-50ms（超出 60fps 阈值）
  - 优化后：10ms（满足流畅体验）
  - 技术手段：
    - 移除非关键 console.log（-15-25ms）
    - 条件化昂贵计算（-10-15ms）
    - O(1) conversationsMap 查找（-2-3ms）
- ✅ **持久化优化：UI 状态保存速度提升 40 倍**
  - saveTabState()：仅保存标签状态（0.02ms，50ms 防抖）
  - saveConversations()：完整数据保存（0.8ms，按需触发）
  - 智能增量保存策略，减少 I/O 开销
- ✅ **代码质量提升**
  - ChatView.vue：新增 800+ 行详细注释（26% 覆盖率）
  - 清理 20+ 非关键调试日志，保留所有错误日志
  - 组件注释质量审查：12 个活跃组件全部通过
  - 归档 3 个未使用组件（HelloWorld、ModelSelector、StartupSplash）
- ✅ **配置优化**
  - 更新 tsconfig.json：排除 archived-components 目录
  - 更新 .gitignore：归档目录不进入版本控制
  - TypeScript 严格模式：零编译错误

详见：
- [docs/PERFORMANCE_OPTIMIZATION_COMPLETE.md](docs/PERFORMANCE_OPTIMIZATION_COMPLETE.md)
- [docs/CHATVIEW_OPTIMIZATION_SUMMARY.md](docs/CHATVIEW_OPTIMIZATION_SUMMARY.md)
- [docs/ARCHIVED_COMPONENTS.md](docs/ARCHIVED_COMPONENTS.md)

---

### 已完成功能 ✅
- ✅ **分支化对话系统**: 支持树形对话历史和多版本回复切换
- ✅ **高级模型选择器**: 收藏、筛选、搜索、排序功能
- ✅ **消息编辑功能**: 双击编辑用户消息并重新生成 AI 回复
- ✅ **多模态支持**: 完整的图片上传、预览、编辑功能
- ✅ **P0**: ChatView 多提供商逻辑适配
- ✅ **P0**: OpenRouter BaseURL 持久化
- ✅ **P0**: main.ts 迁移到多提供商架构
- ✅ **P1**: Provider 切换自动刷新模型列表
- ✅ **P2**: SSE 缓冲区溢出防护
- ✅ **P2**: 速率限制友好提示
- ✅ **P3**: AbortController 内存泄漏
- ✅ **P3**: API Key 格式校验
- ✅ **P3**: 智能默认模型选择
- ✅ **自适应分位数滑块**: 优化上下文长度和价格筛选体验

### 未来计划 🚀
- [ ] 支持更多 AI 提供商（Claude API, Azure OpenAI）
- [ ] 添加高级参数配置（Temperature, Top-P, Max Tokens）
- [ ] 实现对话导出/导入功能（JSON, Markdown, PDF）
- [ ] 代码块复制功能增强
- [ ] 主题切换（暗色模式）
- [ ] 多语言支持（i18n）
- [ ] 成本统计和使用量追踪
- [ ] 语音输入/输出支持
- [ ] 插件系统架构

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 贡献指南
1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

---

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
  <p>用 ❤️ 和 ☕ 制作</p>
  <p>© 2025 Starverse. All rights reserved.</p>
</div>
