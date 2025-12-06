/**
 * useChatStickToBottom - Stick-to-Bottom 状态机 Composable
 * 
 * 架构设计:
 * - IntersectionObserver 哨兵监控底部状态
 * - requestAnimationFrame 批处理滚动请求
 * - 冷却时间保护用户交互优先级
 * - 中心化滚动决策,避免分散调用
 * 
 * 核心约束:
 * - 用户交互绝对优先,滚动后进入冷却期
 * - escapedFromLock 标志防止自动滚动抢夺控制权
 * - 哨兵可见时自动解除锁定,恢复跟随模式
 */

import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export interface UseChatStickToBottomOptions {
  /**
   * 用户滚动后的冷却时间(毫秒)
   * 在此时间内禁止自动滚动抢回控制权
   * @default 800
   */
  lockCooldownMs?: number
  
  /**
   * 判定"接近底部"的像素阈值
   * 用于双重判定(哨兵 + 距离)
   * @default 40
   */
  nearBottomThreshold?: number
}

export interface ChatStickToBottom {
  /** 绑定到滚动容器的 ref */
  scrollRef: Ref<HTMLElement | null>
  
  /** 绑定到底部哨兵元素(1px 高度)的 ref */
  sentinelRef: Ref<HTMLElement | null>
  
  /** 当前是否在底部(由 IntersectionObserver 判定) */
  isAtBottom: Ref<boolean>
  
  /** 用户是否已逃离锁定状态(手动滚动离开底部) */
  escapedFromLock: Ref<boolean>
  
  /** 滚动到底部 */
  scrollToBottom: (opts?: { instant?: boolean; force?: boolean }) => void
  
  /** 新内容到来时调用,由状态机决定是否滚动 */
  onNewContent: () => void
  
  /** 用户开始滚动时调用(wheel/touch/mousedown) */
  onUserScrollStart: () => void
  
  /** 获取当前滚动位置 */
  getScrollTop: () => number
  
  /** 设置滚动位置(会触发 escapedFromLock) */
  setScrollTop: (y: number) => void
}

/**
 * Stick-to-Bottom 滚动控制 Composable
 * 
 * 使用方式:
 * ```ts
 * const { scrollRef, sentinelRef, isAtBottom, onNewContent } = useChatStickToBottom()
 * 
 * // 模板中绑定
 * <div ref="scrollRef">
 *   <MessageList />
 *   <div ref="sentinelRef" style="height: 1px;" />
 * </div>
 * 
 * // 新内容到来时
 * onNewContent()
 * ```
 */
