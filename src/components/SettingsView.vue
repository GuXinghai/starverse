<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '../stores'
// @ts-ignore - chatStore.js is a JavaScript file
import { useChatStore } from '../stores/chatStore'
// @ts-ignore - geminiService.js is a JavaScript file
import { listAvailableModels } from '../services/geminiService'

const store = useAppStore()
const chatStore = useChatStore()
const isLoading = ref(false)
const saveMessage = ref('')
const showPassword = ref(false)

// 使用计算属性绑定 store 中的 apiKey
const apiKey = computed({
  get: () => store.apiKey,
  set: (value: string) => {
    store.apiKey = value
  }
})

// 组件挂载时不需要重新初始化，因为 main.ts 已经初始化过了
// onMounted 留空或者可以用于其他初始化逻辑

const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value
}

const saveSettings = async () => {
  if (!apiKey.value.trim()) {
    saveMessage.value = '请输入 API Key'
    return
  }

  isLoading.value = true
  saveMessage.value = ''

  try {
    const success = await store.saveApiKey(apiKey.value)
    
    if (success) {
      saveMessage.value = 'API Key 保存成功！正在加载模型列表...'
      console.log('保存 API Key 成功')
      
      // 保存成功后立即加载可用模型列表
      try {
        console.log('开始加载模型列表...')
        // @ts-ignore
        const models = await listAvailableModels(apiKey.value)
        console.log('模型列表加载成功:', models)
        chatStore.setAvailableModels(models)
        saveMessage.value = `API Key 保存成功！已加载 ${models.length} 个可用模型`
      } catch (modelError) {
        console.error('加载模型列表失败:', modelError)
        saveMessage.value = 'API Key 已保存，但加载模型列表失败。请检查 API Key 是否正确。'
      }
    } else {
      saveMessage.value = '保存失败，请重试'
    }
  } catch (error) {
    saveMessage.value = '保存失败，请重试'
    console.error('保存 API Key 失败:', error)
  } finally {
    isLoading.value = false
  }
}

const clearApiKey = () => {
  apiKey.value = ''
  saveMessage.value = ''
}
</script>

<template>
  <div class="h-full bg-gray-50 overflow-y-auto">
    <div class="max-w-2xl mx-auto p-6">
      <!-- 标题 -->
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-gray-800 mb-2">设置</h1>
        <p class="text-gray-600">配置您的应用偏好设置</p>
      </div>

      <!-- API 设置卡片 -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <svg class="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3a1 1 0 011-1h2.586l6.243-6.243C11.978 9.522 12.711 9 13.5 9H15z"></path>
          </svg>
          API 配置
        </h2>
        
        <div class="space-y-4">
          <!-- API Key 输入框 -->
          <div>
            <label for="apiKey" class="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div class="relative">
              <input
                id="apiKey"
                v-model="apiKey"
                :type="showPassword ? 'text' : 'password'"
                placeholder="请输入您的 API Key"
                class="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                :disabled="isLoading"
              />
              <button
                @click="togglePasswordVisibility"
                type="button"
                class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                :disabled="isLoading"
              >
                <!-- 眼睛图标 (显示) -->
                <svg v-if="!showPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
                <!-- 眼睛斜杠图标 (隐藏) -->
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
                </svg>
              </button>
            </div>
            <p class="mt-2 text-sm text-gray-500">
              您的 API Key 将被安全加密存储在本地
            </p>
          </div>

          <!-- 保存消息 -->
          <div v-if="saveMessage" class="p-3 rounded-lg" :class="saveMessage.includes('成功') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'">
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

          <!-- 按钮组 -->
          <div class="flex space-x-3 pt-2">
            <button
              @click="saveSettings"
              :disabled="isLoading || !apiKey.trim()"
              class="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
            >
              <svg v-if="isLoading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {{ isLoading ? '保存中...' : '保存' }}
            </button>
            
            <button
              @click="clearApiKey"
              :disabled="isLoading"
              class="px-6 py-3 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              清空
            </button>
          </div>
        </div>
      </div>

      <!-- 其他设置卡片 -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <svg class="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
          应用设置
        </h2>
        
        <div class="space-y-4 text-sm text-gray-600">
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