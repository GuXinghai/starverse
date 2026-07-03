import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogQueryResult } from '@/next/modelCatalog/catalogQueryService'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import ModelPickerDialog from './ModelPickerDialog.vue'

const NOW_BASE_MS = 9_000_000_000_000
let nowOffsetMs = 0

function createResult(
  items: CatalogQueryResult['items'],
  nextCursor: CatalogQueryResult['nextCursor'] = null,
  meta: Partial<CatalogQueryResult> = {},
): CatalogQueryResult {
  return {
    items: [...items],
    nextCursor,
    notice: null,
    ...meta,
  }
}

function setCatalogSettings(values: Record<string, unknown>) {
  ;(globalThis as any).electronStore = {
    get: vi.fn(async (key: string) => values[key]),
  }
}

function mockNow() {
  nowOffsetMs += 60_000
  const now = NOW_BASE_MS + nowOffsetMs
  vi.spyOn(Date, 'now').mockReturnValue(now)
  return now
}

describe('ModelPickerDialog OpenRouter catalog sync characterization', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore

  afterEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    delete (globalThis as any).electronAPI
  })

  it('picker-open stale_only triggers sync when the current OpenRouter scope is stale', async () => {
    const now = mockNow()
    const staleSyncedAtMs = now - 16 * 60 * 1000
    setCatalogSettings({
      openRouterCatalogPickerOpenSyncPolicy: 'stale_only',
      openRouterCatalogFreshnessMs: 15 * 60 * 1000,
    })
    const syncNow = vi.fn(async () => ({
      ok: true,
      syncAttempted: true,
      syncSucceeded: true,
      providerKey: 'openrouter',
      modelCount: 100,
      lastSyncAtMs: now,
      errorCode: null,
      errorMessage: null,
      catalogRevision: 'rev-fresh',
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: syncNow,
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        status: 'synced',
        lastSyncAtMs: staleSyncedAtMs,
        modelCount: 100,
        lastErrorCode: null,
        lastErrorMessage: null,
        isStale: true,
        catalogRevision: 'rev-stale',
      })),
    }
    const queryFn = vi.fn(async () => createResult([], null, {
      catalogRevision: 'rev-stale',
      modelCount: 100,
      lastSyncAtMs: staleSyncedAtMs,
    }))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-sync-refresh')
    await waitFor(() => {
      expect(syncNow).toHaveBeenCalledWith(expect.objectContaining({
        providerKey: 'openrouter',
        force: false,
        reason: 'model_picker_opened',
      }))
    })
  })

  it('picker-open stale_only skips sync when the current OpenRouter scope is fresh', async () => {
    const now = mockNow()
    setCatalogSettings({
      openRouterCatalogPickerOpenSyncPolicy: 'stale_only',
      openRouterCatalogFreshnessMs: 15 * 60 * 1000,
    })
    const syncNow = vi.fn(async () => ({
      ok: true,
      syncAttempted: true,
      syncSucceeded: true,
      providerKey: 'openrouter',
      modelCount: 100,
      lastSyncAtMs: now,
      errorCode: null,
      errorMessage: null,
      catalogRevision: 'rev-fresh',
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: syncNow,
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        status: 'synced',
        lastSyncAtMs: now,
        modelCount: 100,
        lastErrorCode: null,
        lastErrorMessage: null,
        isStale: false,
        catalogRevision: 'rev-fresh',
      })),
    }

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn: vi.fn(async () => createResult([], null, {
          catalogRevision: 'rev-fresh',
          modelCount: 100,
          lastSyncAtMs: now,
        })),
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-sync-refresh')
    expect(syncNow).not.toHaveBeenCalled()
  })

  it('picker-open never policy skips automatic sync even when the current OpenRouter scope is stale', async () => {
    const now = mockNow()
    setCatalogSettings({
      openRouterCatalogPickerOpenSyncPolicy: 'never',
      openRouterCatalogFreshnessMs: 15 * 60 * 1000,
    })
    const syncNow = vi.fn(async () => ({
      ok: true,
      syncAttempted: true,
      syncSucceeded: true,
      providerKey: 'openrouter',
      modelCount: 100,
      lastSyncAtMs: now,
      errorCode: null,
      errorMessage: null,
      catalogRevision: 'rev-fresh',
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: syncNow,
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        status: 'synced',
        lastSyncAtMs: now - 16 * 60 * 1000,
        modelCount: 100,
        lastErrorCode: null,
        lastErrorMessage: null,
        isStale: true,
        catalogRevision: 'rev-stale',
      })),
    }

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn: vi.fn(async () => createResult([], null, {
          catalogRevision: 'rev-stale',
          modelCount: 100,
          lastSyncAtMs: now - 16 * 60 * 1000,
        })),
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-sync-refresh')
    expect(syncNow).not.toHaveBeenCalled()
  })

  it('manual refresh sends force sync even when the current OpenRouter scope is fresh', async () => {
    const now = mockNow()
    setCatalogSettings({
      openRouterCatalogPickerOpenSyncPolicy: 'stale_only',
      openRouterCatalogFreshnessMs: 15 * 60 * 1000,
    })
    const syncNow = vi.fn(async () => ({
      ok: true,
      syncAttempted: true,
      syncSucceeded: true,
      providerKey: 'openrouter',
      modelCount: 100,
      lastSyncAtMs: now,
      errorCode: null,
      errorMessage: null,
      catalogRevision: 'rev-manual',
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: syncNow,
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        providerKey: 'openrouter',
        syncState: 'ok',
        status: 'synced',
        lastSyncAtMs: now,
        modelCount: 100,
        lastErrorCode: null,
        lastErrorMessage: null,
        isStale: false,
        catalogRevision: 'rev-fresh',
      })),
    }
    const user = userEvent.setup()

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn: vi.fn(async () => createResult([], null, {
          catalogRevision: 'rev-fresh',
          modelCount: 100,
          lastSyncAtMs: now,
        })),
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-sync-refresh')
    expect(syncNow).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('model-picker-sync-refresh'))

    await waitFor(() => {
      expect(syncNow).toHaveBeenCalledWith(expect.objectContaining({
        providerKey: 'openrouter',
        force: true,
        reason: 'manual_refresh',
      }))
    })
  })
})
