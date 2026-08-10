/** Shared setup for node-based unit and integration suites. */
import { beforeEach, vi } from 'vitest'

process.env.SV_BRANCH_INVARIANTS = '1'

if (process.env.SV_TEST_VERBOSE_OPENROUTER === '1') {
  ;(globalThis as any).__SV_TEST_VERBOSE_OPENROUTER = '1'
}

beforeEach(() => {
  vi.clearAllMocks()
})

if (typeof (globalThis as any).fetch === 'function') {
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    throw new Error(`[tests] Unexpected fetch call: ${String(input)}`)
  }))
}
