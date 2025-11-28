# Starverse - 企业级 AI 对话桌面应用开发指南

现代化多线程架构的 Electron 应用，实现分支化对话系统、多提供商 AI 集成和全文搜索功能。

## 核心技术栈

### 框架与构建
- **Electron 38.6.0** + **Vue.js 3.4** (Composition API) + **TypeScript 5.2** (严格模式)
- **Vite 5.1** + **electron-vite 4.0** - 开发服务器与构建工具
- **Tailwind CSS 4.1** + **PostCSS 8.5** - 原子化样式系统

### 状态与数据
- **Pinia 3.0** - 模块化状态管理 (7个职责清晰的 Store)
- **better-sqlite3 12.4** - 本地 SQLite 数据库 (FTS5 全文搜索)
- **Worker Threads** - 数据库操作在独立线程执行，避免阻塞 UI
- **electron-store 11.0** - JSON 配置持久化

### AI 与渲染
- **多提供商集成** - Google Gemini (@google/generative-ai 0.24) + OpenRouter API
- **marked 16.4** - GFM Markdown 解析 + **dompurify 3.3** (XSS 防护)
- **highlight.js 11.11** - 200+ 语言语法高亮 + **katex 0.16** (LaTeX 公式)

### 工具与测试
- **@vueuse/core 14.0** - Vue 组合式函数工具集
- **Vitest 2.1** + **@testing-library/vue 8.1** - 单元测试 (jsdom 环境)
- **Storybook 8.6** - 组件开发与文档 (含 a11y 可访问性测试)

## 架构设计

### 三层分离架构

```
渲染进程 (src/)
  ├─ Vue 3 组件 + Pinia Store
  ├─ 通过 contextBridge 调用预加载脚本暴露的 API
  └─ 禁止直接访问 Node.js API (nodeIntegration: false)
       ↓ IPC 通信 (ipcRenderer/ipcMain)
主进程 (electron/)
  ├─ 应用生命周期管理 + 窗口控制
  ├─ IPC Handler 注册 (dbBridge, openRouterBridge)
  └─ Worker 线程管理器 (workerManager.ts)
       ↓ MessagePort 通信
Worker 线程 (infra/db/)
  ├─ SQLite 数据库操作 (better-sqlite3)
  ├─ Repository 模式数据访问层
  └─ FTS5 全文搜索引擎
```

**关键原则**:
- 所有数据库操作必须通过 Worker 线程执行
- IPC 传输的数据必须经过 `ipcSanitizer` 清理 Vue Proxy 对象
- 渲染进程通过 `contextBridge` 白名单访问主进程功能

### 模块化 Pinia Store 架构

```
useAppStore                  - 全局配置 (API Key, Provider, 主题)
  ├─ useConversationStore    - 对话 CRUD + 多标签页管理
  │    └─ useBranchStore     - 分支树状态 (版本切换, 路径计算)
  ├─ useModelStore           - 模型选择 + 参数配置
  ├─ usePersistenceStore     - 持久化调度器 (防抖保存)
  ├─ useProjectStore         - 项目分类管理
  └─ useProjectWorkspaceStore - 项目工作区状态
```

**耦合规则**:
- Store 间通过 `import` 直接调用，避免事件总线
- 复杂算法抽取到 `branchTreeHelpers.ts` 等辅助模块
- 优先使用 `computed` 而非 `getters` (Composition API 风格)

### 数据访问层 (Repository 模式)

位于 `infra/db/repo/` 的独立层，与 Electron 解耦:
- `convoRepo.ts` - 对话增删改查 + 批量操作
- `messageRepo.ts` - 消息存储 + 分支关系管理
- `searchRepo.ts` - FTS5 全文搜索 + 结果排序
- `projectRepo.ts` - 项目元数据管理

**设计意图**: 业务逻辑与数据库实现分离，便于单元测试和迁移

## 项目结构详解

### 主进程 (electron/)
```
main.ts                     - 应用入口, 窗口创建
preload.ts                  - contextBridge API 暴露
db/
  ├─ workerManager.ts       - Worker 生命周期管理
  └─ worker.ts              - Worker 线程入口
ipc/
  ├─ dbBridge.ts            - 数据库 IPC Handler
  └─ openRouterBridge.ts    - 流式 AI 响应 IPC Handler
services/
  └─ inappBrowser.ts        - 应用内浏览器服务
preload/
  └─ inapp-preload.ts       - 浏览器窗口预加载脚本
types/                      - 主进程 TypeScript 类型
```

