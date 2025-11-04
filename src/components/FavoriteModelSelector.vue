<template>
  <div class="favorite-model-selector">
    <!-- 收藏模型快速选择器 -->
    <div v-if="favoriteModels.length > 0" class="favorites-list">
      <button
        v-for="model in favoriteModels"
        :key="model.id"
        @click="selectModel(model.id)"
        :class="[
          'favorite-model-btn',
          { 'active': isCurrentModel(model.id) }
        ]"
        :title="`切换到 ${model.name}\n上下文: ${formatContextLength(model.context_length)}\n价格: $${model.pricing.prompt}/$${model.pricing.completion}`"
      >
        <div class="model-info">
          <!-- 滚动容器 -->
          <div 
            class="model-name-container"
            :class="{ 'scrolling': scrollingModels[model.id] }"
          >
            <!-- 环带：原始文本 + 空白间隙 + 重复文本（形成无缝循环） -->
            <span 
              :ref="el => setNameRef(model.id, el)"
              class="model-name-belt"
              :style="scrollingModels[model.id] ? {
                animationName: scrollingModels[model.id].animName,
                animationDuration: `${scrollingModels[model.id].T}ms`,
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite'
              } : {}"
            >
              <span class="belt-text">{{ formatModelName(model.name) }}</span>
              <span 
                v-if="scrollingModels[model.id]" 
                class="belt-gap"
                :style="{ width: `${scrollingModels[model.id].G}px` }"
              ></span>
              <span v-if="scrollingModels[model.id]" class="belt-text">{{ formatModelName(model.name) }}</span>
            </span>
            <!-- 非滚动时只显示一次 -->
            <span v-if="!scrollingModels[model.id]" class="model-name-static">
              {{ formatModelName(model.name) }}
            </span>
          </div>
          <span class="model-series">{{ model.series }}</span>
        </div>
        <div class="model-meta">
          <span class="context-badge" v-if="model.context_length">
            {{ formatContextLength(model.context_length) }}
          </span>
          <span class="modality-badge" v-if="hasMultimodal(model)">
            🎨
          </span>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useChatStore } from '../stores/chatStore'

const emit = defineEmits(['open-advanced-picker'])

const chatStore = useChatStore()

// 从 store 获取收藏模型列表
const favoriteModels = computed(() => chatStore.favoriteModels)

// 存储每个模型名称的 DOM 引用
const nameRefs = ref({})

// 存储需要滚动的模型 ID 及其宽度信息
const scrollingModels = ref({})

// 设置名称元素引用
const setNameRef = (modelId, el) => {
  if (el) {
    nameRefs.value[modelId] = el
  }
}

// 检测哪些文本需要滚动
const detectOverflow = async () => {
  await nextTick()
  const newScrollingModels = {}
  
  // 清除旧的动画样式
  const oldStyle = document.getElementById('favorite-scroll-animations')
  if (oldStyle) {
    oldStyle.remove()
  }
  
  // 创建新的样式元素
  const styleEl = document.createElement('style')
  styleEl.id = 'favorite-scroll-animations'
  let animations = ''
  
  for (const [modelId, el] of Object.entries(nameRefs.value)) {
    if (el) {
      // 获取容器（.model-info）的可用宽度
      const container = el.closest('.model-info')
      const W = container.offsetWidth - 100  // 减去右侧 meta 区域
      
      // 获取文本的实际宽度
      const textSpan = el.querySelector('.belt-text')
      if (!textSpan) continue
      
      const C = textSpan.offsetWidth  // 文字区长度
      
      // 只有当文本宽度明显大于容器宽度时才滚动（留 5px 容差）
      if (C > W + 5) {
        // 需要滚动
        // 环带参数
        const G = Math.max(40, 0.5 * C)  // 空白区长度（至少40px）
        const L = C + G    // 总环长 = C + G
        
        // 速度参数（px/s）
        const v1 = 50  // 匀速阅读速度: 30-72 px/s
        
        // 时间分配
        const tau0 = 500  // 初始停顿: 300-600 ms
        const t_scroll = L / v1 * 1000  // 完整滚动一个环长的时间（ms）
        const T = tau0 + t_scroll  // 总周期
        
        // 计算关键帧百分比位置
        const p_delay = (tau0 / T) * 100  // 停顿结束位置
        
        // 安全的动画名称（替换特殊字符）
        const animName = `scroll-${modelId.replace(/[^a-zA-Z0-9]/g, '_')}`
        
        // 生成动画关键帧 - 环带循环滚动
        // 从 0 滚动到 -L，然后瞬间回到 0（因为环带是重复的，所以看起来是无缝的）
        animations += `
@keyframes ${animName} {
  0% { transform: translateX(0); }
  ${p_delay.toFixed(2)}% { transform: translateX(0); }
  100% { transform: translateX(${-L}px); }
}
`
        
        newScrollingModels[modelId] = {
          C,      // 文字区长度
          W,      // 窗口宽度
          G,      // 空白区长度
          L,      // 总环长
          T,      // 总周期
          animName // 动画名称
        }
      }
    }
  }
  
  // 添加样式到文档
  styleEl.textContent = animations
  document.head.appendChild(styleEl)
  
  scrollingModels.value = newScrollingModels
}

