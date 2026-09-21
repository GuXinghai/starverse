import { describe, expect, it } from 'vitest'
import {
  buildCanonicalSourceRevisionRefV1,
  buildCanonicalSubjectFactV1,
  type CanonicalFactValueV1,
  type CanonicalSemanticPathV1,
} from '../model-facts/canonicalSourceFactsV1'
import {
  buildExplicitAssertionV1,
  buildObservationProvenanceV1,
  presentOutcomeV1,
} from '../model-facts/sourceAdapterV1'
import { canonicalizeModelCapabilityFieldV2 } from '../capability/canonicalModelFactsV2'
import {
  applyCapabilityRuleProjectionV2,
  assertCapabilityRuleProjectionIdentityV2,
  projectMaterializedCapabilityRuleProjectionV2,
  MaterializedCapabilityRuleProjectionV2Error,
} from './materializedCapabilityRuleProjectionV2'

const subject = Object.freeze({ providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-test' })
const sourceRevision = buildCanonicalSourceRevisionRefV1({
  sourceKind: 'capability_rule', sourceScopeId: 'scope:rules',
  rawSourceSnapshotRevision: 'raw-snapshot:v1', adapterRevision: 'adapter:v1',
  coverageManifestRevision: 'coverage:v1', providerAuthorityRegistryRevision: 'registry:v1',
})
const rawPayloadRef = Object.freeze({
  storeId: `canonical-raw-v1:${'a'.repeat(64)}`,
  persistedPayloadSha256: 'a'.repeat(64), recordKey: 'rules', sanitizerRevision: 'sanitizer:v1',
})

function claim(input: Readonly<{
  path: CanonicalSemanticPathV1
  value: CanonicalFactValueV1
  selectorKind?: 'exact' | 'regex'
  priority?: number
  ruleId?: string
  sourceClaimIdentity?: string
}>) {
  const selectorKind = input.selectorKind ?? 'exact'
  const priority = input.priority ?? 0
  const provenance = buildObservationProvenanceV1({ sourceRevision,
    sourceFieldRefs: [{ rawPayloadRef, sourceRecordIdentity: input.ruleId ?? 'rule',
      sourceFieldPath: `rule.${input.ruleId ?? 'rule'}`, observedPresence: 'present' }],
    adapterId: 'materialized-rules:test', adapterRevision: sourceRevision.adapterRevision,
    mappingId: 'rules:test',
  })
  return buildExplicitAssertionV1({ subject, sourceRevision, path: input.path, value: input.value,
    sourceClaimIdentity: input.sourceClaimIdentity ?? `claim:${input.ruleId ?? 'rule'}`,
    evidenceRefs: ['user-note-must-not-be-read'], observationProvenance: provenance,
    ruleClaim: { ownerKind: 'built_in', ownerId: 'owner', packId: 'pack',
      ruleId: input.ruleId ?? 'rule', packRevision: 'pack-revision', ruleRevision: `rule-revision:${input.ruleId ?? 'rule'}`,
      selectorKind, selectorRef: selectorKind === 'regex' ? 'not-a-regexp[' : 'exact-selector',
      packPriority: 0, rulePriority: priority, effectiveRulePriority: priority,
      prioritySemanticsRevision: 'priority:v1' },
  })
}

function fact(assertions: readonly ReturnType<typeof claim>[]) {
  return buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision,
    recordOutcome: assertions.length === 0 ? 'no_matching_claims' : 'present',
    outcomes: assertions.map((assertion) => presentOutcomeV1({ assertion,
      observationIdentity: `observation:${assertion.provenance.sourceClaimIdentity}` })),
    unmappedSourceFields: [],
  })
}

function baseField(input: Readonly<{
  path: 'reasoning.mode' | 'reasoning.effort' | 'image.aspectRatio' | 'web.types' |
    'generation.maxOutputTokens' | 'generation.temperature'
  state?: 'supported' | 'unsupported'
  domain?: Record<string, unknown>
  constraints?: readonly Record<string, unknown>[]
}>) {
  return canonicalizeModelCapabilityFieldV2({ path: input.path, state: input.state ?? 'supported',
    ...(input.domain === undefined ? {} : { domain: input.domain }), constraints: input.constraints ?? [], evidenceIds: [] })
}

