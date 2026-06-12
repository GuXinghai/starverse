# Starverse 架构总览

> **Status**: active
> **Agent use**: read for layer boundaries, ownership, and canonical entry paths
> **Do not use as**: exhaustive file inventory or a substitute for implementation-specific docs

> **最后更新**: 2025年12月3日  
> **架构版本**: 1.0.0

---

## 设计理念

Starverse 采用**三层分离架构**，结合 Electron 的安全最佳实践和现代前端开发模式：

- **进程隔离**: 渲染进程、主进程、Worker 线程职责清晰
- **类型安全**: TypeScript 严格模式，减少运行时错误
- **模块化**: Pinia Store + Repository 模式，职责单一
- **性能优先**: Worker 线程数据库操作，防抖持久化，虚拟滚动

---

## 三层架构

```
┌─────────────────────────────────────────────────────────────┐
│  渲染进程 (Renderer Process) - src/                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Vue 3 UI   │  │ Pinia Stores │  │  Services    │       │
│  │  Components  │──│  7个模块化   │──│  AI/DB/搜索  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                  │                  │              │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                             │
                    IPC Bridge (preload.ts)
                             │
┌────────────────────────────┴──────────────────────────────────┐
│  主进程 (Main Process) - electron/                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ 应用生命周期  │  │  IPC Handler │  │ Worker管理器  │        │
│  │  窗口控制    │──│  dbBridge    │──│ 线程池调度    │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│         │                  │                  │               │
└─────────┼──────────────────┼──────────────────┼───────────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                             │
                    MessagePort 通信
                             │
┌────────────────────────────┴──────────────────────────────────┐
│  Worker 线程 (Worker Threads) - infra/db/                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ SQLite 操作  │  │  Repository  │  │  FTS5 搜索   │        │
│  │ better-sqlite│──│   数据访问   │──│  全文检索    │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└────────────────────────────────────────────────────────────────┘
```

---

## 项目结构

### 渲染进程 (src/)

```
src/
├── App.vue                   # 根组件
├── main.ts                   # Vue 应用入口
├── style.css                 # 全局样式（Tailwind v4 @theme）
├── constants/                # 应用常量
│
├── ui-app/                   # 主应用 UI 层（页面级组件）
│   ├── AppChatApp.vue       # 核心聊天应用主组件
│   ├── components/          # 高阶 UI 组件
│   │   ├── ChatAppComposer.vue
│   │   ├── ConversationList.vue
│   │   ├── ModelPickerDialog.vue
│   │   ├── SettingsModal.vue
│   │   └── ...
│   ├── app/                 # 应用业务逻辑（Composables）
│   │   ├── appChatApp.logic.ts       # 主应用核心编排（~6.7k 行）
│   │   ├── useChatSession.ts
│   │   ├── useLiveStreamController.ts
│   │   ├── useDiagnostics.ts
│   │   └── useSettingsBindings.ts
│   └── prefs/               # 用户偏好
│
├── ui-kit/                   # 可复用 UI 组件库
│   └── chat/                # 聊天 UI 基础组件
│       ├── ChatComposer.vue
│       ├── ChatTranscript.vue
│       ├── ChatMessageBubble.vue
│       ├── ChatReasoningPanel.vue
│       ├── ChatStatusBar.vue
│       └── richtext/        # 富文本渲染系统（streamRenderer + finalRenderer）
│
├── next/                     # 领域驱动业务逻辑（DDD 架构）
│   ├── branch/              # 分支管理领域
│   ├── convo/               # 对话领域
│   ├── message/             # 消息领域
│   ├── modelCatalog/        # 模型目录同步、查询
│   ├── modelPrefs/          # 模型偏好
│   ├── openrouter/          # OpenRouter 集成（Send Plan 序列化等）
│   ├── persistence/         # 持久化服务
│   ├── project/             # 项目管理领域
│   ├── search/              # 全文搜索
│   ├── settings/            # 设置管理
│   └── streaming/           # 流式响应处理
│
└── shared/                   # 跨层共享模块
    ├── composables/         # 通用 Vue Composables
    ├── ipc/                 # IPC 通信封装
    ├── files/               # 文件资产共享类型（fileTypes, sendPlanTypes）
    └── security/            # 安全工具
```

### 主进程 (electron/)

