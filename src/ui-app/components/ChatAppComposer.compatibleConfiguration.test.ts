import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatAppComposer from './ChatAppComposer.vue'

describe('ChatAppComposer compatible configuration-only selection', () => {
  const originalRegistry = window.compatibleProviderRegistry
  const originalCatalog = window.compatibleCatalog

  afterEach(() => {
    window.compatibleProviderRegistry = originalRegistry
    window.compatibleCatalog = originalCatalog
  })

  it('carries the pinned route identities and enables the TP15 canonical send', async () => {
    window.compatibleProviderRegistry = {
      list: vi.fn(async () => ({ ok: true, value: [{
        provider: { providerInstanceId: 'ocp_provider_12345678', protocolKey: 'openai_chat_compatible', displayName: 'First', status: 'active', createdAtMs: 1, updatedAtMs: 1, deletedAtMs: null },
        endpointRevisions: [{
          endpointRevisionId: 'ocp_endpoint_12345678', providerInstanceId: 'ocp_provider_12345678', revision: 1,
          baseUrl: 'https://first.example/v1', allowInsecureHttp: false, securityPolicy: 'compatibility_first',
          credentialVersionRef: 'ocp_credential_12345678', ordinaryHeaders: [], sensitiveHeaderRefs: [], query: [],
          requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1,
          responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, createdAtMs: 1, authMode: 'bearer',
        }],
        credentials: [],
        activeConfiguration: { endpointRevisionId: 'ocp_endpoint_12345678', requestBundle: {},
          responseProfile: { reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, inlinePolicyId: 'ocp_inline_policy_12345678', inlinePolicyVersion: 1 },
          reasoningMapping: {}, inlinePolicy: {} },
      }] })),
    } as any
    window.compatibleCatalog = {
      query: vi.fn(async () => ({
        protocolKey: 'openai_chat_compatible', providerInstanceId: 'ocp_provider_12345678', providerName: 'First', providerStatus: 'active', syncState: null, total: 1,
        items: [{ providerInstanceId: 'ocp_provider_12345678', modelId: 'same-model', metadata: { schemaVersion: 1, displayName: 'Same model', contextLength: null, maxOutputTokens: null, capabilities: { text: null, vision: null, tools: null, structuredOutputs: null, reasoning: null }, pricing: { prompt: null, completion: null, request: null, image: null } }, fieldProvenance: {}, sourcePresence: { remote: false, manual: true }, conflictFields: [], staleRemote: false }],
      })),
    } as any
    const view = render(ChatAppComposer, {
      props: {
        draft: 'hello', disabled: false, isRunning: false, canSend: true, modelCatalog: [],
        sessionConfig: { model: { selectedProviderId: 'openrouter', selectedModelKey: 'openrouter/auto', compatibleSelection: null }, reasoning: { enabled: false, effort: 'medium' }, webSearch: { enabled: false, level: 'high', detail: null }, imageGeneration: { enabled: false, resolution: '1K', aspectRatio: '1:1', mode: 'default', detail: null }, generationParams: { detail: null } },
      },
    })
    await fireEvent.click(screen.getByTestId('current-model-pill'))
    const compatible = await screen.findByTestId('compatible-model-ocp_provider_12345678-same-model')
    await fireEvent.click(compatible)
    const emittedSelection = (view.emitted() as any).updateModel?.[0]?.[0]
    await view.rerender({
      sessionConfig: {
        model: { selectedProviderId: null, selectedModelKey: emittedSelection.modelId, compatibleSelection: emittedSelection },
        reasoning: { enabled: false, effort: 'medium' }, webSearch: { enabled: false, level: 'high', detail: null },
        imageGeneration: { enabled: false, resolution: '1K', aspectRatio: '1:1', mode: 'default', detail: null },
        generationParams: { detail: null },
      },
    })
    expect(await screen.findByTestId('compatible-send-selection')).toHaveTextContent('First · same-model')
    expect(screen.getByTestId('composer-send')).toBeEnabled()
    expect(emittedSelection).toMatchObject({ providerInstanceId: 'ocp_provider_12345678', modelId: 'same-model', endpointRevisionId: 'ocp_endpoint_12345678' })
    await waitFor(() => expect(window.compatibleCatalog?.query).toHaveBeenCalledWith(expect.objectContaining({ providerInstanceId: 'ocp_provider_12345678' })))
  })
})
