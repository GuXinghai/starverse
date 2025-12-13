# 消息分支树功能实现指南

## ✅ 已完成的工作

### 1. 数据结构设计 ✓
- 定义了 `MessageVersion`、`MessageBranch`、`ConversationTree` 类型
- 更新了 `Conversation` 接口使用树形结构
- 添加了辅助工具函数（`createEmptyTree`、`getCurrentVersion`、`extractTextFromBranch`）

### 2. chatStore 核心功能 ✓
- 创建了 `branchTreeHelpers.js` 包含所有树操作逻辑
- 实现了数据迁移：`migrateMessagesToTree()`
- 添加了新的 store actions:
  - `addMessageBranch()` - 添加新分支
  - `addBranchVersion()` - 添加新版本
  - `switchBranchVersion()` - 切换版本
  - `deleteMessageBranch()` - 删除分支
  - `appendTokenToBranchVersion()` - 流式追加
  - `updateBranchParts()` - 更新内容
  - `getConversationMessages()` - 获取当前路径消息

### 3. UI 组件 ✓
- `MessageBranchController.vue` - 版本切换器 (<1/3> 样式)
- `DeleteConfirmDialog.vue` - 删除确认对话框

## 📋 待完成的工作

### 第5步：重构 ChatView 组件

ChatView 需要更新以下部分：

#### 5.1 导入新组件
```vue
<script setup lang="ts">
import MessageBranchController from './MessageBranchController.vue'
import DeleteConfirmDialog from './DeleteConfirmDialog.vue'
import { extractTextFromBranch, getCurrentVersion } from '../types/chat'
```

#### 5.2 更新数据结构访问
替换所有 `conversation.messages` 访问为树形结构：

```typescript
// 旧代码
const messages = activeConversation.messages

// 新代码 - 渲染当前路径的消息
const displayMessages = computed(() => {
  if (!activeConversation) return []
  
  return activeConversation.tree.currentPath.map(branchId => {
    const branch = activeConversation.tree.branches.get(branchId)
    if (!branch) return null
    
    const version = branch.versions[branch.currentVersionIndex]
    return {
      branchId,
      role: branch.role,
      parts: version.parts,
      timestamp: version.timestamp,
      // 版本控制信息
      currentVersionIndex: branch.currentVersionIndex,
      totalVersions: branch.versions.length
    }
  }).filter(msg => msg !== null)
})
```

#### 5.3 集成版本切换器
在每条消息下方添加版本切换器（当有多个版本时）：

```vue
<template>
  <div v-for="msg in displayMessages" :key="msg.branchId" class="message-container">
    <!-- 消息内容 -->
    <ContentRenderer :parts="msg.parts" :role="msg.role" />
    
    <!-- 版本切换器（仅当有多个版本时显示） -->
    <MessageBranchController
      v-if="msg.totalVersions > 1"
      :current-index="msg.currentVersionIndex"
      :total-versions="msg.totalVersions"
      @switch="(direction) => handleSwitchVersion(msg.branchId, direction)"
    />
    
    <!-- 消息操作按钮 -->
    <div class="message-actions">
      <button @click="handleRegenerateOrEdit(msg)">...</button>
      <button @click="handleDeleteClick(msg.branchId)">删除</button>
    </div>
  </div>
</template>
```

#### 5.4 更新发送消息逻辑
```typescript
const sendMessage = async () => {
  if (!userInput.value.trim() && selectedImages.value.length === 0) return
  
  const conversationId = activeConversation.id
  
  // 构建消息 parts
  const parts = []
  if (userInput.value.trim()) {
    parts.push({ type: 'text', text: userInput.value.trim() })
  }
  for (const imgUrl of selectedImages.value) {
    parts.push({ type: 'image_url', image_url: { url: imgUrl } })
  }
  
  // 添加用户消息分支
  const userBranchId = chatStore.addMessageBranch(conversationId, 'user', parts)
  
  // 清空输入
  userInput.value = ''
  selectedImages.value = []
  
  // 创建 AI 回复分支（空内容）
  const aiBranchId = chatStore.addMessageBranch(conversationId, 'model', [{ type: 'text', text: '' }])
  
  // 获取历史消息（使用新API）
  const history = chatStore.getConversationMessages(conversationId)
  
  // 调用 AI 服务（流式生成）
  chatStore.setConversationGenerationStatus(conversationId, 'generating')
  
  try {
    await streamAIResponse(history, (token) => {
      chatStore.appendTokenToBranchVersion(conversationId, aiBranchId, token)
    })
    chatStore.setConversationGenerationStatus(conversationId, 'idle')
  } catch (error) {
    chatStore.setConversationGenerationStatus(conversationId, 'error')
  }
}
```

