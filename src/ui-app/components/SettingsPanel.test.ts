import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPanel from './SettingsPanel.vue'
import { resetI18nForTests } from '@/shared/i18n'

function createElectronStoreMock() {
  const get = vi.fn(async (_key: string) => {
    return undefined
  })
  const set = vi.fn(async () => true)
  const del = vi.fn(async () => true)
  return { get, set, delete: del }
}

function createElectronStoreMockWith(values: Record<string, unknown>) {
  const get = vi.fn(async (key: string) => {
    if (key in values) return values[key]
    return undefined
  })
  const set = vi.fn(async () => true)
  const del = vi.fn(async () => true)
  return { get, set, delete: del }
}

function createOpenRouterCredentialMock(input?: {
  apiKeyConfigured?: boolean
  baseUrlConfigured?: boolean
  baseUrlInvalid?: boolean
  displayBaseUrl?: string
}) {
  const state = {
    apiKeyConfigured: input?.apiKeyConfigured ?? true,
    baseUrlConfigured: input?.baseUrlConfigured ?? true,
    baseUrlInvalid: input?.baseUrlInvalid ?? false,
    displayBaseUrl: input?.displayBaseUrl ?? 'https://openrouter.ai/api/v1',
  }
  const buildEndpoint = () => {
    const hasSafeCustomBaseUrl = !state.baseUrlInvalid && state.baseUrlConfigured && state.displayBaseUrl.trim().length > 0
    return {
      kind: 'openrouter_endpoint',
      endpointId: state.baseUrlConfigured ? 'openrouter-custom-legacy-store' : 'openrouter-official',
      endpointStatus: !state.baseUrlConfigured ? 'official' : state.baseUrlInvalid ? 'invalid_custom' : 'custom',
      providerId: 'openrouter',
      profileId: 'openrouter_v1_chat',
      displayName: state.baseUrlConfigured ? 'OpenRouter custom endpoint' : 'OpenRouter official endpoint',
      source: 'legacy_store',
      baseUrlConfigured: state.baseUrlConfigured,
      ...(state.baseUrlInvalid ? { baseUrlInvalid: true } : {}),
      ...(hasSafeCustomBaseUrl ? { displayBaseUrl: state.displayBaseUrl } : {}),
      ...(!state.baseUrlConfigured ? { displayBaseUrl: 'https://openrouter.ai/api/v1' } : {}),
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
      credentialRef: { kind: 'credential_ref', id: 'openrouter-chat-legacy-store' },
      catalogCredentialRef: { kind: 'credential_ref', id: 'openrouter-catalog-legacy-store' },
      rendererVisible: true,
    }
  }
  const buildStatus = () => ({
    source: 'legacy_store',
    apiKeyConfigured: state.apiKeyConfigured,
    ...(state.apiKeyConfigured ? { maskedApiKey: '***' } : {}),
    baseUrlConfigured: state.baseUrlConfigured,
    ...(state.baseUrlInvalid ? { baseUrlInvalid: true } : {}),
    ...(!state.baseUrlInvalid && state.displayBaseUrl.trim().length > 0 ? { displayBaseUrl: state.displayBaseUrl } : {}),
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    endpoint: buildEndpoint(),
  })
  return {
    getStatus: vi.fn(async () => ({ ok: true, status: buildStatus() })),
    update: vi.fn(async (payload: { apiKey?: string; baseUrl?: string | null }) => {
      if (payload.apiKey && payload.apiKey.trim()) state.apiKeyConfigured = true
      if (payload.baseUrl === null) {
        state.displayBaseUrl = ''
        state.baseUrlConfigured = false
        state.baseUrlInvalid = false
      }
      if (typeof payload.baseUrl === 'string') {
        state.displayBaseUrl = payload.baseUrl.trim()
        state.baseUrlConfigured = state.displayBaseUrl.length > 0
        state.baseUrlInvalid = false
      }
      return { ok: true, status: buildStatus() }
    }),
    clear: vi.fn(async () => {
      state.apiKeyConfigured = false
      return { ok: true, status: buildStatus() }
    }),
  }
}

