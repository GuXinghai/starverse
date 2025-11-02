<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="closeModal">
        <div class="modal-container">
          <!-- 标题栏 -->
          <div class="modal-header">
            <h2 class="modal-title">高级模型选择器</h2>
            <button @click="closeModal" class="close-btn" title="关闭">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- 主内容区 - 左右分栏 -->
          <div class="modal-content">
            <!-- 左侧窗格：搜索和筛选器 -->
            <div class="left-pane">
              <!-- 搜索框 -->
              <div class="search-section">
                <div class="search-box">
                  <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="搜索模型..."
                    class="search-input"
                  />
                  <button v-if="searchQuery" @click="searchQuery = ''" class="clear-search-btn">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- 筛选器区域 -->
              <div class="filters-section">
                <!-- 模型系列筛选 -->
                <div class="filter-group">
                  <label class="filter-label">模型系列</label>
                  <div class="filter-tags">
                    <button
                      v-for="series in availableSeries"
                      :key="series"
                      @click="toggleFilter('series', series)"
                      :class="['filter-tag', { active: filters.series.has(series) }]"
                    >
                      {{ series }}
                      <span class="tag-count">({{ getSeriesCount(series) }})</span>
                    </button>
                  </div>
                </div>

                <!-- 输入模态性筛选 -->
                <div class="filter-group">
                  <label class="filter-label">输入模态</label>
                  <div class="filter-tags">
                    <button
                      v-for="modality in ['text', 'image', 'audio']"
                      :key="modality"
                      @click="toggleFilter('modalities', modality)"
                      :class="['filter-tag', { active: filters.modalities.has(modality) }]"
                    >
                      <span v-if="modality === 'text'">📝 文本</span>
                      <span v-else-if="modality === 'image'">🖼️ 图像</span>
                      <span v-else-if="modality === 'audio'">🎵 音频</span>
                    </button>
                  </div>
                </div>

                <!-- 上下文长度筛选 -->
                <div class="filter-group">
                  <label class="filter-label">
                    上下文长度: ≥ {{ formatContextLength(filters.minContextLength) }}
                  </label>
                  <input
                    v-model.number="filters.minContextLength"
                    type="range"
                    min="0"
                    :max="maxContextLength"
                    :step="contextLengthStep"
                    class="range-slider"
                  />
                  <div class="range-labels">
                    <span>0</span>
                    <span>{{ formatContextLength(maxContextLength) }}</span>
                  </div>
                </div>

                <!-- 价格筛选 -->
                <div class="filter-group">
                  <label class="filter-label">
                    最高价格: ${{ filters.maxPromptPrice.toFixed(2)}} / 1M tokens
                  </label>
                  <input
                    v-model.number="filters.maxPromptPrice"
                    type="range"
                    min="0"
                    :max="maxPrice"
                    step="0.5"
                    class="range-slider"
                  />
                  <div class="range-labels">
                    <span>免费</span>
                    <span>${{ maxPrice }}</span>
                  </div>
                </div>

                <!-- 清除筛选按钮 -->
                <button @click="clearFilters" class="clear-filters-btn">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  清除所有筛选
                </button>
              </div>
            </div>

            <!-- 右侧窗格：模型列表 -->
            <div class="right-pane">
              <!-- 模型列表头部 -->
              <div class="models-header">
                <span class="results-count">
                  找到 {{ filteredModels.length }} 个模型
                </span>
                <div class="view-options">
                  <button
                    @click="sortBy = 'name'"
                    :class="['sort-btn', { active: sortBy === 'name' }]"
                    title="按名称排序"
                  >
                    A-Z
                  </button>
                  <button
                    @click="sortBy = 'context'"
                    :class="['sort-btn', { active: sortBy === 'context' }]"
                    title="按上下文长度排序"
                  >
                    📏
                  </button>
                  <button
                    @click="sortBy = 'price'"
                    :class="['sort-btn', { active: sortBy === 'price' }]"
                    title="按价格排序"
                  >
                    💰
                  </button>
                </div>
              </div>

              <!-- 模型列表 -->
              <div class="models-list">
                <div
                  v-for="model in sortedModels"
                  :key="model.id"
                  @click="selectModel(model.id)"
                  :class="['model-item', { selected: isSelected(model.id) }]"
                >
                  <div class="model-main">
                    <div class="model-title-row">
                      <h3 class="model-name">{{ model.name }}</h3>
                      <button
                        @click.stop="toggleFavorite(model.id)"
                        :class="['favorite-btn', { favorited: isFavorited(model.id) }]"
                        :title="isFavorited(model.id) ? '取消收藏' : '收藏'"
                      >
                        <svg class="w-5 h-5" :fill="isFavorited(model.id) ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </button>
                    </div>
                    <p class="model-id">{{ model.id }}</p>
                    <p v-if="model.description" class="model-description">
                      {{ model.description }}
                    </p>
                  </div>

                  <div class="model-metadata">
                    <div class="metadata-row">
                      <span class="metadata-item">
                        <span class="metadata-label">系列:</span>
                        <span class="metadata-value series-badge">{{ model.series }}</span>
                      </span>
                      <span class="metadata-item">
                        <span class="metadata-label">上下文:</span>
                        <span class="metadata-value">{{ formatContextLength(model.context_length) }}</span>
                      </span>
                    </div>
                    <div class="metadata-row">
                      <span class="metadata-item">
                        <span class="metadata-label">输入模态:</span>
                        <span class="modalities">
                          <span v-for="mod in model.input_modalities" :key="mod" class="modality-icon">
                            {{ getModalityIcon(mod) }}
                          </span>
                        </span>
                      </span>
                      <span class="metadata-item">
                        <span class="metadata-label">价格:</span>
                        <span class="metadata-value price">
                          ${{ model.pricing.prompt.toFixed(2) }} / ${{ model.pricing.completion.toFixed(2) }}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <!-- 空状态 -->
                <div v-if="filteredModels.length === 0" class="empty-state">
                  <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p class="empty-text">没有找到符合条件的模型</p>
                  <button @click="clearFilters" class="empty-action-btn">
                    清除筛选条件
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useChatStore } from '../stores/chatStore'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'select'])