#### 5.5 更新重新生成逻辑
```typescript
const handleRegenerate = async (branchId: string) => {
  const conversationId = activeConversation.id
  
  // 创建新版本（空内容）
  chatStore.addBranchVersion(conversationId, branchId, [{ type: 'text', text: '' }])
  
  // 获取该分支之前的历史
  const history = chatStore.getConversationMessages(conversationId).slice(0, -1)
  
  chatStore.setConversationGenerationStatus(conversationId, 'generating')
  
  try {
    await streamAIResponse(history, (token) => {
      chatStore.appendTokenToBranchVersion(conversationId, branchId, token)
    })
    chatStore.setConversationGenerationStatus(conversationId, 'idle')
  } catch (error) {
    chatStore.setConversationGenerationStatus(conversationId, 'error')
  }
}
```

#### 5.6 更新编辑消息逻辑
```typescript
const handleEditMessage = (branchId: string) => {
  // 获取当前版本的内容
  const branch = activeConversation.tree.branches.get(branchId)
  const version = branch.versions[branch.currentVersionIndex]
  
  // 进入编辑模式
  editingBranchId.value = branchId
  editingText.value = extractTextFromBranch(branch)
  // ... 图片处理
}

const submitEdit = async () => {
  const conversationId = activeConversation.id
  const originalBranchId = editingBranchId.value
  
  // 构建新的 parts
  const newParts = buildPartsFromInput(editingText.value, editingImages.value)
  
  // 创建新版本
  chatStore.addBranchVersion(conversationId, originalBranchId, newParts)
  
  // 如果是用户消息，需要重新生成后续回复
  const branch = activeConversation.tree.branches.get(originalBranchId)
  if (branch.role === 'user' && branch.childBranchIds.length > 0) {
    // 为子分支创建新版本...
  }
  
  // 退出编辑模式
  editingBranchId.value = null
}
```

#### 5.7 集成删除确认对话框
```typescript
const deleteDialogShow = ref(false)
const deletingBranchId = ref<string | null>(null)

const handleDeleteClick = (branchId: string) => {
  deletingBranchId.value = branchId
  deleteDialogShow.value = true
}

const handleDeleteCurrentVersion = () => {
  if (!deletingBranchId.value) return
  chatStore.deleteMessageBranch(activeConversation.id, deletingBranchId.value, false)
  deletingBranchId.value = null
}

const handleDeleteAllVersions = () => {
  if (!deletingBranchId.value) return
  chatStore.deleteMessageBranch(activeConversation.id, deletingBranchId.value, true)
  deletingBranchId.value = null
}
```

```vue
<DeleteConfirmDialog
  :show="deleteDialogShow"
  @close="deleteDialogShow = false"
  @delete-current-version="handleDeleteCurrentVersion"
  @delete-all-versions="handleDeleteAllVersions"
/>
```

### 第6步：测试清单

- [ ] 创建新对话，发送消息
- [ ] 重新生成回复，检查版本切换
- [ ] 切换到不同版本，验证内容正确
- [ ] 编辑用户消息，生成新分支
- [ ] 删除当前版本，验证行为
- [ ] 删除所有版本，验证级联删除
- [ ] 刷新应用，验证数据持久化
- [ ] 旧数据迁移测试

## 🎯 关键设计原则

1. **数据结构清晰**：树形结构明确，currentPath 追踪显示路径
2. **最小限制**：不添加不必要的验证和限制
3. **功能解耦**：
   - `branchTreeHelpers.js` - 纯函数，不依赖 store
   - `chatStore.js` - 封装 store 操作
   - 组件 - 只处理UI交互
4. **向后兼容**：保留旧API，自动迁移数据

## 📝 数据迁移说明

loadConversations 中已实现自动迁移：
- 检测旧格式（有 `messages` 数组）
- 调用 `migrateMessagesToTree()` 转换
- 保存为新格式
- 原有聊天记录自动升级，无需手动操作

## ⚠️ 注意事项

1. Map 序列化：保存时转为数组，加载时恢复为 Map
2. 流式生成：确保追加到正确的分支版本
3. 版本切换：自动更新路径，确保显示一致
4. 删除操作：级联删除所有子分支
