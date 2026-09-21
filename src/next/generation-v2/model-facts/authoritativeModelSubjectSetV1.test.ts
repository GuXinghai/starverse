import { describe, expect, it } from 'vitest'
import { buildAuthoritativeModelSubjectSetV1 } from './authoritativeModelSubjectSetV1'

const subject = (providerAuthorityId: string, endpointProfileId: string, nativeModelId: string) =>
  Object.freeze({ providerAuthorityId, endpointProfileId, nativeModelId })

const proof = (scopeId: string) => Object.freeze({ kind: 'provider_native_catalog' as const,
  providerKey: 'openai_responses', scopeId, credentialScopeId: 'credential-scope-v2:test', credentialRevision: 1,
  endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', catalogCategory: '',
  activeSnapshotDigest: 'a'.repeat(64) })

describe('Authoritative Model Subject Set V1', () => {
  it('deduplicates exact triples, preserves proofs and is deterministic across input order', () => {
    const candidates = [
      { subject: subject('openai', 'openai-api-v1', 'same-model'), proof: proof('scope:b') },
      { subject: subject('openai', 'openai-api-v1', 'same-model'), proof: proof('scope:a') },
      { subject: subject('openrouter', 'openrouter-first-party-v1', 'same-model'), proof: {
        ...proof('scope:c'), providerKey: 'openrouter', endpointProfileId: 'openrouter-first-party-v1',
        operationContractId: 'openrouter-chat-models-v1',
      } },
    ]
    const first = buildAuthoritativeModelSubjectSetV1(candidates)
    const second = buildAuthoritativeModelSubjectSetV1([...candidates].reverse())
    expect(first).toEqual(second)
    expect(first.records).toHaveLength(2)
    expect(first.records.find((record) => record.subject.providerAuthorityId === 'openai')?.proofs)
      .toHaveLength(2)
  })

  it('keeps membership revision independent from authority proof revisions', () => {
    const base = [{ subject: subject('openai', 'openai-api-v1', 'gpt-test'), proof: proof('scope:a') }]
    const first = buildAuthoritativeModelSubjectSetV1(base)
    const second = buildAuthoritativeModelSubjectSetV1([{ ...base[0]!, proof: {
      ...proof('scope:a'), activeSnapshotDigest: 'b'.repeat(64), credentialRevision: 2,
    } }])
    expect(second.subjectSetRevision).toBe(first.subjectSetRevision)
    expect(second.authorityInputRevision).not.toBe(first.authorityInputRevision)
  })

  it('isolates provider authority, endpoint profile and exact native model identity', () => {
    const result = buildAuthoritativeModelSubjectSetV1([
      { subject: subject('authority:a', 'profile:a', 'model'), proof: proof('scope:a') },
      { subject: subject('authority:a', 'profile:b', 'model'), proof: proof('scope:b') },
      { subject: subject('authority:b', 'profile:a', 'model'), proof: proof('scope:c') },
    ])
    expect(result.records.map((record) => record.subject)).toHaveLength(3)
  })
})
