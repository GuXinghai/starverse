import { describe, expect, it, vi } from 'vitest'
import { providerCatalogSettingKey, type ProviderCatalogSettingsStoreReader } from '../../src/shared/modelCatalog/providerCatalogSettings'
import { cleanupExpiredProviderScopedCatalogCaches } from './providerCatalogCacheCleanup'

function createStore(values: Record<string, unknown>): ProviderCatalogSettingsStoreReader {
  return {
    get: vi.fn((key: string) => values[key]),
  }
}

describe('providerCatalogCacheCleanup', () => {
  it('uses provider-neutral retention settings and cleanup calls for non-OpenRouter providers', async () => {
    const dbWorkerManager = {
      call: vi.fn(async () => ({ deleted: { catalog_scope_meta: 2 }, deletedScopeCount: 2 })),
    } as any

    const result = await cleanupExpiredProviderScopedCatalogCaches({
      store: createStore({
        [providerCatalogSettingKey('google_ai_studio', 'retentionMs')]: 7 * 24 * 60 * 60 * 1000,
      }) as any,
      dbWorkerManager,
      providerKey: 'google_ai_studio',
      nowMs: 1234,
    })

    expect(result).toMatchObject({ ok: true, skipped: false, deletedScopeCount: 2 })
    expect(dbWorkerManager.call).toHaveBeenCalledWith('modelCatalog.cleanupExpiredScopedCatalogCaches', {
      providerKey: 'google_ai_studio',
      nowMs: 1234,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
    })
  })
})
