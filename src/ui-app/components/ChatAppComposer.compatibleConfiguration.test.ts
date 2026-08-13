import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installGenerationV2TestBridge } from '../../../tests/helpers/generationV2Bridge'
import { registerCatalogModelSelectionCommandV2 } from '@/next/modelCatalog/catalogRuntimeStoreV2'
import ChatAppComposer from './ChatAppComposer.vue'

describe('ChatAppComposer compatible current-intent selection', () => {
  const originalGenerationV2 = window.generationV2

  beforeEach(() => {
    installGenerationV2TestBridge()
  })

  afterEach(() => {
    window.generationV2 = originalGenerationV2
  })

  it('persists only current intent and derives the current provider display name', async () => {
    const queryModels = vi.fn(async () => ({ ok: true, value: {
      protocolKey: 'openai_chat_compatible', providerInstanceId: 'ocp_provider_12345678', providerName: 'First', providerStatus: 'active', syncState: null, total: 1,
      items: [{ providerInstanceId: 'ocp_provider_12345678', modelId: 'same-model', metadata: { schemaVersion: 1, displayName: 'Same model', contextLength: null, maxOutputTokens: null, capabilities: { text: null, vision: null, tools: null, structuredOutputs: null, reasoning: null }, pricing: { prompt: null, completion: null, request: null, image: null } }, fieldProvenance: {}, sourcePresence: { remote: false, manual: true }, conflictFields: [], staleRemote: false }],
    } }))
    const activeConfiguration = {
      requestProfile: { configId: 'ocp_request_profile_12345678', version: 1, payload: {} },
      requestMappings: [],
      reasoningMapping: { configId: 'ocp_reasoning_mapping_12345678', version: 1, payload: {} },
      inlinePolicy: { configId: 'ocp_inline_policy_12345678', version: 1, payload: {} },
      responseProfile: { configId: 'ocp_response_profile_12345678', version: 1, payload: {
        reasoningMapping: { mappingId: 'ocp_reasoning_mapping_12345678', version: 1 },
        inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1 },
      } },
    }
    const details = {
      providerInstanceId: 'ocp_provider_12345678', displayName: 'First', status: 'active', createdAtMs: 1, updatedAtMs: 1, deletedAtMs: null,
      endpointRevisions: [{ endpointRevisionId: 'ocp_endpoint_12345678', providerInstanceId: 'ocp_provider_12345678', revision: 1,
        baseUrl: 'https://first.example/v1', securityPolicy: 'compatibility_first', ordinaryHeaders: [], query: [],
        requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1,
        responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, createdAtMs: 1,
        auth: { mode: 'none', credentialVersionRef: null } }],
    }
    window.generationV2 = {
      ...((globalThis as any).generationV2 ?? originalGenerationV2 ?? {}),
      openAICompatible: {
        list: vi.fn(async () => ({ ok: true, value: [{ providerInstanceId: 'ocp_provider_12345678' }] })),
        get: vi.fn(async () => ({ ok: true, value: { details, activeConfiguration } })),
        queryModels,
      },
    } as any
    let committedSelection: unknown = null
    const view = render(ChatAppComposer, {
      global: {
        plugins: [{
          install(app: object) {
            registerCatalogModelSelectionCommandV2(app, async (selection) => { committedSelection = selection })
          },
        }],
      },
      props: {
        draft: 'hello', disabled: false, isRunning: false, canSend: true, modelCatalog: [],
        sessionConfig: { routeSelection: { schemaVersion: 1, kind: 'provider_model', providerId: 'openrouter', modelId: 'openrouter/auto' }, reasoning: { enabled: false, effort: 'medium' }, webSearch: { enabled: false, level: 'high', detail: null }, imageGeneration: { enabled: false, resolution: '1K', aspectRatio: '1:1', mode: 'default', detail: null }, generationParams: { detail: null } },
      },
    })
    await fireEvent.click(screen.getByTestId('current-model-pill'))
    const compatible = await screen.findByTestId('compatible-model-ocp_provider_12345678-same-model')
    await fireEvent.click(compatible)
    const routeSelection = committedSelection as any
    await view.rerender({
      sessionConfig: {
        routeSelection,
        reasoning: { enabled: false, effort: 'medium' }, webSearch: { enabled: false, level: 'high', detail: null },
        imageGeneration: { enabled: false, resolution: '1K', aspectRatio: '1:1', mode: 'default', detail: null },
        generationParams: { detail: null },
      },
    })
    expect(await screen.findByTestId('compatible-send-selection')).toHaveTextContent('First · same-model')
    expect(screen.getByTestId('composer-send')).toBeEnabled()
    expect(routeSelection).toEqual({ schemaVersion: 2, kind: 'openai_chat_compatible',
      providerInstanceId: 'ocp_provider_12345678', modelId: 'same-model' })
    await waitFor(() => expect(queryModels).toHaveBeenCalledWith(expect.objectContaining({ providerInstanceId: 'ocp_provider_12345678' })))
  })
})
