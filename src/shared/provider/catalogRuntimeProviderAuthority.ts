import type { ProviderCatalogKnownProviderKey } from '../modelCatalog/providerCatalogContracts'
import type { RuntimeProviderId } from './runtimeProviderId'

const CATALOG_TO_RUNTIME_PROVIDER = Object.freeze({
  openrouter: 'openrouter',
  google_ai_studio: 'google_ai_studio',
  anthropic_messages: 'anthropic_messages',
  openai_responses: 'openai_responses',
  deepseek: 'deepseek',
} as const satisfies Readonly<Record<ProviderCatalogKnownProviderKey, RuntimeProviderId>>)

export function runtimeProviderIdForCatalogProvider(
  providerKey: ProviderCatalogKnownProviderKey,
): RuntimeProviderId {
  return CATALOG_TO_RUNTIME_PROVIDER[providerKey]
}

export function catalogProviderKeyForRuntimeProvider(
  providerId: RuntimeProviderId,
): ProviderCatalogKnownProviderKey | null {
  switch (providerId) {
    case 'openrouter': return 'openrouter'
    case 'google_ai_studio': return 'google_ai_studio'
    case 'anthropic_messages': return 'anthropic_messages'
    case 'openai_responses': return 'openai_responses'
    case 'deepseek': return 'deepseek'
    case 'lm_studio':
    case 'ollama_local':
    case 'local_endpoint': return null
  }
}
