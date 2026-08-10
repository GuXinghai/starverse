import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPanel from './SettingsPanel.vue'
import { resetI18nForTests, t, tf } from '@/shared/i18n'
import { installGenerationV2TestBridge } from '../../../tests/helpers/generationV2Bridge'

const CONFIGURED_API_KEY_PLACEHOLDER = '••••••'

function createElectronStoreMock() {
  const values: Record<string, unknown> = {}
  const get = vi.fn(async (key: string) => values[key])
  const set = vi.fn(async (key: string, value: unknown) => {
    values[key] = value
    return true
  })
  const del = vi.fn(async () => true)
  return { get, set, delete: del }
}

function createElectronStoreMockWith(values: Record<string, unknown>) {
  const get = vi.fn(async (key: string) => {
    if (key in values) return values[key]
    return undefined
  })
  const set = vi.fn(async (key: string, value: unknown) => {
    values[key] = value
    return true
  })
  const del = vi.fn(async () => true)
  return { get, set, delete: del }
}

function createOpenRouterCredentialMock(input?: {
  apiKeyConfigured?: boolean
  apiKey?: string
}) {
  const state = {
    apiKeyConfigured: input?.apiKeyConfigured ?? true,
    apiKey: input?.apiKey ?? 'sk-openrouter-saved',
  }
  const buildEndpoint = () => ({
      kind: 'openrouter_endpoint',
      endpointId: 'openrouter-official',
      endpointStatus: 'official',
      providerId: 'openrouter',
      profileId: 'openrouter_v1_chat',
      displayName: 'OpenRouter official endpoint',
      source: 'legacy_store',
      baseUrlConfigured: false,
      displayBaseUrl: 'https://openrouter.ai/api/v1',
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
      credentialRef: { kind: 'credential_ref', id: 'openrouter-chat-legacy-store' },
      catalogCredentialRef: { kind: 'credential_ref', id: 'openrouter-catalog-legacy-store' },
      rendererVisible: true,
    })
  const buildStatus = () => ({
    source: 'legacy_store',
    apiKeyConfigured: state.apiKeyConfigured,
    ...(state.apiKeyConfigured ? { maskedApiKey: '***' } : {}),
    baseUrlConfigured: false,
    displayBaseUrl: 'https://openrouter.ai/api/v1',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    endpoint: buildEndpoint(),
  })
  return {
    getStatus: vi.fn(async () => ({ ok: true, status: buildStatus() })),
    reveal: vi.fn(async () => (
      state.apiKeyConfigured
        ? { ok: true, apiKey: state.apiKey }
        : { ok: false, code: 'credential_missing', message: 'OpenRouter API key is not configured.' }
    )),
    update: vi.fn(async (payload: { apiKey?: string }) => {
      if (payload.apiKey && payload.apiKey.trim()) {
        state.apiKeyConfigured = true
        state.apiKey = payload.apiKey.trim()
      }
      return { ok: true, status: buildStatus() }
    }),
    clear: vi.fn(async () => {
      state.apiKeyConfigured = false
      return { ok: true, status: buildStatus() }
    }),
  }
}

function createOpenAIResponsesCredentialMock(input?: { apiKeyConfigured?: boolean }) {
  const state = {
    apiKeyConfigured: input?.apiKeyConfigured ?? true,
    apiKey: 'sk-openai-responses-saved',
  }
  const buildStatus = () => ({
    source: 'legacy_store',
    providerId: 'openai',
    profileId: 'openai_responses_v1',
    apiKeyConfigured: state.apiKeyConfigured,
    ...(state.apiKeyConfigured ? { maskedApiKey: '***' } : {}),
    defaultBaseUrl: 'https://api.openai.com/v1',
    rendererVisible: true,
  })
  return {
    getStatus: vi.fn(async () => ({ ok: true, status: buildStatus() })),
    reveal: vi.fn(async () => (
      state.apiKeyConfigured
        ? { ok: true, apiKey: state.apiKey }
        : { ok: false, code: 'credential_missing', message: 'OpenAI Responses API key is not configured.' }
    )),
    update: vi.fn(async (payload: { apiKey?: string }) => {
      if (payload.apiKey && payload.apiKey.trim()) {
        state.apiKeyConfigured = true
        state.apiKey = payload.apiKey.trim()
      }
      return { ok: true, status: buildStatus() }
    }),
    clear: vi.fn(async () => {
      state.apiKeyConfigured = false
      return { ok: true, status: buildStatus() }
    }),
  }
}

function createGoogleAIStudioCredentialMock(input?: { apiKeyConfigured?: boolean }) {
  const state = {
    apiKeyConfigured: input?.apiKeyConfigured ?? true,
    apiKey: 'AIza-google-saved',
  }
  const buildStatus = () => ({
    source: 'legacy_store',
    providerId: 'google-ai-studio',
    profileId: 'gemini_api_v1',
    apiKeyConfigured: state.apiKeyConfigured,
    ...(state.apiKeyConfigured ? { maskedApiKey: '***' } : {}),
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    rendererVisible: true,
  })
  return {
    getStatus: vi.fn(async () => ({ ok: true, status: buildStatus() })),
    reveal: vi.fn(async () => (
      state.apiKeyConfigured
        ? { ok: true, apiKey: state.apiKey }
        : { ok: false, code: 'credential_missing', message: 'Google AI Studio API key is not configured.' }
    )),
    update: vi.fn(async (payload: { apiKey?: string }) => {
      if (payload.apiKey && payload.apiKey.trim()) {
        state.apiKeyConfigured = true
        state.apiKey = payload.apiKey.trim()
      }
      return { ok: true, status: buildStatus() }
    }),
    clear: vi.fn(async () => {
      state.apiKeyConfigured = false
      return { ok: true, status: buildStatus() }
    }),
  }
}

