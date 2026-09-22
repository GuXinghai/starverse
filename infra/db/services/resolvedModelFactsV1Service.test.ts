import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { ResolvedModelFactsV1Service } from './resolvedModelFactsV1Service'
import { CanonicalModelFactSourceIngestionV1Service } from './canonicalModelFactSourceIngestionV1Service'
import { CanonicalModelFactSourceV1Repo } from '../repo/canonicalModelFactSourceV1Repo'
import { buildModelsDevSourceScopeIdV1, buildCapabilityRuleSourceScopeIdV1 } from
  '../../../src/next/generation-v2/model-facts/sourceScopeV1'

describe('ResolvedModelFactsV1Service', () => {
  it('resolves explicit current source absence and publishes an all-unknown exact-subject snapshot', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    try {
      const service = new ResolvedModelFactsV1Service(db, () => 20)
      const subject = { providerAuthorityId: 'provider:test', endpointProfileId: 'endpoint:test', nativeModelId: 'model:test' }
      const scopes = { providerNative: 'scope:provider', modelsDev: 'scope:models-dev', capabilityRules: 'scope:rules' }
      const current = service.resolveAndPublish({ subject, sourceScopeSelection: scopes })
      expect(current.pointerRevision).toBe(1)
      expect(current.snapshot.resolvedFacts.fields.every((field) => field.state === 'unknown')).toBe(true)
      expect(current.snapshot.resolvedFacts.input.sources).toEqual({
        providerNative: { kind: 'absent', reason: 'not_available' },
        modelsDev: { kind: 'absent', reason: 'not_available' },
        capabilityRules: { kind: 'absent', reason: 'not_available' },
      })
      expect(service.resolveAndPublish({ subject, sourceScopeSelection: scopes }).pointerRevision).toBe(1)
    } finally { db.close() }
  })

  it('pins prior source provenance while the resolved snapshot remains durable', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    try {
      const ingestion = new CanonicalModelFactSourceIngestionV1Service(db, () => 10)
      const request = { surfaceId: 'gemini-models-v1beta' as const,
        endpointProfileId: 'gemini-developer-api-v1beta', credentialScopeId: 'credential:test', credentialRevision: 1,
        rawEnvelopes: [{ recordKey: 'models-page:1', payload: { models: [{
          name: 'models/gemini-test', inputTokenLimit: 1_000_000, outputTokenLimit: 8_192, thinking: true,
          supportedGenerationMethods: ['generateContent'],
        }] } }], recordSetCompleteness: 'complete' as const, fetchedAtMs: 10 }
      const firstPublication = ingestion.refreshProviderNative(request)
      const subject = firstPublication.subjectFacts[0]!.payload.subject
      const service = new ResolvedModelFactsV1Service(db, () => 20)
      const scopes = { providerNative: firstPublication.source.sourceRevision.sourceScopeId,
        modelsDev: buildModelsDevSourceScopeIdV1({ distributionId: 'models.dev-official-api', distributionChannel: 'https://models.dev/api.json' }),
        capabilityRules: buildCapabilityRuleSourceScopeIdV1({ ruleStoreId: 'epoch-2-capability-rules' }) }
      const first = service.resolveAndPublish({ subject, sourceScopeSelection: scopes })
      const firstFact = first.snapshot.resolvedFacts.input.sources.providerNative
      expect(firstFact.kind).toBe('present')

      const secondPublication = ingestion.refreshProviderNative({ ...request,
        rawEnvelopes: [{ recordKey: 'models-page:1', payload: { models: [{
          name: 'models/gemini-test', inputTokenLimit: 2_000_000, outputTokenLimit: 8_192, thinking: true,
          supportedGenerationMethods: ['generateContent'],
        }] } }], fetchedAtMs: 30 })
      const second = service.resolveAndPublish({ subject, sourceScopeSelection: scopes })
      expect(second.snapshot.resolvedSnapshotRevision).not.toBe(first.snapshot.resolvedSnapshotRevision)
      const sourceRepo = new CanonicalModelFactSourceV1Repo(db)
      sourceRepo.pruneRetainedData(1_000)
      if (firstFact.kind === 'present') {
        expect(sourceRepo.readSubjectFactByRevision(firstFact.ref.canonicalSubjectFactRevision)).not.toBeNull()
        const retainedSource = sourceRepo.readSourceRevision(firstFact.ref.sourceRevision.canonicalSourceRevision)
        expect(retainedSource).not.toBeNull()
        expect(sourceRepo.readRawPayload(retainedSource!.rawSnapshot.rawEnvelopeRefs[0]!)).toBeDefined()
      }
      expect(secondPublication.source.sourceRevision.canonicalSourceRevision).toBe(
        sourceRepo.readSourceState('provider_native', scopes.providerNative)?.currentSourceRevision)
    } finally { db.close() }
  })
})
