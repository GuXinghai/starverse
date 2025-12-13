/**
 * UI 状态管理 Composable
 * 
 * 封装 ChatView 的所有 UI 状态和引用
 * 
 * 核心功能：
 * - 草稿输入状态管理
 * - DOM 引用管理（textarea, scroll container, 菜单 refs）
 * - 组件激活状态判断
 * - 菜单状态管理
 * - 对话元数据输入状态
 * 
 * 设计原则：
 * - 所有 UI 状态集中管理
 * - 提供类型安全的引用
 * - 与业务逻辑解耦
 */

import { ref, computed, watch } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type ChatScrollContainer from '../components/chat/ChatScrollContainer.vue'

// ========== 类型定义 ==========

export type ActiveMenu = 'pdf' | 'websearch' | 'reasoning' | 'sampling' | 'parameters' | null

export interface UseUIStateOptions {
  conversationId: Ref<string>
  activeTabId: ComputedRef<string | null>
}

export interface UseUIStateReturn {
  // 草稿输入
  draftInput: Ref<string>
  
  // DOM 引用
  chatScrollRef: Ref<InstanceType<typeof ChatScrollContainer> | null>
  textareaRef: Ref<HTMLTextAreaElement | null>
  webSearchControlRef: Ref<HTMLElement | null>
  reasoningControlRef: Ref<HTMLElement | null>
  parameterControlRef: Ref<HTMLElement | null>
  pdfEngineMenuRef: Ref<HTMLElement | null>
  
  // 组件激活状态
  isComponentActive: ComputedRef<boolean>
  
  // 菜单状态
  activeMenu: Ref<ActiveMenu>
  
  // 对话元数据输入
  conversationTagInput: Ref<string>
  saveTemplateInProgress: Ref<boolean>
}

// ========== Composable 实现 ==========

export function useUIState(options: UseUIStateOptions): UseUIStateReturn {
  const { conversationId, activeTabId } = options
  
  // ========== 草稿输入 ==========
  const draftInput = ref('')
  
  // ========== DOM 引用 ==========
  const chatScrollRef = ref<InstanceType<typeof ChatScrollContainer> | null>(null)
  const textareaRef = ref<HTMLTextAreaElement | null>(null)
  const webSearchControlRef = ref<HTMLElement | null>(null)
  const reasoningControlRef = ref<HTMLElement | null>(null)
  const parameterControlRef = ref<HTMLElement | null>(null)
  const pdfEngineMenuRef = ref<HTMLElement | null>(null)
  
  // ========== 组件激活状态 ==========
  /**
   * 判断当前 ChatView 实例是否处于激活（可见）状态
   * 
   * 多实例架构说明：
   * - TabbedChatView 通过 v-for 创建多个 ChatView 实例
   * - 所有实例同时存在于 DOM 中，通过 display:none/flex 控制可见性
   * - 只有激活的实例应该响应用户交互
   * 
   * 用途：
   * - 控制是否自动聚焦输入框
   * - 控制是否执行某些只应在激活状态下进行的操作
   * - 避免后台实例执行不必要的 DOM 操作
   */
  const isComponentActive = computed(() => {
    return activeTabId.value === conversationId.value
  })
  
  // ========== 统一菜单状态管理 ==========
  const activeMenu = ref<ActiveMenu>(null)
  
  // 调试：监控 activeMenu 变化
  watch(activeMenu, (newVal, oldVal) => {
    console.log('[useUIState] activeMenu 变化:', {
      from: oldVal,
      to: newVal,
      conversationId: conversationId.value
    })
  })
  
  // ========== 对话元数据输入 ==========
  const conversationTagInput = ref('')
  const saveTemplateInProgress = ref(false)
  
  return {
    // 草稿输入
    draftInput,
    
    // DOM 引用
    chatScrollRef,
    textareaRef,
    webSearchControlRef,
    reasoningControlRef,
    parameterControlRef,
    pdfEngineMenuRef,
    
    // 组件激活状态
    isComponentActive,
    
    // 菜单状态
    activeMenu,
    
    // 对话元数据输入
    conversationTagInput,
    saveTemplateInProgress
  }
}