```
electron/
├── main.ts                  # 应用入口，窗口创建
├── preload.ts               # contextBridge API 暴露
│
├── db/                      # 数据库层
│   ├── workerManager.ts     # Worker 生命周期管理
│   └── worker.ts            # Worker 线程入口
│
├── ipc/                     # IPC 通信层（9 个专职模块）
│   ├── registerIpc.ts       # IPC 注册入口
│   ├── dbBridge.ts          # 数据库 IPC Handler
│   ├── openRouterStreamBridge.ts  # 流式 AI 响应 IPC Handler
│   ├── storeIpc.ts          # 配置存储 IPC
│   ├── shellIpc.ts          # Shell 命令 IPC
│   ├── imageIpc.ts          # 图片处理 IPC
│   ├── dialogIpc.ts         # 系统对话框 IPC
│   ├── inappBrowserIpc.ts   # 应用内浏览器 IPC
│   └── netExpIpc.ts         # 网络实验 IPC
│
├── modelCatalog/            # 主进程模型目录管理
├── jobs/                    # 后台定时任务
├── config/                  # 主进程配置
├── windows/                 # 窗口管理
└── services/                # 主进程服务
    └── inappBrowser.ts      # 应用内浏览器服务
```

### 基础设施层 (infra/)

```
infra/
├── db/                      # 数据库基础设施
│   ├── worker.ts            # Worker 线程数据库操作实现
│   ├── schema.sql           # 数据库 Schema（FTS5虚拟表）
│   ├── types.ts             # 数据库类型定义
│   ├── validation.ts        # Zod 数据验证
│   └── repo/                # Repository 模式数据访问层
│       ├── convoRepo.ts     # 对话增删改查
│       ├── messageRepo.ts   # 消息存储 + 分支关系
│       ├── projectRepo.ts   # 项目元数据管理
│       └── searchRepo.ts    # FTS5 全文搜索
│
└── files/                   # 文件管道服务层
    ├── sendPlanService.ts   # Send Plan 三层门禁
    └── derivativeJobService.ts  # 衍生任务服务
```

---

## 核心设计决策

### 1. 为什么使用 Worker 线程？

**问题**: SQLite 同步操作会阻塞主进程和渲染进程的事件循环

**解决方案**: 
- 数据库操作在独立的 Worker 线程执行
- 通过 `MessagePort` 与主进程通信
- 渲染进程通过 IPC 间接调用 Worker

**效果**: UI 始终流畅，即使执行大量数据库操作

详见: [决策记录 - 为什么使用 SQLite Worker 线程](../decisions/003-sqlite-worker-thread.md)

---

### 2. 为什么使用 Pinia 模块化 Store？

**问题**: 单个巨型 Store（2500+ 行）难以维护和测试

**解决方案**:
- 拆分为 7 个职责单一的 Store
- Store 间通过 `import` 直接调用，避免事件总线
- 使用 `computed` 而非 `getters`（Composition API 风格）

**Store 职责划分**:
```
useAppStore          → 全局配置（API Key、Provider、主题）
  ├─ useConversationStore → 对话 CRUD + 多标签页
  │    └─ useBranchStore  → 分支树状态（版本切换、路径计算）
  ├─ useModelStore        → 模型选择 + 参数配置
  ├─ usePersistenceStore  → 持久化调度器（防抖保存）
  ├─ useProjectStore      → 项目分类管理
  └─ useProjectWorkspaceStore → 项目工作区状态
```

---

### 3. 为什么使用 Repository 模式？

**问题**: 业务逻辑与数据库实现耦合，难以单元测试

**解决方案**:
- `infra/db/repo/` 提供独立的数据访问层
- Repository 与 Electron 解耦，可在 Node.js 环境测试
- 业务代码调用 Repository 方法，不直接写 SQL

**示例**:
```typescript
// Not recommended: 直接写 SQL
const result = await db.query('SELECT * FROM conversations WHERE id = ?', [id])

// Recommended: 使用 Repository
import { convoRepo } from '@/infra/db/repo'
const conversation = await convoRepo.getById(id)
```

---

### 4. 为什么采用策略模式实现多提供商？

**问题**: 支持多个 AI 提供商（Gemini, OpenRouter），需灵活切换

**解决方案**:
- `next/openrouter/` 作为 OpenRouter 发送链路统一入口
- 提供商能力通过 DDD 领域模块（`next/modelCatalog/`、`next/openrouter/`）管理
- 根据 `activeProvider` 路由至对应适配逻辑

详见: [决策记录 - 为什么采用策略模式](../decisions/005-multi-provider-strategy.md)

