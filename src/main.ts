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
import { useConversationStore } from './stores/conversation'
import { useModelStore } from './stores/model'
import { usePersistenceStore } from './stores/persistence'
import { useProjectStore } from './stores/project'
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

// ✅ 在 app.use(pinia) 之后立即创建 store 实例
// 这样可以在后续的初始化流程中使用
let appStore: ReturnType<typeof useAppStore>
let conversationStore: ReturnType<typeof useConversationStore>
let modelStore: ReturnType<typeof useModelStore>
let persistenceStore: ReturnType<typeof usePersistenceStore>
let projectStore: ReturnType<typeof useProjectStore>

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
  console.log('🌠 正在后台加载会话数据...')
  try {
    // 并行加载对话、项目数据、收藏模型和缓存的模型列表
    await Promise.all([
      persistenceStore.loadAllConversations(),
      projectStore.loadProjects(),
      modelStore.loadFavorites(),
      modelStore.loadAppModels() // 从数据库加载模型列表
    ])
    console.log('✓ 会话、项目、收藏模型和缓存模型数据加载完成')
  } catch (error) {
    console.error('⚠️ 加载数据失败:', error)
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
    // ========== 新架构：统一使用 syncFromOpenRouter ==========
    if (currentProvider === 'OpenRouter') {
      const { syncFromOpenRouter } = await import('./services/modelSync')
      const apiKey = appStore.openRouterApiKey
      const baseUrl = appStore.openRouterBaseUrl || 'https://openrouter.ai'
      
      // 获取本地已有模型（用于增量更新）
      const existingModels = modelStore.appModels
      
      // 一次性同步：获取模型 + 提取能力（不再调用 /parameters）
      const result = await syncFromOpenRouter(apiKey, existingModels, baseUrl)
      
      if (result.success) {
        // 设置模型（同时自动注册能力到 CapabilityRegistry）
        modelStore.setAppModels(result.models)
        
        // 保存到数据库
        await modelStore.saveAppModels()
        
        console.log(`✓ 模型同步完成:`, {
          total: result.stats.total,
          active: result.stats.active,
          archived: result.stats.archived,
          withReasoning: result.stats.withReasoning,
          withTools: result.stats.withTools,
          multimodal: result.stats.multimodal,
        })
      } else {
        console.warn('⚠️ 模型同步失败:', result.error?.message)
      }
    } else if (currentProvider === 'Gemini') {
      // Gemini 保持原有简化逻辑
      const modelData = await aiChatService.listAvailableModels(appStore)
      const { batchNormalizeModels } = await import('./services/modelSync')
      
      // 将 Gemini 字符串数组转换为简化对象
      const rawModels = (Array.isArray(modelData) ? modelData : [])
        .filter((item: any) => item)
        .map((item: any) => {
          if (typeof item === 'string') {
            return { id: item, name: item }
          }
          return item
        })
      
      const normalizedModels = batchNormalizeModels(rawModels)
      modelStore.setAppModels(normalizedModels)
      await modelStore.saveAppModels()
      
      console.log('✓ Gemini 模型列表加载成功:', normalizedModels.length, '个模型')
    }
  } catch (error) {
    console.warn('⚠️ 后台加载模型列表失败:', error)
    console.warn('用户可以在设置页面重新保存 API Key 来加载模型')
  }
}

// ========== 窗口关闭前保存 ==========
window.addEventListener('beforeunload', async (e) => {
  const dirtyCount = persistenceStore.dirtyConversationIds.size
  if (dirtyCount > 0) {
    console.log(`💾 [beforeunload] 检测到 ${dirtyCount} 个未保存的对话，正在保存...`)
    
    // 阻止窗口立即关闭
    e.preventDefault()
    e.returnValue = ''
    
    // 执行保存
    await persistenceStore.saveAllDirtyConversations()
    console.log('✓ [beforeunload] 保存完成')
  }
})

// ========== 启动流程：先初始化 Pinia 和 stores，再准备配置，最后挂载 UI 和后台加载数据 ==========
;(async () => {
  // 1️⃣ 初始化 store 实例（必须在 app.use(pinia) 之后）
  appStore = useAppStore()
  conversationStore = useConversationStore()
  modelStore = useModelStore()
  persistenceStore = usePersistenceStore()
  projectStore = useProjectStore()
  
  // 暴露到全局，供 Electron 主进程调用
  ;(window as any).__STORES__ = {
    appStore,
    conversationStore,
    modelStore,
    persistenceStore,
    projectStore
  }
  console.log('✓ Store 已暴露到全局 window.__STORES__')
  
  // 2️⃣ 初始化 appStore 配置
  console.log('正在初始化 appStore...')
  try {
    await appStore.initializeStore()
    console.log('✓ appStore 初始化完成, apiKey:', appStore.apiKey)
  } catch (error) {
    console.error('⚠️ appStore 初始化失败:', error)
  }

  // 3️⃣ 挂载应用
  mountApplication()

  // 4️⃣ 后台加载聊天数据和模型列表，不阻塞界面渲染
  void bootstrapChatData()
})()
