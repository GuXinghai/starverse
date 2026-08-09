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
    status: 'synced',
    ...meta,
  }
}

function setCatalogSettings(values: Record<string, unknown>) {
  ;(globalThis as any).electronStore = {
    get: vi.fn(async (key: string) => values[key]),
  }
  const current = (globalThis as any).generationV2 ?? {}
  ;(globalThis as any).generationV2 = {
    ...current,
    models: {
      ...(current.models ?? {}),
      sync: vi.fn(async (payload: any) => {
        const result = await (globalThis as any).electronAPI.modelCatalogSyncNow(payload)
        return result?.ok === true && result?.syncSucceeded !== false
          ? { ok: true, status: 'synced', modelCount: result.modelCount ?? 0,
              visibleModelCount: result.visibleModelCount ?? result.modelCount ?? 0,
              hiddenModelCount: result.hiddenModelCount ?? 0,
              responseDigest: result.catalogRevision ?? null, observedAtMs: result.lastSyncAtMs ?? Date.now() }
          : { ok: false, code: result?.errorCode ?? 'sync_failed' }
      }),
      status: vi.fn(async (payload: any) => {
        const result = await (globalThis as any).electronAPI.modelCatalogGetSyncStatus(payload)
        return { ok: result?.ok !== false, status: result?.status ?? (result?.syncState === 'ok' ? 'synced' : 'not_synced'),
          modelCount: result?.modelCount ?? 0, visibleModelCount: result?.visibleModelCount ?? result?.modelCount ?? 0,
          hiddenModelCount: result?.hiddenModelCount ?? 0, responseDigest: result?.catalogRevision ?? null,
          observedAtMs: result?.lastSyncAtMs ?? null, errorCode: result?.lastErrorCode ?? null }
      }),
    },
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
  const originalGenerationV2 = (globalThis as any).generationV2

  afterEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).generationV2 = originalGenerationV2
    delete (globalThis as any).electronAPI
  })

  it('picker-open stale_only triggers sync when the current OpenRouter scope is stale', async () => {
    const now = mockNow()
    const staleSyncedAtMs = now - 16 * 60 * 1000
    setCatalogSettings({
      catalogPolicyV2: { startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'stale_only', listApplyMode: 'automatic', freshnessMs: 15 * 60 * 1000, retentionMs: 'never' },
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
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-sync-refresh')
    await waitFor(() => {
      expect(queryFn.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(queryFn).toHaveBeenLastCalledWith(expect.objectContaining({ sourceProviderKey: 'openrouter' }))
    })
  })

  it('picker-open stale_only skips sync when the current OpenRouter scope is fresh', async () => {
    const now = mockNow()
    setCatalogSettings({
      catalogPolicyV2: { startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'stale_only', listApplyMode: 'automatic', freshnessMs: 15 * 60 * 1000, retentionMs: 'never' },
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

    const queryFn = vi.fn(async () => createResult([], null, {
      catalogRevision: 'rev-fresh', modelCount: 100, lastSyncAtMs: now,
    }))
    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-sync-refresh')
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('picker-open never policy skips automatic sync even when the current OpenRouter scope is stale', async () => {
    const now = mockNow()
    setCatalogSettings({
      catalogPolicyV2: { startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'never', listApplyMode: 'automatic', freshnessMs: 15 * 60 * 1000, retentionMs: 'never' },
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
        selectedProviderId: 'openrouter',
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
      catalogPolicyV2: { startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'stale_only', listApplyMode: 'automatic', freshnessMs: 15 * 60 * 1000, retentionMs: 'never' },
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
    const queryFn = vi.fn(async () => createResult([], null, {
      catalogRevision: 'rev-fresh', modelCount: 100, lastSyncAtMs: now,
    }))

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
      },
    })

    await screen.findByTestId('model-picker-sync-refresh')
    expect(syncNow).not.toHaveBeenCalled()
    const callsBeforeRefresh = queryFn.mock.calls.length

    await user.click(screen.getByTestId('model-picker-sync-refresh'))

    await waitFor(() => {
      expect(queryFn.mock.calls.length).toBeGreaterThan(callsBeforeRefresh)
      expect(queryFn).toHaveBeenLastCalledWith(expect.objectContaining({ sourceProviderKey: 'openrouter' }))
    })
  })

  it('provider filter routes catalog query while bottom sync provider routes manual sync scope', async () => {
    const now = mockNow()
    setCatalogSettings({
      catalogPolicyV2: { startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'never', listApplyMode: 'automatic', freshnessMs: 15 * 60 * 1000, retentionMs: 'never' },
      'providerCatalog.google_ai_studio.policyV2': { startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'stale_only', listApplyMode: 'automatic', freshnessMs: 15 * 60 * 1000, retentionMs: 'never' },
    })
    const syncNow = vi.fn(async (options: any) => ({
      ok: true,
      syncAttempted: true,
      syncSucceeded: true,
      providerKey: options?.providerKey ?? 'unknown',
      modelCount: 1,
      visibleModelCount: 1,
      hiddenModelCount: 0,
      lastSyncAtMs: now,
      errorCode: null,
      errorMessage: null,
      catalogRevision: `${options?.providerKey ?? 'unknown'}-rev`,
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: syncNow,
      modelCatalogGetSyncStatus: vi.fn(async (options: any) => options?.providerKey === 'google_ai_studio'
        ? {
            providerKey: 'google_ai_studio',
            syncState: 'idle',
            status: 'not_synced',
            lastSyncAtMs: 0,
            modelCount: 0,
            visibleModelCount: 0,
            hiddenModelCount: 0,
            lastErrorCode: null,
            lastErrorMessage: null,
            isStale: true,
            catalogRevision: null,
          }
        : {
            providerKey: 'openrouter',
            syncState: 'ok',
            status: 'synced',
            lastSyncAtMs: now,
            modelCount: 100,
            lastErrorCode: null,
            lastErrorMessage: null,
            isStale: false,
            catalogRevision: 'openrouter-rev',
          }),
    }
    const queryFn = vi.fn(async (input: any) => input.sourceProviderKey === 'google_ai_studio'
      ? createResult([
          {
            providerKey: 'google_ai_studio',
            modelId: 'gemini-2.5-flash',
            modelKey: 'google_ai_studio::gemini-2.5-flash',
            canonicalSlug: 'gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            description: null,
            vendor: 'Google',
            contextLength: 1048576,
            maxOutputTokens: 65536,
            createdAtSec: null,
            pricing: { prompt: null, completion: null, request: null, image: null },
            capabilities: {
              reasoning: true,
              tools: true,
              structuredOutputs: true,
              vision: true,
              longContext: true,
            },
            inputModalities: ['text', 'image'],
            outputModalities: ['text'],
            supportedParameters: ['temperature'],
            status: 'active',
            visibility: 'visible',
          },
        ], null, {
          catalogRevision: 'google-rev',
          modelCount: 1,
          visibleModelCount: 1,
          hiddenModelCount: 0,
          lastSyncAtMs: now,
        })
      : createResult([], null, {
          catalogRevision: 'openrouter-rev',
          modelCount: 100,
          lastSyncAtMs: now,
        }))
    const user = userEvent.setup()

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
        providerSources: [
          {
            providerId: 'google_ai_studio',
            providerName: 'Google AI Studio',
            statusKind: 'not_loaded',
            statusLabel: 'not loaded',
            loading: false,
            items: [],
          },
        ],
      },
    })

    await screen.findByTestId('model-picker-provider-filter-google_ai_studio')
    await user.click(screen.getByTestId('model-picker-provider-select-none'))
    await user.click(screen.getByTestId('model-picker-provider-filter-google_ai_studio'))

    await screen.findByTestId('model-picker-item-google_ai_studio-gemini-2.5-flash')
    await waitFor(() => {
      expect(queryFn).toHaveBeenCalledWith(expect.objectContaining({
        sourceProviderKey: 'google_ai_studio',
      }))
    })

    await user.selectOptions(screen.getByTestId('model-picker-sync-provider'), 'google_ai_studio')
    const googleCallsBeforeRefresh = queryFn.mock.calls.filter(([input]) => input.sourceProviderKey === 'google_ai_studio').length
    await user.click(screen.getByTestId('model-picker-sync-refresh'))

    await waitFor(() => {
      expect(queryFn.mock.calls.filter(([input]) => input.sourceProviderKey === 'google_ai_studio').length)
        .toBeGreaterThan(googleCallsBeforeRefresh)
    })
  })

  it('provider row refresh sends force sync for that provider scope and reloads checked provider results', async () => {
    const now = mockNow()
    setCatalogSettings({
      catalogPolicyV2: { startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'never', listApplyMode: 'automatic', freshnessMs: 15 * 60 * 1000, retentionMs: 'never' },
      'providerCatalog.google_ai_studio.policyV2': { startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'never', listApplyMode: 'automatic', freshnessMs: 15 * 60 * 1000, retentionMs: 'never' },
    })
    const syncNow = vi.fn(async (options: any) => ({
      ok: true,
      syncAttempted: true,
      syncSucceeded: true,
      providerKey: options?.providerKey ?? 'unknown',
      modelCount: 1,
      visibleModelCount: 1,
      hiddenModelCount: 0,
      lastSyncAtMs: now,
      errorCode: null,
      errorMessage: null,
      catalogRevision: `${options?.providerKey ?? 'unknown'}-rev`,
    }))
    ;(globalThis as any).electronAPI = {
      modelCatalogSyncNow: syncNow,
      modelCatalogGetSyncStatus: vi.fn(async (options: any) => ({
        providerKey: options?.providerKey ?? 'openrouter',
        syncState: 'ok',
        status: 'synced',
        lastSyncAtMs: now,
        modelCount: options?.providerKey === 'google_ai_studio' ? 1 : 100,
        visibleModelCount: options?.providerKey === 'google_ai_studio' ? 1 : 100,
        hiddenModelCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        isStale: false,
        catalogRevision: `${options?.providerKey ?? 'openrouter'}-rev`,
      })),
    }
    const oldGoogleModel: CatalogQueryResult['items'][number] = {
      providerKey: 'google_ai_studio',
      modelId: 'gemini-old',
      modelKey: 'google_ai_studio::gemini-old',
      canonicalSlug: 'gemini-old',
      displayName: 'Gemini Old',
      description: null,
      vendor: 'Google',
      contextLength: 1048576,
      maxOutputTokens: 65536,
      createdAtSec: null,
      pricing: { prompt: null, completion: null, request: null, image: null },
      capabilities: {
        reasoning: true,
        tools: true,
        structuredOutputs: true,
        vision: true,
        longContext: true,
      },
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      supportedParameters: ['temperature'],
      status: 'active',
      visibility: 'visible',
    }
    const newGoogleModel = {
      ...oldGoogleModel,
      modelId: 'gemini-new',
      modelKey: 'google_ai_studio::gemini-new',
      canonicalSlug: 'gemini-new',
      displayName: 'Gemini New',
    }
    let googleQueryCount = 0
    const queryFn = vi.fn(async (input: any) => {
      if (input.sourceProviderKey !== 'google_ai_studio') {
        return createResult([], null, {
          catalogRevision: 'openrouter-rev',
          modelCount: 100,
          lastSyncAtMs: now,
        })
      }
      googleQueryCount += 1
      return createResult([googleQueryCount === 1 ? oldGoogleModel : newGoogleModel], null, {
        catalogRevision: googleQueryCount === 1 ? 'google-rev-old' : 'google-rev-new',
        modelCount: 1,
        visibleModelCount: 1,
        hiddenModelCount: 0,
        lastSyncAtMs: now,
      })
    })
    const user = userEvent.setup()

    render(ModelPickerDialog, {
      props: {
        open: true,
        selectedProviderId: 'openrouter',
        selectedModelId: DEFAULT_OPENROUTER_TEST_MODEL,
        queryFn,
        debounceMs: 0,
        providerSources: [
          {
            providerId: 'google_ai_studio',
            providerName: 'Google AI Studio',
            statusKind: 'not_loaded',
            statusLabel: 'not loaded',
            loading: false,
            items: [],
          },
        ],
      },
    })

    await screen.findByTestId('model-picker-item-google_ai_studio-gemini-old')
    const googleCallsBeforeRefresh = googleQueryCount
    await user.click(screen.getByTestId('model-picker-provider-refresh-google_ai_studio'))

    await waitFor(() => {
      expect(googleQueryCount).toBeGreaterThan(googleCallsBeforeRefresh)
    })
    await screen.findByTestId('model-picker-item-google_ai_studio-gemini-new')
  })
})
