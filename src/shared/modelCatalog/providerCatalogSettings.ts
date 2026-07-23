import {
  UNCONFIGURED_CATALOG_POLICY_V2,
  type CatalogPolicySourceV2,
  type CatalogRetention,
  type CatalogSyncTriggerPolicy,
  type CatalogListApplyMode,
  type CatalogPolicyV2,
} from './catalogPolicyV2'
import { validateCatalogPolicyV2 } from './catalogPolicyV2'
import { readResolvedCatalogPolicyV2 } from './catalogPolicyResolverV2'
import type { ProviderCatalogKey } from './providerCatalogContracts'

export type ProviderCatalogSettingsStoreReader = Readonly<{ get: (key: string) => unknown }>

export type ProviderCatalogSettingName =
  | 'startupSyncPolicy'
  | 'pickerOpenSyncPolicy'
  | 'listUpdateMode'
  | 'freshnessMs'
  | 'retentionMs'

export type ProviderCatalogSettings = Readonly<{
  providerKey: ProviderCatalogKey
  source: CatalogPolicySourceV2
  startupSyncPolicy: CatalogSyncTriggerPolicy
  pickerOpenSyncPolicy: CatalogSyncTriggerPolicy
  listUpdateMode: CatalogListApplyMode
  freshnessMs: number | null
  retentionMs: CatalogRetention
  policy: CatalogPolicyV2 | null
}>

export function providerCatalogSettingKey(providerKey: ProviderCatalogKey, settingName: ProviderCatalogSettingName): string {
  return `providerCatalog.${String(providerKey).trim()}.${settingName}`
}

function policyFromCanonicalFields(store: ProviderCatalogSettingsStoreReader, providerKey: ProviderCatalogKey): CatalogPolicyV2 | undefined {
  const values = Object.fromEntries(([
    ['startupSyncPolicy', store.get(providerCatalogSettingKey(providerKey, 'startupSyncPolicy'))],
    ['pickerOpenSyncPolicy', store.get(providerCatalogSettingKey(providerKey, 'pickerOpenSyncPolicy'))],
    ['listApplyMode', store.get(providerCatalogSettingKey(providerKey, 'listUpdateMode'))],
    ['freshnessMs', store.get(providerCatalogSettingKey(providerKey, 'freshnessMs'))],
    ['retentionMs', store.get(providerCatalogSettingKey(providerKey, 'retentionMs'))],
  ] as const).filter(([, value]) => value !== undefined))
  return Object.keys(values).length === 0 ? undefined : values as CatalogPolicyV2
}

export function readProviderCatalogSettings(
  store: ProviderCatalogSettingsStoreReader,
  providerKey: ProviderCatalogKey,
): ProviderCatalogSettings {
  const explicitPolicy = store.get(`providerCatalog.${String(providerKey).trim()}.policyV2`) ?? policyFromCanonicalFields(store, providerKey)
  const resolved = explicitPolicy === undefined
    ? readResolvedCatalogPolicyV2(store, providerKey)
    : { source: 'provider_override' as const, policy: validateCatalogPolicyV2(explicitPolicy) }
  const policy = resolved.policy
  if (!policy) {
    return Object.freeze({
      providerKey, ...UNCONFIGURED_CATALOG_POLICY_V2, startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'never',
      listUpdateMode: 'manual', freshnessMs: null, retentionMs: 'never', policy: null,
    })
  }
  return Object.freeze({
    providerKey,
    source: resolved.source,
    startupSyncPolicy: policy.startupSyncPolicy,
    pickerOpenSyncPolicy: policy.pickerOpenSyncPolicy,
    listUpdateMode: policy.listApplyMode,
    freshnessMs: policy.freshnessMs,
    retentionMs: policy.retentionMs,
    policy,
  })
}
