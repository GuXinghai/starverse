import type { RuntimeProviderKey } from './runtimeSelection'

export type ChatModelSelection = Readonly<{
  providerId: RuntimeProviderKey
  modelId: string
}>

export const DEFAULT_CHAT_PROVIDER_ID: RuntimeProviderKey = 'openrouter'
export const DEFAULT_OPENROUTER_MODEL_ID = 'openrouter/auto'
export const DEFAULT_CHAT_MODEL_SELECTION: ChatModelSelection = {
  providerId: DEFAULT_CHAT_PROVIDER_ID,
  modelId: DEFAULT_OPENROUTER_MODEL_ID,
}

const RUNTIME_PROVIDER_IDS: readonly RuntimeProviderKey[] = [
  'openrouter',
  'openai_responses',
  'google_ai_studio',
  'anthropic_messages',
  'deepseek',
  'lm_studio',
  'ollama_local',
  'local_endpoint',
]

export function normalizeRuntimeProviderId(value: unknown): RuntimeProviderKey | null {
  const normalized = String(value ?? '').trim()
  return RUNTIME_PROVIDER_IDS.includes(normalized as RuntimeProviderKey)
    ? normalized as RuntimeProviderKey
    : null
}

export function normalizeModelId(value: unknown, fallback = DEFAULT_OPENROUTER_MODEL_ID): string {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : fallback
}

export function normalizeChatModelSelection(
  input: Readonly<Partial<ChatModelSelection>> | null | undefined,
  fallback: ChatModelSelection = DEFAULT_CHAT_MODEL_SELECTION,
): ChatModelSelection {
  const providerId = normalizeRuntimeProviderId(input?.providerId) ?? fallback.providerId
  const modelId = normalizeModelId(input?.modelId, fallback.modelId)
  return { providerId, modelId }
}

export function isSameChatModelSelection(a: ChatModelSelection, b: ChatModelSelection): boolean {
  return a.providerId === b.providerId && a.modelId === b.modelId
}

export function buildProviderModelKey(selection: ChatModelSelection): string {
  return `${selection.providerId}::${selection.modelId}`
}
