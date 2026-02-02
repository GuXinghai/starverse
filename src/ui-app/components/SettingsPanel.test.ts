import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPanel from './SettingsPanel.vue'

describe('ui-app SettingsPanel', () => {
  const originalElectronStore = (globalThis as any).electronStore
  const originalDbBridge = (globalThis as any).dbBridge

  beforeEach(() => {
    const get = vi.fn(async (key: string) => {
      if (key === 'openRouterApiKey') return 'sk-old'
      if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
      return undefined
    })
    const set = vi.fn(async () => true)
    const del = vi.fn(async () => true)

    ;(globalThis as any).electronStore = { get, set, delete: del }

    const invoke = vi.fn(async (method: string, _params?: any) => {
      if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
      if (method === 'settings.setOpenRouterProviderRequireParameters') return { ok: true }
      if (method === 'settings.getReasoningPrefs') return { value: { mode: 'auto', effort: 'auto', exclude: false } }
      if (method === 'settings.setReasoningPrefs') return { ok: true }
      return { ok: true }
    })
    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).dbBridge = originalDbBridge
  })

  it('loads values and saves updates', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('Settings')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    const keyInput = screen.getByPlaceholderText('sk-…') as HTMLInputElement
    await waitFor(() => expect(keyInput).not.toBeDisabled())
    expect(keyInput.value).toBe('sk-old')

    await user.clear(keyInput)
    await user.type(keyInput, 'sk-new')

    const checkbox = screen.getByLabelText('OpenRouter require parameters') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    await user.click(checkbox)
    expect(checkbox.checked).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).toHaveBeenCalledWith('openRouterApiKey', 'sk-new')
    expect(storeSet).toHaveBeenCalledWith('openRouterBaseUrl', 'https://openrouter.ai/api/v1')

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('settings.setOpenRouterProviderRequireParameters', { value: true })
    expect(invoke).toHaveBeenCalledWith('settings.setReasoningPrefs', { value: { mode: 'auto', effort: 'auto', exclude: false } })
  })

  it('clears via electronStore.delete', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('Settings')

    const clearButtons = screen.getAllByRole('button', { name: 'Clear' })
    expect(clearButtons.length).toBeGreaterThanOrEqual(2)

    await user.click(clearButtons[0])

    const storeDelete = (globalThis as any).electronStore.delete as ReturnType<typeof vi.fn>
    expect(storeDelete).toHaveBeenCalledWith('openRouterApiKey')
  })
})
