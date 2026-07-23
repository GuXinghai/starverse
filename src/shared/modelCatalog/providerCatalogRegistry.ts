import type {
  ProviderCatalogKnownProviderKey,
  ProviderCatalogSourceDescriptor,
} from './providerCatalogContracts'

export const PROVIDER_CATALOG_SOURCE_DESCRIPTORS = [
  {
    providerKey: 'openrouter',
    displayName: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultDataSource: 'models_user_primary',
    credentialMode: 'required',
    capabilities: {
      models: true,
      providerDictionary: true,
      endpointDetails: true,
      curatedMetadata: true,
      countProbe: true,
      remoteSync: true, supportsStartupSync: true, supportsPickerOpenSync: true, supportsManualSync: true,
      requiresCredential: true, scopedByCredential: true, scopedByBaseUrl: false,
    },
  },
  {
    providerKey: 'google_ai_studio',
    displayName: 'Google AI Studio',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultDataSource: 'models_user_primary',
    credentialMode: 'required',
    capabilities: {
      models: true,
      providerDictionary: false,
      endpointDetails: false,
      curatedMetadata: true,
      countProbe: false,
      remoteSync: true, supportsStartupSync: true, supportsPickerOpenSync: true, supportsManualSync: true,
      requiresCredential: true, scopedByCredential: true, scopedByBaseUrl: false,
    },
  },
  {
    providerKey: 'anthropic_messages',
    displayName: 'Anthropic Messages',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultDataSource: 'models_user_primary',
    credentialMode: 'required',
    capabilities: {
      models: true,
      providerDictionary: false,
      endpointDetails: false,
      curatedMetadata: true,
      countProbe: false,
      remoteSync: true, supportsStartupSync: true, supportsPickerOpenSync: true, supportsManualSync: true,
      requiresCredential: true, scopedByCredential: true, scopedByBaseUrl: false,
    },
  },
  {
    providerKey: 'openai_responses',
    displayName: 'OpenAI Responses',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultDataSource: 'models_user_primary',
    credentialMode: 'required',
    capabilities: {
      models: true,
      providerDictionary: false,
      endpointDetails: false,
      curatedMetadata: true,
      countProbe: false,
      remoteSync: true, supportsStartupSync: true, supportsPickerOpenSync: true, supportsManualSync: true,
      requiresCredential: true, scopedByCredential: true, scopedByBaseUrl: false,
    },
  },
  {
    providerKey: 'deepseek',
    displayName: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultDataSource: 'models_user_primary',
    credentialMode: 'required',
    capabilities: {
      models: true,
      providerDictionary: false,
      endpointDetails: false,
      curatedMetadata: true,
      countProbe: false,
      remoteSync: true, supportsStartupSync: true, supportsPickerOpenSync: true, supportsManualSync: true,
      requiresCredential: true, scopedByCredential: true, scopedByBaseUrl: false,
    },
  },
] as const satisfies ReadonlyArray<ProviderCatalogSourceDescriptor>

const DESCRIPTOR_BY_PROVIDER_KEY = new Map<ProviderCatalogKnownProviderKey, ProviderCatalogSourceDescriptor>(
  PROVIDER_CATALOG_SOURCE_DESCRIPTORS.map((descriptor) => [descriptor.providerKey, descriptor]),
)

export function listProviderCatalogSourceDescriptors(): ReadonlyArray<ProviderCatalogSourceDescriptor> {
  return [...PROVIDER_CATALOG_SOURCE_DESCRIPTORS]
}

export function isProviderCatalogSourceKey(value: unknown): value is ProviderCatalogKnownProviderKey {
  return DESCRIPTOR_BY_PROVIDER_KEY.has(String(value ?? '').trim() as ProviderCatalogKnownProviderKey)
}

export function getProviderCatalogSourceDescriptor(
  providerKey: unknown,
): ProviderCatalogSourceDescriptor | null {
  return DESCRIPTOR_BY_PROVIDER_KEY.get(String(providerKey ?? '').trim() as ProviderCatalogKnownProviderKey) ?? null
}

export function requireProviderCatalogSourceDescriptor(
  providerKey: unknown,
): ProviderCatalogSourceDescriptor {
  const descriptor = getProviderCatalogSourceDescriptor(providerKey)
  if (!descriptor) {
    throw new Error(`Unknown provider catalog source: ${String(providerKey ?? '')}`)
  }
  return descriptor
}
