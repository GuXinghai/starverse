import { describe, expect, it, vi } from 'vitest'
import { createCompatibleRequestRegistry } from '../net/compatibleRequestRegistry'
import { createCompatibleChatRuntimeService } from './compatibleChatRuntimeService'

const route = {
  routeProvenanceId: 'ocp_route_12345678', requestId: 'ocp_request_12345678', requestMessageId: 'q1',
  protocolKey: 'openai_chat_compatible', providerInstanceId: 'ocp_provider_12345678', modelId: 'shared-model',
  endpointRevisionId: 'ocp_endpoint_exact123', credentialVersionRef: 'ocp_credential_exact1',
  requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 2,
  responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 3,
  reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 4,
  reasoningMode: 'custom_only', inlinePolicyId: 'ocp_inline_policy_12345678', inlinePolicyVersion: 5,
  state: 'prepared', createdAtMs: 1, updatedAtMs: 1, terminalAtMs: null,
} as const

const prepared = {
  route,
  choice: { routeProvenanceId: route.routeProvenanceId, choiceIndex: 0, messageId: 'a1', createdAtMs: 1 },
  convoId: 'c1', branchId: 'b1', questionId: 'q1', questionSeq: 1, assistantId: 'a1', assistantSeq: 2,
  availability: { available: true, code: 'ready' },
} as const

const selectedPins = {
  providerInstanceId: route.providerInstanceId, modelId: route.modelId, endpointRevisionId: route.endpointRevisionId,
  credentialVersionRef: route.credentialVersionRef, requestProfileId: route.requestProfileId, requestProfileVersion: route.requestProfileVersion,
  responseProfileId: route.responseProfileId, responseProfileVersion: route.responseProfileVersion,
  reasoningMappingId: route.reasoningMappingId, reasoningMappingVersion: route.reasoningMappingVersion,
  inlinePolicyId: route.inlinePolicyId, inlinePolicyVersion: route.inlinePolicyVersion,
} as const

function fixture(response = new Response(JSON.stringify({
  id: 'response-id', object: 'chat.completion', created: 1, model: 'shared-model',
  choices: [{ index: 0, message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
}), { status: 200, headers: { 'content-type': 'application/json' } })) {
  const order: string[] = []
  const endpoint = {
    endpointRevisionId: route.endpointRevisionId, providerInstanceId: route.providerInstanceId, revision: 7,
    baseUrl: 'https://exact.example/v1', allowInsecureHttp: false, securityPolicy: 'compatibility_first',
    auth: { mode: 'bearer', credentialVersionRef: route.credentialVersionRef }, credentialVersionRef: route.credentialVersionRef,
    ordinaryHeaders: [], sensitiveHeaderRefs: [], query: [], requestProfileId: route.requestProfileId,
    requestProfileVersion: 2, responseProfileId: route.responseProfileId, responseProfileVersion: 3, createdAtMs: 1,
  }
  const db = { call: vi.fn(async (method: string, params?: any) => {
    order.push(method)
    if (method === 'compatibleEndpoint.getRevision') {
      expect(params).toEqual({ endpointRevisionId: route.endpointRevisionId })
      return endpoint
    }
    if (method === 'compatibleProfile.getRequestBundle') return {
      profile: { requestProfileId: route.requestProfileId, version: 2, createdAtMs: 1, config: {
        schemaVersion: 1, standardFieldOwnership: 'builder', unsupportedFieldPolicy: 'error_before_fetch',
        defaults: {}, extraBody: { enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 },
      } },
      mappings: [],
    }
    if (method === 'compatibleProfile.getReasoningMapping') return {
      mappingId: route.reasoningMappingId, version: route.reasoningMappingVersion, mode: route.reasoningMode, createdAtMs: 1,
      config: { schemaVersion: 1, mode: route.reasoningMode, rules: [], replay: { format: 'disabled', scope: 'never' } },
    }
    if (method === 'compatibleProfile.getInlinePolicy') return {
      inlinePolicyId: route.inlinePolicyId, version: route.inlinePolicyVersion, createdAtMs: 1,
      config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] },
    }
    if (method === 'compatibleRoute.prepareChoices') return [{ choiceIndex: 0, messageId: 'a1' }]
    if (method === 'compatibleProjection.saveStreaming') return params.projection
    if (method === 'compatibleProjection.finalizeBundle') return params.choices
    if (method === 'settings.getNetworkProxySettingsStrict') return { value: { proxyMode: 'direct' } }
    throw new Error(`unexpected:${method}`)
  }) }
  const routes = {
    prepareTurn: vi.fn(async () => { order.push('prepareTurn'); return { ok: true as const, value: prepared } }),
    prepareHistoricalTurn: vi.fn(), resolveHistorical: vi.fn(),
    transition: vi.fn(async (command: any) => { order.push(`transition:${command.targetState}`); return { ...route, state: command.targetState } }),
  }
  const credentials = { has: vi.fn(() => true), readForMain: vi.fn(() => ({ mode: 'bearer' as const, token: 'not-a-real-key' })) }
  const transport = { preflight: vi.fn(async () => ({ ok: true as const })), request: vi.fn(async (request: any) => {
    order.push('fetch')
    request.resolveCredential?.()
    return { ok: true as const, response, diagnostics: {} }
  }) }
  return { order, endpoint, db, routes, credentials, transport }
}

