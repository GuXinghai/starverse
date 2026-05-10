import type BetterSqlite3 from 'better-sqlite3'

type SqlDatabase = BetterSqlite3.Database

const INSTALL_STATE_CHECK = "CHECK (install_state IN ('installed', 'failed', 'uninstalled', 'update_available'))"
const HEALTH_STATUS_CHECK = "CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'unhealthy'))"
const INSTALL_SOURCE_CHECK = "CHECK (install_source IN ('official_catalog', 'local_package'))"
const INSTALL_ROOT_KIND_CHECK = "CHECK (install_root_kind IN ('managed_root', 'managed_cache', 'test_root'))"

export function ensureEnginePluginRegistrySchema(db: SqlDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS engine_plugin_registry (
      engine_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      plugin_version TEXT NOT NULL,
      manifest_schema_version TEXT NOT NULL,
      manifest_hash TEXT NOT NULL,
      runtime_kind TEXT NOT NULL,
      model_version TEXT,
      install_state TEXT NOT NULL DEFAULT 'installed' ${INSTALL_STATE_CHECK},
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      health_status TEXT NOT NULL DEFAULT 'unknown' ${HEALTH_STATUS_CHECK},
      failure_reason TEXT,
      install_source TEXT NOT NULL DEFAULT 'official_catalog' ${INSTALL_SOURCE_CHECK},
      install_root_kind TEXT NOT NULL ${INSTALL_ROOT_KIND_CHECK},
      install_ref TEXT NOT NULL,
      installed_at INTEGER,
      updated_at INTEGER NOT NULL,
      last_verified_at INTEGER,
      last_health_check_at INTEGER,
      metadata_json TEXT
    );
  `)

  ensureEnginePluginRegistryCompatibility(db)
  ensureEnginePluginRegistryIndexes(db)
}

function ensureEnginePluginRegistryCompatibility(db: SqlDatabase): void {
  const columns = listColumns(db, 'engine_plugin_registry')
  if (columns.size === 0) return

  ensureColumn(db, columns, 'model_version', 'TEXT')
  ensureColumn(db, columns, 'install_state', `TEXT NOT NULL DEFAULT 'installed' ${INSTALL_STATE_CHECK}`)
  ensureColumn(db, columns, 'enabled', "INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))")
  ensureColumn(db, columns, 'health_status', `TEXT NOT NULL DEFAULT 'unknown' ${HEALTH_STATUS_CHECK}`)
  ensureColumn(db, columns, 'failure_reason', 'TEXT')
  ensureColumn(db, columns, 'install_source', `TEXT NOT NULL DEFAULT 'official_catalog' ${INSTALL_SOURCE_CHECK}`)
  ensureColumn(db, columns, 'install_root_kind', `TEXT NOT NULL DEFAULT 'managed_root' ${INSTALL_ROOT_KIND_CHECK}`)
  ensureColumn(db, columns, 'install_ref', "TEXT NOT NULL DEFAULT 'unknown_ref'")
  ensureColumn(db, columns, 'installed_at', 'INTEGER')
  ensureColumn(db, columns, 'updated_at', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, columns, 'last_verified_at', 'INTEGER')
  ensureColumn(db, columns, 'last_health_check_at', 'INTEGER')
  ensureColumn(db, columns, 'metadata_json', 'TEXT')
}

function listColumns(db: SqlDatabase, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

function ensureColumn(db: SqlDatabase, existingColumns: Set<string>, name: string, definition: string): void {
  if (existingColumns.has(name)) return
  db.exec(`ALTER TABLE engine_plugin_registry ADD COLUMN ${name} ${definition}`)
  existingColumns.add(name)
}

function ensureEnginePluginRegistryIndexes(db: SqlDatabase): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_engine_plugin_registry_state ON engine_plugin_registry(install_state, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_engine_plugin_registry_enabled ON engine_plugin_registry(enabled, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_engine_plugin_registry_health ON engine_plugin_registry(health_status, updated_at DESC);
  `)
}
