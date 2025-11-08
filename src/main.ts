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
import { ipcRendererBridge } from './utils/electronBridge'

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

// 提前创建 store 实例，便于在多个初始化阶段共享
const appStore = useAppStore()
// @ts-ignore - chatStore.js 是一个 JavaScript 文件
const chatStore = useChatStore()

const mountApplication = () => {
  console.log('正在挂载应用到 #app...')
  const rootInstance = app.mount('#app')
  rootInstance.$nextTick(async () => {
    console.log('✓✓✓ 应用挂载成功！✓✓✓')

    // Use contextBridge (guarded for non-Electron environments)
    if (ipcRendererBridge?.on) {
      ipcRendererBridge.on('main-process-message', (_event: unknown, message: unknown) => {
        console.log('收到主进程消息:', message)
      })
      console.log('✓ IPC 监听器设置完成')
    } else {
      console.log('ℹ️ IPC bridge 未检测到，跳过主进程消息监听（可能运行在纯浏览器环境）。')
    }

    console.log('================================================')
    console.log('🎉 应用启动完成！准备就绪！')
    console.log('================================================')
  })
}

const bootstrapChatData = async () => {
  console.log('🌠 正在后台加载 chatStore 数据...')
  try {
    await chatStore.loadConversations()
    console.log('✓ chatStore 会话数据加载完成')
  } catch (error) {
    console.error('⚠️ chatStore 加载对话失败:', error)
  }

  const currentProvider = appStore.activeProvider
  const hasApiKey = currentProvider === 'Gemini'
    ? appStore.geminiApiKey
    : appStore.openRouterApiKey

  if (!hasApiKey) {
    console.log(`未检测到 ${currentProvider} API Key，后台模型加载跳过`)
    return
  }

  console.log(`🌌 后台加载 ${currentProvider} 模型列表...`)
  try {
    const models = await aiChatService.listAvailableModels(appStore)
    console.log('✓ 模型列表加载成功:', models.length, '个模型')
    chatStore.setAvailableModels(models)
  } catch (error) {
    console.warn('⚠️ 后台加载模型列表失败:', error)
    console.warn('用户可以在设置页面重新保存 API Key 来加载模型')
  }
}

// ========== 启动流程：先准备配置，再挂载 UI，最后后台加载数据 ==========
;(async () => {
  console.log('正在初始化 appStore...')
  try {
    await appStore.initializeStore()
    console.log('✓ appStore 初始化完成, apiKey:', appStore.apiKey)
  } catch (error) {
    console.error('⚠️ appStore 初始化失败:', error)
  }

  mountApplication()

  // 后台加载聊天数据和模型列表，不阻塞界面渲染
  void bootstrapChatData()
})()
