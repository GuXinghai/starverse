import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  CatalogScopedSnapshotValidationError,
  ModelCatalogRepo,
  type CatalogScopedModelUpsertInput,
} from './modelCatalogRepo'

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
  function queryFixtureModel(
    nowMs: number,
    input: Readonly<{
      modelId: string
      displayName: string
      canonicalSlug?: string | null
      description?: string | null
      vendor?: string
      createdAtSec?: number
    }>
  ) {
    return {
      providerKey: 'openrouter',
      modelId: input.modelId,
      modelKey: `openrouter::${input.modelId}`,
      canonicalSlug: input.canonicalSlug ?? input.modelId,
      displayName: input.displayName,
      description: input.description ?? null,
      vendor: input.vendor ?? input.modelId.split('/')[0] ?? 'unknown',
      family: input.vendor ?? input.modelId.split('/')[0] ?? 'unknown',
      status: 'active' as const,
      visibility: 'visible' as const,
      contextLength: 8192,
      maxOutputTokens: 2048,
      architectureModality: 'text->text',
      inputModalitiesJson: '["text"]',
      outputModalitiesJson: '["text"]',
      supportedParametersJson: '[]',
      capabilitiesJson: '{"reasoning":false,"tools":false,"structuredOutputs":false,"vision":false,"longContext":false}',
      capReasoning: 0 as const,
      capTools: 0 as const,
      capStructuredOutputs: 0 as const,
      capVision: 0 as const,
      capLongContext: 0 as const,
      createdAtSec: input.createdAtSec ?? 1700000000,
      firstSeenAtMs: nowMs,
      lastSeenAtMs: nowMs,
      syncedAtMs: nowMs,
      rawJson: '{}',
    }
  }

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

  it('supports description search when explicitly enabled with combined filters', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const result = repo.queryCore({
      providerKey: 'openrouter',
      searchText: 'vision model',
      includeDescriptionInSearch: true,
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

  it('excludes description from search by default', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    seedQueryFixture(repo, nowMs)

    const withoutDescription = repo.queryCore({
      providerKey: 'openrouter',
      searchText: 'image understanding',
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(withoutDescription.items.map((row) => row.modelId)).toEqual([])

    const withDescription = repo.queryCore({
      providerKey: 'openrouter',
      searchText: 'image understanding',
      includeDescriptionInSearch: true,
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 10,
    })
    expect(withDescription.items.map((row) => row.modelId)).toEqual(['openai/alpha'])
  })

  it('supports token prefix matching for model picker autocomplete searches', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()
    repo.syncCoreSnapshot({
      providerKey: 'openrouter',
      snapshotId: 'prefix_s1',
      providers: [{ providerKey: 'openrouter', displayName: 'OpenRouter', updatedAtMs: nowMs }],
      models: [
        queryFixtureModel(nowMs, {
          modelId: 'deepseek/deepseek-chat',
          canonicalSlug: 'deepseek/deepseek-chat-v4',
          displayName: 'DeepSeek: DeepSeek V4',
          vendor: 'deepseek',
          createdAtSec: 1700000001,
        }),
        queryFixtureModel(nowMs, {
          modelId: 'openai/gpt-4',
          canonicalSlug: 'openai/gpt-4',
          displayName: 'OpenAI: GPT-4',
          vendor: 'openai',
          createdAtSec: 1700000002,
        }),
        queryFixtureModel(nowMs, {
          modelId: 'openai/gpt-4.1',
          canonicalSlug: 'openai/gpt-4.1',
          displayName: 'OpenAI: GPT-4.1',
          vendor: 'openai',
          createdAtSec: 1700000003,
        }),
      ],
      tags: [],
      meta: {
        providerKey: 'openrouter',
        schemaVersion: 1,
        dataSource: 'models_user_primary',
        baseUrl: 'https://openrouter.ai/api/v1',
        snapshotId: 'prefix_s1',
        modelCount: 3,
        visibleModelCount: 3,
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

    const searchIds = (searchText: string) =>
      repo.queryCore({
        providerKey: 'openrouter',
        searchText,
        sortBy: 'name',
        sortOrder: 'asc',
        limit: 10,
      }).items.map((row) => row.modelId)

    expect(searchIds('d')).toContain('deepseek/deepseek-chat')
    expect(searchIds('de')).toContain('deepseek/deepseek-chat')
    expect(searchIds('deepsee')).toContain('deepseek/deepseek-chat')
    expect(searchIds('deepseek v')).toContain('deepseek/deepseek-chat')
    expect(searchIds('deepseek v4')).toContain('deepseek/deepseek-chat')
    expect(searchIds('gpt 4')).toEqual(['openai/gpt-4', 'openai/gpt-4.1'])
    expect(searchIds('!!!')).toEqual([])
    expect(searchIds('deepseek/deepseek-chat-v4')).toContain('deepseek/deepseek-chat')
    expect(searchIds('gpt-4.1')).toContain('openai/gpt-4.1')
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

describe('ModelCatalogRepo scoped catalog foundation', () => {
  function seedScopedMeta(repo: ModelCatalogRepo, scope: string, snapshotId: string, providerKey = 'openrouter') {
    const nowMs = Date.now()
    repo.upsertScopedMeta({
      providerKey,
      catalogScopeKey: scope,
      baseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary',
      activeSnapshotId: snapshotId,
      syncState: 'ok',
      lastSyncAtMs: nowMs,
      lastUsedAtMs: nowMs,
      modelCount: 1,
      visibleModelCount: 1,
      hiddenModelCount: 0,
      snapshotChecksum: `checksum-${scope}`,
      schemaVersion: 1,
    })
  }

  function makeScopedModel(modelId: string, overrides: Partial<CatalogScopedModelUpsertInput> = {}): CatalogScopedModelUpsertInput {
    const nowMs = Date.now()
    return {
      modelId,
      modelKey: overrides.modelKey ?? `openrouter::${modelId}`,
      canonicalSlug: overrides.canonicalSlug ?? modelId,
      displayName: overrides.displayName ?? modelId,
      description: overrides.description ?? `Description for ${modelId}`,
      vendor: overrides.vendor ?? modelId.split('/')[0] ?? 'vendor',
      family: overrides.family ?? 'family',
      status: overrides.status ?? 'active',
      visibility: overrides.visibility ?? 'visible',
      contextLength: overrides.contextLength ?? 8192,
      maxOutputTokens: overrides.maxOutputTokens ?? 4096,
      inputModalitiesJson: overrides.inputModalitiesJson ?? '["text"]',
      outputModalitiesJson: overrides.outputModalitiesJson ?? '["text"]',
      supportedParametersJson: overrides.supportedParametersJson ?? '["temperature"]',
      capabilitiesJson: overrides.capabilitiesJson ?? '{"reasoning":false}',
      pricingJson: overrides.pricingJson ?? '{"prompt":"0"}',
      rawJson: overrides.rawJson ?? '{"source":"fixture"}',
      createdAtSec: overrides.createdAtSec ?? 1700000000,
      firstSeenAtMs: overrides.firstSeenAtMs ?? nowMs,
      lastSeenAtMs: overrides.lastSeenAtMs ?? nowMs,
      syncedAtMs: overrides.syncedAtMs ?? nowMs,
    }
  }

  function seedScopedModel(repo: ModelCatalogRepo, scope: string, snapshotId: string, modelId: string, providerKey = 'openrouter') {
    repo.insertScopedModelRows({
      providerKey,
      catalogScopeKey: scope,
      snapshotId,
      models: [
        makeScopedModel(modelId, { modelKey: `${providerKey}::${modelId}` }),
      ],
    })
  }

  function writeScopedSnapshot(
    repo: ModelCatalogRepo,
    scope: string,
    snapshotId: string,
    models: readonly CatalogScopedModelUpsertInput[],
    providerKey = 'openrouter'
  ) {
    return repo.writeScopedSnapshot({
      providerKey,
      catalogScopeKey: scope,
      baseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary',
      snapshotId,
      snapshotChecksum: `checksum-${snapshotId}`,
      models,
      syncedAtMs: Date.now(),
      schemaVersion: 1,
    })
  }

  function scopedModelIds(repo: ModelCatalogRepo, scope: string, providerKey = 'openrouter') {
    return repo.queryScopedActiveModels({ providerKey, catalogScopeKey: scope }).items.map((row) => row.modelId)
  }

  function countScopedRows(db: BetterSqlite3.Database, scope: string, snapshotId: string) {
    const row = db.prepare(`
      SELECT COUNT(1) AS count
      FROM catalog_models
      WHERE provider_key = 'openrouter'
        AND catalog_scope_key = @scope
        AND snapshot_id = @snapshotId
    `).get({ scope, snapshotId }) as { count?: number } | undefined
    return Number(row?.count ?? 0)
  }

  function seedLegacyOnlyModel(db: BetterSqlite3.Database) {
    const nowMs = Date.now()
    db.prepare("INSERT OR IGNORE INTO providers(provider_key, display_name, updated_at_ms) VALUES('openrouter', 'OpenRouter', @nowMs)").run({ nowMs })
    db.prepare(`
      INSERT INTO model_catalog(model_id, router_source, vendor, name, last_seen_snapshot_id, created_at_ms, updated_at_ms)
      VALUES('legacy/only-model', 'openrouter', 'legacy', 'Legacy Only', 'legacy-snapshot', @nowMs, @nowMs)
    `).run({ nowMs })
    db.prepare(`
      INSERT INTO models(provider_key, model_id, model_key, display_name, first_seen_at_ms, last_seen_at_ms, synced_at_ms)
      VALUES('openrouter', 'legacy/only-model', 'openrouter::legacy/only-model', 'Legacy Only', @nowMs, @nowMs, @nowMs)
    `).run({ nowMs })
  }

  it('writes and reads scoped meta', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    seedScopedMeta(repo, 'scope-a', 'snapshot-a')

    expect(repo.getScopedMeta('openrouter', 'scope-a')).toMatchObject({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-a',
      activeSnapshotId: 'snapshot-a',
      syncState: 'ok',
      modelCount: 1,
    })
  })

  it('writes scoped model rows and queries only the active snapshot for that scope', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    seedScopedMeta(repo, 'scope-a', 'snapshot-a')
    seedScopedMeta(repo, 'scope-b', 'snapshot-b')
    seedScopedModel(repo, 'scope-a', 'snapshot-a', 'openai/a')
    seedScopedModel(repo, 'scope-a', 'snapshot-old', 'openai/old')
    seedScopedModel(repo, 'scope-b', 'snapshot-b', 'openai/b')

    expect(repo.queryScopedActiveModels({ providerKey: 'openrouter', catalogScopeKey: 'scope-a' }).items.map((row) => row.modelId)).toEqual(['openai/a'])
    expect(repo.queryScopedActiveModels({ providerKey: 'openrouter', catalogScopeKey: 'scope-b' }).items.map((row) => row.modelId)).toEqual(['openai/b'])
  })

  it('does not persist raw API keys in scoped tables', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const rawApiKey = 'sk-phase1-repo-secret'

    seedScopedMeta(repo, 'scope-without-raw-key', 'snapshot-a')
    seedScopedModel(repo, 'scope-without-raw-key', 'snapshot-a', 'openai/a')

    const persisted = JSON.stringify({
      meta: db.prepare('SELECT * FROM catalog_scope_meta').all(),
      models: db.prepare('SELECT * FROM catalog_models').all(),
    })
    expect(persisted).not.toContain(rawApiKey)
  })

  it('clearScopedCatalog only clears the requested scope', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    seedScopedMeta(repo, 'scope-a', 'snapshot-a')
    seedScopedMeta(repo, 'scope-b', 'snapshot-b')
    seedScopedModel(repo, 'scope-a', 'snapshot-a', 'openai/a')
    seedScopedModel(repo, 'scope-b', 'snapshot-b', 'openai/b')

    const result = repo.clearScopedCatalog('openrouter', 'scope-a')

    expect(result.deleted.catalog_models).toBe(1)
    expect(result.deleted.catalog_scope_meta).toBe(1)
    expect(result.deletedScopeCount).toBe(1)
    expect(repo.getScopedMeta('openrouter', 'scope-a')).toBeNull()
    expect(repo.getScopedMeta('openrouter', 'scope-b')).not.toBeNull()
    expect(repo.queryScopedActiveModels({ providerKey: 'openrouter', catalogScopeKey: 'scope-b' }).items.map((row) => row.modelId)).toEqual(['openai/b'])
  })

  it('clearAllProviderScopedCatalog clears only that provider scoped catalog', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    seedScopedMeta(repo, 'scope-openrouter', 'snapshot-openrouter', 'openrouter')
    seedScopedMeta(repo, 'scope-other', 'snapshot-other', 'other-provider')
    seedScopedModel(repo, 'scope-openrouter', 'snapshot-openrouter', 'openai/a', 'openrouter')
    seedScopedModel(repo, 'scope-other', 'snapshot-other', 'other/a', 'other-provider')

    const result = repo.clearAllProviderScopedCatalog('openrouter')

    expect(result.deletedScopeCount).toBe(1)
    expect(repo.getScopedMeta('openrouter', 'scope-openrouter')).toBeNull()
    expect(repo.getScopedMeta('other-provider', 'scope-other')).not.toBeNull()
    expect(repo.queryScopedActiveModels({ providerKey: 'other-provider', catalogScopeKey: 'scope-other' }).items).toHaveLength(1)
  })

  it('clearAllProviderScopedCatalog preserves user settings, preferences, usage, and project data', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = Date.now()

    writeScopedSnapshot(repo, 'scope-openrouter', 'snapshot-openrouter', [makeScopedModel('openai/a')])
    db.prepare("INSERT INTO project(id, name, created_at, updated_at) VALUES('project-1', 'Project', @nowMs, @nowMs)").run({ nowMs })
    db.prepare("INSERT INTO settings_kv(key, value_json, created_at_ms, updated_at_ms) VALUES('setting-1', '{\"ok\":true}', @nowMs, @nowMs)").run({ nowMs })
    db.prepare(`
      INSERT INTO usage_log(id, provider, model, tokens_input, tokens_output, duration_ms, timestamp)
      VALUES('usage-1', 'openrouter', 'openai/a', 1, 2, 3, @nowMs)
    `).run({ nowMs })
    db.prepare(`
      INSERT INTO model_favorites(scope_type, scope_id, provider_key, model_id, model_key, sort_rank, created_at_ms, updated_at_ms)
      VALUES('global', '', 'openrouter', 'openai/a', 'openrouter::openai/a', 0, @nowMs, @nowMs)
    `).run({ nowMs })
    db.prepare(`
      INSERT INTO model_recents(scope_type, scope_id, provider_key, model_id, model_key, last_used_at_ms, use_count, created_at_ms, updated_at_ms)
      VALUES('global', '', 'openrouter', 'openai/a', 'openrouter::openai/a', @nowMs, 1, @nowMs, @nowMs)
    `).run({ nowMs })

    repo.clearAllProviderScopedCatalog('openrouter')

    expect(repo.getScopedMeta('openrouter', 'scope-openrouter')).toBeNull()
    expect(db.prepare("SELECT COUNT(1) AS count FROM project WHERE id = 'project-1'").get()).toMatchObject({ count: 1 })
    expect(db.prepare("SELECT COUNT(1) AS count FROM settings_kv WHERE key = 'setting-1'").get()).toMatchObject({ count: 1 })
    expect(db.prepare("SELECT COUNT(1) AS count FROM usage_log WHERE id = 'usage-1'").get()).toMatchObject({ count: 1 })
    expect(db.prepare("SELECT COUNT(1) AS count FROM model_favorites WHERE model_key = 'openrouter::openai/a'").get()).toMatchObject({ count: 1 })
    expect(db.prepare("SELECT COUNT(1) AS count FROM model_recents WHERE model_key = 'openrouter::openai/a'").get()).toMatchObject({ count: 1 })
  })

  it('cleanupExpiredScopedCatalogCaches deletes only expired scopes for the requested provider', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const nowMs = 10_000

    writeScopedSnapshot(repo, 'scope-expired', 'snapshot-expired', [makeScopedModel('openai/expired')])
    writeScopedSnapshot(repo, 'scope-fresh', 'snapshot-fresh', [makeScopedModel('openai/fresh')])
    writeScopedSnapshot(repo, 'scope-other', 'snapshot-other', [makeScopedModel('other/fresh')], 'other-provider')
    db.prepare(`
      UPDATE catalog_scope_meta
      SET last_used_at_ms = @lastUsedAtMs
      WHERE catalog_scope_key = @catalogScopeKey
    `).run({ catalogScopeKey: 'scope-expired', lastUsedAtMs: nowMs - 8_000 })
    db.prepare(`
      UPDATE catalog_scope_meta
      SET last_used_at_ms = @lastUsedAtMs
      WHERE catalog_scope_key = @catalogScopeKey
    `).run({ catalogScopeKey: 'scope-fresh', lastUsedAtMs: nowMs - 500 })
    db.prepare(`
      UPDATE catalog_scope_meta
      SET last_used_at_ms = @lastUsedAtMs
      WHERE catalog_scope_key = @catalogScopeKey
    `).run({ catalogScopeKey: 'scope-other', lastUsedAtMs: nowMs - 8_000 })

    const result = repo.cleanupExpiredScopedCatalogCaches('openrouter', nowMs, 7_000)

    expect(result.deletedScopeCount).toBe(1)
    expect(result.deleted.catalog_scope_meta).toBe(1)
    expect(repo.getScopedMeta('openrouter', 'scope-expired')).toBeNull()
    expect(repo.getScopedMeta('openrouter', 'scope-fresh')).not.toBeNull()
    expect(repo.getScopedMeta('other-provider', 'scope-other')).not.toBeNull()
  })

  it('writeScopedSnapshot writes rows and updates activeSnapshotId', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    const result = writeScopedSnapshot(repo, 'scope-a', 'snapshot-a', [
      makeScopedModel('openai/a', { displayName: 'Alpha' }),
      makeScopedModel('openai/hidden', { displayName: 'Hidden', visibility: 'hidden' }),
    ])

    expect(result).toMatchObject({
      activeSnapshotId: 'snapshot-a',
      modelCount: 2,
      visibleModelCount: 1,
      hiddenModelCount: 1,
    })
    expect(repo.getScopedMeta('openrouter', 'scope-a')).toMatchObject({
      activeSnapshotId: 'snapshot-a',
      syncState: 'ok',
      modelCount: 2,
      visibleModelCount: 1,
      hiddenModelCount: 1,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    expect(scopedModelIds(repo, 'scope-a')).toEqual(['openai/a'])
  })

  it('writeScopedSnapshot success clears lastErrorCode and lastErrorMessage', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    repo.upsertScopedMeta({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-error',
      baseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary',
      activeSnapshotId: null,
      syncState: 'error',
      lastSyncAtMs: 0,
      lastUsedAtMs: 1,
      modelCount: 0,
      visibleModelCount: 0,
      hiddenModelCount: 0,
      lastErrorCode: 'cache_corrupted',
      lastErrorMessage: 'previous failure',
      schemaVersion: 1,
    })

    writeScopedSnapshot(repo, 'scope-error', 'snapshot-ok', [makeScopedModel('openai/a')])

    expect(repo.getScopedMeta('openrouter', 'scope-error')).toMatchObject({
      syncState: 'ok',
      activeSnapshotId: 'snapshot-ok',
      lastErrorCode: null,
      lastErrorMessage: null,
    })
  })

  it('updateScopedMetaSyncError marks current scope failed without replacing active snapshot', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    writeScopedSnapshot(repo, 'scope-error-preserve', 'snapshot-ok', [makeScopedModel('openai/a')])

    repo.updateScopedMetaSyncError({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-error-preserve',
      baseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary',
      lastErrorCode: 'network_unreachable',
      lastErrorMessage: '网络不可达',
      atMs: Date.now(),
      schemaVersion: 1,
    })

    expect(repo.getScopedMeta('openrouter', 'scope-error-preserve')).toMatchObject({
      activeSnapshotId: 'snapshot-ok',
      syncState: 'error',
      modelCount: 1,
      lastErrorCode: 'network_unreachable',
      lastErrorMessage: '网络不可达',
    })
    expect(scopedModelIds(repo, 'scope-error-preserve')).toEqual(['openai/a'])
  })

  it('writeScopedSnapshot validates row counts before replacing active snapshot', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    writeScopedSnapshot(repo, 'scope-a', 'snapshot-old', [makeScopedModel('openai/old')])

    expect(() => writeScopedSnapshot(repo, 'scope-a', 'snapshot-new', [
      makeScopedModel('openai/dupe'),
      makeScopedModel('openai/dupe', { displayName: 'Duplicate' }),
    ])).toThrow(CatalogScopedSnapshotValidationError)

    expect(repo.getScopedMeta('openrouter', 'scope-a')?.activeSnapshotId).toBe('snapshot-old')
    expect(countScopedRows(db, 'scope-a', 'snapshot-new')).toBe(0)
    expect(scopedModelIds(repo, 'scope-a')).toEqual(['openai/old'])
  })

  it('writeScopedSnapshot DB failure rolls back all new rows', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    writeScopedSnapshot(repo, 'scope-a', 'snapshot-old', [makeScopedModel('openai/old')])

    expect(() => repo.writeScopedSnapshot({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-a',
      baseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary',
      snapshotId: 'snapshot-new',
      snapshotChecksum: 'checksum-new',
      models: [
        makeScopedModel('openai/valid'),
        makeScopedModel('openai/invalid-status', { status: 'invalid' as CatalogScopedModelUpsertInput['status'] }),
      ],
      syncedAtMs: Date.now(),
      schemaVersion: 1,
    })).toThrow()

    expect(repo.getScopedMeta('openrouter', 'scope-a')?.activeSnapshotId).toBe('snapshot-old')
    expect(countScopedRows(db, 'scope-a', 'snapshot-new')).toBe(0)
    expect(scopedModelIds(repo, 'scope-a')).toEqual(['openai/old'])
  })

  it('writeScopedSnapshot allows explicit empty successful snapshot', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    writeScopedSnapshot(repo, 'scope-empty', 'snapshot-empty', [])

    expect(repo.getScopedMeta('openrouter', 'scope-empty')).toMatchObject({
      activeSnapshotId: 'snapshot-empty',
      syncState: 'ok',
      modelCount: 0,
      visibleModelCount: 0,
      hiddenModelCount: 0,
    })
    expect(repo.validateActiveScopedSnapshot('openrouter', 'scope-empty')).toMatchObject({ ok: true, modelCount: 0 })
    expect(scopedModelIds(repo, 'scope-empty')).toEqual([])
  })

  it('queryScopedActiveModels keeps different credential scopes isolated', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    writeScopedSnapshot(repo, 'scope-api-key-a', 'snapshot-a', [makeScopedModel('a/model')])
    writeScopedSnapshot(repo, 'scope-api-key-b', 'snapshot-b', [makeScopedModel('b/model')])

    expect(scopedModelIds(repo, 'scope-api-key-a')).toEqual(['a/model'])
    expect(scopedModelIds(repo, 'scope-api-key-b')).toEqual(['b/model'])
    expect(repo.queryScopedActiveModels({ providerKey: 'openrouter', catalogScopeKey: 'scope-unknown' }).items).toEqual([])
  })

  it('queryScopedActiveModels supports minimum search sorting and cursor pagination', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)

    writeScopedSnapshot(repo, 'scope-a', 'snapshot-a', [
      makeScopedModel('vendor/bravo', { displayName: 'Bravo', contextLength: 4096 }),
      makeScopedModel('vendor/alpha', { displayName: 'Alpha', contextLength: 32768 }),
      makeScopedModel('vendor/charlie', { displayName: 'Charlie', contextLength: 8192 }),
    ])

    expect(repo.queryScopedActiveModels({ providerKey: 'openrouter', catalogScopeKey: 'scope-a', searchText: 'alp' }).items.map((row) => row.modelId)).toEqual(['vendor/alpha'])
    const firstPage = repo.queryScopedActiveModels({ providerKey: 'openrouter', catalogScopeKey: 'scope-a', sortBy: 'name', limit: 2 })
    expect(firstPage.items.map((row) => row.modelId)).toEqual(['vendor/alpha', 'vendor/bravo'])
    expect(firstPage.nextCursor).not.toBeNull()
    const secondPage = repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-a',
      sortBy: 'name',
      limit: 2,
      cursor: firstPage.nextCursor,
    })
    expect(secondPage.items.map((row) => row.modelId)).toEqual(['vendor/charlie'])
  })

  it('queryScopedActiveModels applies category filters only to current scoped rows', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    seedLegacyOnlyModel(db)

    writeScopedSnapshot(repo, 'scope-a', 'snapshot-a', [
      makeScopedModel('scope-a/code-model', {
        displayName: 'Code Assistant',
        description: 'Programming helper',
        rawJson: '{"categories":["programming"]}',
      }),
      makeScopedModel('scope-a/legal-model', {
        displayName: 'Legal Assistant',
        description: 'Legal helper',
        rawJson: '{"categories":["legal"]}',
      }),
    ])
    writeScopedSnapshot(repo, 'scope-b', 'snapshot-b', [
      makeScopedModel('scope-b/legal-model', {
        displayName: 'Legal Assistant',
        description: 'Legal helper',
        rawJson: '{"categories":["legal"]}',
      }),
    ])

    expect(repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-a',
      category: 'programming',
    }).items.map((row) => row.modelId)).toEqual(['scope-a/code-model'])
    expect(repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-b',
      category: 'programming',
    }).items).toEqual([])
  })

  it('queryScopedActiveModels applies capability filters from scoped capabilities_json', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    db.prepare(`
      INSERT INTO reasoning_model_index(model_id, name, status, last_synced_snapshot, created_at_ms, updated_at_ms)
      VALUES('scope-a/plain-model', 'Old Reasoning Index', 'visible', 'legacy-snapshot', 1, 1)
    `).run()

    writeScopedSnapshot(repo, 'scope-a', 'snapshot-a', [
      makeScopedModel('scope-a/reasoning-model', {
        capabilitiesJson: '{"reasoning":true,"tools":true,"vision":false,"longContext":true}',
        supportedParametersJson: '["reasoning","tools"]',
      }),
      makeScopedModel('scope-a/plain-model', {
        capabilitiesJson: '{"reasoning":false,"tools":false,"vision":true,"longContext":false}',
        supportedParametersJson: '["temperature"]',
      }),
    ])

    expect(repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-a',
      capabilities: { reasoning: true },
    }).items.map((row) => row.modelId)).toEqual(['scope-a/reasoning-model'])
    expect(repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-a',
      capabilities: { vision: true },
    }).items.map((row) => row.modelId)).toEqual(['scope-a/plain-model'])
    expect(repo.queryScopedActiveModels({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-a',
      supportedParameters: ['reasoning'],
    }).items.map((row) => row.modelId)).toEqual(['scope-a/reasoning-model'])
  })

  it('scoped query does not read legacy-only models', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    seedLegacyOnlyModel(db)
    writeScopedSnapshot(repo, 'scope-a', 'snapshot-a', [makeScopedModel('scoped/only-model')])

    expect(scopedModelIds(repo, 'scope-a')).toEqual(['scoped/only-model'])
    expect(scopedModelIds(repo, 'scope-a')).not.toContain('legacy/only-model')
  })

  it('scoped query does not fallback to legacy tables when scoped active snapshot is empty or missing', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    seedLegacyOnlyModel(db)

    expect(repo.queryScopedActiveModels({ providerKey: 'openrouter', catalogScopeKey: 'scope-missing' }).items).toEqual([])
    writeScopedSnapshot(repo, 'scope-empty', 'snapshot-empty', [])
    expect(repo.queryScopedActiveModels({ providerKey: 'openrouter', catalogScopeKey: 'scope-empty' }).items).toEqual([])
  })

  it('validateActiveScopedSnapshot reports cache_corrupted when active rows are missing for non-empty meta', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    seedScopedMeta(repo, 'scope-corrupt', 'missing-snapshot')

    expect(repo.validateActiveScopedSnapshot('openrouter', 'scope-corrupt')).toMatchObject({
      ok: false,
      code: 'cache_corrupted',
    })
    expect(() => repo.queryScopedActiveModels({ providerKey: 'openrouter', catalogScopeKey: 'scope-corrupt' })).toThrow(CatalogScopedSnapshotValidationError)
  })

  it('validateActiveScopedSnapshot reports cache_corrupted for invalid JSON rows', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    seedScopedMeta(repo, 'scope-corrupt-json', 'snapshot-corrupt')
    seedScopedModel(repo, 'scope-corrupt-json', 'snapshot-corrupt', 'openai/a')
    db.prepare(`
      UPDATE catalog_models
      SET capabilities_json = '{bad json'
      WHERE provider_key = 'openrouter'
        AND catalog_scope_key = 'scope-corrupt-json'
    `).run()

    expect(repo.validateActiveScopedSnapshot('openrouter', 'scope-corrupt-json')).toMatchObject({
      ok: false,
      code: 'cache_corrupted',
    })
  })

  it('validateActiveScopedSnapshot reports cache_corrupted for malformed critical rows', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    seedScopedMeta(repo, 'scope-corrupt-row', 'snapshot-corrupt')
    seedScopedModel(repo, 'scope-corrupt-row', 'snapshot-corrupt', 'openai/a')
    db.exec('PRAGMA ignore_check_constraints = ON')
    db.prepare(`
      UPDATE catalog_models
      SET display_name = ''
      WHERE provider_key = 'openrouter'
        AND catalog_scope_key = 'scope-corrupt-row'
    `).run()
    db.exec('PRAGMA ignore_check_constraints = OFF')

    expect(repo.validateActiveScopedSnapshot('openrouter', 'scope-corrupt-row')).toMatchObject({
      ok: false,
      code: 'cache_corrupted',
    })
  })

  it('writeScopedSnapshot does not persist raw API keys or derive reversible scope contents', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    const rawApiKey = 'sk-phase2-writer-secret'
    const catalogScopeKey = 'scope-without-api-key-text'

    writeScopedSnapshot(repo, catalogScopeKey, 'snapshot-private', [makeScopedModel('openai/private')])

    const persisted = JSON.stringify({
      meta: db.prepare('SELECT * FROM catalog_scope_meta').all(),
      models: db.prepare('SELECT * FROM catalog_models').all(),
    })
    expect(persisted).not.toContain(rawApiKey)
    expect(catalogScopeKey).not.toContain(rawApiKey)
  })
})

