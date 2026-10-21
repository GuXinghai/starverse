/**
 * The shared byte limits for Generation V2 requests, successful responses,
 * and persisted native artifacts. Keep wire request limits per protocol;
 * native artifact limits account for the request prefix plus its response.
 */
export const GENERATION_CAPACITY_CONTRACT_VERSION_V1 = 1 as const

export const GENERATION_REQUEST_BODY_DEFAULT_MAX_BYTES_V1 = 20 * 1_024 * 1_024
export const GENERATION_REQUEST_BODY_GLOBAL_MAX_BYTES_V1 = 28 * 1_024 * 1_024
export const GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1 = 64 * 1_024 * 1_024
export const GENERATION_NATIVE_ARTIFACT_METADATA_MAX_BYTES_V1 = 1 * 1_024 * 1_024
export const GENERATION_NATIVE_ARTIFACT_MAX_BYTES_V1 =
  GENERATION_REQUEST_BODY_GLOBAL_MAX_BYTES_V1 +
  2 * GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1 +
  GENERATION_NATIVE_ARTIFACT_METADATA_MAX_BYTES_V1

export const GENERATION_NATIVE_ARTIFACT_CHUNK_MAX_RAW_BYTES_V1 = 1 * 1_024 * 1_024
export const GENERATION_NATIVE_ARTIFACT_MAX_CHUNKS_V1 = Math.ceil(
  GENERATION_NATIVE_ARTIFACT_MAX_BYTES_V1 / GENERATION_NATIVE_ARTIFACT_CHUNK_MAX_RAW_BYTES_V1,
)
export const GENERATION_NATIVE_ARTIFACT_MANIFEST_MAX_BYTES_V1 = 64 * 1_024
export const GENERATION_PORTABLE_HISTORY_RESERVED_BYTES_V1 = 4 * 1_024

/** The prepared JSON body is itself a JSON string; reserve its escaping plus four native projections. */
export const GENERATION_NATIVE_COMPLETION_RECEIPT_MAX_BYTES_V1 =
  2 * GENERATION_REQUEST_BODY_GLOBAL_MAX_BYTES_V1 +
  4 * GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1 +
  GENERATION_NATIVE_ARTIFACT_METADATA_MAX_BYTES_V1

/** A checkpoint may retain its bounded original request and four response-sized native facts. */
export const GENERATION_INTERRUPTED_REPLAY_CANONICAL_MAX_BYTES_V1 =
  GENERATION_REQUEST_BODY_GLOBAL_MAX_BYTES_V1 +
  4 * GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1 +
  GENERATION_NATIVE_ARTIFACT_METADATA_MAX_BYTES_V1
export const GENERATION_INTERRUPTED_REPLAY_INLINE_MAX_BYTES_V1 = 1 * 1_024 * 1_024
export const GENERATION_INTERRUPTED_REPLAY_CHUNK_MAX_RAW_BYTES_V1 = 1 * 1_024 * 1_024
export const GENERATION_INTERRUPTED_REPLAY_MAX_CHUNKS_V1 = Math.ceil(
  GENERATION_INTERRUPTED_REPLAY_CANONICAL_MAX_BYTES_V1 / GENERATION_INTERRUPTED_REPLAY_CHUNK_MAX_RAW_BYTES_V1,
)
export const GENERATION_INTERRUPTED_REPLAY_MANIFEST_MAX_BYTES_V1 = 64 * 1_024

/** Exact provider wire budgets, keyed by the frozen protocol contract id. */
export const GENERATION_REQUEST_BODY_MAX_BYTES_BY_CONTRACT_V1 = Object.freeze({
  'openrouter-images-v1': 20 * 1_024 * 1_024,
  'openrouter-chat-completions-v1': 20 * 1_024 * 1_024,
  'gemini-generate-content-v1beta': 20 * 1_024 * 1_024,
  'gemini-interactions-v1beta': 20 * 1_024 * 1_024,
  'anthropic-messages-2023-06-01': 20 * 1_024 * 1_024,
  'deepseek-stable-chat-v1': 20 * 1_024 * 1_024,
  'openai-responses-v1': 28 * 1_024 * 1_024,
  'generic-local-openai-chat-completions': 20 * 1_024 * 1_024,
  'ollama-chat-v1': 20 * 1_024 * 1_024,
  'lmstudio-openresponses': 24 * 1_024 * 1_024,
  openai_chat_compatible: 20 * 1_024 * 1_024,
} as const)

export function generationRequestBodyMaxBytesForContractV1(contractId: string): number {
  return GENERATION_REQUEST_BODY_MAX_BYTES_BY_CONTRACT_V1[
    contractId as keyof typeof GENERATION_REQUEST_BODY_MAX_BYTES_BY_CONTRACT_V1
  ] ?? GENERATION_REQUEST_BODY_DEFAULT_MAX_BYTES_V1
}

export const GENERATION_PORTABLE_HISTORY_TARGET_MAX_BYTES_V1 = Object.freeze({
  openai: generationRequestBodyMaxBytesForContractV1('openai-responses-v1'),
  openrouter: generationRequestBodyMaxBytesForContractV1('openrouter-chat-completions-v1'),
  deepseek: generationRequestBodyMaxBytesForContractV1('deepseek-stable-chat-v1'),
  anthropic: generationRequestBodyMaxBytesForContractV1('anthropic-messages-2023-06-01'),
  gemini: generationRequestBodyMaxBytesForContractV1('gemini-generate-content-v1beta'),
  compatible: generationRequestBodyMaxBytesForContractV1('openai_chat_compatible'),
  generic: generationRequestBodyMaxBytesForContractV1('generic-local-openai-chat-completions'),
  ollama: generationRequestBodyMaxBytesForContractV1('ollama-chat-v1'),
  lmstudio: generationRequestBodyMaxBytesForContractV1('lmstudio-openresponses'),
} as const)

export type GenerationPortableHistoryTargetV1 = keyof typeof GENERATION_PORTABLE_HISTORY_TARGET_MAX_BYTES_V1

export function generationPortableHistoryTargetMaxBytesV1(target: string): number {
  return GENERATION_PORTABLE_HISTORY_TARGET_MAX_BYTES_V1[
    target as GenerationPortableHistoryTargetV1
  ] ?? GENERATION_REQUEST_BODY_DEFAULT_MAX_BYTES_V1
}
