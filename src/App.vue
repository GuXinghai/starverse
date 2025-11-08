<script setup lang="ts">
console.log('========================================')
console.log('🎉 App.vue 开始加载！')
console.log('时间戳:', new Date().toISOString())
console.log('========================================')

import { ref } from 'vue'
import { useAppStore } from './stores'
import ConversationList from './components/ConversationList.vue'
import ChatTabs from './components/ChatTabs.vue'
import TabbedChatView from './components/TabbedChatView.vue'
import SettingsView from './components/SettingsView.vue'

console.log('✓ 组件导入成功')
console.log('  - ConversationList:', ConversationList)
console.log('  - ChatTabs:', ChatTabs)
console.log('  - TabbedChatView:', TabbedChatView)
console.log('  - SettingsView:', SettingsView)

// 获取 appStore 以访问初始化状态
const appStore = useAppStore()

// 当前视图状态：'chat' 或 'settings'
const currentView = ref<'chat' | 'settings'>('chat')
console.log('✓ 初始视图设置为:', currentView.value)

const switchToChat = () => {
  currentView.value = 'chat'
}

const switchToSettings = () => {
  currentView.value = 'settings'
}
</script>

<template>
  <!-- 加载界面 - 当应用未就绪时显示 -->
  <div v-if="!appStore.isAppReady" class="flex h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <div class="m-auto text-center">
      <!-- Logo 或图标 -->
      <div class="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-lg mb-6">
        <svg class="w-10 h-10 text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
        </svg>
      </div>
      
      <!-- 加载文字 -->
      <h2 class="text-2xl font-bold text-gray-800 mb-3">Starverse</h2>
      <p class="text-gray-600 mb-6">正在初始化应用...</p>
      
      <!-- 加载动画 -->
      <div class="flex justify-center space-x-2">
        <div class="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
        <div class="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style="animation-delay: 0.1s;"></div>
        <div class="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style="animation-delay: 0.2s;"></div>
      </div>
    </div>
  </div>

  <!-- 主应用界面 - 当应用就绪后显示 -->
  <div v-else class="flex h-screen bg-gray-100">
    <!-- 侧边栏：对话列表 (仅在聊天视图显示) -->
    <div v-if="currentView === 'chat'" class="w-64 flex-shrink-0 relative z-20">
      <ConversationList />
    </div>

    <!-- 主内容区域 -->
    <div class="flex flex-col flex-1 overflow-hidden relative z-10">
      <!-- 顶部标题栏 -->
      <div class="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <h2 class="text-lg font-semibold text-gray-800">Starverse</h2>
        
        <!-- 导航按钮 -->
        <div class="flex gap-2">
          <button 
            @click="switchToChat"
            class="flex items-center px-4 py-1.5 rounded-lg transition-colors text-sm"
            :class="currentView === 'chat' 
              ? 'bg-blue-500 text-white' 
              : 'text-gray-600 hover:bg-gray-100'"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
            </svg>
            聊天
          </button>
          
          <button 
            @click="switchToSettings"
            class="flex items-center px-4 py-1.5 rounded-lg transition-colors text-sm"
            :class="currentView === 'settings' 
              ? 'bg-blue-500 text-white' 
              : 'text-gray-600 hover:bg-gray-100'"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
            设置
          </button>
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="flex flex-col flex-1 overflow-hidden">
        <!-- 聊天视图 -->
        <div v-if="currentView === 'chat'" class="flex flex-col flex-1 overflow-hidden">
          <!-- 标签栏 -->
          <ChatTabs />
          
          <!-- 标签页内容 -->
          <TabbedChatView />
        </div>

        <!-- 设置视图 -->
        <SettingsView v-else-if="currentView === 'settings'" />
      </div>
    </div>
  </div>
</template>
