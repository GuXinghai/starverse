import { decodeCapabilityRuleOwnershipSnapshotV1, type CapabilityRuleCoreRuleV1 } from './capabilityRuleCoreV1'
import type { CanonicalFactValueV1, CanonicalSemanticPathV1 } from '../model-facts/canonicalSourceFactsV1'

/** Reviewed documentation corpus, not a compiler/model-name heuristic. Exact IDs only. */
export const GEMINI_THINKING_BUNDLED_OWNER_V2 = 'bundled-gemini-thinking-v2'
const thinking = 'https://ai.google.dev/gemini-api/docs/generate-content/thinking?hl=en'
const guide = 'https://ai.google.dev/gemini-api/docs/generate-content/gemini-3'
const images = 'https://ai.google.dev/gemini-api/docs/generate-content/image-generation'
const interactions = 'https://ai.google.dev/gemini-api/docs/thinking'
const interactionImages = 'https://ai.google.dev/gemini-api/docs/image-generation'

export function geminiThinkingRulesSnapshotV2() {
  const rules: CapabilityRuleCoreRuleV1[] = []
  function add(models: readonly string[], scope: string, suffix: string, value: CanonicalFactValueV1, url: string) {
    const id = `gemini-thinking-v2.${models[0]}.${scope}.${suffix}`
    rules.push({ ruleId: id, label: null, description: 'Bundled reviewed Gemini protocol documentation; exact model and API/operation scope.',
      priority: 0, configured: 'default', providerAuthorityId: 'google-ai-studio', endpointProfileId: 'gemini-developer-api-v1beta',
      selector: { kind: 'exact', nativeModelIds: models }, assertion: { path: `gemini.${scope}.${suffix}` as CanonicalSemanticPathV1, value },
      evidence: { evidenceSourceRef: 'google-gemini-thinking-docs-2026-10-17', evidenceKind: 'explicit_provider',
        evidenceNote: 'Verified official native controls. Minimal is not full off. GenerateContent Budget and Interactions Level are different API contracts.',
        identityEvidenceKind: 'official_exact_model_doc', identityEvidenceSourceRef: 'google-gemini-model-docs-2026-10-17',
        provenanceUrl: url, verifiedAt: '2026-10-17T00:00:00.000Z', derivation: null } })
  }
  const scope = 'generateContent.text'
  for (const [model, min, max, included, defaultBudget, required] of [
    ['gemini-2.5-pro', 128, 32768, [-1], -1, true],
    ['gemini-2.5-flash', 0, 24576, [-1], -1, false],
    ['gemini-2.5-flash-lite', 512, 24576, [-1, 0], 0, false],
  ] as const) {
    add([model], scope, 'thinkingBudget.domain', { kind: 'integer_domain', unit: 'token', interval: { min, max, minInclusive: true, maxInclusive: true }, includedValues: included, completeness: 'complete' }, thinking)
    add([model], scope, 'thinkingBudget.providerDefault', { kind: 'integer', value: defaultBudget, unit: 'token' }, thinking)
    add([model], scope, 'thinking.required', { kind: 'boolean', value: required }, thinking)
    add([model], scope, 'thinking.defaultEnabled', { kind: 'boolean', value: defaultBudget !== 0 }, thinking)
    add([model], scope, 'thinking.includeThoughts.support', { kind: 'support', value: 'supported' }, thinking)
  }
  const rows = [
    { models: ['gemini-3.8-flash', 'gemini-4-argon'], levels: ['low', 'medium', 'high'], defaultLevel: 'medium', url: thinking },
    { models: ['gemini-3.6-flash'], levels: ['minimal', 'low', 'medium', 'high'], defaultLevel: 'medium', url: thinking },
    { models: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'], levels: ['minimal', 'low', 'medium', 'high'], defaultLevel: 'minimal', url: thinking },
    { models: ['gemini-3-flash-preview', 'gemini-robotics-er-2-preview'], levels: ['minimal', 'low', 'medium', 'high'], defaultLevel: 'high', url: guide },
    { models: ['gemini-3.1-pro-preview'], levels: ['low', 'medium', 'high'], defaultLevel: 'high', url: guide },
    { models: ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-lite-image'], levels: ['minimal', 'high'], defaultLevel: 'minimal', url: images },
    { models: ['gemini-nano-banana-2.1'], levels: ['minimal', 'medium', 'high'], defaultLevel: 'medium', url: images },
  ]
  for (const row of rows) {
    add(row.models, scope, 'thinkingLevel.nativeValues', { kind: 'native_string_set', values: row.levels, completeness: 'complete' }, row.url)
    add(row.models, scope, 'thinkingLevel.providerDefault', { kind: 'native_string', value: row.defaultLevel }, row.url)
    add(row.models, scope, 'thinking.required', { kind: 'boolean', value: true }, row.url)
    add(row.models, scope, 'thinking.defaultEnabled', { kind: 'boolean', value: true }, row.url)
    add(row.models, scope, 'thinking.includeThoughts.support', { kind: 'support', value: 'supported' }, row.url)
  }
  // Current production Interactions operation is image_generate. Do not project text-API facts into it.
  for (const row of rows.filter(row => row.url === images)) {
    add(row.models, 'interactions.imageGenerate', 'thinkingLevel.nativeValues', { kind: 'native_string_set', values: row.levels, completeness: 'complete' }, interactionImages)
    add(row.models, 'interactions.imageGenerate', 'thinkingLevel.providerDefault', { kind: 'native_string', value: row.defaultLevel }, interactionImages)
    add(row.models, 'interactions.imageGenerate', 'thinking.required', { kind: 'boolean', value: true }, interactionImages)
    add(row.models, 'interactions.imageGenerate', 'thinking.defaultEnabled', { kind: 'boolean', value: true }, interactionImages)
    add(row.models, 'interactions.imageGenerate', 'thinking.summaries.support', { kind: 'support', value: 'supported' }, interactions)
  }
  for (const nativeScope of [scope, 'interactions.imageGenerate']) {
    const url = nativeScope === scope ? images : interactionImages
    add(['gemini-3-pro-image', 'gemini-3-pro-image-preview'], nativeScope, 'thinking.required', { kind: 'boolean', value: true }, url)
    add(['gemini-3-pro-image', 'gemini-3-pro-image-preview'], nativeScope, 'thinking.defaultEnabled', { kind: 'boolean', value: true }, url)
  }
  return decodeCapabilityRuleOwnershipSnapshotV1({ schemaVersion: 1, ownership: 'cloud', ownerId: GEMINI_THINKING_BUNDLED_OWNER_V2,
    packs: [{ schemaVersion: 1, packId: 'bundled-gemini-thinking-v2', displayName: 'Gemini thinking (bundled documentation)', description: 'API and operation scoped documentation rules bundled with the client. Independent of downloaded cloud/official releases.',
      priority: -100, mode: 'no_control', target: 'enabled', rules }] })
}
