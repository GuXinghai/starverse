import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalizeResolvedCapabilityV2, validateSemanticIntentAgainstResolvedCapabilityV2, runtimeSnapshotRecordFromResolvedCapabilityV2, resolvedCapabilityFromRuntimeSnapshotV2 } from '../../core/generation-v2/capability/resolvedCapabilityV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as PATHS } from '../../core/generation-v2/capability/modelCapabilitySchemaV2'
import { listReviewedProviderContractDefinitionsV2 } from '../../core/generation-v2/contracts/providerContractRegistryV2'
import { compatibleGenerationIntentV2 } from '../../core/generation-v2/compiler/compatibleGenerationIntentV2'
import { decodeGenerationIntentLayerV2 } from '../../core/generation-v2/domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../../core/generation-v2/domain/generationIntentProjectionV2'
import { clearRequestAdaptationsV2, readRequestAdaptationV2, openRequestAdaptationScopeV2, recordRequestAdaptationV2, withRequestAdaptationScopeV2 } from '../../core/generation-v2/compiler/requestAdaptationV2'
import { assertEffectiveRequestPlanV2, createEffectiveRequestPlanV2, decodeEffectiveRequestPlanV2 } from '../../core/generation-v2/compiler/effectiveRequestPlanV2'
import { canonicalizeUnverifiedRuntimeCapabilitySnapshotV2, decodeRuntimeCapabilitySnapshotV2 } from '../../core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { resolveEncodingCoverageRegistryV2 } from '../../core/generation-v2/capability/encodingCoverageRegistryV2'
import { sha256PreparedBytesV2, stableSerializeProviderRequestV2 } from '../../core/generation-v2/compiler/stableSerialize'

const hash = 'a'.repeat(64)
beforeEach(() => openRequestAdaptationScopeV2().close)
afterEach(() => clearRequestAdaptationsV2('operation:test'))
const definitions = listReviewedProviderContractDefinitionsV2().filter(definition => definition.protocolContractId.value !== 'openrouter-images-v1')

function capability(protocol: string, overrides: Record<string, Record<string, unknown>> = {}) {
  const definition = definitions.find(value => value.protocolContractId.value === protocol)!
  const extension = protocol.startsWith('anthropic') ? 'anthropic_messages' : protocol.startsWith('gemini-generate') ? 'gemini_generate_content'
    : protocol.startsWith('openai-responses') ? 'openai_responses' : protocol === 'gemini-interactions-v1beta' ? 'gemini_interactions' : 'none'
  return canonicalizeResolvedCapabilityV2({ binding: { credentialScopeId: 'credential:test', providerId: definition.providerId.value,
    endpointProfileId: 'profile:test', endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint:1',
      descriptors: [{ endpointId: 'endpoint:test', descriptorRevision: 'descriptor:1' }] }, protocolContractId: protocol,
    contractRevision: definition.contractRevision.value, contractDefinitionDigest: definition.definitionDigest.value,
    registryRevision: definition.registryRevision.value, modelId: 'model:test', operation: protocol === 'gemini-interactions-v1beta' ? 'image_generate' : 'text' },
    evidence: [{ evidenceId: 'test.unknown', kind: 'contract_invariant', effect: 'unknown', sourceRef: 'test:unknown', verifiedAt: '2026-10-16T00:00:00.000Z', contentDigest: hash },
      { evidenceId: 'test.support', kind: 'official_documentation', effect: 'supports', sourceRef: 'https://example.test', verifiedAt: '2026-10-16T00:00:00.000Z', contentDigest: hash }],
    fields: PATHS.map(path => overrides[path] ? { path, state: 'supported', constraints: [], evidenceIds: ['test.support'], ...overrides[path] } : path === 'generation.temperature' ? { path, state: 'supported', domain: { kind: 'range', min: 0, max: 1, integer: false }, constraints: [], evidenceIds: ['test.support'] }
      : path === 'providerExtension.kind' ? { path, state: 'supported', domain: { kind: 'enum', values: [extension] }, constraints: [], evidenceIds: ['test.support'] }
        : { path, state: 'unknown', constraints: [], evidenceIds: ['test.unknown'] }),
    continuation: { kind: 'none', evidenceIds: ['test.support'] } })
}