function createDbBridgeMock() {
  const invoke = vi.fn(async (method: string, _params?: any) => {
    if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
    if (method === 'settings.setOpenRouterProviderRequireParameters') return { ok: true }
    if (method === 'settings.getReasoningPrefs') return { value: { mode: 'auto', effort: 'auto', exclude: false } }
    if (method === 'settings.setReasoningPrefs') return { ok: true }
    if (method === 'settings.getChatReasoningPanelDefaultExpanded') return { value: true }
    if (method === 'settings.setChatReasoningPanelDefaultExpanded') return { ok: true }
    if (method === 'settings.getUserMessageRenderDefault') return { value: false }
    if (method === 'settings.setUserMessageRenderDefault') return { ok: true }
    if (method === 'settings.getWebSearchDefaults') return { value: null }
    if (method === 'settings.setWebSearchDefaults') return { ok: true }
    if (method === 'settings.getSamplingParamsDefaults') return { value: null }
    if (method === 'settings.setSamplingParamsDefaults') return { ok: true }
    return { ok: true }
  })
  return { invoke }
}

function createElectronAPIMock() {
  return {
    modelCatalogSyncNow: vi.fn(async () => ({
      ok: true,
      syncAttempted: true,
      syncSucceeded: true,
      providerKey: 'openrouter',
      modelCount: 42,
      lastSyncAtMs: Date.now(),
      errorCode: null,
      errorMessage: null,
    })),
    modelCatalogGetSyncStatus: vi.fn(async () => ({
      providerKey: 'openrouter',
      syncState: 'ok',
      lastSyncAtMs: Date.now(),
      modelCount: 42,
      lastErrorCode: null,
      lastErrorMessage: null,
    })),
    modelCatalogClearCurrentScopedCache: vi.fn(async () => ({
      ok: true,
      providerKey: 'openrouter',
      deleted: { catalog_scope_meta: 1, catalog_models: 2 },
      deletedScopeCount: 1,
      errorCode: null,
      errorMessage: null,
    })),
    modelCatalogClearAllOpenRouterScopedCaches: vi.fn(async () => ({
      ok: true,
      providerKey: 'openrouter',
      deleted: { catalog_scope_meta: 2, catalog_models: 4 },
      deletedScopeCount: 2,
      errorCode: null,
      errorMessage: null,
    })),
  }
}

function createLocalEndpointDiagnosticsMock(result?: any) {
  return {
    probe: vi.fn(async () => result ?? ({
      ok: true,
      diagnostics: {
        kind: 'local_endpoint_diagnostics',
        status: 'reachable',
        endpointFamily: 'openai_compatible',
        safeBaseUrl: 'http://localhost:1234/v1',
        modelList: {
          ok: true,
          source: 'openai_v1_models',
          models: ['local-model-a', 'local-model-b'],
          truncated: false,
        },
        capabilitySummary: {
          chatSendAvailable: false,
          textChat: 'diagnostics_only',
          streaming: 'not_probed',
          tools: false,
          files: false,
          reasoning: false,
          webSearch: false,
        },
        message: 'Local endpoint is reachable through OpenAI-compatible model listing.',
      },
    })),
  }
}

