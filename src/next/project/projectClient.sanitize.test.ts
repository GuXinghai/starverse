import { afterEach, describe, expect, it, vi } from 'vitest'
import { isProxy, reactive } from 'vue'
import { saveProject } from './projectClient'

describe('projectClient IPC sanitize', () => {
  const originalBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalBridge
    vi.restoreAllMocks()
  })

  it('sanitizes meta before project.save invoke so structured clone does not fail', async () => {
    const invoke = vi.fn(async (_method: string, params?: unknown) => {
      expect(() => structuredClone(params)).not.toThrow()
      return { ok: true }
    })
    ;(globalThis as any).dbBridge = { invoke }

    const meta = reactive({
      webSearchDefaults: reactive({
        searchMode: 'enable',
        searchDepth: 'custom',
        maxResults: 6,
      }),
    })

    await expect(
      saveProject({
        id: 'p1',
        name: 'Project 1',
        meta,
      })
    ).resolves.toBe(true)

    const payload = invoke.mock.calls[0]?.[1] as any
    expect(payload.id).toBe('p1')
    expect(isProxy(payload.meta)).toBe(false)
    expect(isProxy(payload.meta.webSearchDefaults)).toBe(false)
  })
})
