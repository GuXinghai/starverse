import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompatibleProviderSettingsPanel from './CompatibleProviderSettingsPanel.vue'

const clients = vi.hoisted(() => ({
  registry: {
    list: vi.fn(), create: vi.fn(), update: vi.fn(), updateEndpoint: vi.fn(), reviseConfiguration: vi.fn(),
    listDiscovery: vi.fn(), ignoreDiscovery: vi.fn(), deleteCredential: vi.fn(), deleteProvider: vi.fn(), testConnection: vi.fn(),
  },
  catalog: {
    query: vi.fn(), sync: vi.fn(), abortSync: vi.fn(), getStatus: vi.fn(), upsertManual: vi.fn(), deleteManual: vi.fn(),
  },
}))

vi.mock('@/next/provider/openai-chat-compatible/ui', () => ({ createCompatibleProviderRegistryClient: () => clients.registry }))
vi.mock('@/next/modelCatalog/compatibleCatalogClient', () => ({ createCompatibleCatalogClient: () => clients.catalog }))

const firstId = 'ocp_provider_12345678'
const secondId = 'ocp_provider_87654321'

function details(providerInstanceId: string, displayName: string, baseUrl: string) {
  return {
    provider: { providerInstanceId, protocolKey: 'openai_chat_compatible', displayName, status: 'active', createdAtMs: 1, updatedAtMs: 1, deletedAtMs: null },
    endpointRevisions: [{
      endpointRevisionId: `ocp_endpoint_${providerInstanceId.slice(-8)}`,
      revision: 1,
      baseUrl,
      allowInsecureHttp: baseUrl.startsWith('http:'),
      securityPolicy: 'compatibility_first',
      authMode: 'bearer',
      credentialConfigured: true,
      sensitiveHeaderNames: [],
      ordinaryHeaders: [],
      query: [],
      requestProfileId: 'ocp_request_profile_12345678',
      requestProfileVersion: 1,
      responseProfileId: 'ocp_response_profile_12345678',
      responseProfileVersion: 1,
      createdAtMs: 1,
    }],
    credentials: [{ credentialVersionRef: 'ocp_credential_12345678', providerInstanceId, version: 1, mode: 'bearer', maskedSummary: '••••', configured: true, createdAtMs: 1, deletedAtMs: null }],
    activeConfiguration: null,
  }
}

