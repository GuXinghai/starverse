import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runProviderCatalogSyncJob } from './providerCatalogSyncJob'
import type { ProviderCatalogSnapshot } from '../../src/shared/modelCatalog/providerCatalogContracts'
import type { CatalogModel } from '../../src/shared/modelCatalog/internalSchema'

const sourceRegistryMock = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
}))

vi.mock('../../src/shared/modelCatalog/providerCatalogSourceRegistry', () => ({
  requireProviderCatalogSource: vi.fn(() => ({
    descriptor: {
      providerKey: 'google_ai_studio',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com',
      defaultDataSource: 'models_user_primary',
    },
    fetchSnapshot: sourceRegistryMock.fetchSnapshot,
  })),
}))

function createStore(values: Record<string, unknown> = {}) {
  return {
    get: vi.fn((key: string) => values[key]),
    set: vi.fn((key: string, value: unknown) => {
      values[key] = value
    }),
  } as any
}

function makeModel(): CatalogModel {
  const nowMs = Date.now()
  return {
    modelKey: 'google_ai_studio::gemini-2.5-flash',
    providerKey: 'google_ai_studio',
    modelId: 'gemini-2.5-flash',
    canonicalSlug: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    description: null,
    vendor: 'Google',
    family: 'gemini',
    status: 'active',
    visibility: 'visible',
    contextLength: 1048576,
    maxOutputTokens: 65536,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: ['temperature'],
    capabilities: {
      reasoning: true,
      tools: false,
      structuredOutputs: false,
      vision: false,
      longContext: true,
    },
    pricing: null,
    tags: [],
    firstSeenAtMs: nowMs,
    lastSeenAtMs: nowMs,
    syncedAtMs: nowMs,
  }
}

function makeSnapshot(): ProviderCatalogSnapshot {
  return {
    providerKey: 'google_ai_studio',
    baseUrl: 'https://generativelanguage.googleapis.com',
    dataSource: 'models_user_primary',
    fetchedAtMs: 123,
    models: [makeModel()],
  }
}

describe('providerCatalogSyncJob', () => {
  beforeEach(() => {
    sourceRegistryMock.fetchSnapshot.mockReset()
  })

  it('syncs Google AI Studio through provider source into scoped catalog tables', async () => {
    const rawApiKey = 'AIza-google-catalog-secret'
    sourceRegistryMock.fetchSnapshot.mockResolvedValue(makeSnapshot())
    const dbWorkerManager = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'modelCatalog.getScopedMeta') return null
        if (method === 'modelCatalog.writeScopedSnapshot') return { ok: true, ...params }
        throw new Error(`unexpected method ${method}`)
      }),
    } as any
    const credentialService = {
      readApiKey: vi.fn(() => ({
        ok: true,
        providerKey: 'google_ai_studio',
        apiKey: rawApiKey,
        source: 'secure_store',
        backend: 'electron_safe_storage',
        migratedFromLegacy: false,
        warnings: [],
      })),
    } as any
    const fetchImpl = vi.fn() as unknown as typeof fetch

    const result = await runProviderCatalogSyncJob({
      providerKey: 'google_ai_studio',
      store: createStore({
        openRouterApiKey: 'sk-openrouter-should-not-be-read',
        openRouterCatalogLocalSecret: 'local-secret-for-provider-sync-job-tests-1234567890',
      }),
      credentialService,
      dbWorkerManager,
      fetchImpl,
      force: true,
    })

    expect(result).toMatchObject({
      providerKey: 'google_ai_studio',
      reason: 'synced',
      syncAttempted: true,
      syncSucceeded: true,
      modelCountAfter: 1,
    })
    expect(credentialService.readApiKey).toHaveBeenCalledWith('google_ai_studio')
    expect(sourceRegistryMock.fetchSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'google_ai_studio',
      apiKey: rawApiKey,
      baseUrl: 'https://generativelanguage.googleapis.com',
      fetchImpl,
    }))
    expect(dbWorkerManager.call).toHaveBeenCalledWith('modelCatalog.writeScopedSnapshot', expect.objectContaining({
      providerKey: 'google_ai_studio',
      baseUrl: 'https://generativelanguage.googleapis.com',
      dataSource: 'models_user_primary',
      models: expect.arrayContaining([
        expect.objectContaining({
          modelId: 'gemini-2.5-flash',
          modelKey: 'google_ai_studio::gemini-2.5-flash',
        }),
      ]),
    }))
    const serializedDbCalls = JSON.stringify(dbWorkerManager.call.mock.calls)
    expect(serializedDbCalls).not.toContain(rawApiKey)
    expect(serializedDbCalls).not.toContain('sk-openrouter-should-not-be-read')
  })

  it('does not read OpenRouter legacy credentials for Google when secure credential is missing', async () => {
    const dbWorkerManager = { call: vi.fn() } as any
    const credentialService = {
      readApiKey: vi.fn(() => ({
        ok: false,
        providerKey: 'google_ai_studio',
        code: 'credential_missing',
        message: 'missing',
        source: 'missing',
        backend: 'electron_safe_storage',
        warnings: [],
      })),
    } as any

    const result = await runProviderCatalogSyncJob({
      providerKey: 'google_ai_studio',
      store: createStore({ openRouterApiKey: 'sk-openrouter-should-not-be-used' }),
      credentialService,
      dbWorkerManager,
      force: true,
    })

    expect(result).toMatchObject({
      providerKey: 'google_ai_studio',
      reason: 'missing_api_key_no_cache',
      syncAttempted: true,
      syncSucceeded: false,
    })
    expect(dbWorkerManager.call).not.toHaveBeenCalled()
    expect(sourceRegistryMock.fetchSnapshot).not.toHaveBeenCalled()
  })
})
