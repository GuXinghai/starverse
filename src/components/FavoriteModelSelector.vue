<template>
  <div class="favorite-model-selector">
    <!-- 如果没有收藏模型，显示提示 -->
    <div v-if="favoriteModels.length === 0" class="no-favorites">
      <button
        @click="$emit('open-advanced-picker')"
        class="add-favorite-btn"
        title="添加收藏模型"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        <span class="ml-1">收藏模型</span>
      </button>
    </div>

    <!-- 收藏模型快速选择器 -->
    <div v-else class="favorites-list">
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
          <span class="model-name">{{ model.name }}</span>
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
      
      <!-- 添加更多收藏按钮 -->
      <button
        @click="$emit('open-advanced-picker')"
        class="add-more-btn"
        title="管理收藏模型"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useChatStore } from '../stores/chatStore'

const emit = defineEmits(['open-advanced-picker'])

const chatStore = useChatStore()

// 从 store 获取收藏模型列表
const favoriteModels = computed(() => chatStore.favoriteModels)

// 获取当前会话使用的模型
const currentModel = computed(() => {
  const activeConv = chatStore.activeConversation
  return activeConv?.model || chatStore.selectedModel
})

// 检查是否是当前模型
const isCurrentModel = (modelId) => {
  return modelId === currentModel.value
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
</script>

<style scoped>
.favorite-model-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.no-favorites {
  display: flex;
  align-items: center;
}

.add-favorite-btn {
  display: flex;
  align-items: center;
  padding: 0.375rem 0.75rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.add-favorite-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.favorites-list {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
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
  min-width: 120px;
  max-width: 200px;
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
}

.model-name {
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
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

.add-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: transparent;
  border: 1px dashed #d1d5db;
  border-radius: 0.5rem;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.add-more-btn:hover {
  border-color: #667eea;
  color: #667eea;
  background: rgba(102, 126, 234, 0.05);
}
</style>
