import { decodeCapabilityRuleOwnershipSnapshotV1, type CapabilityRuleCoreRuleV1 } from './capabilityRuleCoreV1'
import type { CanonicalFactValueV1, CanonicalSemanticPathV1 } from '../model-facts/canonicalSourceFactsV1'

/** Exact native model selectors from Anthropic's published Messages API matrix. */
export const ANTHROPIC_THINKING_BUNDLED_OWNER_V2 = 'bundled-anthropic-thinking-v2'
const thinking = 'https://platform.claude.com/docs/en/build-with-claude/thinking'
const effort = 'https://platform.claude.com/docs/en/build-with-claude/effort'
const verifiedAt = '2026-10-17T00:00:00.000Z'
const apiProfile = 'anthropic-developer-api-2023-06-01'
const modelsAuthority = 'anthropic'

type ThinkingRow = Readonly<{
  models: readonly string[]
  acceptedTypes: readonly string[]
  omittedBehavior: 'off' | 'adaptive'
  recommendedMode: 'provider_default' | 'adaptive' | 'manual'
  required: boolean
  defaultDisplay: 'summarized' | 'omitted'
  manualBudget?: boolean
  efforts?: readonly string[]
  defaultEffort?: string
  disabledAllowedEfforts?: readonly string[]
}>

