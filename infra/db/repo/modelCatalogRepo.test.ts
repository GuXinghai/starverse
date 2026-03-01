import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ModelCatalogRepo } from './modelCatalogRepo'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function listCatalog(db: BetterSqlite3.Database) {
  return db
    .prepare(
      `
      SELECT
        model_id AS modelId,
        name,
        last_seen_snapshot_id AS lastSeenSnapshotId,
        is_hidden AS isHidden
      FROM model_catalog
      WHERE router_source = 'openrouter'
      ORDER BY model_id
    `
    )
    .all() as Array<{ modelId: string; name: string; lastSeenSnapshotId: string | null; isHidden: number }>
}

function listCoreModels(db: BetterSqlite3.Database) {
  return db
    .prepare(
      `
      SELECT
        provider_key AS providerKey,
        model_id AS modelId,
        visibility,
        raw_json AS rawJson
      FROM models
      WHERE provider_key = 'openrouter'
      ORDER BY model_id ASC
    `
    )
    .all() as Array<{ providerKey: string; modelId: string; visibility: 'visible' | 'hidden'; rawJson: string | null }>
}

function getCoreModelStorage(db: BetterSqlite3.Database, modelId: string) {
  return db
    .prepare(
      `
      SELECT
        model_id AS modelId,
        created_at_sec AS createdAtSec,
        expiration_date AS expirationDate,
        expiration_at_sec AS expirationAtSec,
        unknown_expiration AS unknownExpiration,
        per_request_limits_json AS perRequestLimitsJson,
        default_parameters_json AS defaultParametersJson,
        has_per_request_limits AS hasPerRequestLimits,
        has_default_parameters AS hasDefaultParameters,
        has_tools AS hasTools,
        has_structured_outputs AS hasStructuredOutputs,
        has_reasoning AS hasReasoning,
        has_seed AS hasSeed,
        in_modality_image AS inModalityImage,
        top_provider_is_moderated AS topProviderIsModerated
      FROM models
      WHERE provider_key = 'openrouter'
        AND model_id = @modelId
      LIMIT 1
    `
    )
    .get({ modelId }) as
    | {
        modelId: string
        createdAtSec: number | null
        expirationDate: string | null
        expirationAtSec: number | null
        unknownExpiration: 0 | 1
        perRequestLimitsJson: string | null
        defaultParametersJson: string | null
        hasPerRequestLimits: 0 | 1
        hasDefaultParameters: 0 | 1
        hasTools: 0 | 1
        hasStructuredOutputs: 0 | 1
        hasReasoning: 0 | 1
        hasSeed: 0 | 1
        inModalityImage: 0 | 1
        topProviderIsModerated: 0 | 1 | null
      }
    | undefined
}

function listCoreProviders(db: BetterSqlite3.Database) {
  return db
    .prepare(
      `
      SELECT
        provider_key AS providerKey,
        display_name AS displayName,
        raw_json AS rawJson
      FROM providers
      ORDER BY provider_key ASC
    `
    )
    .all() as Array<{ providerKey: string; displayName: string; rawJson: string | null }>
}

function listCoreTags(db: BetterSqlite3.Database) {
  return db
    .prepare(
      `
      SELECT
        provider_key AS providerKey,
        model_id AS modelId,
        tag_key AS tagKey
      FROM model_tags
      WHERE provider_key = 'openrouter'
      ORDER BY model_id ASC, tag_key ASC
    `
    )
    .all() as Array<{ providerKey: string; modelId: string; tagKey: string }>
}

function getCoreMeta(db: BetterSqlite3.Database) {
  return db
    .prepare(
      `
      SELECT
        provider_key AS providerKey,
        model_count AS modelCount,
        visible_model_count AS visibleModelCount,
        hidden_model_count AS hiddenModelCount,
        data_source AS dataSource,
        snapshot_id AS snapshotId
      FROM catalog_meta
      WHERE provider_key = 'openrouter'
      LIMIT 1
    `
    )
    .get() as {
      providerKey: string
      modelCount: number
      visibleModelCount: number
      hiddenModelCount: number
      dataSource: string
      snapshotId: string
    } | undefined
}

describe('ModelCatalogRepo.syncSnapshot', () => {
  it('three syncs: visible -> hidden -> visible', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    repo.syncSnapshot({
      snapshotId: 's1',
      routerSource: 'openrouter',
      models: [
        { modelId: 'openai/a', routerSource: 'openrouter', vendor: 'openai', name: 'A', supportedParametersJson: '[]', rawJson: '{}' },
        { modelId: 'openai/b', routerSource: 'openrouter', vendor: 'openai', name: 'B', supportedParametersJson: '[]', rawJson: '{}' },
        { modelId: 'openai/c', routerSource: 'openrouter', vendor: 'openai', name: 'C', supportedParametersJson: '[]', rawJson: '{}' },
      ],
    })

    expect(listCatalog(db)).toEqual([
      { modelId: 'openai/a', name: 'A', lastSeenSnapshotId: 's1', isHidden: 0 },
      { modelId: 'openai/b', name: 'B', lastSeenSnapshotId: 's1', isHidden: 0 },
      { modelId: 'openai/c', name: 'C', lastSeenSnapshotId: 's1', isHidden: 0 },
    ])

    // Second snapshot: b missing => hidden
    repo.syncSnapshot({
      snapshotId: 's2',
      routerSource: 'openrouter',
      models: [
        { modelId: 'openai/a', routerSource: 'openrouter', vendor: 'openai', name: 'A2', supportedParametersJson: '[]', rawJson: '{}' },
        { modelId: 'openai/c', routerSource: 'openrouter', vendor: 'openai', name: 'C2', supportedParametersJson: '[]', rawJson: '{}' },
      ],
    })

    expect(listCatalog(db)).toEqual([
      { modelId: 'openai/a', name: 'A2', lastSeenSnapshotId: 's2', isHidden: 0 },
      { modelId: 'openai/b', name: 'B', lastSeenSnapshotId: 's1', isHidden: 1 },
      { modelId: 'openai/c', name: 'C2', lastSeenSnapshotId: 's2', isHidden: 0 },
    ])

    // Third snapshot: b returns => visible; a now missing => hidden
    repo.syncSnapshot({
      snapshotId: 's3',
      routerSource: 'openrouter',
      models: [
        { modelId: 'openai/b', routerSource: 'openrouter', vendor: 'openai', name: 'B3', supportedParametersJson: '[]', rawJson: '{}' },
        { modelId: 'openai/c', routerSource: 'openrouter', vendor: 'openai', name: 'C3', supportedParametersJson: '[]', rawJson: '{}' },
      ],
    })

    expect(listCatalog(db)).toEqual([
      { modelId: 'openai/a', name: 'A2', lastSeenSnapshotId: 's2', isHidden: 1 },
      { modelId: 'openai/b', name: 'B3', lastSeenSnapshotId: 's3', isHidden: 0 },
      { modelId: 'openai/c', name: 'C3', lastSeenSnapshotId: 's3', isHidden: 0 },
    ])
  })

  it('failure mid-sync rolls back (no half-sync, no accidental hiding)', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    // Seed with a successful snapshot.
    repo.syncSnapshot({
      snapshotId: 's1',
      routerSource: 'openrouter',
      models: [
        { modelId: 'openai/a', routerSource: 'openrouter', vendor: 'openai', name: 'A', supportedParametersJson: '[]', rawJson: '{}' },
        { modelId: 'openai/b', routerSource: 'openrouter', vendor: 'openai', name: 'B', supportedParametersJson: '[]', rawJson: '{}' },
      ],
    })

    const before = listCatalog(db)

    // Inject failure after the first upsert by passing an invalid row (name CHECK).
    expect(() =>
      repo.syncSnapshot({
        snapshotId: 's2',
        routerSource: 'openrouter',
        models: [
          { modelId: 'openai/a', routerSource: 'openrouter', vendor: 'openai', name: 'A2', supportedParametersJson: '[]', rawJson: '{}' },
          // Invalid: empty name violates CHECK(length(name) > 0)
          { modelId: 'openai/b', routerSource: 'openrouter', vendor: 'openai', name: '', supportedParametersJson: '[]', rawJson: '{}' },
        ],
      })
    ).toThrow()

    const after = listCatalog(db)
    expect(after).toEqual(before)
  })
})