export function useChatStickToBottom(
  options: UseChatStickToBottomOptions = {}
): ChatStickToBottom {
  const lockCooldownMs = options.lockCooldownMs ?? 800
  const nearBottomThreshold = options.nearBottomThreshold ?? 40

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 状态管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  const scrollRef = ref<HTMLElement | null>(null)
  const sentinelRef = ref<HTMLElement | null>(null)
  
  /** 是否在底部(由 IntersectionObserver 更新) */
  const isAtBottom = ref(true)
  
  /** 用户是否已逃离锁定(手动滚动离开底部) */
  const escapedFromLock = ref(false)
  
  /** 上次用户滚动的时间戳 */
  const lastUserScrollAt = ref(0)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // IntersectionObserver 哨兵监控
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  let observer: IntersectionObserver | null = null

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RAF 批处理滚动队列
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  /** 是否有待处理的滚动请求 */
  let pendingScroll = false
  
  /** RAF 任务 ID */
  let rafId: number | null = null

  /**
   * 请求滚动到底部(通过 RAF 批处理)
   * 
   * 设计要点:
   * - 使用 requestAnimationFrame 合并短时间内的多次调用
   * - 即使 token 频率极高(几十次/秒),也只在浏览器帧率下限内执行
   * - 替代原来每 token 都 setTimeout(0) 的性能瓶颈
   */
  const requestScrollToBottom = () => {
    if (pendingScroll) return // 已有待处理请求,不重复创建
    
    pendingScroll = true
    rafId = window.requestAnimationFrame(() => {
      pendingScroll = false
      performScrollToBottom()
    })
  }

  /**
   * 执行实际的滚动操作
   * 
   * 决策逻辑(所有条件必须同时满足):
   * 1. 滚动容器存在
   * 2. 不在用户滚动冷却期内
   * 3. 用户未明确逃离锁定
   * 4. 当前接近底部(哨兵可见 或 距离阈值内)
   * 
   * 只有满足所有条件,才执行滚动,否则静默忽略
   */
  const performScrollToBottom = (force = false) => {
    const el = scrollRef.value
    if (!el) return

    // 🚨 强制模式: 用户主动点击"回到底部"按钮,跳过所有检查
    if (!force) {
      // 条件 1: 冷却期保护
      const now = performance.now()
      if (now - lastUserScrollAt.value < lockCooldownMs) {
        return // 用户刚滚动过,不抢夺控制权
      }

      // 条件 2: escapedFromLock 保护
      if (escapedFromLock.value) {
        return // 用户明确离开底部,需要等哨兵重新可见才解除
      }

      // 条件 3: 双重底部判定(哨兵 + 距离)
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      const nearBottom = distanceToBottom <= nearBottomThreshold

      if (!nearBottom && !isAtBottom.value) {
        return // 既不接近底部,哨兵也不可见,不滚动
      }
    }

    // ✅ 所有条件满足(或强制模式),执行滚动
    el.scrollTop = el.scrollHeight
    
    // 🔓 强制滚动后,解除 escapedFromLock 状态
    if (force) {
      escapedFromLock.value = false
      lastUserScrollAt.value = 0 // 重置冷却时间
    }
    
    // 注: 第一版使用瞬时滚动,避免 CSS scroll-behavior 与 JS 冲突
    // 未来如需平滑滚动,可改为:
    // el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  /**
   * 滚动到底部(公开 API)
   * 
   * 用于外部强制滚动的场景:
   * - 发送新消息后
   * - 切换会话后(无保存位置时)
   * - 用户点击"回到底部"按钮
   * 
   * @param force - 是否强制滚动(跳过状态机检查)
   *                用户主动点击按钮时应设为 true
   */
  const scrollToBottom = (opts?: { instant?: boolean; force?: boolean }) => {
    const force = opts?.force ?? false
    
    if (force) {
      // 强制模式: 立即执行,不通过 RAF 批处理
      performScrollToBottom(true)
    } else {
      // 正常模式: 通过 RAF 调度,受状态机约束
      requestScrollToBottom()
    }
  }

  /**
   * 新内容到来时调用
   * 
   * 调用场景:
   * - 流式 token 追加后
   * - 推理文本更新后
   * - 图片追加后
   * - 任何导致消息列表高度变化的操作
   * 
   * 设计要点:
   * - 不直接滚动,只发出"请求滚动"信号
   * - 由 performScrollToBottom 根据状态机决定是否执行
   * - RAF 批处理确保高频调用不影响性能
   */
  const onNewContent = () => {
    requestScrollToBottom()
  }

  /**
   * 用户开始滚动时调用
   * 
   * 触发时机:
   * - @wheel.passive (鼠标滚轮)
   * - @touchstart.passive (触摸屏)
   * - @mousedown (鼠标拖动滚动条)
   * 
   * 效果:
   * - 立即标记 escapedFromLock = true
   * - 记录当前时间,启动冷却期
   * - 阻止短时间内的所有自动滚动
   */
  const onUserScrollStart = () => {
    lastUserScrollAt.value = performance.now()
    escapedFromLock.value = true
  }

  /**
   * 获取当前滚动位置
   * 
   * 用于对话切换时保存滚动位置
   */
  const getScrollTop = (): number => {
    return scrollRef.value?.scrollTop ?? 0
  }

  /**
   * 设置滚动位置
   * 
   * 用于对话切换时恢复滚动位置
   * 注: 设置位置后会触发 escapedFromLock,视为用户控制
   */
  const setScrollTop = (y: number) => {
    if (!scrollRef.value) return
    
    scrollRef.value.scrollTop = y
    
    // 🔒 关键: 恢复位置视为用户操作,防止随后的 onNewContent 立即抢回
    onUserScrollStart()
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 生命周期: IntersectionObserver 初始化与清理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  onMounted(() => {
    const root = scrollRef.value
    const target = sentinelRef.value
    
    if (!root || !target) {
      console.warn('[useChatStickToBottom] scrollRef or sentinelRef not found')
      return
    }

    // 创建 IntersectionObserver 监听哨兵元素
    observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.target !== target) continue
          
          const visible = entry.isIntersecting

          // 更新底部状态
          isAtBottom.value = visible

          // 🔓 关键: 哨兵重新可见,自动解除 escapedFromLock
          // 用户滚回底部后,恢复自动跟随模式
          if (visible) {
            escapedFromLock.value = false
          }
        }
      },
      {
        root, // 监听的滚动容器
        threshold: 0.01, // 哨兵露出 1% 就判定为可见
        // rootMargin: '0px', // 可选: 调整判定边界
      }
    )

    observer.observe(target)
  })

  onUnmounted(() => {
    // 清理 Observer
    if (observer && sentinelRef.value) {
      observer.unobserve(sentinelRef.value)
      observer.disconnect()
    }
    
    // 取消待处理的 RAF
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
    }
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 返回公开 API
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  return {
    scrollRef,
    sentinelRef,
    isAtBottom,
    escapedFromLock,
    scrollToBottom,
    onNewContent,
    onUserScrollStart,
    getScrollTop,
    setScrollTop,
  }
}
