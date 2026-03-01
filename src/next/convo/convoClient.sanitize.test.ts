import { afterEach, describe, expect, it, vi } from 'vitest'
import { isProxy, reactive } from 'vue'
import { saveConvo } from './convoClient'

describe('convoClient IPC sanitize', () => {
  const originalBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalBridge
    vi.restoreAllMocks()
  })

  it('sanitizes meta before convo.save invoke so structured clone does not fail', async () => {
    const invoke = vi.fn(async (_method: string, params?: unknown) => {
      expect(() => structuredClone(params)).not.toThrow()
      return { ok: true }
    })
    ;(globalThis as any).dbBridge = { invoke }

    const meta = reactive({
      reasoningPrefs: reactive({
        mode: 'effort',
        effort: 'medium',
        exclude: false,
      }),
      webSearchOverride: reactive({
        searchMode: 'default',
      }),
    })

    await expect(
      saveConvo({
        id: 'c1',
        title: 'Chat 1',
        projectId: null,
        meta: { ...meta, selectedModelKey: 'google/gemini-2.5-flash-image' },
      })
    ).resolves.toBe(true)

    const payload = invoke.mock.calls[0]?.[1] as any
    expect(payload.id).toBe('c1')
    expect(payload.meta.selectedModelKey).toBe('google/gemini-2.5-flash-image')
    expect(isProxy(payload.meta)).toBe(false)
    expect(isProxy(payload.meta.reasoningPrefs)).toBe(false)
    expect(isProxy(payload.meta.webSearchOverride)).toBe(false)
  })
})
