import { describe, expect, it } from 'vitest'
import {
  buildCanonicalSourceRevisionRefV1,
  type CanonicalFieldOutcomeV1,
  type CanonicalSubjectFactCandidateV1,
} from './canonicalSourceFactsV1'
import { PROVIDER_AUTHORITY_REGISTRY_REVISION_V1 } from './providerAuthorityRegistryV1'
import {
  buildRawSourceSnapshotRefV1,
  InMemoryRawPayloadStoreV1,
  sanitizeRawSourcePayloadV1,
} from './rawSourceSnapshotV1'
import { createModelsDevSourceAdapterV1 } from './modelsDevSourceAdapterV1'

function harness(payload: unknown, recordSetCompleteness: 'complete' | 'partial' = 'complete') {
  const store = new InMemoryRawPayloadStoreV1()
  const raw = sanitizeRawSourcePayloadV1({ payload, recordKey: 'models-dev:api.json' })
  store.put(raw)
  const rawSnapshot = buildRawSourceSnapshotRefV1({ sourceKind: 'models_dev', sourceScopeId: 'models-dev:official-api',
    recordSetCompleteness, rawEnvelopeRefs: [raw.ref] })
  const adapter = createModelsDevSourceAdapterV1({ rawPayloadReader: store })
  const sourceRevision = buildCanonicalSourceRevisionRefV1({ sourceKind: 'models_dev',
    sourceScopeId: rawSnapshot.sourceScopeId, rawSourceSnapshotRevision: rawSnapshot.rawSourceSnapshotRevision,
    adapterRevision: adapter.adapterRevision, coverageManifestRevision: adapter.coverageManifest.manifestRevision,
    providerAuthorityRegistryRevision: PROVIDER_AUTHORITY_REGISTRY_REVISION_V1 })
  return { adapter, raw, rawSnapshot, sourceRevision }
}

function adaptFirst(result: ReturnType<typeof harness>): CanonicalSubjectFactCandidateV1 {
  const subject = result.adapter.indexRawRecords!(result.rawSnapshot).exactSubjects[0]!
  return result.adapter.adaptExactSubject({ rawSnapshot: result.rawSnapshot,
    sourceRevision: result.sourceRevision, subject })
}

function byMapping(candidate: CanonicalSubjectFactCandidateV1, mappingId: string): CanonicalFieldOutcomeV1 | undefined {
  return candidate.outcomes.find((outcome) => {
    const observation = outcome.currentObservation
    const provenance = observation.kind === 'present_valid'
      ? observation.assertion.provenance : observation.provenance
    return provenance.mappingId === mappingId
  })
}

function presentValue(candidate: CanonicalSubjectFactCandidateV1, mappingId: string) {
  const observation = byMapping(candidate, mappingId)?.currentObservation
  return observation?.kind === 'present_valid' ? observation.assertion.value : undefined
}

describe('modelsDevSourceAdapterV1', () => {
  it('maps exact-provider exact-model booleans, limits, modalities, and reasoning controls', () => {
    const candidate = adaptFirst(harness({ google: { id: 'google', models: {
      'gemini-test': {
        id: 'gemini-test', attachment: true, reasoning: true, tool_call: false,
        structured_output: true, temperature: true,
        modalities: { input: ['text', 'image', 'future'], output: ['text'] },
        limit: { context: 1_000_000, input: 900_000, output: 64_000 },
        reasoning_options: [
          { type: 'toggle' },
          { type: 'effort', values: ['low', 'high'] },
          { type: 'budget_tokens', min: 0, max: 24_576 },
        ],
      },
    } } }))
    expect(presentValue(candidate, 'models-dev.attachment.v1')).toEqual({ kind: 'support', value: 'supported' })
    expect(presentValue(candidate, 'models-dev.tool-call.v1')).toEqual({ kind: 'support', value: 'unsupported' })
    expect(presentValue(candidate, 'models-dev.input-modalities.v1')).toEqual({
      kind: 'media_kind_set', values: ['image', 'text'], completeness: 'partial',
    })
    expect(presentValue(candidate, 'models-dev.reasoning-effort.v1')).toEqual({
      kind: 'native_string_set', values: ['high', 'low'], completeness: 'complete',
    })
    expect(presentValue(candidate, 'models-dev.reasoning-budget-domain.v1')).toEqual({
      kind: 'integer_domain', unit: 'token', interval: {
        min: 0, max: 24_576, minInclusive: true, maxInclusive: true,
      }, completeness: 'complete',
    })
    expect(candidate.unmappedSourceFields).toContainEqual(expect.objectContaining({
      reasonCode: 'unknown_member', candidateCanonicalPath: 'modalities.input',
    }))
  })

  it('keeps OpenRouter effort options unmapped while retaining independent toggle and budget facts', () => {
    const candidate = adaptFirst(harness({ openrouter: { id: 'openrouter', models: {
      'vendor/model': { id: 'vendor/model', reasoning_options: [
        { type: 'toggle' }, { type: 'effort', values: ['low', 'high'] }, { type: 'budget_tokens', min: 1024 },
      ] },
    } } }))
    expect(byMapping(candidate, 'models-dev.reasoning-effort.v1')).toBeUndefined()
    expect(presentValue(candidate, 'models-dev.reasoning-toggle.v1')).toEqual({ kind: 'support', value: 'supported' })
    expect(presentValue(candidate, 'models-dev.reasoning-budget-domain.v1')).toEqual({
      kind: 'integer_domain', unit: 'token', interval: {
        min: 1024, minInclusive: true, maxInclusive: true,
      }, completeness: 'partial_bounds',
    })
    expect(candidate.unmappedSourceFields).toContainEqual(expect.objectContaining({
      reasonCode: 'ambiguous_semantics', candidateCanonicalPath: 'reasoning.effort.nativeValues',
    }))
  })

  it('isolates one malformed field without losing valid fields from the same exact record', () => {
    const candidate = adaptFirst(harness({ openai: { id: 'openai', models: {
      'gpt-test': { id: 'gpt-test', attachment: 'yes', reasoning: true, modalities: 'malformed' },
    } } }))
    expect(byMapping(candidate, 'models-dev.attachment.v1')?.currentObservation.kind).toBe('invalid')
    expect(presentValue(candidate, 'models-dev.reasoning.v1')).toEqual({ kind: 'support', value: 'supported' })
    expect(byMapping(candidate, 'models-dev.input-modalities.v1')?.currentObservation.kind).toBe('invalid')
    expect(byMapping(candidate, 'models-dev.output-modalities.v1')?.currentObservation.kind).toBe('invalid')
    expect(candidate.recordOutcome).toBe('present')
  })
})

