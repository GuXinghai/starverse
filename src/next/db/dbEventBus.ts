/**
 * 数据库事件总线
 *
 * 职责：
 * 1. 订阅 Worker 线程发送的结构化数据库事件
 * 2. 缓冲模式：启动时缓存事件，待基线同步完成后批量回放
 * 3. 提供类型安全的事件订阅 API
 *
 * 设计决策：
 * - 使用 Set 存储订阅者，避免重复订阅
 * - 缓冲队列有上限（1000 条），超过后丢弃旧事件
 * - 事件回放保持原有顺序
 */

/** 数据库事件类型（镜像 infra/db/types.ts 的 DbEvent） */
export type DbEvent =
  | { type: 'project.created'; projectId: string; name: string }
  | { type: 'project.updated'; projectId: string; name?: string }
  | { type: 'project.deleted'; projectId: string }
  | { type: 'conversation.moved'; convoId: string; fromProjectId: string | null; toProjectId: string | null }
  | { type: 'conversation.activity_updated'; convoId: string; updatedAt: number }

/** 事件回调类型 */
export type DbEventCallback = (event: DbEvent) => void

/** 事件类型字面量 */
export type DbEventType = DbEvent['type']

/** 最大缓冲队列长度 */
const MAX_BUFFER_SIZE = 1000

// ========== 模块状态 ==========

/** 订阅者集合 */
const listeners = new Set<DbEventCallback>()

/** 是否处于缓冲模式 */
let buffering = true

/** 事件缓冲队列 */
const buffer: DbEvent[] = []

/** 是否已初始化（连接到 preload API） */
let initialized = false

/** 取消订阅函数（来自 preload onEvent） */
let unsubscribe: (() => void) | null = null

// ========== 公共 API ==========

/**
 * 初始化事件总线
 * 连接到 preload 暴露的 dbBridge.onEvent
 * 应在应用启动时调用一次
 */
export function initDbEventBus(): void {
  if (initialized) {
    console.warn('[dbEventBus] Already initialized')
    return
  }

  const dbBridge = (window as any).dbBridge
  if (!dbBridge?.onEvent) {
    console.warn('[dbEventBus] dbBridge.onEvent not available, skipping initialization')
    return
  }

  unsubscribe = dbBridge.onEvent((rawEvent: unknown) => {
    const event = rawEvent as DbEvent
    handleEvent(event)
  })

  initialized = true
  console.log('[dbEventBus] Initialized with buffering enabled')
}

/**
 * 销毁事件总线
 * 取消 preload 订阅，清空所有状态
 */
export function destroyDbEventBus(): void {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  listeners.clear()
  buffer.length = 0
  buffering = true
  initialized = false
}

/**
 * 订阅数据库事件
 * @param callback 事件回调
 * @returns 取消订阅函数
 */
export function subscribeDbEvent(callback: DbEventCallback): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

/**
 * 订阅特定类型的事件
 * @param eventType 事件类型
 * @param callback 回调函数
 * @returns 取消订阅函数
 */
export function subscribeDbEventType<T extends DbEventType>(
  eventType: T,
  callback: (event: Extract<DbEvent, { type: T }>) => void
): () => void {
  const handler: DbEventCallback = (event) => {
    if (event.type === eventType) {
      callback(event as Extract<DbEvent, { type: T }>)
    }
  }
  return subscribeDbEvent(handler)
}

/**
 * 结束缓冲模式，进入直通模式
 * 调用此方法会立即回放所有缓冲的事件，然后清空缓冲区
 * 应在基线同步完成后调用
 */
export function flushBuffer(): void {
  if (!buffering) {
    return
  }

  buffering = false

  // 回放缓冲的事件
  const eventsToReplay = [...buffer]
  buffer.length = 0

  console.log(`[dbEventBus] Flushing ${eventsToReplay.length} buffered events`)

  for (const event of eventsToReplay) {
    dispatch(event)
  }
}

/**
 * 检查是否处于缓冲模式
 */
export function isBuffering(): boolean {
  return buffering
}

/**
 * 获取当前缓冲队列长度（用于调试）
 */
export function getBufferLength(): number {
  return buffer.length
}

// ========== 内部函数 ==========

/**
 * 处理从 Worker 接收的事件
 */
function handleEvent(event: DbEvent): void {
  if (buffering) {
    // 缓冲模式：加入队列
    if (buffer.length >= MAX_BUFFER_SIZE) {
      // 队列满了，丢弃最旧的事件
      buffer.shift()
      console.warn('[dbEventBus] Buffer overflow, dropping oldest event')
    }
    buffer.push(event)
  } else {
    // 直通模式：立即分发
    dispatch(event)
  }
}

/**
 * 分发事件给所有订阅者
 */
function dispatch(event: DbEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch (err) {
      console.error('[dbEventBus] Listener error:', err)
    }
  }
}

// ========== 自动初始化 ==========
// 模块加载时自动尝试初始化，确保在 onMounted 之前就开始缓冲事件
// 如果 dbBridge 不可用（非 Electron 环境），静默跳过
;(function autoInit() {
  // 使用 queueMicrotask 确保在当前脚本执行完成后立即初始化
  // 这比 setTimeout(0) 更快，能在渲染进程 script 加载完成后立即执行
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => {
      if (!initialized) {
        initDbEventBus()
      }
    })
  } else {
    // 降级方案
    setTimeout(() => {
      if (!initialized) {
        initDbEventBus()
      }
    }, 0)
  }
})()
