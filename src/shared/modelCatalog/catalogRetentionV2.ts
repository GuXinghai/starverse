import type { CatalogRetention } from './catalogPolicyV2'

export type CatalogSnapshotRetentionCandidateV2 = Readonly<{
  snapshotId: string
  createdAtMs: number
  active: boolean
  referenced: boolean
  successful: boolean
}>

/**
 * Retention only selects inactive, unreferenced historical snapshots. The
 * active pointer and the most recent successful snapshot are always kept.
 */
export function selectCatalogSnapshotsForRetentionV2(
  snapshots: readonly CatalogSnapshotRetentionCandidateV2[],
  retentionMs: CatalogRetention,
  nowMs: number,
): readonly string[] {
  if (retentionMs === 'never' || !Number.isSafeInteger(nowMs) || nowMs < 0) return []
  const cutoff = nowMs - retentionMs
  const successful = snapshots.filter((snapshot) => snapshot.successful)
  const newestSuccessfulId = successful.length === 0
    ? null
    : successful.reduce((newest, snapshot) => snapshot.createdAtMs > newest.createdAtMs ? snapshot : newest).snapshotId
  return snapshots
    .filter((snapshot) => !snapshot.active && !snapshot.referenced && snapshot.snapshotId !== newestSuccessfulId)
    .filter((snapshot) => snapshot.createdAtMs <= cutoff)
    .map((snapshot) => snapshot.snapshotId)
}
