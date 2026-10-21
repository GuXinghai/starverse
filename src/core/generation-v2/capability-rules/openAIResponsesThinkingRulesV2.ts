import { decodeCapabilityRuleOwnershipSnapshotV1, type CapabilityRuleCoreRuleV1 } from './capabilityRuleCoreV1'
import type { CanonicalFactValueV1, CanonicalSemanticPathV1 } from '../model-facts/canonicalSourceFactsV1'

/** Exact model IDs with reviewed Responses reasoning-effort facts. */
export const OPENAI_RESPONSES_THINKING_BUNDLED_OWNER_V2 = 'bundled-openai-responses-thinking-v2'
export const OPENAI_RESPONSES_DOCUMENTED_REASONING_MODEL_IDS_V2 = Object.freeze([
  'gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-6.1-sol',
] as const)

const guide = 'https://developers.openai.com/api/docs/guides/reasoning'
const samplingGuide = 'https://developers.openai.com/api/docs/guides/latest-model'
const verifiedAt = '2026-10-17T00:00:00.000Z'
const profileId = 'openai-api-v1'

type ThinkingRow = Readonly<{
  model: typeof OPENAI_RESPONSES_DOCUMENTED_REASONING_MODEL_IDS_V2[number]
  efforts: readonly string[]
  canDisable: boolean
  providerDefault?: string
  modelUrl: string
}>

const rows: readonly ThinkingRow[] = Object.freeze([
  { model: 'gpt-6-luna', efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], canDisable: true, providerDefault: 'medium',
    modelUrl: 'https://developers.openai.com/api/docs/models/gpt-6-luna' },
  { model: 'gpt-6-sol', efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], canDisable: true, providerDefault: 'medium',
    modelUrl: 'https://developers.openai.com/api/docs/models/gpt-6-sol' },
  { model: 'gpt-6-astra', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], canDisable: false,
    modelUrl: 'https://developers.openai.com/api/docs/models/gpt-6-astra' },
  { model: 'gpt-6.1-sol', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], canDisable: false, providerDefault: 'medium',
    modelUrl: 'https://developers.openai.com/api/docs/models/gpt-6.1-sol' },
])

export function openAIResponsesThinkingRulesSnapshotV2() {
  const rules: CapabilityRuleCoreRuleV1[] = []
  function add(model: string, suffix: string, value: CanonicalFactValueV1, url: string) {
    const isTemperatureSupport = suffix === 'sampling.temperature.support'
    rules.push({
      ruleId: `openai-responses-thinking-v2.${model}.${suffix}`,
      label: null,
      description: isTemperatureSupport
        ? 'Bundled reviewed OpenAI Responses temperature support documentation; exact native model ID.'
        : 'Bundled reviewed OpenAI Responses reasoning-effort documentation; exact native model ID.',
      priority: 0,
      configured: 'default',
      providerAuthorityId: 'openai',
      endpointProfileId: profileId,
      selector: { kind: 'exact', nativeModelIds: [model] },
      assertion: { path: suffix as CanonicalSemanticPathV1, value },
      evidence: {
        evidenceSourceRef: isTemperatureSupport
          ? 'openai-latest-model-docs-2026-10-17' : 'openai-responses-reasoning-docs-2026-10-17',
        evidenceKind: 'explicit_provider',
        evidenceNote: 'Official exact-model Responses reasoning capability fact from the cited provider documentation.',
        identityEvidenceKind: 'official_exact_model_doc',
        identityEvidenceSourceRef: isTemperatureSupport
          ? 'openai-latest-model-docs-2026-10-17' : 'openai-responses-model-docs-2026-10-17',
        provenanceUrl: url,
        verifiedAt,
        derivation: null,
      },
    })
  }
  for (const row of rows) {
    add(row.model, 'reasoning.support', { kind: 'support', value: 'supported' }, guide)
    add(row.model, 'reasoning.required', { kind: 'boolean', value: !row.canDisable }, guide)
    add(row.model, 'reasoning.modes.nativeValues', {
      kind: 'native_string_set', values: row.canDisable ? ['enabled', 'disabled'] : ['enabled'], completeness: 'complete',
    }, guide)
    add(row.model, 'reasoning.effort.nativeValues', { kind: 'native_string_set', values: row.efforts, completeness: 'complete' }, row.modelUrl)
    if (row.providerDefault !== undefined) {
      add(row.model, 'reasoning.effort.providerDefault', { kind: 'native_string', value: row.providerDefault }, row.modelUrl)
    }
  }
  // OpenAI's latest-model guide documents temperature for Luna and Sol when
  // reasoning effort is none. The request policy defers it for non-none effort.
  for (const model of ['gpt-6-luna', 'gpt-6-sol'] as const) {
    add(model, 'sampling.temperature.support', { kind: 'support', value: 'supported' },
      `${samplingGuide}?model=${model}`)
  }
  return decodeCapabilityRuleOwnershipSnapshotV1({ schemaVersion: 1, ownership: 'cloud',
    ownerId: OPENAI_RESPONSES_THINKING_BUNDLED_OWNER_V2,
    packs: [{ schemaVersion: 1, packId: 'bundled-openai-responses-thinking-v2',
      displayName: 'OpenAI Responses reasoning (bundled documentation)',
      description: 'Exact model-scoped Responses reasoning effort domains from OpenAI documentation.',
      priority: -100, mode: 'no_control', target: 'enabled', rules }] })
}
