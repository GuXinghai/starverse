import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function listObjects(db: BetterSqlite3.Database, type: 'table' | 'index' | 'trigger') {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = @type ORDER BY name ASC`)
    .all({ type }) as Array<{ name: string }>
}

function assertCatalogCoreObjects(db: BetterSqlite3.Database) {
  const tables = new Set(listObjects(db, 'table').map((row) => row.name))
  const indexes = new Set(listObjects(db, 'index').map((row) => row.name))
  const triggers = new Set(listObjects(db, 'trigger').map((row) => row.name))

  expect(tables.has('providers')).toBe(true)
  expect(tables.has('models')).toBe(true)
  expect(tables.has('model_tags')).toBe(true)
  expect(tables.has('catalog_meta')).toBe(true)
  expect(tables.has('endpoint_meta')).toBe(true)
  expect(tables.has('catalog_scope_meta')).toBe(true)
  expect(tables.has('catalog_models')).toBe(true)
  expect(tables.has('models_fts')).toBe(true)
  const ftsSql = String(
    (db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'models_fts'")
      .get() as { sql?: string } | undefined)?.sql ?? ''
  ).toLowerCase()
  expect(ftsSql).toMatch(/prefix\s*=\s*'?1 2 3 4'?/)
  expect(ftsSql).not.toContain('model_id unindexed')

  expect(indexes.has('idx_models_context_length')).toBe(true)
  expect(indexes.has('idx_models_price_prompt')).toBe(true)
  expect(indexes.has('idx_models_capability_flags')).toBe(true)
  expect(indexes.has('idx_models_query_name')).toBe(true)
  expect(indexes.has('idx_models_query_created')).toBe(true)
  expect(indexes.has('idx_models_vendor_filter')).toBe(true)
  expect(indexes.has('idx_models_expiration_filter')).toBe(true)
  expect(indexes.has('idx_models_max_output_tokens')).toBe(true)
  expect(indexes.has('idx_models_top_provider_ctx')).toBe(true)
  expect(indexes.has('idx_models_tokenizer_filter')).toBe(true)
  expect(indexes.has('idx_models_instruct_type_filter')).toBe(true)
  expect(indexes.has('idx_models_arch_modality')).toBe(true)
  expect(indexes.has('idx_models_price_web_search')).toBe(true)
  expect(indexes.has('idx_models_price_internal_reasoning')).toBe(true)
  expect(indexes.has('idx_models_price_input_cache_read')).toBe(true)
  expect(indexes.has('idx_models_price_input_cache_write')).toBe(true)
  expect(indexes.has('idx_model_tags_type_key')).toBe(true)
  expect(indexes.has('idx_endpoint_meta_model')).toBe(true)
  expect(indexes.has('idx_catalog_scope_meta_state')).toBe(true)
  expect(indexes.has('idx_catalog_scope_meta_used')).toBe(true)
  expect(indexes.has('idx_catalog_models_active_lookup')).toBe(true)
  expect(indexes.has('idx_catalog_models_model_lookup')).toBe(true)

  expect(triggers.has('trg_models_fts_ai')).toBe(true)
  expect(triggers.has('trg_models_fts_au')).toBe(true)
  expect(triggers.has('trg_models_fts_ad')).toBe(true)
}

function insertProvider(db: BetterSqlite3.Database) {
  db.prepare(
    `
      INSERT INTO providers (
        provider_key,
        display_name,
        updated_at_ms
      ) VALUES (
        @providerKey,
        @displayName,
        @updatedAtMs
      )
    `
  ).run({
    providerKey: 'openrouter',
    displayName: 'OpenRouter',
    updatedAtMs: Date.now(),
  })
}

function buildInsertModelStatement(db: BetterSqlite3.Database) {
  return db.prepare(
    `
      INSERT INTO models (
        provider_key,
        model_id,
        model_key,
        canonical_slug,
        display_name,
        description,
        vendor,
        family,
        status,
        visibility,
        context_length,
        max_output_tokens,
        architecture_modality,
        input_modalities_json,
        output_modalities_json,
        tokenizer,
        instruct_type,
        supported_parameters_json,
        capabilities_json,
        cap_reasoning,
        cap_tools,
        cap_structured_outputs,
        cap_vision,
        cap_long_context,
        pricing_json,
        price_prompt,
        price_completion,
        price_request,
        price_image,
        price_web_search,
        price_internal_reasoning,
        price_input_cache_read,
        price_input_cache_write,
        created_at_sec,
        top_provider_context_length,
        first_seen_at_ms,
        last_seen_at_ms,
        synced_at_ms
      ) VALUES (
        @providerKey,
        @modelId,
        @modelKey,
        @canonicalSlug,
        @displayName,
        @description,
        @vendor,
        @family,
        @status,
        @visibility,
        @contextLength,
        @maxOutputTokens,
        @architectureModality,
        @inputModalitiesJson,
        @outputModalitiesJson,
        @tokenizer,
        @instructType,
        @supportedParametersJson,
        @capabilitiesJson,
        @capReasoning,
        @capTools,
        @capStructuredOutputs,
        @capVision,
        @capLongContext,
        @pricingJson,
        @pricePrompt,
        @priceCompletion,
        @priceRequest,
        @priceImage,
        @priceWebSearch,
        @priceInternalReasoning,
        @priceInputCacheRead,
        @priceInputCacheWrite,
        @createdAtSec,
        @topProviderContextLength,
        @firstSeenAtMs,
        @lastSeenAtMs,
        @syncedAtMs
      )
    `
  )
}

function seedLargeCatalog(db: BetterSqlite3.Database, count: number) {
  const insertModel = buildInsertModelStatement(db)
  const nowMs = Date.now()
  const tx = db.transaction(() => {
    for (let i = 0; i < count; i += 1) {
      const modelId = `openai/gpt-${String(i).padStart(4, '0')}`
      insertModel.run({
        providerKey: 'openrouter',
        modelId,
        modelKey: `openrouter::${modelId}`,
        canonicalSlug: modelId,
        displayName: `GPT ${i}`,
        description: `General purpose GPT model ${i} for search and reasoning`,
        vendor: 'openai',
        family: 'gpt',
        status: 'active',
        visibility: 'visible',
        contextLength: 4096 + (i % 64) * 1024,
        maxOutputTokens: 1024 + (i % 16) * 256,
        architectureModality: 'text->text',
        inputModalitiesJson: '["text"]',
        outputModalitiesJson: '["text"]',
        tokenizer: i % 2 === 0 ? 'cl100k_base' : 'gpt-tokenizer',
        instructType: i % 3 === 0 ? 'chatml' : 'messages',
        supportedParametersJson: '["temperature","top_p"]',
        capabilitiesJson: '{"reasoning":true}',
        capReasoning: i % 2,
        capTools: i % 3 === 0 ? 1 : 0,
        capStructuredOutputs: i % 5 === 0 ? 1 : 0,
        capVision: i % 7 === 0 ? 1 : 0,
        capLongContext: i % 11 === 0 ? 1 : 0,
        pricingJson: '{"prompt":"0.00001","completion":"0.00002"}',
        pricePrompt: '0.00001',
        priceCompletion: '0.00002',
        priceRequest: '0',
        priceImage: '0',
        priceWebSearch: '0',
        priceInternalReasoning: '0',
        priceInputCacheRead: '0',
        priceInputCacheWrite: '0',
        createdAtSec: 1700000000 + i,
        topProviderContextLength: 4096 + (i % 64) * 1024,
        firstSeenAtMs: nowMs,
        lastSeenAtMs: nowMs,
        syncedAtMs: nowMs,
      })
    }
  })
  tx()
}

function listFilteredModels(db: BetterSqlite3.Database) {
  return db
    .prepare(
      `
        SELECT model_id
        FROM models
        WHERE provider_key = @providerKey
          AND visibility = 'visible'
          AND status = 'active'
          AND cap_reasoning = 1
          AND context_length >= 32768
        ORDER BY context_length DESC, model_id ASC
        LIMIT 50
      `
    )
    .all({ providerKey: 'openrouter' }) as Array<{ model_id: string }>
}

function explainFilterQueryPlan(db: BetterSqlite3.Database) {
  const rows = db
    .prepare(
      `
        EXPLAIN QUERY PLAN
        SELECT model_id
        FROM models
        WHERE provider_key = @providerKey
          AND visibility = 'visible'
          AND status = 'active'
          AND cap_reasoning = 1
          AND context_length >= 32768
        ORDER BY context_length DESC, model_id ASC
        LIMIT 50
      `
    )
    .all({ providerKey: 'openrouter' }) as Array<{ detail?: string }>

  return rows.map((row) => String(row.detail ?? '')).join('\n')
}

function explainTokenizerFilterQueryPlan(db: BetterSqlite3.Database) {
  const rows = db
    .prepare(
      `
        EXPLAIN QUERY PLAN
        SELECT model_id
        FROM models
        WHERE provider_key = @providerKey
          AND visibility = 'visible'
          AND status = 'active'
          AND tokenizer = @tokenizer
        LIMIT 25
      `
    )
    .all({
      providerKey: 'openrouter',
      tokenizer: 'cl100k_base',
    }) as Array<{ detail?: string }>

  return rows.map((row) => String(row.detail ?? '')).join('\n')
}

function searchCatalogPage(db: BetterSqlite3.Database, offset: number) {
  return db
    .prepare(
      `
          SELECT
            models_fts.provider_key AS providerKey,
            models_fts.model_id AS modelId
          FROM models_fts
          JOIN models
            ON models.provider_key = models_fts.provider_key
           AND models.model_id = models_fts.model_id
          WHERE models_fts MATCH @term
            AND models.visibility = 'visible'
            AND models.status = 'active'
          ORDER BY bm25(models_fts), models_fts.provider_key ASC, models_fts.model_id ASC
          LIMIT 25 OFFSET @offset
        `
    )
    .all({ term: 'gpt', offset }) as Array<{ providerKey: string; modelId: string }>
}

describe('catalog core schema', () => {
  it('creates required catalog tables, indexes, and FTS triggers', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    assertCatalogCoreObjects(db)
  })

  it('supports thousand-scale filtering and stable FTS pagination', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertProvider(db)
    seedLargeCatalog(db, 3000)

    const filterRows = listFilteredModels(db)
    expect(filterRows.length).toBe(50)

    const planDetail = explainFilterQueryPlan(db)
    expect(planDetail).toMatch(/idx_models_/)

    const tokenizerPlanDetail = explainTokenizerFilterQueryPlan(db)
    expect(tokenizerPlanDetail).toContain('idx_models_tokenizer_filter')

    const page1 = searchCatalogPage(db, 0)
    const page2 = searchCatalogPage(db, 25)
    const page1Again = searchCatalogPage(db, 0)

    expect(page1.length).toBe(25)
    expect(page2.length).toBe(25)
    expect(page1Again).toEqual(page1)

    const page1Ids = new Set(page1.map((row) => `${row.providerKey}::${row.modelId}`))
    const overlap = page2.filter((row) => page1Ids.has(`${row.providerKey}::${row.modelId}`))
    expect(overlap.length).toBe(0)
  })
})