describe('CompatibleProviderSettingsPanel', () => {
  let registry: Record<string, ReturnType<typeof vi.fn>>
  let catalog: Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    vi.resetAllMocks()
    ;(window as Window & { electronAPI?: { platform?: NodeJS.Platform } }).electronAPI = { platform: 'win32' }
    const rows = [details(firstId, 'First', 'https://first.example/v1'), details(secondId, 'Second', 'https://second.example/v1')]
    registry = clients.registry
    registry.list.mockResolvedValue(rows)
    registry.create.mockResolvedValue(rows[0])
    registry.update.mockResolvedValue(rows[0])
    registry.updateEndpoint.mockResolvedValue(rows[0])
    registry.reviseConfiguration.mockResolvedValue(rows[0])
    registry.listDiscovery.mockResolvedValue([])
    registry.ignoreDiscovery.mockResolvedValue([])
    registry.deleteCredential.mockResolvedValue(rows[0])
    registry.deleteProvider.mockResolvedValue(null)
    registry.testConnection.mockImplementation(async (providerInstanceId: string, requestId: string) => ({ ok: true, requestId, providerInstanceId,
      endpointRevisionId: 'ocp_endpoint_12345678', operation: 'connection_test', securityPolicy: 'compatibility_first', proxyRoute: 'system',
      transportKind: 'electron_session', status: 200, durationMs: 1, warnings: [], diagnostics: {} }))
    catalog = clients.catalog
    catalog.query.mockImplementation(async ({ providerInstanceId }) => ({
        protocolKey: 'openai_chat_compatible', providerInstanceId,
        providerName: providerInstanceId === firstId ? 'First' : 'Second', providerStatus: 'active', syncState: null, total: 0, items: [],
      }))
  })

  it('does not offer strict_ssrf as a selectable policy because the transport always rejects it', async () => {
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    await screen.findByText('First')
    const option = screen.getByRole('option', { name: /strict_ssrf/ }) as HTMLOptionElement
    expect(option.disabled).toBe(true)
    expect((option.closest('select') as HTMLSelectElement).value).toBe('compatibility_first')
  })

  it('shows a persisted strict_ssrf policy as unavailable instead of silently rewriting it', async () => {
    const saved = details(firstId, 'First', 'https://first.example/v1')
    saved.endpointRevisions[0]!.securityPolicy = 'strict_ssrf'
    registry.list.mockResolvedValue([saved])
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    await fireEvent.click(await screen.findByText('First'))
    expect(await screen.findByTestId('compatible-strict-ssrf-unavailable')).toHaveAttribute('role', 'alert')
    expect(registry.updateEndpoint).not.toHaveBeenCalled()
  })

  it('keeps identical catalog model namespaces scoped to the selected provider instance', async () => {
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    await screen.findByText('First')
    await fireEvent.click(screen.getByText('First'))
    await fireEvent.click(screen.getByText('Second'))
    await waitFor(() => expect(catalog.query).toHaveBeenCalledTimes(2))
    expect(catalog.query.mock.calls.map(([input]) => input.providerInstanceId)).toEqual([firstId, secondId])
  })

  it('runs connection diagnostics and catalog sync against only the selected instance', async () => {
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    await screen.findByText('Second')
    await fireEvent.click(screen.getByText('Second'))
    await fireEvent.click(screen.getByText(/Test connection|测试连接/))
    await waitFor(() => expect(registry.testConnection).toHaveBeenCalledWith(secondId, expect.any(String)))
    await fireEvent.click(screen.getByText(/Sync \/models|同步 \/models/))
    await waitFor(() => expect(catalog.sync).toHaveBeenCalledWith(expect.objectContaining({ providerInstanceId: secondId, force: true })))
  })

  it('treats credentials as write-only and clears the secret after create', async () => {
    registry.list.mockResolvedValueOnce([]).mockResolvedValueOnce([details(firstId, 'First', 'https://first.example/v1')])
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    const name = await screen.findByTestId('compatible-display-name')
    await fireEvent.update(name, 'First')
    await fireEvent.update(screen.getByTestId('compatible-secret-input'), 'do-not-render-again')
    await fireEvent.click(screen.getByTestId('compatible-save'))
    await waitFor(() => expect(registry.create).toHaveBeenCalledOnce())
    expect(registry.create.mock.calls[0]![0].credential.token).toBe('do-not-render-again')
    expect((screen.getByTestId('compatible-secret-input') as HTMLInputElement).value).toBe('')
    expect(document.body.textContent).not.toContain('do-not-render-again')
  })

  it('keeps a new credential only long enough for the user to choose session or plaintext storage', async () => {
    registry.list.mockResolvedValueOnce([])
    registry.create.mockRejectedValueOnce(new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED'))
      .mockResolvedValueOnce(details(firstId, 'First', 'https://first.example/v1'))
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    await fireEvent.update(await screen.findByTestId('compatible-display-name'), 'First')
    await fireEvent.update(screen.getByTestId('compatible-secret-input'), 'choice-only-secret')
    await fireEvent.click(screen.getByTestId('compatible-save'))
    await screen.findByTestId('compatible-credential-storage-choice')
    expect((screen.getByTestId('compatible-secret-input') as HTMLInputElement).value).toBe('choice-only-secret')
    expect(screen.queryByTestId('compatible-save-plaintext')).toBeNull()
    await fireEvent.click(screen.getByText(/This run only|仅本次运行/))
    await waitFor(() => expect(registry.create).toHaveBeenCalledTimes(2))
    expect(registry.create.mock.calls[1]![0]).toMatchObject({ storageMode: 'session', credential: { token: 'choice-only-secret' } })
    expect((screen.getByTestId('compatible-secret-input') as HTMLInputElement).value).toBe('')
    expect(document.body.textContent).not.toContain('choice-only-secret')
  })

  it('offers explicit plaintext persistence only on Linux', async () => {
    ;(window as Window & { electronAPI?: { platform?: NodeJS.Platform } }).electronAPI = { platform: 'linux' }
    registry.list.mockResolvedValueOnce([])
    registry.create.mockRejectedValueOnce(new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED'))
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    await fireEvent.update(await screen.findByTestId('compatible-display-name'), 'First')
    await fireEvent.update(screen.getByTestId('compatible-secret-input'), 'linux-choice-secret')
    await fireEvent.click(screen.getByTestId('compatible-save'))
    await screen.findByTestId('compatible-credential-storage-choice')
    expect(screen.getByTestId('compatible-save-plaintext')).toBeTruthy()
  })

  it('warns explicitly for insecure HTTP without changing the selected security policy', async () => {
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    await screen.findByText('First')
    await fireEvent.click(screen.getByText('First'))
    await fireEvent.update(screen.getByTestId('compatible-base-url'), 'http://lan.example/v1')
    expect(await screen.findByTestId('compatible-http-warning')).toBeTruthy()
  })

  it('persists bearer to none as an explicit authentication-clearing endpoint revision', async () => {
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    await screen.findByText('First')
    await fireEvent.click(screen.getByText('First'))
    await fireEvent.update(screen.getByTestId('compatible-auth-mode'), 'none')
    await fireEvent.click(screen.getByTestId('compatible-save'))
    await waitFor(() => expect(registry.updateEndpoint).toHaveBeenCalledOnce())
    expect(registry.updateEndpoint.mock.calls[0]![0]).toMatchObject({ providerInstanceId: firstId, credential: { mode: 'none' } })
  })

  it('writes manual capability, context and pricing provenance only to the selected instance', async () => {
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    await screen.findByText('First')
    await fireEvent.click(screen.getByText('First'))
    await fireEvent.update(screen.getByPlaceholderText(/Manual model ID|手动模型 ID/), 'same-model')
    await fireEvent.update(screen.getByPlaceholderText('context length (unknown if empty)'), '131072')
    await fireEvent.update(screen.getByPlaceholderText('prompt price'), '1.25')
    const textSelect = screen.getByText('text').querySelector('select')!
    await fireEvent.update(textSelect, 'yes')
    await fireEvent.click(screen.getByTestId('compatible-add-manual-model'))
    await waitFor(() => expect(catalog.upsertManual).toHaveBeenCalledOnce())
    expect(catalog.upsertManual.mock.calls[0]![0]).toMatchObject({
      providerInstanceId: firstId, modelId: 'same-model',
      metadata: { contextLength: 131072, capabilities: { text: true, vision: null }, pricing: { prompt: '1.25' } },
    })
  })

  it('saves profile edits through an immutable configuration revision command', async () => {
    const configured = details(firstId, 'First', 'https://first.example/v1') as any
    configured.activeConfiguration = {
      endpointRevisionId: configured.endpointRevisions[0].endpointRevisionId,
      requestBundle: { profile: { config: { schemaVersion: 1, standardFieldOwnership: 'builder', unsupportedFieldPolicy: 'error_before_fetch', defaults: {}, extraBody: { enabled: true, maxDepth: 8, maxKeys: 256, maxBytes: 65536 } } }, mappings: [] },
      responseProfile: { config: { choicePolicy: 'preserve_all' } },
      reasoningMapping: { config: { schemaVersion: 1, mode: 'custom_only', rules: [], replay: { format: 'disabled', scope: 'never' } } },
      inlinePolicy: { config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] } },
    }
    registry.list.mockResolvedValue([configured])
    registry.reviseConfiguration.mockResolvedValue(configured)
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    await screen.findByText('First')
    await fireEvent.click(screen.getByText('First'))
    const mode = screen.getByTestId('compatible-reasoning-mode') as HTMLSelectElement
    expect([...mode.options].map((option) => option.value)).toEqual(['custom_preferred_with_builtin_fallback', 'custom_only'])
    await fireEvent.update(mode, 'custom_only')
    expect(screen.getByTestId('compatible-reasoning-mode-controls')).toHaveTextContent(/locked per choice|每个 choice/)
    await fireEvent.click(screen.getByTestId('compatible-save-profiles'))
    await waitFor(() => expect(registry.reviseConfiguration).toHaveBeenCalledOnce())
    expect(registry.reviseConfiguration.mock.calls[0]![0]).toMatchObject({ providerInstanceId: firstId, reasoningMapping: { mode: 'custom_only' } })
  })

  it('requires explicit discovery accept and pins the accepted path into a new reasoning profile', async () => {
    const configured = details(firstId, 'First', 'https://first.example/v1') as any
    configured.activeConfiguration = {
      endpointRevisionId: configured.endpointRevisions[0].endpointRevisionId,
      requestBundle: { profile: { config: { schemaVersion: 1, standardFieldOwnership: 'builder', unsupportedFieldPolicy: 'error_before_fetch', defaults: {}, extraBody: { enabled: true, maxDepth: 8, maxKeys: 256, maxBytes: 65536 } } }, mappings: [] },
      responseProfile: {},
      reasoningMapping: { config: { schemaVersion: 1, mode: 'custom_only', rules: [], replay: { format: 'disabled', scope: 'never' } } },
      inlinePolicy: { config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] } },
    }
    registry.list.mockResolvedValue([configured])
    registry.reviseConfiguration.mockResolvedValue(configured)
    registry.listDiscovery.mockResolvedValue([{
      providerInstanceId: firstId, responseProfileId: 'ocp_response_profile_12345678', profileVersion: 1,
      streamPath: 'choices.*.delta.thought_process', state: 'candidate',
      aggregate: { schemaVersion: 1, observedShapes: ['string'], redactedPreview: null, sampleCount: 2 },
      occurrenceCount: 2, firstObservedAtMs: 1, lastObservedAtMs: 2,
    }])
    render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
    await screen.findByText('First')
    await fireEvent.click(screen.getByText('First'))
    await screen.findByText('choices.*.delta.thought_process')
    await fireEvent.click(screen.getByText(/Use as reasoning field|设为推理字段/))
    await waitFor(() => expect(registry.reviseConfiguration).toHaveBeenCalledOnce())
    expect(registry.reviseConfiguration.mock.calls[0]![0]).toMatchObject({
      acceptedDiscoveryPaths: ['choices.*.delta.thought_process'],
      reasoningMapping: { rules: [{ stream: { path: 'choices.*.delta.thought_process', mode: 'append' }, semantic: 'text' }] },
    })
  })

  // R4-09 (P6a-05): races and silent failures.
  describe('request snapshots, selection races and failure reporting', () => {
    const deferred = <T,>() => {
      let resolve!: (value: T) => void
      let reject!: (cause: unknown) => void
      const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
      return { promise, resolve, reject }
    }
    const model = (modelId: string) => ({
      providerInstanceId: firstId, modelId, sourcePresence: { manual: true, remote: 'absent' }, conflictFields: [],
      metadata: { capabilities: { text: null }, contextLength: null, pricing: { prompt: null }, fieldProvenance: {} },
    })
    const alertText = async () => (await screen.findByRole('alert')).textContent ?? ''

    it('sends the credential that was entered when Save was pressed, not what the form holds when the request is built', async () => {
      const update = deferred<ReturnType<typeof details>>()
      registry.update.mockReturnValueOnce(update.promise)
      render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
      await fireEvent.click(await screen.findByText('First'))
      await fireEvent.update(screen.getByTestId('compatible-secret-input'), 'token-at-click')
      await fireEvent.click(screen.getByTestId('compatible-save'))
      await waitFor(() => expect(registry.update).toHaveBeenCalledOnce())
      await fireEvent.update(screen.getByTestId('compatible-secret-input'), 'changed-while-saving')
      await fireEvent.update(screen.getByTestId('compatible-auth-mode'), 'none')
      update.resolve(details(firstId, 'First', 'https://first.example/v1'))
      await waitFor(() => expect(registry.updateEndpoint).toHaveBeenCalledOnce())
      expect(registry.updateEndpoint.mock.calls[0]![0].credential).toEqual({ mode: 'bearer', token: 'token-at-click' })
    })

    it('does not silently drop a username-only edit of basic credentials', async () => {
      const basic = details(firstId, 'First', 'https://first.example/v1')
      basic.endpointRevisions[0]!.authMode = 'basic'
      registry.list.mockResolvedValue([basic])
      render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
      await fireEvent.click(await screen.findByText('First'))
      await fireEvent.update(screen.getByLabelText(/Username|用户名/), 'someone')
      await fireEvent.click(screen.getByTestId('compatible-save'))
      expect(await alertText()).toContain('compatible_basic_password_required')
      expect(registry.update).not.toHaveBeenCalled()
      expect(registry.updateEndpoint).not.toHaveBeenCalled()
    })

    it('cannot switch instance while a request is running, so a result is never filed under another instance', async () => {
      const test = deferred<unknown>()
      registry.testConnection.mockReturnValueOnce(test.promise)
      render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
      await fireEvent.click(await screen.findByText('First'))
      await fireEvent.click(screen.getByText(/Test connection|测试连接/))
      await waitFor(() => expect(registry.testConnection).toHaveBeenCalledOnce())
      expect(screen.getByText('Second').closest('button')).toBeDisabled()
      test.resolve({ ok: true })
    })

    it('ignores a model list that arrives after another instance was selected', async () => {
      const slow = deferred<unknown>()
      catalog.query.mockImplementation(async ({ providerInstanceId }) => providerInstanceId === firstId
        ? slow.promise
        : { protocolKey: 'openai_chat_compatible', providerInstanceId, providerName: 'Second', providerStatus: 'active', syncState: null, total: 0, items: [] })
      render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
      await fireEvent.click(await screen.findByText('First'))
      await fireEvent.click(screen.getByText('Second'))
      await waitFor(() => expect(catalog.query).toHaveBeenCalledTimes(2))
      slow.resolve({ protocolKey: 'openai_chat_compatible', providerInstanceId: firstId, providerName: 'First', providerStatus: 'active',
        syncState: null, total: 1, items: [model('model-of-the-first-instance')] })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(document.body.textContent).not.toContain('model-of-the-first-instance')
    })

    it('ignores discovery results that arrive after another instance was selected', async () => {
      const slow = deferred<unknown[]>()
      registry.listDiscovery.mockImplementation(async (id: string) => id === firstId ? slow.promise : [])
      render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
      await fireEvent.click(await screen.findByText('First'))
      await fireEvent.click(screen.getByText('Second'))
      await waitFor(() => expect(registry.listDiscovery).toHaveBeenCalledTimes(2))
      slow.resolve([{ providerInstanceId: firstId, responseProfileId: 'ocp_response_profile_12345678', profileVersion: 1,
        streamPath: 'choices.*.delta.first_only', state: 'candidate',
        aggregate: { schemaVersion: 1, observedShapes: ['string'], redactedPreview: null, sampleCount: 1 }, occurrenceCount: 1,
        firstObservedAtMs: 1, lastObservedAtMs: 1 }])
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(document.body.textContent).not.toContain('choices.*.delta.first_only')
    })

    it('shows a failed connection test instead of leaving it as an unhandled rejection', async () => {
      registry.testConnection.mockRejectedValueOnce(new Error('connection_refused_by_test'))
      render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
      await fireEvent.click(await screen.findByText('First'))
      await fireEvent.click(screen.getByText(/Test connection|测试连接/))
      expect(await alertText()).toContain('connection_refused_by_test')
    })

    it('shows a failed credential delete', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const second = details(firstId, 'First', 'https://first.example/v1')
      second.credentials[0]!.credentialVersionRef = 'ocp_credential_older_version'
      registry.list.mockResolvedValue([second])
      registry.deleteCredential.mockRejectedValueOnce(new Error('credential_delete_failed_by_test'))
      render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
      await fireEvent.click(await screen.findByText('First'))
      const list = await screen.findByTestId('compatible-credential-list')
      await fireEvent.click(list.querySelector('button.sv-btn-danger') as HTMLButtonElement)
      expect(await alertText()).toContain('credential_delete_failed_by_test')
    })

    it('shows a failed manual-model write and a failed manual-model delete', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      catalog.query.mockResolvedValue({ protocolKey: 'openai_chat_compatible', providerInstanceId: firstId, providerName: 'First',
        providerStatus: 'active', syncState: null, total: 1, items: [model('manual-one')] })
      catalog.upsertManual.mockRejectedValueOnce(new Error('upsert_failed_by_test'))
      catalog.deleteManual.mockRejectedValueOnce(new Error('delete_failed_by_test'))
      render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
      await fireEvent.click(await screen.findByText('First'))
      await fireEvent.update(screen.getByPlaceholderText(/Manual model ID|手动模型 ID/), 'new-model')
      await fireEvent.click(screen.getByTestId('compatible-add-manual-model'))
      expect(await alertText()).toContain('upsert_failed_by_test')
      await fireEvent.click((await screen.findByText('manual-one')).closest('li')!.querySelector('button')!)
      await waitFor(() => expect(document.body.textContent).toContain('delete_failed_by_test'))
    })

    it('reports a failed discovery ignore, and an unreadable reasoning profile on accept', async () => {
      registry.listDiscovery.mockResolvedValue([{
        providerInstanceId: firstId, responseProfileId: 'ocp_response_profile_12345678', profileVersion: 1,
        streamPath: 'choices.*.delta.thought', state: 'candidate',
        aggregate: { schemaVersion: 1, observedShapes: ['string'], redactedPreview: null, sampleCount: 1 }, occurrenceCount: 1,
        firstObservedAtMs: 1, lastObservedAtMs: 1,
      }])
      registry.ignoreDiscovery.mockRejectedValueOnce(new Error('ignore_failed_by_test'))
      render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
      await fireEvent.click(await screen.findByText('First'))
      await screen.findByText('choices.*.delta.thought')
      await fireEvent.click(screen.getByText(/Ignore|忽略/))
      await waitFor(() => expect(document.body.textContent).toContain('ignore_failed_by_test'))
      // This instance has no active configuration, so its reasoning profile text is empty and cannot be parsed.
      await fireEvent.click(screen.getByText(/Use as reasoning field|设为推理字段/))
      await waitFor(() => expect(document.body.textContent).not.toContain('ignore_failed_by_test'))
      expect(await alertText()).toMatch(/JSON|Unexpected|invalid/i)
      expect(registry.reviseConfiguration).not.toHaveBeenCalled()
    })

    it.each(['12.5', '-3', '0', 'abc', '1e400'])('does not send %s as a manual model limit', async (value) => {
      render(CompatibleProviderSettingsPanel, { props: { disabled: false } })
      await fireEvent.click(await screen.findByText('First'))
      await fireEvent.update(screen.getByPlaceholderText(/Manual model ID|手动模型 ID/), 'limit-model')
      await fireEvent.update(screen.getByPlaceholderText('context length (unknown if empty)'), value)
      await fireEvent.click(screen.getByTestId('compatible-add-manual-model'))
      expect(await alertText()).toContain('compatible_manual_limit_invalid')
      expect(catalog.upsertManual).not.toHaveBeenCalled()
    })
  })
})
