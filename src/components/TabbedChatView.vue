<script setup lang="ts">
import { computed, watch, nextTick, ref } from 'vue'
import { useConversationStore } from '../stores/conversation'
import { useModelStore } from '../stores/model'
import { useProjectStore } from '../stores/project'
import { useProjectWorkspaceStore } from '../stores/projectWorkspaceStore'
import ChatView from './ChatView.vue'
import ProjectHome from './ProjectHome.vue'
import FavoriteModelSelector from './FavoriteModelSelector.vue'
import QuickModelSearch from './QuickModelSearch.vue'
import AdvancedModelPickerModal from './AdvancedModelPickerModal.vue'

const conversationStore = useConversationStore()
const modelStore = useModelStore()
const projectStore = useProjectStore()
const projectWorkspaceStore = useProjectWorkspaceStore()

// 鑾峰彇褰撳墠婵€娲荤殑鏍囩椤?ID
const activeTabId = computed(() => conversationStore.activeTabId)

const showProjectHome = computed(() => {
  const projectId = projectStore.activeProjectId
  return !activeTabId.value && projectId && projectId !== 'unassigned'
})

watch(
  () => projectStore.activeProjectId,
  next => {
    const normalized = next && next !== 'unassigned' ? next : null
    projectWorkspaceStore.setActiveProject(normalized)
  },
  { immediate: true }
)

// ========== 澶氬疄渚嬬鐞嗙瓥鐣?==========
// 浣跨敤 v-for + v-show 绠＄悊澶氫釜 ChatView 瀹炰緥
// 姣忎釜鎵撳紑鐨勫璇濋兘鏈変竴涓寔涔呭寲鐨勭粍浠跺疄渚?
// 鍒囨崲鏍囩椤垫椂鍙敼鍙樺彲瑙佹€э紝涓嶄細閿€姣?鍒涘缓缁勪欢
const openConversationIds = computed(() => {
  return conversationStore.openTabIds  // 🔧 修复：openConversationIds → openTabIds
})
const activeConversation = computed(() => conversationStore.activeConversation)
const activeConversationId = computed(() => activeConversation.value?.id || null)
const displayModelName = computed(() => {
  const modelId = activeConversation.value?.model || modelStore.selectedModelId
  if (!modelId) return '选择模型'
  const nameWithoutProvider = modelId.replace(/^[^/]+\//, '')
  return nameWithoutProvider.replace(/^[^:：]+[:：]\s*/, '')
})
const showAdvancedModelPicker = ref(false)
const openAdvancedModelPicker = () => {
  showAdvancedModelPicker.value = true
}
const closeAdvancedModelPicker = () => {
  showAdvancedModelPicker.value = false
}

// ========== 瀛愮粍浠?ref 绠＄悳 ==========
// 瀛樺偍姣忎釜 ChatView 瀛愮粍浠剁殑寮曠敤
const childRefs = new Map<string, any>()
const setChildRef = (id: string, el: any) => {
  if (el) {
    childRefs.set(id, el)
  } else {
    childRefs.delete(id)
  }
}

// ========== 鐒︾偣绠＄悳 - 鍗曚竴鍏ュ彛 ==========
// 浣跨敤 flush: 'post' 纭繚鍦?DOM 鏇存柊鍚庢墽琛?
// 杩欐槸瑙ｅ喅鐒︾偣闂鐨勫叧閿細鍦?DOM 瀹屽叏灏辩华鍚庢墽琛?
watch(
  () => conversationStore.activeTabId,
  async newId => {
    if (!newId) return

    // 绛夊緟 Vue 瀹屾垚鍝嶅簲寮忔洿鏂板拰 DOM 鎵撹ˉ涓?
    await nextTick()
    // 鍐嶇瓑涓€娆★紝纭繚 v-show 鐨?display 鏍峰紡宸茬敓鏁?
    await nextTick()

    // 浣跨敤 queueMicrotask + requestAnimationFrame 纭繚鍦ㄦ祻瑙堝櫒娓叉煋甯т箣鍚庢墽琛?
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const child = childRefs.get(newId)
        if (child?.focusInput) {
          child.focusInput()
        }
      })
    })
  },
  { flush: 'post' }
)
</script>

<template>
  <div class="relative flex-1 overflow-hidden bg-gray-50">
    <ProjectHome
      v-if="showProjectHome"
      class="absolute inset-0"
    />

    <div v-else class="flex flex-col flex-1 overflow-hidden h-full">
      <div class="bg-white border-b border-gray-200 px-4 py-2 flex-shrink-0 w-full">
        <div class="flex items-center gap-4">
          <div class="flex-1 min-w-0 overflow-x-auto whitespace-nowrap">
            <FavoriteModelSelector
              :conversation-id="activeConversationId"
              @open-advanced-picker="openAdvancedModelPicker"
            />
          </div>
          <div class="flex items-center gap-2 flex-none shrink-0">
            <QuickModelSearch />
            <button
              @click="openAdvancedModelPicker"
              class="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:from-purple-600 hover:to-indigo-700 transition-all shadow-sm hover:shadow-md whitespace-nowrap"
              title="打开高级模型选择器"
            >
              <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span class="font-medium">
                {{ displayModelName }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <AdvancedModelPickerModal
        :is-open="showAdvancedModelPicker"
        @close="closeAdvancedModelPicker"
        @select="closeAdvancedModelPicker"
      />

      <div class="relative flex-1 overflow-hidden h-full">
        <!--
        多实例管理策略 (v-for + v-show)

        原理：
        1. v-for 为每个打开的对话创建一个并行的 ChatView 实例
        2. v-show 控制哪个实例可见，只修改 display 属性，不销毁组件
        3. 所有实例始终保留在 DOM 中，状态自动维持

        优势：
        - 切换标签时不会触发 onMounted/onUnmounted
        - 后台对话的消息流可以持续执行
        - 用户输入、滚动位置等 UI 状态自动保持

        生命周期：
        - 打开对话 → 创建组件实例 (onMounted)
        - 切换标签 → 仅切换显示/隐藏（无生命周期抖动）
        - 关闭对话 → 销毁组件实例 (onUnmounted)

        关键样式：
        - absolute w-full h-full：让所有实例叠放在同一位置
        - pointer-events-none：默认不接收鼠标事件（隐藏时）
        - pointer-events-auto：只有激活的实例才响应鼠标事件
      -->
        <ChatView
          v-for="conversationId in openConversationIds"
          :key="conversationId"
          :conversation-id="conversationId"
          :ref="el => setChildRef(conversationId, el)"
          :style="{
            position: 'absolute',
            width: '100%',
            height: '100%',
            display: 'flex',
            opacity: conversationId === activeTabId ? 1 : 0,
            visibility: conversationId === activeTabId ? 'visible' : 'hidden',
            pointerEvents: conversationId === activeTabId ? 'auto' : 'none',
            transform: conversationId === activeTabId ? 'translateZ(0)' : 'translateZ(0)'
          }"
        />

      <!-- 空状态：没有打开的标签页 -->
      <!-- ???????????? -->
      <div
        v-if="!activeTabId"
        class="flex items-center justify-center h-full"
      >
        <div class="text-center">
          <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">???????</h3>
          <p class="mt-1 text-sm text-gray-500">???????????????????</p>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>