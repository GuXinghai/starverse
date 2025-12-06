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
- [核心功能说明](#-核心功能说明)
- [安全性](#-安全性)
- [性能优化](#-性能优化)
- [更多文档](#-更多文档)
- [最近更新和路线图](#-最近更新和路线图)
- [常见问题](#-常见问题faq)
- [贡献指南](#-贡献)
- [许可证](#-许可证)

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

### 🤖 AI 对话能力
- **多提供商支持**: 支持 Google Gemini 和 OpenRouter 双提供商，可自由切换
- **多模型支持**: 
  - Gemini: gemini-pro, gemini-1.5-flash, gemini-2.0-flash-exp 等
  - OpenRouter: 支持 GPT-4, Claude, Gemini, Llama 等上百种模型
- **多模态支持**: 
  - 上传图片到 AI 模型进行分析（GPT-4o、Gemini 1.5+、Claude 3）
  - 接收 AI 生成的图片
  - 🆕 一键切换图片比例（1:1、16:9、9:16 等）
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
  - better-sqlite3 高性能数据库引擎
  - Web Worker 异步操作，不阻塞 UI
  - 项目管理独立存储（完整 CRUD 操作）
  - 对话归档功能（archive/restore）
  - FTS5 全文搜索支持（中英文分词）
  - 外键约束确保数据一致性
  - 完整的数据迁移系统
- **边界防御机制**:
  - IPC 边界统一去代理化（深度去除 Vue Proxy）
  - 消除 Vue Proxy structuredClone 错误
  - Web Worker 异步数据库操作
  - 增量序列化优化大型对话保存
  - 数据验证 Schema（Zod）

### 🔍 全文搜索 ⭐ 新增
- **SQLite FTS5 全文检索**:
  - 支持对话标题和消息内容搜索
  - 中英文分词和停用词过滤
  - 按相关性排序搜索结果
  - 实时索引更新
  - 高性能查询（< 10ms）

### 🧠 智能对话增强 ⭐ 新增
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
- **思维链推理支持**:
  - 支持 OpenRouter 推理模型（o1、Gemini Thinking 等）
  - 可配置推理可见性（显示/隐藏）
  - 推理努力程度控制（低/中/高）
  - 最大推理 Token 限制

### 🎨 用户体验
- **现代化 UI**: 基于 Tailwind CSS 的精美界面设计
- **🆕 现代化工具栏**: Plus Menu + Chips 交互模型
  - ✅ 紧凑型按钮设计（文件上传、绘画、推理、搜索、参数）
  - ✅ 内联配置菜单（搜索深度、推理努力程度）
  - ✅ 一键比例切换（图像生成场景）
  - ✅ 智能禁用状态（根据模型能力自动调整）
  - ✅ Smart Parent, Dumb Child 架构（纯展示组件）
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
  - 所有活跃组件通过注释质量审查
- **代码质量保障**:
  - TypeScript 严格模式，零编译错误
  - 移除非关键调试日志，保留错误追踪
  - 模块化架构，职责清晰
  - 边界防御实施（IPC 层）
- **完善的文档体系**:
  - 详细的架构文档和开发指南
  - API 使用文档和最佳实践
  - 问题修复记录和优化总结
  - 70+ 份技术文档

### 🔧 技术特性
- **持久化架构**:
  - SQLite 数据库（对话、消息、项目）
  - better-sqlite3 + Web Worker（异步操作）
  - FTS5 全文搜索（中英文分词）
  - 增量序列化优化
  - 完整的数据迁移系统
- **安全性保障**:
  - Electron 上下文隔离
  - 预加载脚本安全桥接
  - API Key 加密存储
  - structuredClone 边界防御
  - DOMPurify HTML 清理
- **性能优化**:
  - 标签页切换 75% 性能提升（10ms）
  - UI 状态保存速度提升 40 倍
  - 智能增量保存策略
  - O(1) 对话查找性能
  - 虚拟滚动和懒加载

---

## 🛠 技术栈

### 核心框架
| 技术 | 版本 | 用途 |
|------|------|------|
| **Electron** | 38.6.0 | 跨平台桌面应用框架 |
| **Vue.js** | 3.4.21 | 渐进式前端框架（Composition API） |
| **TypeScript** | 5.2.2 | 类型安全的 JavaScript 超集 |
| **Vite** | 5.1.6 | 新一代前端构建工具 |
| **Pinia** | 3.0.3 | Vue 3 官方状态管理库（8个模块化 Store，含模型能力系统） |

### 数据存储
| 技术 | 版本 | 用途 |
|------|------|------|
| **better-sqlite3** | 12.4.1 | 高性能同步 SQLite 数据库 |
| **electron-store** | 11.0.2 | Electron 配置数据持久化 |
| **Zod** | 3.23.8 | TypeScript 优先的 Schema 验证 |

### UI 和渲染
| 技术 | 版本 | 用途 |
|------|------|------|
| **Tailwind CSS** | 4.1.16 | 原子化 CSS 框架 |
| **marked** | 16.4.1 | Markdown 解析和渲染 |
| **KaTeX** | 0.16.25 | LaTeX 数学公式渲染 |
| **highlight.js** | 11.11.1 | 代码语法高亮 |
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
│   └── ipc/                    # IPC 处理器
│       └── dbBridge.ts        # 数据库 IPC 桥接
│
├── src/                        # Vue 渲染进程
│   ├── components/             # 12 个 Vue 组件
│   │   ├── ChatView.vue       # 核心聊天视图（5000+ 行）
│   │   ├── TabbedChatView.vue # 多标签容器
│   │   ├── ConversationList.vue # 对话列表侧边栏
│   │   ├── AdvancedModelPickerModal.vue # 高级模型选择器
│   │   ├── FavoriteModelSelector.vue # 收藏模型选择器
│   │   └── ...                # 其他组件
│   │
│   ├── services/               # 业务逻辑服务
│   │   ├── aiChatService.js   # AI 服务路由器（策略模式）
│   │   ├── chatPersistence.ts # SQLite 对话持久化
│   │   ├── projectPersistence.ts # 项目管理持久化
│   │   ├── searchService.ts   # FTS5 全文搜索
│   │   ├── db/                # 数据库 IPC 封装
│   │   │   ├── index.ts      # 数据库服务客户端
│   │   │   └── types.ts      # 类型定义
│   │   └── providers/         # AI 提供商实现
│   │       ├── GeminiService.js # Google Gemini
│   │       └── OpenRouterService.js # OpenRouter（1300+ 行）
│   │
│   ├── stores/                 # Pinia 状态管理（模块化架构）
│   │   ├── index.ts           # appStore（全局配置，249 行）
│   │   ├── conversation.ts    # 对话管理（433 行）
│   │   ├── branch.ts          # 分支树操作（422 行）
│   │   ├── model.ts           # 模型管理（265 行）
│   │   ├── persistence.ts     # 持久化调度（271 行）
│   │   ├── project.ts         # 项目管理（475 行）
│   │   ├── projectWorkspaceStore.ts # 项目工作区（376 行）
│   │   └── branchTreeHelpers.ts # 分支树算法（1140 行）
│   │
│   ├── types/                  # TypeScript 类型
│   │   ├── chat.ts            # 聊天类型（300+ 行）
│   │   └── electron.d.ts      # Window 接口扩展
│   │
│   ├── utils/                  # 工具函数
│   │   ├── electronBridge.ts  # Electron API 桥接
│   │   └── ipcSanitizer.js    # IPC 数据清理
│   │
│   ├── App.vue                 # 根组件
│   └── main.ts                 # Vue 应用入口
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

| 模块 | 文件数 | 代码行数 | 说明 |
|------|--------|---------|------|
| **核心组件** | 13+ | ~12,200 | Vue 3 Composition API |
| - ChatView.vue | 1 | 5,312 | 聊天核心逻辑、多实例架构 |
| - ConversationList.vue | 1 | 1,474 | 项目树 + 对话列表（🚧 重构中，TODO 1.1-1.3 已完成） |
| - ChatToolbar.vue | 1 | ~450 | 🆕 现代化工具栏（Plus Menu + Chips） |
| - AdvancedModelPickerModal.vue | 1 | 1,353 | 高级模型选择器 |
| - ProjectHome.vue | 1 | 1,171 | 项目主页 |
| **状态管理** | 8 | ~3,800 | Pinia Stores (模块化) |
| - conversation.ts | 1 | 433 | 对话管理、标签页 |
| - branch.ts | 1 | 422 | 分支树操作 |
| - branchTreeHelpers.ts | 1 | 1,140 | 树形算法实现 |
| - model.ts | 1 | ~380 | 🆕 模型管理 + 能力系统 Phase 2（ModelGenerationCapability） |
| **Composables** | 13+ | ~1,800 | Vue 组合式函数 |
| - 🆕 useConversationSearch.ts | 1 | ~300 | TODO 1.3: 对话搜索逻辑（FTS5 + DSL） |
| - 🆕 useMenuPositioning.ts | 1 | ~150 | TODO 1.2: 菜单智能定位算法 |
| - 🆕 useFormatters.ts | 1 | ~100 | TODO 1.1: 格式化工具函数集合 |1,140 | 树形算法实现 |
| - model.ts | 1 | 265 | 模型管理 |
| - persistence.ts | 1 | 271 | 持久化调度 |
| - project.ts | 1 | 475 | 项目管理 |
| **服务层** | 8 | ~3,000 | 业务逻辑层 |
| - OpenRouterService.js | 1 | 1,337 | SSE 流式解析 |
| - chatPersistence.ts | 1 | ~400 | SQLite 持久化 |
| **类型定义** | 2 | ~400 | TypeScript 类型 |
| - chat.ts | 1 | 312 | 多模态消息类型 |
| **基础设施** | 6 | ~800 | 数据库层 |
| - schema.sql | 1 | ~150 | DDL 定义 |
| - repo/* | 4 | ~500 | 数据访问对象 |
| **文档** | 70+ | ~50,000 | Markdown 文档 |
| **总计** | ~100 | ~18,000+ | 不含 node_modules |

### 架构设计

#### 1. **四层架构（Presentation → State → Service → Infrastructure）**

```
┌─────────────────────────────────────────────────────────────┐
│                   Electron 主进程 (main.ts)                  │
│  - 窗口管理（BrowserWindow）                                  │
│  - 应用生命周期（app events）                                 │
│  - IPC 通信处理（ipcMain.handle）                            │
│  - DB Worker 管理（DbWorkerManager）                         │
└────────────────────────┬────────────────────────────────────┘
                         │ contextBridge (preload.ts)
                         │ 安全的 IPC 桥接
┌────────────────────────┴────────────────────────────────────┐
│                   Vue 渲染进程 (src/)                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  表现层 (Presentation Layer)                         │   │
│  │  12 个 Vue 组件，采用 Composition API                │   │
│  │  - ChatView.vue (5000+ 行核心视图)                   │   │
│  │  - TabbedChatView.vue (多实例容器)                   │   │
│  │  - ConversationList.vue (项目+对话树)                │   │
│  │  - AdvancedModelPickerModal.vue (高级选择器)         │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────┴─────────────────────────────────┐   │
│  │  状态层 (State Management - Pinia，模块化设计)      │   │
│  │  - appStore (249 行): 全局配置、API Key、Provider   │   │
│  │  - conversationStore (433 行): 对话 CRUD、标签管理  │   │
│  │  - branchStore (422 行): 分支树操作、流式追加       │   │
│  │  - modelStore (265 行): 模型列表、收藏管理          │   │
│  │  - persistenceStore (271 行): 自动保存、脏数据追踪  │   │
│  │  - projectStore (475 行): 项目管理、对话关联        │   │
│  │  - branchTreeHelpers (1140 行): 树算法、序列化      │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────┴─────────────────────────────────┐   │
│  │  服务层 (Service Layer)                              │   │
│  │  - aiChatService: AI 服务路由器（策略模式）          │   │
│  │    ├─ GeminiService: Google Gemini SDK               │   │
│  │    └─ OpenRouterService: SSE 流式（1300+ 行）        │   │
│  │  - chatPersistence: SQLite 持久化服务                │   │
│  │  - projectPersistence: 项目管理服务                  │   │
│  │  - searchService: FTS5 搜索 DSL                      │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │ IPC: db:invoke                       │
└───────────────────────┼──────────────────────────────────────┘
                        │
┌───────────────────────┴──────────────────────────────────────┐
│              基础设施层 (Infrastructure - infra/db)           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Web Worker (异步 SQLite 操作)                       │   │
│  │  - workerManager.ts: 任务调度、超时控制              │   │
│  │  - worker.ts: SQLite3 + Repository 实例化            │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────┴─────────────────────────────────┐   │
│  │  Repository 层 (数据访问对象)                         │   │
│  │  - ConvoRepo: 对话 CRUD + 归档                       │   │
│  │  - MessageRepo: 消息批量操作 + FTS5 索引             │   │
│  │  - ProjectRepo: 项目管理 + 计数统计                  │   │
│  │  - SearchRepo: FTS5 全文检索 + BM25 排序             │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────┴─────────────────────────────────┐   │
│  │  SQLite 数据库 (chat.db)                             │   │
│  │  - WAL 模式，外键约束                                │   │
│  │  - 7 张表 + 1 个 FTS5 虚拟表                         │   │
│  │  - schema.sql: 完整 DDL 定义                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
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

#### 4. **数据库 Schema（SQLite + FTS5）**

```sql
-- 核心表结构
CREATE TABLE project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  meta TEXT  -- JSON 元数据
);

CREATE TABLE convo (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES project(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  meta TEXT  -- JSON: 包含分支树、模型、草稿等
);

CREATE TABLE message (
  id TEXT PRIMARY KEY,
  convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE CASCADE,
  role TEXT NOT NULL,  -- 'user' | 'assistant'
  created_at INTEGER NOT NULL,
  seq INTEGER NOT NULL,  -- 消息序号
  meta TEXT,  -- JSON: branchId, versionId, metadata
  UNIQUE (convo_id, seq)
);

CREATE TABLE message_body (
  message_id TEXT PRIMARY KEY REFERENCES message(id) ON DELETE CASCADE,
  body TEXT NOT NULL  -- 消息正文
);

CREATE TABLE tag (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE convo_tag (
  convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (convo_id, tag_id)
);

-- FTS5 全文搜索虚拟表
CREATE VIRTUAL TABLE message_fts USING fts5(
  message_id UNINDEXED,
  convo_id UNINDEXED,
  body,
  tokenize = 'unicode61'  -- 中英文分词
);

-- 性能优化索引
CREATE INDEX idx_convo_project ON convo(project_id);
CREATE INDEX idx_convo_updated ON convo(updated_at DESC);
CREATE INDEX idx_msg_convo_seq ON message(convo_id, seq);

-- WAL 模式配置
PRAGMA journal_mode=WAL;       -- Write-Ahead Logging
PRAGMA synchronous=NORMAL;     -- 性能与安全平衡
PRAGMA foreign_keys=ON;        -- 外键约束
PRAGMA mmap_size=268435456;    -- 256MB 内存映射
PRAGMA cache_size=-20000;      -- 20MB 缓存
```

**分支树存储策略**:
- `convo.meta` 存储完整分支树的序列化 JSON
- `message` 表仅存储当前路径的消息（用于 FTS5 搜索）
- 分支切换时重建 `message` 表记录，保持搜索索引同步

#### 5. **进程间通信 (IPC)**

```typescript
// 预加载脚本暴露的安全 API (preload.ts)
contextBridge.exposeInMainWorld('electronStore', {
  get: (key: string) => ipcRenderer.invoke('store-get', key),
  set: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
  delete: (key: string) => ipcRenderer.invoke('store-delete', key)
})

contextBridge.exposeInMainWorld('electronDb', {
  invoke: (payload: { method: DbMethod, params?: unknown }) =>
    ipcRenderer.invoke('db:invoke', payload)
})

contextBridge.exposeInMainWorld('electronApi', {
  openExternal: (url: string) => ipcRenderer.invoke('api:open-external', url),
  saveTempImage: (dataUrl: string) => ipcRenderer.invoke('api:save-temp-image', dataUrl)
})
```

**IPC 安全机制**:
1. **Context Isolation**: 完全隔离主进程和渲染进程
2. **白名单模式**: 只暴露必要的 API 方法
3. **数据清理**: `ipcSanitizer` 深度去除 Vue Proxy
4. **方法验证**: 数据库 IPC 只允许预定义的 26 个方法

#### 6. **数据流（AI 对话 + 持久化）**

```
┌──────────────────────────────────────────────────────────┐
│                  用户输入消息                             │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌────────────────────────┴─────────────────────────────────┐
│  ChatView.vue - handleSendMessage()                      │
│  - 捕获 conversationId（上下文固化）                      │
│  - 上传图片 → base64 data URI                            │
│  - 调用 branchStore.addBranch()                          │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌────────────────────────┴─────────────────────────────────┐
│  BranchStore + ConversationStore                         │
│  1. 添加用户消息到分支树（branchStore）                   │
│  2. 创建 AI 消息占位符（branchStore）                     │
│  3. 调用 aiChatService.streamChatResponse()              │
│  4. 标记脏数据（persistenceStore）                        │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌────────────────────────┴─────────────────────────────────┐
│  aiChatService.js - 策略模式路由                          │
│  根据 appStore.activeProvider 选择服务:                   │
│  - Gemini → GeminiService                                │
│  - OpenRouter → OpenRouterService                        │
└─────────────┬───────────────────────┬────────────────────┘
              ↓                       ↓
  ┌───────────────────┐   ┌──────────────────────┐
  │ GeminiService.js  │   │ OpenRouterService.js │
  │ Google SDK        │   │ Fetch + SSE Parser   │
  │ generateContent() │   │ 1300+ 行实现          │
  └───────────────────┘   └──────────────────────┘
              ↓                       ↓
  ┌───────────────────┐   ┌──────────────────────┐
  │ Gemini API        │   │ OpenRouter API       │
  │ 流式响应          │   │ SSE 流式响应          │
  └───────────────────┘   └──────────────────────┘
              ↓                       ↓
              └───────────┬───────────┘
                          ↓
┌─────────────────────────┴────────────────────────────────┐
│  chatStore - 逐 Token 更新                                │
│  - appendTokenToMessage() / appendImageToMessage()       │
│  - 更新分支树中的消息内容                                  │
│  - Vue 响应式自动触发 UI 更新                             │
└─────────────────────────┬────────────────────────────────┘
                          ↓
┌─────────────────────────┴────────────────────────────────┐
│  ContentRenderer.vue - 实时渲染                           │
│  - 流式中：显示纯文本（性能优化）                          │
│  - 完成后：Markdown + LaTeX + 代码高亮                    │
└─────────────────────────┬────────────────────────────────┘
                          ↓
┌─────────────────────────┴────────────────────────────────┐
│  chatStore - 自动持久化（50ms 防抖）                      │
│  调用 sqliteChatPersistence.saveConversation()            │
└─────────────────────────┬────────────────────────────────┘
                          ↓
┌─────────────────────────┴────────────────────────────────┐
│  chatPersistence.ts                                      │
│  1. deepToRaw() 去除 Vue Proxy                           │
│  2. serializeTree() 分支树序列化                          │
│  3. toMessageSnapshots() 提取当前路径消息                 │
│  4. 调用 dbService.saveConvo() / replaceMessages()       │
└─────────────────────────┬────────────────────────────────┘
                          ↓ IPC: db:invoke
┌─────────────────────────┴────────────────────────────────┐
│  主进程 - dbBridge.ts                                     │
│  验证方法白名单 → 调用 DbWorkerManager                    │
└─────────────────────────┬────────────────────────────────┘
                          ↓
┌─────────────────────────┴────────────────────────────────┐
│  Web Worker - worker.ts                                  │
│  1. 接收任务（通过 postMessage）                          │
│  2. 实例化 Repository                                    │
│  3. 执行 SQLite 操作（同步调用，不阻塞 UI）               │
│  4. 返回结果                                             │
└─────────────────────────┬────────────────────────────────┘
                          ↓
┌─────────────────────────┴────────────────────────────────┐
│  SQLite 数据库 (chat.db)                                 │
│  - convo 表：存储分支树 JSON                              │
│  - message + message_fts：当前路径 + FTS5 索引            │
│  - 事务保证数据一致性                                     │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 📋 前置要求

确保您的开发环境满足以下要求：

| 工具 | 版本要求 | 检查命令 |
|------|---------|---------|
| **Node.js** | >= 18.0.0 | `node --version` |
| **npm** | >= 9.0.0 | `npm --version` |
| **操作系统** | Windows 10+, macOS 10.13+, Ubuntu 18.04+ | - |

### 📥 安装步骤

**步骤 1: 克隆项目**

```bash
git clone https://github.com/GuXinghai/starverse.git
cd starverse
```

**步骤 2: 安装依赖**

```bash
npm install
```

> ⚠️ **Windows 用户注意**: 如果遇到 `better-sqlite3` 编译错误，请运行 `npm run rebuild`

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
| `npm run build` | 构建生产版本并打包 |
| `npm run preview` | 预览构建结果 |
| `npm run dev:clean` | 清理进程并重新启动开发服务器 |
| `npm run rebuild` | 重新编译 better-sqlite3 原生模块 |
| `npm run build:worker` | 构建数据库 Web Worker |
| `npm run watch:worker` | 监听模式构建 Web Worker |

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

## 🔑 核心技术实现

### 1. 分支化对话树系统 🌳

**数据结构**（branchTreeHelpers.ts）：
```typescript
type ConversationTree = {
  branches: Map<string, Branch>,      // branchId → Branch
  rootBranchIds: string[],            // 根分支 ID 列表
  currentPath: string[]               // 当前路径（branchId 序列）
}

type Branch = {
  id: string,
  parentBranchId: string | null,
  versions: Version[],                // 同一位置的多个版本
  currentVersionIndex: number         // 当前选中的版本
}

type Version = {
  id: string,
  message: Message,                   // 完整消息对象
  children: string[]                  // 子分支 ID 列表
}
```

**核心算法**：
- **添加分支**: O(1) - Map 查找 + 数组追加
- **切换版本**: O(n) - 重建当前路径，n 为深度
- **删除分支**: O(m) - 递归删除子树，m 为子节点数
- **序列化**: O(n) - 深度优先遍历，转换 Map 为数组

**存储策略**：
- 内存中使用 `Map<string, Branch>` 保证 O(1) 查找
- 持久化时序列化为 JSON 数组存储在 `convo.meta`
- 恢复时重建 Map 结构

### 2. Web Worker 数据库架构 ⚡

**Worker 管理器**（electron/db/workerManager.ts）：
```typescript
class DbWorkerManager {
  private worker: Worker | null = null
  private requestMap: Map<number, PendingRequest> = new Map()
  private requestId = 0

  async call(method: DbMethod, params?: unknown): Promise<any> {
    const id = ++this.requestId
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestMap.delete(id)
        reject(new DbWorkerError('ERR_TIMEOUT', 'Request timeout'))
      }, 30000)  // 30秒超时
      
      this.requestMap.set(id, { resolve, reject, timeout })
      this.worker!.postMessage({ id, method, params })
    })
  }
}
```

**Worker 实现**（infra/db/worker.ts）：
```typescript
// Worker 线程中的消息处理
self.onmessage = async (event: MessageEvent) => {
  const { id, method, params } = event.data
  
  try {
    // 实例化 Repository
    const repo = getRepository(method)  // 根据 method 获取对应 repo
    const result = await repo[methodName](params)
    
    // 返回结果
    self.postMessage({
      id,
      type: 'success',
      result
    })
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: serializeError(error)
    })
  }
}
```

**优势**：
- ✅ SQLite 同步操作不阻塞 UI 线程
- ✅ 请求队列化，避免并发冲突
- ✅ 超时控制，防止请求挂起
- ✅ 错误隔离，Worker 崩溃不影响主进程

### 3. FTS5 全文搜索引擎 🔍

**Schema 定义**（infra/db/schema.sql）：
```sql
-- FTS5 虚拟表
CREATE VIRTUAL TABLE message_fts USING fts5(
  message_id UNINDEXED,
  convo_id UNINDEXED,
  body,
  tokenize = 'unicode61'  -- 支持中英文分词
);

-- 删除触发器（保持 FTS 索引同步）
CREATE TRIGGER trg_message_del AFTER DELETE ON message BEGIN
  INSERT INTO message_fts(message_fts, rowid, message_id, convo_id, body)
  VALUES('delete', (SELECT rowid FROM message_fts WHERE message_id = old.id), old.id, old.convo_id, '');
END;
```

**搜索实现**（infra/db/repo/searchRepo.ts）：
```typescript
fulltext(params: FulltextQueryParams): FulltextResult[] {
  const sql = `
    SELECT
      m.id AS messageId,
      m.convo_id AS convoId,
      snippet(message_fts, 2, '<em>', '</em>', '…', 20) as snippet,
      bm25(message_fts) AS rank,          -- BM25 相关性评分
      m.created_at AS createdAt
    FROM message_fts
    JOIN message m ON m.id = message_fts.message_id
    WHERE message_fts.body MATCH @query   -- 全文匹配
    ORDER BY rank, m.created_at DESC      -- 按相关性排序
    LIMIT @limit OFFSET @offset
  `
  return this.db.prepare(sql).all(params)
}
```

**搜索特性**：
- ✅ BM25 算法排序（相关性评分）
- ✅ Snippet 高亮（20 字符上下文）
- ✅ 支持布尔查询（AND、OR、NOT）
- ✅ 项目和标签过滤
- ✅ 时间范围筛选

### 4. 多提供商服务架构（策略模式） 🎯

**统一路由器**（src/services/aiChatService.js）：
```javascript
export const aiChatService = {
  getProviderContext(appStore) {
    const provider = appStore.activeProvider
    
    if (provider === 'Gemini') {
      return {
        service: GeminiService,
        apiKey: appStore.geminiApiKey,
        baseUrl: null
      }
    } else if (provider === 'OpenRouter') {
      return {
        service: OpenRouterService,
        apiKey: appStore.openRouterApiKey,
        baseUrl: appStore.openRouterBaseUrl
      }
    }
  },

  async* streamChatResponse(appStore, history, modelName, userMessage, options) {
    const { service, apiKey, baseUrl } = this.getProviderContext(appStore)
    
    // 统一的流式接口
    yield* service.streamChatResponse(
      apiKey,
      history,
      modelName,
      userMessage,
      baseUrl,
      options.signal,
      options
    )
  }
}
```

**OpenRouter SSE 解析**（1300+ 行实现）：
```javascript
async* streamChatResponse(apiKey, history, modelName, userMessage, baseUrl, signal, options) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelName,
      messages: formatMessages(history, userMessage),
      stream: true,
      // 采样参数
      temperature: options.parameters?.temperature,
      top_p: options.parameters?.top_p,
      // 推理配置
      reasoning: options.reasoning,
      // Web 搜索
      provider: { order: options.webSearch?.engines }
    }),
    signal
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
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') return

        const chunk = JSON.parse(data)
        
        // 处理不同类型的 chunk
        if (chunk.choices?.[0]?.delta?.content) {
          yield { type: 'text', content: chunk.choices[0].delta.content }
        }
        if (chunk.usage) {
          yield { type: 'usage', metrics: chunk.usage }
        }
        if (chunk.choices?.[0]?.delta?.reasoning_detail) {
          yield { type: 'reasoning', detail: chunk.choices[0].delta.reasoning_detail }
        }
      }
    }
  }
}
```

### 5. Vue Proxy 边界防御 🛡️

**问题**：Vue 3 的响应式 Proxy 无法通过 `structuredClone` 传递给 Electron IPC。

**解决方案**（src/services/chatPersistence.ts）：
```typescript
function deepToRaw(obj: any, depth: number = 0, path: string = 'root'): any {
  // 处理原始类型
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj
  }

  // 去除顶层 Proxy
  const raw = toRaw(obj)

  // 递归处理数组
  if (Array.isArray(raw)) {
    return raw.map((item, index) => 
      deepToRaw(item, depth + 1, `${path}[${index}]`)
    )
  }

  // 递归处理对象
  const result: any = {}
  for (const key in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      result[key] = deepToRaw(raw[key], depth + 1, `${path}.${key}`)
    }
  }
  return result
}

// 保存对话前清理
async saveConversation(snapshot: ConversationSnapshot) {
  // 1. 序列化分支树（Map → 数组）
  const serializedTree = serializeTree(snapshot.tree)
  
  // 2. 深度去除 Proxy
  const cleanSnapshot = deepToRaw({ ...snapshot, tree: serializedTree })
  
  // 3. 保存到 SQLite
  await dbService.saveConvo({
    id: cleanSnapshot.id,
    meta: {
      tree: cleanSnapshot.tree,  // 已清理的树
      model: cleanSnapshot.model,
      // ...
    }
  })
}
```

### 6. 多实例组件架构 🔄

**ChatView.vue 多实例设计**：
```vue
<script setup lang="ts">
// ========== 上下文固化原则 ==========
// 问题：props.conversationId 在异步操作期间可能变化（标签切换）
// 解决：在异步任务启动时立即捕获到局部常量

const handleSendMessage = async () => {
  const targetConversationId = props.conversationId  // 🔒 固化

  try {
    // 异步操作使用固化的 ID，不受标签切换影响
    await chatStore.sendMessage(targetConversationId, userInput, attachments)
  } catch (error) {
    console.error(`[ChatView] conversationId=${targetConversationId} send failed`)
  }
}

// 流式响应也需要固化
watch(() => chatStore.streamingMessageId, () => {
  const targetConversationId = props.conversationId  // 🔒 固化
  
  nextTick(() => {
    if (chatStore.isConversationStreaming(targetConversationId)) {
      scrollToBottom()
    }
  })
})
</script>
```

**TabbedChatView 容器管理**：
```vue
<template>
  <div v-for="id in chatStore.openConversationIds" :key="id">
    <!-- 通过 display 控制可见性，不销毁实例 -->
    <ChatView 
      :conversationId="id"
      :style="{ display: id === chatStore.activeTabId ? 'flex' : 'none' }"
    />
  </div>
</template>
```

**优势**：
- ✅ 切换标签页不触发组件重建（性能优化）
- ✅ 后台标签的流式生成可以继续运行
- ✅ 保留滚动位置和输入框状态
- ✅ 避免多次重复加载模型列表

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

详细文档：[PERFORMANCE_OPTIMIZATION_COMPLETE.md](docs/PERFORMANCE_OPTIMIZATION_COMPLETE.md)

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
- [分支化聊天管理系统完整实现](./docs/BRANCH_CHAT_SYSTEM_COMPLETE.md) 🌳
- [高级模型选择器实现总结](./docs/ADVANCED_MODEL_PICKER_IMPLEMENTATION.md) 🎯
- [分支树架构重构完成](./docs/BRANCH_TREE_REFACTOR_COMPLETE.md) 🔧
- [OpenRouter 接入重构总结](./docs/OPENROUTER_INTEGRATION_SUMMARY.md) ⭐ 
- [系统默认应用打开图片](./docs/SYSTEM_IMAGE_OPENER.md) 📷
- [网络搜索集成文档](./docs/WEB_SEARCH_INTEGRATION.md) 🔍
- [采样参数功能说明](./docs/SAMPLING_PARAMETERS_FEATURE.md) ⚙️

### 数据存储与持久化
- [SQLite 增强实施文档](./docs/SQLITE_ENHANCEMENT_IMPLEMENTATION.md) 🗄️
- [边界防御实施文档](./docs/BOUNDARY_DEFENSE_IMPLEMENTATION.md) 🛡️
- [Web Worker 实现文档](./docs/WEB_WORKER_IMPLEMENTATION.md) ⚡
- [增量序列化指南](./docs/INCREMENTAL_SERIALIZATION_GUIDE.md) 📦
- [数据清理指南](./docs/DATA_CLEANUP_GUIDE.md) 🧹

### 性能优化文档
- [性能优化完整总结](./docs/PERFORMANCE_OPTIMIZATION_COMPLETE.md) ⚡
- [标签切换性能优化实施](./docs/CHAT_SWITCHING_OPTIMIZATION_IMPLEMENTATION.md) 🏃
- [ChatView 优化总结](./docs/CHATVIEW_OPTIMIZATION_SUMMARY.md) 📊
- [保存优化总结](./docs/SAVE_OPTIMIZATION_SUMMARY.md) 💾
- [长对话性能优化](./docs/LONG_CONVERSATION_PERFORMANCE.md) 📈

### 测试与验证指南
- [自适应分位数滑块测试指南](./docs/QUANTILE_SLIDER_TEST_GUIDE.md) 🧪
- [分支树重构测试指南](./docs/REFACTOR_TEST_GUIDE.md) ✅
- [DOM 清理验证](./docs/DOM_CLEANUP_VERIFICATION.md) 🔍
- [存储验证报告](./docs/STORAGE_VERIFICATION_REPORT.md) 📋

### API 与开发文档
- [Chat Store API 使用指南](./src/stores/CHAT_STORE_GUIDE.md) 📖
- [ChatView 更新说明](./docs/CHATVIEW_UPDATE_SUMMARY.md) 📝
- [模型列表调试文档](./docs/DEBUG_MODEL_LIST.md) 🐛

### 问题修复记录
- [2025年11月修复汇总](./docs/RECENT_FIXES_2025_11.md) 🔧
- [2025年1月更新汇总](./docs/RECENT_UPDATES_2025_01.md) ✨
- [全部修复完成总结](./docs/ALL_FIXES_COMPLETE.md) ✅
- [优先级修复总结](./docs/PRIORITY_FIXES_SUMMARY.md) 🎯
- [项目管理修复](./docs/PROJECT_MANAGEMENT_FIXES.md) 📁

### 代码质量文档
- [代码清理总结](./docs/CLEANUP_SUMMARY.md) 🧹
- [代码清理报告](./docs/CODE_CLEANUP_REPORT.md) 📊
- [组件归档说明](./docs/ARCHIVED_COMPONENTS.md) 📦
- [ChatView 注释改进](./docs/CHATVIEW_COMMENTS_IMPROVEMENT.md) 💬

### UI/UX 文档
- [收藏模型滚动动画实现](./docs/BELT_SCROLL_IMPLEMENTATION.md) 🎞️
- [智能菜单定位修复](./docs/SUBMENU_TELEPORT_FIX.md) 🎯
- [按钮交互优化](./docs/BUTTON_INTERACTION_OPTIMIZATION.md) 🖱️

---

## 🚧 最近更新和路线图

### 最近更新 ✨

**2025年1月** - 用户体验优化
- ✨ **收藏模型滚动动画**
  - 模型名称过长时自动启用智能滚动播放
  - 四阶段环带算法：停顿（500ms）→ 阅读（50px/s）→ 压缩（4倍速）→ 循环
  - 响应窗口大小变化，自动重新计算
  - 完整的代码注释文档（689行新增）
- ✨ **新建会话复用优化**
  - 只复用默认名称（"新对话"）的空白会话
  - 保护已重命名但未开始的会话，避免误覆盖
  - 智能判断会话状态

详见：[docs/RECENT_UPDATES_2025_01.md](docs/RECENT_UPDATES_2025_01.md)

---

**2024年11月** - SQLite 迁移与性能优化 🗄️
- ✅ **SQLite 数据库迁移**
  - 从 electron-store JSON 迁移到 SQLite
  - better-sqlite3 + Web Worker 架构
  - FTS5 全文搜索支持
  - 完整的数据迁移系统
- ✅ **边界防御实施**
  - 深度去除 Vue Proxy 包装
  - IPC 边界数据清理
  - 消除 structuredClone 错误
- ✅ **性能优化**
  - 标签页切换性能提升 75%（40-50ms → 10ms）
  - 持久化优化：UI 状态保存速度提升 40 倍
  - 智能增量保存策略

详见：
- [docs/SQLITE_ENHANCEMENT_IMPLEMENTATION.md](docs/SQLITE_ENHANCEMENT_IMPLEMENTATION.md)
- [docs/BOUNDARY_DEFENSE_IMPLEMENTATION.md](docs/BOUNDARY_DEFENSE_IMPLEMENTATION.md)
- [docs/PERFORMANCE_OPTIMIZATION_COMPLETE.md](docs/PERFORMANCE_OPTIMIZATION_COMPLETE.md)

---

**2024年11月** - 重要问题修复 🐛
- ✅ **编辑无回复提问时的边界处理**
  - 编辑未改动内容时不再生成冗余版本
  - 无回复的提问也可触发首次生成
- ✅ **删除提问分支时路径错误修复**
  - 删除分支后自动重建有效路径
  - 智能选择下一个可用分支并保持路径完整性
- ✅ **多模态模型重新生成时图片显示修复**
  - 统一处理多种图片格式（URL、base64、data URI、inline_data 等）
  - 支持 OpenRouter 各种模型的图片返回格式
  - 增强去重逻辑，避免重复渲染

详见：[docs/RECENT_FIXES_2025_11.md](docs/RECENT_FIXES_2025_11.md)

---

**2024年11月** - 代码质量提升 📝
- ✅ **代码注释完善**
  - ChatView.vue：新增 800+ 行详细注释（26% 覆盖率）
  - 清理 20+ 非关键调试日志，保留所有错误日志
  - 组件注释质量审查：12 个活跃组件全部通过
- ✅ **组件归档管理**
  - 归档 3 个未使用组件（HelloWorld、ModelSelector、StartupSplash）
  - 更新 tsconfig.json：排除 archived-components 目录
  - TypeScript 严格模式：零编译错误

详见：
- [docs/CHATVIEW_OPTIMIZATION_SUMMARY.md](docs/CHATVIEW_OPTIMIZATION_SUMMARY.md)
- [docs/ARCHIVED_COMPONENTS.md](docs/ARCHIVED_COMPONENTS.md)
- [docs/CLEANUP_SUMMARY.md](docs/CLEANUP_SUMMARY.md)

---

### 已完成功能 ✅

**核心功能**
- ✅ 分支化对话系统：支持树形对话历史和多版本回复切换
- ✅ 高级模型选择器：收藏、筛选、搜索、排序功能
- ✅ 消息编辑功能：双击编辑用户消息并重新生成 AI 回复
- ✅ 多模态支持：完整的图片上传、预览、编辑功能
- ✅ 项目管理系统：对话分类、筛选、移动
- ✅ 网络搜索集成：OpenRouter Web 搜索插件
- ✅ 自定义指令：系统提示词配置
- ✅ 采样参数配置：Temperature、Top-P、Top-K 等
- ✅ 思维链推理：支持推理模型

**架构优化**
- ✅ SQLite 数据库迁移：从 JSON 到 SQLite
- ✅ FTS5 全文搜索：中英文分词支持
- ✅ Web Worker 架构：数据库异步操作
- ✅ 边界防御机制：Vue Proxy 处理
- ✅ 性能优化：标签切换 75% 提升

**多提供商支持**
- ✅ ChatView 多提供商逻辑适配
- ✅ OpenRouter BaseURL 持久化
- ✅ Provider 切换自动刷新模型列表
- ✅ SSE 缓冲区溢出防护
- ✅ 速率限制友好提示
- ✅ API Key 格式校验
- ✅ 智能默认模型选择

**UI/UX 增强**
- ✅ 收藏模型滚动动画
- ✅ 智能菜单定位（Teleport + 防溢出）
- ✅ 自适应分位数滑块
- ✅ 系统默认应用打开图片
- ✅ 响应式布局优化

### 未来计划 🚀

**AI 能力增强**
- [ ] 支持更多 AI 提供商（Anthropic Claude API, Azure OpenAI, 本地模型）
- [ ] 流式思维链可视化显示
- [ ] 多模态增强（音频、视频支持）
- [ ] AI 辅助代码执行和调试
- [ ] 对话模板系统

**功能扩展**
- [ ] 对话导出/导入功能（JSON, Markdown, PDF, Word）
- [ ] 代码块一键复制增强
- [ ] 对话标签和标记系统
- [ ] 高级搜索和过滤
- [ ] 成本统计和使用量追踪
- [ ] 语音输入/输出支持（TTS/STT）
- [ ] 插件系统架构

**UI/UX 改进**
- [ ] 主题系统（暗色模式、自定义主题）
- [ ] 多语言支持（i18n）- 英语、中文、日语等
- [ ] 窗口布局自定义
- [ ] 快捷键系统完善
- [ ] 拖拽排序和组织

**性能和稳定性**
- [ ] 更大规模对话性能优化（10000+ 消息）
- [ ] 数据库索引优化
- [ ] 离线模式支持
- [ ] 自动备份和恢复
- [ ] 错误日志系统

**开发者体验**
- [ ] 完整的单元测试覆盖
- [ ] E2E 测试框架
- [ ] CI/CD 流水线
- [ ] 自动化文档生成
- [ ] 开发者 API 文档

---

## ❓ 常见问题（FAQ）

<details>
<summary><b>Q: 为什么选择 Starverse 而不是其他 AI 客户端？</b></summary>

**A:** Starverse 的独特优势：
- 🌳 **分支化对话系统**：探索不同对话路径，不丢失任何上下文
- 🔍 **强大的全文搜索**：快速找到历史对话内容
- 🤖 **多提供商支持**：一个应用访问所有主流 AI 模型
- 💾 **本地数据存储**：完全掌控您的数据隐私
- ⚡ **企业级性能**：经过深度优化，流畅体验

</details>

<details>
<summary><b>Q: 我的数据存储在哪里？</b></summary>

**A:** 所有数据都存储在您的本地计算机：
- **Windows**: `C:\Users\<用户名>\AppData\Roaming\starverse\`
- **macOS**: `~/Library/Application Support/starverse/`
- **Linux**: `~/.config/starverse/`

数据包括：
- SQLite 数据库文件（`chat.db`）
- 配置文件（electron-store）
- 完全离线可用，无需担心隐私泄露

</details>

<details>
<summary><b>Q: 如何清理所有聊天记录？</b></summary>

**A:** 提供多种清理方式：

**方法 1: 使用一键清理脚本**
```bash
# Windows
.\clear-all-data.bat

# PowerShell
.\clear-all-data.ps1

# Node.js
node scripts/clear-all-data-standalone.cjs
```

**方法 2: 手动删除**
删除数据目录中的 `chat.db*` 文件

详见：[数据清理指南](docs/DATA_CLEANUP_GUIDE.md)

</details>

<details>
<summary><b>Q: 支持哪些 AI 模型？</b></summary>

**A:** 支持的模型取决于您选择的提供商：

**Google Gemini**:
- Gemini 2.0 Flash (最新)
- Gemini 1.5 Pro / Flash
- Gemini Pro Vision (多模态)

**OpenRouter** (100+ 模型):
- OpenAI: GPT-4o, GPT-4 Turbo, o1
- Anthropic: Claude 3.5 Sonnet, Claude 3 Opus
- Google: Gemini Pro, Gemini Flash
- Meta: Llama 3.1, Llama 3.2
- 更多开源模型...

</details>

<details>
<summary><b>Q: 遇到 "better-sqlite3" 编译错误怎么办？</b></summary>

**A:** 这是原生模块编译问题，解决方法：

**Windows**:
```bash
# 确保安装了 Visual Studio Build Tools
npm install --global windows-build-tools

# 重新编译
npm run rebuild
```

**macOS/Linux**:
```bash
# 确保安装了编译工具
# macOS: xcode-select --install
# Ubuntu: sudo apt-get install build-essential

npm run rebuild
```

如果仍有问题，删除 `node_modules` 重新安装：
```bash
rm -rf node_modules package-lock.json
npm install
```

</details>

<details>
<summary><b>Q: 如何导出我的对话记录？</b></summary>

**A:** 目前支持：
- 📋 **复制消息内容**：右键点击消息
- 💾 **备份数据库**：复制 `chat.db` 文件

**即将支持**（路线图）：
- 导出为 Markdown 格式
- 导出为 JSON 格式
- 导出为 PDF 文档

</details>

<details>
<summary><b>Q: 应用占用多少存储空间？</b></summary>

**A:** 空间占用取决于使用情况：

- **应用本身**: ~200MB（包含 Electron 和依赖）
- **数据库**: 
  - 空数据库: ~100KB
  - 100 个对话: ~10MB
  - 1000 个对话: ~100MB
- **缓存**: 可通过清理脚本清除

SQLite 的高效存储使其比 JSON 文件节省约 40% 空间。

</details>

<details>
<summary><b>Q: 支持哪些操作系统？</b></summary>

**A:** 跨平台支持：

| 操作系统 | 版本要求 | 状态 |
|---------|---------|------|
| **Windows** | 10 及以上 | ✅ 完全支持 |
| **macOS** | 10.13 及以上 | ✅ 完全支持 |
| **Linux** | Ubuntu 18.04+, Fedora 32+ | ✅ 完全支持 |

</details>

<details>
<summary><b>Q: 如何贡献代码或报告问题？</b></summary>

**A:** 欢迎参与贡献！

**报告问题**:
1. 前往 [GitHub Issues](https://github.com/GuXinghai/starverse/issues)
2. 搜索是否已有类似问题
3. 创建新 Issue，详细描述问题和复现步骤

**贡献代码**:
1. Fork 本项目
2. 创建特性分支：`git checkout -b feature/AmazingFeature`
3. 提交更改：`git commit -m 'Add some AmazingFeature'`
4. 推送到分支：`git push origin feature/AmazingFeature`
5. 开启 Pull Request

详见：[贡献指南](#-贡献)

</details>

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