describe('ModelCatalogRepo.syncCoreSnapshot', () => {
  it('writes providers/models/tags/meta and hides missing models on next snapshot', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()

    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'core_s1',
      providers: [
        { providerKey: 'openrouter', displayName: 'OpenRouter', slug: 'openrouter', updatedAtMs: nowMs, rawJson: '{"source":"local"}' },
        { providerKey: 'openai', displayName: 'OpenAI', slug: 'openai', updatedAtMs: nowMs, rawJson: '{"source":"openrouter"}' },
      ],
      models: [
        {
          providerKey: 'openrouter',
          modelId: 'openai/a',
          modelKey: 'openrouter::openai/a',
          canonicalSlug: 'openai/a',
          displayName: 'A',
          description: null,
          vendor: 'openai',
          family: 'a',
          status: 'active',
          visibility: 'visible',
          contextLength: 8192,
          maxOutputTokens: 4096,
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          supportedParametersJson: '["temperature"]',
          capabilitiesJson: '{"reasoning":false,"tools":false,"structuredOutputs":false,"vision":false,"longContext":false}',
          capReasoning: 0,
          capTools: 0,
          capStructuredOutputs: 0,
          capVision: 0,
          capLongContext: 0,
          pricingJson: '{"prompt":"0.1"}',
          pricePrompt: '0.1',
          priceCompletion: '0.2',
          priceRequest: '0',
          priceImage: '0',
          createdAtSec: 1700000000,
          expirationDate: 'invalid-date',
          expirationAtSec: null,
          unknownExpiration: 1,
          perRequestLimitsJson: '{"max_input_tokens":120000}',
          defaultParametersJson: '{"temperature":0.2}',
          hasPerRequestLimits: 1,
          hasDefaultParameters: 1,
          hasTools: 1,
          hasStructuredOutputs: 1,
          hasReasoning: 0,
          hasSeed: 1,
          inModalityImage: 1,
          topProviderIsModerated: 1,
          firstSeenAtMs: nowMs,
          lastSeenAtMs: nowMs,
          syncedAtMs: nowMs,
          rawJson: '{"id":"openai/a"}',
        },
        {
          providerKey: 'openrouter',
          modelId: 'openai/b',
          modelKey: 'openrouter::openai/b',
          canonicalSlug: 'openai/b',
          displayName: 'B',
          description: null,
          vendor: 'openai',
          family: 'b',
          status: 'active',
          visibility: 'visible',
          contextLength: 8192,
          maxOutputTokens: 4096,
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          supportedParametersJson: '["temperature"]',
          capabilitiesJson: '{"reasoning":false,"tools":false,"structuredOutputs":false,"vision":false,"longContext":false}',
          capReasoning: 0,
          capTools: 0,
          capStructuredOutputs: 0,
          capVision: 0,
          capLongContext: 0,
          pricingJson: '{"prompt":"0.1"}',
          pricePrompt: '0.1',
          priceCompletion: '0.2',
          priceRequest: '0',
          priceImage: '0',
          createdAtSec: 1700000001,
          expirationDate: null,
          firstSeenAtMs: nowMs,
          lastSeenAtMs: nowMs,
          syncedAtMs: nowMs,
          rawJson: '{"id":"openai/b"}',
        },
      ],
      tags: [
        {
          providerKey: 'openrouter',
          modelId: 'openai/a',
          tagKey: 'capability:tools',
          tagLabel: 'tools',
          tagType: 'capability',
          confidence: 1,
          source: 'derived',
          updatedAtMs: nowMs,
        },
        {
          providerKey: 'openrouter',
          modelId: 'openai/b',
          tagKey: 'capability:reasoning',
          tagLabel: 'reasoning',
          tagType: 'capability',
          confidence: 1,
          source: 'derived',
          updatedAtMs: nowMs,
        },
      ],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'models_user_primary',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'core_s1',
        modelCount: 2,
        visibleModelCount: 2,
        hiddenModelCount: 0,
        providerCount: 2,
        lastCountProbe: 100,
        lastCountProbeAtMs: nowMs,
        lastSyncAtMs: nowMs,
        ttlSeconds: 3600,
        syncState: 'ok',
        lastErrorCode: null,
        lastErrorMessage: null,
        rawRetentionPolicyJson: '{"persistEncoding":"json_string"}',
      },
    })

    expect(listCoreProviders(db)).toEqual([
      { providerKey: 'openai', displayName: 'OpenAI', rawJson: '{"source":"openrouter"}' },
      { providerKey: 'openrouter', displayName: 'OpenRouter', rawJson: '{"source":"local"}' },
    ])
    expect(listCoreModels(db)).toEqual([
      { providerKey: 'openrouter', modelId: 'openai/a', visibility: 'visible', rawJson: '{"id":"openai/a"}' },
      { providerKey: 'openrouter', modelId: 'openai/b', visibility: 'visible', rawJson: '{"id":"openai/b"}' },
    ])
    expect(getCoreModelStorage(db, 'openai/a')).toMatchObject({
      modelId: 'openai/a',
      createdAtSec: 1700000000,
      expirationDate: 'invalid-date',
      expirationAtSec: null,
      unknownExpiration: 1,
      perRequestLimitsJson: '{"max_input_tokens":120000}',
      defaultParametersJson: '{"temperature":0.2}',
      hasPerRequestLimits: 1,
      hasDefaultParameters: 1,
      hasTools: 1,
      hasStructuredOutputs: 1,
      hasReasoning: 0,
      hasSeed: 1,
      inModalityImage: 1,
      topProviderIsModerated: 1,
    })
    expect(getCoreModelStorage(db, 'openai/b')).toMatchObject({
      modelId: 'openai/b',
      createdAtSec: 1700000001,
      expirationDate: null,
      expirationAtSec: null,
      unknownExpiration: 0,
      perRequestLimitsJson: null,
      defaultParametersJson: null,
      hasPerRequestLimits: 0,
      hasDefaultParameters: 0,
      hasTools: 0,
      hasStructuredOutputs: 0,
      hasReasoning: 0,
      hasSeed: 0,
      inModalityImage: 0,
      topProviderIsModerated: null,
    })
    expect(listCoreTags(db)).toEqual([
      { providerKey: 'openrouter', modelId: 'openai/a', tagKey: 'capability:tools' },
      { providerKey: 'openrouter', modelId: 'openai/b', tagKey: 'capability:reasoning' },
    ])
    expect(getCoreMeta(db)).toMatchObject({
      providerKey: 'openrouter',
      modelCount: 2,
      visibleModelCount: 2,
      hiddenModelCount: 0,
      dataSource: 'models_user_primary',
      snapshotId: 'core_s1',
    })

    const providersAfterFirstSync = listCoreProviders(db)

    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'core_s2',
      providers: [],
      models: [
        {
          providerKey: 'openrouter',
          modelId: 'openai/b',
          modelKey: 'openrouter::openai/b',
          canonicalSlug: 'openai/b',
          displayName: 'B2',
          description: null,
          vendor: 'openai',
          family: 'b',
          status: 'active',
          visibility: 'visible',
          contextLength: 8192,
          maxOutputTokens: 4096,
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          supportedParametersJson: '["temperature","top_p"]',
          capabilitiesJson: '{"reasoning":true,"tools":false,"structuredOutputs":false,"vision":false,"longContext":false}',
          capReasoning: 1,
          capTools: 0,
          capStructuredOutputs: 0,
          capVision: 0,
          capLongContext: 0,
          pricingJson: '{"prompt":"0.2"}',
          pricePrompt: '0.2',
          priceCompletion: '0.3',
          priceRequest: '0',
          priceImage: '0',
          createdAtSec: 1700000001,
          expirationDate: null,
          firstSeenAtMs: nowMs + 1,
          lastSeenAtMs: nowMs + 1,
          syncedAtMs: nowMs + 1,
          rawJson: '{"id":"openai/b","version":"2"}',
        },
      ],
      tags: [
        {
          providerKey: 'openrouter',
          modelId: 'openai/b',
          tagKey: 'capability:reasoning',
          tagLabel: 'reasoning',
          tagType: 'capability',
          confidence: 1,
          source: 'derived',
          updatedAtMs: nowMs + 1,
        },
      ],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'mixed',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'core_s2',
        modelCount: 1,
        visibleModelCount: 1,
        hiddenModelCount: 0,
        providerCount: null,
        lastCountProbe: 101,
        lastCountProbeAtMs: nowMs + 1,
        lastSyncAtMs: nowMs + 1,
        ttlSeconds: 3600,
        syncState: 'ok',
        lastErrorCode: null,
        lastErrorMessage: null,
        rawRetentionPolicyJson: '{"persistEncoding":"json_string"}',
      },
    })

    expect(listCoreProviders(db)).toEqual(providersAfterFirstSync)
    expect(listCoreModels(db)).toEqual([
      { providerKey: 'openrouter', modelId: 'openai/a', visibility: 'hidden', rawJson: '{"id":"openai/a"}' },
      { providerKey: 'openrouter', modelId: 'openai/b', visibility: 'visible', rawJson: '{"id":"openai/b","version":"2"}' },
    ])
    expect(listCoreTags(db)).toEqual([
      { providerKey: 'openrouter', modelId: 'openai/b', tagKey: 'capability:reasoning' },
    ])
    expect(getCoreMeta(db)).toMatchObject({
      providerKey: 'openrouter',
      modelCount: 2,
      visibleModelCount: 1,
      hiddenModelCount: 1,
      dataSource: 'mixed',
      snapshotId: 'core_s2',
    })
  })

  it('keeps existing providers dictionary when incoming providers list is empty', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()

    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'providers_s1',
      providers: [
        { providerKey: 'openrouter', displayName: 'OpenRouter', updatedAtMs: nowMs },
        { providerKey: 'openai', displayName: 'OpenAI', updatedAtMs: nowMs },
      ],
      models: [],
      tags: [],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'models_user_primary',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'providers_s1',
        modelCount: 0,
        visibleModelCount: 0,
        hiddenModelCount: 0,
        providerCount: 2,
        lastCountProbe: null,
        lastCountProbeAtMs: null,
        lastSyncAtMs: nowMs,
        ttlSeconds: 3600,
        syncState: 'ok',
        lastErrorCode: null,
        lastErrorMessage: null,
        rawRetentionPolicyJson: '{}',
      },
    })

    const before = listCoreProviders(db)

    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'providers_s2',
      providers: [],
      models: [],
      tags: [],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'mixed',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'providers_s2',
        modelCount: 0,
        visibleModelCount: 0,
        hiddenModelCount: 0,
        providerCount: null,
        lastCountProbe: null,
        lastCountProbeAtMs: null,
        lastSyncAtMs: nowMs + 1,
        ttlSeconds: 3600,
        syncState: 'ok',
        lastErrorCode: null,
        lastErrorMessage: null,
        rawRetentionPolicyJson: '{}',
      },
    })

    expect(listCoreProviders(db)).toEqual(before)
  })

  it('skips hide when incoming snapshot is suspiciously small vs previous baseline', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()

    const modelsS1 = Array.from({ length: 20 }, (_, index) => ({
      providerKey: 'openrouter' as const,
      modelId: `openai/m${index}`,
      modelKey: `openrouter::openai/m${index}`,
      canonicalSlug: `openai/m${index}`,
      displayName: `M${index}`,
      description: null,
      vendor: 'openai',
      family: 'm',
      status: 'active' as const,
      visibility: 'visible' as const,
      contextLength: 8192,
      maxOutputTokens: 4096,
      inputModalitiesJson: '["text"]',
      outputModalitiesJson: '["text"]',
      supportedParametersJson: '[]',
      capabilitiesJson: '{"reasoning":false,"tools":false,"structuredOutputs":false,"vision":false,"longContext":false}',
      capReasoning: 0 as const,
      capTools: 0 as const,
      capStructuredOutputs: 0 as const,
      capVision: 0 as const,
      capLongContext: 0 as const,
      pricingJson: null,
      pricePrompt: null,
      priceCompletion: null,
      priceRequest: null,
      priceImage: null,
      createdAtSec: 1700001000 + index,
      expirationDate: null,
      firstSeenAtMs: nowMs,
      lastSeenAtMs: nowMs,
      syncedAtMs: nowMs,
      rawJson: `{"id":"openai/m${index}"}`,
    }))

    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'guard_s1',
      providers: [{ providerKey: 'openrouter', displayName: 'OpenRouter', updatedAtMs: nowMs }],
      models: modelsS1,
      tags: [],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'models_user_primary',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'guard_s1',
        modelCount: 20,
        visibleModelCount: 20,
        hiddenModelCount: 0,
        providerCount: 1,
        lastCountProbe: null,
        lastCountProbeAtMs: null,
        lastSyncAtMs: nowMs,
        ttlSeconds: 3600,
        syncState: 'ok',
        lastErrorCode: null,
        lastErrorMessage: null,
        rawRetentionPolicyJson: '{}',
      },
    })

    const modelsS2 = modelsS1.slice(0, 5).map((model) => ({
      ...model,
      syncedAtMs: nowMs + 1,
      lastSeenAtMs: nowMs + 1,
    }))

    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'guard_s2',
      providers: [],
      models: modelsS2,
      tags: [],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'mixed',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'guard_s2',
        modelCount: 5,
        visibleModelCount: 5,
        hiddenModelCount: 0,
        providerCount: null,
        lastCountProbe: null,
        lastCountProbeAtMs: null,
        lastSyncAtMs: nowMs + 1,
        ttlSeconds: 3600,
        syncState: 'ok',
        lastErrorCode: null,
        lastErrorMessage: null,
        rawRetentionPolicyJson: '{}',
      },
    })

    const hiddenCountRow = db
      .prepare(
        `
          SELECT COUNT(1) AS count
          FROM models
          WHERE provider_key = 'openrouter'
            AND visibility = 'hidden'
        `
      )
      .get() as { count: number }

    const visibleCountRow = db
      .prepare(
        `
          SELECT COUNT(1) AS count
          FROM models
          WHERE provider_key = 'openrouter'
            AND visibility = 'visible'
        `
      )
      .get() as { count: number }

    expect(hiddenCountRow.count).toBe(0)
    expect(visibleCountRow.count).toBe(20)
  })

  it('getCoreMeta returns current catalog_meta snapshot', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()

    expect(repo.getCoreMeta('openrouter')).toBeNull()

    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'meta_s1',
      providers: [{ providerKey: 'openrouter', displayName: 'OpenRouter', updatedAtMs: nowMs }],
      models: [],
      tags: [],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'models_user_primary',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'meta_s1',
        modelCount: 0,
        visibleModelCount: 0,
        hiddenModelCount: 0,
        providerCount: 1,
        lastCountProbe: null,
        lastCountProbeAtMs: null,
        lastSyncAtMs: nowMs,
        ttlSeconds: 3600,
        syncState: 'ok',
        lastErrorCode: null,
        lastErrorMessage: null,
        rawRetentionPolicyJson: '{}',
      },
    })

    expect(repo.getCoreMeta('openrouter')).toMatchObject({
      providerKey: 'openrouter',
      schemaVersion: 1,
      dataSource: 'models_user_primary',
      snapshotId: 'meta_s1',
      modelCount: 0,
      lastSyncAtMs: nowMs,
      ttlSeconds: 3600,
    })
  })
})

