export type CatalogAutoSyncPolicy = 'always' | 'stale_only' | 'never'
export type CatalogListUpdateMode = 'automatic' | 'manual'
export type CatalogRetentionMs = number | 'never'

export type ProviderCatalogKey =
  | 'openrouter'
  | 'google_ai_studio'
  | 'anthropic_messages'
  | 'openai_responses'
  | 'deepseek'
  | (string & {})

export const OPENROUTER_MODELS_USER_PRIMARY_DATA_SOURCE = 'models_user_primary' as const
export const OPENROUTER_MODELS_FALLBACK_DATA_SOURCE = 'models_fallback' as const
export const OPENROUTER_MIXED_DATA_SOURCE = 'mixed' as const
export const GOOGLE_AI_STUDIO_MODELS_V1BETA_PRIMARY_DATA_SOURCE = 'gemini_models_v1beta_primary' as const
export const ANTHROPIC_MODELS_PRIMARY_DATA_SOURCE = 'anthropic_models_primary' as const
export const OPENAI_MODELS_PRIMARY_DATA_SOURCE = 'openai_models_primary' as const
export const DEEPSEEK_MODELS_PRIMARY_DATA_SOURCE = 'deepseek_models_primary' as const

export const KNOWN_PROVIDER_CATALOG_DATA_SOURCES = [
  OPENROUTER_MODELS_USER_PRIMARY_DATA_SOURCE,
  OPENROUTER_MODELS_FALLBACK_DATA_SOURCE,
  OPENROUTER_MIXED_DATA_SOURCE,
  GOOGLE_AI_STUDIO_MODELS_V1BETA_PRIMARY_DATA_SOURCE,
  ANTHROPIC_MODELS_PRIMARY_DATA_SOURCE,
  OPENAI_MODELS_PRIMARY_DATA_SOURCE,
  DEEPSEEK_MODELS_PRIMARY_DATA_SOURCE,
] as const

export type KnownProviderCatalogDataSource = (typeof KNOWN_PROVIDER_CATALOG_DATA_SOURCES)[number]
export type ProviderCatalogDataSource = KnownProviderCatalogDataSource | (string & {})

export type ProviderCatalogSettings = Readonly<{
  startupSyncPolicy: CatalogAutoSyncPolicy
  pickerOpenSyncPolicy: CatalogAutoSyncPolicy
  listUpdateMode: CatalogListUpdateMode
  freshnessMs: number
  retentionMs: CatalogRetentionMs
}>

export type ProviderCatalogSettingKeys = Readonly<{
  startupSyncPolicyKey: string
  pickerOpenSyncPolicyKey: string
  listUpdateModeKey: string
  freshnessMsKey: string
  retentionMsKey: string
}>

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export const DEFAULT_PROVIDER_CATALOG_SETTINGS: ProviderCatalogSettings = {
  startupSyncPolicy: 'stale_only',
  pickerOpenSyncPolicy: 'stale_only',
  listUpdateMode: 'manual',
  freshnessMs: 24 * HOUR_MS,
  retentionMs: 90 * DAY_MS,
}

export const PROVIDER_CATALOG_DEFAULT_SETTINGS_BY_PROVIDER: Record<string, ProviderCatalogSettings> = {
  openrouter: DEFAULT_PROVIDER_CATALOG_SETTINGS,
  google_ai_studio: DEFAULT_PROVIDER_CATALOG_SETTINGS,
  anthropic_messages: {
    ...DEFAULT_PROVIDER_CATALOG_SETTINGS,
    freshnessMs: 12 * HOUR_MS,
    retentionMs: 180 * DAY_MS,
  },
  openai_responses: {
    ...DEFAULT_PROVIDER_CATALOG_SETTINGS,
    freshnessMs: 12 * HOUR_MS,
    retentionMs: 180 * DAY_MS,
  },
  deepseek: {
    ...DEFAULT_PROVIDER_CATALOG_SETTINGS,
    freshnessMs: 6 * HOUR_MS,
  },
}

