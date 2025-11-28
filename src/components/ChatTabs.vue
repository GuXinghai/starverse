<script setup lang="ts">
import { computed } from 'vue'
import { useConversationStore } from '../stores/conversation'
import { usePersistenceStore } from '../stores/persistence'

const conversationStore = useConversationStore()
const persistenceStore = usePersistenceStore()

// 获取打开的标签页信息
const openTabs = computed(() => {
  return conversationStore.openTabIds.map((id: string) => {
    const conversation = conversationStore.conversationMap.get(id)
    return {
      id,
      title: conversation?.title || '未知对话',
      isLoading: persistenceStore.loadingConversationIds?.has?.(id) || false,
      isSaving: persistenceStore.savingConversationIds?.has?.(id) || false,
      generationStatus: conversation?.generationStatus || 'idle'
    }
  })
})

// 切换标签页
const switchTab = (conversationId: string) => {
  conversationStore.openConversationInTab(conversationId)
}

// 关闭标签页
const closeTab = (conversationId: string, event: Event) => {
  event.stopPropagation()
  conversationStore.closeConversationTab(conversationId)
}
</script>

<template>
  <div class="flex items-center bg-gray-100 border-b border-gray-200 overflow-x-auto">
    <div class="flex min-w-0">
      <div
        v-for="tab in openTabs"
        :key="tab.id"
        @click="switchTab(tab.id)"
        :class="[
          'flex items-center gap-2 px-4 py-3 border-r border-gray-200 cursor-pointer transition-colors min-w-[120px] max-w-[200px]',
          conversationStore.activeTabId === tab.id
            ? 'bg-white text-blue-600 font-medium'
            : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
        ]"
      >
        <!-- 加载指示器 -->
        <div class="flex items-center gap-1 flex-shrink-0">
          <svg
            v-if="tab.isLoading"
            class="w-3 h-3 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <svg
            v-else-if="tab.isSaving"
            class="w-3 h-3 animate-pulse text-amber-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M10 2a1 1 0 01.894.553l6 12A1 1 0 0116 16H4a1 1 0 01-.894-1.447l6-12A1 1 0 0110 2z" />
          </svg>
          <span
            v-else-if="tab.generationStatus && tab.generationStatus !== 'idle'"
            class="w-2 h-2 rounded-full"
            :class="tab.generationStatus === 'receiving' ? 'bg-green-500' : 'bg-blue-500'"
          ></span>
        </div>

        <!-- 标签标题 -->
        <span class="truncate flex-1 text-sm">{{ tab.title }}</span>

        <!-- 关闭按钮 -->
        <button
          @click="closeTab(tab.id, $event)"
          class="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 transition-colors"
          :class="conversationStore.activeTabId === tab.id ? 'hover:bg-gray-200' : 'hover:bg-gray-300'"
          title="关闭标签页"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="openTabs.length === 0" class="px-4 py-3 text-sm text-gray-500">
      暂无打开的标签页
    </div>
  </div>
</template>

<style scoped>
/* 自定义滚动条样式 */
div::-webkit-scrollbar {
  height: 4px;
}

div::-webkit-scrollbar-track {
  background: #f1f1f1;
}

div::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 2px;
}

div::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
