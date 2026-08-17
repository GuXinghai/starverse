import { describe, expect, it } from 'vitest'
import { createOpenAIChatCompatibleProviderBindingV2 } from './verifiedContractV2'
import { composeOpenAIChatCompatibleBaselineCapabilityV2 } from './runtimeCapabilityV2'

const provider = Object.freeze({ providerInstanceId: 'ocp_provider_12345678', protocolContractId: 'openai_chat_compatible' as const,
  displayName: 'Compatible', status: 'active' as const, createdAtMs: 1, updatedAtMs: 1, deletedAtMs: null, endpointRevisions: [] })
const endpoint = Object.freeze({ endpointRevisionId: 'ocp_endpoint_12345678', providerInstanceId: provider.providerInstanceId, revision: 1,
  baseUrl: 'https://example.test', securityPolicy: 'strict_ssrf' as const, auth: { mode: 'none' }, ordinaryHeaders: [], query: [],
  requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1, responseProfileId: 'ocp_response_profile_12345678',
  responseProfileVersion: 1, endpointDigest: 'a'.repeat(64), createdAtMs: 1 })

describe('OpenAI-compatible baseline capability V2', () => {
  it('advertises only fixed codec fields and explicit reasoning mapping sources', () => {
    const binding = createOpenAIChatCompatibleProviderBindingV2({ provider, endpoint,
      credentialScopeId: `credential-scope-v2:${'b'.repeat(64)}`, modelId: 'model-x' })
    const capability = composeOpenAIChatCompatibleBaselineCapabilityV2({ binding, resolvedAt: '2026-07-20T00:00:00.000Z', credentialRevision: 1,
      mappedReasoningSourceFields: ['reasoning_enabled', 'reasoning_effort'] })
    expect(capability.fields.find((field) => field.path === 'generation.temperature')).toMatchObject({ state: 'supported' })
    expect(capability.fields.find((field) => field.path === 'reasoning.mode')).toMatchObject({ state: 'supported' })
    expect(capability.fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({ state: 'supported' })
    expect(capability.fields.find((field) => field.path === 'reasoning.summary')).toMatchObject({ state: 'missing' })
    expect(capability.fields.find((field) => field.path === 'tools.mode')).toMatchObject({ state: 'supported', domain: { values: ['disabled'] } })
  })

  it('changes the base revision when the credential revision changes', () => {
    const binding = createOpenAIChatCompatibleProviderBindingV2({ provider, endpoint,
      credentialScopeId: `credential-scope-v2:${'b'.repeat(64)}`, modelId: 'model-x' })
    const first = composeOpenAIChatCompatibleBaselineCapabilityV2({ binding, resolvedAt: '2026-07-20T00:00:00.000Z',
      credentialRevision: 1, mappedReasoningSourceFields: ['reasoning_enabled', 'reasoning_effort'] })
    const second = composeOpenAIChatCompatibleBaselineCapabilityV2({ binding, resolvedAt: '2026-07-20T00:00:00.000Z',
      credentialRevision: 2, mappedReasoningSourceFields: ['reasoning_enabled', 'reasoning_effort'] })
    expect(first.fields).toEqual(second.fields)
    expect(first.revision.value).not.toBe(second.revision.value)
  })
})
