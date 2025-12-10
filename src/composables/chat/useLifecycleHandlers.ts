/**
 * 生命周期处理 Composable
 * 
 * 封装组件的生命周期逻辑
 * 
 * 核心功能：
 * - onMounted: 初始化、恢复草稿、注册全局事件
 * - onUnmounted: 清理、保存草稿、注销全局事件
 * - watch(isComponentActive): 标签页切换逻辑
 * - watch(draftInput): 草稿自动保存（防抖）
 * 
 * 设计原则：
 * - 多实例架构优化
 * - 上下文固化
 * - 资源正确清理
 */

import { onMounted, onUnmounted, watch, nextTick } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { Ref, ComputedRef } from 'vue'

// ========== 类型定义 ==========

export interface UseLifecycleHandlersOptions {
  conversationId: Ref<string>
  draftInput: Ref<string>
  isComponentActive: Ref<boolean>
  currentConversation: ComputedRef<any>
  abortController: Ref<AbortController | null>
  chatScrollRef: Ref<any>
  
  // Stores
  conversationStore: any
  
  // 事件处理函数
  handleGlobalClick: (event: MouseEvent) => void
  handleGlobalKeyDown: (event: KeyboardEvent) => void
  
  // Textarea 控制
  adjustTextareaHeight: () => void
  focusTextarea: () => void
}

export interface UseLifecycleHandlersReturn {
  // 生命周期已在 setup 中注册，无需返回
}

// ========== Composable 实现 ==========

