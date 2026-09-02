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
import {
  createProviderNativeSourceAdapterV1,
  type ProviderNativeSurfaceIdV1,
} from './providerNativeSourceAdapterV1'

function harness(surfaceId: ProviderNativeSurfaceIdV1, payload: unknown) {
  const store = new InMemoryRawPayloadStoreV1()
  const raw = sanitizeRawSourcePayloadV1({ payload, recordKey: `${surfaceId}:page-1` })
  store.put(raw)
  const rawSnapshot = buildRawSourceSnapshotRefV1({ sourceKind: 'provider_native',
    sourceScopeId: `scope:${surfaceId}`, recordSetCompleteness: 'complete', rawEnvelopeRefs: [raw.ref] })
  const endpointProfileId = surfaceId === 'lmstudio-models-v1' ? 'local-lmstudio-instance-test' :
    surfaceId === 'ollama-tags-v1' ? 'local-ollama-instance-test' : undefined
  const adapter = createProviderNativeSourceAdapterV1({ sourceSurfaceId: surfaceId, rawPayloadReader: store,
    ...(endpointProfileId ? { endpointProfileId } : {}) })
  const sourceRevision = buildCanonicalSourceRevisionRefV1({ sourceKind: 'provider_native',
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

describe('providerNativeSourceAdapterV1', () => {
  it.each([
    ['openai-models-v1', { object: 'list', data: [{ id: 'gpt-5', object: 'model' }] }, 'gpt-5'],
    ['deepseek-stable-models-v1', { object: 'list', data: [{ id: 'deepseek-chat', object: 'model' }] }, 'deepseek-chat'],
  ] as const)('indexes %s exact identities without inventing capability outcomes', (surfaceId, payload, modelId) => {
    const result = harness(surfaceId, payload)
    const index = result.adapter.indexRawRecords!(result.rawSnapshot)
    expect(index.exactSubjects).toHaveLength(1)
    expect(index.exactSubjects[0]?.nativeModelId).toBe(modelId)
    expect(adaptFirst(result)).toMatchObject({ recordOutcome: 'present', outcomes: [] })
  })

  it('isolates a malformed Gemini field and degrades an unknown operation member to partial', () => {
    const candidate = adaptFirst(harness('gemini-models-v1beta', { models: [{
      name: 'models/gemini-test', inputTokenLimit: 'bad', outputTokenLimit: 8192,
      supportedGenerationMethods: ['generateContent', 'countTokens', 'countTextTokens', 'futureMethod'], thinking: true,
    }] }))
    expect(byMapping(candidate, 'google.input-limit.v1')?.currentObservation.kind).toBe('invalid')
    expect(presentValue(candidate, 'google.output-limit.v1')).toEqual({ kind: 'integer', value: 8192, unit: 'token' })
    expect(presentValue(candidate, 'google.supported-operations.v1')).toEqual({
      kind: 'operation_kind_set', values: ['content_generate', 'token_count'], completeness: 'partial',
    })
    expect(presentValue(candidate, 'google.top-k-support.v1')).toEqual({ kind: 'support', value: 'unsupported' })
    expect(byMapping(candidate, 'google.top-k-default.v1')).toBeUndefined()
    expect(candidate.unmappedSourceFields).toContainEqual(expect.objectContaining({
      reasonCode: 'unknown_member', candidateCanonicalPath: 'operations.supported',
    }))
  })

  it('maps Anthropic overall effort separately from reasoning effort and keeps member sets partial', () => {
    const candidate = adaptFirst(harness('anthropic-models-2023-06-01', { data: [{
      id: 'claude-test', max_input_tokens: 200_000, max_tokens: 64_000,
      capabilities: {
        thinking: { supported: true, types: { enabled: { supported: true }, adaptive: { supported: false } } },
        effort: { supported: true, low: { supported: true }, medium: { supported: true },
          high: { supported: true }, xhigh: { supported: false }, max: { supported: false } },
        image_input: { supported: true }, pdf_input: { supported: false },
        batch: { supported: true },
      },
    }] }))
    expect(presentValue(candidate, 'anthropic.generation-effort.v1')).toEqual({
      kind: 'native_string_set', values: ['high', 'low', 'medium'], completeness: 'complete',
    })
    expect(candidate.outcomes.some((outcome) => outcome.path === 'reasoning.effort.nativeValues')).toBe(false)
    expect(presentValue(candidate, 'anthropic.input-modalities.v1')).toEqual({
      kind: 'media_kind_set', values: ['image'], completeness: 'partial',
    })
    expect(presentValue(candidate, 'anthropic.batch-operation.v1')).toEqual({
      kind: 'operation_kind_set', values: ['request_batch'], completeness: 'partial',
    })
  })

  it('degrades an Anthropic complete effort list when a future native member appears', () => {
    const candidate = adaptFirst(harness('anthropic-models-2023-06-01', { data: [{
      id: 'claude-future', capabilities: { effort: { supported: true,
        low: { supported: true }, medium: { supported: true }, high: { supported: true },
        xhigh: { supported: false }, max: { supported: false }, ultra: { supported: true } } },
    }] }))
    expect(presentValue(candidate, 'anthropic.generation-effort.v1')).toEqual({
      kind: 'native_string_set', values: ['high', 'low', 'medium'], completeness: 'partial',
    })
    expect(candidate.unmappedSourceFields).toContainEqual(expect.objectContaining({
      reasonCode: 'unknown_member', candidateCanonicalPath: 'generation.effort.nativeValues',
    }))
  })

  it('keeps OpenRouter effort controls unmapped while publishing direct reasoning and modality facts', () => {
    const candidate = adaptFirst(harness('openrouter-chat-models-v1', { data: [{
      id: 'vendor/model', context_length: 128_000,
      architecture: { input_modalities: ['text', 'future'], output_modalities: ['text'] },
      reasoning: { mandatory: false, supported_efforts: ['low', 'high'], default_effort: 'high' },
    }] }))
    expect(presentValue(candidate, 'openrouter.reasoning-support.v1')).toEqual({ kind: 'support', value: 'supported' })
    expect(presentValue(candidate, 'openrouter.reasoning-required.v1')).toEqual({ kind: 'boolean', value: false })
    expect(presentValue(candidate, 'openrouter.input-modalities.v1')).toEqual({
      kind: 'media_kind_set', values: ['text'], completeness: 'partial',
    })
    expect(candidate.outcomes.some((outcome) => outcome.path === 'reasoning.effort.nativeValues')).toBe(false)
    expect(presentValue(candidate, 'openrouter.reasoning-default.v1')).toEqual({
      kind: 'native_string', value: 'high',
    })
    expect(candidate.unmappedSourceFields.filter((field) => field.reasonCode === 'ambiguous_semantics')).toHaveLength(1)
  })
})

describe('providerNativeSourceAdapterV1 local and isolation behavior', () => {
  it('limits LM Studio v1 mapping to the three frozen official fields', () => {
    const candidate = adaptFirst(harness('lmstudio-models-v1', { models: [{
      key: 'local/model', max_context_length: 32_768,
      capabilities: { vision: true, trained_for_tool_use: false,
        reasoning: { default: 'medium', allowed_options: ['low', 'medium'] } },
    }] }))
    expect(presentValue(candidate, 'lmstudio.context-window.v1')).toEqual({
      kind: 'integer', value: 32_768, unit: 'token',
    })
    expect(presentValue(candidate, 'lmstudio.vision.v1')).toEqual({
      kind: 'media_kind_set', values: ['image'], completeness: 'partial',
    })
    expect(presentValue(candidate, 'lmstudio.tool-training.v1')).toEqual({ kind: 'support', value: 'unsupported' })
    expect(candidate.unmappedSourceFields).toContainEqual(expect.objectContaining({
      reasonCode: 'ambiguous_semantics',
    }))
  })

  it('marks malformed nested LM Studio capabilities invalid without losing the valid context field', () => {
    const candidate = adaptFirst(harness('lmstudio-models-v1', { models: [{
      key: 'local/model', max_context_length: 16_384, capabilities: 'malformed',
    }] }))
    expect(presentValue(candidate, 'lmstudio.context-window.v1')).toEqual({
      kind: 'integer', value: 16_384, unit: 'token',
    })
    expect(byMapping(candidate, 'lmstudio.vision.v1')?.currentObservation.kind).toBe('invalid')
    expect(byMapping(candidate, 'lmstudio.tool-training.v1')?.currentObservation.kind).toBe('invalid')
  })

  it('maps only evidenced Ollama positive members and never turns omission into unsupported', () => {
    const candidate = adaptFirst(harness('ollama-tags-v1', { models: [{
      name: 'local:latest', model: 'local:latest', capabilities: ['completion', 'vision', 'tools'],
    }] }))
    expect(presentValue(candidate, 'ollama.capabilities.operations.v1')).toEqual({
      kind: 'operation_kind_set', values: ['content_generate'], completeness: 'partial',
    })
    expect(presentValue(candidate, 'ollama.capabilities.input-modalities.v1')).toEqual({
      kind: 'media_kind_set', values: ['image'], completeness: 'partial',
    })
    expect(candidate.unmappedSourceFields).toContainEqual(expect.objectContaining({ reasonCode: 'unknown_member' }))

    const omitted = adaptFirst(harness('ollama-tags-v1', { models: [{ name: 'plain:latest' }] }))
    expect(omitted.outcomes).toEqual([])
  })

  it('quarantines an invalid record identity in the index without dropping valid records', () => {
    const result = harness('openai-models-v1', { data: [{ id: 42 }, { id: 'gpt-valid' }] })
    const index = result.adapter.indexRawRecords!(result.rawSnapshot)
    expect(index.exactSubjects.map((subject) => subject.nativeModelId)).toEqual(['gpt-valid'])
    expect(index.invalidRecordRefs).toEqual([result.raw.ref])
    expect(adaptFirst(result).recordOutcome).toBe('present')
  })

  it('rejects a source revision produced by a different adapter revision', () => {
    const result = harness('openai-models-v1', { data: [{ id: 'gpt-valid' }] })
    const subject = result.adapter.indexRawRecords!(result.rawSnapshot).exactSubjects[0]!
    const wrongRevision = buildCanonicalSourceRevisionRefV1({ sourceKind: 'provider_native',
      sourceScopeId: result.rawSnapshot.sourceScopeId,
      rawSourceSnapshotRevision: result.rawSnapshot.rawSourceSnapshotRevision,
      adapterRevision: 'provider-native-source-adapter-v0',
      coverageManifestRevision: result.adapter.coverageManifest.manifestRevision,
      providerAuthorityRegistryRevision: PROVIDER_AUTHORITY_REGISTRY_REVISION_V1 })
    expect(() => result.adapter.adaptExactSubject({ rawSnapshot: result.rawSnapshot,
      sourceRevision: wrongRevision, subject })).toThrowError('GENERATION_V2_PROVIDER_NATIVE_ADAPTER_INVALID')
  })
})
