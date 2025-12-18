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