describe('ModelCatalogRepo deprecated OpenRouter catalog cache cleanup', () => {
  function count(db: BetterSqlite3.Database, sql: string): number {
    const row = db.prepare(sql).get() as { count?: number } | undefined
    return Number(row?.count ?? 0)
  }

  function seedDeprecatedCatalogAndCoreSentinels(db: BetterSqlite3.Database) {
    const nowMs = Date.now()
    db.prepare("INSERT INTO project(id, name, created_at, updated_at) VALUES('project-1', 'Project', @nowMs, @nowMs)").run({ nowMs })
    db.prepare("INSERT INTO settings_kv(key, value_json, created_at_ms, updated_at_ms) VALUES('setting-1', '{\"ok\":true}', @nowMs, @nowMs)").run({ nowMs })
    db.prepare(`
      INSERT INTO usage_log(id, provider, model, tokens_input, tokens_output, duration_ms, timestamp)
      VALUES('usage-1', 'openrouter', 'openai/a', 1, 2, 3, @nowMs)
    `).run({ nowMs })
    db.prepare(`
      INSERT INTO model_favorites(scope_type, scope_id, provider_key, model_id, model_key, sort_rank, created_at_ms, updated_at_ms)
      VALUES('global', '', 'openrouter', 'openai/a', 'openrouter::openai/a', 0, @nowMs, @nowMs)
    `).run({ nowMs })
    db.prepare(`
      INSERT INTO model_recents(scope_type, scope_id, provider_key, model_id, model_key, last_used_at_ms, use_count, created_at_ms, updated_at_ms)
      VALUES('global', '', 'openrouter', 'openai/a', 'openrouter::openai/a', @nowMs, 1, @nowMs, @nowMs)
    `).run({ nowMs })

    db.prepare(`
      INSERT INTO model_catalog(model_id, router_source, vendor, name, last_seen_snapshot_id, created_at_ms, updated_at_ms)
      VALUES('openai/a', 'openrouter', 'openai', 'A', 'legacy-snapshot', @nowMs, @nowMs)
    `).run({ nowMs })
    db.prepare("INSERT INTO providers(provider_key, display_name, updated_at_ms) VALUES('openrouter', 'OpenRouter', @nowMs)").run({ nowMs })
    db.prepare(`
      INSERT INTO models(provider_key, model_id, model_key, display_name, first_seen_at_ms, last_seen_at_ms, synced_at_ms)
      VALUES('openrouter', 'openai/a', 'openrouter::openai/a', 'A', @nowMs, @nowMs, @nowMs)
    `).run({ nowMs })
    db.prepare(`
      INSERT INTO model_tags(provider_key, model_id, tag_key, tag_label, tag_type, confidence, source, updated_at_ms)
      VALUES('openrouter', 'openai/a', 'tag-a', 'Tag A', 'custom', 1, 'manual', @nowMs)
    `).run({ nowMs })
    db.prepare(`
      INSERT INTO catalog_meta(provider_key, schema_version, data_source, base_url, snapshot_id, last_sync_at_ms, ttl_seconds, sync_state)
      VALUES('openrouter', 1, 'models_user_primary', 'https://openrouter.ai/api/v1', 'legacy-snapshot', @nowMs, 3600, 'ok')
    `).run({ nowMs })
    db.prepare(`
      INSERT INTO endpoint_meta(provider_key, base_url, model_id, endpoint_key, fetched_at_ms, updated_at_ms)
      VALUES('openrouter', 'https://openrouter.ai/api/v1', 'openai/a', 'endpoint-a', @nowMs, @nowMs)
    `).run({ nowMs })
    db.prepare(`
      INSERT INTO reasoning_model_index(model_id, name, status, last_synced_snapshot, created_at_ms, updated_at_ms)
      VALUES('openai/a', 'A', 'visible', 'legacy-snapshot', @nowMs, @nowMs)
    `).run({ nowMs })
  }

  it('clears only deprecated OpenRouter catalog cache tables and preserves core user data', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new ModelCatalogRepo(db)
    seedDeprecatedCatalogAndCoreSentinels(db)

    const result = repo.clearDeprecatedOpenRouterCatalogCache()

    expect(result.deletedScopeCount).toBe(0)
    expect(result.deleted).toMatchObject({
      endpoint_meta: 1,
      model_tags: 1,
      models: 1,
      providers: 1,
      model_catalog: 1,
      reasoning_model_index: 1,
    })
    expect(count(db, "SELECT COUNT(1) AS count FROM model_catalog WHERE router_source = 'openrouter'")).toBe(0)
    expect(count(db, "SELECT COUNT(1) AS count FROM models WHERE provider_key = 'openrouter'")).toBe(0)
    expect(count(db, "SELECT COUNT(1) AS count FROM catalog_meta WHERE provider_key = 'openrouter'")).toBe(0)
    expect(count(db, "SELECT COUNT(1) AS count FROM providers WHERE provider_key = 'openrouter'")).toBe(0)
    expect(count(db, "SELECT COUNT(1) AS count FROM reasoning_model_index WHERE model_id = 'openai/a'")).toBe(0)
    expect(count(db, "SELECT COUNT(1) AS count FROM project WHERE id = 'project-1'")).toBe(1)
    expect(count(db, "SELECT COUNT(1) AS count FROM settings_kv WHERE key = 'setting-1'")).toBe(1)
    expect(count(db, "SELECT COUNT(1) AS count FROM model_favorites WHERE model_key = 'openrouter::openai/a'")).toBe(1)
    expect(count(db, "SELECT COUNT(1) AS count FROM model_recents WHERE model_key = 'openrouter::openai/a'")).toBe(1)
    expect(count(db, "SELECT COUNT(1) AS count FROM usage_log WHERE id = 'usage-1'")).toBe(1)
  })
})
