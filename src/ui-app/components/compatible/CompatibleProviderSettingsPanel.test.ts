import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompatibleProviderSettingsPanel from './CompatibleProviderSettingsPanel.vue'

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
    const rows = [details(firstId, 'First', 'https://first.example/v1'), details(secondId, 'Second', 'https://second.example/v1')]
    registry = {
      list: vi.fn(async () => ({ ok: true, value: rows })),
      create: vi.fn(async () => ({ ok: true, value: rows[0] })),
      update: vi.fn(async () => ({ ok: true, value: rows[0] })),
      updateEndpoint: vi.fn(async () => ({ ok: true, value: rows[0] })),
      reviseConfiguration: vi.fn(async () => ({ ok: true, value: rows[0] })),
      listDiscovery: vi.fn(async () => ({ ok: true, value: [] })),
      ignoreDiscovery: vi.fn(async () => ({ ok: true, value: [] })),
      rotateCredential: vi.fn(async () => ({ ok: true, value: rows[0] })),
      deleteProvider: vi.fn(async () => ({ ok: true, value: rows[0] })),
    }
    catalog = {
      query: vi.fn(async ({ providerInstanceId }) => ({
        protocolKey: 'openai_chat_compatible', providerInstanceId,
        providerName: providerInstanceId === firstId ? 'First' : 'Second', providerStatus: 'active', syncState: null, total: 0, items: [],
      })),
      sync: vi.fn(), abortSync: vi.fn(), getStatus: vi.fn(), upsertManual: vi.fn(), deleteManual: vi.fn(),
    }
    Object.assign(window, { compatibleProviderRegistry: registry, compatibleCatalog: catalog })
    Object.assign(window, { compatibleProviderTransport: { testConnection: vi.fn(async (input: any) => ({ ok: true, requestId: input.requestId, providerInstanceId: input.providerInstanceId, endpointRevisionId: 'ocp_endpoint_12345678', operation: 'connection_test', securityPolicy: 'compatibility_first', proxyRoute: 'system', transportKind: 'electron_session', status: 200, durationMs: 1, warnings: [], diagnostics: {} })), abortConnectionTest: vi.fn() } })
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
    await waitFor(() => expect(window.compatibleProviderTransport?.testConnection).toHaveBeenCalledWith(expect.objectContaining({ providerInstanceId: secondId })))
    await fireEvent.click(screen.getByText(/Sync \/models|同步 \/models/))
    await waitFor(() => expect(catalog.sync).toHaveBeenCalledWith(expect.objectContaining({ providerInstanceId: secondId, force: true })))
  })

  it('treats credentials as write-only and clears the secret after create', async () => {
    registry.list.mockResolvedValueOnce({ ok: true, value: [] }).mockResolvedValueOnce({ ok: true, value: [details(firstId, 'First', 'https://first.example/v1')] })
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
    expect(registry.updateEndpoint.mock.calls[0]![0]).toMatchObject({ providerInstanceId: firstId, clearAuthentication: true })
    expect(registry.rotateCredential).not.toHaveBeenCalled()
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
    registry.list.mockResolvedValue({ ok: true, value: [configured] })
    registry.reviseConfiguration.mockResolvedValue({ ok: true, value: configured })
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
    registry.list.mockResolvedValue({ ok: true, value: [configured] })
    registry.reviseConfiguration.mockResolvedValue({ ok: true, value: configured })
    registry.listDiscovery.mockResolvedValue({ ok: true, value: [{
      providerInstanceId: firstId, responseProfileId: 'ocp_response_profile_12345678', profileVersion: 1,
      streamPath: 'choices.*.delta.thought_process', state: 'candidate',
      aggregate: { schemaVersion: 1, observedShapes: ['string'], redactedPreview: null, sampleCount: 2 },
      occurrenceCount: 2, firstObservedAtMs: 1, lastObservedAtMs: 2,
    }] })
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
})
