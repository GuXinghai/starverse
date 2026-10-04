import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createGenerationAbortScope, isValidGenerationTotalTimeoutMsV2 } from './generationTimeoutPolicyV2'

describe('generation total-timeout boundary', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('has no deadline by default: long silent reasoning past the old 5 minutes is not aborted', () => {
    const scope = createGenerationAbortScope(undefined)
    vi.advanceTimersByTime(2 * 60 * 60_000)
    expect(scope.signal.aborted).toBe(false)
    expect(scope.timedOut()).toBe(false)
    scope.dispose()
  })

  it('null is explicit unlimited and an actively streaming run is never cut off', () => {
    const scope = createGenerationAbortScope(undefined, null)
    for (let i = 0; i < 60; i++) vi.advanceTimersByTime(60_000) // 1h of steady token arrival
    expect(scope.signal.aborted).toBe(false)
    scope.dispose()
  })

  it('enforces an explicitly configured total timeout and reports timeout, not cancel', () => {
    const scope = createGenerationAbortScope(undefined, 1000)
    vi.advanceTimersByTime(999)
    expect(scope.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)
    expect(scope.signal.aborted).toBe(true)
    expect(scope.signal.reason).toBe('timeout')
    expect(scope.timedOut()).toBe(true)
    scope.dispose()
  })

  it('Stop aborts as user_cancelled with or without a configured timeout, and never reads as timedOut', () => {
    for (const total of [undefined, 60_000] as const) {
      const external = new AbortController()
      const scope = createGenerationAbortScope(external.signal, total)
      external.abort()
      expect(scope.signal.aborted).toBe(true)
      expect(scope.signal.reason).toBe('user_cancelled')
      vi.advanceTimersByTime(120_000)
      expect(scope.timedOut()).toBe(false)
      scope.dispose()
    }
    const pre = new AbortController(); pre.abort()
    expect(createGenerationAbortScope(pre.signal).signal.reason).toBe('user_cancelled')
  })

  it('dispose clears the timer so a finished run is never late-aborted', () => {
    const scope = createGenerationAbortScope(undefined, 1000)
    scope.dispose()
    vi.advanceTimersByTime(5000)
    expect(scope.signal.aborted).toBe(false)
  })

  it('rejects invalid configured values instead of reinterpreting them', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER]) {
      expect(isValidGenerationTotalTimeoutMsV2(bad)).toBe(false)
      expect(() => createGenerationAbortScope(undefined, bad)).toThrow('GENERATION_TOTAL_TIMEOUT_INVALID')
    }
  })

  it('no runner keeps a private 5-minute deadline or private abort scope', () => {
    const dir = __dirname
    for (const f of readdirSync(dir).filter((n) => /StreamRunnerV2\.ts$/.test(n))) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/DEFAULT_TIMEOUT_MS|5 \* 60_000/)
      expect(src, f).not.toMatch(/setTimeout\(\(\) => \{[^}]*abort\('timeout'\)/)
      expect(src, f).toContain('createGenerationAbortScope')
    }
  })
})
