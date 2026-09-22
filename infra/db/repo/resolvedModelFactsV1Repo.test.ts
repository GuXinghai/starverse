import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import {
  DEFAULT_SOURCE_PRIORITY_CONFIG_V1,
} from '../../../src/next/generation-v2/model-facts/sourcePriorityConfigV1'
import {
  buildResolvedModelFactsV1,
  type ModelFactsResolutionInputV1,
} from '../../../src/next/generation-v2/model-facts/resolvedModelFactsV1'
import { ResolvedModelFactsV1Repo } from './resolvedModelFactsV1Repo'

const subject = { providerAuthorityId: 'provider:test', endpointProfileId: 'endpoint:test', nativeModelId: 'model:test' }
const scopes = { providerNative: 'scope:provider', modelsDev: 'scope:models-dev', capabilityRules: 'scope:rules' }

function resolvedFacts(resolverRevision = 'resolver-v1:test') {
  const input: ModelFactsResolutionInputV1 = { schemaVersion: 1, subject,
    sources: { providerNative: { kind: 'absent', reason: 'not_available' },
      modelsDev: { kind: 'absent', reason: 'not_available' }, capabilityRules: { kind: 'absent', reason: 'not_available' } },
    sourcePriorityConfigRevision: DEFAULT_SOURCE_PRIORITY_CONFIG_V1.sourcePriorityConfigRevision,
    resolverRevision, ontologyRevision: 'ontology-v1:test' }
  return buildResolvedModelFactsV1({ resolutionInput: input, fields: [{ path: 'reasoning.support', state: 'unknown',
    completenessDisposition: 'unknown', selectionReason: 'no_effective_claim', supportingProvenance: [],
    opposingProvenance: [], overriddenProvenance: [], diagnostics: [] }] })
}

describe('ResolvedModelFactsV1Repo', () => {
  it('publishes immutable snapshots and advances one exact-subject current pointer atomically', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    try {
      const repo = new ResolvedModelFactsV1Repo(db, () => 10)
      const firstFacts = resolvedFacts()
      const first = repo.publishInActiveTransaction({ subject, sourceScopeSelection: scopes, resolvedFacts: firstFacts })
      expect(first.pointerRevision).toBe(1)
      expect(first.snapshot.resolvedFacts).toEqual(firstFacts)
      expect(repo.publishInActiveTransaction({ subject, sourceScopeSelection: scopes, resolvedFacts: firstFacts }).pointerRevision)
        .toBe(1)

      const secondFacts = resolvedFacts('resolver-v1:changed')
      const second = repo.publishInActiveTransaction({ subject, sourceScopeSelection: scopes, resolvedFacts: secondFacts })
      expect(second.pointerRevision).toBe(2)
      expect(repo.readCurrent(subject).snapshot.resolvedFacts.input.resolverRevision).toBe('resolver-v1:changed')
      expect(() => db.prepare('UPDATE resolved_model_facts_snapshot_v1 SET resolved_json = resolved_json WHERE resolved_snapshot_revision = ?')
        .run(first.snapshot.resolvedSnapshotRevision)).toThrow('RESOLVED_MODEL_FACTS_SNAPSHOT_IMMUTABLE')
      expect(() => db.prepare('DELETE FROM resolved_model_facts_current_v1 WHERE provider_authority_id=? AND endpoint_profile_id=? AND native_model_id=?')
        .run(subject.providerAuthorityId, subject.endpointProfileId, subject.nativeModelId)).toThrow('RESOLVED_MODEL_FACTS_CURRENT_IMMUTABLE')
      expect(() => db.prepare(`UPDATE resolved_model_facts_current_v1 SET resolved_snapshot_revision=?, pointer_revision=?
        WHERE provider_authority_id=? AND endpoint_profile_id=? AND native_model_id=?`)
        .run(first.snapshot.resolvedSnapshotRevision, 1, subject.providerAuthorityId, subject.endpointProfileId, subject.nativeModelId))
        .toThrow('RESOLVED_MODEL_FACTS_CURRENT_POINTER_NON_MONOTONIC')
      expect(() => db.prepare(`INSERT INTO resolved_model_facts_current_v1
        (provider_authority_id, endpoint_profile_id, native_model_id, resolved_snapshot_revision, pointer_revision, updated_at_ms)
        VALUES (?, ?, ?, ?, 1, 10)`)
        .run('provider:other', 'endpoint:other', 'model:other', first.snapshot.resolvedSnapshotRevision))
        .toThrow()
    } finally { db.close() }
  })
})
