# Pinia Store 使用指南

## Store 结构

已创建 `useAppStore`，包含以下状态和方法：

### 状态 (State)

1. **apiKey**: `string` - 用户的 API Key
2. **chatMessages**: `ChatMessage[]` - 聊天消息数组

   ```typescript
   interface ChatMessage {
     role: 'user' | 'assistant'
     content: string
   }
   ```

### 方法 (Actions)

#### 初始化
- **initializeStore()** - 从 electron-store 加载已保存的 API Key

#### API Key 管理
- **saveApiKey(key: string)** - 保存 API Key 到 electron-store 并更新状态

#### 消息管理
- **addMessage(message: ChatMessage)** - 添加一条消息到聊天数组
- **clearMessages()** - 清空所有聊天消息
- **removeMessage(index: number)** - 删除指定索引的消息

## 使用示例

### 在组件中导入和使用

```vue
<script setup lang="ts">
import { useAppStore } from '../stores'

const store = useAppStore()

// 读取状态
console.log(store.apiKey)
console.log(store.chatMessages)

// 添加消息
store.addMessage({
  role: 'user',
  content: '你好！'
})

store.addMessage({
  role: 'assistant',
  content: '你好！有什么可以帮助你的吗？'
})

// 清空消息
store.clearMessages()

// 删除指定消息
store.removeMessage(0)
</script>
```

### 在 ChatView 组件中使用

```vue
<script setup lang="ts">
import { useAppStore } from '../stores'

const store = useAppStore()
const userInput = ref('')

const sendMessage = () => {
  if (!userInput.value.trim()) return
  
  // 添加用户消息
  store.addMessage({
    role: 'user',
    content: userInput.value
  })
  
  // 这里可以调用 API，然后添加 assistant 的回复
  // ...
  
  userInput.value = ''
}
</script>

<template>
  <div>
    <!-- 显示消息列表 -->
    <div v-for="(msg, index) in store.chatMessages" :key="index">
      <div :class="msg.role === 'user' ? 'text-right' : 'text-left'">
        {{ msg.content }}
      </div>
    </div>
    
    <!-- 输入框 -->
    <input v-model="userInput" @keyup.enter="sendMessage" />
  </div>
</template>
```

## 自动加载 API Key

在 `main.ts` 中，应用启动时会自动初始化 Pinia。
在任何需要使用 API Key 的组件的 `onMounted` 钩子中调用 `store.initializeStore()` 即可加载已保存的 API Key。

当前已在 `SettingsView.vue` 中实现了这个功能。
