-- Generation Compiler V2 model preference schema.

CREATE TABLE IF NOT EXISTS model_favorites (
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'project', 'conversation')),
  scope_id TEXT NOT NULL DEFAULT '',
  provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
  model_id TEXT NOT NULL CHECK (length(model_id) > 0),
  model_key TEXT NOT NULL CHECK (length(model_key) > 0),
  sort_rank INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (scope_type, scope_id, provider_key, model_id),
  UNIQUE (scope_type, scope_id, model_key),
  CHECK ((scope_type = 'global' AND scope_id = '') OR (scope_type != 'global' AND length(scope_id) > 0)),
  CHECK (instr(model_key, '::') > 0),
  CHECK (model_key = provider_key || '::' || model_id)
);

CREATE TABLE IF NOT EXISTS model_recents (
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'project', 'conversation')),
  scope_id TEXT NOT NULL DEFAULT '',
  provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
  model_id TEXT NOT NULL CHECK (length(model_id) > 0),
  model_key TEXT NOT NULL CHECK (length(model_key) > 0),
  last_used_at_ms INTEGER NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1 CHECK (use_count >= 1),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (scope_type, scope_id, provider_key, model_id),
  UNIQUE (scope_type, scope_id, model_key),
  CHECK ((scope_type = 'global' AND scope_id = '') OR (scope_type != 'global' AND length(scope_id) > 0)),
  CHECK (instr(model_key, '::') > 0),
  CHECK (model_key = provider_key || '::' || model_id)
);

CREATE INDEX IF NOT EXISTS idx_model_favorites_scope_sort
  ON model_favorites(scope_type, scope_id, sort_rank ASC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_favorites_scope_updated
  ON model_favorites(scope_type, scope_id, updated_at_ms DESC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_favorites_model_lookup
  ON model_favorites(provider_key, model_id);
CREATE INDEX IF NOT EXISTS idx_model_favorites_global_sort
  ON model_favorites(sort_rank ASC, model_key ASC)
  WHERE scope_type = 'global' AND scope_id = '';
CREATE INDEX IF NOT EXISTS idx_model_recents_scope_last_used
  ON model_recents(scope_type, scope_id, last_used_at_ms DESC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_recents_scope_use_count
  ON model_recents(scope_type, scope_id, use_count DESC, last_used_at_ms DESC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_recents_model_lookup
  ON model_recents(provider_key, model_id);
CREATE INDEX IF NOT EXISTS idx_model_recents_global_last_used
  ON model_recents(last_used_at_ms DESC, model_key ASC)
  WHERE scope_type = 'global' AND scope_id = '';
