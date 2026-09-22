import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
} from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { resolvedCapabilityFromRuntimeSnapshotV2 } from '../../src/next/generation-v2/capability/resolvedCapabilityV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../src/next/generation-v2/capability/modelCapabilitySchemaV2'
import { decodeProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import { buildGoal3ModelFactsSubjectV1, buildGoal3SourceScopeSelectionV1 } from './goal3ModelFactsCapabilityV1'
import { createGoal3RuntimeSnapshotV1 } from './goal3SnapshotCutoverV1'

function binding(overrides: Record<string, unknown> = {}) {
  return decodeProviderBindingRecordV2({
    credentialScopeId: 'credential-scope:test', providerId: 'openai_responses',
    endpointProfileId: 'openai-api-v1',
    endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint-set:test',
      descriptors: [{ endpointId: 'responses', descriptorRevision: 'descriptor:test' }] },
    protocolContractId: 'openai-responses-v1', contractRevision: `openai-responses-v1:${'a'.repeat(64)}`,
    contractDefinitionDigest: 'a'.repeat(64), registryRevision: `provider-contract-registry-v1:${'b'.repeat(64)}`,
    modelId: 'gpt-5.4', operation: 'text', ...overrides,
  })
}

function legacyRuntimeSnapshot() {
  const record = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2,
    resolvedAt: '2026-09-22T00:00:00.000Z',
    binding: {
      credentialScopeId: 'credential-scope:test', providerId: 'openai_responses', endpointProfileId: 'openai-api-v1',
      endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint-set:test',
        descriptors: [{ endpointId: 'responses', descriptorRevision: 'descriptor:test' }] },
      protocolContractId: 'openai-responses-v1', contractRevision: `openai-responses-v1:${'a'.repeat(64)}`,
      contractDefinitionDigest: 'a'.repeat(64), registryRevision: `provider-contract-registry-v1:${'b'.repeat(64)}`,
      modelId: 'gpt-5.4', operation: 'text',
    },
    evidence: [{ evidenceId: 'contract.openai.responses.v1', kind: 'contract_invariant', effect: 'supports',
      sourceRef: 'contract:openai-responses-v1', verifiedAt: '2026-09-22T00:00:00.000Z', contentDigest: 'c'.repeat(64) }],
    fields: [...MODEL_CAPABILITY_SEMANTIC_PATHS_V2].map((path) => ({ path, state: 'missing', constraints: [], evidenceIds: [] })),
    tools: [], continuation: { kind: 'none', evidenceIds: ['contract.openai.responses.v1'] },
  })
  return decodeRuntimeCapabilitySnapshotV2(record)
}

describe('Goal 3 binding-scoped model facts authority', () => {
  it('binds Provider Native scope to credential revision and exact endpoint', () => {
    const first = buildGoal3SourceScopeSelectionV1({ binding: binding(), credentialRevision: 1 })
    const second = buildGoal3SourceScopeSelectionV1({ binding: binding(), credentialRevision: 2 })
    expect(first.providerNative).not.toBe(second.providerNative)
    expect(buildGoal3ModelFactsSubjectV1(binding()).endpointProfileId).toBe('openai-api-v1')
    expect(() => buildGoal3ModelFactsSubjectV1(binding({ endpointProfileId: 'other-endpoint-v1' })))
      .toThrow('GENERATION_V2_PROVIDER_AUTHORITY_UNMAPPED')
  })

  it('uses scoped compatible authorities and does not pretend they have an official models.dev key', () => {
    const compatible = binding({ providerId: 'openai_compatible', endpointProfileId: 'instance:test' })
    const scope = buildGoal3SourceScopeSelectionV1({ binding: compatible, credentialRevision: 7 })
    expect(buildGoal3ModelFactsSubjectV1(compatible).providerAuthorityId)
      .toBe('openai-compatible-provider-instance-v1:instance:test')
    expect(scope.modelsDev).toMatch(/^canonical-source-scope-v1:[a-f0-9]{64}$/u)
  })

  it('uses the registered local authority without widening it to catalog membership', () => {
    const local = binding({ providerId: 'generic_local', endpointProfileId: 'generic-local-v1' })
    expect(buildGoal3ModelFactsSubjectV1(local).providerAuthorityId).toBe('generic-local')
    expect(buildGoal3SourceScopeSelectionV1({ binding: local, credentialRevision: 0 }).providerNative)
      .toMatch(/^canonical-source-scope-v1:[a-f0-9]{64}$/u)
  })

  it('cutovers only current-send snapshots and preserves execution-layer continuation evidence', () => {
    const db = new Database(':memory:')
    try {
      applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
      const legacy = legacyRuntimeSnapshot()
      const capability = resolvedCapabilityFromRuntimeSnapshotV2(legacy)
      const cutover = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        createGoal3RuntimeSnapshotV1({ context, capability, binding: legacy.binding, credentialRevision: 4,
          resolvedAt: legacy.resolvedAt, tools: [] }))
      expect(cutover.revision.value).toMatch(/^capability-revision-v1:[a-f0-9]{64}$/u)
      expect(cutover.revision.value).not.toBe(legacy.revision.value)
      expect(cutover.modelFactsResolution?.capabilityRevision).toBe(cutover.revision.value)
      expect(cutover.evidence.some((item) => item.evidenceId === 'contract.openai.responses.v1')).toBe(true)
      expect(cutover.fields.every((field) => field.state === 'unknown')).toBe(true)
    } finally { db.close() }
  })
})
