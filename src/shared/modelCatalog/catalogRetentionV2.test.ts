import { describe, expect, it } from 'vitest'
import { selectCatalogSnapshotsForRetentionV2 } from './catalogRetentionV2'

describe('catalog retention V2', () => {
  it('keeps active, referenced, and latest successful snapshots', () => {
    const snapshots = [
      { snapshotId: 'active', createdAtMs: 1, active: true, referenced: false, successful: true },
      { snapshotId: 'latest', createdAtMs: 90, active: false, referenced: false, successful: true },
      { snapshotId: 'old', createdAtMs: 1, active: false, referenced: false, successful: true },
      { snapshotId: 'referenced', createdAtMs: 1, active: false, referenced: true, successful: true },
    ] as const
    expect(selectCatalogSnapshotsForRetentionV2(snapshots, 50, 100)).toEqual(['old'])
  })

  it('never deletes anything when the user selects permanent retention', () => {
    expect(selectCatalogSnapshotsForRetentionV2([
      { snapshotId: 'old', createdAtMs: 1, active: false, referenced: false, successful: true },
    ], 'never', 100)).toEqual([])
  })
})