const chatStore = useChatStore()

// 搜索查询
const searchQuery = ref('')

// 筛选条件
const filters = ref({
  series: new Set(),
  modalities: new Set(),
  minContextLength: 0,
  maxPromptPrice: 100
})

// 排序方式
const sortBy = ref('name')

// 从 store 获取所有模型
const allModelsData = computed(() => chatStore.allModels)

// 动态提取所有可用的模型系列
const availableSeries = computed(() => {
  const seriesSet = new Set()
  allModelsData.value.forEach(model => {
    if (model.series) {
      seriesSet.add(model.series)
    }
  })
  return Array.from(seriesSet).sort()
})

// 计算最大上下文长度
const maxContextLength = computed(() => {
  let max = 128000 // 默认值
  allModelsData.value.forEach(model => {
    if (model.context_length > max) {
      max = model.context_length
    }
  })
  return max
})

// 上下文长度滑块步进值
const contextLengthStep = computed(() => {
  const max = maxContextLength.value
  if (max > 1000000) return 50000
  if (max > 100000) return 10000
  return 1000
})

// 最大价格
const maxPrice = ref(100)

// 获取某个系列的模型数量
const getSeriesCount = (series) => {
  return allModelsData.value.filter(m => m.series === series).length
}

// 切换筛选条件
const toggleFilter = (filterType, value) => {
  if (filters.value[filterType].has(value)) {
    filters.value[filterType].delete(value)
  } else {
    filters.value[filterType].add(value)
  }
}

// 清除所有筛选
const clearFilters = () => {
  filters.value = {
    series: new Set(),
    modalities: new Set(),
    minContextLength: 0,
    maxPromptPrice: 100
  }
  searchQuery.value = ''
}

// 过滤后的模型列表
const filteredModels = computed(() => {
  let models = allModelsData.value

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    models = models.filter(model => 
      model.id.toLowerCase().includes(query) ||
      model.name.toLowerCase().includes(query) ||
      (model.description && model.description.toLowerCase().includes(query))
    )
  }

  // 系列过滤
  if (filters.value.series.size > 0) {
    models = models.filter(model => 
      filters.value.series.has(model.series)
    )
  }

  // 模态性过滤（AND 逻辑 - 必须包含所有选中的模态）
  if (filters.value.modalities.size > 0) {
    models = models.filter(model => {
      const modelModalities = new Set(model.input_modalities || [])
      for (const requiredModality of filters.value.modalities) {
        if (!modelModalities.has(requiredModality)) {
          return false
        }
      }
      return true
    })
  }

  // 上下文长度过滤
  if (filters.value.minContextLength > 0) {
    models = models.filter(model => 
      model.context_length >= filters.value.minContextLength
    )
  }

  // 价格过滤
  if (filters.value.maxPromptPrice < 100) {
    models = models.filter(model => 
      model.pricing.prompt <= filters.value.maxPromptPrice
    )
  }

  return models
})

// 排序后的模型列表
const sortedModels = computed(() => {
  const models = [...filteredModels.value]

  switch (sortBy.value) {
    case 'name':
      return models.sort((a, b) => a.name.localeCompare(b.name))
    case 'context':
      return models.sort((a, b) => b.context_length - a.context_length)
    case 'price':
      return models.sort((a, b) => a.pricing.prompt - b.pricing.prompt)
    default:
      return models
  }
})

// 获取当前选中的模型
const currentModel = computed(() => {
  const activeConv = chatStore.activeConversation
  return activeConv?.model || chatStore.selectedModel
})

// 检查是否选中
const isSelected = (modelId) => {
  return modelId === currentModel.value
}

// 检查是否收藏
const isFavorited = (modelId) => {
  return chatStore.isModelFavorited(modelId)
}

// 切换收藏
const toggleFavorite = (modelId) => {
  chatStore.toggleFavoriteModel(modelId)
}

