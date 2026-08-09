/**
 * Model-level GenerateContent function-tool evidence is deliberately closed.
 * Additions require an owner-reviewed, exact model + GenerateContent evidence fixture;
 * GenerateContent visibility alone is never sufficient.
 */
export const REVIEWED_GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES_V2 = Object.freeze({
  'gemini-3.1-flash-lite': Object.freeze({
    functionCalling: true,
    thinkingLevels: Object.freeze(['minimal', 'low', 'medium', 'high'] as const),
    includeThoughts: true,
    googleSearch: true,
    reviewedAt: '2026-07-20T00:00:00.000Z',
    sources: Object.freeze([
      'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite',
      'https://ai.google.dev/gemini-api/docs/generate-content/thinking',
      'https://ai.google.dev/gemini-api/docs/generate-content/gemini-3',
    ]),
  }),
})

export const GEMINI_GENERATE_CONTENT_TOOL_CAPABILITY_EVIDENCE_ID_V2 =
  'gemini.generate-content.model-tool-capability.reviewed.v2'
export const GEMINI_GENERATE_CONTENT_TOOL_CONFIRMATION_EVIDENCE_ID_V2 =
  'gemini.generate-content.tool-side-effect-confirmation.owner-policy.v2'

export const REVIEWED_GEMINI_GENERATE_CONTENT_TOOL_NEGATIVE_MODELS_V2 = Object.freeze(new Set([
  'gemini-3.1-flash-image',
]))

export function hasReviewedGeminiGenerateContentToolCapabilityV2(modelId: string): boolean {
  if (REVIEWED_GEMINI_GENERATE_CONTENT_TOOL_NEGATIVE_MODELS_V2.has(modelId)) return false
  return modelId === 'gemini-3.1-flash-lite' &&
    REVIEWED_GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES_V2['gemini-3.1-flash-lite'].functionCalling
}

export function hasReviewedGeminiGenerateContentReasoningWebCapabilityV2(modelId: string): boolean {
  return modelId === 'gemini-3.1-flash-lite' &&
    REVIEWED_GEMINI_GENERATE_CONTENT_MODEL_CAPABILITIES_V2['gemini-3.1-flash-lite'].googleSearch
}
