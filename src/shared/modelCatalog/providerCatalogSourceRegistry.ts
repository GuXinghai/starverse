import type { ProviderCatalogKnownProviderKey, ProviderCatalogSource } from './providerCatalogContracts'
import { openRouterCatalogSource } from './providers/openrouter/openRouterCatalogSource'

const PROVIDER_CATALOG_SOURCE_BY_KEY = new Map<ProviderCatalogKnownProviderKey, ProviderCatalogSource>([
  ['openrouter', openRouterCatalogSource],
])

export function listProviderCatalogSources(): ReadonlyArray<ProviderCatalogSource> {
  return [...PROVIDER_CATALOG_SOURCE_BY_KEY.values()]
}

export function getProviderCatalogSource(providerKey: unknown): ProviderCatalogSource | null {
  return PROVIDER_CATALOG_SOURCE_BY_KEY.get(String(providerKey ?? '').trim() as ProviderCatalogKnownProviderKey) ?? null
}

export function requireProviderCatalogSource(providerKey: unknown): ProviderCatalogSource {
  const source = getProviderCatalogSource(providerKey)
  if (!source) {
    throw new Error(`Unknown provider catalog source: ${String(providerKey ?? '')}`)
  }
  return source
}
