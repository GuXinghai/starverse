# Pinia Store 架构文档

## 📦 Store 结构概览

项目采用**模块化 Store 架构**，将原有的单体 `chatStore.js` (1868 行) 拆分为 7 个职责清晰的模块：

```
src/stores/
├── index.ts                  (249 行) - 应用全局状态
├── conversation.ts           (433 行) - 对话管理
├── branch.ts                 (422 行) - 分支树操作
├── model.ts                  (265 行) - 模型管理
├── persistence.ts            (271 行) - 持久化调度
├── project.ts                (475 行) - 项目管理
├── projectWorkspaceStore.ts  (376 行) - 项目工作区
└── branchTreeHelpers.ts     (1140 行) - 树算法实现
```

**总计**: 8 个文件，~3,600 行代码

---

## 1️⃣ useAppStore (`index.ts`)

### 职责
- 应用全局配置管理
- API Key 和 Provider 管理
- 主题和 UI 设置

### 核心 State
```typescript
{
  apiKey: string                    // OpenRouter API Key
  selectedProvider: string          // 当前 Provider
  theme: 'light' | 'dark'          // 主题模式
  sidebarCollapsed: boolean        // 侧边栏状态
}
```

### 主要 Actions
- `saveApiKey(key: string)` - 保存 API Key
- `setProvider(provider: string)` - 切换 Provider
- `toggleSidebar()` - 切换侧边栏

---

## 2️⃣ useConversationStore (`conversation.ts`)

### 职责
- 对话 CRUD（创建、删除、重命名）
- 多标签页管理（打开、关闭、激活）
- 对话配置（草稿、Web 搜索、状态、标签）

### 核心 State
```typescript
{
  conversations: Conversation[]      // 所有对话
  openTabIds: string[]               // 打开的标签页 ID
  activeTabId: string | null         // 当前激活的标签页
  loadingConversationIds: Set<string> // 加载中的对话
}
```

### 主要 Actions
- `createConversation(name: string)` - 创建新对话
- `deleteConversation(id: string)` - 删除对话
- `openTab(id: string)` - 打开对话标签页
- `closeTab(id: string)` - 关闭对话标签页
- `setActiveTab(id: string)` - 切换激活标签页
- `updateDraft(id: string, draft: string)` - 更新输入草稿

### Computed
- `activeConversation` - 当前激活的对话对象
- `conversationMap` - 对话 ID 到对象的映射

---

## 3️⃣ useBranchStore (`branch.ts`)

### 职责
- 分支树核心操作（添加、删除、切换版本）
- Token 和图片流式追加
- 推理内容管理
- 消息路径计算

### 主要 Actions
- `addBranchToConversation(conversationId, parentBranchId, role, parts)` - 添加新分支
- `switchBranchVersion(conversationId, branchId, versionIndex)` - 切换版本
- `deleteBranchFromConversation(conversationId, branchId)` - 删除分支
- `appendTokenToConversation(conversationId, branchId, token)` - 追加 Token
- `getCurrentPathMessagesForConversation(conversationId)` - 获取当前路径消息

### 依赖
- 使用 `branchTreeHelpers.ts` 中的所有树操作函数

---

## 4️⃣ useModelStore (`model.ts`)

### 职责
- 模型列表管理
- 收藏模型管理
- 当前选中模型

### 核心 State
```typescript
{
  appModels: AppModel[]                                // 规范化后的模型列表（唯一模型类型）
  appModelsById: Map<string, AppModel>                 // O(1) 按 ID 访问
  favoriteModelIds: Set<string>                        // 收藏模型 ID
  selectedModelId: string                              // 当前选中模型
}
```

### 主要 Actions
- `setAppModels(models: AppModel[])` - 设置模型列表
- `loadAppModels()` - 从数据库加载模型列表
- `saveAppModels()` - 保存模型列表到数据库
- `clearModelTable()` - 仅清空模型表 (model_data)
- `toggleFavorite(modelId: string)` - 切换收藏状态
- `isFavorite(modelId: string)` - 检查收藏状态

---

## 5️⃣ usePersistenceStore (`persistence.ts`)

### 职责
- 脏数据追踪
- 自动保存调度（防抖）
- SQLite 交互封装

### 核心 State
```typescript
{
  dirtyConversationIds: Set<string>   // 待保存对话 ID
  savingConversationIds: Set<string>  // 保存中对话 ID
  lastSaveTime: number                 // 最后保存时间
}
```

### 主要 Actions
- `markConversationDirty(conversationId)` - 标记对话为脏
- `saveConversation(conversationId)` - 保存单个对话
- `saveAllDirtyConversations()` - 保存所有脏对话
- `loadAllConversations()` - 加载所有对话

### 防抖策略
- **快速保存**: 300ms 防抖，用于频繁操作（如打字）
- **长期保存**: 2000ms 防抖，用于批量操作

---

