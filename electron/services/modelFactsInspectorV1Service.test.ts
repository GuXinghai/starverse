import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { CanonicalModelFactSourceV1Repo } from '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import { buildAuthoritativeModelSubjectSetV1 } from '../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { buildCanonicalSourceRevisionRefV1, buildCanonicalSubjectFactV1 } from
  '../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import { buildExplicitAssertionV1, buildObservationProvenanceV1, presentOutcomeV1 } from
  '../../src/next/generation-v2/model-facts/sourceAdapterV1'
import { buildRawSourceSnapshotRefV1, sanitizeRawSourcePayloadV1 } from
  '../../src/next/generation-v2/model-facts/rawSourceSnapshotV1'
import { ModelFactsInspectorV1Service } from './modelFactsInspectorV1Service'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { SourcePriorityConfigV1Repo } from '../../infra/db/repo/sourcePriorityConfigV1Repo'
import { buildInspectorSourceScopeSelectionV1 } from './modelFactsInspectorScopeV1'
import { UserCapabilityRulesV1Service } from './userCapabilityRulesV1Service'

const root = path.resolve(process.cwd())
const subject = Object.freeze({ providerAuthorityId: 'ollama-local', endpointProfileId: 'profile:one',
  nativeModelId: 'qwen-test' })
const other = Object.freeze({ providerAuthorityId: 'ollama-local', endpointProfileId: 'profile:one',
  nativeModelId: 'not-authoritative' })

function createDb() {
  const db = new Database(':memory:')
  applyGenerationV2SchemaForTest(db, root)
  return db
}

function subjectSet(db: Database.Database) {
  const profile = new LocalEndpointProfileV2Repo(db).create({ endpointProfileId: 'profile:one', providerId: 'ollama',
    protocolContractId: 'ollama-chat-v1', baseUrl: 'http://127.0.0.1:11434',
    protocolConfig: { modelId: 'qwen-test', thinkingControl: 'boolean', tools: false } })
  return buildAuthoritativeModelSubjectSetV1([{ subject, proof: Object.freeze({ kind: 'local_profile_binding' as const,
    endpointProfileId: 'profile:one', providerId: 'ollama' as const, protocolContractId: profile.protocolContractId,
    profileRevision: profile.profileRevision }) }])
}

function publishFact(db: Database.Database) {
  const set = subjectSet(db)
  const scope = buildInspectorSourceScopeSelectionV1(db, set.records[0]!).providerNative
  const repo = new CanonicalModelFactSourceV1Repo(db, () => 100)
  const raw = sanitizeRawSourcePayloadV1({ recordKey: subject.nativeModelId,
    payload: { secret: 'must-not-persist', thinking: { enabled: true } } })
  const rawSnapshot = buildRawSourceSnapshotRefV1({ sourceKind: 'provider_native', sourceScopeId: scope,
    recordSetCompleteness: 'complete', rawEnvelopeRefs: [raw.ref] })
  const sourceRevision = buildCanonicalSourceRevisionRefV1({ sourceKind: 'provider_native', sourceScopeId: scope,
    rawSourceSnapshotRevision: rawSnapshot.rawSourceSnapshotRevision, adapterRevision: 'adapter:test',
    coverageManifestRevision: 'coverage:test', providerAuthorityRegistryRevision: 'registry:test' })
  const provenance = buildObservationProvenanceV1({ sourceRevision, sourceFieldRefs: [{ rawPayloadRef: raw.ref,
    sourceRecordIdentity: subject.nativeModelId, sourceFieldPath: 'thinking.enabled', observedPresence: 'present' }],
  adapterId: 'native:test', adapterRevision: 'adapter:test', mappingId: 'reasoning.support.v1' })
  const assertion = buildExplicitAssertionV1({ subject, sourceRevision, path: 'reasoning.support',
    value: { kind: 'support', value: 'supported' }, sourceClaimIdentity: 'native:thinking',
    evidenceRefs: ['evidence:test'], observationProvenance: provenance })
  const fact = buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision, recordOutcome: 'present',
    outcomes: [presentOutcomeV1({ assertion })], unmappedSourceFields: [] })
  repo.publishSourceRevision({ rawSnapshot, sourceRevision, rawPayloads: [raw], subjectIndexMode: 'complete',
    subjectFacts: [fact], expectedCurrentRevision: null, fetchedAtMs: 90 })
  return { raw, set, scope }
}