export const PROVIDER_CATALOG_SETTING_KEYS_BY_PROVIDER: Record<string, ProviderCatalogSettingKeys> = {
  openrouter: {
    startupSyncPolicyKey: 'openRouterCatalogStartupSyncPolicy',
    pickerOpenSyncPolicyKey: 'openRouterCatalogPickerOpenSyncPolicy',
    listUpdateModeKey: 'openRouterCatalogListUpdateMode',
    freshnessMsKey: 'openRouterCatalogFreshnessMs',
    retentionMsKey: 'openRouterCatalogRetentionMs',
  },
  google_ai_studio: {
    startupSyncPolicyKey: 'googleAIStudioCatalogStartupSyncPolicy',
    pickerOpenSyncPolicyKey: 'googleAIStudioCatalogPickerOpenSyncPolicy',
    listUpdateModeKey: 'googleAIStudioCatalogListUpdateMode',
    freshnessMsKey: 'googleAIStudioCatalogFreshnessMs',
    retentionMsKey: 'googleAIStudioCatalogRetentionMs',
  },
  anthropic_messages: {
    startupSyncPolicyKey: 'anthropicCatalogStartupSyncPolicy',
    pickerOpenSyncPolicyKey: 'anthropicCatalogPickerOpenSyncPolicy',
    listUpdateModeKey: 'anthropicCatalogListUpdateMode',
    freshnessMsKey: 'anthropicCatalogFreshnessMs',
    retentionMsKey: 'anthropicCatalogRetentionMs',
  },
  openai_responses: {
    startupSyncPolicyKey: 'openAIResponsesCatalogStartupSyncPolicy',
    pickerOpenSyncPolicyKey: 'openAIResponsesCatalogPickerOpenSyncPolicy',
    listUpdateModeKey: 'openAIResponsesCatalogListUpdateMode',
    freshnessMsKey: 'openAIResponsesCatalogFreshnessMs',
    retentionMsKey: 'openAIResponsesCatalogRetentionMs',
  },
  deepseek: {
    startupSyncPolicyKey: 'deepSeekCatalogStartupSyncPolicy',
    pickerOpenSyncPolicyKey: 'deepSeekCatalogPickerOpenSyncPolicy',
    listUpdateModeKey: 'deepSeekCatalogListUpdateMode',
    freshnessMsKey: 'deepSeekCatalogFreshnessMs',
    retentionMsKey: 'deepSeekCatalogRetentionMs',
  },
}

const DATA_SOURCE_PATTERN = /^[a-z][a-z0-9_:-]{0,127}$/

export function isKnownProviderCatalogDataSource(value: unknown): value is KnownProviderCatalogDataSource {
  return (KNOWN_PROVIDER_CATALOG_DATA_SOURCES as readonly string[]).includes(String(value ?? '').trim())
}

export function normalizeProviderCatalogDataSource(
  value: unknown,
  fallback: ProviderCatalogDataSource = OPENROUTER_MODELS_USER_PRIMARY_DATA_SOURCE,
): ProviderCatalogDataSource {
  const normalized = String(value ?? '').trim()
  if (normalized.length === 0) return fallback
  return DATA_SOURCE_PATTERN.test(normalized) ? normalized as ProviderCatalogDataSource : fallback
}

export function getProviderCatalogDefaultSettings(providerKey: unknown): ProviderCatalogSettings {
  const normalizedProviderKey = String(providerKey ?? '').trim()
  return PROVIDER_CATALOG_DEFAULT_SETTINGS_BY_PROVIDER[normalizedProviderKey] ?? DEFAULT_PROVIDER_CATALOG_SETTINGS
}

export function getProviderCatalogSettingKeys(providerKey: unknown): ProviderCatalogSettingKeys | null {
  const normalizedProviderKey = String(providerKey ?? '').trim()
  return PROVIDER_CATALOG_SETTING_KEYS_BY_PROVIDER[normalizedProviderKey] ?? null
}
