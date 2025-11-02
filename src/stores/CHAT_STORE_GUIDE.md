# Chat Store 使用指南

## 📦 已安装的依赖

- ✅ **@google/generative-ai** - Google Generative AI SDK
- ✅ **pinia** - Vue 状态管理库

## 🏗️ Store 结构

### 文件位置
`src/stores/chatStore.js`

### State (状态)

| 状态 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | String | `''` | 从 electron-store 读取的 Gemini API Key |
| `messages` | Array | `[]` | 聊天消息数组，格式：`{ role: 'user' \| 'model', text: '内容' }` |
| `isLoading` | Boolean | `false` | AI 是否正在回复 |

### Actions (方法)

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `loadApiKey()` | 无 | Promise | 从 electron-store 读取 API Key |
| `addMessage(message)` | `{ role, text }` | void | 添加消息到数组末尾 |
| `setLoading(loading)` | Boolean | void | 更新加载状态 |
| `clearMessages()` | 无 | void | 清空所有消息（额外功能） |

## 💡 使用示例

### 在组件中导入和使用

```vue
<script setup>
import { useChatStore } from '@/stores/chatStore'
import { onMounted } from 'vue'

const chatStore = useChatStore()

// 组件挂载时加载 API Key
onMounted(async () => {
  await chatStore.loadApiKey()
})

// 发送用户消息
const sendMessage = () => {
  // 添加用户消息
  chatStore.addMessage({
    role: 'user',
    text: '你好，Gemini!'
  })
  
  // 设置加载状态
  chatStore.setLoading(true)
  
  // 调用 AI API...
  // 获得回复后添加 AI 消息
  chatStore.addMessage({
    role: 'model',
    text: 'AI 的回复内容'
  })
  
  // 取消加载状态
  chatStore.setLoading(false)
}

// 清空聊天记录
const clearChat = () => {
  chatStore.clearMessages()
}
</script>

<template>
  <div>
    <!-- 显示消息列表 -->
    <div v-for="(msg, index) in chatStore.messages" :key="index">
      <div :class="msg.role === 'user' ? 'user-msg' : 'ai-msg'">
        {{ msg.text }}
      </div>
    </div>
    
    <!-- 加载指示器 -->
    <div v-if="chatStore.isLoading">AI 正在思考中...</div>
    
    <!-- 操作按钮 -->
    <button @click="sendMessage">发送</button>
    <button @click="clearChat">清空</button>
  </div>
</template>
```

### 与 Google Generative AI SDK 集成

```javascript
import { GoogleGenerativeAI } from '@google/generative-ai'
import { useChatStore } from '@/stores/chatStore'

const chatStore = useChatStore()

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(chatStore.apiKey)
const model = genAI.getGenerativeModel({ model: "gemini-pro" })

// 发送消息并获取回复
async function chat(userMessage) {
  // 添加用户消息
  chatStore.addMessage({
    role: 'user',
    text: userMessage
  })
  
  // 设置加载状态
  chatStore.setLoading(true)
  
  try {
    // 调用 Gemini API
    const result = await model.generateContent(userMessage)
    const response = await result.response
    const aiText = response.text()
    
    // 添加 AI 回复
    chatStore.addMessage({
      role: 'model',
      text: aiText
    })
  } catch (error) {
    console.error('AI 调用失败:', error)
  } finally {
    // 取消加载状态
    chatStore.setLoading(false)
  }
}
```

## 🎯 注意事项

1. **消息格式要求**：
   - 必须包含 `role` 字段（'user' 或 'model'）
   - 必须包含 `text` 字段（消息内容）

2. **API Key 管理**：
   - API Key 存储在 electron-store 中
   - 应用启动时调用 `loadApiKey()` 加载

3. **加载状态**：
   - 在调用 AI API 前设置为 `true`
   - 获得回复后设置为 `false`
   - 可用于显示加载动画

## 🔗 相关文件

- Store 定义: `src/stores/chatStore.js`
- 主应用: `src/stores/index.ts` (已有的 app store)
- Pinia 初始化: `src/main.ts`
