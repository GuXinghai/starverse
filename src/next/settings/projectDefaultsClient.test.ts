import { afterEach, describe, expect, it, vi } from 'vitest'
import { listProjectDefaults, setProjectDefaults } from './projectDefaultsClient'
import { GENERATION_V2_UI_PREFERENCE_KEYS } from '../../shared/settings/generationV2UiPreferenceKeys'

describe('project defaults client (V2 UI preference store)', () => {
  const originalStore = (globalThis as any).electronStore
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).electronStore = originalStore
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('registers the preference leaf so the main process accepts the write', () => {
    expect(GENERATION_V2_UI_PREFERENCE_KEYS.has('projectDefaults')).toBe(true)
  })

  it('lists stored per-project meta and ignores malformed entries', async () => {
    const get = vi.fn().mockResolvedValue({ projectDefaults: { p1: { a: 1 }, p2: 'bad', p3: [1] } })
    ;(globalThis as any).electronStore = { get, set: vi.fn() }
    const map = await listProjectDefaults()
    expect([...map.keys()]).toEqual(['p1'])
    expect(map.get('p1')).toEqual({ a: 1 })
  })

  it('persists through electronStore only, preserving other projects, and never touches dbBridge', async () => {
    const invoke = vi.fn()
    ;(globalThis as any).dbBridge = { invoke }
    const get = vi.fn().mockResolvedValue({ projectDefaults: { p1: { a: 1 } } })
    const set = vi.fn().mockResolvedValue(true)
    ;(globalThis as any).electronStore = { get, set }

    await expect(setProjectDefaults('p2', { b: 2 })).resolves.toBe(true)
    expect(set).toHaveBeenCalledWith('generationV2UiPreferences.projectDefaults', { p1: { a: 1 }, p2: { b: 2 } })

    await expect(setProjectDefaults('p1', null)).resolves.toBe(true)
    expect(set).toHaveBeenLastCalledWith('generationV2UiPreferences.projectDefaults', {})
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reports failure (no false Saved) when the store rejects, throws, or is unavailable', async () => {
    ;(globalThis as any).electronStore = { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(false) }
    await expect(setProjectDefaults('p1', { a: 1 })).resolves.toBe(false)
    ;(globalThis as any).electronStore = { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockRejectedValue(new Error('x')) }
    await expect(setProjectDefaults('p1', { a: 1 })).resolves.toBe(false)
    ;(globalThis as any).electronStore = undefined
    await expect(setProjectDefaults('p1', { a: 1 })).resolves.toBe(false)
    await expect(setProjectDefaults('  ', { a: 1 })).resolves.toBe(false)
  })
})
