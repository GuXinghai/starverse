import { afterEach, describe, expect, it, vi } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ModelCatalogRepo } from '../../infra/db/repo/modelCatalogRepo'
import { syncOpenRouterModelCatalog } from '../../src/next/modelCatalog/catalogSyncJob'
import { CatalogQueryService } from '../../src/next/modelCatalog/catalogQueryService'
import { getModelEndpointDetails } from '../../src/next/modelCatalog/modelEndpointDetailService'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function loadFixtureJson(filename: string): unknown {
  const fixturePath = path.resolve(process.cwd(), 'tests', 'fixtures', 'model-catalog', filename)
  return JSON.parse(readFileSync(fixturePath, 'utf8'))
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const originalDbBridge = (globalThis as any).dbBridge
const originalElectronStore = (globalThis as any).electronStore
const originalFetch = (globalThis as any).fetch

describe('integration: stage4 catalog smoke (fixtures only)', () => {
  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('covers model-level filter groups with fixture-based sync and category membership', async () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    const modelsUserFixture = loadFixtureJson('openrouter-models-user-stage4.fixture.json')
    const providersFixture = loadFixtureJson('openrouter-providers.fixture.json')
    const scienceCategoryFixture = loadFixtureJson('openrouter-models-category-science.fixture.json')
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    const syncFetch = async (url: string): Promise<Response> => {
      if (url.endsWith('/models/user')) return jsonResponse(modelsUserFixture)
      if (url.endsWith('/providers')) return jsonResponse(providersFixture)
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }

    const syncResult = await syncOpenRouterModelCatalog({
      apiKey: 'sk-integration',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl: syncFetch as any,
      snapshotId: 'snap_stage4_matrix_1',
      logger,
      writer: {
        syncSnapshot: (input) => repo.syncSnapshot(input),
        syncCoreSnapshot: (input) => repo.syncCoreSnapshot(input),
      },
    })
    expect(syncResult.ok).toBe(true)
    if (!syncResult.ok) throw new Error(`expected successful sync, got ${syncResult.reason}`)
    expect(syncResult.modelCount).toBe(6)

    const byIdentity = repo.queryCore({
      providerKey: 'openrouter',
      searchText: 'openai/vision-pro',
      limit: 10,
    })
    expect(byIdentity.items.map((item) => item.modelId)).toEqual(['openai/vision-pro'])

    const capabilityContext = repo.queryCore({
      providerKey: 'openrouter',
      contextLength: { min: 150000 },
      limit: 10,
    })
    expect(capabilityContext.items.map((item) => item.modelId)).toEqual(['openai/vision-pro'])

    const capabilityOutput = repo.queryCore({
      providerKey: 'openrouter',
      maxOutputTokens: { min: 7000 },
      limit: 10,
    })
    expect(capabilityOutput.items.map((item) => item.modelId)).toEqual(['openai/reasoner-mini'])

    const modalityCombo = repo.queryCore({
      providerKey: 'openrouter',
      architectureModalities: ['text->image'],
      outputModalities: ['image'],
      limit: 10,
    })
    expect(modalityCombo.items.map((item) => item.modelId)).toEqual(['openai/image-writer'])

    const featuresByParameter = repo.queryCore({
      providerKey: 'openrouter',
      supportedParameters: ['tools'],
      limit: 10,
    })
    expect(featuresByParameter.items.map((item) => item.modelId)).toEqual(['openai/vision-pro'])

    const compliance = repo.queryCore({
      providerKey: 'openrouter',
      topProviderIsModerated: true,
      limit: 10,
    })
    expect(compliance.items.map((item) => item.modelId)).toEqual(['openai/vision-pro'])

    const lifecycleExpiredExcluded = repo.queryCore({
      providerKey: 'openrouter',
      searchText: 'Expired Legacy',
      limit: 10,
    })
    expect(lifecycleExpiredExcluded.items).toHaveLength(0)

    const createdDesc = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'created_at',
      sortOrder: 'desc',
      limit: 1,
    })
    expect(createdDesc.items[0]?.modelId).toBe('openai/structured-lite')

    const hasPerRequestLimits = repo.queryCore({
      providerKey: 'openrouter',
      hasPerRequestLimits: true,
      limit: 10,
    })
    expect(hasPerRequestLimits.items.map((item) => item.modelId)).toEqual(['openai/vision-pro'])

    const hasDefaultParameters = repo.queryCore({
      providerKey: 'openrouter',
      hasDefaultParameters: true,
      limit: 10,
    })
    expect(hasDefaultParameters.items.map((item) => item.modelId).sort()).toEqual([
      'openai/structured-lite',
      'openai/vision-pro',
    ])

    const queryInvoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'modelCatalog.getCoreMeta') {
        return repo.getCoreMeta(String(params?.providerKey ?? 'openrouter'))
      }
      if (method === 'modelCatalog.queryCore') {
        return repo.queryCore(params ?? {})
      }
      throw new Error(`unexpected db method: ${method}`)
    })
    const categoryFetch = vi.fn(async (url: string) => {
      if (url.includes('/models?category=science')) return jsonResponse(scienceCategoryFixture)
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    })
    ;(globalThis as any).dbBridge = { invoke: queryInvoke }
    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'sk-integration'
        if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
        return null
      }),
    }
    ;(globalThis as any).fetch = categoryFetch

    const categoryResult = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      filter: { category: 'science' },
      sort: { by: 'name', order: 'asc' },
    })

    expect(categoryResult.items.map((item) => item.modelId)).toEqual(['openai/vision-pro'])
    expect(categoryResult.notice).toBeNull()
    expect(categoryFetch).toHaveBeenCalledTimes(1)
    db.close()
  })

  it('covers endpoint cache critical path: first fetch, cache hit, manual refresh, refresh fallback', async () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const endpointFixture = loadFixtureJson('openrouter-endpoints-openai-gpt-4.fixture.json')
    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'endpoint_seed',
      providers: [
        {
          providerKey: 'openrouter',
          displayName: 'OpenRouter',
          slug: 'openrouter',
          privacyPolicyUrl: null,
          termsOfServiceUrl: null,
          statusPageUrl: null,
          updatedAtMs: 0,
          rawJson: null,
        },
      ],
      models: [
        {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4',
          modelKey: 'openrouter::openai/gpt-4',
          canonicalSlug: 'openai/gpt-4',
          displayName: 'GPT-4',
          description: 'seed model for endpoint cache integration test',
          vendor: 'openai',
          family: 'gpt',
          status: 'active',
          visibility: 'visible',
          contextLength: 8192,
          maxOutputTokens: 4096,
          architectureModality: 'text->text',
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          tokenizer: null,
          instructType: null,
          supportedParametersJson: '["temperature"]',
          capabilitiesJson: '{}',
          capReasoning: 0,
          capTools: 0,
          capStructuredOutputs: 0,
          capVision: 0,
          capLongContext: 0,
          firstSeenAtMs: 0,
          lastSeenAtMs: 0,
          syncedAtMs: 0,
          rawJson: null,
        },
      ],
      tags: [],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'models_user_primary',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'endpoint_seed',
        modelCount: 1,
        visibleModelCount: 1,
        hiddenModelCount: 0,
        providerCount: 1,
        lastCountProbe: null,
        lastCountProbeAtMs: null,
        lastSyncAtMs: 0,
        ttlSeconds: 3600,
        syncState: 'ok',
        lastErrorCode: null,
        lastErrorMessage: null,
        rawRetentionPolicyJson: '{"mode":"none"}',
      },
    })

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/models/openai/gpt-4/endpoints')) {
        return jsonResponse(endpointFixture)
      }
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    })
    ;(globalThis as any).fetch = fetchMock
    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'sk-integration'
        if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
        return null
      }),
    }
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string, params?: any) => {
        if (method === 'modelCatalog.getCoreMeta') {
          return {
            providerKey: 'openrouter',
            baseUrl: 'https://openrouter.ai/api/v1',
          }
        }
        if (method === 'modelCatalog.listEndpointMeta') {
          return repo.listEndpointMetaByModel(
            String(params?.providerKey ?? ''),
            String(params?.baseUrl ?? ''),
            String(params?.modelId ?? ''),
          )
        }
        if (method === 'modelCatalog.replaceEndpointMeta') {
          repo.replaceEndpointMetaByModel(params as any)
          return { ok: true }
        }
        throw new Error(`unexpected db method: ${method}`)
      }),
    }

    const first = await getModelEndpointDetails({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
    })
    expect(first.source).toBe('network')
    expect(first.items).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const second = await getModelEndpointDetails({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
    })
    expect(second.source).toBe('cache')
    expect(second.items).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const refreshed = await getModelEndpointDetails({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
      forceRefresh: true,
    })
    expect(refreshed.source).toBe('network')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fetchMock.mockImplementation(async () =>
      jsonResponse({ error: { code: 503, message: 'upstream unavailable' } }, 503),
    )
    const fallback = await getModelEndpointDetails({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
      forceRefresh: true,
    })
    expect(fallback.source).toBe('cache')
    expect(fallback.items).toHaveLength(2)
    expect(String(fallback.error ?? '')).toContain('upstream unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    db.close()
  })
})
