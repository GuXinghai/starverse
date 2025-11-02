console.log('================================================')
console.log('🚀 应用启动开始！')
console.log('时间:', new Date().toLocaleString())
console.log('User Agent:', navigator.userAgent)
console.log('================================================')

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { useAppStore } from './stores'
// @ts-ignore - chatStore.js is a JavaScript file
import { useChatStore } from './stores/chatStore'
// @ts-ignore - aiChatService.js is a JavaScript file
import { aiChatService } from './services/aiChatService'

console.log('✓ 依赖导入成功')
console.log('  - createApp:', typeof createApp)
console.log('  - createPinia:', typeof createPinia)
console.log('  - App:', App)

console.log('正在创建 Vue 应用实例...')
const app = createApp(App)
console.log('✓ Vue 应用实例创建成功')

console.log('正在创建 Pinia 实例...')
const pinia = createPinia()
console.log('✓ Pinia 实例创建成功')

console.log('正在注册 Pinia...')
app.use(pinia)
console.log('✓ Pinia 注册成功')

// ========== 关键修复：在挂载前初始化 stores ==========
;(async () => {
  console.log('正在初始化 appStore...')
  const appStore = useAppStore()
  await appStore.initializeStore()
  console.log('✓ appStore 初始化完成, apiKey:', appStore.apiKey)

  console.log('正在初始化 chatStore...')
  // @ts-ignore
  const chatStore = useChatStore()
  await chatStore.loadConversations()
  console.log('✓ chatStore 初始化完成')

  // 自动加载模型列表（使用多提供商服务）
  // 检查当前 Provider 的 API Key 是否已配置
  const currentProvider = appStore.activeProvider
  const hasApiKey = currentProvider === 'Gemini' 
    ? appStore.geminiApiKey 
    : appStore.openRouterApiKey
  
  if (hasApiKey) {
    console.log(`检测到已保存的 ${currentProvider} API Key，正在加载模型列表...`)
    try {
      // @ts-ignore
      const models = await aiChatService.listAvailableModels(appStore)
      console.log('✓ 模型列表加载成功:', models.length, '个模型')
      chatStore.setAvailableModels(models)
    } catch (error) {
      console.warn('⚠️ 自动加载模型列表失败:', error)
      console.warn('用户可以在设置页面重新保存 API Key 来加载模型')
    }
  } else {
    console.log(`未检测到 ${currentProvider} API Key，跳过模型列表加载`)
  }

  console.log('正在挂载应用到 #app...')
  app.mount('#app').$nextTick(async () => {
    console.log('✓✓✓ 应用挂载成功！✓✓✓')
  
    // Use contextBridge
    window.ipcRenderer.on('main-process-message', (_event, message) => {
      console.log('收到主进程消息:', message)
    })
  
    console.log('✓ IPC 监听器设置完成')
    console.log('================================================')
    console.log('🎉 应用启动完成！准备就绪！')
    console.log('================================================')
  })
})()
