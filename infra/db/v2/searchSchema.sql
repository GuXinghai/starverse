-- Generation Compiler V2 epoch-2 search index. Epoch-2 starverse.db only.
CREATE VIRTUAL TABLE IF NOT EXISTS generation_v2_search_fts USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  project_id UNINDEXED,
  conversation_id UNINDEXED,
  created_at_ms UNINDEXED,
  title,
  body
);

CREATE TRIGGER IF NOT EXISTS trg_generation_v2_search_project_insert
AFTER INSERT ON project_v2
BEGIN
  INSERT INTO generation_v2_search_fts (entity_type, entity_id, project_id, conversation_id, created_at_ms, title, body)
  VALUES ('project', NEW.project_id, NEW.project_id, NULL, NEW.created_at_ms, NEW.name, '');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_v2_search_project_update
AFTER UPDATE OF name ON project_v2
BEGIN
  UPDATE generation_v2_search_fts SET title=NEW.name
  WHERE entity_type='project' AND entity_id=NEW.project_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_v2_search_project_delete
AFTER DELETE ON project_v2
BEGIN
  DELETE FROM generation_v2_search_fts WHERE project_id=OLD.project_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_v2_search_conversation_insert
AFTER INSERT ON conversation_v2
BEGIN
  INSERT INTO generation_v2_search_fts (entity_type, entity_id, project_id, conversation_id, created_at_ms, title, body)
  VALUES ('convo', NEW.conversation_id, NEW.project_id, NEW.conversation_id, NEW.created_at_ms, NEW.title, '');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_v2_search_conversation_update
AFTER UPDATE OF project_id, title ON conversation_v2
BEGIN
  UPDATE generation_v2_search_fts
  SET project_id=NEW.project_id,
      title=CASE WHEN entity_type IN ('convo', 'message') THEN NEW.title ELSE title END
  WHERE conversation_id=NEW.conversation_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_v2_search_conversation_delete
AFTER DELETE ON conversation_v2
BEGIN
  DELETE FROM generation_v2_search_fts WHERE conversation_id=OLD.conversation_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_v2_search_body_insert
AFTER INSERT ON message_body_v2
WHEN EXISTS (SELECT 1 FROM message_v2 WHERE message_id=NEW.message_id AND role IN ('user', 'assistant') AND status='completed')
BEGIN
  INSERT INTO generation_v2_search_fts (entity_type, entity_id, project_id, conversation_id, created_at_ms, title, body)
  SELECT 'message', message.message_id, conversation.project_id, message.conversation_id, message.created_at_ms,
    conversation.title, NEW.body_text
  FROM message_v2 AS message JOIN conversation_v2 AS conversation ON conversation.conversation_id=message.conversation_id
  WHERE message.message_id=NEW.message_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_v2_search_body_update
AFTER UPDATE OF body_text ON message_body_v2
WHEN EXISTS (SELECT 1 FROM message_v2 WHERE message_id=NEW.message_id AND role IN ('user', 'assistant') AND status='completed')
BEGIN
  DELETE FROM generation_v2_search_fts WHERE entity_type='message' AND entity_id=NEW.message_id;
  INSERT INTO generation_v2_search_fts (entity_type, entity_id, project_id, conversation_id, created_at_ms, title, body)
  SELECT 'message', message.message_id, conversation.project_id, message.conversation_id, message.created_at_ms,
    conversation.title, NEW.body_text
  FROM message_v2 AS message JOIN conversation_v2 AS conversation ON conversation.conversation_id=message.conversation_id
  WHERE message.message_id=NEW.message_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_v2_search_message_completed
AFTER UPDATE OF status ON message_v2
WHEN NEW.role IN ('user', 'assistant') AND NEW.status='completed'
BEGIN
  DELETE FROM generation_v2_search_fts WHERE entity_type='message' AND entity_id=NEW.message_id;
  INSERT INTO generation_v2_search_fts (entity_type, entity_id, project_id, conversation_id, created_at_ms, title, body)
  SELECT 'message', message.message_id, conversation.project_id, message.conversation_id, message.created_at_ms,
    conversation.title, body.body_text
  FROM message_v2 AS message JOIN conversation_v2 AS conversation ON conversation.conversation_id=message.conversation_id
    JOIN message_body_v2 AS body ON body.message_id=message.message_id
  WHERE message.message_id=NEW.message_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_v2_search_message_delete
AFTER DELETE ON message_v2
BEGIN
  DELETE FROM generation_v2_search_fts WHERE entity_type='message' AND entity_id=OLD.message_id;
END;