---

## 数据流

### 用户发送消息的完整流程

```
用户输入 → ChatAppComposer.vue（+ 附件入口）
    ↓
appChatApp.logic.ts → send preflight
    ↓（有附件时调用 Send Plan）
1. 准备上下文（conversationId, generationToken）
2. 前置检查（API Key, 并发生成）
3. buildMessages() + send plan 序列化
    ↓ IPC call
主进程 openRouterStreamBridge → Worker → SQLite INSERT
    ↓
4. 调用 AI 服务
next/openrouter/ → OpenRouter SSE 流式响应
    ↓
5. 逐 token 追加到 UI（ui-kit/chat/ 组件）
    ↓
6. 流式响应结束，更新数据库
    ↓ IPC call
主进程 dbBridge → Worker 线程 → SQLite UPDATE
    ↓
7. 持久化防抖触发（50ms）
next/persistence/ → scheduleSave()
    ↓ IPC call
主进程 dbBridge → Worker 线程 → 批量保存
```

---

## 安全机制

### Electron 安全配置

```typescript
// electron/main.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,        // 上下文隔离
    nodeIntegration: false,        // 禁用 Node.js 集成
    webSecurity: true,             // 启用 Web 安全
    preload: path.join(__dirname, '../preload/index.js')
  }
})
```

### IPC 白名单机制

```typescript
// electron/preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  // 仅暴露必需的 API
  db: {
    query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
    execute: (sql, params) => ipcRenderer.invoke('db:execute', sql, params)
  },
  openRouter: {
    streamChat: (options) => ipcRenderer.invoke('openrouter:stream-chat', options)
  }
})
```

### XSS 防护

```typescript
// 所有用户生成的 HTML 内容经过 DOMPurify 清理
import DOMPurify from 'dompurify'

const cleanHtml = DOMPurify.sanitize(userGeneratedHtml, {
  ALLOWED_TAGS: ['p', 'b', 'i', 'code', 'pre', 'a'],
  ALLOWED_ATTR: ['href', 'class']
})
```

---

## 性能优化

### 1. Worker 线程隔离
- **问题**: SQLite 同步操作阻塞 UI
- **方案**: 数据库操作在 Worker 线程执行
- **效果**: UI 始终 60fps

### 2. 持久化防抖
- **问题**: 频繁 IPC 通信导致性能下降
- **方案**: 500ms 防抖，合并多次保存为单次批量操作
- **效果**: 减少 75% IPC 调用

### 3. Markdown 渲染缓存
- **问题**: 重复渲染相同消息浪费 CPU
- **方案**: 缓存已渲染的 HTML，使用消息 ID 作为 key
- **效果**: 长对话滚动性能提升 60%

### 4. 虚拟滚动（计划中）
- **问题**: 长对话（1000+ 消息）DOM 节点过多
- **方案**: 使用 `vue-virtual-scroller` 仅渲染可见区域
- **预期**: 支持 10000+ 消息的流畅滚动

详见: [性能优化实现](../guides/PERFORMANCE_OPTIMIZATION_IMPLEMENTATION.md)

---

## 测试架构

### 测试入口

测试使用 Vitest，分布在代码邻近目录：

- `src/**/*.test.ts` — UI 组件与应用逻辑测试
- `infra/**/*.test.ts` — Repository、Send Plan、文件管道测试
- `scripts/gates/` — 治理门禁测试（b_gate, tc 系列）

### 组件文档 (Storybook)

Storybook 配置在项目根目录，组件故事分布在 `src/` 中。

---

## 相关文档

- [文档导航中心](../guides/INDEX.md)
- [OpenRouter 集成架构](OPENROUTER_INTEGRATION_SUMMARY.md)
- [统一生成架构](UNIFIED_GENERATION_ARCHITECTURE.md)
- [File Pipeline 入口](../file-pipeline/README.md)
- [架构决策记录](../decisions/README.md)

---

## 架构演进

### v0.0.0 (当前版本)
- complete: 三层分离架构
- complete: Pinia 模块化 Store
- complete: Worker 线程数据库
- complete: 多提供商 AI 集成

### v0.1.0 (计划中)
- [ ] appChatApp.logic.ts 拆分为独立 composables
- [ ] 虚拟滚动支持长对话
- [ ] 完整的单元测试覆盖
- [ ] API 文档自动生成

---

**维护者**: @GuXinghai  
**最后审查**: 2025年12月3日
