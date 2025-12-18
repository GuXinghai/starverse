import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ReasoningModelIndexRepo } from './reasoningModelIndexRepo'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function insertCatalogRow(db: BetterSqlite3.Database, row: {
  modelId: string
  name: string
  isHidden: 0 | 1
  supportedParameters: string[]
  lastSeenSnapshotId: string
}) {
  db.prepare(
    `
    INSERT INTO model_catalog (
      model_id,
      router_source,
      vendor,
      name,
      description,
      context_length,
      supported_parameters_json,
      raw_json,
      last_seen_snapshot_id,
      is_hidden,
      created_at_ms,
      updated_at_ms
    ) VALUES (
      @modelId,
      'openrouter',
      'openai',
      @name,
      NULL,
      -1,
      @supportedParametersJson,
      NULL,
      @lastSeenSnapshotId,
      @isHidden,
      1,
      1
    )
  `
  ).run({
    modelId: row.modelId,
    name: row.name,
    isHidden: row.isHidden,
    supportedParametersJson: JSON.stringify(row.supportedParameters),
    lastSeenSnapshotId: row.lastSeenSnapshotId,
  })
}

describe('ReasoningModelIndexRepo.syncFromCatalog', () => {
  it('catalog reasoning=1 model enters index', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)

    insertCatalogRow(db, {
      modelId: 'openai/gpt-4o',
      name: 'GPT-4o',
      isHidden: 0,
      supportedParameters: ['reasoning', 'tools'],
      lastSeenSnapshotId: '0001',
    })
    insertCatalogRow(db, {
      modelId: 'openai/gpt-4o-mini',
      name: 'GPT-4o mini',
      isHidden: 0,
      supportedParameters: ['tools'],
      lastSeenSnapshotId: '0001',
    })

    const repo = new ReasoningModelIndexRepo(db)
    const result = repo.syncFromCatalog('openrouter')
    expect(result.snapshotId).toBe('0001')

    const rows = repo.listAll()
    expect(rows.map((r) => r.modelId)).toEqual(['openai/gpt-4o'])
    expect(rows[0].status).toBe('visible')
    expect(rows[0].lastSyncedSnapshot).toBe('0001')
  })

  it('catalog hidden reasoning model still enters index with status=hidden', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)

    insertCatalogRow(db, {
      modelId: 'openai/gpt-4o',
      name: 'GPT-4o',
      isHidden: 1,
      supportedParameters: ['reasoning'],
      lastSeenSnapshotId: '0001',
    })

    const repo = new ReasoningModelIndexRepo(db)
    repo.syncFromCatalog('openrouter')

    const rows = repo.listAll()
    expect(rows.length).toBe(1)
    expect(rows[0].modelId).toBe('openai/gpt-4o')
    expect(rows[0].status).toBe('hidden')
  })

  it('when a model stops being reasoning-capable, index marks it hidden (never deletes)', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)

    insertCatalogRow(db, {
      modelId: 'openai/gpt-4o',
      name: 'GPT-4o',
      isHidden: 0,
      supportedParameters: ['reasoning'],
      lastSeenSnapshotId: '0001',
    })

    const repo = new ReasoningModelIndexRepo(db)
    repo.syncFromCatalog('openrouter')
    expect(repo.listAll()[0].status).toBe('visible')

    // Newer successful snapshot exists in catalog, but this model no longer includes 'reasoning'.
    db.prepare(
      `
      UPDATE model_catalog
      SET supported_parameters_json = @sp,
          last_seen_snapshot_id = @snapshot,
          updated_at_ms = 2
      WHERE model_id = @id
    `
    ).run({
      id: 'openai/gpt-4o',
      sp: JSON.stringify(['tools']),
      snapshot: '0002',
    })

    const result = repo.syncFromCatalog('openrouter')
    expect(result.snapshotId).toBe('0002')

    const rows = repo.listAll()
    expect(rows.length).toBe(1)
    expect(rows[0].status).toBe('hidden')
    expect(rows[0].lastSyncedSnapshot).toBe('0002')
  })
})

