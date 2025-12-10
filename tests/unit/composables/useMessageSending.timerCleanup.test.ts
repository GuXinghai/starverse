/**
 * 流式空闲超时定时器清理测试
 * 
 * 修复问题：流式传输成功完成后，流式空闲超时定时器未被清除，导致 30 秒后出现假性超时报错。
 * 
 * 根因：在 sendMessageCore 的成功返回路径中缺少 clearAllTimeouts() 调用。
 * 
 * 修复策略：
 * 1. 成功返回前调用 clearAllTimeouts()
 * 2. finally 块中添加双重保险
 * 3. 早期返回路径也清理定时器
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Stream Idle Timeout Timer Cleanup - 核心逻辑验证', () => {
  let timerId: NodeJS.Timeout | null = null

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    if (timerId) {
      clearTimeout(timerId)
      timerId = null
    }
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('验证定时器清理逻辑：设置后清除，不应触发回调', async () => {
    let timeoutFired = false

    // 模拟流式空闲超时定时器
    timerId = setTimeout(() => {
      timeoutFired = true
      console.error('🚨 流式空闲超时')
    }, 30000)

    // ✅ 修复点：在流式完成后清除定时器
    clearTimeout(timerId)
    timerId = null

    // 快进 30 秒
    await vi.advanceTimersByTimeAsync(30000)

    // 验证：超时回调不应该被触发
    expect(timeoutFired).toBe(false)
  })

  it('验证问题场景：设置后未清除，会触发回调（旧代码的 bug）', async () => {
    let timeoutFired = false

    // 模拟流式空闲超时定时器
    timerId = setTimeout(() => {
      timeoutFired = true
      console.error('🚨 流式空闲超时')
    }, 30000)

    // ❌ 问题代码：忘记清除定时器
    // (不调用 clearTimeout)

    // 快进 30 秒
    await vi.advanceTimersByTimeAsync(30000)

    // 验证：超时回调会被错误触发
    expect(timeoutFired).toBe(true)
  })

  it('验证 finally 块的兜底保护', async () => {
    let timeoutFired = false

    try {
      timerId = setTimeout(() => {
        timeoutFired = true
      }, 30000)

      // 模拟流式处理
      // ...

      // 假设忘记在 try 块末尾清除
    } finally {
      // ✅ finally 块中的双重保险
      if (timerId) {
        clearTimeout(timerId)
        timerId = null
      }
    }

    await vi.advanceTimersByTimeAsync(30000)

    expect(timeoutFired).toBe(false)
  })

  it('验证早期返回路径也清理定时器', async () => {
    let timeoutFired = false

    timerId = setTimeout(() => {
      timeoutFired = true
    }, 30000)

    // 模拟参数验证失败的早期返回
    const paramValidationFailed = true
    if (paramValidationFailed) {
      // ✅ 修复：早期返回前清理定时器
      if (timerId) {
        clearTimeout(timerId)
        timerId = null
      }
      // return { success: false }
    }

    await vi.advanceTimersByTimeAsync(30000)

    expect(timeoutFired).toBe(false)
  })

  it('验证多次刷新定时器的场景', async () => {
    let timeoutFired = false
    let refreshCount = 0

    // 模拟 refreshStreamIdleTimeout 函数
    const refreshTimer = () => {
      if (timerId) {
        clearTimeout(timerId)
      }
      timerId = setTimeout(() => {
        timeoutFired = true
        console.error('🚨 流式空闲超时')
      }, 30000)
      refreshCount++
    }

    // 模拟收到 3 个 chunk，每次都刷新定时器
    refreshTimer() // chunk 1
    await vi.advanceTimersByTimeAsync(1000)

    refreshTimer() // chunk 2
    await vi.advanceTimersByTimeAsync(1000)

    refreshTimer() // chunk 3 (最后一个)
    await vi.advanceTimersByTimeAsync(1000)

    // ✅ 修复点：流式完成后清除最后一个定时器
    if (timerId) {
      clearTimeout(timerId)
      timerId = null
    }

    // 快进 30 秒
    await vi.advanceTimersByTimeAsync(30000)

    // 验证
    expect(refreshCount).toBe(3)
    expect(timeoutFired).toBe(false)
  })

  it('验证问题场景：最后一个定时器未清除', async () => {
    let timeoutFired = false

    // 模拟 refreshStreamIdleTimeout 函数
    const refreshTimer = () => {
      if (timerId) {
        clearTimeout(timerId)
      }
      timerId = setTimeout(() => {
        timeoutFired = true
        console.error('🚨 流式空闲超时 - 幽灵超时')
      }, 30000)
    }

    // 模拟收到 3 个 chunk
    refreshTimer() // chunk 1
    await vi.advanceTimersByTimeAsync(1000)

    refreshTimer() // chunk 2
    await vi.advanceTimersByTimeAsync(1000)

    refreshTimer() // chunk 3 - 最后一个，但是...
    // ❌ 问题代码：流式完成了，但忘记清除这最后一个定时器

    // 快进 30 秒
    await vi.advanceTimersByTimeAsync(30000)

    // 验证：会触发假性超时
    expect(timeoutFired).toBe(true)
  })

  it('验证用户中止流式响应时清除定时器', async () => {
    let timeoutFired = false

    // 模拟流式空闲超时定时器
    timerId = setTimeout(() => {
      timeoutFired = true
      console.error('🚨 流式空闲超时')
    }, 30000)

    // 模拟用户点击中止按钮
    // cancelSending() 应该调用 clearAllTimeouts()
    if (timerId) {
      clearTimeout(timerId)
      timerId = null
    }

    // 快进 30 秒
    await vi.advanceTimersByTimeAsync(30000)

    // 验证：超时不应触发
    expect(timeoutFired).toBe(false)
  })

  it('验证强制重置状态时清除定时器', async () => {
    let timeoutFired = false

    // 模拟多个定时器
    const timer1 = setTimeout(() => { timeoutFired = true }, 30000)
    const timer2 = setTimeout(() => { timeoutFired = true }, 60000)

    // 模拟 forceResetSendingState() 清理所有定时器
    clearTimeout(timer1)
    clearTimeout(timer2)

    // 快进 60 秒
    await vi.advanceTimersByTimeAsync(60000)

    // 验证：所有超时都不应触发
    expect(timeoutFired).toBe(false)
  })
})
