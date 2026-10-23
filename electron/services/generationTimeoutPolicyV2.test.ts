import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  abortableGenerationReadV2, createGenerationAbortScope, createStoreBackedGenerationTotalTimeoutSourceV2, isValidGenerationTotalTimeoutMsV2,
  setGenerationTotalTimeoutSourceV2,
} from './generationTimeoutPolicyV2'

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

  it('P4a-17: every runner stream read settles on abort', () => {
    const dir = __dirname
    for (const f of readdirSync(dir).filter((n) => /(?:StreamRunnerV2|InitialStreamRunnerV2)\.ts$/.test(n))) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/await reader\.read\(\)/)
    }
  })

  it('P4a-17: abortableGenerationReadV2 rejects a stalled read with the abort reason', async () => {
    const controller = new AbortController()
    const stalled = new Promise<never>(() => undefined)
    const read = abortableGenerationReadV2(stalled, controller.signal)
    controller.abort('user_cancelled')
    await expect(read).rejects.toBe('user_cancelled')
    await expect(abortableGenerationReadV2(Promise.resolve(1), controller.signal)).rejects.toBe('user_cancelled')
    await expect(abortableGenerationReadV2(Promise.resolve(2), new AbortController().signal)).resolves.toBe(2)
  })

  describe('configured Settings value handoff', () => {
    const prefs: Record<string, unknown> = {}
    const store = { get: (key: string) => (key === 'generationV2UiPreferences' ? prefs : undefined) }
    beforeEach(() => {
      for (const k of Object.keys(prefs)) delete prefs[k]
      setGenerationTotalTimeoutSourceV2(createStoreBackedGenerationTotalTimeoutSourceV2(store))
    })
    afterEach(() => { setGenerationTotalTimeoutSourceV2(null) })

    it('defaults to Unlimited when nothing is persisted', () => {
      expect(createStoreBackedGenerationTotalTimeoutSourceV2(store)()).toBeNull()
      const scope = createGenerationAbortScope(undefined) // what every runner passes when no explicit value is injected
      vi.advanceTimersByTime(3 * 60 * 60_000)
      expect(scope.signal.aborted).toBe(false)
      scope.dispose()
    })

    it('applies a persisted finite value to the next scope, with timeout (not cancel) semantics', () => {
      prefs.generationTotalTimeoutMs = 120_000
      const scope = createGenerationAbortScope(undefined)
      vi.advanceTimersByTime(119_999)
      expect(scope.signal.aborted).toBe(false)
      vi.advanceTimersByTime(1)
      expect(scope.signal.reason).toBe('timeout')
      expect(scope.timedOut()).toBe(true)
      scope.dispose()
    })

    it('reads the setting per generation: disabling back to Unlimited takes effect without restart', () => {
      prefs.generationTotalTimeoutMs = 60_000
      const limited = createGenerationAbortScope(undefined)
      prefs.generationTotalTimeoutMs = null
      const unlimited = createGenerationAbortScope(undefined)
      vi.advanceTimersByTime(10 * 60_000)
      expect(limited.signal.aborted).toBe(true)
      expect(unlimited.signal.aborted).toBe(false)
      limited.dispose(); unlimited.dispose()
    })

    it('invalid persisted values fall back to Unlimited instead of throwing or timing out', () => {
      for (const bad of [0, -5, 1.5, '600000', Number.MAX_SAFE_INTEGER, {}]) {
        prefs.generationTotalTimeoutMs = bad
        expect(createStoreBackedGenerationTotalTimeoutSourceV2(store)(), String(bad)).toBeNull()
      }
    })

    it('an explicit runner value or Stop still wins over the configured value', () => {
      prefs.generationTotalTimeoutMs = 60_000
      const explicitUnlimited = createGenerationAbortScope(undefined, null)
      const external = new AbortController()
      const stopped = createGenerationAbortScope(external.signal)
      external.abort()
      vi.advanceTimersByTime(5 * 60_000)
      expect(explicitUnlimited.signal.aborted).toBe(false)
      expect(stopped.signal.reason).toBe('user_cancelled')
      expect(stopped.timedOut()).toBe(false)
      explicitUnlimited.dispose(); stopped.dispose()
    })
  })
})
