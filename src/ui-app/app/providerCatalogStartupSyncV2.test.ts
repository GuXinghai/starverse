import { describe, expect, it, vi } from 'vitest'
import { listProviderCatalogSourceDescriptors } from '@/shared/modelCatalog/providerCatalogRegistry'
import { GLOBAL_CATALOG_POLICY_V2_STORE_KEY, providerCatalogPolicyV2StoreKey } from '@/shared/modelCatalog/catalogPolicyResolverV2'
import type { CatalogPolicyV2 } from '@/shared/modelCatalog/catalogPolicyV2'
import { syncProviderCatalogsOnStartupV2 } from './providerCatalogStartupSyncV2'

const automaticAlways: CatalogPolicyV2 = Object.freeze({
  startupSyncPolicy: 'always',
  pickerOpenSyncPolicy: 'never',
  listApplyMode: 'automatic',
  freshnessMs: 86_400_000,
  retentionMs: 'never',
})

describe('syncProviderCatalogsOnStartupV2', () => {
  it('keeps an unconfigured profile offline for all five provider catalogs', async () => {
    const sync = vi.fn()
    const status = vi.fn()
    const store = { get: vi.fn(async () => undefined) }

    const results = await syncProviderCatalogsOnStartupV2({ models: { sync, status }, store })

    expect(results).toHaveLength(5)
    expect(results.every((result) => result.reason === 'unconfigured')).toBe(true)
    expect(status).not.toHaveBeenCalled()
    expect(sync).not.toHaveBeenCalled()
  })

  it('applies the user global automatic policy to every registered first-party catalog', async () => {
    const providerKeys = listProviderCatalogSourceDescriptors().map((descriptor) => descriptor.providerKey)
    const sync = vi.fn(async (_payload: unknown) => ({ ok: true }))
    const status = vi.fn(async (_payload: unknown) => ({ ok: true, status: 'not_synced', observedAtMs: null }))
    const store = {
      get: vi.fn(async (key: string) => key === GLOBAL_CATALOG_POLICY_V2_STORE_KEY ? automaticAlways : undefined),
    }

    await syncProviderCatalogsOnStartupV2({ models: { sync, status }, store })

    expect(sync).toHaveBeenCalledTimes(providerKeys.length)
    expect(sync.mock.calls.map(([payload]) => (payload as any).providerKey).sort()).toEqual([...providerKeys].sort())
    expect(sync.mock.calls.every(([payload]) => (payload as any).applyMode === 'automatic')).toBe(true)
  })

  it('honors a provider override and stages manual snapshots without activating them', async () => {
    const manualOverride: CatalogPolicyV2 = Object.freeze({
      startupSyncPolicy: 'always',
      pickerOpenSyncPolicy: 'always',
      listApplyMode: 'manual',
      freshnessMs: 86_400_000,
      retentionMs: 'never',
    })
    const sync = vi.fn(async (_payload: unknown) => ({ ok: true }))
    const status = vi.fn(async (_payload: unknown) => ({ ok: true, status: 'synced', observedAtMs: Date.now() }))
    const store = {
      get: vi.fn(async (key: string) => {
        if (key === GLOBAL_CATALOG_POLICY_V2_STORE_KEY) {
          return { ...automaticAlways, startupSyncPolicy: 'never' }
        }
        if (key === providerCatalogPolicyV2StoreKey('deepseek')) return manualOverride
        return undefined
      }),
    }

    await syncProviderCatalogsOnStartupV2({ models: { sync, status }, store })

    expect(sync).toHaveBeenCalledTimes(1)
    expect(sync).toHaveBeenCalledWith(expect.objectContaining({ providerKey: 'deepseek', applyMode: 'manual' }))
  })
})
