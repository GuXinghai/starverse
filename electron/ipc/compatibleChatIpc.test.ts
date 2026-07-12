import { describe, expect, it, vi } from 'vitest'
import { registerCompatibleChatIpc } from './compatibleChatIpc'

const selectedPins = {
  providerInstanceId: 'ocp_provider_12345678', modelId: 'model-a', endpointRevisionId: 'ocp_endpoint_12345678',
  credentialVersionRef: null, requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1,
  responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1,
  reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1,
  inlinePolicyId: 'ocp_inline_policy_12345678', inlinePolicyVersion: 1,
} as const

function setup() {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
  const registerInvoke = vi.fn((channel: string, handler: (event: unknown, payload: unknown) => unknown) => handlers.set(channel, handler))
  const service = {
    start: vi.fn(async (_command: unknown, emit: (event: unknown) => void) => {
      emit({ kind: 'choice_content', source: 'stream', sequence: 0, choiceIndex: 0, content: 'ok' })
      emit({ kind: 'extension', source: 'stream', sequence: 1, candidate: { sourcePath: ['secret_field'], value: 'must-not-cross-ipc' } })
      return { route: { routeProvenanceId: 'ocp_route_12345678' } }
    }),
    abort: vi.fn(() => true), abortOwner: vi.fn(() => 1), abortAll: vi.fn(),
    resolveHistorical: vi.fn(async () => ({ ok: true, value: { route: {
      routeProvenanceId: 'ocp_route_12345678', protocolKey: 'openai_chat_compatible', providerInstanceId: 'ocp_provider_12345678', modelId: 'model-a',
      credentialVersionRef: 'ocp_credential_must_not_cross', endpointRevisionId: 'ocp_endpoint_must_not_cross',
    } } })),
  }
  registerCompatibleChatIpc({ registerInvoke: registerInvoke as any, service: service as any })
  const sender = { id: 9, send: vi.fn(), isDestroyed: () => false, once: vi.fn(), removeListener: vi.fn() }
  return { handlers, service, sender }
}

describe('compatibleChatIpc', () => {
  it('binds start to sender ownership and never forwards raw extension values', async () => {
    const { handlers, service, sender } = setup()
    const result = await handlers.get('compatible-chat:start')!({ sender }, {
      requestId: 'request-1', selection: selectedPins,
      turn: { branchId: 'branch-1', userBody: 'hello' }, messages: [{ role: 'user', content: 'hello' }], stream: true,
    })
    expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ ownerWebContentsId: 9 }), expect.any(Function), expect.any(Function))
    expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ selection: selectedPins }), expect.any(Function), expect.any(Function))
    expect(result).toMatchObject({ requestId: 'request-1', ok: true })
    const serialized = JSON.stringify(sender.send.mock.calls)
    expect(serialized).not.toContain('must-not-cross-ipc')
    expect(serialized).toContain('extension_observed')
    expect(sender.once).toHaveBeenCalledWith('destroyed', expect.any(Function))
    expect(sender.removeListener).toHaveBeenCalledWith('destroyed', expect.any(Function))
  })

  it('allows only the owning sender to request abort through the service boundary', async () => {
    const { handlers, service, sender } = setup()
    expect(handlers.get('compatible-chat:abort')!({ sender }, { requestId: 'request-1' })).toEqual({ aborted: true })
    expect(service.abort).toHaveBeenCalledWith('request-1', 9)
  })

  it('probes historical compatible identity without exposing endpoint or credential pins', async () => {
    const { handlers, sender } = setup()
    const result = await handlers.get('compatible-chat:resolve-historical')!({ sender }, { kind: 'choice_message', messageId: 'assistant-1' })
    expect(result).toEqual({ ok: true, route: { routeProvenanceId: 'ocp_route_12345678', protocolKey: 'openai_chat_compatible', providerInstanceId: 'ocp_provider_12345678', modelId: 'model-a' } })
    expect(JSON.stringify(result)).not.toContain('credential')
    expect(JSON.stringify(result)).not.toContain('endpoint')
  })

  it('accepts minimal source identity only for historical sends and rejects it for new sends', async () => {
    const { handlers, service, sender } = setup()
    const minimal = { providerInstanceId: selectedPins.providerInstanceId, modelId: selectedPins.modelId }
    await expect(handlers.get('compatible-chat:start')!({ sender }, {
      requestId: 'request-history', selection: minimal,
      turn: { branchId: 'branch-1', userBody: 'hello' }, messages: [{ role: 'user', content: 'hello' }], stream: true,
      existingHistoricalTurn: {
        sourceRouteProvenanceId: 'ocp_route_12345678', branchId: 'branch-1', questionId: 'question-1', assistantId: 'assistant-1',
      },
    })).resolves.toMatchObject({ ok: true })
    expect(service.start).toHaveBeenLastCalledWith(expect.objectContaining({
      selection: minimal,
      existingHistoricalTurn: expect.objectContaining({ sourceRouteProvenanceId: 'ocp_route_12345678' }),
    }), expect.any(Function), expect.any(Function))

    await expect(handlers.get('compatible-chat:start')!({ sender }, {
      requestId: 'request-new-invalid', selection: minimal,
      turn: { branchId: 'branch-1', userBody: 'hello' }, messages: [{ role: 'user', content: 'hello' }], stream: true,
    })).rejects.toThrow(/exact selected pins/i)

    await expect(handlers.get('compatible-chat:start')!({ sender }, {
      requestId: 'request-history-invalid', selection: selectedPins,
      turn: { branchId: 'branch-1', userBody: 'hello' }, messages: [{ role: 'user', content: 'hello' }], stream: true,
      existingHistoricalTurn: {
        sourceRouteProvenanceId: 'ocp_route_12345678', branchId: 'branch-1', questionId: 'question-1', assistantId: 'assistant-1',
      },
    })).rejects.toThrow(/only source identity/i)
  })
})
