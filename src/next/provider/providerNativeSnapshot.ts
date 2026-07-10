import {
  ANTHROPIC_MESSAGES_SOURCE_API,
  ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY,
  normalizeAnthropicProviderNativeSnapshot,
  type AnthropicProviderNativeSnapshot,
} from '@/next/provider/anthropic/anthropicProviderNativeContent'
import {
  GEMINI_GENERATE_CONTENT_SOURCE_API,
  GEMINI_PROVIDER_NATIVE_PROVIDER_KEY,
  normalizeGeminiProviderNativeSnapshot,
  type GeminiProviderNativeSnapshot,
} from '@/next/provider/gemini/geminiProviderNativeContent'

export type ProviderNativeSnapshot =
  | GeminiProviderNativeSnapshot
  | AnthropicProviderNativeSnapshot

export function normalizeProviderNativeSnapshot(value: unknown): ProviderNativeSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Provider native snapshot must be an object')
  }
  const providerKey = (value as Record<string, unknown>).providerKey
  const sourceApi = (value as Record<string, unknown>).sourceApi
  if (providerKey === GEMINI_PROVIDER_NATIVE_PROVIDER_KEY && sourceApi === GEMINI_GENERATE_CONTENT_SOURCE_API) {
    return normalizeGeminiProviderNativeSnapshot(value)
  }
  if (providerKey === ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY && sourceApi === ANTHROPIC_MESSAGES_SOURCE_API) {
    return normalizeAnthropicProviderNativeSnapshot(value)
  }
  throw new Error('Provider native snapshot provider/source is unsupported')
}

export function providerNativeSnapshotKey(snapshot: ProviderNativeSnapshot): string {
  return snapshot.snapshotKey
}

export function providerNativeChoiceIndex(snapshot: ProviderNativeSnapshot): number {
  return typeof (snapshot as GeminiProviderNativeSnapshot).candidateIndex === 'number'
    ? (snapshot as GeminiProviderNativeSnapshot).candidateIndex
    : 0
}

export function isFinalProviderNativeSnapshot(value: unknown): value is ProviderNativeSnapshot {
  try {
    return normalizeProviderNativeSnapshot(value).status === 'final'
  } catch {
    return false
  }
}
