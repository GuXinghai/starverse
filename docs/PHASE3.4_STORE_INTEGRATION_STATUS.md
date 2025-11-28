# Phase 3.4 Store 集成完成报告

## ✅ 已完成工作

### 1. 新 Stores 集成到 ChatView.vue

**Import 添加：**
```typescript
import { useConversationStore } from '../stores/conversation'
import { useBranchStore } from '../stores/branch'
import { useModelStore } from '../stores/model'
import { usePersistenceStore } from '../stores/persistence'
```

**Store 实例初始化：**
```typescript
const conversationStore = useConversationStore()
const branchStore = useBranchStore()
const modelStore = useModelStore()
const persistenceStore = usePersistenceStore()
```

### 2. 类型定义完善

**更新 `src/types/store.ts` 中的 Conversation 接口：**

添加了以下字段以兼容现有代码：
- `webSearchEnabled?: boolean`
- `webSearchLevel?: WebSearchLevel`
- `reasoningPreference?: ReasoningPreference`
- `generationStatus?: 'idle' | 'sending' | 'receiving'`
- `customInstructions?: string`

### 3. 核心方法替换

**已替换的 API：**
- ✅ `currentConversation` - 使用 `conversationStore.conversations.find()`
- ✅ `getDisplayMessages` - 使用 `branchStore.getDisplayMessages()`

---

## 📊 当前状态

### 编译错误状态
- ❌ 类型错误：**0 个**
- ⚠️ 未使用变量警告：**4 个**（branchStore, modelStore, persistenceStore, scrollControl）
  - 这些是正常的，因为我们刚刚添加了它们，稍后会使用

### 新旧代码共存
- ✅ 新 Stores 已导入和初始化
- ✅ 旧 chatStore 保留（渐进式迁移）
- ✅ 类型定义已统一

---

## 🎯 下一步工作

### 优先级 1: 替换关键 chatStore 调用

需要替换的核心方法（按优先级排序）：

1. **消息相关**（最高优先级）
   - `chatStore.addMessageBranch()` → `branchStore.addMessageBranch()`
   - `chatStore.appendToken()` → `branchStore.appendToken()`
   - `chatStore.appendReasoningDetail()` → `branchStore.appendReasoningDetail()`
   - `chatStore.appendReasoningStreamText()` → `branchStore.appendReasoningStreamingText()`
   - `chatStore.patchCurrentBranchMetadata()` → `branchStore.patchMetadata()`

2. **对话配置**（中优先级）
   - `chatStore.setConversationWebSearchEnabled()` → `conversationStore.setWebSearchEnabled()`
   - `chatStore.setConversationWebSearchLevel()` → `conversationStore.setWebSearchLevel()`
   - `chatStore.setConversationReasoningPreference()` → `conversationStore.setReasoningPreference()`
   - `chatStore.setConversationSamplingParameters()` → `conversationStore.setSamplingParameters()`

3. **草稿管理**（中优先级）
   - `chatStore.updateConversationDraft()` → `conversationStore.updateConversationDraft()`

4. **生成状态**（中优先级）
   - `chatStore.setConversationGenerationStatus()` → `conversationStore.setGenerationStatus()`

5. **模型相关**（低优先级）
   - `chatStore.availableModelsMap` → `modelStore.modelDataMap`
   - `chatStore.selectedModel` → `modelStore.selectedModelId`

### 优先级 2: 删除旧 chatStore

完成所有替换后：
1. 移除 `import { useChatStore } from '../stores/chatStore'`
2. 移除 `const chatStore = useChatStore()`
3. 验证应用功能正常

---

## 📝 实施策略

### 建议采用批量替换策略

#### 阶段 1: 分支树操作（30个调用）
```typescript
// 查找所有
chatStore.addMessageBranch → branchStore.addMessageBranch
chatStore.appendToken → branchStore.appendToken
chatStore.appendReasoningDetail → branchStore.appendReasoningDetail
chatStore.appendReasoningStreamText → branchStore.appendReasoningStreamingText
chatStore.patchCurrentBranchMetadata → branchStore.patchMetadata
chatStore.getConversationMessages → branchStore.getDisplayMessages
```

#### 阶段 2: 对话配置（15个调用）
```typescript
chatStore.setConversationWebSearchEnabled → conversationStore.setWebSearchEnabled
chatStore.setConversationWebSearchLevel → conversationStore.setWebSearchLevel
chatStore.setConversationReasoningPreference → conversationStore.setReasoningPreference
chatStore.setConversationSamplingParameters → conversationStore.setSamplingParameters
```

#### 阶段 3: 草稿和状态（5个调用）
```typescript
chatStore.updateConversationDraft → conversationStore.updateConversationDraft
chatStore.setConversationGenerationStatus → conversationStore.setGenerationStatus
```

#### 阶段 4: 模型相关（5个调用）
```typescript
chatStore.availableModelsMap → modelStore.modelDataMap
chatStore.selectedModel → modelStore.selectedModelId
```

---

## 🤔 关键决策

### 问题：如何处理方法签名差异？

**示例：**
```javascript
// 旧 API
chatStore.patchCurrentBranchMetadata(conversationId, branchId, patcher)

// 新 API
branchStore.patchMetadata(conversationId, branchId, patcher)
```

大多数方法签名兼容，可以直接替换。

### 问题：如何验证功能正常？

**建议：**
1. 每替换一批（如阶段 1），运行 `npm run dev` 验证
2. 测试核心功能：发送消息、编辑消息、切换分支
3. 检查控制台无错误

---

## 💡 快速执行方案

### 使用批量查找替换

可以使用 VS Code 的查找替换功能：

1. **全局查找替换**（Ctrl+Shift+H）
2. **启用正则表达式**
3. **仅限 ChatView.vue**

**替换规则示例：**
```regex
查找: chatStore\.addMessageBranch
替换为: branchStore.addMessageBranch

查找: chatStore\.appendToken
替换为: branchStore.appendToken
```

---

## 📈 预估工作量

- 阶段 1（分支树）：**10 分钟** - 约 30 处替换
- 阶段 2（对话配置）：**5 分钟** - 约 15 处替换
- 阶段 3（草稿状态）：**3 分钟** - 约 5 处替换
- 阶段 4（模型）：**3 分钟** - 约 5 处替换
- 测试验证：**10 分钟**

**总计：约 30-40 分钟**

---

## ✨ 完成后的收益

1. ✅ **类型安全** - 完整的 TypeScript 支持
2. ✅ **职责分离** - 数据层清晰分离
3. ✅ **易于测试** - 每个 Store 可独立测试
4. ✅ **性能优化** - 更细粒度的响应式更新
5. ✅ **代码可维护性** - 清晰的 API 和文档

---

**当前进度：Phase 3.4 - 30% 完成**

**下一步行动：执行阶段 1-4 的批量替换**

**预计完成时间：30-40 分钟**
