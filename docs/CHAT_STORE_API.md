# Chat Store API 文档

## 概述

重构后的 `chatStore` 支持多会话管理，每个会话都有独立的消息历史和模型配置。

## State (状态)

### `apiKey: string`
Gemini API Key，从 electron-store 持久化存储中加载。

### `conversations: Array<Conversation>`
所有对话会话数组。每个会话对象结构：
```typescript
{
  id: string,        // 唯一标识符 (UUID)
  title: string,     // 对话标题
  messages: Array<{  // 消息数组
    role: 'user' | 'model',
    text: string
  }>,
  model: string      // 使用的模型名称
}
```

### `activeConversationId: string | null`
当前激活的对话 ID。

### `isLoading: boolean`
AI 回复加载状态。

### `availableModels: string[]`
可用的模型列表。

### `selectedModel: string`
全局选中的默认模型（用于新建对话）。

## Getters (计算属性)

### `activeConversation: Conversation | null`
返回当前激活的对话对象，如果没有激活的对话则返回 `null`。

```javascript
const currentConv = chatStore.activeConversation
if (currentConv) {
  console.log(currentConv.title, currentConv.messages.length)
}
```

## Actions (方法)

### 初始化相关

#### `loadApiKey(): Promise<void>`
从 electron-store 加载 API Key。

#### `loadConversations(): Promise<void>`
从 electron-store 加载所有对话。如果没有对话，自动创建一个新对话。

**使用场景**：应用启动时调用
```javascript
await chatStore.loadConversations()
```

#### `saveConversations(): Promise<void>`
保存所有对话到 electron-store。

**注意**：大部分情况下不需要手动调用，Store 会自动保存。

### 会话管理

#### `createNewConversation(title?: string): string`
创建新对话并设置为激活状态。

**参数**：
- `title` (可选)：对话标题，默认为 "新对话"

**返回**：新对话的 ID

```javascript
const newId = chatStore.createNewConversation('AI 编程助手')
```

#### `setActiveConversation(conversationId: string): void`
切换到指定对话。

```javascript
chatStore.setActiveConversation('某个-uuid-id')
```

#### `deleteConversation(conversationId: string): void`
删除指定对话。如果删除的是当前激活对话，会自动切换到其他对话或创建新对话。

```javascript
chatStore.deleteConversation('某个-uuid-id')
```

#### `renameConversation(conversationId: string, newTitle: string): void`
重命名对话。

```javascript
chatStore.renameConversation('某个-uuid-id', '新的标题')
```

### 消息管理

#### `addMessageToActiveConversation(message: Message): void`
添加消息到当前激活的对话。

**参数**：
```typescript
{
  role: 'user' | 'model',
  text: string
}
```

**特性**：
- 如果是第一条用户消息且标题为"新对话"，会自动使用消息前20个字符作为标题
- 自动保存到本地存储

```javascript
chatStore.addMessageToActiveConversation({
  role: 'user',
  text: '你好，AI！'
})
```

#### `clearActiveConversationMessages(): void`
清空当前对话的所有消息。

```javascript
chatStore.clearActiveConversationMessages()
```

### 模型管理

#### `setAvailableModels(models: string[]): void`
设置可用模型列表。

```javascript
chatStore.setAvailableModels(['models/gemini-pro', 'models/gemini-pro-vision'])
```

#### `setSelectedModel(modelName: string): void`
设置全局默认模型（用于新建对话）。

```javascript
chatStore.setSelectedModel('models/gemini-pro')
```

#### `updateActiveConversationModel(modelName: string): void`
更新当前对话使用的模型。

```javascript
chatStore.updateActiveConversationModel('models/gemini-2.0-flash')
```

### 加载状态

#### `setLoading(loading: boolean): void`
设置 AI 回复加载状态。

```javascript
chatStore.setLoading(true)  // 开始加载
// ... AI 处理中
chatStore.setLoading(false) // 结束加载
```

## 使用示例

### 完整的发送消息流程

```javascript
import { useChatStore } from '@/stores/chatStore'
import { startChatWithGemini, sendMessage } from '@/services/geminiService'

const chatStore = useChatStore()

async function sendUserMessage(text: string) {
  // 1. 检查 API Key
  if (!chatStore.apiKey) {
    console.error('未配置 API Key')
    return
  }

  // 2. 设置加载状态
  chatStore.setLoading(true)

  try {
    // 3. 添加用户消息
    chatStore.addMessageToActiveConversation({
      role: 'user',
      text: text
    })

    // 4. 获取当前对话
    const conversation = chatStore.activeConversation
    if (!conversation) {
      throw new Error('没有激活的对话')
    }

    // 5. 准备历史消息（不包括刚添加的用户消息）
    const history = conversation.messages.slice(0, -1)

    // 6. 创建聊天会话
    const chat = await startChatWithGemini(
      chatStore.apiKey,
      history,
      conversation.model
    )

    // 7. 发送消息并获取回复
    const aiResponse = await sendMessage(chat, text)

    // 8. 添加 AI 回复
    chatStore.addMessageToActiveConversation({
      role: 'model',
      text: aiResponse
    })

  } catch (error) {
    console.error('发送消息失败:', error)
    // 添加错误消息
    chatStore.addMessageToActiveConversation({
      role: 'model',
      text: `抱歉，发生了错误：${error.message}`
    })
  } finally {
    // 9. 结束加载状态
    chatStore.setLoading(false)
  }
}
```

### 应用启动初始化

```javascript
// 在 App.vue 或主组件的 onMounted 中
import { onMounted } from 'vue'
import { useChatStore } from '@/stores/chatStore'
import { listAvailableModels } from '@/services/geminiService'

onMounted(async () => {
  const chatStore = useChatStore()
  
  // 1. 加载 API Key
  await chatStore.loadApiKey()
  
  // 2. 加载对话列表
  await chatStore.loadConversations()
  
  // 3. 如果有 API Key，加载可用模型
  if (chatStore.apiKey) {
    try {
      const models = await listAvailableModels(chatStore.apiKey)
      chatStore.setAvailableModels(models)
    } catch (error) {
      console.error('加载模型列表失败:', error)
    }
  }
})
```

## 数据持久化

所有对话数据通过 `electron-store` 自动持久化到本地。存储的键名：

- `apiKey`：API Key
- `conversations`：对话列表（完整的 JSON 数组）

无需手动管理持久化，Store 会在数据变化时自动保存。

## 注意事项

1. **自动标题生成**：第一条用户消息会自动成为对话标题（前20个字符）
2. **自动创建对话**：如果没有对话，系统会自动创建一个
3. **智能切换**：删除当前对话时，会自动切换到其他对话
4. **模型绑定**：每个对话有独立的模型配置，不受全局模型切换影响
5. **线程安全**：所有操作都会自动保存到本地存储
