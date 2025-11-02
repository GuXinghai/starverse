<script setup lang="ts">
// @ts-ignore - chatStore.js is a JavaScript file
import { useChatStore } from '../stores/chatStore'
import { computed, onMounted, ref, onBeforeUnmount } from 'vue'

// Props
const props = defineProps<{
  conversationId?: string  // 可选，如果不提供则使用 activeTabId
}>()

// 获取 chatStore 实例
const chatStore = useChatStore()

// UI 状态
const isOpen = ref(false)
const hoveredCategory = ref<string | null>(null)
const hoveredSubcategory = ref<string | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
let hideTimer: NodeJS.Timeout | null = null

// 设置悬停分类（添加延迟消失）
const setHoveredCategory = (category: string | null) => {
  // 清除之前的定时器
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  
  if (category) {
    // 立即显示
    hoveredCategory.value = category
  } else {
    // 延迟 300ms 后隐藏
    hideTimer = setTimeout(() => {
      hoveredCategory.value = null
    }, 300)
  }
}

// 通过 store 获取状态
const availableModels = computed(() => chatStore.availableModels)

// 分类和排序模型
const categorizedModels = computed(() => {
  const models = availableModels.value
  
  const categories = {
    gemini: {
      label: 'Gemini',
      subcategories: {
        latest: { label: '🔄 最新版本 (Latest)', models: [] as string[] },
        v25: { label: 'Gemini 2.5', models: [] as string[] },
        v20: { label: 'Gemini 2.0', models: [] as string[] },
        v15: { label: 'Gemini 1.5', models: [] as string[] },
        v10: { label: 'Gemini 1.0', models: [] as string[] }
      }
    },
    gemma: { label: 'Gemma', models: [] as string[] },
    image: { label: '图像生成', models: [] as string[] },
    video: { label: '视频生成', models: [] as string[] },
    audio: { label: '音频处理', models: [] as string[] }
  }
  
  // 分类模型
  models.forEach((model: string) => {
    const lowerModel = model.toLowerCase()
    if (lowerModel.includes('imagen')) {
      categories.image.models.push(model)
    } else if (lowerModel.includes('veo')) {
      categories.video.models.push(model)
    } else if (lowerModel.includes('audio') || lowerModel.includes('chirp')) {
      categories.audio.models.push(model)
    } else if (lowerModel.includes('gemma')) {
      categories.gemma.models.push(model)
    } else if (lowerModel.includes('gemini')) {
      // Gemini 模型按版本细分
      if (lowerModel.includes('latest')) {
        // latest 版本优先分到最新版本分类
        categories.gemini.subcategories.latest.models.push(model)
      } else if (lowerModel.includes('2.5')) {
        categories.gemini.subcategories.v25.models.push(model)
      } else if (lowerModel.includes('2.0')) {
        categories.gemini.subcategories.v20.models.push(model)
      } else if (lowerModel.includes('1.5')) {
        categories.gemini.subcategories.v15.models.push(model)
      } else {
        categories.gemini.subcategories.v10.models.push(model)
      }
    }
  })
  
  // 为每个分类排序（按 Google Gemini 版本策略排序）
  const sortModels = (models: string[]) => {
    // 过滤掉实验版本（exp）
    const filteredModels = models.filter(model => !model.includes('-exp'))
    
    return filteredModels.sort((a, b) => {
      // 1. 最新版本（latest）优先级最高
      const aIsLatest = a.includes('latest')
      const bIsLatest = b.includes('latest')
      if (aIsLatest && !bIsLatest) return -1
      if (!aIsLatest && bIsLatest) return 1
      
      // 2. 预览版本（preview）次优先
      const aIsPreview = a.includes('preview')
      const bIsPreview = b.includes('preview')
      if (aIsPreview && !bIsPreview) return -1
      if (!aIsPreview && bIsPreview) return 1
      
      // 3. 同等级别内部排序
      // flash 优先于 pro（性能考虑）
      const aIsFlash = a.includes('flash')
      const bIsFlash = b.includes('flash')
      if (aIsFlash && !bIsFlash) return -1
      if (!aIsFlash && bIsFlash) return 1
      
      // thinking 模型优先（特殊能力）
      const aIsThinking = a.includes('thinking')
      const bIsThinking = b.includes('thinking')
      if (aIsThinking && !bIsThinking) return -1
      if (!aIsThinking && bIsThinking) return 1
      
      // 默认按字母排序
      return a.localeCompare(b)
    })
  }
  
  // 排序 Gemini 子分类
  Object.values(categories.gemini.subcategories).forEach(subcategory => {
    subcategory.models = sortModels(subcategory.models)
  })
  
  // 排序其他分类
  categories.gemma.models = sortModels(categories.gemma.models)
  categories.image.models = sortModels(categories.image.models)
  categories.video.models = sortModels(categories.video.models)
  categories.audio.models = sortModels(categories.audio.models)
  
  return categories
})

