# TODO 1.3: useConversationSearch Composable - 详细实施计划

> **创建时间**: 2025-11-29  
> **风险等级**: 🟢 低  
> **预计时间**: 3-4 小时  
> **依赖**: 需要 `runFulltextSearch` 和 `SearchDslError` from searchService

---

## 📋 代码分析摘要

### 需要迁移的代码位置

1. **搜索状态变量** (150-170 行)
   - `searchQuery`, `rawSearchQuery`, `normalizedQuery`
   - `searchInTitle`, `searchInContent`
   - `contentSearchHits`, `contentSearchLoading`, `contentSearchMessage`
   - `contentSearchMessageType`, `contentSearchActive`, `contentSearchMessageClass`

2. **搜索逻辑函数** (800-850 行)
   - `conversationMatchesContent()` - 树遍历搜索
   - `buildSearchScopes()` - 构建搜索范围

3. **全文搜索 watch** (880-930 行)
   - 异步全文搜索逻辑
   - 竞态条件处理 (`contentSearchRequestId`)
   - 错误处理和状态更新

### 依赖关系图

```
useConversationSearch
  ├─ 输入: searchQuery (用户输入)
  ├─ 输入: searchInTitle, searchInContent (搜索范围开关)
  ├─ 依赖: runFulltextSearch (外部服务)
  ├─ 依赖: SearchDslError (错误类型)
  └─ 输出: 
      ├─ contentSearchHits (命中的对话ID集合)
      ├─ contentSearchLoading (加载状态)
      ├─ contentSearchMessage (提示信息)
      └─ conversationMatchesContent() (内容匹配函数)
```

---

## 🎯 分步实施计划

### Step 1: 创建基础结构 (30 分钟)

**文件**: `src/composables/useConversationSearch.ts`

**任务清单**:
- [ ] 创建文件并添加 JSDoc 文档头
- [ ] 定义 TypeScript 类型:
  ```typescript
  export type SearchMessageTone = 'info' | 'warning' | 'error'
  
  export interface ConversationSearchState {
    searchQuery: Ref<string>
    searchInTitle: Ref<boolean>
    searchInContent: Ref<boolean>
    contentSearchHits: Ref<Set<string>>
    contentSearchLoading: Ref<boolean>
    contentSearchMessage: Ref<string>
    contentSearchMessageType: Ref<SearchMessageTone>
  }
  
  export interface ConversationRecord {
    id: string
    title: string
    tree?: {
      branches?: Map<string, any> | Record<string, any>
      currentPath?: string[]
    }
  }
  ```
- [ ] 定义 composable 函数签名:
  ```typescript
  export function useConversationSearch() {
    // 实现
  }
  ```

### Step 2: 迁移搜索状态 (30 分钟)

**任务清单**:
- [ ] 从 ConversationList.vue 150-170 行复制状态变量
- [ ] 创建所有 ref 和 computed:
  ```typescript
  const searchQuery = ref('')
  const rawSearchQuery = computed(() => searchQuery.value.trim())
  const normalizedQuery = computed(() => rawSearchQuery.value.toLowerCase())
  const searchInTitle = ref(true)
  const searchInContent = ref(false)
  const contentSearchHits = ref<Set<string>>(new Set())
  const contentSearchLoading = ref(false)
  const contentSearchMessage = ref('')
  const contentSearchMessageType = ref<SearchMessageTone>('info')
  ```
- [ ] 创建计算属性:
  ```typescript
  const contentSearchActive = computed(() => 
    searchInContent.value && rawSearchQuery.value.length > 0
  )
  const contentSearchMessageClass = computed(() => {
    switch (contentSearchMessageType.value) {
      case 'warning': return 'text-yellow-600'
      case 'error': return 'text-red-600'
      default: return 'text-gray-500'
    }
  })
  ```

### Step 3: 迁移搜索工具函数 (45 分钟)

**任务清单**:
- [ ] 迁移 `buildSearchScopes()` 函数:
  ```typescript
  const buildSearchScopes = () => {
    const scopes = {
      title: searchInTitle.value,
      content: searchInContent.value
    }
    if (!scopes.title && !scopes.content) {
      scopes.title = true
    }
    return scopes
  }
  ```
- [ ] 迁移 `conversationMatchesContent()` 函数 (800-850 行)
  - 注意: 此函数依赖 `contentSearchActive` 和 `contentSearchHits`
  - 需要接收 `conversation` 和 `query` 参数
  - 包含复杂的树遍历逻辑
- [ ] 添加 `resetContentSearch()` 辅助函数:
  ```typescript
  const resetContentSearch = () => {
    contentSearchHits.value = new Set()
    contentSearchMessage.value = ''
    contentSearchMessageType.value = 'info'
    contentSearchLoading.value = false
  }
  ```

### Step 4: 迁移全文搜索 watch (60 分钟)

**任务清单**:
- [ ] 导入依赖:
  ```typescript
  import { watch } from 'vue'
  import { runFulltextSearch, SearchDslError } from '../services/searchService'
  ```
- [ ] 迁移竞态条件处理逻辑 (使用 `contentSearchRequestId`)
- [ ] 复制完整的 watch 代码 (880-930 行):
  ```typescript
  let contentSearchRequestId = 0
  
  watch(
    [() => rawSearchQuery.value, searchInContent],
    async ([query, searchContent]) => {
      // ... 实现
    },
    { immediate: true }
  )
  ```
- [ ] 保留错误处理逻辑:
  - SearchDslError 类型检查
  - 通用错误处理
  - 请求 ID 验证

### Step 5: 返回公共 API (15 分钟)

