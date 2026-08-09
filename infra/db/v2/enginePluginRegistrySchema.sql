-- Generation Compiler V2: epoch-owned engine-plugin registry.
-- This schema is created only in the fresh epoch-2 database. It never reads,
-- migrates, or shares the legacy chat.db registry.
CREATE TABLE IF NOT EXISTS engine_plugin_registry (
  engine_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  plugin_version TEXT NOT NULL,
  manifest_schema_version TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  runtime_kind TEXT NOT NULL,
  model_version TEXT,
  install_state TEXT NOT NULL DEFAULT 'installed' CHECK (install_state IN ('installed', 'failed', 'uninstalled', 'update_available')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  health_status TEXT NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'unhealthy')),
  failure_reason TEXT,
  install_source TEXT NOT NULL DEFAULT 'official_catalog' CHECK (install_source IN ('official_catalog', 'local_package')),
  install_root_kind TEXT NOT NULL CHECK (install_root_kind IN ('managed_root', 'managed_cache', 'test_root')),
  install_ref TEXT NOT NULL,
  installed_at INTEGER,
  updated_at INTEGER NOT NULL,
  last_verified_at INTEGER,
  last_health_check_at INTEGER,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_engine_plugin_registry_state ON engine_plugin_registry(install_state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_plugin_registry_enabled ON engine_plugin_registry(enabled, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_plugin_registry_health ON engine_plugin_registry(health_status, updated_at DESC);