### 渲染进程 (src/)
```
components/
  ├─ atoms/                 - 原子组件 (按钮, 输入框)
  ├─ molecules/             - 分子组件 (复合控件, 预留)
  ├─ organisms/             - 有机组件 (功能模块, 预留)
  ├─ templates/             - 页面模板
  ├─ chat/                  - 聊天子系统 (MessageList, ChatInput 等)
  ├─ ChatView.vue           - 主聊天界面 (1800+ 行核心组件)
  ├─ TabbedChatView.vue     - 多标签页管理
  ├─ ConversationList.vue   - 对话列表与搜索
  ├─ ProjectHome.vue        - 项目管理首页
  └─ AdvancedModelPickerModal.vue - 高级模型选择器
stores/                     - Pinia 状态管理 (7个模块)
composables/                - Vue 组合式函数 (10+ 个逻辑复用单元)
  ├─ useBranchNavigation.ts - 分支导航逻辑
  ├─ useMessageSending.ts   - 消息发送逻辑
  ├─ useScrollControl.ts    - 滚动控制
  └─ ...
services/
  ├─ aiChatService.js       - AI 服务路由器
  ├─ providers/             - AI 提供商实现 (Gemini, OpenRouter)
  ├─ chatPersistence.ts     - 聊天持久化服务
  ├─ searchService.ts       - 搜索服务 + DSL
  └─ db/                    - 数据库客户端封装 (IPC 调用)
types/                      - TypeScript 类型定义
  ├─ chat.ts, conversation.ts, store.ts
  └─ electron.d.ts          - Electron API 类型声明
utils/
  ├─ electronBridge.ts      - Electron API 桥接
  └─ ipcSanitizer.js        - IPC 数据清理 (移除 Vue Proxy)
```

### 基础设施层 (infra/)
```
db/
  ├─ worker.ts              - Worker 线程数据库操作实现
  ├─ schema.sql             - 数据库 Schema (FTS5 虚拟表)
  ├─ types.ts, validation.ts, errors.ts
  └─ repo/                  - Repository 模式数据访问层
      ├─ convoRepo.ts, messageRepo.ts
      ├─ projectRepo.ts, searchRepo.ts
      └─ (业务逻辑与数据库解耦)
```

### 测试与文档 (tests/ & docs/)
```
tests/
  ├─ unit/                  - 单元测试 (Vitest)
  │   ├─ stores/            - Store 测试
  │   └─ composables/       - Composable 测试
  └─ setup.ts               - 测试环境配置
docs/                       - 90+ 个架构与优化文档
  ├─ ARCHITECTURE_REVIEW.md
  ├─ OPENROUTER_INTEGRATION_SUMMARY.md
  └─ ... (功能实现与重构记录)
```

## 核心功能实现

### 分支化对话系统
- **树形对话历史**: 每条消息可创建多个子分支，支持版本切换和并行探索
- **分支导航**: `useBranchStore` 维护树状态，`MessageBranchController.vue` 提供 UI 导航
- **路径计算**: `branchTreeHelpers.ts` 实现树遍历、LCA 计算和路径查找算法

### 多提供商 AI 集成
- **服务路由器**: `aiChatService.js` 根据 `activeProvider` 动态切换 Gemini/OpenRouter
- **统一接口**: 所有 Provider 实现 `IAIProvider.ts` 定义的流式响应接口
- **流式处理**: SSE (Server-Sent Events) 解析，逐 token 追加到 UI

### SQLite FTS5 全文搜索
- **虚拟表**: `messages_fts` 使用 FTS5 引擎，支持 `MATCH` 查询
- **搜索 DSL**: `searchDsl.ts` 构建复杂查询条件 (项目筛选、日期范围等)
- **Worker 线程**: 所有搜索操作在 Worker 中执行，避免 UI 冻结

### 多模态支持
- **图片上传**: 支持拖拽/粘贴上传，转换为 Base64 发送给 AI
- **图片生成**: 支持 DALL-E、Stable Diffusion 等模型生成图片
- **附件管理**: `useAttachmentManager.ts` 处理附件生命周期

## 开发指南

### Vue.js 组件开发
- **Composition API**: 统一使用 `<script setup>` 语法，禁止 Options API
- **组件分层**: 遵循 Atomic Design (atoms → molecules → organisms → templates)
- **类型安全**: 所有 props 和 emits 必须定义 TypeScript 类型
- **Composable 优先**: 可复用逻辑抽取到 `composables/` 而非 mixin

### Pinia Store 开发规范
- **职责单一**: 每个 Store 管理独立领域，避免 God Object
- **跨 Store 调用**: 直接 `import` 其他 Store，不使用事件总线
- **持久化**: 通过 `usePersistenceStore` 统一调度，避免频繁 IPC
- **避免副作用**: Action 中禁止直接操作 DOM 或调用 alert

### 数据库操作规范
- **Worker 线程**: 所有数据库操作通过 `dbClient.query()` 路由到 Worker
- **Repository 模式**: 业务代码调用 Repository 方法，不写原始 SQL
- **事务支持**: 批量操作使用事务 (`BEGIN TRANSACTION` / `COMMIT`)
- **FTS5 搜索**: 使用 `MATCH` 而非 `LIKE`，性能差异显著

### IPC 通信规范
- **数据清理**: 发送前调用 `ipcSanitizer.sanitize()` 移除 Vue Proxy
- **错误处理**: IPC Handler 必须 try-catch，返回统一错误格式
- **超时控制**: 长时间操作需提供取消机制 (AbortController)
- **安全白名单**: 预加载脚本仅暴露必需 API，避免过度权限

