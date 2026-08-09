import { resolveGeminiImageGenerationPolicy } from '../../../provider/gemini/geminiImageGenerationPolicy'

export const GEMINI_INTERACTIONS_IMAGE_MODEL_IDS_V1 = Object.freeze([
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
] as const)

export type GeminiInteractionsImageModelIdV1 = typeof GEMINI_INTERACTIONS_IMAGE_MODEL_IDS_V1[number]

export function isGeminiInteractionsImageModelIdV1(value: unknown): value is GeminiInteractionsImageModelIdV1 {
  return typeof value === 'string' && (GEMINI_INTERACTIONS_IMAGE_MODEL_IDS_V1 as readonly string[]).includes(value)
}

export function readGeminiInteractionsImageModelPolicyV1(modelId: string) {
  if (!isGeminiInteractionsImageModelIdV1(modelId)) throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_MODEL_UNVERIFIED')
  const policy = resolveGeminiImageGenerationPolicy(modelId)
  if (policy.kind === 'unsupported') throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_MODEL_UNVERIFIED')
  return policy
}
