import { describe, expect, it } from 'vitest'
import {
  buildCapabilityRuleSourceScopeIdV1,
  buildModelsDevSourceScopeIdV1,
  buildProviderNativeSourceScopeIdV1,
} from './sourceScopeV1'

describe('Canonical source scope V1', () => {
  it('isolates Provider Native evidence by authority, surface, endpoint, credential, revision, and category', () => {
    const base = { providerAuthorityId: 'openrouter', providerNativeSurfaceId: 'openrouter-chat-models-v1',
      endpointProfileId: 'openrouter-api-v1', credentialScopeId: 'scope-a', credentialRevision: 3 }
    const first = buildProviderNativeSourceScopeIdV1(base)
    expect(buildProviderNativeSourceScopeIdV1(base)).toBe(first)
    expect(buildProviderNativeSourceScopeIdV1({ ...base, credentialRevision: 4 })).not.toBe(first)
    expect(buildProviderNativeSourceScopeIdV1({ ...base, credentialScopeId: 'scope-b' })).not.toBe(first)
    expect(buildProviderNativeSourceScopeIdV1({ ...base, catalogCategory: 'programming' })).not.toBe(first)
  })

  it('keeps models.dev and Capability Rules in explicit independent scopes', () => {
    expect(buildModelsDevSourceScopeIdV1({ distributionId: 'models.dev-official-api',
      distributionChannel: 'https://models.dev/api.json' }))
      .not.toBe(buildCapabilityRuleSourceScopeIdV1({ ruleStoreId: 'epoch-2' }))
  })

  it('rejects unstable or invalid scope inputs', () => {
    expect(() => buildProviderNativeSourceScopeIdV1({ providerAuthorityId: 'openai',
      providerNativeSurfaceId: 'openai-models-v1', endpointProfileId: 'openai-api-v1',
      credentialScopeId: ' scope ', credentialRevision: 1 })).toThrow('GENERATION_V2_CANONICAL_SOURCE_SCOPE_INVALID')
  })
})
