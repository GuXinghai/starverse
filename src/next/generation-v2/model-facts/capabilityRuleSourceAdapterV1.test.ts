import { describe, expect, it } from 'vitest'
import {
  projectCapabilityRulePackContentV2,
  type CapabilityRuleDefinitionV2,
  type CapabilityRulePackDefinitionV2,
  type PersistedCapabilityRuleV2,
} from '../capability-rules/capabilityRuleV2'
import { BUILTIN_CAPABILITY_RULE_PACKS_V2 } from '../capability-rules/builtinCapabilityRulePacksV2'
import {
  buildCanonicalSourceRevisionRefV1,
  type CanonicalModelSubjectV1,
  type RawSourceSnapshotRefV1,
} from './canonicalSourceFactsV1'
import {
  CAPABILITY_RULE_PRIORITY_SEMANTICS_REVISION_V1,
  CAPABILITY_RULE_SOURCE_ADAPTER_REVISION_V1,
  buildCapabilityRuleSourceSnapshotV1,
  canonicalizeCapabilityRuleSourceRulesV1,
  createCapabilityRuleSourceAdapterV1,
} from './capabilityRuleSourceAdapterV1'
import { PROVIDER_AUTHORITY_REGISTRY_REVISION_V1 } from './providerAuthorityRegistryV1'
import { buildRawSourceSnapshotRefV1, InMemoryRawPayloadStoreV1,
  sanitizeRawSourcePayloadV1 } from './rawSourceSnapshotV1'
import { publishCanonicalSubjectFactV1 } from './sourceAdapterV1'
import { CAPABILITY_RULE_COVERAGE_MANIFEST_V1 } from './sourceCoverageManifestV1'

function persistedRules(pack: CapabilityRulePackDefinitionV2): readonly PersistedCapabilityRuleV2[] {
  const projected = projectCapabilityRulePackContentV2(pack)
  return Object.freeze(projected.rules.map((entry) => Object.freeze({ ...entry.definition,
    ownerKind: pack.ownerKind, ownerId: pack.ownerId, packId: pack.packId,
    packVersion: pack.packVersion, packRevision: projected.packRevision, packEnabled: pack.enabled,
    ruleRevision: entry.ruleRevision, contentDigest: entry.contentDigest })))
}

function sourceRule(input: Readonly<{
  ruleId: string
  selector: CapabilityRuleDefinitionV2['selector']
  values: readonly string[]
  priority: number
  state?: CapabilityRuleDefinitionV2['state']
  evidenceKind?: CapabilityRuleDefinitionV2['evidenceKind']
}>): CapabilityRuleDefinitionV2 {
  return {
    ruleId: input.ruleId, providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
    selector: input.selector, semanticPath: 'reasoning.effort', state: input.state ?? 'supported',
    domain: { kind: 'enum', values: input.values }, constraints: [], priority: input.priority, enabled: true,
    evidenceSourceRef: `evidence.${input.ruleId}`, evidenceKind: input.evidenceKind ?? 'explicit_provider',
    evidenceNote: `Focused adapter evidence for ${input.ruleId}.`,
    identityEvidenceKind: input.selector.kind === 'exact' ? 'provider_archive' : 'derived_selector',
    identityEvidenceSourceRef: `identity.${input.ruleId}`,
    provenanceUrl: 'https://api-docs.deepseek.com/guides/thinking_mode',
    verifiedAt: '2026-08-28T00:00:00.000Z',
  }
}

function pack(packId: string, rule: CapabilityRuleDefinitionV2): CapabilityRulePackDefinitionV2 {
  return { schemaVersion: 1, ownerKind: 'user', ownerId: 'user:adapter-test', packId,
    packVersion: 1, enabled: true, rules: [rule] }
}

