-- Generation Compiler V2 semantic scope configuration. Epoch-2 starverse.db only.
CREATE TABLE IF NOT EXISTS generation_config_v2 (
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('global', 'project', 'conversation')),
  owner_id TEXT NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 512),
  project_id TEXT REFERENCES project_v2(project_id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversation_v2(conversation_id) ON DELETE CASCADE,
  revision_generation INTEGER NOT NULL CHECK (
    revision_generation BETWEEN 1 AND 9007199254740991
  ),
  config_revision TEXT NOT NULL CHECK (
    config_revision = 'config-v2:' || revision_generation || ':' || semantic_hash
  ),
  semantic_json TEXT NOT NULL CHECK (
    length(CAST(semantic_json AS BLOB)) BETWEEN 1 AND 1048576
  ),
  semantic_hash TEXT NOT NULL CHECK (
    length(semantic_hash) = 64 AND semantic_hash NOT GLOB '*[^0-9a-f]*'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  PRIMARY KEY (owner_kind, owner_id),
  CHECK (
    (owner_kind = 'global' AND owner_id = 'global' AND project_id IS NULL AND conversation_id IS NULL)
    OR (owner_kind = 'project' AND owner_id = project_id AND project_id IS NOT NULL AND conversation_id IS NULL)
    OR (owner_kind = 'conversation' AND owner_id = conversation_id AND project_id IS NULL AND conversation_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_config_v2_project_owner
  ON generation_config_v2(project_id) WHERE owner_kind = 'project';

CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_config_v2_conversation_owner
  ON generation_config_v2(conversation_id) WHERE owner_kind = 'conversation';

INSERT INTO generation_config_v2 (
  owner_kind, owner_id, project_id, conversation_id, revision_generation,
  config_revision, semantic_json, semantic_hash, created_at_ms, updated_at_ms
) VALUES (
  'global', 'global', NULL, NULL, 1,
  'config-v2:1:bafebd36189ad3688b7b3915ea55d461e0bfcfbdde11e54b0a123999fb6be50f',
  '{"schemaVersion":2}',
  'bafebd36189ad3688b7b3915ea55d461e0bfcfbdde11e54b0a123999fb6be50f',
  0, 0
);

CREATE TRIGGER IF NOT EXISTS trg_generation_config_v2_project_insert
AFTER INSERT ON project_v2
BEGIN
  INSERT INTO generation_config_v2 (
    owner_kind, owner_id, project_id, conversation_id, revision_generation,
    config_revision, semantic_json, semantic_hash, created_at_ms, updated_at_ms
  ) VALUES (
    'project', NEW.project_id, NEW.project_id, NULL, 1,
    'config-v2:1:bafebd36189ad3688b7b3915ea55d461e0bfcfbdde11e54b0a123999fb6be50f',
    '{"schemaVersion":2}',
    'bafebd36189ad3688b7b3915ea55d461e0bfcfbdde11e54b0a123999fb6be50f',
    NEW.created_at_ms, NEW.created_at_ms
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_config_v2_conversation_insert
AFTER INSERT ON conversation_v2
BEGIN
  INSERT INTO generation_config_v2 (
    owner_kind, owner_id, project_id, conversation_id, revision_generation,
    config_revision, semantic_json, semantic_hash, created_at_ms, updated_at_ms
  ) VALUES (
    'conversation', NEW.conversation_id, NULL, NEW.conversation_id, 1,
    'config-v2:1:bafebd36189ad3688b7b3915ea55d461e0bfcfbdde11e54b0a123999fb6be50f',
    '{"schemaVersion":2}',
    'bafebd36189ad3688b7b3915ea55d461e0bfcfbdde11e54b0a123999fb6be50f',
    NEW.created_at_ms, NEW.created_at_ms
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_config_v2_update_guard
BEFORE UPDATE ON generation_config_v2
WHEN NEW.owner_kind <> OLD.owner_kind
  OR NEW.owner_id <> OLD.owner_id
  OR NEW.project_id IS NOT OLD.project_id
  OR NEW.conversation_id IS NOT OLD.conversation_id
  OR NEW.created_at_ms <> OLD.created_at_ms
  OR NEW.revision_generation <> OLD.revision_generation + 1
  OR NEW.semantic_json = OLD.semantic_json
  OR NEW.semantic_hash = OLD.semantic_hash
  OR NEW.updated_at_ms < OLD.updated_at_ms
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_CONFIG_UPDATE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_config_v2_delete_guard
BEFORE DELETE ON generation_config_v2
WHEN OLD.owner_kind = 'global'
  OR (OLD.owner_kind = 'project' AND EXISTS (
    SELECT 1 FROM project_v2 WHERE project_id = OLD.project_id
  ))
  OR (OLD.owner_kind = 'conversation' AND EXISTS (
    SELECT 1 FROM conversation_v2 WHERE conversation_id = OLD.conversation_id
  ))
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_CONFIG_ROW_REQUIRED');
END;
