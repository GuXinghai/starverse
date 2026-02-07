/* eslint-disable max-lines-per-function */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventScheduler } from './eventScheduler'
import type { DomainEvent } from './types'

type CommitRecord = {
  runId: string
  events: DomainEvent[]
  info: { reason: string; eventCount: number }
}

const makeEvent = (id: string): DomainEvent => ({ type: 'StreamComment', text: id })

describe('createEventScheduler', () => {
  const originalRaf = globalThis.requestAnimationFrame
  const originalCancelRaf = globalThis.cancelAnimationFrame
  let rafSeq = 1
  let rafTimers = new Map<number, ReturnType<typeof setTimeout>>()

  beforeEach(() => {
    vi.useFakeTimers()
    rafSeq = 1
    rafTimers = new Map<number, ReturnType<typeof setTimeout>>()
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = rafSeq++
      const mockedTime = vi.getMockedSystemTime()
      const frameTs = mockedTime instanceof Date ? mockedTime.getTime() : (mockedTime ?? Date.now())
      const timer = setTimeout(() => cb(frameTs), 16)
      rafTimers.set(id, timer)
      return id
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => {
      const timer = rafTimers.get(id)
      if (timer) {
        clearTimeout(timer)
        rafTimers.delete(id)
      }
    }) as typeof cancelAnimationFrame
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf
    globalThis.cancelAnimationFrame = originalCancelRaf
    vi.useRealTimers()
  })

  it('preserves FIFO ordering within the same run queue', async () => {
    const commits: CommitRecord[] = []
    const scheduler = createEventScheduler({
      commit: (runId, events, info) => commits.push({ runId, events, info }),
    })

    scheduler.enqueue('run-a', makeEvent('e1'))
    scheduler.enqueue('run-a', makeEvent('e2'))
    scheduler.enqueue('run-a', makeEvent('e3'))

    await vi.advanceTimersByTimeAsync(20)

    const texts = commits.flatMap((c) => c.events.map((ev) => (ev as { text: string }).text))
    expect(texts).toEqual(['e1', 'e2', 'e3'])
  })

  it('respects per-frame batching boundary and drains across frames', async () => {
    const commits: CommitRecord[] = []
    const scheduler = createEventScheduler({
      commit: (runId, events, info) => commits.push({ runId, events, info }),
      config: {
        maxEventsPerFrame: 2,
        maxTextCharsPerFrame: 100000,
        maxReasoningDetailsPerFrame: 100000,
        frameBudgetMs: 1000,
      },
    })

    for (let i = 1; i <= 5; i += 1) {
      scheduler.enqueue('run-batch', makeEvent(`b${i}`))
    }

    await vi.advanceTimersByTimeAsync(20)
    expect(commits.map((c) => c.events.length)).toEqual([2])

    await vi.advanceTimersByTimeAsync(20)
    expect(commits.map((c) => c.events.length)).toEqual([2, 2])

    await vi.advanceTimersByTimeAsync(20)
    expect(commits.map((c) => c.events.length)).toEqual([2, 2, 1])
  })

  it('flushNow is idempotent when queue is already drained', () => {
    const commit = vi.fn()
    const scheduler = createEventScheduler({ commit })

    scheduler.enqueue('run-flush', makeEvent('f1'))
    scheduler.enqueue('run-flush', makeEvent('f2'))

    scheduler.flushNow('run-flush')
    scheduler.flushNow('run-flush')

    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0]?.[1]).toHaveLength(2)
  })

  it('drains all enqueued events exactly once', () => {
    const commits: CommitRecord[] = []
    const scheduler = createEventScheduler({
      commit: (runId, events, info) => commits.push({ runId, events, info }),
    })

    for (let i = 1; i <= 7; i += 1) {
      scheduler.enqueue('run-drain', makeEvent(`d${i}`))
    }

    scheduler.flushNow('run-drain')

    const texts = commits.flatMap((c) => c.events.map((ev) => (ev as { text: string }).text))
    expect(texts).toHaveLength(7)
    expect(new Set(texts).size).toBe(7)
  })

  it('does not dispatch after dispose, including pending timers and later enqueue', async () => {
    const commits: CommitRecord[] = []
    const scheduler = createEventScheduler({
      commit: (runId, events, info) => commits.push({ runId, events, info }),
    })

    scheduler.enqueue('run-dispose', makeEvent('x1'))
    scheduler.dispose('run-dispose')
    const committedAtDispose = commits.length

    await vi.runAllTimersAsync()
    scheduler.enqueue('run-dispose', makeEvent('x2'))
    await vi.runAllTimersAsync()

    expect(commits.length).toBe(committedAtDispose)
  })

  it('remains usable after a commit callback throws', () => {
    let shouldThrow = true
    const commit = vi.fn(() => {
      if (shouldThrow) {
        shouldThrow = false
        throw new Error('commit failed once')
      }
    })
    const scheduler = createEventScheduler({ commit })

    scheduler.enqueue('run-err', makeEvent('err-1'))
    expect(() => scheduler.flushNow('run-err')).toThrow('commit failed once')

    scheduler.enqueue('run-err', makeEvent('err-2'))
    expect(() => scheduler.flushNow('run-err')).not.toThrow()
    expect(commit).toHaveBeenCalledTimes(2)
  })
})