describe('ModelCatalogRepo.getCoreModelDetail', () => {
  it('returns persisted model-level fields from local catalog cache', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()

    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'detail_s1',
      providers: [{ providerKey: 'openrouter', displayName: 'OpenRouter', updatedAtMs: nowMs }],
      models: [
        {
          providerKey: 'openrouter',
          modelId: 'openai/alpha',
          modelKey: 'openrouter::openai/alpha',
          canonicalSlug: 'openai/alpha',
          displayName: 'Alpha',
          description: 'alpha detail',
          vendor: 'openai',
          family: 'alpha',
          status: 'active',
          visibility: 'visible',
          contextLength: 128000,
          maxOutputTokens: 4096,
          architectureModality: 'text->text',
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          tokenizer: 'cl100k_base',
          instructType: 'chatml',
          supportedParametersJson: '["temperature","tools"]',
          capabilitiesJson: '{"reasoning":true}',
          capReasoning: 1,
          capTools: 1,
          capStructuredOutputs: 0,
          capVision: 0,
          capLongContext: 1,
          pricingJson: '{"prompt":"0.00001"}',
          pricePrompt: '0.00001',
          priceCompletion: '0.00003',
          priceRequest: '0',
          priceImage: '0',
          priceWebSearch: '0',
          priceInternalReasoning: '0',
          priceInputCacheRead: '0',
          priceInputCacheWrite: '0',
          createdAtSec: 1700000000,
          expirationDate: null,
          expirationAtSec: null,
          unknownExpiration: 0,
          perRequestLimitsJson: '{"max_input_tokens":120000}',
          defaultParametersJson: '{"temperature":0.2}',
          hasPerRequestLimits: 1,
          hasDefaultParameters: 1,
          hasTools: 1,
          hasStructuredOutputs: 0,
          hasReasoning: 1,
          hasSeed: 0,
          inModalityImage: 0,
          topProviderContextLength: 128000,
          topProviderIsModerated: 1,
          firstSeenAtMs: nowMs,
          lastSeenAtMs: nowMs,
          syncedAtMs: nowMs,
          rawJson: '{"id":"openai/alpha"}',
        },
      ],
      tags: [],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'models_user_primary',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'detail_s1',
        modelCount: 1,
        visibleModelCount: 1,
        hiddenModelCount: 0,
        lastSyncAtMs: nowMs,
        ttlSeconds: 3600,
        syncState: 'ok',
        rawRetentionPolicyJson: '{}',
      },
    })

    const detail = repo.getCoreModelDetail('openrouter', 'openai/alpha')
    expect(detail).toMatchObject({
      providerKey: 'openrouter',
      modelId: 'openai/alpha',
      modelKey: 'openrouter::openai/alpha',
      canonicalSlug: 'openai/alpha',
      displayName: 'Alpha',
      architectureModality: 'text->text',
      supportedParametersJson: '["temperature","tools"]',
      perRequestLimitsJson: '{"max_input_tokens":120000}',
      defaultParametersJson: '{"temperature":0.2}',
      rawJson: '{"id":"openai/alpha"}',
    })
  })
})

