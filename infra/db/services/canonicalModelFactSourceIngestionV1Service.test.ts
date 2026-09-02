import Database from 'better-sqlite3'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { BUILTIN_CAPABILITY_RULE_PACKS_V2 } from '../../../src/next/generation-v2/capability-rules/builtinCapabilityRulePacksV2'
import { buildModelsDevSourceScopeIdV1, buildProviderNativeSourceScopeIdV1 } from
  '../../../src/next/generation-v2/model-facts/sourceScopeV1'
import { CanonicalModelFactSourceIngestionV1Service } from './canonicalModelFactSourceIngestionV1Service'

const root = path.resolve(process.cwd())

function database() {
  const db = new Database(':memory:')
  applyGenerationV2SchemaForTest(db, root)
  return db
}

describe('Canonical Model Fact Source Ingestion V1 service', () => {
  it('publishes an enumerable Provider Native source under a credential-revision-isolated scope', () => {
    const db = database()
    try {
      const service = new CanonicalModelFactSourceIngestionV1Service(db, () => 100)
      const request = { surfaceId: 'gemini-models-v1beta' as const,
        endpointProfileId: 'gemini-developer-api-v1beta', credentialScopeId: 'credential:test',
        credentialRevision: 2, rawEnvelopes: [{ recordKey: 'models-page:1', payload: { models: [{
          name: 'models/gemini-test', inputTokenLimit: 1_000_000, outputTokenLimit: 8_192,
          thinking: true, topK: null, supportedGenerationMethods: ['generateContent'],
        }] } }], recordSetCompleteness: 'complete' as const, fetchedAtMs: 90 }
      const result = service.refreshProviderNative(request)
      expect(result.subjectFacts).toHaveLength(1)
      expect(result.subjectFacts[0]!.payload.subject).toEqual({ providerAuthorityId: 'google-ai-studio',
        endpointProfileId: 'gemini-developer-api-v1beta', nativeModelId: 'gemini-test' })
      expect(result.subjectFacts[0]!.payload.outcomes.some((outcome) =>
        outcome.path === 'operations.supported')).toBe(true)
      expect(result.source.sourceRevision.sourceScopeId).toBe(buildProviderNativeSourceScopeIdV1({
        providerAuthorityId: 'google-ai-studio', providerNativeSurfaceId: 'gemini-models-v1beta',
        endpointProfileId: 'gemini-developer-api-v1beta', credentialScopeId: 'credential:test',
        credentialRevision: 2,
      }))
      expect(result.source.sourceRevision.previousLkgSourceRevision).toBeUndefined()
      const repeated = service.refreshProviderNative({ ...request, fetchedAtMs: 95 })
      expect(repeated.source.sourceRevision).toEqual(result.source.sourceRevision)
      expect(repeated.subjectFacts).toEqual(result.subjectFacts)
      expect(repeated.state).toMatchObject({ pointerRevision: 1, fetchedAtMs: 95 })
    } finally { db.close() }
  })

  it('publishes a frozen query-bound Rule source and materializes every matched claim without a winner', () => {
    const db = database()
    try {
      const service = new CanonicalModelFactSourceIngestionV1Service(db, () => 200)
      service.ruleRepo.installBuiltInPacks(BUILTIN_CAPABILITY_RULE_PACKS_V2)
      const publication = service.publishCapabilityRules({ ruleStoreId: 'epoch-2',
        expectedCurrentRevision: null, fetchedAtMs: 190 })
      expect(publication.source.subjectIndexMode).toBe('query_bound')
      expect(publication.subjectFacts).toEqual([])
      const fact = service.materializeCapabilityRuleSubject({
        canonicalSourceRevision: publication.source.sourceRevision.canonicalSourceRevision,
        subject: { providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-5' },
      })
      expect(fact.payload.outcomes.length).toBeGreaterThan(1)
      expect(fact.payload.outcomes.every((outcome) => outcome.currentObservation.kind !== 'present_valid' ||
        outcome.currentObservation.assertion.provenance.ruleClaim?.ruleId)).toBe(true)
      expect(service.materializeCapabilityRuleSubject({
        canonicalSourceRevision: publication.source.sourceRevision.canonicalSourceRevision,
        subject: fact.payload.subject,
      })).toEqual(fact)
    } finally { db.close() }
  })

  it('publishes one complete official models.dev API snapshot across exact registered subjects', () => {
    const db = database()
    try {
      const service = new CanonicalModelFactSourceIngestionV1Service(db, () => 300)
      const request = { distributionId: 'models.dev-official-api', distributionChannel: 'https://models.dev/api.json',
        rawEnvelope: { recordKey: 'models-dev:api.json', payload: {
          openai: { id: 'openai', models: { 'gpt-test': { id: 'gpt-test', reasoning: true,
            limit: { context: 128_000 } } } },
          google: { id: 'google', models: { 'gemini-test': { id: 'gemini-test', tool_call: true } } },
          lmstudio: { id: 'lmstudio', models: { local: { id: 'local', reasoning: true } } },
        } }, fetchedAtMs: 290 }
      const publication = service.refreshModelsDev(request)
      expect(publication.source.subjectIndexMode).toBe('complete')
      expect(publication.subjectFacts.map((fact) => fact.payload.subject)).toEqual([
        { providerAuthorityId: 'google-ai-studio', endpointProfileId: 'gemini-developer-api-v1beta',
          nativeModelId: 'gemini-test' },
        { providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-test' },
      ])
      expect(publication.source.sourceRevision.sourceScopeId).toBe(buildModelsDevSourceScopeIdV1({
        distributionId: request.distributionId, distributionChannel: request.distributionChannel,
      }))
      const openai = publication.subjectFacts.find((fact) => fact.payload.subject.providerAuthorityId === 'openai')!
      expect(openai.payload.outcomes).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'reasoning.support' }),
        expect.objectContaining({ path: 'limits.contextWindow.maxTokens' }),
      ]))
      const repeated = service.refreshModelsDev({ ...request, fetchedAtMs: 295 })
      expect(repeated.source.sourceRevision).toEqual(publication.source.sourceRevision)
      expect(repeated.state).toMatchObject({ pointerRevision: 1, fetchedAtMs: 295 })
      service.recordModelsDevRefreshFailure({ distributionId: request.distributionId,
        distributionChannel: request.distributionChannel, attemptedAtMs: 299, staleReason: 'network_unavailable' })
      expect(service.sourceRepo.readSourceState('models_dev', publication.source.sourceRevision.sourceScopeId))
        .toMatchObject({ currentSourceRevision: publication.source.sourceRevision.canonicalSourceRevision,
          staleReason: 'network_unavailable', lastAttemptedAtMs: 299 })
    } finally { db.close() }
  })
})
