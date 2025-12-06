/**
 * @deprecated 此 Composable 已被 ChatScrollContainer + useChatStickToBottom 替代
 * 
 * 旧的滚动控制方案存在以下问题:
 * - 每个 token 都触发 setTimeout(0),高频流式时性能瓶颈
 * - 没有中心化的状态机,用户手动滚动容易被自动滚动打断
 * - 缺乏冷却时间保护机制
 * 
 * 新方案特性:
 * - IntersectionObserver 哨兵监控底部状态
 * - requestAnimationFrame 批处理滚动请求
 * - 冷却时间 + escapedFromLock 双重保护
 * - 用户交互绝对优先
 * 
 * 迁移指南:
 * 1. 用 <ChatScrollContainer> 包裹消息列表
 * 2. 替换所有 scrollToBottom/smartScrollToBottom 为 chatScrollRef.value?.onNewContent()
 * 3. 对话切换时使用 getScrollTop/setScrollTop 保存/恢复位置
 * 
 * 预计在下一个主版本中移除此文件
 * 
 * @see src/composables/useChatStickToBottom.ts
 * @see src/components/chat/ChatScrollContainer.vue
 */

/**
 * useScrollControl - 滚动控制 Composable
 * 
 * 职责：
 * - 自动滚动到底部
 * - 智能滚动（避免阻塞）
 * - 滚动状态检测
 */

import { ref, type Ref } from 'vue'

export interface ScrollControlOptions {
  /**
   * 是否启用自动滚动
   */
  autoScroll?: boolean
  
  /**
   * 滚动动画时长（毫秒）
   */
  smoothScrollDuration?: number
}

export function useScrollControl(
  containerRef: Ref<HTMLElement | null>,
  options: ScrollControlOptions = {}
) {
  const {
    autoScroll = true
  } = options

  const isUserScrolling = ref(false)
  const isAtBottom = ref(true)

  /**
   * 检查是否滚动到底部
   */
  function checkIfAtBottom(): boolean {
    if (!containerRef.value) return false

    const { scrollTop, scrollHeight, clientHeight } = containerRef.value
    const threshold = 100 // 距离底部100px以内视为"在底部"
    
    const result = scrollHeight - scrollTop - clientHeight <= threshold
    isAtBottom.value = result
    return result
  }

  /**
   * 滚动到底部（平滑）
   */
  function scrollToBottom(smooth = true) {
    if (!containerRef.value) return

    const behavior = smooth ? 'smooth' : 'auto'
    
    containerRef.value.scrollTo({
      top: containerRef.value.scrollHeight,
      behavior
    })

    // 🔧 不要在这里设置 isAtBottom，让 handleScroll 自然检测
    // isAtBottom.value = true
  }

  /**
   * 智能滚动（使用 requestIdleCallback 或 setTimeout）
   * - 避免阻塞 UI 渲染
   * - 在空闲时执行滚动
   */
  function smartScrollToBottom(smooth = true) {
    if (!autoScroll) return
    if (isUserScrolling.value) return

    // 使用 setTimeout 0 延迟执行，让 DOM 更新先完成
    setTimeout(() => {
      if (!isUserScrolling.value) {
        scrollToBottom(smooth)
      }
    }, 0)
  }

  /**
   * 处理用户滚动事件
   * 
   * 逻辑：
   * - 用户手动向上滚动（离开底部）→ 暂停自动滚动
   * - 用户不在底部时 → 保持暂停状态
   * - 用户主动滚动到底部附近 → 恢复自动滚动（允许跟随新内容）
   */
  function handleScroll() {
    const wasAtBottom = isAtBottom.value
    const wasUserScrolling = isUserScrolling.value
    checkIfAtBottom()
    
    // 🔧 修复逻辑：
    // 1. 如果用户正在查看历史（isUserScrolling = true），且滚动到底部附近
    //    → 恢复自动滚动（用户主动回到底部，想要跟随新内容）
    if (wasUserScrolling && isAtBottom.value) {
      isUserScrolling.value = false
      return
    }
    
    // 2. 如果用户从底部向上滚动 → 暂停自动滚动
    if (wasAtBottom && !isAtBottom.value) {
      isUserScrolling.value = true
      return
    }
    
    // 3. 其他情况保持当前状态不变
  }

  /**
   * 强制启用自动滚动（例如发送新消息后）
   */
  function enableAutoScroll() {
    isUserScrolling.value = false
    scrollToBottom(true)
  }

  /**
   * 禁用自动滚动
   */
  function disableAutoScroll() {
    isUserScrolling.value = true
  }

  /**
   * 滚动到指定元素
   */
  function scrollToElement(element: HTMLElement, smooth = true) {
    if (!containerRef.value) return

    const behavior = smooth ? 'smooth' : 'auto'
    element.scrollIntoView({ behavior, block: 'nearest' })
  }

  return {
    // 状态
    isUserScrolling,
    isAtBottom,

    // 方法
    scrollToBottom,
    smartScrollToBottom,
    handleScroll,
    enableAutoScroll,
    disableAutoScroll,
    scrollToElement,
    checkIfAtBottom
  }
}
