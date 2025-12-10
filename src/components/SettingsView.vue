<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores'
import type { AIProvider, WebSearchEngine } from '../stores'
import { useModelStore } from '../stores/model'
import { aiChatService } from '../services/aiChatService'
import { extractModelSeries } from '../services/providers/OpenRouterService'

const store = useAppStore()
const modelStore = useModelStore()
const isLoading = ref(false)
const saveMessage = ref('')
const showGeminiPassword = ref(false)
const showOpenRouterPassword = ref(false)

// 滚动容器引用
const settingsContainer = ref<HTMLElement | null>(null)
let scrollTimer: number | null = null

// 当前激活的 Provider
const activeProvider = computed({
  get: () => store.activeProvider,
  set: (value: AIProvider) => {
    store.activeProvider = value
  }
})

// Gemini API Key
const geminiApiKey = computed({
  get: () => store.geminiApiKey,
  set: (value: string) => {
    store.geminiApiKey = value
  }
})

// OpenRouter API Key
const openRouterApiKey = computed({
  get: () => store.openRouterApiKey,
  set: (value: string) => {
    store.openRouterApiKey = value
  }
})

// OpenRouter Base URL
const openRouterBaseUrl = computed({
  get: () => store.openRouterBaseUrl,
  set: (value: string) => {
    store.openRouterBaseUrl = value
  }
})

const webSearchEngine = computed({
  get: () => store.webSearchEngine,
  set: (value: WebSearchEngine) => {
    store.webSearchEngine = value
  }
})

// 默认模型
const defaultModel = computed({
  get: () => store.defaultModel,
  set: (value: string) => {
    store.defaultModel = value
  }
})

// 延迟发送计时器（毫秒）
const sendDelayMs = ref<number>(0)

// 超时保护定时器（毫秒）
const sendTimeoutMs = ref<number>(60000)

// 初始化加载配置
onMounted(() => {
  sendDelayMs.value = store.sendDelayMs
  sendTimeoutMs.value = store.sendTimeoutMs
})

// 获取可用模型列表（用于默认模型选择器）
const availableModelsForDefault = computed(() => {
  return modelStore.modelDataMap
})

// 监听 Provider 切换，自动刷新模型列表
watch(activeProvider, async (newProvider, oldProvider) => {
  if (newProvider !== oldProvider) {
    console.log(`Provider 切换: ${oldProvider} → ${newProvider}`)
    saveMessage.value = ''
    
    // 检查新 Provider 的 API Key 是否已配置
    const hasApiKey = newProvider === 'Gemini' 
      ? store.geminiApiKey.trim() 
      : store.openRouterApiKey.trim()
    
    if (hasApiKey) {
      try {
        saveMessage.value = '正在加载模型列表...'
        // @ts-ignore
        const modelData = await aiChatService.listAvailableModels(store)
        
        // 🔧 规范化处理：支持对象数组（OpenRouter）和字符串数组（Gemini）
        const models = (Array.isArray(modelData) ? modelData : [])
          .filter((item: any) => item && (typeof item === 'string' || item.id))
          .map((item: any) => {
            if (typeof item === 'string') {
              return { id: item, name: item }
            }
            return {
              id: String(item.id),
              name: item.name || String(item.id),
              description: item.description,
              context_length: item.context_length,
              max_output_tokens: item.max_output_tokens,
              pricing: item.pricing,
              architecture: item.architecture,
              series: extractModelSeries(String(item.id)),  // 🔧 从 ID 提取模型系列
              input_modalities: item.architecture?.input_modalities || item.input_modalities || ['text'],
              output_modalities: item.architecture?.output_modalities || item.output_modalities || ['text'],
              supportsVision: (item.architecture?.input_modalities || item.input_modalities || []).includes('image'),
              supportsImageOutput: (item.architecture?.output_modalities || item.output_modalities || []).includes('image'),
              supportsReasoning: item.architecture?.reasoning === true
            }
          })
        
        modelStore.setAvailableModels(models)
        saveMessage.value = `已切换到 ${newProvider}，加载了 ${models.length} 个模型`
        console.log(`✓ 已为 ${newProvider} 加载 ${models.length} 个模型`)
      } catch (error) {
        console.error('切换 Provider 后加载模型失败:', error)
        saveMessage.value = `已切换到 ${newProvider}，但加载模型失败，请检查 API Key`
      }
    } else {
      saveMessage.value = `已切换到 ${newProvider}，请先配置 API Key`
    }
  }
})

