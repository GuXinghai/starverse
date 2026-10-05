import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSearchScopeDefault, setSearchScopeDefault } from './searchScopeDefaultClient'

describe('search scope default persistence', () => {
  const originalStore = (globalThis as any).electronStore
  afterEach(() => { (globalThis as any).electronStore = originalStore })
  const scope = { projectName: false, convoName: true, userMessages: false, assistantMessages: true }

  it('persists the default under the retained UI-preference namespace and reads it back', async () => {
    const set = vi.fn().mockResolvedValue(true)
    ;(globalThis as any).electronStore = { get: vi.fn().mockResolvedValue({ searchScopeDefault: scope }), set }
    await expect(setSearchScopeDefault(scope)).resolves.toBe(true)
    expect(set).toHaveBeenCalledWith('generationV2UiPreferences.searchScopeDefault', scope)
    await expect(getSearchScopeDefault()).resolves.toEqual(scope)
  })

  it('refuses to persist an empty scope and defaults to all scopes when nothing is stored', async () => {
    const set = vi.fn().mockResolvedValue(true)
    ;(globalThis as any).electronStore = { get: vi.fn().mockResolvedValue({}), set }
    await expect(setSearchScopeDefault({ projectName: false, convoName: false, userMessages: false, assistantMessages: false })).resolves.toBe(false)
    expect(set).not.toHaveBeenCalled()
    await expect(getSearchScopeDefault()).resolves.toEqual({ projectName: true, convoName: true, userMessages: true, assistantMessages: true })
  })
})