describe('per-request target settings adaptation', () => {
  it('freezes requested settings separately and detects changed effective settings or plan content', () => {
    const target = capability('openai-responses-v1')
    const requested = decodeGenerationIntentLayerV2({ schemaVersion: 2, generation: { temperature: 2 }, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'none' } })
    const effective = compatibleGenerationIntentV2('operation:test', requested, target).value
    const plan = createEffectiveRequestPlanV2({ requested, effective, capability: target,
      decisions: [{path: 'settings.generation.temperature', outcome: 'converted', reason: 'target_domain'}] })
    expect(plan.requestedIntent).toMatchObject({generation: {temperature: 2}})
    expect(effective.generation.temperature).toBeUndefined()
    expect(() => assertEffectiveRequestPlanV2(plan, effective, target.executionContext.binding, target.modelFacts.capabilityRevision)).not.toThrow()
    expect(() => assertEffectiveRequestPlanV2(plan, requested, target.executionContext.binding, target.modelFacts.capabilityRevision)).toThrow('GENERATION_V2_REQUEST_PLAN_BINDING_MISMATCH')
    expect(() => decodeEffectiveRequestPlanV2({...plan, decisions: []})).toThrow('GENERATION_V2_REQUEST_PLAN_HASH_MISMATCH')
    expect(Object.isFrozen(plan.requestedIntent)).toBe(true)
    expect(decodeEffectiveRequestPlanV2(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
  })
  it('isolates nested transactions and releases failed transaction decisions', () => {
    const decision = {path: 'settings.generation.temperature', outcome: 'converted' as const, reason: 'outer'}
    recordRequestAdaptationV2('operation:test', decision)
    expect(() => withRequestAdaptationScopeV2(() => {
      expect(readRequestAdaptationV2('operation:test', decision.path)).toBeNull()
      recordRequestAdaptationV2('operation:test', {...decision, reason: 'inner'})
      throw new Error('rollback')
    })).toThrow('rollback')
    expect(readRequestAdaptationV2('operation:test', decision.path)?.reason).toBe('outer')
    withRequestAdaptationScopeV2(() => expect(readRequestAdaptationV2('operation:test', decision.path)).toBeNull())
  })
  it('does not manufacture a Level from common effort when target controls are unknown', () => {
    const requested = decodeGenerationIntentLayerV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'enabled', effort: 'high' }, web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'none' } })
    const effective = compatibleGenerationIntentV2('operation:test', requested, capability('gemini-generate-content-v1beta')).value
    expect(effective.providerExtension).toEqual({ kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts: 'provider_default' })
    expect(effective.reasoning).toEqual({ mode: 'enabled' })
    expect(requested.reasoning).toEqual({ mode: 'enabled', effort: 'high' })
  })
  it('encodes legal Flash off as Budget zero, but converts off to the required target default with evidence', () => {
    const requested = decodeGenerationIntentLayerV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'gemini_generate_content', thinkingMode: 'budget', thinkingBudget: 0, includeThoughts: 'enabled' } })
    const budget = { domain: { kind: 'range', min: 128, max: 32768, integer: true, includedValues: [-1, 0] } }
    const optional = capability('gemini-generate-content-v1beta', { 'providerExtension.thinkingBudget': budget })
    expect(compatibleGenerationIntentV2('operation:test', requested, optional).value).toMatchObject({ reasoning: { mode: 'disabled' }, providerExtension: { thinkingMode: 'budget', thinkingBudget: 0, includeThoughts: 'enabled' } })
    const required = capability('gemini-generate-content-v1beta', { 'providerExtension.thinkingBudget': budget, 'reasoning.mode': { domain: { kind: 'enum', values: ['enabled'] } } })
    const effective = compatibleGenerationIntentV2('operation:test', requested, required).value
    expect(effective.reasoning).toEqual({ mode: 'enabled' })
    expect(effective.providerExtension).toEqual({ kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts: 'enabled' })
    expect(readRequestAdaptationV2('operation:test', 'settings.reasoning.mode')).toMatchObject({ reason: 'target_thinking_required' })
  })
  it('validates native settings on same-protocol model switches; never translates budget into an invented effort', () => {
    const requested = decodeGenerationIntentLayerV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'enabled' }, web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'gemini_generate_content', thinkingMode: 'budget', thinkingBudget: 8192, includeThoughts: 'enabled' } })
    const target = capability('gemini-generate-content-v1beta', { 'providerExtension.thinkingLevel': { domain: { kind: 'enum', values: ['low', 'high'] } } })
    const effective = compatibleGenerationIntentV2('operation:test', requested, target).value
    expect(effective.providerExtension).toEqual({ kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts: 'enabled' })
    expect(effective.reasoning).toEqual({ mode: 'enabled' })
    expect(readRequestAdaptationV2('operation:test', 'requestedIntent')).not.toBeNull()
  })
  it.each(['openrouter-chat-completions-v1', 'gemini-generate-content-v1beta'])(
    'defers verified non-UTF8 text before the inline compiler for %s', protocol => {
      const requested = decodeGenerationIntentLayerV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
        web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, providerExtension: { kind: 'none' }, attachments: [
          { kind: 'managed_file', assetId: 'asset:text', assetRevisionId: 'revision:text', assetSha256: hash, include: true, sendAs: 'provider_file', conversion: 'none' }] })
      expect(compatibleGenerationIntentV2('operation:test', requested, capability(protocol), new Map([
        ['revision:text', { mime: 'text/plain', sizeBytes: 3, assetKind: 'file', utf8Valid: false }],
      ])).value.attachments).toEqual([])
      expect(readRequestAdaptationV2('operation:test', 'requestedIntent')).not.toBeNull()
    })
  it.each(['openai-responses-v1', 'anthropic-messages-2023-06-01', 'openrouter-chat-completions-v1', 'gemini-generate-content-v1beta'])(
    'defers incompatible image metadata or inline sizes before compilation for %s', protocol => {
      for (const metadata of [{ mime: 'image/png', sizeBytes: 24, assetKind: 'file' }, { mime: 'image/png', sizeBytes: 50 * 1024 * 1024, assetKind: 'image' }]) {
        const requested = decodeGenerationIntentLayerV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
          web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, providerExtension: { kind: 'none' }, attachments: [
            { kind: 'managed_file', assetId: 'asset:image', assetRevisionId: 'revision:image', assetSha256: hash, include: true, sendAs: 'image_reference', conversion: 'none' }] })
        expect(compatibleGenerationIntentV2('operation:test', requested, capability(protocol), new Map([['revision:image', metadata]])).value.attachments).toEqual([])
        expect(readRequestAdaptationV2('operation:test', 'requestedIntent')).not.toBeNull()
      }
    })
  it.each(['openai-responses-v1', 'anthropic-messages-2023-06-01', 'openrouter-chat-completions-v1', 'gemini-generate-content-v1beta'])(
    'uses verified image and text revisions without inventing conversion provenance for %s', protocol => {
      const requested = decodeGenerationIntentLayerV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
        web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, providerExtension: { kind: 'none' }, attachments: [
          { kind: 'managed_file', assetId: 'asset:image', assetRevisionId: 'revision:image', assetSha256: hash, include: true, sendAs: 'image_reference', conversion: 'none' },
          { kind: 'managed_file', assetId: 'asset:text', assetRevisionId: 'revision:text', assetSha256: hash, include: true, sendAs: 'provider_file', conversion: 'none' },
        ] })
      const effective = compatibleGenerationIntentV2('operation:test', requested, capability(protocol), new Map([
        ['revision:image', { mime: 'image/png', sizeBytes: 32, assetKind: 'image' }],
        ['revision:text', { mime: 'text/markdown', sizeBytes: 48, assetKind: 'file' }],
      ])).value
      expect(effective.attachments).toHaveLength(2)
      expect(effective.attachments[0]).toMatchObject({ sendAs: 'image_reference', conversion: 'none' })
      expect(effective.attachments[1]).toMatchObject({ conversion: 'none', sendAs: protocol.startsWith('openrouter') || protocol.startsWith('gemini') ? 'inline_text' : 'provider_file' })
      expect((projectGenerationIntentLayerV2(requested).attachments as readonly unknown[])[1]).toMatchObject({ sendAs: 'provider_file', conversion: 'none' })
    })
  it.each(definitions.map(value => value.protocolContractId.value))('keeps saved intent while adapting to %s', protocol => {
    const requested = decodeGenerationIntentLayerV2({ schemaVersion: 2, generation: { temperature: 2, seed: 123 },
      reasoning: { mode: 'disabled' }, web: { mode: 'disabled' }, image: { mode: protocol === 'gemini-interactions-v1beta' ? 'generate' : 'disabled' },
      tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts: 'provider_default' } })
    const before = projectGenerationIntentLayerV2(requested)
    const target = capability(protocol)
    const effective = compatibleGenerationIntentV2('operation:test', requested, target)
    expect(effective.value.generation.temperature).toBeUndefined()
    expect(() => validateSemanticIntentAgainstResolvedCapabilityV2(target, effective.value)).not.toThrow()
    expect(projectGenerationIntentLayerV2(requested)).toEqual(before)
    expect(readRequestAdaptationV2('operation:test', 'requestedIntent')?.source).toEqual(before)
  })

  it.each([
    ['gemini-generate-content-v1beta', 'wire-adapter-20260817-gemini-content-text-2', []],
    ['gemini-interactions-v1beta', 'wire-adapter-20260817-gemini-interactions-image-1', ['providerExtension.thinkingLevel']],
    ['openrouter-chat-completions-v1', 'wire-adapter-20260817-openrouter-chat-text-1', ['attachments[].kind']],
    ['openai-responses-v1', 'wire-adapter-20261016-openai-responses-text-2', ['attachments[].referenceId', 'attachments[].referenceRevision', 'attachments[].originalUrl', 'attachments[].urlDigest', 'attachments[].declaredMediaType', 'attachments[].capturedAtMs', 'attachments[].provenance']],
    ['openai-responses-v1', 'wire-adapter-20260817-openai-responses-text-1', ['generation.temperature', 'generation.topP', 'attachments[].referenceId', 'attachments[].referenceRevision', 'attachments[].originalUrl', 'attachments[].urlDigest', 'attachments[].declaredMediaType', 'attachments[].capturedAtMs', 'attachments[].provenance']],
  ] as const)('keeps the exact frozen snapshot identity for reviewed predecessor %s / %s', (protocol, seed, omitted) => {
    const cap = capability(protocol)
    const current = runtimeSnapshotRecordFromResolvedCapabilityV2({ capability: cap, resolvedAt: '2026-10-16T00:00:00.000Z', tools: [] })
    const definition = definitions.find(value => value.protocolContractId.value === protocol)!
    const coverage = resolveEncodingCoverageRegistryV2({ providerId: cap.executionContext.binding.providerId.value, protocolContractId: protocol, operation: cap.executionContext.binding.operation })
    const projection = { providerId: coverage.providerId, protocolContractId: protocol, operation: coverage.operation,
      semanticPaths: coverage.semanticPaths.filter(path => !(omitted as readonly string[]).includes(path)) }
    const legacyId = `encoder-v2:${sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2({ projection,
      contractRevision: definition.contractRevision.value, registryRevision: definition.registryRevision.value, implementationRevision: seed })))}`
    const draft = JSON.parse(JSON.stringify(current))
    for (const key of ['snapshotHash', 'revision', 'encoderRevision', 'evidenceDigest', 'semanticFieldsDigest']) delete draft[key]
    for (const entry of draft.evidence) delete entry.entryDigest
    for (const field of draft.fields) if ((omitted as readonly string[]).includes(field.path)) {
      field.state = 'unknown'; field.evidenceIds = ['test.unknown']; delete field.domain
    }
    const frozen = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(draft, legacyId)
    const decoded = decodeRuntimeCapabilitySnapshotV2(frozen)
    expect(decoded.encoderRevision).toBe(legacyId)
    expect(decoded.snapshotHash.value).toBe(frozen.snapshotHash)
    expect(resolvedCapabilityFromRuntimeSnapshotV2(decoded).executionContext.encodingCoverage.encoderRevision).toBe(legacyId)
    expect(() => decodeRuntimeCapabilitySnapshotV2({ ...frozen, encoderRevision: `encoder-v2:${'0'.repeat(64)}` })).toThrow()
  })
})