const togglePasswordVisibility = (provider: 'gemini' | 'openrouter') => {
  if (provider === 'gemini') {
    showGeminiPassword.value = !showGeminiPassword.value
  } else {
    showOpenRouterPassword.value = !showOpenRouterPassword.value
  }
}

const saveSettings = async () => {
  isLoading.value = true
  saveMessage.value = ''

  try {
    // 保存 Provider 选择
    await store.saveActiveProvider(activeProvider.value)
    
    // 根据当前 Provider 保存对应的 API Key
    if (activeProvider.value === 'Gemini') {
      if (!geminiApiKey.value.trim()) {
        saveMessage.value = '请输入 Gemini API Key'
        isLoading.value = false
        return
      }
      
      // Gemini API Key 格式验证（通常以 AIza 开头）
      const geminiKeyPattern = /^AIza[0-9A-Za-z_-]{35}$/
      if (!geminiKeyPattern.test(geminiApiKey.value.trim())) {
        console.warn('Gemini API Key 格式可能不正确')
        saveMessage.value = '⚠️ API Key 格式可能不正确，Gemini Key 通常以 AIza 开头且长度为 39 位'
        isLoading.value = false
        return
      }
      
      await store.saveGeminiApiKey(geminiApiKey.value)
    } else if (activeProvider.value === 'OpenRouter') {
      if (!openRouterApiKey.value.trim()) {
        saveMessage.value = '请输入 OpenRouter API Key'
        isLoading.value = false
        return
      }
      
      // OpenRouter API Key 格式验证（通常以 sk-or- 开头）
      const openRouterKeyPattern = /^sk-or-v1-[0-9a-f]{64}$/
      if (!openRouterKeyPattern.test(openRouterApiKey.value.trim())) {
        console.warn('OpenRouter API Key 格式可能不正确，但仍尝试保存')
        // 不阻止保存，只是警告
      }
      
      await store.saveOpenRouterApiKey(openRouterApiKey.value)
      await store.saveOpenRouterBaseUrl(openRouterBaseUrl.value)
      await store.saveWebSearchEngine(webSearchEngine.value as WebSearchEngine)
    }
    
    saveMessage.value = '设置保存成功！正在加载模型列表...'
    console.log('保存设置成功，Provider:', activeProvider.value)
    
    // 保存成功后立即加载可用模型列表
    try {
      console.log('开始加载模型列表...')
      // @ts-ignore
      const modelData = await aiChatService.listAvailableModels(store)
      console.log('模型列表加载成功:', modelData)
      
      // 🔧 规范化处理：支持对象数组（OpenRouter）和字符串数组（Gemini）
      const models = (Array.isArray(modelData) ? modelData : [])
        .filter((item: any) => item && (typeof item === 'string' || item.id))
        .map((item: any) => {
          if (typeof item === 'string') {
            return { id: item, name: item }
          }
          return {
            id: String(item.id),
            name: item.name || String(item.id),
            description: item.description,
            context_length: item.context_length,
            max_output_tokens: item.max_output_tokens,
            pricing: item.pricing,
            architecture: item.architecture,
            series: extractModelSeries(String(item.id)),  // 🔧 从 ID 提取模型系列
            input_modalities: item.architecture?.input_modalities || item.input_modalities || ['text'],
            output_modalities: item.architecture?.output_modalities || item.output_modalities || ['text'],
            supportsVision: (item.architecture?.input_modalities || item.input_modalities || []).includes('image'),
            supportsImageOutput: (item.architecture?.output_modalities || item.output_modalities || []).includes('image'),
            supportsReasoning: item.architecture?.reasoning === true
          }
        })
      
      modelStore.setAvailableModels(models)
      saveMessage.value = `设置保存成功！已加载 ${models.length} 个可用模型`
    } catch (modelError) {
      console.error('加载模型列表失败:', modelError)
      saveMessage.value = '设置已保存，但加载模型列表失败。请检查 API Key 是否正确。'
    }
  } catch (error) {
    saveMessage.value = '保存失败，请重试'
    console.error('保存设置失败:', error)
  } finally {
    isLoading.value = false
  }
}

const clearApiKey = (provider: 'gemini' | 'openrouter') => {
  if (provider === 'gemini') {
    geminiApiKey.value = ''
  } else {
    openRouterApiKey.value = ''
  }
  saveMessage.value = ''
}

