-- Generation Compiler V2 conversation route preference authority. Epoch-2 starverse.db only.
CREATE TABLE IF NOT EXISTS conversation_route_preference_v2 (
  conversation_id TEXT PRIMARY KEY
    REFERENCES conversation_v2(conversation_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  selection_kind TEXT NOT NULL CHECK (
    selection_kind IN ('provider_model', 'openai_chat_compatible')
  ),
  selection_json TEXT NOT NULL CHECK (
    length(CAST(selection_json AS BLOB)) BETWEEN 1 AND 65536
    AND json_valid(selection_json)
    AND json_extract(selection_json, '$.schemaVersion') = 1
    AND json_extract(selection_json, '$.kind') = selection_kind
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms)
);

CREATE TRIGGER IF NOT EXISTS trg_conversation_route_preference_v2_update_guard
BEFORE UPDATE ON conversation_route_preference_v2
WHEN NEW.conversation_id <> OLD.conversation_id
  OR NEW.created_at_ms <> OLD.created_at_ms
  OR NEW.revision <> OLD.revision + 1
  OR NEW.updated_at_ms < OLD.updated_at_ms
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_UPDATE_INVALID');
END;
