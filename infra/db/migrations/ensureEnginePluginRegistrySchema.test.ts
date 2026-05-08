import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { canOpenBetterSqliteForSuite } from '../../testUtils/betterSqliteGate'
import { ensureEnginePluginRegistrySchema } from './ensureEnginePluginRegistrySchema'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('ensureEnginePluginRegistrySchema') ? describe : describe.skip

describeIfBetterSqlite('ensureEnginePluginRegistrySchema', () => {
  it('creates engine plugin registry table and indexes idempotently', () => {
    const db = new BetterSqlite3(':memory:')

    ensureEnginePluginRegistrySchema(db)
    ensureEnginePluginRegistrySchema(db)

    const table = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name = 'engine_plugin_registry'
      LIMIT 1
    `).get() as { name?: string } | undefined
    expect(table?.name).toBe('engine_plugin_registry')

    const columns = db.prepare(`PRAGMA table_info(engine_plugin_registry)`).all() as Array<{ name: string }>
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'engine_id',
      'display_name',
      'plugin_version',
      'manifest_schema_version',
      'manifest_hash',
      'runtime_kind',
      'model_version',
      'install_state',
      'enabled',
      'health_status',
      'failure_reason',
      'install_source',
      'install_root_kind',
      'install_ref',
      'installed_at',
      'updated_at',
      'last_verified_at',
      'last_health_check_at',
      'metadata_json',
    ]))

    const indexes = db.prepare(`PRAGMA index_list(engine_plugin_registry)`).all() as Array<{ name: string }>
    expect(indexes.map((row) => row.name)).toEqual(expect.arrayContaining([
      'idx_engine_plugin_registry_state',
      'idx_engine_plugin_registry_enabled',
      'idx_engine_plugin_registry_health',
    ]))
  })

  it('adds missing compatibility columns for legacy table shape', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE engine_plugin_registry (
        engine_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        plugin_version TEXT NOT NULL,
        manifest_schema_version TEXT NOT NULL,
        manifest_hash TEXT NOT NULL,
        runtime_kind TEXT NOT NULL
      );
    `)

    ensureEnginePluginRegistrySchema(db)

    const columns = db.prepare(`PRAGMA table_info(engine_plugin_registry)`).all() as Array<{ name: string }>
    const names = columns.map((column) => column.name)
    expect(names).toEqual(expect.arrayContaining([
      'install_state',
      'enabled',
      'health_status',
      'install_source',
      'install_root_kind',
      'install_ref',
      'updated_at',
      'metadata_json',
    ]))
  })
})