function rawSnapshot(rules: readonly PersistedCapabilityRuleV2[]): Readonly<{
  snapshot: RawSourceSnapshotRefV1
  store: InMemoryRawPayloadStoreV1
}> {
  const payload = sanitizeRawSourcePayloadV1({ recordKey: 'capability-rules-v2',
    payload: buildCapabilityRuleSourceSnapshotV1(canonicalizeCapabilityRuleSourceRulesV1(rules)) })
  const store = new InMemoryRawPayloadStoreV1()
  store.put(payload)
  return Object.freeze({ store, snapshot: buildRawSourceSnapshotRefV1({ sourceKind: 'capability_rule',
    sourceScopeId: 'capability-rules-v2', recordSetCompleteness: 'not_applicable',
    rawEnvelopeRefs: [payload.ref] }) })
}

function adapt(rules: readonly PersistedCapabilityRuleV2[], subject: CanonicalModelSubjectV1) {
  const { snapshot, store } = rawSnapshot(rules)
  const sourceRevision = buildCanonicalSourceRevisionRefV1({ sourceKind: 'capability_rule',
    sourceScopeId: snapshot.sourceScopeId, rawSourceSnapshotRevision: snapshot.rawSourceSnapshotRevision,
    adapterRevision: CAPABILITY_RULE_SOURCE_ADAPTER_REVISION_V1,
    coverageManifestRevision: CAPABILITY_RULE_COVERAGE_MANIFEST_V1.manifestRevision,
    providerAuthorityRegistryRevision: PROVIDER_AUTHORITY_REGISTRY_REVISION_V1 })
  const adapter = createCapabilityRuleSourceAdapterV1({ rawPayloadReader: store })
  return publishCanonicalSubjectFactV1({ adapter, rawSnapshot: snapshot, sourceRevision, subject }).payload
}

const DEEPSEEK_SUBJECT = Object.freeze({ providerAuthorityId: 'deepseek',
  endpointProfileId: 'deepseek-stable-api-v1', nativeModelId: 'deepseek-v4-pro' })

