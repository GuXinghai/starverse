import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/vue'
import { defineComponent, getCurrentInstance, h } from 'vue'
import { CatalogQueryService } from '@/next/modelCatalog/catalogQueryService'
import { catalogRuntimeStoreV2ForApp, type CatalogRuntimeStoreV2 } from '@/next/modelCatalog/catalogRuntimeStoreV2'
import { GLOBAL_CATALOG_POLICY_V2_STORE_KEY, providerCatalogPolicyV2StoreKey } from '@/shared/modelCatalog/catalogPolicyResolverV2'
import { resetI18nForTests } from '@/shared/i18n'
import { installGenerationV2TestBridge } from '../../tests/helpers/generationV2Bridge'
import { useAppChatAppLogic } from './app/appChatApp.logic'

const validPolicy = (listApplyMode: 'automatic' | 'manual', retentionMs: number | 'never') => ({
  startupSyncPolicy: 'never' as const,
  pickerOpenSyncPolicy: 'never' as const,
  listApplyMode,
  freshnessMs: null,
  retentionMs,
})

const originalStore = (globalThis as any).electronStore
const originalBridge = (window as any).generationV2

describe('AppChatApp catalog refresh policy', () => {
  let logic!: ReturnType<typeof useAppChatAppLogic>
  let catalogStore!: CatalogRuntimeStoreV2<any>

  beforeEach(() => {
    resetI18nForTests()
    localStorage.setItem('starverse.openRouterTextChat.enabled', '1')
    installGenerationV2TestBridge()
    ;(globalThis as any).electronStore = { get: vi.fn(async () => undefined) }
    vi.spyOn(CatalogQueryService, 'sync').mockResolvedValue({ ok: false, code: 'SYNTHETIC_SYNC_STOP' } as any)
  })

  afterEach(async () => {
    cleanup()
    await Promise.resolve()
    ;(globalThis as any).electronStore = originalStore
    ;(window as any).generationV2 = originalBridge
    localStorage.removeItem('starverse.openRouterTextChat.enabled')
    vi.restoreAllMocks()
  })

  async function mountLogic() {
    const Harness = defineComponent({
      setup() {
        const appIdentity = getCurrentInstance()?.appContext.app
        if (!appIdentity) throw new Error('TEST_APP_CONTEXT_UNAVAILABLE')
        catalogStore = catalogRuntimeStoreV2ForApp(appIdentity)
        logic = useAppChatAppLogic()
        return () => h('div')
      },
    })
    render(Harness)
    await waitFor(() => expect(logic.isReady.value).toBe(true))
    await waitFor(() => expect(catalogStore.read('deepseek').syncState).not.toBe('syncing'))
  }

  it('awaits both policy reads and uses the provider override for a manual catalog refresh', async () => {
    await mountLogic()
    const providerKey = 'deepseek'
    const override = validPolicy('automatic', 86_400_000)
    const global = validPolicy('manual', 'never')
    let releaseGlobalRead!: () => void
    const globalReadGate = new Promise<void>(resolve => { releaseGlobalRead = resolve })
    const get = vi.fn(async (key: string) => {
      if (key === providerCatalogPolicyV2StoreKey(providerKey)) return override
      if (key === GLOBAL_CATALOG_POLICY_V2_STORE_KEY) {
        await globalReadGate
        return global
      }
      return undefined
    })
    ;(globalThis as any).electronStore = { get }

    const refreshing = logic.onRefreshDeepSeekModels()
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    expect(CatalogQueryService.sync).not.toHaveBeenCalled()
    releaseGlobalRead()
    await refreshing

    expect(get).toHaveBeenCalledWith(providerCatalogPolicyV2StoreKey(providerKey))
    expect(get).toHaveBeenCalledWith(GLOBAL_CATALOG_POLICY_V2_STORE_KEY)
    expect(CatalogQueryService.sync).toHaveBeenCalledWith({ sourceProviderKey: providerKey, timeoutMs: 30_000,
      applyMode: 'automatic', retentionMs: 86_400_000 })
    expect(CatalogQueryService.sync).toHaveBeenCalledOnce()
  })

  it('uses manual and never fallbacks when no saved catalog policy exists', async () => {
    await mountLogic()
    const get = vi.fn(async () => undefined)
    ;(globalThis as any).electronStore = { get }

    await logic.onRefreshDeepSeekModels()

    expect(CatalogQueryService.sync).toHaveBeenCalledWith({ sourceProviderKey: 'deepseek', timeoutMs: 30_000,
      applyMode: 'manual', retentionMs: 'never' })
  })

  it('does not start provider sync when a saved policy is invalid', async () => {
    await mountLogic()
    const invalidOverride = { ...validPolicy('automatic', 'never'), listApplyMode: 'automatic-without-review' }
    const get = vi.fn(async (key: string) => key === providerCatalogPolicyV2StoreKey('deepseek')
      ? invalidOverride : validPolicy('manual', 'never'))
    ;(globalThis as any).electronStore = { get }

    await logic.onRefreshDeepSeekModels()

    expect(get).toHaveBeenCalledWith(providerCatalogPolicyV2StoreKey('deepseek'))
    expect(get).toHaveBeenCalledWith(GLOBAL_CATALOG_POLICY_V2_STORE_KEY)
    expect(CatalogQueryService.sync).not.toHaveBeenCalled()
  })
})
