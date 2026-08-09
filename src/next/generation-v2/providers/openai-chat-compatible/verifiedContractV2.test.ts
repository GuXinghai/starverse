import { describe, expect, it } from 'vitest'
import {
  createOpenAIChatCompatibleProviderBindingV2,
  readOpenAIChatCompatibleChatEndpointV2,
  readOpenAIChatCompatibleModelsEndpointV2,
} from './verifiedContractV2'

const endpoint = {
  endpointRevisionId: 'endpoint-revision:1', providerInstanceId: 'provider:1', revision: 1,
  baseUrl: 'https://compatible.example/api/', securityPolicy: 'strict_ssrf' as const,
  auth: { mode: 'bearer', credentialVersionRef: 'credential:1' }, ordinaryHeaders: [], query: [],
  requestProfileId: 'request-profile:1', requestProfileVersion: 1,
  responseProfileId: 'response-profile:1', responseProfileVersion: 1,
  endpointDigest: 'a'.repeat(64), createdAtMs: 1,
}
const provider = {
  providerInstanceId: 'provider:1', protocolContractId: 'openai_chat_compatible' as const, displayName: 'Compatible', status: 'active' as const,
  createdAtMs: 1, updatedAtMs: 1, deletedAtMs: null, endpointRevisions: [endpoint],
}

describe('OpenAI-compatible V2 verified contract', () => {
  it('uses only the fixed Chat Completions and Models paths', () => {
    expect(readOpenAIChatCompatibleChatEndpointV2(endpoint)).toBe('https://compatible.example/v1/chat/completions')
    expect(readOpenAIChatCompatibleModelsEndpointV2(endpoint)).toBe('https://compatible.example/v1/models')
  })

  it('carries only the persisted public query entries onto both fixed operation URLs', () => {
    const queried = { ...endpoint, query: [{ name: 'tenant', value: 'alpha' }, { name: 'version', value: '2' }] }
    expect(readOpenAIChatCompatibleChatEndpointV2(queried)).toBe('https://compatible.example/v1/chat/completions?tenant=alpha&version=2')
    expect(readOpenAIChatCompatibleModelsEndpointV2(queried)).toBe('https://compatible.example/v1/models?tenant=alpha&version=2')
  })

  it('pins the user-owned endpoint revision under the dedicated protocol identity', () => {
    const binding = createOpenAIChatCompatibleProviderBindingV2({ provider, endpoint,
      credentialScopeId: 'credential-scope:1', modelId: 'model:1' })
    expect(binding).toMatchObject({ providerId: { value: 'openai_compatible' },
      protocolContractId: { value: 'openai_chat_compatible' }, endpointProfileId: { value: 'provider:1' },
      endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: { value: 'endpoint-revision:1' } } })
  })
})
