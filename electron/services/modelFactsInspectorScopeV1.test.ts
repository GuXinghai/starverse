import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { decodeProviderBindingRecordV2 } from '../../src/core/generation-v2/domain/providerBindingV2'
import { buildAuthoritativeModelSubjectSetV1 } from '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { buildInspectorSourceScopeSelectionV1 } from './modelFactsInspectorScopeV1'
import { buildGoal3ModelFactsSubjectV1, buildGoal3SourceScopeSelectionV1 } from './goal3ModelFactsCapabilityV1'

function binding(overrides: Record<string, unknown> = {}) {
  return decodeProviderBindingRecordV2({ credentialScopeId: 'credential-scope:test', providerId: 'openai_responses',
    endpointProfileId: 'openai-api-v1', endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint-set:test',
      descriptors: [{ endpointId: 'responses', descriptorRevision: 'descriptor:test' }] },
    protocolContractId: 'openai-responses-v1', contractRevision: `openai-responses-v1:${'a'.repeat(64)}`,
    contractDefinitionDigest: 'a'.repeat(64), registryRevision: `provider-contract-registry-v1:${'b'.repeat(64)}`,
    modelId: 'gpt-test', operation: 'text', ...overrides })
}

function database() {
  const db = new Database(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

describe('Inspector server authority scope parity', () => {
  it('matches Goal3 native scopes including credential rotation and omitted empty catalog category', () => {
    const db = database()
    try {
      const native = binding()
      const proof = { kind: 'provider_native_catalog' as const, providerKey: 'openai_responses', scopeId: 'catalog:one',
        credentialScopeId: native.credentialScopeId.value, credentialRevision: 1, endpointProfileId: native.endpointProfileId.value,
        operationContractId: 'openai-models-v1', catalogCategory: '', activeSnapshotDigest: 'a'.repeat(64) }
      const first = buildAuthoritativeModelSubjectSetV1([{ subject: buildGoal3ModelFactsSubjectV1(native), proof }]).records[0]!
      const rotated = buildAuthoritativeModelSubjectSetV1([{ subject: first.subject, proof: { ...proof, credentialRevision: 2 } }]).records[0]!
      expect(buildInspectorSourceScopeSelectionV1(db, first)).toEqual(buildGoal3SourceScopeSelectionV1({ binding: native, credentialRevision: 1 }))
      expect(buildInspectorSourceScopeSelectionV1(db, rotated)).toEqual(buildGoal3SourceScopeSelectionV1({ binding: native, credentialRevision: 2 }))
      expect(buildInspectorSourceScopeSelectionV1(db, first).providerNative).not.toBe(buildInspectorSourceScopeSelectionV1(db, rotated).providerNative)
      expect(() => buildInspectorSourceScopeSelectionV1(db, { ...first, subject: { ...first.subject, endpointProfileId: 'other' } }))
        .toThrow('GENERATION_V2_MODEL_FACTS_INSPECTOR_AUTHORITY_INVALID')
      expect(() => buildInspectorSourceScopeSelectionV1(db, { ...first, proofs: [proof, { ...proof, credentialRevision: 2 }] }))
        .toThrow('GENERATION_V2_MODEL_FACTS_INSPECTOR_AUTHORITY_INVALID')
    } finally { db.close() }
  })

  it('uses the exact persisted local profile and refuses a stale profile revision', () => {
    const db = database()
    try {
      const profile = new LocalEndpointProfileV2Repo(db).create({ endpointProfileId: 'profile:local', providerId: 'ollama',
        protocolContractId: 'ollama-chat-v1', baseUrl: 'http://127.0.0.1:11434',
        protocolConfig: { modelId: 'qwen-test', thinkingControl: 'boolean', tools: false } })
      const local = binding({ providerId: profile.providerId, endpointProfileId: profile.endpointProfileId,
        credentialScopeId: profile.credentialScopeId, modelId: 'qwen-test' })
      const proof = { kind: 'local_profile_binding' as const, endpointProfileId: profile.endpointProfileId,
        providerId: profile.providerId, protocolContractId: profile.protocolContractId, profileRevision: profile.profileRevision }
      const record = buildAuthoritativeModelSubjectSetV1([{ subject: buildGoal3ModelFactsSubjectV1(local), proof }]).records[0]!
      expect(buildInspectorSourceScopeSelectionV1(db, record)).toEqual(buildGoal3SourceScopeSelectionV1({ binding: local, credentialRevision: profile.revisionGeneration }))
      expect(() => buildInspectorSourceScopeSelectionV1(db, { ...record, proofs: [{ ...proof, profileRevision: 'local-profile-v2:stale' }] }))
        .toThrow('GENERATION_V2_MODEL_FACTS_INSPECTOR_AUTHORITY_INVALID')
    } finally { db.close() }
  })

  it('maps compatible manual and remote proofs to the same unconfigured scopes without borrowed credentials', () => {
    const db = database()
    try {
      const compatible = binding({ providerId: 'openai_compatible', endpointProfileId: 'instance:test' })
      const subject = buildGoal3ModelFactsSubjectV1(compatible)
      const manual = { kind: 'compatible_model_binding' as const, providerInstanceId: 'instance:test',
        endpointRevisionId: 'endpoint:one', endpointDigest: 'a'.repeat(64), source: 'manual' as const }
      const remote = { ...manual, source: 'remote_sync' as const, credentialScopeId: 'synthetic:remote',
        credentialRevision: 7, acquisitionSnapshotDigest: 'b'.repeat(64) }
      const record = buildAuthoritativeModelSubjectSetV1([{ subject, proof: manual }, { subject, proof: remote }]).records[0]!
      expect(buildInspectorSourceScopeSelectionV1(db, record)).toEqual(buildGoal3SourceScopeSelectionV1({ binding: compatible, credentialRevision: 99 }))
      expect(() => buildInspectorSourceScopeSelectionV1(db, { ...record, subject: { ...subject, providerAuthorityId: 'openai' } }))
        .toThrow('GENERATION_V2_MODEL_FACTS_INSPECTOR_AUTHORITY_INVALID')
    } finally { db.close() }
  })
})
