import { isCatalogStatusStale } from '@/shared/modelCatalog/catalogSyncSettings'
import {
  GLOBAL_CATALOG_POLICY_V2_STORE_KEY,
  providerCatalogPolicyV2StoreKey,
} from '@/shared/modelCatalog/catalogPolicyResolverV2'
import { resolveCatalogPolicyV2 } from '@/shared/modelCatalog/catalogPolicyV2'
import { listProviderCatalogSourceDescriptors } from '@/shared/modelCatalog/providerCatalogRegistry'

type CatalogModelsAuthorityV2 = Readonly<{
  status: (payload: unknown) => Promise<unknown>
  sync: (payload: unknown) => Promise<unknown>
}>

type CatalogSettingsStoreV2 = Readonly<{
  get: (key: string) => Promise<unknown>
}>

export type CatalogStartupSyncResultV2 = Readonly<{
  providerKey: string
  action: 'synced' | 'skipped'
  reason: 'unsupported' | 'unconfigured' | 'never' | 'credential_missing' | 'fresh' | 'succeeded' | 'failed'
}>

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export async function syncProviderCatalogsOnStartupV2(input: Readonly<{
  models: CatalogModelsAuthorityV2
  store: CatalogSettingsStoreV2
}>): Promise<readonly CatalogStartupSyncResultV2[]> {
  const globalPolicy = await input.store.get(GLOBAL_CATALOG_POLICY_V2_STORE_KEY)
  return Promise.all(listProviderCatalogSourceDescriptors().map(async (descriptor): Promise<CatalogStartupSyncResultV2> => {
    if (!descriptor.capabilities.supportsStartupSync) {
      return Object.freeze({ providerKey: descriptor.providerKey, action: 'skipped', reason: 'unsupported' })
    }
    try {
      const providerPolicy = await input.store.get(providerCatalogPolicyV2StoreKey(descriptor.providerKey))
      const resolved = resolveCatalogPolicyV2({ providerOverride: providerPolicy, globalPolicy })
      if (!resolved.policy) {
        return Object.freeze({ providerKey: descriptor.providerKey, action: 'skipped', reason: 'unconfigured' })
      }
      if (resolved.policy.startupSyncPolicy === 'never') {
        return Object.freeze({ providerKey: descriptor.providerKey, action: 'skipped', reason: 'never' })
      }
      const current = record(await input.models.status({ providerKey: descriptor.providerKey }))
      if (current?.ok !== true && current?.code === 'credential_missing') {
        return Object.freeze({ providerKey: descriptor.providerKey, action: 'skipped', reason: 'credential_missing' })
      }
      const observedAtMs = current?.ok === true ? current.observedAtMs : null
      const stale = isCatalogStatusStale({
        status: observedAtMs ? 'synced' : 'not_synced',
        lastSyncAtMs: observedAtMs,
        freshnessMs: resolved.policy.freshnessMs ?? undefined,
      })
      if (resolved.policy.startupSyncPolicy === 'stale_only' && !stale) {
        return Object.freeze({ providerKey: descriptor.providerKey, action: 'skipped', reason: 'fresh' })
      }
      const synced = record(await input.models.sync({
        providerKey: descriptor.providerKey,
        timeoutMs: 30_000,
        retentionMs: resolved.policy.retentionMs,
        applyMode: resolved.policy.listApplyMode,
      }))
      if (synced?.ok !== true) {
        return Object.freeze({ providerKey: descriptor.providerKey, action: 'skipped', reason: 'failed' })
      }
      return Object.freeze({ providerKey: descriptor.providerKey, action: 'synced', reason: 'succeeded' })
    } catch {
      return Object.freeze({ providerKey: descriptor.providerKey, action: 'skipped', reason: 'failed' })
    }
  }))
}
