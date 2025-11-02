<script setup lang="ts">
import { computed, watch, nextTick } from 'vue'
// @ts-ignore
import { useChatStore } from '../stores/chatStore'
import ChatView from './ChatView.vue'

const chatStore = useChatStore()

// 获取当前激活的标签页 ID
const activeTabId = computed(() => chatStore.activeTabId)

// ========== 多实例管理策略 ==========
// 使用 v-for + v-show 管理多个 ChatView 实例
// 每个打开的对话都有一个持久化的组件实例
// 切换标签页时只改变可见性，不会销毁/创建组件
const openConversationIds = computed(() => {
  return chatStore.openConversationIds
})

// ========== 子组件 ref 管理 ==========
// 存储每个 ChatView 子组件的引用
const childRefs = new Map<string, any>()
const setChildRef = (id: string, el: any) => {
  if (el) {
    childRefs.set(id, el)
  } else {
    childRefs.delete(id)
  }
}

// ========== 焦点管理 - 单一入口 ==========
// 使用 flush: 'post' 确保在 DOM 更新后执行
// 这是解决焦点问题的关键：在 DOM 完全就绪后才聚焦
watch(() => chatStore.activeTabId, async (newId) => {
  if (!newId) return
  
  console.log('🔄 activeTabId 变化，切换到:', newId)
  
  // 等待 Vue 完成响应式更新和 DOM 打补丁
  await nextTick()
  // 再等一次，确保 v-show 的 display 样式已生效
  await nextTick()
  
  // 使用 queueMicrotask + requestAnimationFrame 确保在浏览器渲染帧之后执行
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      const child = childRefs.get(newId)
      if (child?.focusInput) {
        console.log('📍 调用子组件 focusInput:', newId)
        child.focusInput()
      } else {
        console.warn('⚠️ 找不到子组件或 focusInput 方法:', newId, '可用的 refs:', Array.from(childRefs.keys()))
      }
    })
  })
}, { flush: 'post' }) // 关键：flush: 'post' 确保在 DOM 更新后触发

// 监听对话数量变化，用于调试
watch(() => chatStore.conversations.length, (newLen, oldLen) => {
  if (newLen < oldLen) {
    console.log('🧹 对话数量减少，对应组件将被销毁')
  }
}, { flush: 'post' })
</script>

<template>
  <div class="relative flex-1 overflow-hidden bg-gray-50">
    <!--
      多实例管理策略 (v-for + v-show)
      
      原理：
      1. v-for 为每个打开的对话创建一个独立的 ChatView 实例
      2. v-show 控制哪个实例可见（只改变 display 属性，不销毁组件）
      3. 所有实例保持在 DOM 中，状态自动保留
      
      优势：
      - 切换标签时不会触发 onMounted/onUnmounted
      - 后台的消息流可以继续运行
      - 用户输入和滚动位置自动保持
      
      生命周期：
      - 打开对话 → 创建组件实例 (onMounted)
      - 切换标签 → 隐藏/显示 (不触发生命周期钩子)
      - 关闭对话 → 销毁组件实例 (onUnmounted)
      
      关键样式：
      - absolute w-full h-full: 让所有实例堆叠在同一位置
      - pointer-events-none: 默认不接收鼠标事件（隐藏时）
      - pointer-events-auto (动态): 只有激活的实例接收鼠标事件
    -->
    <ChatView
      v-for="conversationId in openConversationIds"
      :key="conversationId"
      :conversation-id="conversationId"
      :ref="(el) => setChildRef(conversationId, el)"
      :style="{
        position: 'absolute',
        width: '100%',
        height: '100%',
        display: conversationId === activeTabId ? 'flex' : 'none'
      }"
      :class="[
        conversationId === activeTabId ? 'pointer-events-auto' : 'pointer-events-none'
      ]"
    />

    <!-- 空状态：没有打开的标签页 -->
    <div
      v-if="!activeTabId"
      class="flex items-center justify-center h-full"
    >
      <div class="text-center">
        <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900">没有活动的聊天</h3>
        <p class="mt-1 text-sm text-gray-500">从左侧选择一个聊天或开始一个新的聊天。</p>
      </div>
    </div>
  </div>
</template>
