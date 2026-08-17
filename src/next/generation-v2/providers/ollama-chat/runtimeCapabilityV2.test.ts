import { describe, expect, it } from 'vitest'
import type { LocalEndpointProfileV2 } from '../../../../../infra/db/repo/localEndpointProfileV2Repo'
import { createOllamaChatProviderBindingV2 } from './verifiedContractV2'
import { composeOllamaChatCapabilityV2 } from './runtimeCapabilityV2'

const profile: LocalEndpointProfileV2 = Object.freeze({
  endpointProfileId: 'ollama-chat:local', providerId: 'ollama', protocolContractId: 'ollama-chat-v1',
  baseUrl: 'http://127.0.0.1:11434', credentialMode: 'none', credentialScopeId: 'local:none',
  protocolConfig: Object.freeze({ modelId: 'llama3.2', thinkingControl: 'effort' as const }),
  revisionGeneration: 1, profileRevision: 'profile-revision', profileDigest: 'b'.repeat(64),
  createdAtMs: 1, updatedAtMs: 1,
})

describe('Ollama Chat capability revision', () => {
  it('changes only the base revision when the local profile credential revision changes', () => {
    const binding = createOllamaChatProviderBindingV2(profile, 'llama3.2')
    const first = composeOllamaChatCapabilityV2({
      binding, profile, resolvedAt: '2026-07-20T00:00:00.000Z', credentialRevision: 1,
    })
    const second = composeOllamaChatCapabilityV2({
      binding, profile, resolvedAt: '2026-07-20T00:00:00.000Z', credentialRevision: 2,
    })
    expect(first.fields).toEqual(second.fields)
    expect(first.revision.value).not.toBe(second.revision.value)
  })
})