describe('compatibleChatRuntimeService', () => {
  it('blocks strict SSRF during eligibility before route creation, body construction, credential read, or egress', async () => {
    const f = fixture()
    const strictEndpoint = { ...f.endpoint, securityPolicy: 'strict_ssrf' as const }
    f.db.call.mockImplementation((async (method: string) => {
      if (method === 'compatibleProvider.get') return { status: 'active' }
      if (method === 'compatibleEndpoint.getRevision') return strictEndpoint
      if (method === 'compatibleCredential.getDescriptor') return { providerInstanceId: route.providerInstanceId, deletedAtMs: null }
      if (method === 'compatibleProfile.getRequestBundle') return { profile: { requestProfileId: route.requestProfileId, version: 2 } }
      if (method === 'compatibleProfile.getResponse') return {
        responseProfileId: route.responseProfileId, version: 3,
        reasoningMappingId: route.reasoningMappingId, reasoningMappingVersion: 4,
        inlinePolicyId: route.inlinePolicyId, inlinePolicyVersion: 5,
      }
      if (method === 'compatibleProfile.getReasoningMapping') return { mappingId: route.reasoningMappingId, version: 4 }
      if (method === 'compatibleProfile.getInlinePolicy') return { inlinePolicyId: route.inlinePolicyId, version: 5 }
      if (method === 'settings.getNetworkProxySettingsStrict') return { value: { proxyMode: 'direct' } }
      throw new Error(`unexpected:${method}`)
    }) as any)
    f.transport.preflight.mockResolvedValueOnce({
      ok: false,
      error: { code: 'compatible_strict_ssrf_unavailable' },
    } as any)
    const service = createCompatibleChatRuntimeService({ ...f, requests: createCompatibleRequestRegistry(), nowMs: () => 10 } as any)
    await expect(service.preflight(selectedPins as any)).resolves.toEqual({
      ok: false,
      code: 'compatible_strict_ssrf_unavailable',
    })
    expect(f.routes.prepareTurn).not.toHaveBeenCalled()
    expect(f.credentials.readForMain).not.toHaveBeenCalled()
    expect(f.transport.request).not.toHaveBeenCalled()
  })

  it('persists provenance and every declared choice before exact-revision transport, then emits provider-neutral events', async () => {
    const f = fixture()
    const service = createCompatibleChatRuntimeService({ ...f, requests: createCompatibleRequestRegistry(), nowMs: () => 10 } as any)
    const events: any[] = []
    const result = await service.start({
      requestId: 'runtime-1', ownerWebContentsId: 7,
      selection: selectedPins,
      turn: { branchId: 'b1', userBody: 'hello' }, messages: [{ role: 'user', content: 'hello' }], stream: false,
    }, (event) => events.push(event))
    expect(result.route.endpointRevisionId).toBe(route.endpointRevisionId)
    expect(f.transport.request).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: f.endpoint, operation: 'chat_completions', body: expect.stringContaining('"model":"shared-model"'),
    }))
    expect(f.credentials.readForMain).toHaveBeenCalledWith(route.credentialVersionRef)
    expect(f.order.indexOf('prepareTurn')).toBeLessThan(f.order.indexOf('compatibleRoute.prepareChoices'))
    expect(f.order.indexOf('compatibleRoute.prepareChoices')).toBeLessThan(f.order.indexOf('fetch'))
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'choice_content', choiceIndex: 0, content: 'hello' }),
      expect.objectContaining({ kind: 'terminal', outcome: 'done' }),
    ]))
    expect(f.db.call).toHaveBeenCalledWith('compatibleProjection.finalizeBundle', expect.objectContaining({ status: 'completed' }))
  })

  it('fails before transport when pinned request construction is invalid', async () => {
    const f = fixture()
    f.db.call.mockImplementation((async (method: string) => {
      f.order.push(method)
      if (method === 'compatibleEndpoint.getRevision') return f.endpoint
      if (method === 'compatibleProfile.getRequestBundle') return null
      throw new Error(`unexpected:${method}`)
    }) as any)
    const service = createCompatibleChatRuntimeService({ ...f, requests: createCompatibleRequestRegistry(), nowMs: () => 10 } as any)
    await expect(service.start({
      requestId: 'runtime-2', ownerWebContentsId: 7,
      selection: selectedPins,
      turn: { branchId: 'b1', userBody: 'hello' }, messages: [{ role: 'user', content: 'hello' }], stream: false,
    }, () => undefined)).rejects.toThrow('compatible_request_profile_missing')
    expect(f.transport.request).not.toHaveBeenCalled()
    expect(f.routes.transition).toHaveBeenLastCalledWith(expect.objectContaining({ targetState: 'interrupted' }))
  })

  it('durably finalizes a typed failed projection when governed transport fails', async () => {
    const f = fixture()
    f.transport.request.mockResolvedValueOnce({
      ok: false,
      error: { code: 'compatible_strict_ssrf_unavailable', stage: 'connect', safeMessage: 'Strict SSRF protection is unavailable.', retryable: false },
    } as any)
    const service = createCompatibleChatRuntimeService({ ...f, requests: createCompatibleRequestRegistry(), nowMs: () => 10 } as any)
    const events: any[] = []
    await expect(service.start({
      requestId: 'runtime-3', ownerWebContentsId: 7,
      selection: selectedPins,
      turn: { branchId: 'b1', userBody: 'hello' }, messages: [{ role: 'user', content: 'hello' }], stream: true,
    }, (event) => events.push(event))).rejects.toMatchObject({ code: 'compatible_strict_ssrf_unavailable' })
    expect(f.db.call).toHaveBeenCalledWith('compatibleProjection.finalizeBundle', expect.objectContaining({
      status: 'failed',
      choices: [expect.objectContaining({ status: 'failed', error: expect.objectContaining({ network: expect.objectContaining({ code: 'compatible_strict_ssrf_unavailable' }) }) })],
    }))
    expect(events).toContainEqual(expect.objectContaining({ kind: 'terminal', outcome: 'error' }))
  })
})