describe('ui-app SettingsPanel', () => {
  const originalElectronStore = (globalThis as any).electronStore
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronAPI = (globalThis as any).electronAPI
  const originalOpenRouterCredential = (globalThis as any).openRouterCredential
  const originalLocalEndpointDiagnostics = (globalThis as any).localEndpointDiagnostics

  beforeEach(() => {
    resetI18nForTests()
    globalThis.localStorage?.removeItem('sv_debug_openrouter_echo_upstream_body')
    ;(globalThis as any).electronStore = createElectronStoreMock()
    ;(globalThis as any).dbBridge = createDbBridgeMock()
    ;(globalThis as any).electronAPI = createElectronAPIMock()
    ;(globalThis as any).openRouterCredential = createOpenRouterCredentialMock()
    ;(globalThis as any).localEndpointDiagnostics = createLocalEndpointDiagnosticsMock()
  })

  afterEach(() => {
    globalThis.localStorage?.removeItem('sv_debug_openrouter_echo_upstream_body')
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronAPI = originalElectronAPI
    ;(globalThis as any).openRouterCredential = originalOpenRouterCredential
    ;(globalThis as any).localEndpointDiagnostics = originalLocalEndpointDiagnostics
  })

  it('loads values and saves updates', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    const keyInput = screen.getByPlaceholderText('sk-…') as HTMLInputElement
    await waitFor(() => expect(keyInput).not.toBeDisabled())
    expect(keyInput.value).toBe('')
    expect(screen.getByText('已配置：***')).toBeTruthy()

    await user.clear(keyInput)
    await user.type(keyInput, 'sk-new')

    const checkbox = screen.getByLabelText('强制 OpenRouter 校验 provider 参数') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    await user.click(checkbox)
    expect(checkbox.checked).toBe(true)

    await user.click(screen.getByRole('button', { name: '保存' }))

    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).not.toHaveBeenCalledWith('openRouterApiKey', expect.anything())
    expect(storeSet).not.toHaveBeenCalledWith('openRouterBaseUrl', expect.anything())
    expect(storeSet).toHaveBeenCalledWith('openRouterCatalogStartupSyncPolicy', 'stale_only')
    expect(storeSet).toHaveBeenCalledWith('openRouterCatalogPickerOpenSyncPolicy', 'stale_only')
    expect(storeSet).toHaveBeenCalledWith('openRouterCatalogListUpdateMode', 'manual')
    expect(storeSet).toHaveBeenCalledWith('openRouterCatalogFreshnessMs', 24 * 60 * 60 * 1000)
    expect(storeSet).toHaveBeenCalledWith('openRouterCatalogRetentionMs', 90 * 24 * 60 * 60 * 1000)

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('settings.setOpenRouterProviderRequireParameters', { value: true })
    expect(invoke).toHaveBeenCalledWith('settings.setReasoningPrefs', { value: { mode: 'auto', effort: 'auto', exclude: false } })
    expect(invoke).toHaveBeenCalledWith('settings.setChatReasoningPanelDefaultExpanded', { value: true })
    expect(invoke).toHaveBeenCalledWith('settings.setUserMessageRenderDefault', { value: false })
    expect(invoke).toHaveBeenCalledWith('settings.setWebSearchDefaults', { value: null })
    expect(invoke).toHaveBeenCalledWith('settings.setSamplingParamsDefaults', { value: null })
    const credentialUpdate = (globalThis as any).openRouterCredential.update as ReturnType<typeof vi.fn>
    expect(credentialUpdate).toHaveBeenCalledWith({ apiKey: 'sk-new' })
  })

  it('uses safe OpenRouter credential metadata and one-way update instead of generic store credentials', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')

    const storeGet = (globalThis as any).electronStore.get as ReturnType<typeof vi.fn>
    await waitFor(() => {
      expect((globalThis as any).openRouterCredential.getStatus).toHaveBeenCalled()
    })
    expect(storeGet).not.toHaveBeenCalledWith('openRouterApiKey')
    expect(storeGet).not.toHaveBeenCalledWith('openRouterBaseUrl')

    const keyInput = screen.getByPlaceholderText('sk-…') as HTMLInputElement
    await waitFor(() => expect(keyInput).not.toBeDisabled())
    expect(keyInput).toHaveValue('')
    expect(screen.queryByDisplayValue('sk-old')).toBeNull()
    expect(screen.getByText('已配置：***')).toBeTruthy()
    expect(screen.getByDisplayValue('https://openrouter.ai/api/v1')).toBeTruthy()

    await user.clear(keyInput)
    await user.type(keyInput, 'sk-c4c-replacement-key')
    await user.click(screen.getByRole('button', { name: '保存' }))

    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).not.toHaveBeenCalledWith('openRouterApiKey', expect.anything())
    expect(storeSet).not.toHaveBeenCalledWith('openRouterBaseUrl', expect.anything())
    expect((globalThis as any).openRouterCredential.update).toHaveBeenCalledWith({
      apiKey: 'sk-c4c-replacement-key',
    })

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke.mock.calls.map(([method]) => method)).not.toContain('openrouterCredential.getMetadata')
    expect((globalThis as any).electronAPI.openRouterCredentialGetMetadata).toBeUndefined()
  })

  it('shows OpenRouter endpoint metadata without adding endpoint registry controls', async () => {
    ;(globalThis as any).openRouterCredential = createOpenRouterCredentialMock({
      apiKeyConfigured: true,
      baseUrlConfigured: true,
      displayBaseUrl: 'https://openrouter-proxy.example.test/api/v1',
    })

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')

    const endpointMetadata = await screen.findByTestId('settings-openrouter-endpoint-metadata')
    expect(screen.getByTestId('settings-openrouter-endpoint-status').textContent).toContain('Custom endpoint')
    expect(endpointMetadata.textContent).toContain('OpenRouter custom endpoint')
    expect(endpointMetadata.textContent).toContain('https://openrouter-proxy.example.test/api/v1')
    expect(endpointMetadata.textContent).not.toContain('Authorization')
    expect(endpointMetadata.textContent).not.toContain('Bearer')
    expect(endpointMetadata.textContent).not.toContain('sk-')
    expect(screen.queryByLabelText(/endpoint/i)).toBeNull()
    expect(screen.queryByLabelText(/profile/i)).toBeNull()
  })

  it('shows official endpoint metadata while leaving custom base URL input empty', async () => {
    ;(globalThis as any).openRouterCredential = createOpenRouterCredentialMock({
      apiKeyConfigured: true,
      baseUrlConfigured: false,
      displayBaseUrl: '',
    })

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    const endpointMetadata = await screen.findByTestId('settings-openrouter-endpoint-metadata')
    const baseUrlInput = screen.getByPlaceholderText('https://openrouter.ai/api/v1') as HTMLInputElement

    expect(screen.getByTestId('settings-openrouter-endpoint-status').textContent).toContain('Official endpoint')
    expect(endpointMetadata.textContent).toContain('OpenRouter official endpoint')
    expect(endpointMetadata.textContent).toContain('https://openrouter.ai/api/v1')
    expect(baseUrlInput).toHaveValue('')
  })


  it('loads catalog sync settings defaults', async () => {
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    expect(screen.getByTestId('settings-catalog-startup-sync-policy')).toHaveValue('stale_only')
    expect(screen.getByTestId('settings-catalog-picker-open-sync-policy')).toHaveValue('stale_only')
    expect(screen.getByTestId('settings-catalog-list-update-mode')).toHaveValue('manual')
    expect(screen.getByTestId('settings-catalog-freshness')).toHaveValue(String(24 * 60 * 60 * 1000))
    expect(screen.getByTestId('settings-catalog-retention')).toHaveValue(String(90 * 24 * 60 * 60 * 1000))
  })

  it('shows all catalog retention presets', async () => {
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    const retention = screen.getByTestId('settings-catalog-retention') as HTMLSelectElement
    expect(Array.from(retention.options).map((option) => option.textContent)).toEqual([
      '7 天',
      '30 天',
      '90 天',
      '180 天',
      '永不自动清理',
    ])
  })

  it('normalizes invalid catalog sync settings to defaults', async () => {
    ;(globalThis as any).electronStore = createElectronStoreMockWith({
      openRouterCatalogStartupSyncPolicy: 'bad',
      openRouterCatalogPickerOpenSyncPolicy: 'bad',
      openRouterCatalogListUpdateMode: 'bad',
      openRouterCatalogFreshnessMs: 12345,
      openRouterCatalogRetentionMs: 12345,
    })

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    expect(screen.getByTestId('settings-catalog-startup-sync-policy')).toHaveValue('stale_only')
    expect(screen.getByTestId('settings-catalog-picker-open-sync-policy')).toHaveValue('stale_only')
    expect(screen.getByTestId('settings-catalog-list-update-mode')).toHaveValue('manual')
    expect(screen.getByTestId('settings-catalog-freshness')).toHaveValue(String(24 * 60 * 60 * 1000))
    expect(screen.getByTestId('settings-catalog-retention')).toHaveValue(String(90 * 24 * 60 * 60 * 1000))
  })

  it('persists selected catalog sync settings without API key payload events', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('settings-catalog-startup-sync-policy')).not.toBeDisabled())

    await fireEvent.update(screen.getByTestId('settings-catalog-startup-sync-policy'), 'always')
    await fireEvent.update(screen.getByTestId('settings-catalog-picker-open-sync-policy'), 'never')
    await fireEvent.update(screen.getByTestId('settings-catalog-list-update-mode'), 'automatic')
    await fireEvent.update(screen.getByTestId('settings-catalog-freshness'), String(15 * 60 * 1000))
    await fireEvent.update(screen.getByTestId('settings-catalog-retention'), 'never')
    await user.click(screen.getByRole('button', { name: '保存' }))

    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).toHaveBeenCalledWith('openRouterCatalogStartupSyncPolicy', 'always')
    expect(storeSet).toHaveBeenCalledWith('openRouterCatalogPickerOpenSyncPolicy', 'never')
    expect(storeSet).toHaveBeenCalledWith('openRouterCatalogListUpdateMode', 'automatic')
    expect(storeSet).toHaveBeenCalledWith('openRouterCatalogFreshnessMs', 15 * 60 * 1000)
    expect(storeSet).toHaveBeenCalledWith('openRouterCatalogRetentionMs', 'never')
    expect(JSON.stringify(storeSet.mock.calls.filter(([key]) => String(key).startsWith('openRouterCatalog')))).not.toContain('sk-')
  })

  it('updates base URL through the OpenRouter credential bridge without requiring API key re-entry', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    const baseUrlInput = await screen.findByDisplayValue('https://openrouter.ai/api/v1') as HTMLInputElement
    await waitFor(() => expect(baseUrlInput).not.toBeDisabled())
    await user.clear(baseUrlInput)
    await user.type(baseUrlInput, 'https://openrouter-proxy.example.test/api/v1')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect((globalThis as any).openRouterCredential.update).toHaveBeenCalledWith({
      baseUrl: 'https://openrouter-proxy.example.test/api/v1',
    })
    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).not.toHaveBeenCalledWith('openRouterBaseUrl', expect.anything())
    expect(storeSet).not.toHaveBeenCalledWith('openRouterApiKey', expect.anything())
  })

  it('does not place invalid stored base URL metadata into the editable input', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).openRouterCredential = createOpenRouterCredentialMock({
      apiKeyConfigured: true,
      baseUrlConfigured: true,
      baseUrlInvalid: true,
      displayBaseUrl: 'https://user:pass@?token=sk-hidden',
    })

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).openRouterCredential.getStatus).toHaveBeenCalled())

    const baseUrlInput = screen.getByPlaceholderText('https://openrouter.ai/api/v1') as HTMLInputElement
    await waitFor(() => expect(baseUrlInput).not.toBeDisabled())
    expect(baseUrlInput).toHaveValue('')
    expect(screen.getByTestId('settings-openrouter-endpoint-status').textContent).toContain('Invalid custom endpoint')
    expect(screen.getByTestId('settings-openrouter-endpoint-warning').textContent).toContain('Invalid custom base URL')
    expect(screen.queryByDisplayValue('[invalid-url]')).toBeNull()
    expect(screen.queryByDisplayValue('https://user:pass@?token=sk-hidden')).toBeNull()
    expect(screen.getByTestId('settings-openrouter-endpoint-metadata').textContent).not.toContain('user:pass')
    expect(screen.getByTestId('settings-openrouter-endpoint-metadata').textContent).not.toContain('token=')

    await fireEvent.update(baseUrlInput, 'https://openrouter-proxy.example.test/api/v1')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect((globalThis as any).openRouterCredential.update).toHaveBeenCalledWith({
      baseUrl: 'https://openrouter-proxy.example.test/api/v1',
    })
    expect(JSON.stringify(document.body.textContent)).not.toContain('user:pass')
    expect(JSON.stringify(document.body.textContent)).not.toContain('sk-hidden')
  })

  it('emits settings:openRouterConnectionUpdated after save without API key in payload', async () => {
    const user = userEvent.setup()
    const events: Array<{ type: string; detail: any }> = []
    const origDispatch = window.dispatchEvent.bind(window)
    window.dispatchEvent = (ev: Event) => {
      if (ev instanceof CustomEvent && ev.type === 'settings:openRouterConnectionUpdated') {
        events.push({ type: ev.type, detail: ev.detail })
      }
      return origDispatch(ev)
    }

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })
    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      const found = events.find((e) => e.type === 'settings:openRouterConnectionUpdated')
      expect(found).toBeDefined()
      expect(found!.detail).toHaveProperty('hasApiKey')
      expect(found!.detail).toHaveProperty('reason', 'settings_saved')
      expect(JSON.stringify(found!.detail)).not.toContain('sk-')
    })

    window.dispatchEvent = origDispatch
  })

  it('emits settings:openRouterConnectionUpdated after clearApiKey without API key in payload', async () => {
    const user = userEvent.setup()
    const events: Array<{ type: string; detail: any }> = []
    const origDispatch = window.dispatchEvent.bind(window)
    window.dispatchEvent = (ev: Event) => {
      if (ev instanceof CustomEvent && ev.type === 'settings:openRouterConnectionUpdated') {
        events.push({ type: ev.type, detail: ev.detail })
      }
      return origDispatch(ev)
    }

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })
    await screen.findByText('设置')

    const clearButtons = screen.getAllByRole('button', { name: '清除' })
    await user.click(clearButtons[0])

    await waitFor(() => {
      const found = events.find((e) => e.type === 'settings:openRouterConnectionUpdated' && e.detail.reason === 'api_key_cleared')
      expect(found).toBeDefined()
      expect(found!.detail.hasApiKey).toBe(false)
      expect(JSON.stringify(found!.detail)).not.toContain('sk-')
    })

    window.dispatchEvent = origDispatch
  })

  it('verify and sync button calls modelCatalogSyncNow with force=true', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    const verifyBtn = screen.getByRole('button', { name: '验证并同步' })
    await user.click(verifyBtn)

    await waitFor(() => {
      const syncNow = (globalThis as any).electronAPI.modelCatalogSyncNow as ReturnType<typeof vi.fn>
      expect(syncNow).toHaveBeenCalledWith({
        providerKey: 'openrouter',
        force: true,
        reason: 'settings_validate_button',
      })
    })
  })

  it('verify and sync button shows success result', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    const verifyBtn = screen.getByRole('button', { name: '验证并同步' })
    await user.click(verifyBtn)

    await waitFor(() => {
      expect(screen.getByText(/验证并同步成功/)).toBeTruthy()
    })
  })

  it('verify and sync button shows failure result', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).electronAPI.modelCatalogSyncNow = vi.fn(async () => ({
      ok: false,
      syncAttempted: true,
      syncSucceeded: false,
      providerKey: 'openrouter',
      modelCount: 0,
      lastSyncAtMs: Date.now(),
      errorCode: 'invalid_api_key',
      errorMessage: 'API Key 无效',
    }))

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    const verifyBtn = screen.getByRole('button', { name: '验证并同步' })
    await user.click(verifyBtn)

    await waitFor(() => {
      expect(screen.getByText(/验证并同步失败/)).toBeTruthy()
    })
  })

  it('clears current API Key catalog cache via main IPC without API key payload', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect(screen.getByTestId('settings-clear-current-catalog-cache')).not.toBeDisabled())
    await user.click(screen.getByTestId('settings-clear-current-catalog-cache'))

    const clearCurrent = (globalThis as any).electronAPI.modelCatalogClearCurrentScopedCache as ReturnType<typeof vi.fn>
    await waitFor(() => expect(clearCurrent).toHaveBeenCalledTimes(1))
    expect(clearCurrent).toHaveBeenCalledWith()
    expect(confirm.mock.calls[0]?.[0]).toContain('不会删除 API Key')
    expect(confirm.mock.calls[0]?.[0]).toContain('不会删除聊天记录')
    expect(confirm.mock.calls[0]?.[0]).toContain('下次打开模型选择器需要重新同步模型目录')
    expect(JSON.stringify(clearCurrent.mock.calls)).not.toContain('sk-')
    expect(JSON.stringify(clearCurrent.mock.calls)).not.toContain('catalogScopeKey')
    await screen.findByText('已清除当前 API Key 的模型缓存。')
    confirm.mockRestore()
  })

  it('clears all OpenRouter scoped catalog caches via main IPC without API key payload', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect(screen.getByTestId('settings-clear-all-catalog-caches')).not.toBeDisabled())
    await user.click(screen.getByTestId('settings-clear-all-catalog-caches'))

    const clearAll = (globalThis as any).electronAPI.modelCatalogClearAllOpenRouterScopedCaches as ReturnType<typeof vi.fn>
    await waitFor(() => expect(clearAll).toHaveBeenCalledTimes(1))
    expect(clearAll).toHaveBeenCalledWith()
    expect(confirm.mock.calls[0]?.[0]).toContain('不会删除 API Key')
    expect(confirm.mock.calls[0]?.[0]).toContain('不会删除聊天记录')
    expect(confirm.mock.calls[0]?.[0]).toContain('下次打开模型选择器需要重新同步模型目录')
    expect(JSON.stringify(clearAll.mock.calls)).not.toContain('sk-')
    expect(JSON.stringify(clearAll.mock.calls)).not.toContain('catalogScopeKey')
    await screen.findByText('已清除全部 OpenRouter 模型缓存。')
    confirm.mockRestore()
  })

  it('shows cleanup failure from catalog cleanup IPC', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    ;(globalThis as any).electronAPI.modelCatalogClearAllOpenRouterScopedCaches = vi.fn(async () => ({
      ok: false,
      providerKey: 'openrouter',
      deleted: {},
      deletedScopeCount: 0,
      errorCode: 'db_unavailable',
      errorMessage: 'DB unavailable',
    }))

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect(screen.getByTestId('settings-clear-all-catalog-caches')).not.toBeDisabled())
    await user.click(screen.getByTestId('settings-clear-all-catalog-caches'))

    await screen.findByText(/清理失败：db_unavailable/)
    confirm.mockRestore()
  })

  it('runs LocalEndpoint diagnostics through the safe probe bridge without enabling chat send', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')

    const urlInput = await screen.findByTestId('settings-local-endpoint-url') as HTMLInputElement
    await waitFor(() => expect(urlInput).not.toBeDisabled())
    await user.clear(urlInput)
    await user.type(urlInput, 'http://localhost:1234/v1?token=sk-hidden')
    await user.click(screen.getByTestId('settings-local-endpoint-probe'))

    const probe = (globalThis as any).localEndpointDiagnostics.probe as ReturnType<typeof vi.fn>
    await waitFor(() => expect(probe).toHaveBeenCalledWith({
      url: 'http://localhost:1234/v1?token=sk-hidden',
      timeoutMs: 5000,
    }))

    const result = await screen.findByTestId('settings-local-endpoint-probe-result')
    expect(screen.getByTestId('settings-local-endpoint-probe-status').textContent).toContain('reachable')
    expect(screen.getByTestId('settings-local-endpoint-probe-family').textContent).toContain('openai_compatible')
    expect(screen.getByTestId('settings-local-endpoint-probe-models').textContent).toContain('local-model-a')
    expect(screen.getByTestId('settings-local-endpoint-probe-capabilities').textContent).toContain('chat send unavailable')
    expect(result.textContent).not.toContain('sk-hidden')
    expect(result.textContent).not.toContain('Authorization')
    expect(result.textContent).not.toContain('Bearer')
    expect(document.body.textContent).toContain('Experimental diagnostics only')
    expect(document.body.textContent).toContain('Local endpoints are unavailable for chat send')

    expect((globalThis as any).electronAPI.startOpenRouterStream).toBeUndefined()
    expect((globalThis as any).openRouterCredential.update).not.toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: expect.stringContaining('localhost'),
    }))
  })

  it('clears OpenRouter API key through the credential bridge', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')

    const clearButtons = screen.getAllByRole('button', { name: '清除' })
    expect(clearButtons.length).toBeGreaterThanOrEqual(2)

    await user.click(clearButtons[0])

    const storeDelete = (globalThis as any).electronStore.delete as ReturnType<typeof vi.fn>
    expect(storeDelete).not.toHaveBeenCalledWith('openRouterApiKey')
    expect((globalThis as any).openRouterCredential.clear).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByText('未配置')).toBeTruthy())
    expect(screen.getByDisplayValue('https://openrouter.ai/api/v1')).toBeTruthy()
  })

  it('persists debug echo toggle in localStorage (dev-only control)', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    const toggle = screen.queryByLabelText('仅开发环境，仅 stream 模式。用于诊断 provider 参数映射。') as HTMLInputElement | null
    if (!toggle) return

    expect(toggle.checked).toBe(false)
    await user.click(toggle)
    expect(toggle.checked).toBe(true)
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(globalThis.localStorage?.getItem('sv_debug_openrouter_echo_upstream_body')).toBe('1')
  })
})
