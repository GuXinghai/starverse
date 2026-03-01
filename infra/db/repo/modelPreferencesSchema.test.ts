import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function listObjects(db: BetterSqlite3.Database, type: 'table' | 'index') {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = @type ORDER BY name ASC`)
    .all({ type }) as Array<{ name: string }>
}

function explain(db: BetterSqlite3.Database, sql: string, params: Record<string, unknown>) {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(params) as Array<{ detail?: string }>
  return rows.map((row) => String(row.detail ?? '')).join('\n')
}

describe('model preferences schema', () => {
  it('creates favorites/recents tables and required indexes', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)

    const tables = new Set(listObjects(db, 'table').map((row) => row.name))
    const indexes = new Set(listObjects(db, 'index').map((row) => row.name))

    expect(tables.has('model_favorites')).toBe(true)
    expect(tables.has('model_recents')).toBe(true)

    expect(indexes.has('idx_model_favorites_scope_sort')).toBe(true)
    expect(indexes.has('idx_model_favorites_scope_updated')).toBe(true)
    expect(indexes.has('idx_model_favorites_global_sort')).toBe(true)
    expect(indexes.has('idx_model_recents_scope_last_used')).toBe(true)
    expect(indexes.has('idx_model_recents_scope_use_count')).toBe(true)
    expect(indexes.has('idx_model_recents_global_last_used')).toBe(true)
  })

  it('uses scope indexes for favorites and recents list queries', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)

    const now = Date.now()
    const insertFavorite = db.prepare(`
      INSERT INTO model_favorites (
        scope_type,
        scope_id,
        provider_key,
        model_id,
        model_key,
        sort_rank,
        created_at_ms,
        updated_at_ms
      ) VALUES (
        @scopeType,
        @scopeId,
        @providerKey,
        @modelId,
        @modelKey,
        @sortRank,
        @createdAtMs,
        @updatedAtMs
      )
    `)
    const insertRecent = db.prepare(`
      INSERT INTO model_recents (
        scope_type,
        scope_id,
        provider_key,
        model_id,
        model_key,
        last_used_at_ms,
        use_count,
        created_at_ms,
        updated_at_ms
      ) VALUES (
        @scopeType,
        @scopeId,
        @providerKey,
        @modelId,
        @modelKey,
        @lastUsedAtMs,
        @useCount,
        @createdAtMs,
        @updatedAtMs
      )
    `)

    const tx = db.transaction(() => {
      for (let i = 0; i < 200; i += 1) {
        const modelId = `openai/gpt-${i}`
        const modelKey = `openrouter::${modelId}`
        insertFavorite.run({
          scopeType: 'global',
          scopeId: '',
          providerKey: 'openrouter',
          modelId,
          modelKey,
          sortRank: i,
          createdAtMs: now,
          updatedAtMs: now + i,
        })
        insertRecent.run({
          scopeType: 'global',
          scopeId: '',
          providerKey: 'openrouter',
          modelId,
          modelKey,
          lastUsedAtMs: now + 200 - i,
          useCount: (i % 5) + 1,
          createdAtMs: now,
          updatedAtMs: now + i,
        })
      }
    })
    tx()

    const favoritesPlan = explain(
      db,
      `
        SELECT model_key
        FROM model_favorites
        WHERE scope_type = @scopeType AND scope_id = @scopeId
        ORDER BY sort_rank ASC, model_key ASC
        LIMIT 20
      `,
      { scopeType: 'global', scopeId: '' }
    )

    const recentsPlan = explain(
      db,
      `
        SELECT model_key
        FROM model_recents
        WHERE scope_type = @scopeType AND scope_id = @scopeId
        ORDER BY last_used_at_ms DESC, model_key ASC
        LIMIT 20
      `,
      { scopeType: 'global', scopeId: '' }
    )

    expect(favoritesPlan).toMatch(/idx_model_favorites_scope_sort|idx_model_favorites_global_sort/)
    expect(recentsPlan).toMatch(/idx_model_recents_scope_last_used|idx_model_recents_global_last_used/)
  })

  it('enforces model_key format and scope/scope_id coupling checks', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const now = Date.now()

    expect(() =>
      db
        .prepare(
          `
            INSERT INTO model_favorites (
              scope_type,
              scope_id,
              provider_key,
              model_id,
              model_key,
              sort_rank,
              created_at_ms,
              updated_at_ms
            ) VALUES (
              'global',
              '',
              'openrouter',
              'openai/gpt-4o',
              'invalid-model-key-without-delimiter',
              0,
              @createdAtMs,
              @updatedAtMs
            )
          `
        )
        .run({ createdAtMs: now, updatedAtMs: now })
    ).toThrow()

    expect(() =>
      db
        .prepare(
          `
            INSERT INTO model_recents (
              scope_type,
              scope_id,
              provider_key,
              model_id,
              model_key,
              last_used_at_ms,
              use_count,
              created_at_ms,
              updated_at_ms
            ) VALUES (
              'global',
              'unexpected-scope-id',
              'openrouter',
              'openai/gpt-4o',
              'openrouter::openai/gpt-4o',
              @lastUsedAtMs,
              1,
              @createdAtMs,
              @updatedAtMs
            )
          `
        )
        .run({ lastUsedAtMs: now, createdAtMs: now, updatedAtMs: now })
    ).toThrow()
  })
})
