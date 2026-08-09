import type { CatalogPolicyV2 } from './catalogPolicyV2'

export type CatalogPolicyPresetV2 = 'manual' | 'frequent' | 'balanced' | 'low_frequency' | 'custom'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export const CATALOG_POLICY_PRESETS_V2: Readonly<Record<Exclude<CatalogPolicyPresetV2, 'custom'>, CatalogPolicyV2>> = Object.freeze({
  manual: Object.freeze({
    startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'never', listApplyMode: 'manual', freshnessMs: null, retentionMs: 90 * DAY,
  }),
  frequent: Object.freeze({
    startupSyncPolicy: 'stale_only', pickerOpenSyncPolicy: 'stale_only', listApplyMode: 'automatic', freshnessMs: HOUR, retentionMs: 90 * DAY,
  }),
  balanced: Object.freeze({
    startupSyncPolicy: 'stale_only', pickerOpenSyncPolicy: 'stale_only', listApplyMode: 'automatic', freshnessMs: DAY, retentionMs: 90 * DAY,
  }),
  low_frequency: Object.freeze({
    startupSyncPolicy: 'stale_only', pickerOpenSyncPolicy: 'stale_only', listApplyMode: 'manual', freshnessMs: 7 * DAY, retentionMs: 180 * DAY,
  }),
})

export function catalogPolicyPresetV2(preset: CatalogPolicyPresetV2): CatalogPolicyV2 | null {
  return preset === 'custom' ? null : CATALOG_POLICY_PRESETS_V2[preset]
}
