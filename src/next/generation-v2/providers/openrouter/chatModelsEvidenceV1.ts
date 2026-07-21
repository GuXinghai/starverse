import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'

export const OPENROUTER_CHAT_MODELS_MAX_BYTES_V1 = 20 * 1024 * 1024

export type OpenRouterChatModelEvidenceV1 = Readonly<{
  modelId: string
  supportedParameters: readonly string[]
  inputModalities: readonly string[]
  outputModalities: readonly string[]
}>

export type OpenRouterChatModelsEvidenceV1 = Readonly<{
  canonicalJson: string
  responseDigest: string
  models: readonly OpenRouterChatModelEvidenceV1[]
}>

export class OpenRouterChatModelsEvidenceV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_CHAT_MODELS_RESPONSE_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_MODELS_RESPONSE_LIMIT') {
    super(code)
    this.name = 'OpenRouterChatModelsEvidenceV1Error'
  }
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left); const b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

/**
 * The OpenRouter catalogue is evidence, not a generation wire contract. Its
 * full canonical response is retained while only model identity and the
 * documented `supported_parameters` projection grant runtime capability.
 */
export function decodeOpenRouterChatModelsEvidenceV1(value: unknown): OpenRouterChatModelsEvidenceV1 {
  let canonicalJson: string
  try {
    canonicalJson = stableSerializeProviderRequestBoundedV2(value, OPENROUTER_CHAT_MODELS_MAX_BYTES_V1)
  } catch {
    throw new OpenRouterChatModelsEvidenceV1Error('GENERATION_V2_OPENROUTER_CHAT_MODELS_RESPONSE_LIMIT')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as Record<string, unknown>).data)) {
    throw new OpenRouterChatModelsEvidenceV1Error('GENERATION_V2_OPENROUTER_CHAT_MODELS_RESPONSE_INVALID')
  }
  const models = (value as { data: unknown[] }).data.map((raw): OpenRouterChatModelEvidenceV1 => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new OpenRouterChatModelsEvidenceV1Error('GENERATION_V2_OPENROUTER_CHAT_MODELS_RESPONSE_INVALID')
    }
    const input = raw as Record<string, unknown>
    const architecture = input.architecture
    if (typeof input.id !== 'string' || input.id.length === 0 || input.id.length > 512 ||
        !Array.isArray(input.supported_parameters) ||
        input.supported_parameters.some((item) => typeof item !== 'string' || item.length === 0) ||
        new Set(input.supported_parameters).size !== input.supported_parameters.length ||
        !architecture || typeof architecture !== 'object' || Array.isArray(architecture) ||
        !Array.isArray((architecture as Record<string, unknown>).input_modalities) ||
        ((architecture as Record<string, unknown>).input_modalities as unknown[]).some((item) => typeof item !== 'string' || item.length === 0) ||
        new Set((architecture as Record<string, unknown>).input_modalities as unknown[]).size !==
          ((architecture as Record<string, unknown>).input_modalities as unknown[]).length ||
        !Array.isArray((architecture as Record<string, unknown>).output_modalities) ||
        ((architecture as Record<string, unknown>).output_modalities as unknown[]).some((item) => typeof item !== 'string' || item.length === 0) ||
        new Set((architecture as Record<string, unknown>).output_modalities as unknown[]).size !==
          ((architecture as Record<string, unknown>).output_modalities as unknown[]).length) {
      throw new OpenRouterChatModelsEvidenceV1Error('GENERATION_V2_OPENROUTER_CHAT_MODELS_RESPONSE_INVALID')
    }
    return Object.freeze({
      modelId: input.id,
      supportedParameters: Object.freeze([...input.supported_parameters].sort(compareCodePoints) as string[]),
      inputModalities: Object.freeze([...((architecture as Record<string, unknown>).input_modalities as string[])].sort(compareCodePoints)),
      outputModalities: Object.freeze([...((architecture as Record<string, unknown>).output_modalities as string[])].sort(compareCodePoints)),
    })
  })
  models.sort((left, right) => compareCodePoints(left.modelId, right.modelId))
  if (models.length === 0 || new Set(models.map((item) => item.modelId)).size !== models.length) {
    throw new OpenRouterChatModelsEvidenceV1Error('GENERATION_V2_OPENROUTER_CHAT_MODELS_RESPONSE_INVALID')
  }
  return Object.freeze({
    canonicalJson,
    responseDigest: createHash('sha256').update(canonicalJson, 'utf8').digest('hex'),
    models: Object.freeze(models),
  })
}
