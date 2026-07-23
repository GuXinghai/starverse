import {
  resolveCatalogPolicyV2,
  UNCONFIGURED_CATALOG_POLICY_V2,
  type CatalogPolicyV2,
  type ResolvedCatalogPolicyV2,
} from './catalogPolicyV2'
import type { ProviderCatalogKey } from './providerCatalogContracts'

export const GLOBAL_CATALOG_POLICY_V2_STORE_KEY = 'catalogPolicyV2'

export type CatalogPolicyStoreReaderV2 = Readonly<{ get: (key: string) => unknown }>

export function providerCatalogPolicyV2StoreKey(providerKey: ProviderCatalogKey): string {
  return `providerCatalog.${String(providerKey).trim()}.policyV2`
}

export function readResolvedCatalogPolicyV2(
  store: CatalogPolicyStoreReaderV2,
  providerKey: ProviderCatalogKey,
): ResolvedCatalogPolicyV2 {
  const providerOverride = store.get(providerCatalogPolicyV2StoreKey(providerKey))
  const globalPolicy = store.get(GLOBAL_CATALOG_POLICY_V2_STORE_KEY)
  if (providerOverride === undefined && globalPolicy === undefined) return UNCONFIGURED_CATALOG_POLICY_V2
  return resolveCatalogPolicyV2({ providerOverride, globalPolicy })
}

export function writeCatalogPolicyV2(
  store: Readonly<{ set: (key: string, value: CatalogPolicyV2) => void }>,
  input: Readonly<{ providerKey?: ProviderCatalogKey; policy: CatalogPolicyV2 }>,
): void {
  const key = input.providerKey === undefined
    ? GLOBAL_CATALOG_POLICY_V2_STORE_KEY
    : providerCatalogPolicyV2StoreKey(input.providerKey)
  store.set(key, input.policy)
}
