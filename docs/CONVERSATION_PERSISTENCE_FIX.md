# 修复：新建的会话在应用重启后消失

## 问题描述
用户创建新的会话，但当应用重启后，该会话就消失了。这说明新会话没有被正确保存到 SQLite 数据库。

## 根本原因
在 [src/stores/conversation.ts](src/stores/conversation.ts) 的 `createConversation` 方法中，新会话被创建和添加到内存状态，但**没有标记为脏数据**。

持久化系统采用了"脏数据追踪"机制：
- 只有被标记为脏数据的会话才会被自动保存到 SQLite
- 自动保存机制每 3 秒检查一次脏数据队列
- 应用关闭前会执行 `beforeunload` 事件，保存所有脏数据

由于 `createConversation` 没有调用 `persistenceStore.markConversationDirty()`，新会话被标记为"clean"，永远不会被自动保存机制处理。

## 修复方案

### 改动文件
- [src/stores/conversation.ts](src/stores/conversation.ts) - 修复 `createConversation` 方法

### 具体修复
在 `createConversation` 方法中，新对话添加到数组后，立即标记为脏数据：

```typescript
const createConversation = (options?: {
  title?: string
  model?: string
  projectId?: string | null
}): Conversation => {
  // ... 创建新对话对象的代码 ...
  
  // 新对话添加到数组开头，使其显示在列表顶部
  conversations.value.unshift(newConversation)
  
  // 🔧 修复：标记新对话为脏数据，以便自动保存
  const persistenceStore = usePersistenceStore()
  persistenceStore.markConversationDirty(newConversation.id)
  
  return newConversation
}
```

## 工作流程验证

### 自动保存流程
1. ✅ 用户创建新会话 → `createConversation()` 被调用
2. ✅ 新会话对象被添加到 `conversations.value`
3. ✅ 新会话 ID 被添加到 `persistenceStore.dirtyConversationIds` 集合
4. ✅ 自动保存定时器（每 3 秒）检测到脏数据
5. ✅ 调用 `saveConversation(id)`，将新会话序列化到 SQLite
6. ✅ 脏标记被清除，准备下一次更新

### 应用重启流程
1. ✅ 应用启动时 → `main.ts` 的初始化流程
2. ✅ 创建所有 Store（包括 `persistenceStore`，启动自动保存机制）
3. ✅ 挂载应用
4. ✅ 后台调用 `loadAllConversations()` 从 SQLite 加载所有保存的会话
5. ✅ 新会话在启动时被重新加载，显示在对话列表

## 测试验证

新增单元测试文件：[tests/unit/stores/conversation.persistence.spec.ts](tests/unit/stores/conversation.persistence.spec.ts)

测试覆盖：
- ✅ 创建新对话时应该自动标记为脏数据
- ✅ 创建多个新对话应该都被标记为脏数据
- ✅ 清除脏标记后，新创建的对话应该重新标记为脏数据

所有测试通过。

## 影响范围

此修复影响以下调用路径：
- [src/components/ProjectHome.vue](src/components/ProjectHome.vue#L655) - 项目首页创建新会话
- [src/components/ConversationList.vue](src/components/ConversationList.vue#L616) - 对话列表创建新会话

两个位置都调用同一个 `createConversation()` 方法，因此修复会同时覆盖这两个入口。

## 相关代码

### 脏数据追踪机制
- [src/stores/persistence.ts#L49-L65](src/stores/persistence.ts#L49-L65) - `markConversationDirty`, `clearConversationDirty`
- [src/stores/persistence.ts#L287-L304](src/stores/persistence.ts#L287-L304) - 自动保存机制 (`startAutoSave`)

### 持久化流程
- [src/services/chatPersistence.ts#L521-L691](src/services/chatPersistence.ts#L521-L691) - `saveConversation` 实现
- [src/stores/persistence.ts#L208-L255](src/stores/persistence.ts#L208-L255) - `loadAllConversations` 实现

### 应用初始化
- [src/main.ts#L69-L87](src/main.ts#L69-L87) - `bootstrapChatData` 加载会话数据

## 验证步骤

用户可以按照以下步骤验证修复：

1. **创建新会话**
   - 在应用中创建一个新会话，如"测试会话"
   - 确保会话出现在左侧会话列表中

2. **发送消息（可选但推荐）**
   - 在新会话中发送一条消息
   - 观察消息是否被显示和保存

3. **等待自动保存**
   - 打开浏览器开发者工具（F12）或检查日志
   - 应该看到日志输出：`💾 [PersistenceStore] 自动保存触发，脏数据数量: 1`
   - 表示会话正被保存

4. **重启应用**
   - 关闭应用（或刷新页面）
   - 重新打开应用
   - **验证**：新创建的"测试会话"应该仍然存在在对话列表中

5. **验证会话内容**
   - 打开重新加载的会话
   - 验证之前发送的消息（如果有）仍然存在

## 后续改进建议

虽然当前修复解决了问题，但可以考虑以下改进：

1. **更新其他 Store 方法** - 检查 `useProjectStore` 等其他 Store 是否也需要类似修复
2. **自动持久化确认** - 添加日志或通知显示会话已被保存
3. **错误处理** - 如果保存失败，应该有重试机制或用户通知
4. **性能优化** - 考虑批量保存多个新会话
