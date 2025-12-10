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
import { extractModelSeries } from './services/providers/OpenRouterService'

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
      modelStore.loadAvailableModels() // 从数据库加载模型列表
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
    const modelData = await aiChatService.listAvailableModels(appStore)
    
    console.log(`📊 原始数据类型检查:`, {
      isArray: Array.isArray(modelData),
      length: modelData?.length,
      firstItemType: typeof modelData?.[0],
      firstItem: modelData?.[0]
    })
    
    // 规范化处理：支持对象数组（OpenRouter）和字符串数组（Gemini）
    const models = (Array.isArray(modelData) ? modelData : [])
      .filter((item: any) => item && (typeof item === 'string' || item.id)) // 过滤无效项
      .map((item: any) => {
        // 🔧 处理字符串（Gemini）：转换为基础对象
        if (typeof item === 'string') {
          return {
            id: item,
            name: item,
            description: undefined,
            context_length: undefined,
            max_output_tokens: undefined,
            pricing: undefined,
            architecture: undefined,
            input_modalities: undefined,
            output_modalities: undefined,
            supportsVision: false,
            supportsImageOutput: false,
            supportsReasoning: false
          }
        }
        
        // 🔧 处理对象（OpenRouter）：保留完整字段
        return {
          id: String(item.id),
          name: item.name || String(item.id),
          description: item.description,
          context_length: item.context_length,
          max_output_tokens: item.max_output_tokens,
          pricing: item.pricing,
          architecture: item.architecture,
          series: extractModelSeries(String(item.id)),  // 🔧 添加：从 ID 提取模型系列
          input_modalities: item.architecture?.input_modalities || item.input_modalities || ['text'],  // 🔧 修复：优先使用 architecture.input_modalities
          output_modalities: item.architecture?.output_modalities || item.output_modalities || ['text'],  // 🔧 修复：优先使用 architecture.output_modalities
          supportsVision: (item.architecture?.input_modalities || item.input_modalities || []).includes('image'),
          supportsImageOutput: (item.architecture?.output_modalities || item.output_modalities || []).includes('image'),
          supportsReasoning: item.architecture?.reasoning === true
        }
      })
    
    console.log(`🔄 模型转换完成:`, {
      inputCount: modelData?.length,
      outputCount: models.length,
      sampleModel: models[0]
    })
    
    modelStore.setAvailableModels(models)
    // 后台更新完成后保存到缓存
    await modelStore.saveAvailableModels()

    console.log('✓ 模型列表加载成功:', models.length, '个模型')

    // 批量获取模型参数（仅在 OpenRouter 模式下）
    if (currentProvider === 'OpenRouter') {
      console.log('🔧 开始批量获取模型参数...')
      const { OpenRouterService } = await import('./services/providers/OpenRouterService')
      const apiKey = appStore.openRouterApiKey
      const baseUrl = appStore.openRouterBaseUrl
      
      if (!apiKey) {
        console.warn('⚠️ OpenRouter API Key 未配置，跳过参数获取')
      } else {
        let successCount = 0
        let skipCount = 0
        let errorCount = 0
        
        // 过滤掉特殊的路由模型（不是真实模型，无法获取参数）
        const SKIP_MODELS = new Set([
          'openrouter/auto',           // 智能路由
          'openrouter/auto-fallback'   // 智能路由备用
        ])
        
        // 限制并发数量，避免请求过多
        const BATCH_SIZE = 5
        const allModelIds = models
          .map((m: any) => m.id)
          .filter((id): id is string => Boolean(id) && id !== 'undefined')
        const modelIds = allModelIds.filter((id: string) => !SKIP_MODELS.has(id))
        
        // 计算跳过的模型数量
        skipCount = allModelIds.length - modelIds.length
        if (skipCount > 0) {
          console.log(`⏭️ 跳过 ${skipCount} 个特殊路由模型（无需获取参数）`)
        }
        
        for (let i = 0; i < modelIds.length; i += BATCH_SIZE) {
          const batch = modelIds.slice(i, i + BATCH_SIZE)
          const results = await Promise.allSettled(
            batch.map((modelId: string) =>
              OpenRouterService.getModelParameters?.(apiKey, modelId, baseUrl)
                .then((info: any) => ({ modelId, info }))
                ?? Promise.reject(new Error('getModelParameters not available'))
            )
          )
          
          for (let j = 0; j < results.length; j++) {
            const result = results[j]
            if (!result) continue // 防止 undefined 访问
            
            const modelId = batch[j]
            
            // 跳过无效的模型 ID
            if (!modelId || modelId === 'undefined') {
              continue
            }
            
            // TypeScript 类型守卫：分离 status 检查和 value 访问
            if (result.status === 'fulfilled') {
              if (result.value?.info?.supported_parameters) {
                modelStore.updateModelParameterSupport(result.value.modelId, result.value.info)
                successCount++
              }
            } else if (result.status === 'rejected') {
              errorCount++
              // 仅在控制台输出简短警告，不显示详细错误
              const errorMsg = result.reason?.message || String(result.reason)
              if (errorMsg.includes('Model not found') || errorMsg.includes('404')) {
                // 404 错误说明模型不存在或不支持参数查询，静默跳过
                // 使用 debug 级别避免日志噪音
              } else {
                // 其他错误才显示警告
                console.warn(`⚠️ 获取模型参数失败 (${modelId}): ${errorMsg}`)
              }
            }
          }
        }
        
        console.log(`✓ 模型参数获取完成: 成功 ${successCount} 个${errorCount > 0 ? `，跳过 ${errorCount} 个` : ''}`)
        
        // 🎯 Phase 2: 构建统一能力表
        console.log('🎯 正在构建模型能力表...')
        try {
          const { buildModelCapabilityMap } = await import('./services/providers/modelCapability')
          
          // 收集所有已获取参数的模型数据
          const modelDataForCapability: any[] = []
          for (const model of models) {
            const modelId = model.id || model
            if (!modelId) continue
            
            // 兼容新接口：getModelParameterSupport 存储模型参数支持信息
            const paramSupport = typeof modelId === 'string' && modelStore.getModelParameterSupport
              ? modelStore.getModelParameterSupport(modelId)
              : null

            if (paramSupport) {
              // 优先使用原始元数据
              if ((paramSupport as any)["raw"]) {
                modelDataForCapability.push((paramSupport as any)["raw"])
              } else if (Array.isArray((paramSupport as any)["supported_parameters"])) {
                // 兼容回退：仅有 supported_parameters 时也构造最小模型数据
                // 使用方括号访问索引签名属性
                modelDataForCapability.push({
                  id: (paramSupport as any)["model"] || modelId,
                  name: (paramSupport as any)["model"] || modelId,
                  supported_parameters: (paramSupport as any)["supported_parameters"],
                  top_provider: {},
                  pricing: {},
                })
              }
            }
          }
          
          if (modelDataForCapability.length > 0) {
            const capabilityMap = buildModelCapabilityMap({ data: modelDataForCapability })
            console.log(`✓ 模型能力表构建完成: ${capabilityMap.size} 个模型`)
            
            // 将能力表存储到 modelStore
            modelStore.setModelCapabilityMap(capabilityMap)
            
            // 注册到 CapabilityRegistry（统一查询接口）
            const { registerCapability } = await import('./services/capabilityRegistry')
            for (const [modelId, cap] of capabilityMap) {
              registerCapability(modelId, cap)
            }
            console.log(`✓ 已注册 ${capabilityMap.size} 个模型能力到 Registry`)
          } else {
            console.log('ℹ️ 没有可用的模型数据，跳过能力表构建')
          }
        } catch (capError) {
          console.error('⚠️ 构建模型能力表失败:', capError)
        }
      }
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