// 保存延迟发送计时器配置
const saveSendDelayMs = async () => {
  try {
    // 验证并规范化为整数（不接受小数）
    const normalized = Math.max(0, Math.floor(Number(sendDelayMs.value) || 0))
    sendDelayMs.value = normalized
    
    await store.setSendDelayMs(normalized)
    const displayText = normalized === 0 
      ? '已禁用（立即发送）' 
      : `${normalized}ms（${(normalized / 1000).toFixed(1)}秒）`
    saveMessage.value = `✓ 已保存延迟发送计时器设置：${displayText}`
    console.log('✓ 延迟发送计时器配置已保存:', normalized)
  } catch (error) {
    saveMessage.value = '保存延迟发送计时器配置失败，请重试'
    console.error('保存延迟发送计时器配置失败:', error)
  }
}

// 保存超时保护定时器配置
const saveSendTimeoutMs = async () => {
  try {
    // 验证并规范化为整数（不接受小数）
    const normalized = Math.max(0, Math.floor(Number(sendTimeoutMs.value) || 0))
    sendTimeoutMs.value = normalized
    
    await store.setSendTimeoutMs(normalized)
    const displayText = normalized === 0 
      ? '已禁用' 
      : `${normalized}ms（${(normalized / 1000).toFixed(1)}秒）`
    saveMessage.value = `✓ 已保存超时保护定时器设置：${displayText}`
    console.log('✓ 超时保护定时器配置已保存:', normalized)
  } catch (error) {
    saveMessage.value = '保存超时保护定时器配置失败，请重试'
    console.error('保存超时保护定时器配置失败:', error)
  }
}

// 保存默认模型
const saveDefaultModel = async () => {
  try {
    await store.saveDefaultModel(defaultModel.value)
    saveMessage.value = '默认模型已保存！'
  } catch (error) {
    console.error('保存默认模型失败:', error)
    saveMessage.value = '保存默认模型失败'
  }
}

// 滚动条自动隐藏处理
const handleScroll = () => {
  if (!settingsContainer.value) return
  
  settingsContainer.value.classList.add('scrolling')
  
  if (scrollTimer !== null) {
    clearTimeout(scrollTimer)
  }
  
  scrollTimer = window.setTimeout(() => {
    settingsContainer.value?.classList.remove('scrolling')
  }, 1000)
}

onMounted(() => {
  if (settingsContainer.value) {
    settingsContainer.value.addEventListener('scroll', handleScroll)
  }
})

onUnmounted(() => {
  if (settingsContainer.value) {
    settingsContainer.value.removeEventListener('scroll', handleScroll)
  }
  if (scrollTimer !== null) {
    clearTimeout(scrollTimer)
  }
})
</script>