describe('ModelFactsInspectorV1Service', () => {
  it('searches only the authoritative exact subject set and returns its revision', async () => {
    const db = createDb()
    try {
      const { set } = publishFact(db)
      const service = new ModelFactsInspectorV1Service(db, { readCurrent: async () => set })
      await expect(service.searchSubjects({ query: 'qwen', limit: 10 })).resolves.toEqual({
        subjectSetRevision: set.subjectSetRevision, records: [expect.objectContaining({ subject })], nextCursor: null,
      })
      await expect(service.searchSubjects({ query: 'missing', limit: 10 })).resolves.toMatchObject({ records: [] })
    } finally { db.close() }
  })

  it('returns separate source rows and refuses non-authoritative subjects', async () => {
    const db = createDb()
    try {
      const { set, scope } = publishFact(db)
      const service = new ModelFactsInspectorV1Service(db, { readCurrent: async () => set })
      const result = await service.readInspectorSnapshot({ subject, expectedSubjectSetRevision: set.subjectSetRevision })
      expect(result.sources).toEqual([expect.objectContaining({ state: expect.objectContaining({
        sourceKind: 'provider_native', sourceScopeId: scope }), subjectFact: expect.objectContaining({
        payload: expect.objectContaining({ subject }) }) })])
      await expect(service.readInspectorSnapshot({ subject: other })).rejects.toThrow(
        'GENERATION_V2_MODEL_FACTS_INSPECTOR_SUBJECT_NOT_FOUND')
    } finally { db.close() }
  })

  it('reads evidence slices and only persisted sanitized raw payloads', async () => {
    const db = createDb()
    try {
      const { raw, set, scope } = publishFact(db)
      const service = new ModelFactsInspectorV1Service(db, { readCurrent: async () => set })
      await expect(service.readEvidenceSlice({ subject, sourceKind: 'provider_native', sourceScopeId: scope,
        path: 'reasoning.support' })).resolves.toMatchObject({ path: 'reasoning.support',
        currentObservation: { kind: 'present_valid' } })
      expect(service.readSanitizedRawPayload(raw.ref)).toEqual({ secret: '[redacted]', thinking: { enabled: true } })
    } finally { db.close() }
  })

  it('resolves committed Rules and priority changes before returning the current winner, conflict and gap', async () => {
    const db = createDb()
    try {
      const { set } = publishFact(db)
      const service = new ModelFactsInspectorV1Service(db, { readCurrent: async () => set })
      const userRules = new UserCapabilityRulesV1Service(db, { readCurrent: async () => set })
      let session = 0
      const publishRule = async (value: 'supported' | 'unsupported' | null) => {
        const opened = userRules.openDraft({ sessionId: `session:${++session}` })
        const changed = userRules.replaceDraft({ sessionId: opened.sessionId, expectedDraftRevision: opened.draftRevision,
          notes: [], snapshot: { schemaVersion: 1, ownership: 'user', ownerId: 'local-user',
            packs: value === null ? [] : [{ schemaVersion: 1, packId: 'pack.reasoning', displayName: 'Synthetic Rules',
              description: null, priority: 0, mode: 'no_control', target: 'enabled', rules: [{ ruleId: 'rule.reasoning',
                label: null, description: null, priority: 0, configured: 'default',
                providerAuthorityId: subject.providerAuthorityId, endpointProfileId: subject.endpointProfileId,
                selector: { kind: 'exact', nativeModelIds: [subject.nativeModelId] }, evidence: null,
                assertion: { path: 'reasoning.support', value: { kind: 'support', value } } }] }] } })
        return (await userRules.saveDraft({ sessionId: changed.sessionId, expectedDraftRevision: changed.draftRevision })).canonicalSourceRevision
      }
      const first = await service.readInspectorSnapshot({ subject })
      expect(first.resolved!.resolvedFacts.fields.find((field) => field.path === 'reasoning.support'))
        .toMatchObject({ state: 'resolved', selectedValue: { value: 'supported' } })
      const ruleRevision = await publishRule('unsupported')
      const priorities = new SourcePriorityConfigV1Repo(db)
      const updated = priorities.compareAndSet(priorities.get().config.sourcePriorityConfigRevision,
        { provider_native: 1, models_dev: 2, capability_rule: 3 })
      const winner = await service.readInspectorSnapshot({ subject })
      expect(winner.resolved!.resolvedSnapshotRevision).not.toBe(first.resolved!.resolvedSnapshotRevision)
      expect(winner.resolved!.resolvedFacts.input.sourcePriorityConfigRevision).toBe(updated.config.sourcePriorityConfigRevision)
      expect(winner.resolved!.resolvedFacts.fields.find((field) => field.path === 'reasoning.support'))
        .toMatchObject({ state: 'resolved', selectedValue: { value: 'unsupported' },
          supportingProvenance: [expect.objectContaining({ sourceKind: 'capability_rule' })] })
      expect(winner.sources.find((source) => source.state.sourceKind === 'capability_rule')!.state.currentSourceRevision).toBe(ruleRevision)
      priorities.compareAndSet(updated.config.sourcePriorityConfigRevision,
        { provider_native: 3, models_dev: 2, capability_rule: 3 })
      const conflict = await service.readInspectorSnapshot({ subject })
      expect(conflict.resolved!.resolvedFacts.fields.find((field) => field.path === 'reasoning.support')).toMatchObject({ state: 'conflict' })
      expect(conflict.resolved!.resolvedFacts.fields.find((field) => field.path === 'search.web.support')).toMatchObject({ state: 'unknown' })
      await publishRule(null)
      const gap = await service.readInspectorSnapshot({ subject })
      expect(gap.resolved!.resolvedSnapshotRevision).not.toBe(conflict.resolved!.resolvedSnapshotRevision)
      expect(gap.resolved!.resolvedFacts.fields.find((field) => field.path === 'reasoning.support'))
        .toMatchObject({ state: 'resolved', selectedValue: { value: 'supported' } })
    } finally { db.close() }
  })
})