function createAnthropicCredentialMock(input?: { apiKeyConfigured?: boolean }) {
  const state = {
    apiKeyConfigured: input?.apiKeyConfigured ?? true,
    apiKey: 'sk-ant-saved',
  }
  const buildStatus = () => ({
    source: 'legacy_store',
    providerId: 'anthropic',
    profileId: 'anthropic_messages_v1',
    apiKeyConfigured: state.apiKeyConfigured,
    ...(state.apiKeyConfigured ? { maskedApiKey: '***' } : {}),
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    rendererVisible: true,
  })
  return {
    getStatus: vi.fn(async () => ({ ok: true, status: buildStatus() })),
    reveal: vi.fn(async () => (
      state.apiKeyConfigured
        ? { ok: true, apiKey: state.apiKey }
        : { ok: false, code: 'credential_missing', message: 'Anthropic API key is not configured.' }
    )),
    update: vi.fn(async (payload: { apiKey?: string }) => {
      if (payload.apiKey && payload.apiKey.trim()) {
        state.apiKeyConfigured = true
        state.apiKey = payload.apiKey.trim()
      }
      return { ok: true, status: buildStatus() }
    }),
    clear: vi.fn(async () => {
      state.apiKeyConfigured = false
      return { ok: true, status: buildStatus() }
    }),
  }
}

