/**
 * Request Guard - 请求守卫工具
 * 
 * 目标：
 * - 确保同一 key 的请求，只有最后一次能更新状态
 * - 自动取消前一次未完成的请求
 * - 统一处理 token 校验和 AbortController 生命周期
 * 
 * 使用场景：
 * - Analytics Dashboard 的多个并行查询面板
 * - 任何需要"最新请求优先"语义的场景（类似 Redux-Saga 的 takeLatest）
 * 
 * @example
 * ```ts
 * const result = await requestGuard.run('overview', async (signal) => {
 *   return fetch('/api/data', { signal }).then(r => r.json())
 * })
 * if (result) {
 *   // 只有最新请求会到达这里
 *   state.data = result
 * }
 * ```
 */

export type RequestKey =
  | 'overview'
  | 'comparison'
  | 'reliability'
  | 'drilldown'
  | 'project'
  | 'reasoningTrend'
  | 'reasoningModelComparison'
// 将来新增面板时，只需在此添加新的 key

class RequestGuard {
  private tokens = new Map<RequestKey, number>()
  private controllers = new Map<RequestKey, AbortController>()

  /**
   * 执行一个可能被后续请求取消的异步任务
   * 
   * **行为约定**：
   * - 同一 key 上，只允许最新一次请求更新状态（类似 Redux-Saga 的 takeLatest）
   * - 旧请求要么被 abort，要么结果被静默丢弃
   * - 调用方只需要处理"真正的错误"，不需要处理被覆盖/被取消的情况
   * - 返回 `undefined` 表示请求已过期，不应更新状态
   * 
   * @param key - 请求通道标识，同一 key 上的请求会相互竞争
   * @param task - 异步任务函数，接收 AbortSignal 用于取消
   * @param options - 可选配置
   * @param options.abortPrevious - 是否取消前一个请求（默认 true）
   * @returns 如果是最新请求则返回结果，否则返回 undefined
   */
  async run<T>(
    key: RequestKey,
    task: (signal: AbortSignal) => Promise<T>,
    options?: {
      abortPrevious?: boolean
    }
  ): Promise<T | undefined> {
    const abortPrevious = options?.abortPrevious ?? true

    // 1. 更新当前 key 的 token（自增）
    const token = (this.tokens.get(key) ?? 0) + 1
    this.tokens.set(key, token)

    // 2. 取消该 key 上之前的请求（如果有）
    if (abortPrevious) {
      const prev = this.controllers.get(key)
      if (prev) {
        prev.abort()
      }
    }

    // 3. 为本次请求创建新的 AbortController
    const controller = new AbortController()
    this.controllers.set(key, controller)

    try {
      // 4. 执行任务，传入 signal 供调用方使用
      const result = await task(controller.signal)

      // 5. 请求完成后，检查自己是否还是最新的
      if (this.tokens.get(key) !== token) {
        // 已经有更新的请求，丢弃本次结果
        return undefined
      }

      return result
    } catch (err: any) {
      // 被 abort 视为正常"过期"，不向外抛错
      if (err?.name === 'AbortError') {
        return undefined
      }
      // 其他错误正常抛出
      throw err
    } finally {
      // 6. 清理已完成的 controller（防止 Map 中积累陈旧引用）
      // 只有当前 key 上记录的还是自己时才清理，避免误删后续请求的 controller
      if (this.controllers.get(key) === controller) {
        this.controllers.delete(key)
      }
    }
  }

  /**
   * 手动取消某个 key 上的所有请求
   * 
   * 使用场景：
   * - 用户主动停止某个面板的加载
   * - 清理特定查询通道的状态
   * 
   * @param key - 要取消的请求通道标识
   */
  abort(key: RequestKey): void {
    const controller = this.controllers.get(key)
    if (controller) {
      controller.abort()
      this.controllers.delete(key)
    }
  }

  /**
   * 取消所有进行中的请求
   * 
   * 使用场景：
   * - 组件卸载时清理所有请求
   * - 批量停止所有面板的加载
   */
  abortAll(): void {
    this.controllers.forEach((controller) => controller.abort())
    this.controllers.clear()
  }

  /**
   * 清空所有请求状态（用于全局重置，如用户登出）
   * 
   * 注意：这会同时清空 token 记录，下次请求会从 1 开始计数
   */
  reset(): void {
    this.abortAll()
    this.tokens.clear()
  }

  /**
   * 检查某个 key 上是否有进行中的请求
   * 
   * 用于调试或条件判断（例如避免重复触发）
   * 
   * @param key - 要检查的请求通道标识
   * @returns 如果有进行中的请求返回 true
   */
  isPending(key: RequestKey): boolean {
    return this.controllers.has(key)
  }
}

/**
 * Analytics 模块专用的请求守卫实例
 */
export const analyticsRequestGuard = new RequestGuard()