export function useLifecycleHandlers(
  options: UseLifecycleHandlersOptions
): UseLifecycleHandlersReturn {
  const {
    conversationId,
    draftInput,
    isComponentActive,
    currentConversation,
    abortController,
    chatScrollRef,
    conversationStore,
    handleGlobalClick,
    handleGlobalKeyDown,
    adjustTextareaHeight,
    focusTextarea
  } = options
  
  /**
   * 组件挂载生命周期钩子
   * 
   * 执行时机：组件首次插入 DOM 后立即调用（仅一次）
   * 
   * 重要：在多实例架构中，此钩子不会因标签切换而重复触发
   * - TabbedChatView 通过 v-for 创建所有实例
   * - 使用 display:none/flex 控制可见性（不销毁 DOM）
   * - onMounted 只在实例创建时触发一次
   * - 标签切换使用 watch(isComponentActive) 监听
   * 
   * 初始化任务：
   * 1. 恢复草稿内容（从 store 读取）
   * 2. 如果组件处于激活状态，执行初始化：
   *    - 滚动到底部（显示最新消息）
   *    - 聚焦输入框（引导用户输入）
   * 3. 注册全局点击事件监听器（用于关闭菜单）
   * 
   * 性能优化：
   * - 使用双重 nextTick 确保 DOM 完全就绪
   * - 再加 100ms 延迟，确保布局计算完成
   * - 避免过早聚焦导致的滚动跳动
   * 
   * 全局事件监听：
   * - 监听 document 的 click 事件
   * - 用于检测点击菜单外部，自动关闭菜单
   * - 必须在 onUnmounted 中清理，避免内存泄漏
   */
  onMounted(() => {
    // 恢复草稿
    if (currentConversation.value?.draft) {
      draftInput.value = currentConversation.value.draft
    }
    
    // 初始化Textarea高度
    nextTick(() => adjustTextareaHeight())
    
    // 如果组件挂载时就是激活状态，执行初始化
    if (isComponentActive.value) {
      // ✅ 新方案：通过滚动容器组件滚到底部
      nextTick(() => {
        chatScrollRef.value?.scrollToBottom({ instant: true })
        // 聚焦输入框
        setTimeout(() => {
          focusTextarea()
        }, 100)
      })
    }

    // 注册全局事件监听器
    document.addEventListener('click', handleGlobalClick)
    document.addEventListener('keydown', handleGlobalKeyDown)
  })

  /**
   * 组件卸载生命周期钩子
   * 
   * 执行时机：组件从 DOM 中移除之前调用
   * 
   * 触发场景：
   * - 对话被删除（用户点击删除按钮）
   * - 应用关闭（窗口关闭）
   * - 不包括：标签切换（多实例架构不销毁组件）
   * 
   * 清理任务：
   * 1. 🔒 固化 conversationId（防止清理错误的对话）
   * 2. 移除全局事件监听器（防止内存泄漏）
   * 3. 中止正在进行的请求（释放网络资源）
   * 4. 保存草稿（确保用户输入不丢失）
   * 
   * 清理优先级：
   * 1. 移除事件监听器（最高优先级，避免事件触发到已销毁组件）
   * 2. 中止请求（释放网络资源，避免后续回调）
   * 3. 保存草稿（最后执行，确保数据持久化）
   */
  onUnmounted(() => {
    // ========== 🔒 固化上下文 ==========
    // 捕获当前的 conversationId，防止在异步操作中访问到错误的值
    const targetConversationId = conversationId.value

    // 移除全局事件监听器
    document.removeEventListener('click', handleGlobalClick)
    document.removeEventListener('keydown', handleGlobalKeyDown)
    
    // 清理 AbortController
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }
    
    // 最后一次保存草稿（如果对话还存在）
    if (currentConversation.value && draftInput.value) {
      conversationStore.updateConversationDraft(
        targetConversationId,
        draftInput.value
      )
    }
  })

  /**
   * 监听组件激活状态变化（替代 KeepAlive 的 onActivated/onDeactivated）
   * 
   * 多实例架构的核心逻辑：
   * - TabbedChatView 通过 v-for 创建所有 ChatView 实例
   * - 所有实例同时存在于 DOM，通过 display 控制可见性
   * - 不使用 KeepAlive（会阻止后台流式生成）
   * - 使用 isComponentActive computed 判断激活状态
   * 
   * 激活状态定义：
   * - true: activeTabId === conversationId
   * - false: 其他标签页处于激活状态
   * 
   * 状态转换处理：
   * 
   * 【从非激活 → 激活】相当于 onActivated：
   * - 用户切换到该标签页
   * - 恢复滚动位置或滚动到底部
   * - 不主动聚焦（由父组件控制，避免抢夺焦点）
   * 
   * 【从激活 → 非激活】相当于 onDeactivated：
   * - 用户切换到其他标签页
   * - 保存当前滚动位置
   * - 不中止请求（允许后台流式生成继续）
   * - 保存草稿（双重保险）
   * 
   * 草稿保存策略：
   * - watchDebounced(draftInput) 已经在实时保存（500ms 防抖）
   * - 这里是双重保险，确保切换标签时立即保存
   * - 避免快速切换导致的草稿丢失
   */
  watch(isComponentActive, (newVal, oldVal) => {
    // 🔒 固化 conversationId，防止异步操作中访问到错误的值
    const targetConversationId = conversationId.value
    
    if (newVal && !oldVal) {
      // ========== 激活：相当于 onActivated ==========
      nextTick(() => {
        if (currentConversation.value?.scrollPosition !== undefined) {
          chatScrollRef.value?.setScrollTop(currentConversation.value.scrollPosition)
        } else {
          // 如果没有保存的位置，滚动到底部
          chatScrollRef.value?.scrollToBottom()
        }
      })
    } else if (!newVal && oldVal) {
      // ========== 停用：相当于 onDeactivated ==========
      // ✅ 保存当前滚动位置
      if (currentConversation.value) {
        currentConversation.value.scrollPosition = chatScrollRef.value?.getScrollTop() ?? 0
      }
      
      // 关键：停用时不再中止请求，让流在后台继续
      // 这样用户可以切换标签查看其他对话，而不影响正在生成的内容
      
      // 保存草稿（双重保险，虽然 watchDebounced 已经在保存）
      if (draftInput.value !== currentConversation.value?.draft) {
        conversationStore.updateConversationDraft(
          targetConversationId,
          draftInput.value
        )
      }
    }
  }, { immediate: false }) // 不立即执行，避免与 onMounted 重复

  /**
   * 监听草稿变化并自动保存（带防抖优化）
   * 
   * 功能：用户在输入框输入时，自动保存到 store
   * 
   * 防抖策略：
   * - 使用 watchDebounced（@vueuse/core）
   * - 500ms 防抖间隔
   * - 减少频繁更新导致的性能问题
   * 
   * 为什么需要防抖？
   * - 用户快速输入时，每个字符都会触发保存
   * - 粘贴大段文本时，会触发数百次保存
   * - 频繁的 store 更新和序列化会导致卡顿
   * - 防抖后，只在用户停止输入 500ms 后保存
   * 
   * 保存时机：
   * - 用户停止输入 500ms 后
   * - 用户切换标签页时（watch isComponentActive）
   * - 组件卸载时（onUnmounted）
   */
  watchDebounced(
    draftInput,
    (newValue) => {
      // 🔒 固化上下文：watch 回调执行时 props 可能已经变化
      const targetConversationId = conversationId.value
      
      conversationStore.updateConversationDraft(
        targetConversationId,
        newValue
      )
    },
    { debounce: 500 } // 500ms 防抖，减少频繁更新导致的性能问题
  )
  
  return {}
}
