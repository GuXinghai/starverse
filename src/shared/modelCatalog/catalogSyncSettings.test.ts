import { describe, expect, it } from 'vitest'
import {
  CATALOG_FRESHNESS_PRESETS_MS,
  DEFAULT_CATALOG_AUTO_SYNC_POLICY,
  DEFAULT_CATALOG_FRESHNESS_MS,
  DEFAULT_CATALOG_LIST_UPDATE_MODE,
  isCatalogStatusStale,
  normalizeCatalogAutoSyncPolicy,
  normalizeCatalogFreshnessMs,
  normalizeCatalogListUpdateMode,
} from './catalogSyncSettings'

describe('catalogSyncSettings', () => {
  it('normalizes missing and invalid settings to defaults', () => {
    expect(normalizeCatalogAutoSyncPolicy(undefined)).toBe(DEFAULT_CATALOG_AUTO_SYNC_POLICY)
    expect(normalizeCatalogAutoSyncPolicy('bad')).toBe(DEFAULT_CATALOG_AUTO_SYNC_POLICY)
    expect(normalizeCatalogListUpdateMode(undefined)).toBe(DEFAULT_CATALOG_LIST_UPDATE_MODE)
    expect(normalizeCatalogListUpdateMode('bad')).toBe(DEFAULT_CATALOG_LIST_UPDATE_MODE)
    expect(normalizeCatalogFreshnessMs(undefined)).toBe(DEFAULT_CATALOG_FRESHNESS_MS)
    expect(normalizeCatalogFreshnessMs(12345)).toBe(DEFAULT_CATALOG_FRESHNESS_MS)
  })

  it('accepts only approved freshness presets', () => {
    for (const preset of CATALOG_FRESHNESS_PRESETS_MS) {
      expect(normalizeCatalogFreshnessMs(preset)).toBe(preset)
      expect(normalizeCatalogFreshnessMs(String(preset))).toBe(preset)
    }
  })

  it('detects stale status from last sync time and freshness', () => {
    const nowMs = 1_000_000
    expect(isCatalogStatusStale({
      status: 'synced',
      lastSyncAtMs: nowMs - 1_000,
      freshnessMs: CATALOG_FRESHNESS_PRESETS_MS[0],
      nowMs,
    })).toBe(false)
    expect(isCatalogStatusStale({
      status: 'synced',
      lastSyncAtMs: nowMs - CATALOG_FRESHNESS_PRESETS_MS[0],
      freshnessMs: CATALOG_FRESHNESS_PRESETS_MS[0],
      nowMs,
    })).toBe(true)
    expect(isCatalogStatusStale({ status: 'failed', lastSyncAtMs: nowMs, nowMs })).toBe(true)
  })
})
