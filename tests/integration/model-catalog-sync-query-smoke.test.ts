import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ModelCatalogRepo } from '../../infra/db/repo/modelCatalogRepo'
import { createOpenRouterCatalogSource } from '../../src/shared/modelCatalog/providers/openrouter/openRouterCatalogSource'
import { mapProviderCatalogSnapshotToScopedWriterInput } from '../../src/shared/modelCatalog/providerCatalogSnapshotMapper'

const OPENROUTER_SCOPE_KEY = 'test-openrouter-scope'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

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

function buildBulkModelsFixture(count: number): { data: Array<Record<string, unknown>> } {
  return {
    data: Array.from({ length: count }, (_, index) => ({
      id: `openai/bulk-${String(index).padStart(2, '0')}`,
      canonical_slug: `openai/bulk-${String(index).padStart(2, '0')}`,
      name: `Bulk ${String(index).padStart(2, '0')}`,
      description: `Bulk model ${index}`,
      created: 1_702_000_000 + index,
      context_length: 8192,
      supported_parameters: ['temperature'],
      architecture: {
        modality: 'text->text',
        input_modalities: ['text'],
        output_modalities: ['text'],
      },
      pricing: {
        prompt: '0.00001',
        completion: '0.00002',
        request: '0',
        image: '0',
      },
    })),
  }
}

async function writeOpenRouterScopedSnapshot(input: Readonly<{
  repo: ModelCatalogRepo
  fetchImpl: typeof fetch
  snapshotId: string
  enableCountProbe?: boolean
}>) {
  const source = createOpenRouterCatalogSource({
    fetchImpl: input.fetchImpl,
    enableCountProbe: input.enableCountProbe === true,
  })
  const snapshot = await source.fetchSnapshot({
    providerKey: 'openrouter',
    apiKey: 'sk-integration',
    baseUrl: OPENROUTER_BASE_URL,
    fetchImpl: input.fetchImpl,
    preferUserScopedModels: true,
  })
  const writerInput = mapProviderCatalogSnapshotToScopedWriterInput({
    snapshot,
    snapshotId: input.snapshotId,
    snapshotChecksum: input.snapshotId,
    syncedAtMs: snapshot.fetchedAtMs,
    schemaVersion: 1,
  })
  const writeResult = input.repo.writeScopedSnapshot({
    ...writerInput,
    catalogScopeKey: OPENROUTER_SCOPE_KEY,
    pruneOldSnapshots: true,
  })
  return { snapshot, writeResult }
}