describe('modelsDevSourceAdapterV1 exact identity and revision guards', () => {
  it('indexes one official API snapshot across only explicitly joinable provider authorities', () => {
    const result = harness({
      openai: { id: 'openai', models: { 'gpt-test': { id: 'gpt-test' } } },
      google: { id: 'google', models: { 'gemini-test': { id: 'gemini-test' } } },
      lmstudio: { id: 'lmstudio', models: { 'local-model': { id: 'local-model' } } },
      unknown_provider: { id: 'unknown_provider', models: { invented: { id: 'invented' } } },
    })
    expect(result.adapter.indexRawRecords!(result.rawSnapshot).exactSubjects).toEqual([
      { providerAuthorityId: 'google-ai-studio', endpointProfileId: 'gemini-developer-api-v1beta',
        nativeModelId: 'gemini-test' },
      { providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-test' },
    ])
  })

  it('requires the exact registered provider key and exact model-map key/id identity', () => {
    const wrongProviderCase = harness({ OpenAI: { id: 'OpenAI', models: {
      'gpt-test': { id: 'gpt-test' },
    } } })
    expect(wrongProviderCase.adapter.indexRawRecords!(wrongProviderCase.rawSnapshot).exactSubjects).toEqual([])

    const mismatchedId = harness({ openai: { id: 'openai', models: {
      'gpt-key': { id: 'gpt-other' },
      'gpt-valid': { id: 'gpt-valid' },
    } } })
    const index = mismatchedId.adapter.indexRawRecords!(mismatchedId.rawSnapshot)
    expect(index.exactSubjects.map((subject) => subject.nativeModelId)).toEqual(['gpt-valid'])
    expect(index.invalidRecordRefs).toEqual([mismatchedId.raw.ref])
  })

  it('reports an absent exact model as indeterminate for an incomplete snapshot', () => {
    const result = harness({ deepseek: { id: 'deepseek', models: {} } }, 'partial')
    const subject = Object.freeze({ providerAuthorityId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
      nativeModelId: 'not-listed' })
    expect(result.adapter.adaptExactSubject({ rawSnapshot: result.rawSnapshot,
      sourceRevision: result.sourceRevision, subject })).toMatchObject({
      recordOutcome: 'indeterminate_in_incomplete_snapshot', outcomes: [],
    })
  })

  it('rejects a source revision produced by a different adapter revision', () => {
    const result = harness({ openai: { id: 'openai', models: {
      'gpt-test': { id: 'gpt-test' },
    } } })
    const subject = result.adapter.indexRawRecords!(result.rawSnapshot).exactSubjects[0]!
    const wrongRevision = buildCanonicalSourceRevisionRefV1({ sourceKind: 'models_dev',
      sourceScopeId: result.rawSnapshot.sourceScopeId,
      rawSourceSnapshotRevision: result.rawSnapshot.rawSourceSnapshotRevision,
      adapterRevision: 'models-dev-source-adapter-v0',
      coverageManifestRevision: result.adapter.coverageManifest.manifestRevision,
      providerAuthorityRegistryRevision: PROVIDER_AUTHORITY_REGISTRY_REVISION_V1 })
    expect(() => result.adapter.adaptExactSubject({ rawSnapshot: result.rawSnapshot,
      sourceRevision: wrongRevision, subject })).toThrowError('GENERATION_V2_MODELS_DEV_ADAPTER_INVALID')
  })
})