describe('ModelCatalogRepo.queryCore', () => {
  function seedQueryFixture(repo: ModelCatalogRepo, nowMs: number) {
    const nowSec = Math.floor(nowMs / 1000)
    const betaExpirationAtSec = nowSec + 3 * 86400
    const gammaExpirationAtSec = nowSec + 30 * 86400

    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'query_s1',
      providers: [{ providerKey: 'openrouter', displayName: 'OpenRouter', updatedAtMs: nowMs }],
      models: [
        {
          providerKey: 'openrouter',
          modelId: 'openai/alpha',
          modelKey: 'openrouter::openai/alpha',
          canonicalSlug: 'openai/alpha',
          displayName: 'Alpha Vision Cheap',
          description: 'vision model for image understanding',
          vendor: 'openai',
          family: 'alpha',
          status: 'active',
          visibility: 'visible',
          contextLength: 200000,
          maxOutputTokens: 4096,
          architectureModality: 'text->text',
          inputModalitiesJson: '["text","image"]',
          outputModalitiesJson: '["text"]',
          tokenizer: 'cl100k_base',
          instructType: 'chatml',
          supportedParametersJson: '["temperature","tools"]',
          capabilitiesJson: '{"reasoning":false,"tools":true,"structuredOutputs":false,"vision":true,"longContext":true}',
          capReasoning: 0,
          capTools: 1,
          capStructuredOutputs: 0,
          capVision: 1,
          capLongContext: 1,
          pricingJson: '{"prompt":"0.000001"}',
          pricePrompt: '0.000001',
          priceCompletion: '0.000002',
          priceRequest: '0',
          priceImage: '0',
          priceWebSearch: null,
          priceInternalReasoning: null,
          priceInputCacheRead: null,
          priceInputCacheWrite: null,
          createdAtSec: 1700000001,
          expirationDate: null,
          expirationAtSec: null,
          perRequestLimitsJson: '{"max_input_tokens":120000}',
          defaultParametersJson: '{"temperature":0.2}',
          hasPerRequestLimits: 1,
          hasDefaultParameters: 1,
          topProviderContextLength: 200000,
          topProviderIsModerated: 1,
          firstSeenAtMs: nowMs,
          lastSeenAtMs: nowMs,
          syncedAtMs: nowMs,
          rawJson: '{"id":"openai/alpha","architecture":{"tokenizer":"cl100k_base","instruct_type":"chatml"}}',
        },
        {
          providerKey: 'openrouter',
          modelId: 'openai/beta',
          modelKey: 'openrouter::openai/beta',
          canonicalSlug: 'openai/beta',
          displayName: 'Beta Reasoning Tools',
          description: 'reasoning and tools model',
          vendor: 'openai',
          family: 'beta',
          status: 'active',
          visibility: 'visible',
          contextLength: 64000,
          maxOutputTokens: 8192,
          architectureModality: 'text->image',
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text","image"]',
          tokenizer: 'gpt-tokenizer',
          instructType: 'messages',
          supportedParametersJson: '["reasoning","tools","seed"]',
          capabilitiesJson: '{"reasoning":true,"tools":true,"structuredOutputs":false,"vision":false,"longContext":false}',
          capReasoning: 1,
          capTools: 1,
          capStructuredOutputs: 0,
          capVision: 0,
          capLongContext: 0,
          pricingJson: '{"prompt":"0.00001"}',
          pricePrompt: '0.00001',
          priceCompletion: '0.00002',
          priceRequest: '0',
          priceImage: '0',
          priceWebSearch: null,
          priceInternalReasoning: null,
          priceInputCacheRead: null,
          priceInputCacheWrite: null,
          createdAtSec: 1700000002,
          expirationDate: new Date(betaExpirationAtSec * 1000).toISOString(),
          expirationAtSec: betaExpirationAtSec,
          topProviderContextLength: 64000,
          topProviderIsModerated: 0,
          firstSeenAtMs: nowMs,
          lastSeenAtMs: nowMs,
          syncedAtMs: nowMs,
          rawJson: '{"id":"openai/beta","architecture":{"tokenizer":"gpt-tokenizer","instruct_type":"messages"}}',
        },
        {
          providerKey: 'openrouter',
          modelId: 'anthropic/gamma',
          modelKey: 'openrouter::anthropic/gamma',
          canonicalSlug: 'anthropic/gamma',
          displayName: 'Gamma Balanced',
          description: 'general purpose text model',
          vendor: 'anthropic',
          family: 'gamma',
          status: 'active',
          visibility: 'visible',
          contextLength: 8192,
          maxOutputTokens: 2048,
          architectureModality: 'text->text',
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          tokenizer: 'anthropic-tokenizer',
          instructType: 'claude',
          supportedParametersJson: '["temperature"]',
          capabilitiesJson: '{"reasoning":false,"tools":false,"structuredOutputs":false,"vision":false,"longContext":false}',
          capReasoning: 0,
          capTools: 0,
          capStructuredOutputs: 0,
          capVision: 0,
          capLongContext: 0,
          pricingJson: '{"prompt":"0.00004"}',
          pricePrompt: '0.00004',
          priceCompletion: '0.00005',
          priceRequest: '0',
          priceImage: '0',
          priceWebSearch: null,
          priceInternalReasoning: null,
          priceInputCacheRead: null,
          priceInputCacheWrite: null,
          createdAtSec: 1700000003,
          expirationDate: new Date(gammaExpirationAtSec * 1000).toISOString(),
          expirationAtSec: gammaExpirationAtSec,
          topProviderContextLength: 8192,
          topProviderIsModerated: 1,
          firstSeenAtMs: nowMs,
          lastSeenAtMs: nowMs,
          syncedAtMs: nowMs,
          rawJson: '{"id":"anthropic/gamma","architecture":{"tokenizer":"anthropic-tokenizer","instruct_type":"claude"}}',
        },
        {
          providerKey: 'openrouter',
          modelId: 'openai/delta',
          modelKey: 'openrouter::openai/delta',
          canonicalSlug: 'openai/delta',
          displayName: 'Delta Unknown',
          description: 'fallback model',
          vendor: 'openai',
          family: 'delta',
          status: 'active',
          visibility: 'visible',
          contextLength: null,
          maxOutputTokens: null,
          architectureModality: null,
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          tokenizer: null,
          instructType: null,
          supportedParametersJson: '[]',
          capabilitiesJson: '{"reasoning":false,"tools":false,"structuredOutputs":false,"vision":false,"longContext":false}',
          capReasoning: 0,
          capTools: 0,
          capStructuredOutputs: 0,
          capVision: 0,
          capLongContext: 0,
          pricingJson: null,
          pricePrompt: null,
          priceCompletion: null,
          priceRequest: null,
          priceImage: null,
          priceWebSearch: null,
          priceInternalReasoning: null,
          priceInputCacheRead: null,
          priceInputCacheWrite: null,
          createdAtSec: 1700000004,
          expirationDate: null,
          expirationAtSec: null,
          topProviderContextLength: null,
          firstSeenAtMs: nowMs,
          lastSeenAtMs: nowMs,
          syncedAtMs: nowMs,
          rawJson: '{"id":"openai/delta","architecture":{"tokenizer":"","instruct_type":""}}',
        },
      ],
      tags: [
        {
          providerKey: 'openrouter',
          modelId: 'openai/alpha',
          tagKey: 'capability:vision',
          tagLabel: 'vision',
          tagType: 'capability',
          confidence: 1,
          source: 'derived',
          updatedAtMs: nowMs,
        },
        {
          providerKey: 'openrouter',
          modelId: 'openai/alpha',
          tagKey: 'capability:tools',
          tagLabel: 'tools',
          tagType: 'capability',
          confidence: 1,
          source: 'derived',
          updatedAtMs: nowMs,
        },
        {
          providerKey: 'openrouter',
          modelId: 'openai/alpha',
          tagKey: 'category:cheap_bucket:cheap',
          tagLabel: 'cheap_bucket:cheap',
          tagType: 'category',
          confidence: 1,
          source: 'derived',
          updatedAtMs: nowMs,
        },
        {
          providerKey: 'openrouter',
          modelId: 'openai/beta',
          tagKey: 'capability:reasoning',
          tagLabel: 'reasoning',
          tagType: 'capability',
          confidence: 1,
          source: 'derived',
          updatedAtMs: nowMs,
        },
        {
          providerKey: 'openrouter',
          modelId: 'openai/beta',
          tagKey: 'capability:tools',
          tagLabel: 'tools',
          tagType: 'capability',
          confidence: 1,
          source: 'derived',
          updatedAtMs: nowMs,
        },
        {
          providerKey: 'openrouter',
          modelId: 'openai/beta',
          tagKey: 'category:cheap_bucket:standard',
          tagLabel: 'cheap_bucket:standard',
          tagType: 'category',
          confidence: 1,
          source: 'derived',
          updatedAtMs: nowMs,
        },
        {
          providerKey: 'openrouter',
          modelId: 'anthropic/gamma',
          tagKey: 'category:cheap_bucket:expensive',
          tagLabel: 'cheap_bucket:expensive',
          tagType: 'category',
          confidence: 1,
          source: 'derived',
          updatedAtMs: nowMs,
        },
        {
          providerKey: 'openrouter',
          modelId: 'openai/delta',
          tagKey: 'category:cheap_bucket:unknown',
          tagLabel: 'cheap_bucket:unknown',
          tagType: 'category',
          confidence: 1,
          source: 'derived',
          updatedAtMs: nowMs,
        },
      ],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'models_user_primary',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'query_s1',
        modelCount: 4,
        visibleModelCount: 4,
        hiddenModelCount: 0,
        providerCount: 1,
        lastCountProbe: null,
        lastCountProbeAtMs: null,
        lastSyncAtMs: nowMs,
        ttlSeconds: 3600,
        syncState: 'ok',
        lastErrorCode: null,
        lastErrorMessage: null,
        rawRetentionPolicyJson: '{}',
      },
    })
  }

  it('supports FTS + combined filters (tags/context/price/provider)', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const result = repo.queryCore({
      providerKey: 'openrouter',
      searchText: 'vision model',
      vendors: ['openai'],
      tags: ['capability:vision'],
      contextBuckets: ['xlarge'],
      priceBuckets: ['cheap'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })

    expect(result.items.map((row) => row.modelId)).toEqual(['openai/alpha'])
    expect(result.nextCursor).toBeNull()
  })

  it('supports created_at sorting with stable order', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const result = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'created_at',
      sortOrder: 'desc',
      limit: 10,
    })

    expect(result.items.map((row) => row.modelId)).toEqual([
      'openai/delta',
      'anthropic/gamma',
      'openai/beta',
      'openai/alpha',
    ])
  })

  it('supports numeric range filters for context_length and max_output_tokens', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const contextRange = repo.queryCore({
      providerKey: 'openrouter',
      contextLength: { min: 10000, max: 70000 },
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(contextRange.items.map((row) => row.modelId)).toEqual(['openai/beta'])

    const outputRange = repo.queryCore({
      providerKey: 'openrouter',
      maxOutputTokens: { min: 5000, max: 9000 },
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(outputRange.items.map((row) => row.modelId)).toEqual(['openai/beta'])
  })

  it('supports context_length and max_output_tokens sorting', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const byContextLength = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'context_length',
      sortOrder: 'desc',
      limit: 10,
    })
    expect(byContextLength.items.map((row) => row.modelId)).toEqual([
      'openai/alpha',
      'openai/beta',
      'anthropic/gamma',
      'openai/delta',
    ])

    const byMaxOutputTokens = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'max_output_tokens',
      sortOrder: 'desc',
      limit: 10,
    })
    expect(byMaxOutputTokens.items.map((row) => row.modelId)).toEqual([
      'openai/beta',
      'openai/alpha',
      'anthropic/gamma',
      'openai/delta',
    ])
  })

  it('supports exact identity search on model_id and canonical_slug in addition to FTS text search', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const byModelIdExact = repo.queryCore({
      providerKey: 'openrouter',
      searchText: 'OPENAI/BETA',
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(byModelIdExact.items.map((row) => row.modelId)).toEqual(['openai/beta'])

    const byCanonicalSlugExact = repo.queryCore({
      providerKey: 'openrouter',
      searchText: 'anthropic/gamma',
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(byCanonicalSlugExact.items.map((row) => row.modelId)).toEqual(['anthropic/gamma'])
  })

  it('supports moderation, tokenizer and instruct_type filters', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const moderated = repo.queryCore({
      providerKey: 'openrouter',
      topProviderIsModerated: true,
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(moderated.items.map((row) => row.modelId)).toEqual([
      'openai/alpha',
      'anthropic/gamma',
    ])

    const tokenizer = repo.queryCore({
      providerKey: 'openrouter',
      tokenizers: ['cl100k_base'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(tokenizer.items.map((row) => row.modelId)).toEqual(['openai/alpha'])

    const instructType = repo.queryCore({
      providerKey: 'openrouter',
      instructTypes: ['messages'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(instructType.items.map((row) => row.modelId)).toEqual(['openai/beta'])
  })

  it('supports per/default parameters existence, architecture modality, and expiration threshold filters', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const hasPerRequestLimits = repo.queryCore({
      providerKey: 'openrouter',
      hasPerRequestLimits: true,
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(hasPerRequestLimits.items.map((row) => row.modelId)).toEqual(['openai/alpha'])

    const hasDefaultParameters = repo.queryCore({
      providerKey: 'openrouter',
      hasDefaultParameters: true,
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(hasDefaultParameters.items.map((row) => row.modelId)).toEqual(['openai/alpha'])

    const architectureModality = repo.queryCore({
      providerKey: 'openrouter',
      architectureModalities: ['text->image'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(architectureModality.items.map((row) => row.modelId)).toEqual(['openai/beta'])

    const expiringSoon = repo.queryCore({
      providerKey: 'openrouter',
      expiringWithinDays: 7,
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(expiringSoon.items.map((row) => row.modelId)).toEqual(['openai/beta'])
  })

  it('treats architecture modality filters as capability-inclusion checks', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    db.prepare(
      `
      UPDATE models
      SET architecture_modality = 'text+image->image',
          input_modalities_json = '["text","image"]',
          output_modalities_json = '["image"]'
      WHERE provider_key = 'openrouter'
        AND model_id = 'openai/beta'
    `
    ).run()

    const textToImage = repo.queryCore({
      providerKey: 'openrouter',
      architectureModalities: ['text->image'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(textToImage.items.map((row) => row.modelId)).toEqual(['openai/beta'])

    const textImageToText = repo.queryCore({
      providerKey: 'openrouter',
      architectureModalities: ['text+image->text'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(textImageToText.items.map((row) => row.modelId)).toEqual(['openai/alpha'])
  })

  it('supports modalities combination and supported_parameters contains filters', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const modalities = repo.queryCore({
      providerKey: 'openrouter',
      modalities: ['image'],
      inputModalities: ['image'],
      outputModalities: ['text'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(modalities.items.map((row) => row.modelId)).toEqual(['openai/alpha'])

    const supportedParameters = repo.queryCore({
      providerKey: 'openrouter',
      supportedParameters: ['reasoning', 'tools'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(supportedParameters.items.map((row) => row.modelId)).toEqual(['openai/beta'])
  })

  it('supports modelIds pre-filter for category membership integration', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const result = repo.queryCore({
      providerKey: 'openrouter',
      modelIds: ['openai/beta', 'anthropic/gamma'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })

    expect(result.items.map((row) => row.modelId)).toEqual([
      'openai/beta',
      'anthropic/gamma',
    ])
  })

  it('supports large modelIds filter payloads without hitting sqlite bind limit', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const largeModelIds = Array.from({ length: 1200 }, (_, index) => `vendor/model-${index}`)
    largeModelIds.push('openai/alpha')

    const result = repo.queryCore({
      providerKey: 'openrouter',
      modelIds: largeModelIds,
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })

    expect(result.items.map((row) => row.modelId)).toEqual(['openai/alpha'])
  })

  it('cleans temp membership table after large modelIds query', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const largeModelIds = Array.from({ length: 1200 }, (_, index) => `vendor/model-${index}`)
    largeModelIds.push('openai/alpha')

    repo.queryCore({
      providerKey: 'openrouter',
      modelIds: largeModelIds,
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })

    const tempCount = db
      .prepare('SELECT COUNT(1) AS count FROM catalog_query_model_ids')
      .get() as { count: number }
    expect(tempCount.count).toBe(0)
  })

  it('maps deprecated providers filter to models.vendor semantics', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const result = repo.queryCore({
      providerKey: 'openrouter',
      providers: ['anthropic'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })

    expect(result.items.map((row) => row.modelId)).toEqual(['anthropic/gamma'])
  })

  it('supports stable keyset pagination with no overlap across pages', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

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
    const page1Again = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 2,
    })

    const page1Ids = page1.items.map((row) => row.modelId)
    const page2Ids = page2.items.map((row) => row.modelId)

    expect(page1.items.length).toBe(2)
    expect(page2.items.length).toBe(2)
    expect(page1.nextCursor?.modelKey).toBe(page1.items[1].modelKey)
    expect(page1Again.items.map((row) => row.modelId)).toEqual(page1Ids)
    expect(page2Ids.filter((id) => page1Ids.includes(id))).toHaveLength(0)
  })

  it('supports stable keyset pagination for created_at sort with no overlap across pages', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const page1 = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'created_at',
      sortOrder: 'desc',
      limit: 2,
    })
    const page2 = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'created_at',
      sortOrder: 'desc',
      limit: 2,
      cursor: page1.nextCursor,
    })

    const page1Ids = page1.items.map((row) => row.modelId)
    const page2Ids = page2.items.map((row) => row.modelId)
    expect(page2Ids.filter((id) => page1Ids.includes(id))).toHaveLength(0)
  })

  it('supports stable keyset pagination for context_length sort with no overlap across pages', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const page1 = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'context_length',
      sortOrder: 'desc',
      limit: 2,
    })
    const page2 = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'context_length',
      sortOrder: 'desc',
      limit: 2,
      cursor: page1.nextCursor,
    })

    const page1Ids = page1.items.map((row) => row.modelId)
    const page2Ids = page2.items.map((row) => row.modelId)
    expect(page2Ids.filter((id) => page1Ids.includes(id))).toHaveLength(0)
  })

  it('accepts legacy cursor payload (providerKey + modelId) for compatibility', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const page1 = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 2,
    })
    const legacyCursor = {
      sortBy: page1.nextCursor?.sortBy ?? 'name',
      sortOrder: page1.nextCursor?.sortOrder ?? 'asc',
      name: page1.nextCursor?.name,
      createdAtSec: page1.nextCursor?.createdAtSec,
      providerKey: page1.nextCursor?.providerKey,
      modelId: page1.nextCursor?.modelId,
    } as any

    const page2 = repo.queryCore({
      providerKey: 'openrouter',
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 2,
      cursor: legacyCursor,
    })

    expect(page2.items).toHaveLength(2)
    expect(page2.items.map((row) => row.modelId)).toEqual(['openai/delta', 'anthropic/gamma'])
  })

  it('requires all requested tags (AND semantics)', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const result = repo.queryCore({
      providerKey: 'openrouter',
      tags: ['capability:reasoning', 'capability:tools'],
      sortBy: 'created_at',
      sortOrder: 'desc',
      limit: 10,
    })

    expect(result.items.map((row) => row.modelId)).toEqual(['openai/beta'])
  })
})

describe('ModelCatalogRepo.endpointMeta', () => {
  function seedEndpointFixture(repo: ModelCatalogRepo, nowMs: number) {
    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'endpoint_fixture_s1',
      providers: [
        { providerKey: 'openrouter', displayName: 'OpenRouter', updatedAtMs: nowMs },
      ],
      models: [
        {
          providerKey: 'openrouter',
          modelId: 'openai/alpha',
          modelKey: 'openrouter::openai/alpha',
          displayName: 'Alpha',
          status: 'active',
          visibility: 'visible',
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          supportedParametersJson: '[]',
          capabilitiesJson: '{}',
          capReasoning: 0,
          capTools: 0,
          capStructuredOutputs: 0,
          capVision: 0,
          capLongContext: 0,
          firstSeenAtMs: nowMs,
          lastSeenAtMs: nowMs,
          syncedAtMs: nowMs,
        },
        {
          providerKey: 'openrouter',
          modelId: 'openai/beta',
          modelKey: 'openrouter::openai/beta',
          displayName: 'Beta',
          status: 'active',
          visibility: 'visible',
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text"]',
          supportedParametersJson: '[]',
          capabilitiesJson: '{}',
          capReasoning: 0,
          capTools: 0,
          capStructuredOutputs: 0,
          capVision: 0,
          capLongContext: 0,
          firstSeenAtMs: nowMs,
          lastSeenAtMs: nowMs,
          syncedAtMs: nowMs,
        },
      ],
      tags: [],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'models_user_primary',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'endpoint_fixture_s1',
        modelCount: 2,
        visibleModelCount: 2,
        hiddenModelCount: 0,
        lastSyncAtMs: nowMs,
        ttlSeconds: 3600,
        syncState: 'ok',
        rawRetentionPolicyJson: '{}',
      },
    })
  }

  it('replaces endpoint_meta rows per model and reads cached rows by endpoint_key order', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedEndpointFixture(repo, nowMs)

    repo.replaceEndpointMetaByModel({
      providerKey: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      modelId: 'openai/alpha',
      fetchedAtMs: nowMs,
      endpoints: [
        {
          providerKey: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          modelId: 'openai/alpha',
          endpointKey: 'openai/alpha::openai::fp16::OpenAI',
          providerName: 'OpenAI',
          tag: 'openai',
          quantization: 'fp16',
          contextLength: 8192,
          maxCompletionTokens: 4096,
          maxPromptTokens: 8192,
          supportedParametersJson: '["temperature","tools"]',
          supportsImplicitCaching: 1,
          status: 0,
          rawJson: '{"provider_name":"OpenAI"}',
        },
        {
          providerKey: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          modelId: 'openai/alpha',
          endpointKey: 'openai/alpha::openai-alt::fp8::Alt',
          providerName: 'Alt',
          tag: 'openai-alt',
          quantization: 'fp8',
          contextLength: 4096,
          maxCompletionTokens: 2048,
          maxPromptTokens: 4096,
          supportedParametersJson: '[]',
          supportsImplicitCaching: 0,
          status: 1,
        },
      ],
    })

    const first = repo.listEndpointMetaByModel('openrouter', 'https://openrouter.ai/api/v1', 'openai/alpha')
    expect(first).toHaveLength(2)
    expect(first.map((row) => row.endpointKey)).toEqual([
      'openai/alpha::openai-alt::fp8::Alt',
      'openai/alpha::openai::fp16::OpenAI',
    ])
    expect(first[1]).toMatchObject({
      providerKey: 'openrouter',
      modelId: 'openai/alpha',
      providerName: 'OpenAI',
      supportsImplicitCaching: 1,
      status: 0,
      fetchedAtMs: nowMs,
    })

    const nextMs = nowMs + 1000
    repo.replaceEndpointMetaByModel({
      providerKey: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      modelId: 'openai/alpha',
      fetchedAtMs: nextMs,
      endpoints: [
        {
          providerKey: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          modelId: 'openai/alpha',
          endpointKey: 'openai/alpha::openai::fp16::OpenAI',
          providerName: 'OpenAI',
          tag: 'openai',
          quantization: 'fp16',
          contextLength: 16384,
          maxCompletionTokens: 8192,
          maxPromptTokens: 16384,
          supportedParametersJson: '["temperature"]',
          supportsImplicitCaching: 1,
          status: 0,
        },
      ],
    })

    const second = repo.listEndpointMetaByModel('openrouter', 'https://openrouter.ai/api/v1', 'openai/alpha')
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({
      endpointKey: 'openai/alpha::openai::fp16::OpenAI',
      maxCompletionTokens: 8192,
      maxPromptTokens: 16384,
      fetchedAtMs: nextMs,
    })
  })

  it('ignores mismatched endpoint rows and keeps model-local boundaries', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedEndpointFixture(repo, nowMs)

    repo.replaceEndpointMetaByModel({
      providerKey: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      modelId: 'openai/alpha',
      fetchedAtMs: nowMs,
      endpoints: [
        {
          providerKey: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          modelId: 'openai/alpha',
          endpointKey: 'ok',
        },
        {
          providerKey: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          modelId: 'openai/beta',
          endpointKey: 'mismatch-model',
        },
        {
          providerKey: 'other-provider',
          baseUrl: 'https://openrouter.ai/api/v1',
          modelId: 'openai/alpha',
          endpointKey: 'mismatch-provider',
        },
      ],
    })

    const alpha = repo.listEndpointMetaByModel('openrouter', 'https://openrouter.ai/api/v1', 'openai/alpha')
    const beta = repo.listEndpointMetaByModel('openrouter', 'https://openrouter.ai/api/v1', 'openai/beta')
    expect(alpha.map((row) => row.endpointKey)).toEqual(['ok'])
    expect(beta).toEqual([])
  })
})