describe('materializedCapabilityRuleProjectionV2', () => {
  it('projects an empty exact subject fact without reading selectors', () => {
    const projection = projectMaterializedCapabilityRuleProjectionV2(fact([]).payload)
    expect(projection.rules).toEqual([])
    expect(projection.fields).toEqual([])
    expect(projection.evidence).toEqual([])
    expect(projection.identity).toEqual(subjectToIdentity())
  })

  it('prefers exact claims, then effective priority, and retains equal-value winners', () => {
    const projection = projectMaterializedCapabilityRuleProjectionV2(fact([
      claim({ path: 'reasoning.support', value: { kind: 'support', value: 'unsupported' },
        selectorKind: 'regex', priority: 100, ruleId: 'regex-high' }),
      claim({ path: 'reasoning.support', value: { kind: 'support', value: 'supported' },
        selectorKind: 'exact', priority: 1, ruleId: 'exact-low' }),
      claim({ path: 'reasoning.support', value: { kind: 'support', value: 'supported' },
        selectorKind: 'exact', priority: 1, ruleId: 'exact-tie' }),
    ]).payload)
    expect(projection.rules).toHaveLength(2)
    expect(projection.rules.every((winner) => winner.selectorKind === 'exact')).toBe(true)
    expect(projection.evidence).toHaveLength(2)
  })

  it('does not execute a regex selector while projecting a materialized claim', () => {
    const projection = projectMaterializedCapabilityRuleProjectionV2(fact([
      claim({ path: 'reasoning.support', value: { kind: 'support', value: 'supported' },
        selectorKind: 'regex', ruleId: 'opaque-regex' }),
    ]).payload)
    expect(projection.rules[0]?.selectorKind).toBe('regex')
    expect(projection.overlays.find((field) => field.path === 'reasoning.mode')?.state).toBe('supported')
  })

  it('fails deterministically on equal-top differing canonical values', () => {
    expect(() => projectMaterializedCapabilityRuleProjectionV2(fact([
      claim({ path: 'reasoning.support', value: { kind: 'support', value: 'supported' }, ruleId: 'a' }),
      claim({ path: 'reasoning.support', value: { kind: 'support', value: 'unsupported' }, ruleId: 'b' }),
    ]).payload)).toThrowError(new MaterializedCapabilityRuleProjectionV2Error(
      'GENERATION_V2_CAPABILITY_RULE_PROJECTION_CONFLICT'))
  })

  it('fails closed when the temporary consumer projection has no typed mapping for a winning path', () => {
    expect(() => projectMaterializedCapabilityRuleProjectionV2(fact([
      claim({ path: 'structuredOutput.support', value: { kind: 'support', value: 'unsupported' } }),
    ]).payload)).toThrowError(new MaterializedCapabilityRuleProjectionV2Error(
      'GENERATION_V2_CAPABILITY_RULE_PROJECTION_INVALID'))
  })

  it('emits deterministic capability-rule evidence with a null verification timestamp', () => {
    const projection = projectMaterializedCapabilityRuleProjectionV2(fact([
      claim({ path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }),
    ]).payload)
    expect(projection.evidence[0]).toMatchObject({ kind: 'capability_rule', verifiedAt: null })
    expect(projection.evidence[0]?.contentDigest).toMatch(/^[0-9a-f]{64}$/u)
    expect(projection.evidence[0]?.sourceRef).toContain('canonical-subject-fact-v1:')
  })

  it('applies only frozen typed mappings to existing consumer fields', () => {
    const projection = projectMaterializedCapabilityRuleProjectionV2(fact([
      claim({ path: 'reasoning.support', value: { kind: 'support', value: 'supported' }, ruleId: 'reasoning-support' }),
      claim({ path: 'reasoning.effort.nativeValues', value: { kind: 'native_string_set', values: ['low', 'high'], completeness: 'complete' }, ruleId: 'effort-values' }),
      claim({ path: 'reasoning.effort.providerDefault', value: { kind: 'native_string', value: 'low' }, ruleId: 'effort-default' }),
      claim({ path: 'image.generation.aspectRatios', value: { kind: 'aspect_ratio_set', values: [{ width: 1, height: 1 }, { width: 16, height: 9 }], completeness: 'complete' }, ruleId: 'ratios' }),
      claim({ path: 'search.image.support', value: { kind: 'support', value: 'unsupported' }, ruleId: 'image-search' }),
      claim({ path: 'limits.output.maxTokens', value: { kind: 'integer', value: 512, unit: 'token' }, ruleId: 'max-output' }),
      claim({ path: 'sampling.temperature.support', value: { kind: 'support', value: 'supported' }, ruleId: 'temperature-support' }),
      claim({ path: 'sampling.temperature.providerDefault', value: { kind: 'decimal', value: 0.7 }, ruleId: 'temperature-default' }),
      claim({ path: 'sampling.temperature.modelMaximum', value: { kind: 'decimal', value: 1.5 }, ruleId: 'temperature-max' }),
    ]).payload)
    const result = applyCapabilityRuleProjectionV2({
      baseEvidence: [],
      baseFields: [
        baseField({ path: 'reasoning.mode', domain: { kind: 'enum', values: ['enabled'] } }),
        baseField({ path: 'reasoning.effort', domain: { kind: 'enum', values: ['medium'] } }),
        baseField({ path: 'image.aspectRatio', domain: { kind: 'enum', values: ['auto'] }, constraints: [{ kind: 'requires_value', path: 'image.mode', values: ['generate'] }] }),
        baseField({ path: 'web.types', domain: { kind: 'enum_list', values: ['web', 'image'], maxItems: 2 } }),
        baseField({ path: 'generation.maxOutputTokens', domain: { kind: 'range', min: 1, max: 4096, integer: true } }),
        baseField({ path: 'generation.temperature', domain: { kind: 'range', min: 0, max: 2, integer: false } }),
      ],
      projection,
    })
    expect(result.fields.find((field) => field.path === 'reasoning.mode')?.domain).toEqual({ kind: 'enum', values: ['enabled'] })
    expect(result.fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({
      domain: { kind: 'enum', values: ['high', 'low'] }, defaultValue: 'low',
    })
    expect(result.fields.find((field) => field.path === 'image.aspectRatio')).toMatchObject({
      domain: { kind: 'enum', values: ['1:1', '16:9'] },
      constraints: [{ kind: 'requires_value', path: 'image.mode', values: ['generate'] }],
    })
    expect(result.fields.find((field) => field.path === 'web.types')?.domain).toEqual({ kind: 'enum_list', values: ['web'], maxItems: 2 })
    expect(result.fields.find((field) => field.path === 'generation.maxOutputTokens')?.domain).toMatchObject({ max: 512 })
    expect(result.fields.find((field) => field.path === 'generation.temperature')).toMatchObject({
      domain: { kind: 'range', min: 0, max: 1.5, integer: false }, defaultValue: 0.7,
    })
    expect(result.fields.some((field) => field.path === 'tools.mode')).toBe(false)
    const evidence = new Map(result.evidence.map((entry) => [entry.evidenceId, entry.effect]))
    for (const field of result.fields.filter((candidate) => projection.overlays.some((overlay) =>
      overlay.path === candidate.path))) {
      const expected = field.state === 'unsupported' ? 'rejects' : 'supports'
      expect(field.evidenceIds.every((evidenceId) => evidence.get(evidenceId) === expected)).toBe(true)
    }
  })

  it('replaces incompatible base evidence when a materialized Rule changes support state', () => {
    const projection = projectMaterializedCapabilityRuleProjectionV2(fact([
      claim({ path: 'reasoning.support', value: { kind: 'support', value: 'unsupported' } }),
    ]).payload)
    const result = applyCapabilityRuleProjectionV2({
      baseEvidence: [{ evidenceId: 'base-support', effect: 'supports' }],
      baseFields: [canonicalizeModelCapabilityFieldV2({ path: 'reasoning.mode', state: 'supported',
        domain: { kind: 'enum', values: ['enabled'] }, constraints: [], evidenceIds: ['base-support'] })],
      projection,
    })
    const field = result.fields[0]!
    expect(field).toMatchObject({ state: 'unsupported', evidenceIds: projection.overlays[0]!.evidenceIds })
    expect(field.evidenceIds).not.toContain('base-support')
    const effects = new Map(result.evidence.map((entry) => [entry.evidenceId, entry.effect]))
    expect(field.evidenceIds.every((evidenceId) => effects.get(evidenceId) === 'rejects')).toBe(true)
  })

  it('fails closed instead of ignoring a Rule overlay that cannot form a valid field', () => {
    const projection = projectMaterializedCapabilityRuleProjectionV2(fact([
      claim({ path: 'reasoning.effort.providerDefault', value: { kind: 'native_string', value: 'high' } }),
    ]).payload)
    expect(() => applyCapabilityRuleProjectionV2({
      baseEvidence: [{ evidenceId: 'base-reject', effect: 'rejects' }],
      baseFields: [canonicalizeModelCapabilityFieldV2({ path: 'reasoning.effort', state: 'unsupported',
        constraints: [], evidenceIds: ['base-reject'] })],
      projection,
    })).toThrowError(new MaterializedCapabilityRuleProjectionV2Error(
      'GENERATION_V2_CAPABILITY_RULE_PROJECTION_INVALID'))
  })

  it('fails closed when a Rule upper bound would create an empty numeric domain', () => {
    const projection = projectMaterializedCapabilityRuleProjectionV2(fact([
      claim({ path: 'sampling.temperature.modelMaximum', value: { kind: 'decimal', value: -1 } }),
    ]).payload)
    expect(() => applyCapabilityRuleProjectionV2({
      baseEvidence: [],
      baseFields: [baseField({ path: 'generation.temperature',
        domain: { kind: 'range', min: 0, max: 2, integer: false } })],
      projection,
    })).toThrowError(new MaterializedCapabilityRuleProjectionV2Error(
      'GENERATION_V2_CAPABILITY_RULE_PROJECTION_INVALID'))
  })

  it('fails closed when an explicit Rule default is outside the final domain', () => {
    const projection = projectMaterializedCapabilityRuleProjectionV2(fact([
      claim({ path: 'sampling.temperature.modelMaximum', value: { kind: 'decimal', value: 1.5 },
        ruleId: 'temperature-max' }),
      claim({ path: 'sampling.temperature.providerDefault', value: { kind: 'decimal', value: 2 },
        ruleId: 'temperature-default' }),
    ]).payload)
    expect(() => applyCapabilityRuleProjectionV2({
      baseEvidence: [],
      baseFields: [baseField({ path: 'generation.temperature',
        domain: { kind: 'range', min: 0, max: 2, integer: false } })],
      projection,
    })).toThrowError(new MaterializedCapabilityRuleProjectionV2Error(
      'GENERATION_V2_CAPABILITY_RULE_PROJECTION_INVALID'))
  })

  it('asserts the exact consumer identity', () => {
    const projection = projectMaterializedCapabilityRuleProjectionV2(fact([]).payload)
    expect(() => assertCapabilityRuleProjectionIdentityV2(projection, subjectToIdentity())).not.toThrow()
    expect(() => assertCapabilityRuleProjectionIdentityV2(projection,
      { ...subjectToIdentity(), nativeModelId: 'other' })).toThrow()
    expect(() => projectMaterializedCapabilityRuleProjectionV2({ payload: fact([]).payload,
      identity: { ...subjectToIdentity(), nativeModelId: 'other' } })).toThrowError(
      new MaterializedCapabilityRuleProjectionV2Error('GENERATION_V2_CAPABILITY_RULE_PROJECTION_INVALID'))
  })
})

function subjectToIdentity() {
  return { providerId: subject.providerAuthorityId, endpointProfileId: subject.endpointProfileId,
    nativeModelId: subject.nativeModelId }
}
