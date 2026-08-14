import type { RuntimeProviderId } from './runtimeProviderId'

export type ProviderModelKeyInput = Readonly<{
  providerId: RuntimeProviderId
  modelId: string
}>

export const OPENROUTER_PROVIDER_ID: RuntimeProviderId = 'openrouter'
export const DEFAULT_OPENROUTER_MODEL_ID = 'openrouter/auto'

export function normalizeModelId(value: unknown, fallback = ''): string {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : fallback
}

export function buildProviderModelKey(selection: ProviderModelKeyInput): string {
  return `${selection.providerId}::${selection.modelId}`
}
