import { describe, expect, it, vi } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ModelCatalogRepo } from '../../infra/db/repo/modelCatalogRepo'
import { syncOpenRouterModelCatalog } from '../../src/next/modelCatalog/catalogSyncJob'

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

describe('integration: model catalog sync fixture -> sqlite query', () => {
  it('runs one-shot sync and enables FTS/tag/vendor filters from persisted snapshot', async () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    const modelsUserFixture = loadFixtureJson('openrouter-models-user.fixture.json')
    const providersFixture = loadFixtureJson('openrouter-providers.fixture.json')
    const modelsCountFixture = loadFixtureJson('openrouter-models-count.fixture.json')

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    const fakeFetch = async (url: string): Promise<Response> => {
      if (url.endsWith('/models/user')) return jsonResponse(modelsUserFixture)
      if (url.endsWith('/providers')) return jsonResponse(providersFixture)
      if (url.endsWith('/models/count')) return jsonResponse(modelsCountFixture)
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }

    const result = await syncOpenRouterModelCatalog({
      apiKey: 'sk-integration',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl: fakeFetch as any,
      snapshotId: 'snap_fixture_sync_1',
      enableCountProbe: true,
      logger,
      writer: {
        syncSnapshot: (input) => repo.syncSnapshot(input),
        syncCoreSnapshot: (input) => repo.syncCoreSnapshot(input),
      },
    })

    expect(result).toMatchObject({
      ok: true,
      snapshotId: 'snap_fixture_sync_1',
      modelCount: 3,
    })

    const meta = repo.getCoreMeta('openrouter')
    expect(meta).toMatchObject({
      providerKey: 'openrouter',
      dataSource: 'models_user_primary',
      modelCount: 3,
      lastCountProbe: 3,
    })

    const visionStored = db
      .prepare(
        `
          SELECT
            created_at_sec AS createdAtSec,
            tokenizer,
            instruct_type AS instructType,
            architecture_modality AS architectureModality,
            input_modalities_json AS inputModalitiesJson,
            output_modalities_json AS outputModalitiesJson,
            supported_parameters_json AS supportedParametersJson,
            per_request_limits_json AS perRequestLimitsJson,
            default_parameters_json AS defaultParametersJson,
            expiration_date AS expirationDate,
            top_provider_is_moderated AS topProviderIsModerated,
            top_provider_context_length AS topProviderContextLength,
            price_web_search AS priceWebSearch,
            price_internal_reasoning AS priceInternalReasoning,
            price_input_cache_read AS priceInputCacheRead,
            price_input_cache_write AS priceInputCacheWrite
          FROM models
          WHERE provider_key = 'openrouter'
            AND model_id = 'openai/vision-pro'
          LIMIT 1
        `
      )
      .get() as
      | {
          createdAtSec: number | null
          tokenizer: string | null
          instructType: string | null
          architectureModality: string | null
          inputModalitiesJson: string
          outputModalitiesJson: string
          supportedParametersJson: string
          perRequestLimitsJson: string | null
          defaultParametersJson: string | null
          expirationDate: string | null
          topProviderIsModerated: 0 | 1 | null
          topProviderContextLength: number | null
          priceWebSearch: string | null
          priceInternalReasoning: string | null
          priceInputCacheRead: string | null
          priceInputCacheWrite: string | null
        }
      | undefined

    expect(visionStored).toMatchObject({
      createdAtSec: 1701000001,
      tokenizer: 'cl100k_base',
      instructType: 'chatml',
      architectureModality: 'text->text',
      perRequestLimitsJson: '{"max_input_tokens":180000}',
      defaultParametersJson: '{"temperature":0.2}',
      expirationDate: '2099-01-01T00:00:00.000Z',
      topProviderIsModerated: 1,
      topProviderContextLength: 200000,
      priceWebSearch: '0.0009',
      priceInternalReasoning: '0.0011',
      priceInputCacheRead: '0.000004',
      priceInputCacheWrite: '0.000008',
    })
    expect(JSON.parse(String(visionStored?.inputModalitiesJson))).toEqual(['text', 'image'])
    expect(JSON.parse(String(visionStored?.outputModalitiesJson))).toEqual(['text'])
    expect(JSON.parse(String(visionStored?.supportedParametersJson))).toEqual([
      'temperature',
      'tools',
      'response_format',
    ])

    const textFastCreated = db
      .prepare(
        `
          SELECT created_at_sec AS createdAtSec
          FROM models
          WHERE provider_key = 'openrouter'
            AND model_id = 'anthropic/text-fast'
          LIMIT 1
        `
      )
      .get() as { createdAtSec: number | null } | undefined
    expect(textFastCreated?.createdAtSec).toBe(1701000003)

    const visionSearch = repo.queryCore({
      providerKey: 'openrouter',
      searchText: 'vision analysis',
      limit: 10,
    })
    expect(visionSearch.items.map((item) => item.modelId)).toEqual(['openai/vision-pro'])

    const reasoningOpenai = repo.queryCore({
      providerKey: 'openrouter',
      vendors: ['openai'],
      tags: ['capability:reasoning'],
      contextBuckets: ['xlarge'],
      priceBuckets: ['cheap'],
      limit: 10,
    })
    expect(reasoningOpenai.items.map((item) => item.modelId)).toEqual(['openai/reasoner-mini'])

    const structuredFilters = repo.queryCore({
      providerKey: 'openrouter',
      topProviderIsModerated: true,
      tokenizers: ['cl100k_base'],
      instructTypes: ['chatml'],
      inputModalities: ['image'],
      outputModalities: ['text'],
      supportedParameters: ['tools', 'response_format'],
      limit: 10,
    })
    expect(structuredFilters.items.map((item) => item.modelId)).toEqual(['openai/vision-pro'])

    const page1 = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 2,
    })
    const page2 = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 2,
      cursor: page1.nextCursor,
    })
    const page1Set = new Set(page1.items.map((item) => item.modelId))
    const overlap = page2.items.filter((item) => page1Set.has(item.modelId))
    expect(overlap).toHaveLength(0)

    const ftsCountRow = db.prepare('SELECT COUNT(1) AS count FROM models_fts').get() as { count: number }
    expect(ftsCountRow.count).toBe(3)
    const triggerRows = db
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'trigger'
          AND name IN ('trg_models_fts_ai', 'trg_models_fts_au', 'trg_models_fts_ad')
        ORDER BY name ASC
      `)
      .all() as Array<{ name: string }>
    expect(triggerRows.map((row) => row.name)).toEqual([
      'trg_models_fts_ad',
      'trg_models_fts_ai',
      'trg_models_fts_au',
    ])
    const missingFtsRows = db
      .prepare(`
        SELECT COUNT(1) AS count
        FROM models
        LEFT JOIN models_fts
          ON models_fts.rowid = models.rowid
        WHERE models.provider_key = 'openrouter'
          AND models_fts.rowid IS NULL
      `)
      .get() as { count: number }
    expect(missingFtsRows.count).toBe(0)

    expect(logger.info).toHaveBeenCalledWith(
      '[CatalogSyncJob] sync end',
      expect.objectContaining({
        status: 'ok',
        snapshotId: 'snap_fixture_sync_1',
        modelCount: 3,
        coreModelRows: 3,
        coreTagRows: 9,
        ftsBuildStatus: 'trigger_managed',
      })
    )
    expect(logger.error).not.toHaveBeenCalled()
    db.close()
  })

  it('handles models/user=401 fallback without clearing providers or mass-hiding models', async () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const providersFixture = loadFixtureJson('openrouter-providers.fixture.json')
    const modelsUser401Fixture = loadFixtureJson('openrouter-models-user-401.fixture.json')
    const fallbackModelsFixture = loadFixtureJson('openrouter-models-fallback-small.fixture.json')
    const bulkModelsFixture = buildBulkModelsFixture(20)
    const calls: string[] = []
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    const fetchRound1 = async (url: string): Promise<Response> => {
      calls.push(`r1:${url}`)
      if (url.endsWith('/models/user')) return jsonResponse(bulkModelsFixture)
      if (url.endsWith('/providers')) return jsonResponse(providersFixture)
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }

    const fetchRound2 = async (url: string): Promise<Response> => {
      calls.push(`r2:${url}`)
      if (url.endsWith('/models/user')) return jsonResponse(modelsUser401Fixture, 401)
      if (url.endsWith('/models')) return jsonResponse(fallbackModelsFixture)
      if (url.endsWith('/providers')) return jsonResponse({ error: { code: 503, message: 'provider_down' } }, 503)
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }

    await syncOpenRouterModelCatalog({
      apiKey: 'sk-integration',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl: fetchRound1 as any,
      snapshotId: 'snap_guard_round_1',
      logger,
      writer: {
        syncSnapshot: (input) => repo.syncSnapshot(input),
        syncCoreSnapshot: (input) => repo.syncCoreSnapshot(input),
      },
    })

    const providersBefore = db
      .prepare(`SELECT provider_key AS providerKey FROM providers ORDER BY provider_key ASC`)
      .all() as Array<{ providerKey: string }>
    expect(providersBefore.map((row) => row.providerKey)).toEqual(['anthropic', 'openai', 'openrouter'])

    await syncOpenRouterModelCatalog({
      apiKey: 'sk-integration',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl: fetchRound2 as any,
      snapshotId: 'snap_guard_round_2',
      logger,
      writer: {
        syncSnapshot: (input) => repo.syncSnapshot(input),
        syncCoreSnapshot: (input) => repo.syncCoreSnapshot(input),
      },
    })

    expect(calls).toContain('r2:https://openrouter.ai/api/v1/models/user')
    expect(calls).toContain('r2:https://openrouter.ai/api/v1/models')

    const providersAfter = db
      .prepare(`SELECT provider_key AS providerKey FROM providers ORDER BY provider_key ASC`)
      .all() as Array<{ providerKey: string }>
    expect(providersAfter.map((row) => row.providerKey)).toEqual(['anthropic', 'openai', 'openrouter'])

    const hiddenCountRow = db
      .prepare(`
        SELECT COUNT(1) AS count
        FROM models
        WHERE provider_key = 'openrouter'
          AND visibility = 'hidden'
      `)
      .get() as { count: number }
    expect(hiddenCountRow.count).toBe(0)

    const meta = repo.getCoreMeta('openrouter')
    expect(meta).toMatchObject({
      snapshotId: 'snap_guard_round_2',
      dataSource: 'mixed',
      providerCount: null,
    })
    expect(logger.warn).toHaveBeenCalledWith(
      '[CatalogSyncJob] stage degraded',
      expect.objectContaining({
        stage: 'fetch_providers',
      })
    )
    db.close()
  })
})