export function anthropicThinkingRulesSnapshotV2() {
  const rules: CapabilityRuleCoreRuleV1[] = []
  function add(models: readonly string[], suffix: string, value: CanonicalFactValueV1, url: string) {
    rules.push({
      ruleId: `anthropic-thinking-v2.${models[0]}.${suffix}`,
      label: null,
      description: 'Bundled reviewed Anthropic Messages API documentation; exact native model ID.',
      priority: 0,
      configured: 'default',
      providerAuthorityId: modelsAuthority,
      endpointProfileId: apiProfile,
      selector: { kind: 'exact', nativeModelIds: models },
      assertion: { path: (suffix.startsWith('reasoning.effort.') ? suffix : `anthropic.messages.thinking.${suffix}`) as CanonicalSemanticPathV1, value },
      evidence: {
        evidenceSourceRef: 'anthropic-thinking-effort-docs-2026-10-17',
        evidenceKind: 'explicit_provider',
        evidenceNote: 'Official per-model Messages API thinking matrix; adaptive, enabled, between_tools, disabled, display, and effort support are recorded separately.',
        identityEvidenceKind: 'official_exact_model_doc',
        identityEvidenceSourceRef: 'anthropic-model-ids-docs-2026-10-17',
        provenanceUrl: url,
        verifiedAt,
        derivation: null,
      },
    })
  }
  function addRow(row: ThinkingRow) {
    add(row.models, 'acceptedTypes', { kind: 'native_string_set', values: row.acceptedTypes, completeness: 'complete' }, thinking)
    add(row.models, 'omittedBehavior', { kind: 'native_string', value: row.omittedBehavior }, thinking)
    add(row.models, 'recommendedMode', { kind: 'native_string', value: row.recommendedMode }, thinking)
    add(row.models, 'required', { kind: 'boolean', value: row.required }, thinking)
    add(row.models, 'defaultDisplay', { kind: 'native_string', value: row.defaultDisplay }, thinking)
    if (row.manualBudget) {
      add(row.models, 'manualBudgetDomain', { kind: 'integer_domain', unit: 'token',
        interval: { min: 1_024, minInclusive: true, maxInclusive: false }, completeness: 'complete' }, thinking)
    }
    if (row.efforts) {
      add(row.models, 'reasoning.effort.nativeValues', { kind: 'native_string_set', values: row.efforts, completeness: 'complete' }, effort)
      if (row.defaultEffort) add(row.models, 'reasoning.effort.providerDefault', { kind: 'native_string', value: row.defaultEffort }, effort)
    }
    if (row.disabledAllowedEfforts) {
      add(row.models, 'disabledAllowedEfforts', { kind: 'native_string_set', values: row.disabledAllowedEfforts, completeness: 'complete' }, thinking)
    }
  }

  const allEfforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const
  const standardEfforts = ['low', 'medium', 'high', 'max'] as const
  const adaptiveAlwaysOn = (models: readonly string[], efforts: readonly string[], defaultEffort = 'high') => addRow({
    models, acceptedTypes: ['adaptive'], omittedBehavior: 'adaptive', recommendedMode: 'provider_default', required: true,
    defaultDisplay: 'omitted', efforts, defaultEffort,
  })

  adaptiveAlwaysOn(['claude-opus-5-5'], allEfforts, 'medium')
  addRow({ models: ['claude-sonnet-5-5'], acceptedTypes: ['adaptive', 'between_tools'], omittedBehavior: 'adaptive',
    recommendedMode: 'provider_default', required: true, defaultDisplay: 'omitted', efforts: allEfforts, defaultEffort: 'high' })
  addRow({ models: ['claude-haiku-5-5'], acceptedTypes: ['adaptive', 'disabled'], omittedBehavior: 'adaptive',
    recommendedMode: 'provider_default', required: false, defaultDisplay: 'omitted', efforts: allEfforts, defaultEffort: 'medium',
    disabledAllowedEfforts: ['low', 'medium', 'high'] })
  adaptiveAlwaysOn(['claude-fable-5-1', 'claude-mythos-5-1'], allEfforts)
  adaptiveAlwaysOn(['claude-fable-5', 'claude-mythos-5'], allEfforts)
  addRow({ models: ['claude-mythos-preview'], acceptedTypes: ['adaptive', 'enabled'], omittedBehavior: 'adaptive',
    recommendedMode: 'provider_default', required: true, defaultDisplay: 'omitted', manualBudget: true,
    efforts: standardEfforts, defaultEffort: 'high' })
  addRow({ models: ['claude-opus-5'], acceptedTypes: ['adaptive', 'disabled'], omittedBehavior: 'adaptive',
    recommendedMode: 'provider_default', required: false, defaultDisplay: 'omitted', efforts: allEfforts, defaultEffort: 'high',
    disabledAllowedEfforts: ['low', 'medium', 'high'] })
  addRow({ models: ['claude-sonnet-5'], acceptedTypes: ['adaptive', 'disabled'], omittedBehavior: 'adaptive',
    recommendedMode: 'provider_default', required: false, defaultDisplay: 'omitted', efforts: allEfforts, defaultEffort: 'high' })

  for (const model of ['claude-opus-4-8', 'claude-opus-4-7']) addRow({
    models: [model], acceptedTypes: ['adaptive', 'disabled'], omittedBehavior: 'off', recommendedMode: 'adaptive',
    required: false, defaultDisplay: 'omitted', efforts: allEfforts, defaultEffort: 'high',
  })
  for (const model of ['claude-opus-4-6', 'claude-sonnet-4-6']) addRow({
    models: [model], acceptedTypes: ['adaptive', 'enabled', 'disabled'], omittedBehavior: 'off', recommendedMode: 'adaptive',
    required: false, defaultDisplay: 'summarized', manualBudget: true, efforts: standardEfforts, defaultEffort: 'high',
  })
  addRow({ models: ['claude-opus-4-5', 'claude-opus-4-5-20251101', 'claude-sonnet-4-5', 'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5', 'claude-haiku-4-5-20251001'], acceptedTypes: ['enabled', 'disabled'], omittedBehavior: 'off',
    recommendedMode: 'manual', required: false, defaultDisplay: 'summarized', manualBudget: true })

  return decodeCapabilityRuleOwnershipSnapshotV1({ schemaVersion: 1, ownership: 'cloud', ownerId: ANTHROPIC_THINKING_BUNDLED_OWNER_V2,
    packs: [{ schemaVersion: 1, packId: 'bundled-anthropic-thinking-v2', displayName: 'Anthropic thinking (bundled documentation)',
      description: 'Exact model-scoped Messages API thinking and effort rules from Anthropic documentation.',
      priority: -100, mode: 'no_control', target: 'enabled', rules }] })
}