function createDeepSeekCredentialMock(input?: { apiKeyConfigured?: boolean }) {
  const state = {
    apiKeyConfigured: input?.apiKeyConfigured ?? true,
    apiKey: 'sk-deepseek-saved',
  }
  const buildStatus = () => ({
    source: 'legacy_store',
    providerId: 'deepseek',
    profileId: 'deepseek_official_openai_compat',
    apiKeyConfigured: state.apiKeyConfigured,
    ...(state.apiKeyConfigured ? { maskedApiKey: '***' } : {}),
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    rendererVisible: true,
  })
  return {
    getStatus: vi.fn(async () => ({ ok: true, status: buildStatus() })),
    reveal: vi.fn(async () => (
      state.apiKeyConfigured
        ? { ok: true, apiKey: state.apiKey }
        : { ok: false, code: 'credential_missing', message: 'DeepSeek API key is not configured.' }
    )),
    update: vi.fn(async (payload: { apiKey?: string }) => {
      if (payload.apiKey && payload.apiKey.trim()) {
        state.apiKeyConfigured = true
        state.apiKey = payload.apiKey.trim()
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
    if (method === 'settings.getGenerationParamsDefaults') return { value: null }
    if (method === 'settings.setGenerationParamsDefaults') return { ok: true }
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
    streamProbe: vi.fn(async () => ({
      ok: true,
      diagnostics: {
        kind: 'local_endpoint_stream_diagnostics',
        status: 'supported',
        endpointFamily: 'openai_compatible',
        safeBaseUrl: 'http://localhost:1234/v1',
        textDeltaPreview: 'pong',
        evidence: 'text_delta_observed',
        capabilitySummary: {
          chatSendAvailable: false,
          streaming: 'diagnostics_only_supported',
          tools: false,
          files: false,
          reasoning: false,
          webSearch: false,
        },
        message: 'Local endpoint produced text delta evidence in diagnostics-only stream probe.',
      },
    })),
  }
}

describe('ui-app SettingsPanel', () => {
  const originalElectronStore = (globalThis as any).electronStore
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronAPI = (globalThis as any).electronAPI
  const originalOpenRouterCredential = (globalThis as any).openRouterCredential
  const originalOpenAIResponsesCredential = (globalThis as any).openAIResponsesCredential
  const originalGoogleAIStudioCredential = (globalThis as any).googleAIStudioCredential
  const originalAnthropicCredential = (globalThis as any).anthropicCredential
  const originalDeepSeekCredential = (globalThis as any).deepSeekCredential
  const originalLocalEndpointDiagnostics = (globalThis as any).localEndpointDiagnostics
  const originalGenerationV2 = (globalThis as any).generationV2
  const originalNetworkProxy = (globalThis as any).networkProxy

  beforeEach(() => {
    installGenerationV2TestBridge()
    resetI18nForTests()
    globalThis.localStorage?.removeItem('sv_debug_openrouter_echo_upstream_body')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.url')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.model')
    globalThis.localStorage?.removeItem('starverse.openAIResponsesTextChat.model')
    globalThis.localStorage?.removeItem('starverse.googleAIStudioTextChat.model')
    globalThis.localStorage?.removeItem('starverse.anthropicMessagesTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.anthropicMessagesTextChat.model')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.model')
    ;(globalThis as any).electronStore = createElectronStoreMock()
    ;(globalThis as any).dbBridge = createDbBridgeMock()
    ;(globalThis as any).electronAPI = createElectronAPIMock()
    ;(globalThis as any).networkProxy = {
      getSettings: vi.fn(async () => ({ ok: true, settings: { proxyMode: 'environment', manualProxyUrl: '', noProxy: '', strictSSL: true } })),
      updateSettings: vi.fn(async () => ({ ok: true, settings: { proxyMode: 'environment', manualProxyUrl: '', noProxy: '', strictSSL: true } })),
    }
    const openRouterCredential = createOpenRouterCredentialMock()
    const openAIResponsesCredential = createOpenAIResponsesCredentialMock()
    const googleAIStudioCredential = createGoogleAIStudioCredentialMock()
    const anthropicCredential = createAnthropicCredentialMock()
    const deepSeekCredential = createDeepSeekCredentialMock()
    const localEndpointDiagnostics = createLocalEndpointDiagnosticsMock()
    const listOpenRouter = vi.fn(async () => ({
      ok: true,
      responseDigest: 'settings-openrouter-models-v2',
      observedAtMs: Date.now(),
      items: [{
        providerKey: 'openrouter', modelId: 'openai/gpt-4.1-nano',
        modelKey: 'openrouter::openai/gpt-4.1-nano', canonicalSlug: 'openai/gpt-4.1-nano',
        displayName: 'GPT-4.1 nano', description: null, vendor: 'openai',
        contextLength: 32_768, maxOutputTokens: 32, createdAtSec: 1,
        pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
        capabilities: { reasoning: false, tools: true, structuredOutputs: true, vision: false, longContext: false },
      }],
    }))
    ;(globalThis as any).openRouterCredential = openRouterCredential
    ;(globalThis as any).openAIResponsesCredential = openAIResponsesCredential
    ;(globalThis as any).googleAIStudioCredential = googleAIStudioCredential
    ;(globalThis as any).anthropicCredential = anthropicCredential
    ;(globalThis as any).deepSeekCredential = deepSeekCredential
    ;(globalThis as any).localEndpointDiagnostics = localEndpointDiagnostics
    const generationV2 = (globalThis as any).generationV2 ?? {}
    ;(globalThis as any).generationV2 = {
      ...generationV2,
      credentials: {
        ...(generationV2.credentials ?? {}),
        get openRouter() { return (globalThis as any).openRouterCredential },
        get openAIResponses() { return (globalThis as any).openAIResponsesCredential },
        get googleAIStudio() { return (globalThis as any).googleAIStudioCredential },
        get anthropic() { return (globalThis as any).anthropicCredential },
        get deepSeek() { return (globalThis as any).deepSeekCredential },
      },
      localRuntime: {
        ...(generationV2.localRuntime ?? {}),
        get generic() { return (globalThis as any).localEndpointDiagnostics },
      },
      models: {
        ...(generationV2.models ?? {}),
        listOpenRouter,
        sync: vi.fn(async () => ({ ok: true, status: 'synced', modelCount: 1,
          visibleModelCount: 1, hiddenModelCount: 0, responseDigest: 'settings-openrouter-models-v2', observedAtMs: Date.now() })),
        status: vi.fn(async () => ({ ok: true, status: 'synced', modelCount: 1,
          visibleModelCount: 1, hiddenModelCount: 0, responseDigest: 'settings-openrouter-models-v2', observedAtMs: Date.now() })),
        applyPending: vi.fn(async (payload: any) => ({ ok: true, status: 'synced', modelCount: 1,
          visibleModelCount: 1, hiddenModelCount: 0, responseDigest: payload.snapshotDigest, observedAtMs: Date.now() })),
        clearCurrent: vi.fn(async () => ({ ok: true, deletedScopes: 1 })),
        clearAll: vi.fn(async () => ({ ok: true, deletedScopes: 2 })),
      },
    }
  })

  afterEach(() => {
    globalThis.localStorage?.removeItem('sv_debug_openrouter_echo_upstream_body')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.url')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.model')
    globalThis.localStorage?.removeItem('starverse.openAIResponsesTextChat.model')
    globalThis.localStorage?.removeItem('starverse.googleAIStudioTextChat.model')
    globalThis.localStorage?.removeItem('starverse.anthropicMessagesTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.anthropicMessagesTextChat.model')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.model')
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronAPI = originalElectronAPI
    ;(globalThis as any).openRouterCredential = originalOpenRouterCredential
    ;(globalThis as any).openAIResponsesCredential = originalOpenAIResponsesCredential
    ;(globalThis as any).googleAIStudioCredential = originalGoogleAIStudioCredential
    ;(globalThis as any).anthropicCredential = originalAnthropicCredential
    ;(globalThis as any).deepSeekCredential = originalDeepSeekCredential
    ;(globalThis as any).localEndpointDiagnostics = originalLocalEndpointDiagnostics
    ;(globalThis as any).generationV2 = originalGenerationV2
    ;(globalThis as any).networkProxy = originalNetworkProxy
  })

  it('switches all seven categories with keyboard-accessible mounted panes', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })
    await screen.findByText('设置')

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(7)
    expect(screen.getByTestId('settings-pane-general')).toBeVisible()
    expect(screen.getByTestId('settings-pane-providers')).not.toBeVisible()
    expect(screen.getByTestId('settings-pane-model-catalog')).toBeInTheDocument()
    expect(screen.getByTestId('settings-pane-generation')).toBeInTheDocument()
    expect(screen.getByTestId('settings-pane-privacy-data')).toBeInTheDocument()
    expect(screen.getByTestId('settings-pane-network')).toBeInTheDocument()
    expect(screen.getByTestId('settings-pane-extensions')).toBeInTheDocument()

    await user.click(screen.getByTestId('settings-category-providers'))
    expect(screen.getByTestId('settings-pane-providers')).toBeVisible()
    expect(screen.getByTestId('settings-pane-general')).not.toBeVisible()

    await fireEvent.keyDown(screen.getByTestId('settings-category-providers'), { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByTestId('settings-category-model-catalog')).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByTestId('settings-pane-model-catalog')).toBeVisible()
  })

  it('keeps unsaved drafts mounted while switching categories', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })
    await screen.findByText('设置')
    await user.click(screen.getByTestId('settings-category-generation'))

    const draft = screen.getByTestId('settings-max-recent-models') as HTMLInputElement
    await waitFor(() => expect(draft).not.toBeDisabled())
    await fireEvent.update(draft, '17')

    await user.click(screen.getByTestId('settings-category-network'))
    expect(screen.getByTestId('settings-pane-generation')).not.toBeVisible()
    expect((screen.getByTestId('settings-max-recent-models') as HTMLInputElement).value).toBe('17')

    await user.click(screen.getByTestId('settings-category-generation'))
    expect(screen.getByTestId('settings-pane-generation')).toBeVisible()
    expect((screen.getByTestId('settings-max-recent-models') as HTMLInputElement).value).toBe('17')
  })

  it('shows provider-first catalog failure facts from the renderer-safe projection', async () => {
    const user = userEvent.setup()
    const providerFailure = {
      origin: 'http_response',
      phase: 'response_body',
      providerId: 'deepseek',
      contractId: 'deepseek.models.v2',
      operationId: 'catalog-sync-deepseek',
      requestSequence: 1,
      httpStatus: 429,
      httpStatusText: 'Too Many Requests',
      providerError: {
        code: 'rate_limit',
        type: 'provider_error',
        status: 'failed',
        message: 'Provider quota window is exhausted.',
        param: null,
        requestId: 'req-safe-1',
        retryAfterMs: 5000,
        rawJson: { error: { code: 'rate_limit' } },
        rawText: null,
      },
      rawFrameExcerpt: null,
      transportError: null,
      starverseDiagnosticCode: 'provider_rate_limited',
      redactions: [],
      truncations: [],
    } as const
    ;(globalThis as any).generationV2.models.listDeepSeek = vi.fn(async () => ({
      ok: true,
      status: 'failed',
      modelCount: 0,
      observedAtMs: Date.now(),
      providerFailure,
    }))

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })
    await screen.findByText('设置')
    await user.click(screen.getByTestId('settings-category-model-catalog'))

    const deepSeekCatalog = within(screen.getByTestId('settings-catalog-provider-deepseek'))
    await waitFor(() => expect(deepSeekCatalog.getByTestId('provider-failure-provider')).toHaveTextContent('deepseek'))
    expect(deepSeekCatalog.getByTestId('provider-failure-http-status')).toHaveTextContent('429 Too Many Requests')
    expect(deepSeekCatalog.getByTestId('provider-failure-message')).toHaveTextContent('Provider quota window is exhausted.')
    expect(deepSeekCatalog.getByTestId('provider-failure-safe-json')).toHaveTextContent('"starverseDiagnosticCode": "provider_rate_limited"')
  })

  it('saves ordinary settings without implicitly saving catalog policy or credentials', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    const keyInput = screen.getByTestId('settings-openrouter-api-key') as HTMLInputElement
    await waitFor(() => expect(keyInput).not.toBeDisabled())
    expect(keyInput.value).toBe('')
    expect(keyInput.placeholder).toBe(CONFIGURED_API_KEY_PLACEHOLDER)
    expect(screen.queryByTestId('settings-openrouter-key-status')).not.toBeInTheDocument()

    await user.clear(keyInput)
    await user.type(keyInput, 'sk-new')

    const checkbox = screen.getByLabelText('强制 OpenRouter 校验 provider 参数') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    await user.click(checkbox)
    expect(checkbox.checked).toBe(true)

    await user.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect((globalThis as any).electronStore.set)
      .toHaveBeenCalledWith('generationV2UiPreferences', expect.objectContaining({
        reasoningPrefs: { mode: 'auto', effort: 'auto', exclude: false },
        chatReasoningPanelDefaultExpanded: true,
        userMessageRenderDefault: false,
        webSearchDefaults: null,
        generationParamsDefaults: null,
      })))

    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).not.toHaveBeenCalledWith('openRouterApiKey', expect.anything())
    expect(storeSet).not.toHaveBeenCalledWith('catalogPolicyV2', expect.anything())

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('settings.setOpenRouterProviderRequireParameters', { value: true })
    const credentialUpdate = (globalThis as any).openRouterCredential.update as ReturnType<typeof vi.fn>
    expect(credentialUpdate).not.toHaveBeenCalled()
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

    const keyInput = screen.getByTestId('settings-openrouter-api-key') as HTMLInputElement
    await waitFor(() => expect(keyInput).not.toBeDisabled())
    expect(keyInput).toHaveValue('')
    expect(screen.queryByDisplayValue('sk-old')).toBeNull()
    expect(keyInput.placeholder).toBe(CONFIGURED_API_KEY_PLACEHOLDER)
    expect(screen.queryByTestId('settings-openrouter-key-status')).not.toBeInTheDocument()

    await user.clear(keyInput)
    await user.type(keyInput, 'sk-c4c-replacement-key')
    await user.click(screen.getByTestId('settings-openrouter-apply-key'))

    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).not.toHaveBeenCalledWith('openRouterApiKey', expect.anything())
    expect((globalThis as any).openRouterCredential.update).toHaveBeenCalledWith({
      apiKey: 'sk-c4c-replacement-key',
    })

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke.mock.calls.map(([method]) => method)).not.toContain('openrouterCredential.getMetadata')
    expect((globalThis as any).electronAPI.openRouterCredentialGetMetadata).toBeUndefined()
  })

  it('uses safe OpenAI Responses credential metadata and one-way update instead of generic store credentials', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).openAIResponsesCredential.getStatus).toHaveBeenCalled())

    const storeGet = (globalThis as any).electronStore.get as ReturnType<typeof vi.fn>
    expect(storeGet).not.toHaveBeenCalledWith('openAIResponsesApiKey')

    const panel = await screen.findByTestId('settings-openai-responses-experimental')
    const openAIKeyInput = screen.getByTestId('settings-openai-responses-api-key') as HTMLInputElement
    await waitFor(() => expect(openAIKeyInput).not.toBeDisabled())
    expect(panel.textContent).toContain(t('settings.experimentalChat.openAIResponses.desc'))
    expect(openAIKeyInput).toHaveValue('')
    expect(openAIKeyInput.placeholder).toBe(CONFIGURED_API_KEY_PLACEHOLDER)
    expect(screen.queryByTestId('settings-openai-responses-key-status')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('sk-openai-old')).toBeNull()

    await user.type(openAIKeyInput, 'sk-openai-replacement')
    await user.click(screen.getByTestId('settings-openai-responses-apply-key'))

    expect((globalThis as any).openAIResponsesCredential.update).toHaveBeenCalledWith({
      apiKey: 'sk-openai-replacement',
    })
    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).not.toHaveBeenCalledWith('openAIResponsesApiKey', expect.anything())
  })

  it('uses safe Google AI Studio credential metadata and one-way update instead of legacy Gemini or generic store credentials', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).googleAIStudioCredential.getStatus).toHaveBeenCalled())

    const storeGet = (globalThis as any).electronStore.get as ReturnType<typeof vi.fn>
    expect(storeGet).not.toHaveBeenCalledWith('googleAIStudioApiKey')
    expect(storeGet).not.toHaveBeenCalledWith('geminiApiKey')

    const panel = await screen.findByTestId('settings-google-ai-studio-experimental')
    const googleKeyInput = screen.getByTestId('settings-google-ai-studio-api-key') as HTMLInputElement
    await waitFor(() => expect(googleKeyInput).not.toBeDisabled())
    expect(panel.textContent).toContain(t('settings.experimentalChat.googleAIStudio.desc'))
    expect(screen.queryByTestId('settings-google-ai-studio-model')).not.toBeInTheDocument()
    expect(googleKeyInput).toHaveValue('')
    expect(googleKeyInput.placeholder).toBe(CONFIGURED_API_KEY_PLACEHOLDER)
    expect(screen.queryByTestId('settings-google-ai-studio-key-status')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('AIza-old-google-key')).toBeNull()

    await user.type(googleKeyInput, 'AIza-google-replacement')
    await user.click(screen.getByTestId('settings-google-ai-studio-apply-key'))

    expect((globalThis as any).googleAIStudioCredential.update).toHaveBeenCalledWith({
      apiKey: 'AIza-google-replacement',
    })
    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).not.toHaveBeenCalledWith('googleAIStudioApiKey', expect.anything())
    expect(storeSet).not.toHaveBeenCalledWith('geminiApiKey', expect.anything())
  })

  it('uses safe Anthropic credential metadata and one-way update instead of generic store credentials', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).anthropicCredential.getStatus).toHaveBeenCalled())

    const storeGet = (globalThis as any).electronStore.get as ReturnType<typeof vi.fn>
    expect(storeGet).not.toHaveBeenCalledWith('anthropicApiKey')

    const panel = await screen.findByTestId('settings-anthropic-experimental')
    const anthropicKeyInput = screen.getByTestId('settings-anthropic-api-key') as HTMLInputElement
    await waitFor(() => expect(anthropicKeyInput).not.toBeDisabled())
    expect(panel.textContent).toContain(t('settings.experimentalChat.anthropic.desc'))
    expect(anthropicKeyInput).toHaveValue('')
    expect(anthropicKeyInput.placeholder).toBe(CONFIGURED_API_KEY_PLACEHOLDER)
    expect(screen.queryByTestId('settings-anthropic-key-status')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('sk-ant-old-key')).toBeNull()

    await user.type(anthropicKeyInput, 'sk-ant-replacement')
    await user.click(screen.getByTestId('settings-anthropic-apply-key'))

    expect((globalThis as any).anthropicCredential.update).toHaveBeenCalledWith({
      apiKey: 'sk-ant-replacement',
    })
    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).not.toHaveBeenCalledWith('anthropicApiKey', expect.anything())
  })

  it('uses safe DeepSeek credential metadata and one-way update instead of generic store credentials', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).deepSeekCredential.getStatus).toHaveBeenCalled())

    const storeGet = (globalThis as any).electronStore.get as ReturnType<typeof vi.fn>
    expect(storeGet).not.toHaveBeenCalledWith('deepSeekApiKey')

    const panel = await screen.findByTestId('settings-deepseek-experimental')
    const deepSeekKeyInput = screen.getByTestId('settings-deepseek-api-key') as HTMLInputElement
    await waitFor(() => expect(deepSeekKeyInput).not.toBeDisabled())
    expect(panel.textContent).toContain(t('settings.experimentalChat.deepSeek.desc'))
    expect(deepSeekKeyInput).toHaveValue('')
    expect(deepSeekKeyInput.placeholder).toBe(CONFIGURED_API_KEY_PLACEHOLDER)
    expect(screen.queryByTestId('settings-deepseek-key-status')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('sk-deepseek-old-key')).toBeNull()

    await user.type(deepSeekKeyInput, 'sk-deepseek-replacement')
    await user.click(screen.getByTestId('settings-deepseek-apply-key'))

    expect((globalThis as any).deepSeekCredential.update).toHaveBeenCalledWith({
      apiKey: 'sk-deepseek-replacement',
    })
    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).not.toHaveBeenCalledWith('deepSeekApiKey', expect.anything())
  })

  it('reveals saved API keys on show and hides them again without using generic store reads', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')

    const cases = [
      {
        input: screen.getByTestId('settings-openrouter-api-key') as HTMLInputElement,
        toggle: screen.getByTestId('settings-openrouter-toggle-key-visibility'),
        bridge: (globalThis as any).openRouterCredential,
        value: 'sk-openrouter-saved',
      },
      {
        input: screen.getByTestId('settings-openai-responses-api-key') as HTMLInputElement,
        toggle: screen.getByTestId('settings-openai-responses-toggle-key-visibility'),
        bridge: (globalThis as any).openAIResponsesCredential,
        value: 'sk-openai-responses-saved',
      },
      {
        input: screen.getByTestId('settings-google-ai-studio-api-key') as HTMLInputElement,
        toggle: screen.getByTestId('settings-google-ai-studio-toggle-key-visibility'),
        bridge: (globalThis as any).googleAIStudioCredential,
        value: 'AIza-google-saved',
      },
      {
        input: screen.getByTestId('settings-anthropic-api-key') as HTMLInputElement,
        toggle: screen.getByTestId('settings-anthropic-toggle-key-visibility'),
        bridge: (globalThis as any).anthropicCredential,
        value: 'sk-ant-saved',
      },
      {
        input: screen.getByTestId('settings-deepseek-api-key') as HTMLInputElement,
        toggle: screen.getByTestId('settings-deepseek-toggle-key-visibility'),
        bridge: (globalThis as any).deepSeekCredential,
        value: 'sk-deepseek-saved',
      },
    ] as const

    for (const item of cases) {
      await waitFor(() => expect(item.input).not.toBeDisabled())
      expect(item.input.type).toBe('password')
      expect(item.input).toHaveValue('')

      await user.click(item.toggle)

      await waitFor(() => expect(item.input).toHaveValue(item.value))
      expect(item.input.type).toBe('text')
      expect(item.toggle.textContent).toContain(t('common.hide'))
      expect(item.bridge.reveal).toHaveBeenCalledTimes(1)

      await user.click(item.toggle)

      expect(item.input.type).toBe('password')
      expect(item.input).toHaveValue('')
      expect(item.input.placeholder).toBe(CONFIGURED_API_KEY_PLACEHOLDER)
      expect(item.toggle.textContent).toContain(t('common.show'))
    }

    const storeGet = (globalThis as any).electronStore.get as ReturnType<typeof vi.fn>
    expect(storeGet).not.toHaveBeenCalledWith('openRouterApiKey')
    expect(storeGet).not.toHaveBeenCalledWith('openAIResponsesApiKey')
    expect(storeGet).not.toHaveBeenCalledWith('googleAIStudioApiKey')
    expect(storeGet).not.toHaveBeenCalledWith('anthropicApiKey')
    expect(storeGet).not.toHaveBeenCalledWith('deepSeekApiKey')
  })

  it('removes cloud experimental manual model inputs and cleans legacy model keys while preserving credentials', async () => {
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.model', 'gpt-4.1-mini')
    globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.model', 'gemini-2.5-flash')
    globalThis.localStorage?.setItem('starverse.anthropicMessagesTextChat.model', 'claude-sonnet-4-5')
    globalThis.localStorage?.setItem('starverse.deepSeekTextChat.model', 'deepseek-chat')

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    expect(screen.getByTestId('settings-openai-responses-api-key')).toBeInTheDocument()
    expect(screen.getByTestId('settings-google-ai-studio-api-key')).toBeInTheDocument()
    expect(screen.getByTestId('settings-anthropic-api-key')).toBeInTheDocument()
    expect(screen.getByTestId('settings-deepseek-api-key')).toBeInTheDocument()

    expect(screen.queryByTestId('settings-openai-responses-model')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-google-ai-studio-model')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-anthropic-model')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-deepseek-model')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-openai-responses-apply-chat')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-google-ai-studio-apply-chat')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-anthropic-apply-chat')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-deepseek-apply-chat')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(globalThis.localStorage?.getItem('starverse.openAIResponsesTextChat.model')).toBeNull()
      expect(globalThis.localStorage?.getItem('starverse.googleAIStudioTextChat.model')).toBeNull()
      expect(globalThis.localStorage?.getItem('starverse.anthropicMessagesTextChat.model')).toBeNull()
      expect(globalThis.localStorage?.getItem('starverse.deepSeekTextChat.model')).toBeNull()
    })
    expect(document.body.textContent).not.toContain('endpoint picker')
  })


  it('loads catalog sync settings defaults', async () => {
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    expect(screen.getByTestId('settings-catalog-startup-sync-policy')).toHaveValue('never')
    expect(screen.getByTestId('settings-catalog-picker-open-sync-policy')).toHaveValue('never')
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
      '永久',
      '自定义',
    ])
  })

  it('normalizes invalid catalog sync settings to defaults', async () => {
    ;(globalThis as any).electronStore = createElectronStoreMockWith({
      catalogPolicyV2: {
        startupSyncPolicy: 'bad', pickerOpenSyncPolicy: 'bad', listApplyMode: 'bad',
        freshnessMs: 12345, retentionMs: 12345,
      },
    })

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())

    expect(screen.getByTestId('settings-catalog-startup-sync-policy')).toHaveValue('never')
    expect(screen.getByTestId('settings-catalog-picker-open-sync-policy')).toHaveValue('never')
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
    await user.click(screen.getByTestId('settings-save'))

    const storeSet = (globalThis as any).electronStore.set as ReturnType<typeof vi.fn>
    expect(storeSet).toHaveBeenCalledWith('catalogPolicyV2', {
      startupSyncPolicy: 'always', pickerOpenSyncPolicy: 'never', listApplyMode: 'automatic',
      freshnessMs: 15 * 60 * 1000, retentionMs: 'never',
    })
    expect(JSON.stringify(storeSet.mock.calls.filter(([key]) => String(key).startsWith('openRouterCatalog')))).not.toContain('sk-')
  })

  it('does not emit an OpenRouter credential event from the ordinary global save', async () => {
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

    await user.click(screen.getByTestId('settings-save'))

    expect(events).toEqual([])

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
    await user.click(screen.getByTestId('settings-category-providers'))

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

  it('refreshes the selected provider through the provider-neutral authority', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await waitFor(() => expect((globalThis as any).electronStore.get).toHaveBeenCalled())
    await user.click(screen.getByTestId('settings-category-model-catalog'))

    await user.click(screen.getByTestId('settings-catalog-refresh-openrouter'))

    await waitFor(() => {
      const sync = (globalThis as any).generationV2.models.sync as ReturnType<typeof vi.fn>
      expect(sync).toHaveBeenCalledWith(expect.objectContaining({
        providerKey: 'openrouter',
        timeoutMs: 30_000,
        retentionMs: 7_776_000_000,
        applyMode: 'manual',
      }))
    })
  })

  it('keeps a manual catalog refresh pending until the user applies its immutable snapshot', async () => {
    const user = userEvent.setup()
    const pendingDigest = 'a'.repeat(64)
    const models = (globalThis as any).generationV2.models
    models.sync.mockResolvedValueOnce({
      ok: true,
      status: 'pending',
      modelCount: 1,
      visibleModelCount: 1,
      hiddenModelCount: 0,
      pendingSnapshotDigest: pendingDigest,
      observedAtMs: Date.now(),
    })

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })
    await screen.findByText('设置')
    await user.click(screen.getByTestId('settings-category-model-catalog'))
    await user.click(screen.getByTestId('settings-catalog-refresh-openrouter'))

    expect(await screen.findByTestId('settings-catalog-pending-openrouter')).toBeTruthy()
    await user.click(screen.getByTestId('settings-catalog-apply-openrouter'))
    await waitFor(() => {
      expect(models.applyPending).toHaveBeenCalledWith({
        providerKey: 'openrouter',
        snapshotDigest: pendingDigest,
      })
    })
    expect(screen.queryByTestId('settings-catalog-pending-openrouter')).toBeNull()
  })

  it('clears current API Key catalog cache via main IPC without API key payload', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await user.click(screen.getByTestId('settings-category-privacy-data'))
    await waitFor(() => expect(screen.getByTestId('settings-clear-current-catalog-cache')).not.toBeDisabled())
    await user.click(screen.getByTestId('settings-clear-current-catalog-cache'))

    const clearCurrent = (globalThis as any).generationV2.models.clearCurrent as ReturnType<typeof vi.fn>
    await waitFor(() => expect(clearCurrent).toHaveBeenCalledTimes(1))
    expect(clearCurrent).toHaveBeenCalledWith({ providerKey: 'openrouter' })
    expect(confirm.mock.calls[0]?.[0]).toContain('openrouter')
    expect(confirm.mock.calls[0]?.[0]).toContain('凭据和聊天记录会保留')
    expect(JSON.stringify(clearCurrent.mock.calls)).not.toContain('sk-')
    expect(JSON.stringify(clearCurrent.mock.calls)).not.toContain('catalogScopeKey')
    await screen.findByText('已清除 openrouter 当前凭据范围的缓存。')
    confirm.mockRestore()
  })

  it('clears all OpenRouter scoped catalog caches via main IPC without API key payload', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await user.click(screen.getByTestId('settings-category-privacy-data'))
    await waitFor(() => expect(screen.getByTestId('settings-clear-all-catalog-caches')).not.toBeDisabled())
    await user.click(screen.getByTestId('settings-clear-all-catalog-caches'))

    const clearAll = (globalThis as any).generationV2.models.clearAll as ReturnType<typeof vi.fn>
    await waitFor(() => expect(clearAll).toHaveBeenCalledTimes(1))
    expect(clearAll).toHaveBeenCalledWith({ providerKey: 'openrouter' })
    expect(confirm.mock.calls[0]?.[0]).toContain('openrouter')
    expect(confirm.mock.calls[0]?.[0]).toContain('凭据和聊天记录会保留')
    expect(JSON.stringify(clearAll.mock.calls)).not.toContain('sk-')
    expect(JSON.stringify(clearAll.mock.calls)).not.toContain('catalogScopeKey')
    await screen.findByText('已清除 openrouter 的全部模型目录缓存。')
    confirm.mockRestore()
  })

  it('shows cleanup failure from catalog cleanup IPC', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    ;(globalThis as any).generationV2.models.clearAll = vi.fn(async () => ({ ok: false, code: 'db_unavailable' }))

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await user.click(screen.getByTestId('settings-category-privacy-data'))
    await waitFor(() => expect(screen.getByTestId('settings-clear-all-catalog-caches')).not.toBeDisabled())
    await user.click(screen.getByTestId('settings-clear-all-catalog-caches'))

    await screen.findByText(/清理模型目录失败: db_unavailable/)
    confirm.mockRestore()
  })

  it('runs LocalEndpoint diagnostics through the safe probe bridge without enabling chat send', async () => {
    const user = userEvent.setup()
    const settingsUpdated = vi.fn()
    window.addEventListener('settings:localEndpointTextChatUpdated', settingsUpdated)
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    try {
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
      expect(screen.getByTestId('settings-local-endpoint-probe-capabilities').textContent).toContain(t('settings.localEndpoint.textCapabilitySummary'))
      expect(result.textContent).not.toContain('sk-hidden')
      expect(result.textContent).not.toContain('Authorization')
      expect(result.textContent).not.toContain('Bearer')
      expect(document.body.textContent).toContain(t('settings.localEndpoint.desc'))

      expect(screen.queryByTestId('settings-local-endpoint-probed-model-select')).not.toBeInTheDocument()
      expect(screen.queryByTestId('settings-local-endpoint-manual-model')).not.toBeInTheDocument()
      await user.click(screen.getByTestId('settings-local-endpoint-save-url'))

      expect(globalThis.localStorage?.getItem('starverse.localEndpointTextChat.url')).toBe('http://localhost:1234/v1')
      expect(globalThis.localStorage?.getItem('starverse.localEndpointTextChat.model')).toBeNull()
      expect(globalThis.localStorage?.getItem('starverse.localEndpointTextChat.enabled')).toBeNull()
      expect(settingsUpdated).toHaveBeenCalledTimes(1)
      expect((settingsUpdated.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
        endpointUrl: 'http://localhost:1234/v1',
      })

      expect((globalThis as any).electronAPI.startOpenRouterStream).toBeUndefined()
      expect((globalThis as any).openRouterCredential.update).not.toHaveBeenCalledWith(expect.objectContaining({
        baseUrl: expect.stringContaining('localhost'),
      }))
    } finally {
      window.removeEventListener('settings:localEndpointTextChatUpdated', settingsUpdated)
    }
  })

  it('does not expose manual LocalEndpoint model override when endpoint probe fails', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).localEndpointDiagnostics = createLocalEndpointDiagnosticsMock({
      ok: false,
      code: 'network_error',
      message: 'Local endpoint is unreachable.',
      safeUrl: 'http://localhost:4321/v1',
    })

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')

    const urlInput = await screen.findByTestId('settings-local-endpoint-url') as HTMLInputElement
    await waitFor(() => expect(urlInput).not.toBeDisabled())
    await user.clear(urlInput)
    await user.type(urlInput, 'http://localhost:4321/v1')
    await user.click(screen.getByTestId('settings-local-endpoint-probe'))

    await screen.findByTestId('settings-local-endpoint-probe-error')
    expect(screen.queryByTestId('settings-local-endpoint-manual-model')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-local-endpoint-apply-chat')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('settings-local-endpoint-save-url'))

    expect(globalThis.localStorage?.getItem('starverse.localEndpointTextChat.url')).toBe('http://localhost:4321/v1')
    expect(globalThis.localStorage?.getItem('starverse.localEndpointTextChat.model')).toBeNull()
    expect(globalThis.localStorage?.getItem('starverse.localEndpointTextChat.enabled')).toBeNull()
    expect(document.body.textContent).not.toContain('Authorization')
    expect(document.body.textContent).not.toContain('Bearer')
  })

  it('shows safe model-list failure status without exposing manual LocalEndpoint model entry', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).localEndpointDiagnostics = createLocalEndpointDiagnosticsMock({
      ok: true,
      diagnostics: {
        kind: 'local_endpoint_diagnostics',
        status: 'reachable',
        endpointFamily: 'openai_compatible',
        safeBaseUrl: 'http://localhost:1234/v1',
        modelList: {
          ok: false,
          source: 'openai_v1_models',
          code: 'invalid_response',
          message: 'Model list failed safely.',
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
        message: 'Local endpoint is reachable but model listing failed.',
      },
    })

    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await user.click(screen.getByTestId('settings-local-endpoint-probe'))

    expect(await screen.findByTestId('settings-local-endpoint-probe-models')).toHaveTextContent(
      tf('settings.localEndpoint.modelListFailed', { message: 'Model list failed safely.' }),
    )
    expect(screen.queryByTestId('settings-local-endpoint-manual-model')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-local-endpoint-apply-chat')).not.toBeInTheDocument()

    expect(globalThis.localStorage?.getItem('starverse.localEndpointTextChat.model')).toBeNull()
    expect(document.body.textContent).not.toContain('Authorization')
    expect(document.body.textContent).not.toContain('Bearer')
  })

  it('runs LocalEndpoint stream diagnostics manually without enabling chat send', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')

    const urlInput = await screen.findByTestId('settings-local-endpoint-url') as HTMLInputElement
    await waitFor(() => expect(urlInput).not.toBeDisabled())
    await user.clear(urlInput)
    await user.type(urlInput, 'http://localhost:1234/v1?token=sk-hidden')
    await user.click(screen.getByTestId('settings-local-endpoint-stream-probe'))

    const streamProbe = (globalThis as any).localEndpointDiagnostics.streamProbe as ReturnType<typeof vi.fn>
    await waitFor(() => expect(streamProbe).toHaveBeenCalledWith({
      url: 'http://localhost:1234/v1?token=sk-hidden',
      timeoutMs: 5000,
    }))

    const result = await screen.findByTestId('settings-local-endpoint-stream-probe-result')
    expect(screen.getByTestId('settings-local-endpoint-stream-status').textContent).toContain('supported')
    expect(screen.getByTestId('settings-local-endpoint-stream-family').textContent).toContain('openai_compatible')
    expect(screen.getByTestId('settings-local-endpoint-stream-evidence').textContent).toContain('text_delta_observed')
    expect(screen.getByTestId('settings-local-endpoint-stream-evidence').textContent).toContain('pong')
    expect(screen.getByTestId('settings-local-endpoint-stream-capabilities').textContent).toContain(t('settings.localEndpoint.streamingCapabilitySummary'))
    expect(result.textContent).not.toContain('sk-hidden')
    expect(result.textContent).not.toContain('Authorization')
    expect(result.textContent).not.toContain('Bearer')

    expect((globalThis as any).electronAPI.startOpenRouterStream).toBeUndefined()
    expect((globalThis as any).openRouterCredential.update).not.toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: expect.stringContaining('localhost'),
    }))
  })

  it('clears OpenRouter API key through the credential bridge', async () => {
    const user = userEvent.setup()
    render(SettingsPanel, { props: { disabled: false, isRunning: false } })

    await screen.findByText('设置')
    await user.click(screen.getByTestId('settings-category-providers'))

    const clearButtons = screen.getAllByRole('button', { name: '清除' })
    expect(clearButtons.length).toBeGreaterThanOrEqual(1)

    await user.click(clearButtons[0])

    const storeDelete = (globalThis as any).electronStore.delete as ReturnType<typeof vi.fn>
    expect(storeDelete).not.toHaveBeenCalledWith('openRouterApiKey')
    expect((globalThis as any).openRouterCredential.clear).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('settings-openrouter-key-status').textContent).toContain(t('settings.credentials.notConfigured')))
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
    await user.click(screen.getByTestId('settings-save'))
    expect(globalThis.localStorage?.getItem('sv_debug_openrouter_echo_upstream_body')).toBe('1')
  })
})
