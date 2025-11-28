<template>
  <div class="quick-search-container">
    <!-- 搜索按钮 -->
    <button
      @click="toggleSearch"
      class="search-toggle-btn"
      :class="{ active: isSearchVisible }"
      title="快速搜索模型"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </button>

    <!-- 悬浮搜索框 -->
    <Transition name="search-dropdown">
      <div v-if="isSearchVisible" class="search-dropdown">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          @keydown.esc="closeSearch"
          @keydown.enter="selectFirstResult"
          type="text"
          placeholder="搜索模型..."
          class="search-input"
          autocomplete="off"
        />
        
        <!-- 搜索结果列表 -->
        <div v-if="searchQuery && searchResults.length > 0" class="search-results">
          <button
            v-for="model in searchResults.slice(0, 8)"
            :key="model.id"
            @click="selectModel(model.id)"
            class="search-result-item"
          >
            <div class="result-main">
              <span class="result-name">{{ formatModelName(model.name) }}</span>
            </div>
            <div class="result-meta">
              <span class="series-badge">{{ model.series }}</span>
              <span class="context-badge">{{ formatContextLength(model.context_length) }}</span>
            </div>
          </button>
        </div>
        
        <!-- 无结果提示 -->
        <div v-else-if="searchQuery && searchResults.length === 0" class="no-results">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>未找到匹配的模型</p>
        </div>
      </div>
    </Transition>

    <!-- 点击外部关闭 -->
    <div v-if="isSearchVisible" @click="closeSearch" class="search-backdrop"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useConversationStore } from '../stores/conversation'
import { useModelStore } from '../stores/model'

const conversationStore = useConversationStore()
const modelStore = useModelStore()

const isSearchVisible = ref(false)
const searchQuery = ref('')
const searchInputRef = ref(null)

// 搜索结果
const searchResults = computed(() => {
  if (!searchQuery.value) return []
  
  const query = searchQuery.value.toLowerCase()
  return modelStore.availableModels.filter(model => 
    model.id.toLowerCase().includes(query) ||
    model.name.toLowerCase().includes(query)
  )
})

// 切换搜索框显示
const toggleSearch = async () => {
  isSearchVisible.value = !isSearchVisible.value
  if (isSearchVisible.value) {
    await nextTick()
    searchInputRef.value?.focus()
  }
}

// 关闭搜索框
const closeSearch = () => {
  isSearchVisible.value = false
  searchQuery.value = ''
}

// 选择第一个结果
const selectFirstResult = () => {
  if (searchResults.value.length > 0) {
    selectModel(searchResults.value[0].id)
  }
}

// 选择模型
const selectModel = (modelId) => {
  const activeConv = conversationStore.activeConversation
  if (activeConv) {
    conversationStore.updateConversationModel(activeConv.id, modelId)
  } else {
    modelStore.selectedModelId = modelId
  }
  closeSearch()
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

// 监听搜索框关闭，清空搜索词
watch(isSearchVisible, (newVal) => {
  if (!newVal) {
    searchQuery.value = ''
  }
})
</script>

<style scoped>
.quick-search-container {
  position: relative;
}

.search-toggle-btn {
  padding: 0.5rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-toggle-btn:hover {
  background: #f3f4f6;
  color: #4f46e5;
  border-color: #4f46e5;
}

.search-toggle-btn.active {
  background: #4f46e5;
  color: white;
  border-color: #4f46e5;
}

.search-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 998;
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  min-width: 400px;
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  z-index: 999;
  overflow: hidden;
}

.search-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.875rem;
  outline: none;
}

.search-input:focus {
  border-bottom-color: #4f46e5;
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
}

.search-result-item {
  width: 100%;
  padding: 0.75rem 1rem;
  background: white;
  border: none;
  border-bottom: 1px solid #f3f4f6;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.search-result-item:hover {
  background: #f9fafb;
}

.search-result-item:last-child {
  border-bottom: none;
}

.result-main {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.result-name {
  font-weight: 600;
  color: #111827;
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-shrink: 0;
}

.series-badge {
  padding: 0.125rem 0.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.context-badge {
  padding: 0.125rem 0.5rem;
  background: #f3f4f6;
  color: #4b5563;
  border-radius: 0.375rem;
  font-size: 0.75rem;
}

.no-results {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: #9ca3af;
}

.no-results p {
  font-size: 0.875rem;
}

/* 动画 */
.search-dropdown-enter-active,
.search-dropdown-leave-active {
  transition: all 0.2s;
}

.search-dropdown-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.search-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