<template>
  <div ref="settingsContainer" class="h-full bg-gray-50 overflow-y-auto scrollbar-auto-hide">
    <div class="max-w-2xl mx-auto p-6">
      <!-- 标题 -->
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-gray-800 mb-2">设置</h1>
        <p class="text-gray-600">配置您的应用偏好设置</p>
      </div>

      <!-- API 提供商选择卡片 -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <svg class="w-5 h-5 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          API 提供商
        </h2>
        
        <div class="space-y-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            选择 AI 服务提供商
          </label>
          
          <div class="grid grid-cols-2 gap-4">
            <!-- Gemini 选项 -->
            <div 
              @click="activeProvider = 'Gemini'"
              class="relative border-2 rounded-lg p-4 cursor-pointer transition-all"
              :class="activeProvider === 'Gemini' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 hover:border-gray-300'"
            >
              <div class="flex items-center">
                <input 
                  type="radio" 
                  :checked="activeProvider === 'Gemini'"
                  class="w-4 h-4 text-blue-600"
                  @click.stop="activeProvider = 'Gemini'"
                />
                <div class="ml-3">
                  <div class="text-sm font-semibold text-gray-900">Google Gemini</div>
                  <div class="text-xs text-gray-500">Google AI Studio</div>
                </div>
              </div>
            </div>

            <!-- OpenRouter 选项 -->
            <div 
              @click="activeProvider = 'OpenRouter'"
              class="relative border-2 rounded-lg p-4 cursor-pointer transition-all"
              :class="activeProvider === 'OpenRouter' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 hover:border-gray-300'"
            >
              <div class="flex items-center">
                <input 
                  type="radio" 
                  :checked="activeProvider === 'OpenRouter'"
                  class="w-4 h-4 text-blue-600"
                  @click.stop="activeProvider = 'OpenRouter'"
                />
                <div class="ml-3">
                  <div class="text-sm font-semibold text-gray-900">OpenRouter</div>
                  <div class="text-xs text-gray-500">多模型路由器</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Gemini API 配置卡片 -->
      <div v-if="activeProvider === 'Gemini'" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <svg class="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3a1 1 0 011-1h2.586l6.243-6.243C11.978 9.522 12.711 9 13.5 9H15z"></path>
          </svg>
          Gemini API 配置
        </h2>
        
        <div class="space-y-4">
          <!-- Gemini API Key 输入框 -->
          <div>
            <label for="geminiApiKey" class="block text-sm font-medium text-gray-700 mb-2">
              Gemini API Key
            </label>
            <div class="relative">
              <input
                id="geminiApiKey"
                v-model="geminiApiKey"
                :type="showGeminiPassword ? 'text' : 'password'"
                placeholder="请输入您的 Gemini API Key"
                class="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                :disabled="isLoading"
              />
              <button
                @click="() => togglePasswordVisibility('gemini')"
                type="button"
                class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                :disabled="isLoading"
              >
                <svg v-if="!showGeminiPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
                </svg>
              </button>
            </div>
            <p class="mt-2 text-sm text-gray-500">
              从 <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-blue-500 hover:text-blue-600 underline">Google AI Studio</a> 获取 API Key
            </p>
          </div>

          <!-- 按钮组 -->
          <div class="flex space-x-3 pt-2">
            <button
              @click="saveSettings"
              :disabled="isLoading || !geminiApiKey.trim()"
              class="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
            >
              <svg v-if="isLoading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {{ isLoading ? '保存中...' : '保存设置' }}
            </button>
            
            <button
              @click="() => clearApiKey('gemini')"
              :disabled="isLoading"
              class="px-6 py-3 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              清空
            </button>
          </div>
        </div>
      </div>

      <!-- OpenRouter API 配置卡片 -->
      <div v-if="activeProvider === 'OpenRouter'" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <svg class="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3a1 1 0 011-1h2.586l6.243-6.243C11.978 9.522 12.711 9 13.5 9H15z"></path>
          </svg>
          OpenRouter API 配置
        </h2>
        
        <div class="space-y-4">
          <!-- OpenRouter API Key 输入框 -->
          <div>
            <label for="openRouterApiKey" class="block text-sm font-medium text-gray-700 mb-2">
              OpenRouter API Key
            </label>
            <div class="relative">
              <input
                id="openRouterApiKey"
                v-model="openRouterApiKey"
                :type="showOpenRouterPassword ? 'text' : 'password'"
                placeholder="请输入您的 OpenRouter API Key"
                class="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                :disabled="isLoading"
              />
              <button
                @click="() => togglePasswordVisibility('openrouter')"
                type="button"
                class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                :disabled="isLoading"
              >
                <svg v-if="!showOpenRouterPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
                </svg>
              </button>
            </div>
            <p class="mt-2 text-sm text-gray-500">
              从 <a href="https://openrouter.ai/keys" target="_blank" class="text-green-500 hover:text-green-600 underline">OpenRouter</a> 获取 API Key
            </p>
          </div>

          <!-- OpenRouter Base URL (高级选项) -->
          <div>
            <label for="openRouterBaseUrl" class="block text-sm font-medium text-gray-700 mb-2">
              Base URL (高级)
            </label>
            <input
              id="openRouterBaseUrl"
              v-model="openRouterBaseUrl"
              type="text"
              placeholder="https://openrouter.ai/api/v1"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
              :disabled="isLoading"
            />
            <p class="mt-2 text-sm text-gray-500">
              通常使用默认值即可
            </p>
          </div>

          <div>
            <label for="webSearchEngine" class="block text-sm font-medium text-gray-700 mb-2">
              Web 搜索引擎
            </label>
            <select
              id="webSearchEngine"
              v-model="webSearchEngine"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
              :disabled="isLoading"
            >
              <option value="undefined">自动（优先原生，回退 Exa）</option>
              <option value="native">native</option>
              <option value="exa">exa</option>
            </select>
            <p class="mt-2 text-sm text-gray-500">
              选择搜索引擎来源，默认根据模型支持情况自动切换。
            </p>
          </div>

          <!-- 按钮组 -->
          <div class="flex space-x-3 pt-2">
            <button
              @click="saveSettings"
              :disabled="isLoading || !openRouterApiKey.trim()"
              class="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
            >
              <svg v-if="isLoading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {{ isLoading ? '保存中...' : '保存设置' }}
            </button>
            
            <button
              @click="() => clearApiKey('openrouter')"
              :disabled="isLoading"
              class="px-6 py-3 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              清空
            </button>
          </div>
        </div>
      </div>

      <!-- 保存消息 -->
      <div v-if="saveMessage" class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div class="p-3 rounded-lg" :class="saveMessage.includes('成功') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'">
          <div class="flex items-center">
            <svg v-if="saveMessage.includes('成功')" class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            {{ saveMessage }}
          </div>
        </div>
      </div>

      <!-- 默认模型设置卡片 -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <svg class="w-5 h-5 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
          </svg>
          默认模型
        </h2>
        
        <div class="space-y-4">
          <div>
            <label for="defaultModel" class="block text-sm font-medium text-gray-700 mb-2">
              新对话默认使用的模型
            </label>
            <select
              id="defaultModel"
              v-model="defaultModel"
              @change="saveDefaultModel"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
            >
              <option value="openrouter/auto">OpenRouter Auto (智能路由)</option>
              <option 
                v-for="[modelId, modelData] of availableModelsForDefault" 
                :key="modelId" 
                :value="modelId"
              >
                {{ modelData.name }} ({{ modelId }})
              </option>
            </select>
            <p class="mt-2 text-sm text-gray-500">
              创建新对话时将默认使用此模型。推荐使用 OpenRouter Auto 进行智能路由。
            </p>
          </div>
        </div>
      </div>

      <!-- 高级设置卡片 -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <svg class="w-5 h-5 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
          </svg>
          高级设置
        </h2>
        
        <div class="space-y-6">
          <!-- 延迟发送计时器配置 -->
          <div>
            <label for="sendDelayMs" class="block text-sm font-medium text-gray-700 mb-2">
              延迟发送计时器（毫秒）
            </label>
            <div class="flex items-center space-x-3">
              <input
                id="sendDelayMs"
                v-model.number="sendDelayMs"
                type="number"
                min="0"
                max="10000"
                step="1000"
                placeholder="输入毫秒数（如：2000）"
                class="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors"
              />
              <button
                @click="saveSendDelayMs"
                class="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition-colors"
              >
                保存
              </button>
            </div>
            <p class="mt-2 text-sm text-gray-500">
              设置消息发送前的延迟时间（毫秒）。在此期间可以撤回消息。
              <br />
              <strong>当前设置：</strong>{{ sendDelayMs === 0 ? '已禁用（立即发送）' : `${sendDelayMs}ms（${(sendDelayMs / 1000).toFixed(1)}秒）` }}
              <br />
              <strong>推荐值：</strong>2000ms（2秒）｜设置为 0 可禁用延迟发送（立即发送）
            </p>
          </div>

          <!-- 超时保护定时器配置 -->
          <div>
            <label for="sendTimeoutMs" class="block text-sm font-medium text-gray-700 mb-2">
              超时保护定时器（毫秒）
            </label>
            <div class="flex items-center space-x-3">
              <input
                id="sendTimeoutMs"
                v-model.number="sendTimeoutMs"
                type="number"
                min="0"
                max="300000"
                step="1000"
                placeholder="输入毫秒数（如：60000）"
                class="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors"
              />
              <button
                @click="saveSendTimeoutMs"
                class="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition-colors"
              >
                保存
              </button>
            </div>
            <p class="mt-2 text-sm text-gray-500">
              设置发送消息的超时保护时长（毫秒）。当消息发送超过此时间未响应时，系统将自动重置状态。
              <br />
              <strong>当前设置：</strong>{{ sendTimeoutMs === 0 ? '已禁用' : `${sendTimeoutMs}ms（${(sendTimeoutMs / 1000).toFixed(1)}秒）` }}
              <br />
              <strong>推荐值：</strong>60000ms（60秒）｜设置为 0 可禁用超时保护
            </p>
          </div>
        </div>
      </div>

      <!--其他设置卡片 -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <svg class="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
          应用信息
        </h2>
        
        <div class="border-t border-gray-200 pt-4 mt-2">
          <p class="text-sm text-gray-500 mb-4">
            使用 SQLite + WAL 持久化存储，获得更高的稳定性与全文搜索能力。
          </p>
        </div>

        <div class="space-y-4 text-sm text-gray-600 mt-6">
          <div class="flex items-center justify-between py-2">
            <span>持久化存储</span>
            <span class="font-semibold text-gray-800">SQLite (始终启用)</span>
          </div>
          <div class="flex items-center justify-between py-2">
            <span>当前提供商</span>
            <span class="font-semibold text-gray-800">{{ activeProvider }}</span>
          </div>
          <div class="flex items-center justify-between py-2">
            <span>版本信息</span>
            <span class="font-mono text-gray-800">v1.0.0</span>
          </div>
          <div class="flex items-center justify-between py-2">
            <span>构建版本</span>
            <span class="font-mono text-gray-800">Electron + Vue.js</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