### 样式开发规范
- **Tailwind 优先**: 95% 样式使用 Tailwind 工具类，避免自定义 CSS
- **响应式设计**: 移动端适配使用 `sm:` / `md:` / `lg:` 前缀
- **暗色模式**: 使用 `dark:` 前缀，配合 `useAppStore` 的主题状态
- **自定义颜色**: 在 `tailwind.config.js` 中扩展主题，不硬编码 hex 值

### 测试编写指南
- **单元测试**: Vitest + @testing-library/vue，覆盖 Store 和 Composable
- **测试隔离**: 每个测试用例独立 setup/teardown，避免状态污染
- **Mock 策略**: 使用 `vi.mock()` 模拟 IPC 调用和数据库操作
- **组件文档**: Storybook 用于组件展示和可访问性测试

## 安全最佳实践

### Electron 安全配置
- **contextIsolation**: 启用上下文隔离，渲染进程无法直接访问 Node.js
- **nodeIntegration**: 禁用 Node.js 集成，避免远程代码执行风险
- **webSecurity**: 启用 Web 安全策略，防止跨域攻击
- **CSP**: 配置内容安全策略，限制脚本来源

### IPC 安全机制
- **ipcSanitizer**: 清理 Vue Proxy 对象，避免序列化错误和内存泄漏
- **白名单机制**: 预加载脚本使用 `contextBridge.exposeInMainWorld()` 明确暴露 API
- **输入验证**: 主进程 IPC Handler 使用 `zod` 验证参数格式
- **权限隔离**: 不同功能使用不同 IPC 通道，避免权限混淆

### XSS 防护
- **DOMPurify**: 所有用户生成的 HTML 内容必须经过 `DOMPurify.sanitize()`
- **Markdown 渲染**: 使用 `marked` 的 `sanitizer` 选项或后处理清理
- **v-html 限制**: 尽量避免 `v-html`，优先使用组件化渲染

### API Key 管理
- **electron-store**: API Key 存储在加密的本地配置文件
- **环境变量**: 开发环境使用 `.env.local`，不提交到版本控制
- **传输加密**: 主进程与 Worker 线程间传输敏感数据时考虑加密

## 性能优化实践

### Worker 线程隔离
- **数据库操作**: 所有 SQLite 查询在 Worker 中执行，保持 UI 流畅
- **MessagePort 通信**: 使用结构化克隆算法传输数据，避免序列化开销
- **批量操作**: 合并多次数据库操作为单次事务，减少 IPC 往返

### 渲染性能优化
- **虚拟滚动**: 长对话列表使用虚拟滚动 (考虑使用 `vue-virtual-scroller`)
- **Markdown 缓存**: 已渲染的 Markdown 缓存 HTML，避免重复解析
- **代码高亮延迟**: 使用 `requestIdleCallback` 延迟语法高亮
- **防抖节流**: 搜索输入、滚动事件使用 `@vueuse/core` 的 `useDebounceFn`

### 状态管理优化
- **computed 缓存**: 优先使用 `computed` 而非 method，利用缓存机制
- **持久化防抖**: `usePersistenceStore` 使用 500ms 防抖，减少 IPC 频率
- **增量更新**: 大数据更新时使用增量序列化，避免全量保存

### 构建优化
- **代码分割**: Vite 自动分割，按需加载 (dynamic import)
- **Tree Shaking**: 避免导入整个库，使用具名导入 (`import { ref } from 'vue'`)
- **生产构建**: `electron-builder` 配置 asar 打包和 UPX 压缩

## 故障排查

### 常见问题
- **数据库锁定**: 确认 Worker 线程正确关闭，避免多实例冲突
- **IPC 超时**: 检查 `ipcSanitizer` 是否正确清理循环引用
- **Markdown 不渲染**: 验证 DOMPurify 配置，确保允许必要的 HTML 标签
- **Store 状态丢失**: 检查 `usePersistenceStore` 的保存逻辑和 electron-store 路径

### 调试技巧
- **主进程日志**: 使用 `console.log` 输出到终端 (不显示在 DevTools)
- **渲染进程**: 打开 DevTools (F12) 查看 Console 和 Vue DevTools
- **Worker 日志**: Worker 输出通过 `parentPort.postMessage()` 传回主进程
- **IPC 追踪**: 在 IPC Handler 中添加日志，追踪请求/响应流

### 性能分析
- **Vue DevTools**: Performance 标签查看组件渲染时间
- **Chrome DevTools**: Performance 录制分析帧率和长任务
- **SQLite EXPLAIN**: 使用 `EXPLAIN QUERY PLAN` 分析查询性能
- **Vitest Coverage**: 查看代码覆盖率，识别未测试路径

---

**参考资料**: 
- 详细架构文档见 `docs/ARCHITECTURE_REVIEW.md`
- AI 集成文档见 `docs/OPENROUTER_INTEGRATION_SUMMARY.md`
- 重构进度见 `REFACTOR_PROGRESS.md`
- 完整 README 见 `README.md` (2174 行)