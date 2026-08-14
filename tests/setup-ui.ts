/** Shared setup for jsdom/Vue component suites. */
import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { config } from '@vue/test-utils'
import { installElectronBridgeMocks } from './helpers/electronBridge'

process.env.SV_BRANCH_INVARIANTS = '1'

if (process.env.SV_TEST_VERBOSE_OPENROUTER === '1') {
  ;(globalThis as any).__SV_TEST_VERBOSE_OPENROUTER = '1'
}

const w = window as any
installElectronBridgeMocks(w)

config.global.mocks = { $electron: w.electron }

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
})

if (typeof (globalThis as any).fetch === 'function') {
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    throw new Error(`[tests] Unexpected fetch call: ${String(input)}`)
  }))
}
