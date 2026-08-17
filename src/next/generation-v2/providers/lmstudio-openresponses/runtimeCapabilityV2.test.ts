import { describe, expect, it } from 'vitest'
import type { LocalEndpointProfileV2 } from '../../../../../infra/db/repo/localEndpointProfileV2Repo'
import { createLmStudioOpenResponsesProviderBindingV2 } from './verifiedContractV2'
import { composeLmStudioOpenResponsesBaselineCapabilityV2 } from './runtimeCapabilityV2'

const profile: LocalEndpointProfileV2 = Object.freeze({ endpointProfileId: 'lmstudio-openresponses:local',
  providerId: 'lmstudio', protocolContractId: 'lmstudio-openresponses', baseUrl: 'http://127.0.0.1:1234',
  credentialMode: 'none', credentialScopeId: 'local:none', protocolConfig: Object.freeze({ modelId: 'gate0-qwen3-4b' }), revisionGeneration: 1,
  profileRevision: 'profile-revision', profileDigest: 'a'.repeat(64), createdAtMs: 1, updatedAtMs: 1 })

describe('LM Studio OpenResponses verified capability', () => {
  it('advertises only smoke-backed controls and snapshot-selected tools', () => {
    const capability = composeLmStudioOpenResponsesBaselineCapabilityV2({
      binding: createLmStudioOpenResponsesProviderBindingV2(profile, 'gate0-qwen3-4b'),
      resolvedAt: '2026-07-20T00:00:00.000Z', credentialRevision: 1, selectedTools: [Object.freeze({ toolId: 'add', kind: 'function',
        function: Object.freeze({ name: 'add_numbers', parameters: Object.freeze({ type: 'object' }) }),
        sideEffectPolicy: 'none' })],
    })
    const fields = new Map(capability.fields.map((field) => [field.path, field]))
    expect(fields.get('reasoning.effort')?.domain).toEqual({ kind: 'enum', values: ['low'] })
    expect(fields.get('tools.toolChoice')?.domain).toEqual({ kind: 'enum', values: ['none', 'omitted', 'required'] })
    expect(fields.get('generation.topK')?.state).toBe('missing')
    expect(capability.tools.map((tool) => tool.toolId)).toEqual(['add'])
  })

  it('changes the base revision when the local profile credential revision changes', () => {
    const binding = createLmStudioOpenResponsesProviderBindingV2(profile, 'gate0-qwen3-4b')
    const first = composeLmStudioOpenResponsesBaselineCapabilityV2({
      binding, resolvedAt: '2026-07-20T00:00:00.000Z', credentialRevision: 1,
    })
    const second = composeLmStudioOpenResponsesBaselineCapabilityV2({
      binding, resolvedAt: '2026-07-20T00:00:00.000Z', credentialRevision: 2,
    })
    expect(first.fields).toEqual(second.fields)
    expect(first.revision.value).not.toBe(second.revision.value)
  })
})
