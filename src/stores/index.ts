import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export const useAppStore = defineStore('app', () => {
  // 状态
  const apiKey = ref<string>('')
  const chatMessages = ref<ChatMessage[]>([])
  const isAppReady = ref<boolean>(false) // 应用初始化完成状态

  // 初始化 - 从 electron-store 加载 API Key
  const initializeStore = async () => {
    try {
      const savedApiKey = await window.electronStore.get('apiKey')
      console.log('appStore.initializeStore - 从存储加载的 API Key:', savedApiKey)
      if (savedApiKey) {
        apiKey.value = savedApiKey
        console.log('appStore.initializeStore - apiKey.value 已设置为:', apiKey.value)
      }
    } catch (error) {
      console.error('初始化 store 失败:', error)
    } finally {
      // 无论成功或失败，都标记应用为已就绪
      isAppReady.value = true
      console.log('✓ 应用初始化完成，isAppReady = true')
    }
  }

  // 保存 API Key
  const saveApiKey = async (key: string) => {
    try {
      await window.electronStore.set('apiKey', key)
      apiKey.value = key
      return true
    } catch (error) {
      console.error('保存 API Key 失败:', error)
      return false
    }
  }

  // 添加聊天消息
  const addMessage = (message: ChatMessage) => {
    chatMessages.value.push(message)
  }

  // 清空聊天消息
  const clearMessages = () => {
    chatMessages.value = []
  }

  // 删除指定索引的消息
  const removeMessage = (index: number) => {
    if (index >= 0 && index < chatMessages.value.length) {
      chatMessages.value.splice(index, 1)
    }
  }

  return {
    // 状态
    apiKey,
    chatMessages,
    isAppReady,
    // 方法
    initializeStore,
    saveApiKey,
    addMessage,
    clearMessages,
    removeMessage,
  }
})
