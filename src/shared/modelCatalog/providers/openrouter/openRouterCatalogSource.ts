import type {
  ProviderCatalogFetchInput,
  ProviderCatalogSnapshot,
  ProviderCatalogSource,
  ProviderCatalogSourceDescriptor,
} from '../../providerCatalogContracts'
import { requireProviderCatalogSourceDescriptor } from '../../providerCatalogRegistry'
import { OpenRouterCatalogClient } from '../../openRouterCatalogClient'

export const OPENROUTER_PROVIDER_CATALOG_DESCRIPTOR: ProviderCatalogSourceDescriptor =
  requireProviderCatalogSourceDescriptor('openrouter')

function resolveOpenRouterDataSource(
  meta: Readonly<{
    primarySource: 'models_user' | 'models'
    usedFallback: boolean
  }>,
): ProviderCatalogSnapshot['dataSource'] {
  if (meta.usedFallback) return 'mixed'
  return meta.primarySource === 'models_user' ? 'models_user_primary' : 'models_fallback'
}

function requireApiKey(input: ProviderCatalogFetchInput): string {
  const apiKey = String(input.apiKey ?? '').trim()
  if (!apiKey) {
    throw new Error('OpenRouter catalog source requires apiKey')
  }
  return apiKey
}

export function createOpenRouterCatalogSource(options: Readonly<{
  fetchImpl?: typeof fetch
}> = {}): ProviderCatalogSource {
  const client = new OpenRouterCatalogClient({ fetchImpl: options.fetchImpl })

  return {
    descriptor: OPENROUTER_PROVIDER_CATALOG_DESCRIPTOR,
    adapter: client,
    async fetchSnapshot(input): Promise<ProviderCatalogSnapshot> {
      const apiKey = requireApiKey(input)
      const baseUrl = String(input.baseUrl || OPENROUTER_PROVIDER_CATALOG_DESCRIPTOR.defaultBaseUrl).trim()
      const runtimeClient = input.fetchImpl && input.fetchImpl !== options.fetchImpl
        ? new OpenRouterCatalogClient({ fetchImpl: input.fetchImpl })
        : client

      const modelResult = await runtimeClient.listModels({
        apiKey,
        baseUrl,
        preferUserScopedModels: true,
        signal: input.signal ?? null,
      })

      let providers = undefined
      try {
        providers = await runtimeClient.listProviders({
          apiKey,
          baseUrl,
          signal: input.signal ?? null,
        })
      } catch {
        providers = undefined
      }

      let countProbe = null
      try {
        countProbe = await runtimeClient.listModelsCount({
          apiKey,
          baseUrl,
          signal: input.signal ?? null,
        })
      } catch {
        countProbe = null
      }

      return {
        providerKey: OPENROUTER_PROVIDER_CATALOG_DESCRIPTOR.providerKey,
        baseUrl,
        dataSource: resolveOpenRouterDataSource(modelResult.meta),
        fetchedAtMs: modelResult.meta.completedAtMs,
        models: modelResult.models,
        ...(providers ? { providers, providerCount: providers.length } : {}),
        ...(countProbe ? { countProbe } : {}),
      }
    },
  }
}

export const openRouterCatalogSource = createOpenRouterCatalogSource()