## 6️⃣ useProjectStore (`project.ts`)

### 职责
- 项目 CRUD
- 活动项目管理
- 对话与项目关联管理

### 核心 State
```typescript
{
  projects: Project[]               // 所有项目
  activeProjectId: string | null    // 当前激活项目
  dirtyProjectIds: Set<string>      // 待保存项目 ID
}
```

### 主要 Actions
- `createProject(name: string)` - 创建新项目
- `deleteProject(id: string)` - 删除项目
- `setActiveProject(id: string)` - 设置活动项目
- `assignConversationToProject(conversationId, projectId)` - 关联对话到项目

---

## 7️⃣ branchTreeHelpers (`branchTreeHelpers.ts`)

### 职责
- 分支树算法实现
- 树形数据结构操作
- 序列化和反序列化

### 核心函数
- `addBranch(tree, parentId, role, parts)` - 添加分支
- `switchVersion(tree, branchId, versionIndex)` - 切换版本
- `deleteBranch(tree, branchId)` - 删除分支
- `getCurrentPathMessages(tree)` - 获取当前路径
- `serializeTree(tree)` - 序列化树
- `deserializeTree(json)` - 反序列化树

---

## 💡 使用示例

### 在 ChatView 组件中使用

```vue
<script setup lang="ts">
import { useConversationStore } from '../stores/conversation'
import { useBranchStore } from '../stores/branch'
import { useModelStore } from '../stores/model'
import { usePersistenceStore } from '../stores/persistence'

const conversationStore = useConversationStore()
const branchStore = useBranchStore()
const modelStore = useModelStore()
const persistenceStore = usePersistenceStore()

// 获取当前对话
const conversation = computed(() => 
  conversationStore.activeConversation
)

// 发送消息
const sendMessage = async () => {
  const conversationId = conversationStore.activeTabId
  if (!conversationId) return
  
  // 添加用户分支
  branchStore.addBranchToConversation(
    conversationId,
    null, // parentId
    'user',
    [{ type: 'text', text: userInput.value }]
  )
  
  // 标记为脏，触发自动保存
  persistenceStore.markConversationDirty(conversationId)
}
</script>
```

---

## 🔄 Store 之间的依赖关系

```
┌─────────────────┐
│   AppStore      │  (全局配置)
└─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│ ConversationStore│────→│ PersistenceStore│
└────────┬────────┘     └─────────────────┘
         │
         ↓
┌─────────────────┐     ┌─────────────────┐
│  BranchStore    │────→│branchTreeHelpers│
└─────────────────┘     └─────────────────┘

┌─────────────────┐
│   ModelStore    │  (独立模块)
└─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│  ProjectStore   │────→│ ConversationStore│
└─────────────────┘     └─────────────────┘
```

### 依赖说明
- **ConversationStore**: 核心存储，被其他 Store 依赖
- **BranchStore**: 依赖 ConversationStore 和 PersistenceStore
- **PersistenceStore**: 独立的持久化层
- **ProjectStore**: 依赖 ConversationStore 进行对话关联
- **ModelStore**: 独立模块，无依赖

---

## 📝 最佳实践

### 1. 使用 Computed 而非直接访问
```typescript
// ✅ 推荐
const activeConv = computed(() => conversationStore.activeConversation)

// ❌ 不推荐
const activeConv = conversationStore.conversations.find(...)
```

### 2. 组合多个 Store
```typescript
// 在一个组件中组合使用多个 Store
const conversationStore = useConversationStore()
const branchStore = useBranchStore()
const persistenceStore = usePersistenceStore()

const handleAction = () => {
  // 1. 操作数据
  branchStore.addBranchToConversation(...)
  
  // 2. 标记脏数据
  persistenceStore.markConversationDirty(conversationId)
}
```

### 3. 避免循环依赖
- Store 之间避免相互导入
- 使用事件或共享的 composable 进行通信

---

## 🚀 性能优化

### 1. 防抖保存
`PersistenceStore` 使用防抖策略，避免频繁保存：
- 输入时：300ms 防抖
- 批量操作：2000ms 防抖

### 2. 计算属性缓存
使用 `computed` 自动缓存计算结果，避免重复计算

### 3. Set/Map 数据结构
- `favoriteModelIds: Set<string>` - O(1) 查找
- `appModelsById: Map<string, AppModel>` - O(1) 访问

---

## 📚 相关文档
- [分支树算法文档](./branchTreeHelpers.ts) - 树操作详解
- [类型定义](../types/store.ts) - TypeScript 类型
- [持久化服务](../services/chatPersistence.ts) - SQLite 层
  </div>
</template>
```

## 自动加载 API Key

在 `main.ts` 中，应用启动时会自动初始化 Pinia。
在任何需要使用 API Key 的组件的 `onMounted` 钩子中调用 `store.initializeStore()` 即可加载已保存的 API Key。

当前已在 `SettingsView.vue` 中实现了这个功能。