**任务清单**:
- [ ] 定义返回对象:
  ```typescript
  return {
    // 状态
    searchQuery,
    searchInTitle,
    searchInContent,
    contentSearchHits,
    contentSearchLoading,
    contentSearchMessage,
    contentSearchMessageType,
    contentSearchMessageClass,
    
    // 计算属性
    rawSearchQuery,
    normalizedQuery,
    contentSearchActive,
    
    // 方法
    conversationMatchesContent,
    buildSearchScopes,
    resetContentSearch
  }
  ```
- [ ] 添加完整的 JSDoc 注释说明每个导出项

### Step 6: 集成到 ConversationList.vue (30 分钟)

**任务清单**:
- [ ] 在 ConversationList.vue 顶部导入:
  ```typescript
  import { useConversationSearch } from '../composables/useConversationSearch'
  ```
- [ ] 在状态声明区域使用 composable:
  ```typescript
  // ✅ TODO 1.3 已完成: 使用 useConversationSearch composable
  const {
    searchQuery,
    searchInTitle,
    searchInContent,
    contentSearchHits,
    contentSearchLoading,
    contentSearchMessage,
    contentSearchMessageType,
    contentSearchMessageClass,
    rawSearchQuery,
    normalizedQuery,
    contentSearchActive,
    conversationMatchesContent,
    buildSearchScopes
  } = useConversationSearch()
  ```
- [ ] 删除原有的状态声明 (150-170 行)
- [ ] 删除原有的函数定义 (800-850 行, 880-930 行)
- [ ] 删除 `let contentSearchRequestId = 0` 和 `resetContentSearch()`
- [ ] 保留 `filteredConversations` computed (它依赖搜索状态)

### Step 7: 测试和验证 (30 分钟)

**任务清单**:
- [ ] 在 ConversationList.vue 中手动测试:
  - [ ] 输入搜索词，验证标题搜索
  - [ ] 勾选"搜索内容"，验证全文搜索
  - [ ] 验证加载状态显示
  - [ ] 验证错误提示显示
  - [ ] 验证空结果提示
- [ ] 检查 TypeScript 编译无错误
- [ ] 检查浏览器控制台无警告
- [ ] 验证搜索性能 (使用 Chrome DevTools Performance)

### Step 8: Git 提交 (10 分钟)

**任务清单**:
- [ ] 暂存文件:
  ```bash
  git add src/composables/useConversationSearch.ts
  git add src/components/ConversationList.vue
  ```
- [ ] 提交:
  ```bash
  git commit -m "refactor(TODO 1.3): extract useConversationSearch composable
  
  - Create src/composables/useConversationSearch.ts
  - Move search state: searchQuery, searchInTitle, searchInContent
  - Move search logic: conversationMatchesContent, buildSearchScopes
  - Move fulltext search watch with race condition handling
  - Export SearchMessageTone type
  - Risk: LOW - self-contained search logic with clear boundaries"
  ```

---

## ⚠️ 注意事项

### 1. 树遍历性能问题
`conversationMatchesContent` 函数包含嵌套循环遍历分支树，这是性能热点。

**当前不优化的原因**:
- TODO 1 专注于"提取"，不改变逻辑
- TODO 8 专门负责性能优化
- 保持重构步骤清晰独立

**未来优化方向** (TODO 8):
- 使用 WeakMap 缓存搜索结果
- 提前判断 branches 类型，避免重复检测
- 考虑 Web Worker 处理大量对话搜索

### 2. 竞态条件处理
当前使用 `contentSearchRequestId` 递增 ID 处理竞态条件。

**为什么不立即改为 AbortController?**
- TODO 1 的目标是"零风险迁移"
- AbortController 需要修改 `runFulltextSearch` 服务接口
- 注释中已标记未来改进方向

**改进时机**: TODO 8 性能优化阶段

### 3. immediate: true 的影响
watch 的 `immediate: true` 会在组件加载时立即执行一次。

**问题**: 
- 如果用户没有输入搜索词，会触发空查询
- 但代码中有 `if (!searchContent || !query)` 保护

**评估**: 当前实现安全，可以保持不变

### 4. 类型定义位置
`SearchMessageTone` 类型当前定义在 composable 中。

**考虑**: 
- 是否应该移到 `src/types/conversation.ts`?
- 当前只在搜索功能使用，暂时保持在 composable 中
- 如果未来其他地方需要，再重构到共享类型文件

---

## 🎯 成功标准

- [ ] `useConversationSearch.ts` 文件创建完成
- [ ] 所有搜索状态和逻辑已迁移
- [ ] ConversationList.vue 代码减少 ~100 行
- [ ] TypeScript 编译通过，无类型错误
- [ ] 手动测试所有搜索功能正常
- [ ] Git 提交干净，commit message 清晰
- [ ] 代码保持与原有逻辑 100% 一致

---

## 📊 预期结果

### 代码减少
- **ConversationList.vue**: 1813 行 → ~1710 行 (-103 行)
- **新增文件**: `useConversationSearch.ts` (~150 行)

### 职责清晰度
- ✅ 搜索逻辑完全独立
- ✅ 可在其他组件复用
- ✅ 便于单独测试
- ✅ 便于未来性能优化

### 后续工作铺垫
- 为 TODO 8 性能优化做好准备
- 为 TODO 4 (ConversationListItems) 提供清晰的搜索接口
- 为 TODO 9 单元测试提供清晰的测试目标

---

**执行顺序**: 严格按照 Step 1 → Step 8 顺序执行，每个 Step 完成后检查清单  
**回滚策略**: 每个 Step 完成后可以独立回滚，Git commit 仅在 Step 8 执行
