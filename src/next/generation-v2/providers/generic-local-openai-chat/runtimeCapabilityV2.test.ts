import { describe, expect, it } from 'vitest'
import type { LocalEndpointProfileV2 } from '../../../../../infra/db/repo/localEndpointProfileV2Repo'
import { createGenericLocalOpenAIChatProviderBindingV2 } from './verifiedContractV2'
import { composeGenericLocalOpenAIChatBaselineCapabilityV2 } from './runtimeCapabilityV2'

const profile: LocalEndpointProfileV2 = Object.freeze({
  endpointProfileId: 'generic-local-openai-chat:local', providerId: 'generic_local',
  protocolContractId: 'generic-local-openai-chat-completions', baseUrl: 'http://127.0.0.1:8080',
  credentialMode: 'none', credentialScopeId: 'local:none',
  protocolConfig: Object.freeze({ modelId: 'local-model' }), revisionGeneration: 1,
  profileRevision: 'profile-revision', profileDigest: 'a'.repeat(64), createdAtMs: 1, updatedAtMs: 1,
})

describe('Generic Local OpenAI Chat capability revision', () => {
  it('changes only the base revision when the local profile credential revision changes', () => {
    const binding = createGenericLocalOpenAIChatProviderBindingV2(profile, 'local-model')
    const first = composeGenericLocalOpenAIChatBaselineCapabilityV2({
      binding, resolvedAt: '2026-07-20T00:00:00.000Z', credentialRevision: 1,
    })
    const second = composeGenericLocalOpenAIChatBaselineCapabilityV2({
      binding, resolvedAt: '2026-07-20T00:00:00.000Z', credentialRevision: 2,
    })
    expect(first.fields).toEqual(second.fields)
    expect(first.revision.value).not.toBe(second.revision.value)
  })
})
