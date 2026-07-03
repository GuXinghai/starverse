import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_MODELS_PRIMARY_DATA_SOURCE,
  DEEPSEEK_MODELS_PRIMARY_DATA_SOURCE,
  DEFAULT_PROVIDER_CATALOG_SETTINGS,
  getProviderCatalogDefaultSettings,
  getProviderCatalogSettingKeys,
  GOOGLE_AI_STUDIO_MODELS_V1BETA_PRIMARY_DATA_SOURCE,
  isKnownProviderCatalogDataSource,
  normalizeProviderCatalogDataSource,
  OPENAI_MODELS_PRIMARY_DATA_SOURCE,
  OPENROUTER_MODELS_USER_PRIMARY_DATA_SOURCE,
} from './providerCatalogCore'

describe('providerCatalogCore', () => {
  it('enumerates provider-specific data sources without routing through OpenRouter naming', () => {
    expect(isKnownProviderCatalogDataSource(OPENROUTER_MODELS_USER_PRIMARY_DATA_SOURCE)).toBe(true)
    expect(isKnownProviderCatalogDataSource(GOOGLE_AI_STUDIO_MODELS_V1BETA_PRIMARY_DATA_SOURCE)).toBe(true)
    expect(isKnownProviderCatalogDataSource(ANTHROPIC_MODELS_PRIMARY_DATA_SOURCE)).toBe(true)
    expect(isKnownProviderCatalogDataSource(OPENAI_MODELS_PRIMARY_DATA_SOURCE)).toBe(true)
    expect(isKnownProviderCatalogDataSource(DEEPSEEK_MODELS_PRIMARY_DATA_SOURCE)).toBe(true)
  })

  it('normalizes safe extension dataSource ids and rejects unsafe values', () => {
    expect(normalizeProviderCatalogDataSource('provider_custom:v1')).toBe('provider_custom:v1')
    expect(normalizeProviderCatalogDataSource('../unsafe', DEEPSEEK_MODELS_PRIMARY_DATA_SOURCE)).toBe(DEEPSEEK_MODELS_PRIMARY_DATA_SOURCE)
    expect(normalizeProviderCatalogDataSource('', OPENAI_MODELS_PRIMARY_DATA_SOURCE)).toBe(OPENAI_MODELS_PRIMARY_DATA_SOURCE)
  })

  it('keeps OpenRouter defaults compatible while giving provider-specific freshness and retention defaults', () => {
    expect(getProviderCatalogDefaultSettings('openrouter')).toEqual(DEFAULT_PROVIDER_CATALOG_SETTINGS)
    expect(getProviderCatalogDefaultSettings('google_ai_studio')).toEqual(DEFAULT_PROVIDER_CATALOG_SETTINGS)
    expect(getProviderCatalogDefaultSettings('anthropic_messages')).toMatchObject({
      freshnessMs: 12 * 60 * 60 * 1000,
      retentionMs: 180 * 24 * 60 * 60 * 1000,
    })
    expect(getProviderCatalogDefaultSettings('openai_responses')).toMatchObject({
      freshnessMs: 12 * 60 * 60 * 1000,
      retentionMs: 180 * 24 * 60 * 60 * 1000,
    })
    expect(getProviderCatalogDefaultSettings('deepseek')).toMatchObject({
      freshnessMs: 6 * 60 * 60 * 1000,
      retentionMs: 90 * 24 * 60 * 60 * 1000,
    })
  })

  it('maps each first-class provider to independent persisted setting keys', () => {
    expect(getProviderCatalogSettingKeys('openrouter')?.freshnessMsKey).toBe('openRouterCatalogFreshnessMs')
    expect(getProviderCatalogSettingKeys('google_ai_studio')?.freshnessMsKey).toBe('googleAIStudioCatalogFreshnessMs')
    expect(getProviderCatalogSettingKeys('anthropic_messages')?.freshnessMsKey).toBe('anthropicCatalogFreshnessMs')
    expect(getProviderCatalogSettingKeys('openai_responses')?.freshnessMsKey).toBe('openAIResponsesCatalogFreshnessMs')
    expect(getProviderCatalogSettingKeys('deepseek')?.freshnessMsKey).toBe('deepSeekCatalogFreshnessMs')
    expect(getProviderCatalogSettingKeys('unknown_provider')).toBeNull()
  })
})