// 选择模型
const selectModel = (modelId) => {
  const activeConv = chatStore.activeConversation
  if (activeConv) {
    chatStore.updateConversationModel(activeConv.id, modelId)
  } else {
    chatStore.setSelectedModel(modelId)
  }
  emit('select', modelId)
  closeModal()
}

// 关闭模态框
const closeModal = () => {
  emit('close')
}

// 格式化上下文长度
const formatContextLength = (length) => {
  if (!length) return 'N/A'
  if (length >= 1000000) {
    return `${(length / 1000000).toFixed(1)}M`
  }
  if (length >= 1000) {
    return `${Math.floor(length / 1000)}K`
  }
  return length.toString()
}

// 获取模态性图标
const getModalityIcon = (modality) => {
  const icons = {
    text: '📝',
    image: '🖼️',
    audio: '🎵',
    video: '🎬'
  }
  return icons[modality] || '❓'
}

// 监听打开状态，重置筛选
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    // 可以在这里添加打开时的初始化逻辑
  }
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 2rem;
}

.modal-container {
  background: white;
  border-radius: 1rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  max-width: 1400px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.close-btn {
  padding: 0.5rem;
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  border-radius: 0.5rem;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

/* 主内容区 - 左右分栏 */
.modal-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* 左侧窗格 - 搜索和筛选器 */
.left-pane {
  width: 320px;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
  flex-shrink: 0;
}

.search-section {
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 1rem;
  width: 1.25rem;
  height: 1.25rem;
  color: #9ca3af;
}

.search-input {
  width: 100%;
  padding: 0.75rem 3rem 0.75rem 3rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  font-size: 0.9rem;
  transition: all 0.2s;
  background: white;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.clear-search-btn {
  position: absolute;
  right: 0.75rem;
  padding: 0.25rem;
  background: #f3f4f6;
  border: none;
  border-radius: 0.375rem;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-search-btn:hover {
  background: #e5e7eb;
  color: #111827;
}

.filters-section {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.filter-group {
  margin-bottom: 1.5rem;
}

.filter-group:last-of-type {
  margin-bottom: 1rem;
}

.filter-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.75rem;
}

.filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-tag {
  padding: 0.5rem 0.75rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.filter-tag:hover {
  background: #e5e7eb;
  border-color: #d1d5db;
}

.filter-tag.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.tag-count {
  font-size: 0.75rem;
  opacity: 0.7;
}

.range-slider {
  width: 100%;
  height: 0.5rem;
  border-radius: 0.25rem;
  background: #e5e7eb;
  outline: none;
  -webkit-appearance: none;
}

.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.range-slider::-moz-range-thumb {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.range-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.clear-filters-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  color: #6b7280;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-filters-btn:hover {
  background: #f3f4f6;
  border-color: #667eea;
  color: #667eea;
}

/* 右侧窗格 - 模型列表 */
.right-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.models-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  background: white;
  flex-shrink: 0;
}

.results-count {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.view-options {
  display: flex;
  gap: 0.5rem;
}

.sort-btn {
  padding: 0.375rem 0.75rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.sort-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.sort-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.models-list {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  background: #f9fafb;
}

.model-item {
  padding: 1.25rem;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  margin-bottom: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.model-item:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  transform: translateY(-2px);
}

.model-item.selected {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
}

.model-main {
  margin-bottom: 1rem;
}

.model-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.model-name {
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
  flex: 1;
}

.favorite-btn {
  padding: 0.25rem;
  background: transparent;
  border: none;
  color: #d1d5db;
  cursor: pointer;
  transition: all 0.2s;
}

.favorite-btn:hover {
  color: #fbbf24;
  transform: scale(1.1);
}

.favorite-btn.favorited {
  color: #fbbf24;
}

.model-id {
  font-size: 0.875rem;
  color: #6b7280;
  font-family: 'Courier New', monospace;
  margin-bottom: 0.5rem;
}

.model-description {
  font-size: 0.875rem;
  color: #4b5563;
  line-height: 1.5;
}

.model-metadata {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.metadata-row {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.metadata-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.metadata-label {
  color: #6b7280;
  font-weight: 500;
}

.metadata-value {
  color: #111827;
  font-weight: 600;
}

.series-badge {
  padding: 0.125rem 0.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 0.375rem;
  font-size: 0.75rem;
}

.modalities {
  display: flex;
  gap: 0.25rem;
}

.modality-icon {
  font-size: 1rem;
}

.price {
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  width: 4rem;
  height: 4rem;
  color: #d1d5db;
  margin-bottom: 1rem;
}

.empty-text {
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 1.5rem;
}

.empty-action-btn {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.empty-action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* 过渡动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .left-pane {
    width: 280px;
  }
}

@media (max-width: 768px) {
  .modal-content {
    flex-direction: column;
  }
  
  .left-pane {
    width: 100%;
    max-height: 40%;
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .right-pane {
    max-height: 60%;
  }
}
</style>