// 获取当前会话使用的模型
const currentModel = computed(() => {
  const activeConv = chatStore.activeConversation
  return activeConv?.model || chatStore.selectedModel
})

// 检查是否是当前模型
const isCurrentModel = (modelId) => {
  return modelId === currentModel.value
}

// 格式化模型名称（统一移除冒号及之前的前缀）
const formatModelName = (name) => {
  // 移除英文冒号(:)或中文冒号(：)及之前的所有文字
  // 例如："OpenAI: GPT-4" -> "GPT-4"
  //       "Amazon: Nova Lite" -> "Nova Lite"  
  //       "Deepseek Chat" -> "Deepseek Chat" (无冒号，保持不变)
  return name.replace(/^[^:：]+[:：]\s*/, '')
}

// 格式化上下文长度
const formatContextLength = (length) => {
  if (!length) return ''
  if (length >= 1000000) {
    return `${Math.floor(length / 1000000)}M`
  }
  if (length >= 1000) {
    return `${Math.floor(length / 1000)}K`
  }
  return length.toString()
}

// 检查是否支持多模态
const hasMultimodal = (model) => {
  return model.input_modalities && model.input_modalities.length > 1
}

// 选择模型
const selectModel = (modelId) => {
  const activeConv = chatStore.activeConversation
  if (activeConv) {
    chatStore.updateConversationModel(activeConv.id, modelId)
    console.log('✓ 已切换当前会话模型到:', modelId)
  } else {
    chatStore.setSelectedModel(modelId)
    console.log('✓ 已设置默认模型为:', modelId)
  }
}

// 组件挂载后检测溢出
onMounted(() => {
  detectOverflow()
})

// 组件卸载时清理动画样式
onUnmounted(() => {
  const styleEl = document.getElementById('favorite-scroll-animations')
  if (styleEl) {
    styleEl.remove()
  }
})

// 监听收藏列表变化，重新检测
watch(favoriteModels, () => {
  detectOverflow()
})
</script>

<style scoped>
.favorite-model-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.favorites-list {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  /* 确保在父容器限制下正常工作 */
  max-width: 100%;
  
  /* 平滑滚动 - 现代浏览器支持 */
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch; /* iOS Safari 平滑滚动 */
}

/* WebKit 浏览器滚动条样式 (Chrome, Safari, Edge) */
.favorites-list::-webkit-scrollbar {
  height: 4px;
}

.favorites-list::-webkit-scrollbar-track {
  background: transparent;
}

.favorites-list::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 2px;
}

.favorites-list::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* Firefox 滚动条样式 */
.favorites-list {
  scrollbar-width: thin;
  scrollbar-color: #d1d5db transparent;
}

.favorite-model-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 140px;
  max-width: 180px;
  flex-shrink: 0;
}

.favorite-model-btn:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
  transform: translateY(-1px);
}

.favorite-model-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.model-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

/* 模型名称容器 - 作为滚动窗口 */
.model-name-container {
  width: 100%;
  overflow: hidden;
  position: relative;
}

/* 静态模型名称（不需要滚动时） */
.model-name-static {
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 环带（滚动时） */
.model-name-belt {
  display: inline-flex;
  white-space: nowrap;
  font-size: 0.875rem;
  font-weight: 600;
  /* 动画通过内联样式动态设置 */
}

.model-name-container.scrolling .model-name-belt {
  /* 确保环带可以无限延伸 */
  width: max-content;
}

/* 环带中的文本片段 */
.belt-text {
  display: inline-block;
}

/* 环带中的空白间隙 */
.belt-gap {
  display: inline-block;
}

.model-series {
  font-size: 0.75rem;
  opacity: 0.7;
}

.favorite-model-btn.active .model-series {
  opacity: 0.9;
}

.model-meta {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.5rem;
}

.context-badge {
  font-size: 0.7rem;
  padding: 0.125rem 0.375rem;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 0.25rem;
  font-weight: 600;
}

.favorite-model-btn.active .context-badge {
  background: rgba(255, 255, 255, 0.2);
}

.modality-badge {
  font-size: 0.875rem;
}
</style>