describe('integration: provider catalog source -> scoped sqlite query', () => {
  it('persists OpenRouter fixtures into scoped snapshots and queries the active snapshot', async () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    const modelsUserFixture = loadFixtureJson('openrouter-models-user.fixture.json')
    const providersFixture = loadFixtureJson('openrouter-providers.fixture.json')
    const modelsCountFixture = loadFixtureJson('openrouter-models-count.fixture.json')

    const fetchImpl = (async (url: string): Promise<Response> => {
      if (url.endsWith('/models/user')) return jsonResponse(modelsUserFixture)
      if (url.endsWith('/providers')) return jsonResponse(providersFixture)
      if (url.endsWith('/models/count')) return jsonResponse(modelsCountFixture)
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }) as typeof fetch

    const { snapshot, writeResult } = await writeOpenRouterScopedSnapshot({
      repo,
      fetchImpl,
      snapshotId: 'scoped_fixture_sync_1',
      enableCountProbe: true,
    })

    expect(snapshot).toMatchObject({
      providerKey: 'openrouter',
      dataSource: 'models_user_primary',
      countProbe: { count: 3 },
    })
    expect(writeResult).toMatchObject({
      providerKey: 'openrouter',
      catalogScopeKey: OPENROUTER_SCOPE_KEY,
      activeSnapshotId: 'scoped_fixture_sync_1',
      modelCount: 3,
      visibleModelCount: 3,
      hiddenModelCount: 0,
    })

    const meta = repo.getScopedMeta('openrouter', OPENROUTER_SCOPE_KEY)
    expect(meta).toMatchObject({
      providerKey: 'openrouter',
      catalogScopeKey: OPENROUTER_SCOPE_KEY,
      activeSnapshotId: 'scoped_fixture_sync_1',
      dataSource: 'models_user_primary',
      modelCount: 3,
      visibleModelCount: 3,
      hiddenModelCount: 0,
    })

    const visionStored = db
      .prepare(
        `
          SELECT
            created_at_sec AS createdAtSec,
            input_modalities_json AS inputModalitiesJson,
            output_modalities_json AS outputModalitiesJson,
            supported_parameters_json AS supportedParametersJson,
            capabilities_json AS capabilitiesJson,
            pricing_json AS pricingJson,
            raw_json AS rawJson
          FROM catalog_models
          WHERE provider_key = 'openrouter'
            AND catalog_scope_key = @catalogScopeKey
            AND snapshot_id = 'scoped_fixture_sync_1'
            AND model_id = 'openai/vision-pro'
          LIMIT 1
        `
      )
      .get({ catalogScopeKey: OPENROUTER_SCOPE_KEY }) as
      | {
          createdAtSec: number | null
          inputModalitiesJson: string
          outputModalitiesJson: string
          supportedParametersJson: string
          capabilitiesJson: string
          pricingJson: string | null
          rawJson: string | null
        }
      | undefined

    expect(visionStored?.createdAtSec).toBe(1701000001)
    expect(JSON.parse(String(visionStored?.inputModalitiesJson))).toEqual(['text', 'image'])
    expect(JSON.parse(String(visionStored?.outputModalitiesJson))).toEqual(['text'])
    expect(JSON.parse(String(visionStored?.supportedParametersJson))).toEqual([
      'temperature',
      'tools',
      'response_format',
    ])
    expect(JSON.parse(String(visionStored?.capabilitiesJson))).toMatchObject({
      tools: true,
      structuredOutputs: true,
      vision: true,
      longContext: true,
    })
    expect(JSON.parse(String(visionStored?.pricingJson))).toMatchObject({
      webSearch: '0.0009',
      internalReasoning: '0.0011',
      inputCacheRead: '0.000004',
      inputCacheWrite: '0.000008',
    })
    expect(visionStored?.rawJson).toContain('"id":"openai/vision-pro"')

    const visionSearch = repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: OPENROUTER_SCOPE_KEY,
      searchText: 'vision analysis',
      includeDescriptionInSearch: true,
      limit: 10,
    })
    expect(visionSearch.items.map((item) => item.modelId)).toEqual(['openai/vision-pro'])

    const reasoningOpenai = repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: OPENROUTER_SCOPE_KEY,
      vendors: ['openai'],
      capabilities: { reasoning: true },
      contextLength: { min: 128000 },
      limit: 10,
    })
    expect(reasoningOpenai.items.map((item) => item.modelId)).toEqual(['openai/reasoner-mini'])

    const structuredFilters = repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: OPENROUTER_SCOPE_KEY,
      capabilities: { tools: true, structuredOutputs: true, vision: true },
      inputModalities: ['image'],
      outputModalities: ['text'],
      supportedParameters: ['tools', 'response_format'],
      limit: 10,
    })
    expect(structuredFilters.items.map((item) => item.modelId)).toEqual(['openai/vision-pro'])

    const page1 = repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: OPENROUTER_SCOPE_KEY,
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 2,
    })
    const page2 = repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: OPENROUTER_SCOPE_KEY,
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 2,
      cursor: page1.nextCursor,
    })
    const page1Set = new Set(page1.items.map((item) => item.modelId))
    const overlap = page2.items.filter((item) => page1Set.has(item.modelId))
    expect(overlap).toHaveLength(0)

    const ftsCountRow = db.prepare('SELECT COUNT(1) AS count FROM models_fts').get() as { count: number }
    expect(ftsCountRow.count).toBe(0)
    db.close()
  })

  it('handles models/user=401 fallback by replacing only the active scoped snapshot', async () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const providersFixture = loadFixtureJson('openrouter-providers.fixture.json')
    const modelsUser401Fixture = loadFixtureJson('openrouter-models-user-401.fixture.json')
    const fallbackModelsFixture = loadFixtureJson('openrouter-models-fallback-small.fixture.json')
    const bulkModelsFixture = buildBulkModelsFixture(20)
    const calls: string[] = []

    const fetchRound1 = (async (url: string): Promise<Response> => {
      calls.push(`r1:${url}`)
      if (url.endsWith('/models/user')) return jsonResponse(bulkModelsFixture)
      if (url.endsWith('/providers')) return jsonResponse(providersFixture)
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }) as typeof fetch

    const fetchRound2 = (async (url: string): Promise<Response> => {
      calls.push(`r2:${url}`)
      if (url.endsWith('/models/user')) return jsonResponse(modelsUser401Fixture, 401)
      if (url.endsWith('/models')) return jsonResponse(fallbackModelsFixture)
      if (url.endsWith('/providers')) return jsonResponse({ error: { code: 503, message: 'provider_down' } }, 503)
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }) as typeof fetch

    await writeOpenRouterScopedSnapshot({
      repo,
      fetchImpl: fetchRound1,
      snapshotId: 'scoped_guard_round_1',
    })
    expect(repo.getScopedMeta('openrouter', OPENROUTER_SCOPE_KEY)).toMatchObject({
      activeSnapshotId: 'scoped_guard_round_1',
      modelCount: 20,
      dataSource: 'models_user_primary',
    })

    const { snapshot, writeResult } = await writeOpenRouterScopedSnapshot({
      repo,
      fetchImpl: fetchRound2,
      snapshotId: 'scoped_guard_round_2',
    })

    expect(calls).toContain('r2:https://openrouter.ai/api/v1/models/user')
    expect(calls).toContain('r2:https://openrouter.ai/api/v1/models')
    expect(snapshot).toMatchObject({
      dataSource: 'mixed',
      degradedStages: expect.arrayContaining([
        expect.objectContaining({ stage: 'fetch_providers' }),
      ]),
    })
    expect(writeResult).toMatchObject({
      activeSnapshotId: 'scoped_guard_round_2',
      modelCount: 5,
      visibleModelCount: 5,
      hiddenModelCount: 0,
    })

    const meta = repo.getScopedMeta('openrouter', OPENROUTER_SCOPE_KEY)
    expect(meta).toMatchObject({
      activeSnapshotId: 'scoped_guard_round_2',
      dataSource: 'mixed',
      modelCount: 5,
      hiddenModelCount: 0,
    })

    const activeRows = repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: OPENROUTER_SCOPE_KEY,
      limit: 100,
    })
    expect(activeRows.items.map((item) => item.modelId)).toEqual([
      'openai/bulk-00',
      'openai/bulk-01',
      'openai/bulk-02',
      'openai/bulk-03',
      'openai/bulk-04',
    ])

    const oldSnapshotRows = db
      .prepare(`
        SELECT COUNT(1) AS count
        FROM catalog_models
        WHERE provider_key = 'openrouter'
          AND catalog_scope_key = @catalogScopeKey
          AND snapshot_id = 'scoped_guard_round_1'
      `)
      .get({ catalogScopeKey: OPENROUTER_SCOPE_KEY }) as { count: number }
    expect(oldSnapshotRows.count).toBe(0)
    db.close()
  })
})