describe('Capability Rule source adapter V1', () => {
  it('retains every exact and regex claim without specificity, priority, or conflict resolution', () => {
    const regex = sourceRule({ ruleId: 'regex-effort', selector: { kind: 'regex',
      value: '^deepseek-v4-(?:flash|pro)$', positiveExamples: ['deepseek-v4-flash', 'deepseek-v4-pro'],
      negativeExamples: ['deepseek-v4-pro-preview'] }, values: ['low'], priority: 500 })
    const exact = sourceRule({ ruleId: 'exact-effort', selector: { kind: 'exact', values: ['deepseek-v4-pro'] },
      values: ['max'], priority: -100 })
    const payload = adapt([
      ...persistedRules(pack('user.regex', regex)),
      ...persistedRules(pack('user.exact', exact)),
    ], DEEPSEEK_SUBJECT)

    const assertions = payload.outcomes.flatMap((outcome) =>
      outcome.currentObservation.kind === 'present_valid' ? [outcome.currentObservation.assertion] : [])
    expect(assertions).toHaveLength(2)
    expect(assertions.map((assertion) => assertion.value)).toEqual(expect.arrayContaining([
      { kind: 'native_string_set', values: ['low'], completeness: 'complete' },
      { kind: 'native_string_set', values: ['max'], completeness: 'complete' },
    ]))
    expect(assertions.map((assertion) => assertion.provenance.ruleClaim)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'regex-effort', selectorKind: 'regex', packPriority: 0,
        rulePriority: 500, effectiveRulePriority: 500,
        prioritySemanticsRevision: CAPABILITY_RULE_PRIORITY_SEMANTICS_REVISION_V1 }),
      expect.objectContaining({ ruleId: 'exact-effort', selectorKind: 'exact', packPriority: 0,
        rulePriority: -100, effectiveRulePriority: -100,
        prioritySemanticsRevision: CAPABILITY_RULE_PRIORITY_SEMANTICS_REVISION_V1 }),
    ]))
    expect(assertions[0]!.provenance.sourceFieldRefs[0]!.sourceFieldPath)
      .toContain('evidenceSourceRef,evidenceKind,evidenceNote')
    expect(assertions[0]!.provenance.sourceFieldRefs[0]!.sourceFieldPath)
      .toContain('identityEvidenceSourceRef,provenanceUrl,verifiedAt')
  })

  it('maps current built-in Anthropic effort and Google image/search rules into typed canonical facts', () => {
    const rules = BUILTIN_CAPABILITY_RULE_PACKS_V2.flatMap(persistedRules)
    const anthropic = adapt(rules, { providerAuthorityId: 'anthropic',
      endpointProfileId: 'anthropic-developer-api-2023-06-01', nativeModelId: 'claude-opus-4-6' })
    const anthropicAssertions = anthropic.outcomes.flatMap((outcome) =>
      outcome.currentObservation.kind === 'present_valid' ? [outcome.currentObservation.assertion] : [])
    expect(anthropicAssertions.map((assertion) => assertion.path)).toEqual([
      'generation.effort.nativeValues', 'reasoning.support',
    ])
    expect(anthropicAssertions.find((assertion) => assertion.path === 'generation.effort.nativeValues')?.value)
      .toEqual({ kind: 'native_string_set', values: ['high', 'low', 'max', 'medium'], completeness: 'complete' })

    const google = adapt(rules, { providerAuthorityId: 'google-ai-studio',
      endpointProfileId: 'gemini-developer-api-v1beta', nativeModelId: 'gemini-3.1-flash-image' })
    const googleAssertions = google.outcomes.flatMap((outcome) =>
      outcome.currentObservation.kind === 'present_valid' ? [outcome.currentObservation.assertion] : [])
    expect(googleAssertions.map((assertion) => assertion.path)).toEqual(expect.arrayContaining([
      'image.generation.support', 'image.generation.aspectRatios',
      'image.generation.resolutionPresets.nativeValues', 'image.generation.resolutionPreset.providerDefault',
      'reasoning.support', 'reasoning.effort.nativeValues', 'reasoning.effort.providerDefault',
      'search.web.support', 'search.image.support',
    ]))
    expect(googleAssertions.filter((assertion) => assertion.path === 'search.web.support')).toHaveLength(2)
    expect(googleAssertions.find((assertion) => assertion.path === 'image.generation.aspectRatios')?.value)
      .toMatchObject({ kind: 'aspect_ratio_set', completeness: 'complete' })
    expect(googleAssertions.find((assertion) =>
      assertion.path === 'image.generation.resolutionPreset.providerDefault')?.value)
      .toEqual({ kind: 'native_string', value: '1K' })
  })

  it('marks execution-policy and unregistered derived rows invalid instead of publishing facts', () => {
    const confirmation = sourceRule({ ruleId: 'confirmation-only', selector: { kind: 'exact',
      values: ['deepseek-v4-pro'] }, values: ['high'], priority: 100, state: 'requires_confirmation' })
    const derived = sourceRule({ ruleId: 'underived-effort', selector: { kind: 'regex',
      value: '^deepseek-v4-(?:flash|pro)$', positiveExamples: ['deepseek-v4-flash', 'deepseek-v4-pro'],
      negativeExamples: ['deepseek-v4-preview'] }, values: ['max'], priority: 200,
      evidenceKind: 'derived_empirical' })
    const payload = adapt([
      ...persistedRules(pack('user.confirmation', confirmation)),
      ...persistedRules(pack('user.derived', derived)),
    ], DEEPSEEK_SUBJECT)

    expect(payload.recordOutcome).toBe('present')
    expect(payload.outcomes).toHaveLength(2)
    expect(payload.outcomes.every((outcome) => outcome.currentObservation.kind === 'invalid')).toBe(true)
    expect(payload.outcomes.map((outcome) => outcome.currentObservation)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'invalid',
        errorCode: 'GENERATION_V2_CAPABILITY_RULE_SOURCE_BOUNDARY_INVALID' }),
    ]))
  })
})
