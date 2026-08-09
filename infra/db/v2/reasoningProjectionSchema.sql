-- Generation Compiler V2 persisted renderer reasoning projection. Provider-native artifacts remain continuation truth.
CREATE TABLE IF NOT EXISTS answer_reasoning_detail_v2 (
  answer_root_id TEXT NOT NULL REFERENCES message_v2(message_id) ON DELETE CASCADE,
  detail_index INTEGER NOT NULL CHECK (detail_index BETWEEN 0 AND 65535),
  detail_json TEXT NOT NULL CHECK (
    length(CAST(detail_json AS BLOB)) BETWEEN 2 AND 1048576
    AND json_valid(detail_json)
    AND json_type(detail_json) = 'object'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (answer_root_id, detail_index)
);

CREATE TRIGGER IF NOT EXISTS trg_answer_reasoning_detail_v2_validate_answer
AFTER INSERT ON answer_reasoning_detail_v2
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2
    WHERE message_id=NEW.answer_root_id AND role='assistant'
      AND answer_root_id=message_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_REASONING_PROJECTION_ANSWER_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_answer_reasoning_detail_v2_immutable
BEFORE UPDATE ON answer_reasoning_detail_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_REASONING_PROJECTION_IMMUTABLE');
END;
