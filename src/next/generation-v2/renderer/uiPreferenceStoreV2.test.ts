import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getGenerationV2UiPreference,
  setGenerationV2UiPreference,
} from './uiPreferenceStoreV2'

describe('generation V2 UI preference store', () => {
  const originalStore = (globalThis as any).electronStore

  afterEach(() => {
    ;(globalThis as any).electronStore = originalStore
    vi.restoreAllMocks()
  })

  it('reads a preference from the retained namespace', async () => {
    const get = vi.fn().mockResolvedValue({ webSearchDefaults: { searchMode: 'enable' } })
    ;(globalThis as any).electronStore = { get, set: vi.fn() }

    await expect(getGenerationV2UiPreference('webSearchDefaults')).resolves.toEqual({ searchMode: 'enable' })
    expect(get).toHaveBeenCalledWith('generationV2UiPreferences')
  })

  it('writes only a known preference leaf and requires a positive acknowledgement', async () => {
    const set = vi.fn().mockResolvedValue(true)
    ;(globalThis as any).electronStore = { get: vi.fn(), set }

    await expect(setGenerationV2UiPreference('webSearchDefaults', { searchMode: 'default' })).resolves.toBe(true)
    expect(set).toHaveBeenCalledWith('generationV2UiPreferences.webSearchDefaults', { searchMode: 'default' })

    set.mockResolvedValue(false)
    await expect(setGenerationV2UiPreference('imageGenerationDefault', { enabled: true })).resolves.toBe(false)
    set.mockResolvedValue(undefined)
    await expect(setGenerationV2UiPreference('imageGenerationDefault', { enabled: true })).resolves.toBe(false)
  })

  it('returns false when writes throw, the bridge is unavailable, or the path is unsupported', async () => {
    const set = vi.fn().mockRejectedValue(new Error('IPC unavailable'))
    ;(globalThis as any).electronStore = { get: vi.fn(), set }

    await expect(setGenerationV2UiPreference('webSearchDefaults', {})).resolves.toBe(false)
    expect(await setGenerationV2UiPreference('webSearchDefaults.unapproved', true)).toBe(false)
    expect(set).toHaveBeenCalledTimes(1)

    ;(globalThis as any).electronStore = null
    await expect(setGenerationV2UiPreference('webSearchDefaults', {})).resolves.toBe(false)
  })
})