// 获取当前对话的模型（如果提供了 conversationId）
const currentConversation = computed(() => {
  if (!props.conversationId) return null
  return chatStore.conversations.find((conv: any) => conv.id === props.conversationId)
})

// 选中的模型：优先使用对话的模型，否则使用全局默认模型
const selectedModel = computed({
  get: () => {
    // 如果有对话 ID，使用对话的模型
    if (currentConversation.value?.model) {
      return currentConversation.value.model
    }
    // 否则使用全局默认模型
    return chatStore.selectedModel
  },
  set: (value: string) => {
    chatStore.setSelectedModel(value)
    
    // 🔒 必须提供 conversationId，不允许依赖全局状态
    if (!props.conversationId) {
      console.error('❌ ModelSelector 必须提供 conversationId prop，不能依赖全局状态')
      return
    }
    
    chatStore.updateConversationModel(props.conversationId, value)
  }
})

// 选择模型
const selectModel = (model: string) => {
  selectedModel.value = model
  isOpen.value = false
  hoveredCategory.value = null
  hoveredSubcategory.value = null
}

// 切换下拉菜单
const toggleDropdown = () => {
  isOpen.value = !isOpen.value
  if (!isOpen.value) {
    hoveredCategory.value = null
    hoveredSubcategory.value = null
  }
}

// 关闭下拉菜单（点击外部时）
const closeDropdown = () => {
  isOpen.value = false
  hoveredCategory.value = null
  hoveredSubcategory.value = null
}

// 点击外部关闭
const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    closeDropdown()
  }
}

// 格式化模型名称显示
const formatModelName = (modelName: string) => {
  // 从 "models/gemini-2.0-flash-exp" 提取 "gemini-2.0-flash-exp"
  const parts = modelName.split('/')
  let name = parts[parts.length - 1]
  
  // 添加版本类型标识
  if (name.includes('latest')) {
    name += ' 🔄'  // 最新版标识
  } else if (name.includes('preview')) {
    name += ' 🔍'  // 预览版标识
  } else if (!name.includes('exp')) {
    // 稳定版不加标识，保持简洁
  }
  
  return name
}

// 格式化子菜单中的模型名称（去掉重复前缀）
const formatSubmenuModelName = (modelName: string, categoryPrefix: string) => {
  const parts = modelName.split('/')
  let name = parts[parts.length - 1]
  
  // 去掉分类前缀（例如 "gemini-2.5-" 或 "gemini-" 或 "gemma-"）
  name = name.replace(categoryPrefix, '')
  
  // 添加版本类型标识
  if (modelName.includes('latest')) {
    name += ' 🔄'  // 最新版标识
  } else if (modelName.includes('preview')) {
    name += ' 🔍'  // 预览版标识
  } else if (modelName.includes('exp')) {
    name += ' ⚠️'  // 实验版标识
  }
  
  return name
}

// 组件挂载时输出调试信息
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  console.log('ModelSelector 挂载完成')
  console.log('conversationId:', props.conversationId)
  console.log('可用模型数量:', availableModels.value.length)
  console.log('当前选中模型:', selectedModel.value)
  console.log('对话模型:', currentConversation.value?.model)
})

// 卸载时移除事件监听
onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="model-selector relative" ref="dropdownRef">
    <!-- 选择器按钮 -->
    <button
      @click="toggleDropdown"
      class="px-3 py-1.5 pr-8 text-sm border-0 rounded bg-gray-50 hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer text-left"
      style="min-width: 180px; max-width: 250px;"
    >
      {{ formatModelName(selectedModel) }}
    </button>
    
    <!-- 下拉箭头 -->
    <div class="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
      <svg 
        class="w-4 h-4 text-gray-400 transition-transform"
        :class="{ 'rotate-180': isOpen }"
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
      </svg>
    </div>

    <!-- 下拉菜单 -->
    <div
      v-show="isOpen"
      class="absolute left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
      style="min-width: 200px; max-width: 300px;"
    >
      <!-- Gemini 最新版本 -->
      <div
        v-if="categorizedModels.gemini.subcategories.latest.models.length > 0"
        class="relative"
        @mouseenter="setHoveredCategory('gemini-latest')"
        @mouseleave="setHoveredCategory(null)"
      >
        <div class="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between">
          <span class="text-sm font-medium">🔄 最新版本</span>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </div>
        
        <!-- 子菜单 -->
        <div
          v-if="hoveredCategory === 'gemini-latest'"
          @mouseenter="setHoveredCategory('gemini-latest')"
          @mouseleave="setHoveredCategory(null)"
          class="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-lg border border-gray-200 w-max z-[60]"
        >
          <div
            v-for="model in categorizedModels.gemini.subcategories.latest.models"
            :key="model"
            @click="selectModel(model)"
            class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm whitespace-nowrap"
          >
            {{ formatSubmenuModelName(model, 'gemini-') }}
          </div>
        </div>
      </div>

      <!-- Gemini 2.5 -->
      <div
        v-if="categorizedModels.gemini.subcategories.v25.models.length > 0"
        class="relative"
        @mouseenter="setHoveredCategory('gemini-25')"
        @mouseleave="setHoveredCategory(null)"
      >
        <div class="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between">
          <span class="text-sm font-medium">Gemini 2.5</span>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </div>
        
        <!-- 子菜单 -->
        <div
          v-if="hoveredCategory === 'gemini-25'"
          @mouseenter="setHoveredCategory('gemini-25')"
          @mouseleave="setHoveredCategory(null)"
          class="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-lg border border-gray-200 w-max z-[60]"
        >
          <div
            v-for="model in categorizedModels.gemini.subcategories.v25.models"
            :key="model"
            @click="selectModel(model)"
            class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm whitespace-nowrap"
          >
            {{ formatSubmenuModelName(model, 'gemini-2.5-') }}
          </div>
        </div>
      </div>

      <!-- Gemini 2.0 -->
      <div
        v-if="categorizedModels.gemini.subcategories.v20.models.length > 0"
        class="relative"
        @mouseenter="setHoveredCategory('gemini-20')"
        @mouseleave="setHoveredCategory(null)"
      >
        <div class="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between">
          <span class="text-sm font-medium">Gemini 2.0</span>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </div>
        
        <!-- 子菜单 -->
        <div
          v-if="hoveredCategory === 'gemini-20'"
          @mouseenter="setHoveredCategory('gemini-20')"
          @mouseleave="setHoveredCategory(null)"
          class="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-lg border border-gray-200 w-max z-[60]"
        >
          <div
            v-for="model in categorizedModels.gemini.subcategories.v20.models"
            :key="model"
            @click="selectModel(model)"
            class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm whitespace-nowrap"
          >
            {{ formatSubmenuModelName(model, 'gemini-2.0-') }}
          </div>
        </div>
      </div>

      <!-- Gemini 1.5 -->
      <div
        v-if="categorizedModels.gemini.subcategories.v15.models.length > 0"
        class="relative"
        @mouseenter="setHoveredCategory('gemini-15')"
        @mouseleave="setHoveredCategory(null)"
      >
        <div class="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between">
          <span class="text-sm font-medium">Gemini 1.5</span>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </div>
        
        <!-- 子菜单 -->
        <div
          v-if="hoveredCategory === 'gemini-15'"
          @mouseenter="setHoveredCategory('gemini-15')"
          @mouseleave="setHoveredCategory(null)"
          class="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-lg border border-gray-200 w-max z-[60]"
        >
          <div
            v-for="model in categorizedModels.gemini.subcategories.v15.models"
            :key="model"
            @click="selectModel(model)"
            class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm whitespace-nowrap"
          >
            {{ formatSubmenuModelName(model, 'gemini-1.5-') }}
          </div>
        </div>
      </div>

      <!-- 分隔线 -->
      <div v-if="categorizedModels.gemma.models.length > 0 || categorizedModels.image.models.length > 0" class="border-t border-gray-200 my-1"></div>

      <!-- Gemma -->
      <div
        v-if="categorizedModels.gemma.models.length > 0"
        class="relative"
        @mouseenter="setHoveredCategory('gemma')"
        @mouseleave="setHoveredCategory(null)"
      >
        <div class="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between">
          <span class="text-sm font-medium">Gemma</span>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </div>
        
        <!-- 子菜单 -->
        <div
          v-if="hoveredCategory === 'gemma'"
          @mouseenter="setHoveredCategory('gemma')"
          @mouseleave="setHoveredCategory(null)"
          class="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-lg border border-gray-200 w-max z-[60]"
        >
          <div
            v-for="model in categorizedModels.gemma.models"
            :key="model"
            @click="selectModel(model)"
            class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm whitespace-nowrap"
          >
            {{ formatSubmenuModelName(model, 'gemma-') }}
          </div>
        </div>
      </div>

      <!-- 其他模型类别类似处理... -->
      
      <!-- 当前使用的实验版本 -->
      <div v-if="selectedModel && selectedModel.includes('-exp') && availableModels.includes(selectedModel)" class="border-t border-gray-200">
        <div
          @click="selectModel(selectedModel)"
          class="px-3 py-2 hover:bg-yellow-50 cursor-pointer text-sm text-yellow-700"
        >
          {{ formatModelName(selectedModel) }}
          <span class="text-xs ml-1">(当前使用)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 下拉箭头旋转动画 */
.rotate-180 {
  transform: rotate(180deg);
}
</style>
