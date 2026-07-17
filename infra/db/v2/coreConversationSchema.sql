-- Generation Compiler V2 core conversation graph. Epoch-2 starverse.db only.
CREATE TABLE IF NOT EXISTS project_v2 (
  project_id TEXT PRIMARY KEY CHECK (length(project_id) BETWEEN 1 AND 512),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 4096),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms)
);

CREATE TABLE IF NOT EXISTS conversation_v2 (
  conversation_id TEXT PRIMARY KEY CHECK (length(conversation_id) BETWEEN 1 AND 512),
  project_id TEXT NOT NULL REFERENCES project_v2(project_id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) <= 16384),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms)
);

CREATE INDEX IF NOT EXISTS idx_conversation_v2_project
  ON conversation_v2(project_id, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS message_v2 (
  message_id TEXT PRIMARY KEY CHECK (length(message_id) BETWEEN 1 AND 512),
  conversation_id TEXT NOT NULL REFERENCES conversation_v2(conversation_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  status TEXT NOT NULL CHECK (status IN ('streaming', 'completed', 'failed', 'cancelled')),
  parent_message_id TEXT,
  question_id TEXT,
  answer_root_id TEXT,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0 AND ordinal <= 9007199254740991),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  UNIQUE (message_id, conversation_id),
  UNIQUE (conversation_id, ordinal),
  FOREIGN KEY (parent_message_id, conversation_id)
    REFERENCES message_v2(message_id, conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, conversation_id)
    REFERENCES message_v2(message_id, conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (answer_root_id, conversation_id)
    REFERENCES message_v2(message_id, conversation_id) ON DELETE CASCADE,
  CHECK (parent_message_id IS NULL OR parent_message_id <> message_id),
  CHECK (question_id IS NULL OR question_id <> message_id),
  CHECK (
    (role = 'system' AND status = 'completed' AND parent_message_id IS NULL AND question_id IS NULL AND answer_root_id IS NULL)
    OR (role = 'user' AND status = 'completed' AND question_id IS NULL AND answer_root_id IS NULL)
    OR (role = 'assistant' AND parent_message_id IS NOT NULL AND question_id IS NOT NULL AND answer_root_id IS NOT NULL)
    OR (role = 'tool' AND status IN ('completed', 'failed') AND parent_message_id IS NOT NULL AND question_id IS NOT NULL AND answer_root_id IS NOT NULL AND answer_root_id <> message_id)
  ),
  CHECK (role = 'assistant' OR answer_root_id IS NULL OR answer_root_id <> message_id),
  CHECK (role <> 'assistant' OR answer_root_id <> message_id OR parent_message_id = question_id)
);

CREATE INDEX IF NOT EXISTS idx_message_v2_parent
  ON message_v2(conversation_id, parent_message_id);
CREATE INDEX IF NOT EXISTS idx_message_v2_answer_group
  ON message_v2(conversation_id, question_id, answer_root_id, ordinal);

CREATE TABLE IF NOT EXISTS message_body_v2 (
  message_id TEXT PRIMARY KEY REFERENCES message_v2(message_id) ON DELETE CASCADE,
  body_text TEXT NOT NULL CHECK (length(CAST(body_text AS BLOB)) <= 20971520)
);

CREATE TRIGGER IF NOT EXISTS trg_message_v2_create_body
AFTER INSERT ON message_v2
BEGIN
  INSERT INTO message_body_v2 (message_id, body_text) VALUES (NEW.message_id, '');
END;

CREATE TRIGGER IF NOT EXISTS trg_message_body_v2_reject_direct_delete
BEFORE DELETE ON message_body_v2
WHEN EXISTS (SELECT 1 FROM message_v2 WHERE message_id = OLD.message_id)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_GRAPH_MESSAGE_BODY_REQUIRED');
END;

CREATE TRIGGER IF NOT EXISTS trg_message_v2_validate_graph_insert
AFTER INSERT ON message_v2
BEGIN
  SELECT CASE WHEN NEW.question_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM message_v2 AS question
    WHERE question.message_id = NEW.question_id
      AND question.conversation_id = NEW.conversation_id
      AND question.role = 'user'
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_QUESTION_INVALID') END;

  SELECT CASE WHEN NEW.answer_root_id IS NOT NULL AND NEW.answer_root_id <> NEW.message_id AND NOT EXISTS (
    SELECT 1 FROM message_v2 AS root
    WHERE root.message_id = NEW.answer_root_id
      AND root.conversation_id = NEW.conversation_id
      AND root.role = 'assistant'
      AND root.answer_root_id = root.message_id
      AND root.question_id = NEW.question_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_ANSWER_ROOT_INVALID') END;

  SELECT CASE WHEN NEW.answer_root_id = NEW.message_id AND NOT (
    NEW.role = 'assistant' AND NEW.parent_message_id = NEW.question_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_ANSWER_ROOT_INVALID') END;

  SELECT CASE WHEN NEW.answer_root_id IS NOT NULL AND NEW.answer_root_id <> NEW.message_id AND NOT EXISTS (
    SELECT 1 FROM message_v2 AS parent
    WHERE parent.message_id = NEW.parent_message_id
      AND parent.conversation_id = NEW.conversation_id
      AND parent.answer_root_id = NEW.answer_root_id
      AND parent.question_id = NEW.question_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_PARENT_GROUP_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_message_v2_structure_immutable
BEFORE UPDATE OF message_id, conversation_id, role, parent_message_id, question_id, answer_root_id, ordinal, created_at_ms
ON message_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_GRAPH_MESSAGE_STRUCTURE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_message_v2_status_transition
BEFORE UPDATE OF status ON message_v2
WHEN NOT (
  OLD.status = NEW.status
  OR (OLD.status = 'streaming' AND NEW.status IN ('completed', 'failed', 'cancelled'))
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_GRAPH_STATUS_TRANSITION_INVALID');
END;

CREATE TABLE IF NOT EXISTS branch_v2 (
  branch_id TEXT PRIMARY KEY CHECK (length(branch_id) BETWEEN 1 AND 512),
  conversation_id TEXT NOT NULL REFERENCES conversation_v2(conversation_id) ON DELETE CASCADE,
  head_message_id TEXT REFERENCES message_v2(message_id) ON DELETE SET NULL,
  name TEXT CHECK (name IS NULL OR length(name) <= 4096),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= created_at_ms),
  UNIQUE (branch_id, conversation_id)
);

CREATE TRIGGER IF NOT EXISTS trg_branch_v2_validate_head_insert
AFTER INSERT ON branch_v2
WHEN NEW.head_message_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2 AS head
    WHERE head.message_id = NEW.head_message_id AND head.conversation_id = NEW.conversation_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_BRANCH_HEAD_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_branch_v2_validate_head_update
AFTER UPDATE OF head_message_id, conversation_id ON branch_v2
WHEN NEW.head_message_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2 AS head
    WHERE head.message_id = NEW.head_message_id AND head.conversation_id = NEW.conversation_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_BRANCH_HEAD_INVALID') END;
END;

CREATE TABLE IF NOT EXISTS branch_choice_v2 (
  branch_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  chosen_answer_root_id TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  PRIMARY KEY (branch_id, question_id),
  FOREIGN KEY (branch_id, conversation_id)
    REFERENCES branch_v2(branch_id, conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, conversation_id)
    REFERENCES message_v2(message_id, conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (chosen_answer_root_id, conversation_id)
    REFERENCES message_v2(message_id, conversation_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS branch_answer_hide_v2 (
  branch_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_root_id TEXT NOT NULL,
  hidden_at_ms INTEGER NOT NULL CHECK (hidden_at_ms >= 0),
  PRIMARY KEY (branch_id, question_id, answer_root_id),
  FOREIGN KEY (branch_id, conversation_id)
    REFERENCES branch_v2(branch_id, conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, conversation_id)
    REFERENCES message_v2(message_id, conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (answer_root_id, conversation_id)
    REFERENCES message_v2(message_id, conversation_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS branch_question_hide_v2 (
  branch_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  hidden_at_ms INTEGER NOT NULL CHECK (hidden_at_ms >= 0),
  PRIMARY KEY (branch_id, question_id),
  FOREIGN KEY (branch_id, conversation_id)
    REFERENCES branch_v2(branch_id, conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, conversation_id)
    REFERENCES message_v2(message_id, conversation_id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS trg_branch_choice_v2_validate_insert
AFTER INSERT ON branch_choice_v2
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2 AS answer
    WHERE answer.message_id = NEW.chosen_answer_root_id
      AND answer.conversation_id = NEW.conversation_id
      AND answer.role = 'assistant'
      AND answer.answer_root_id = answer.message_id
      AND answer.question_id = NEW.question_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_CHOICE_INVALID') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM branch_answer_hide_v2 AS hidden
    WHERE hidden.branch_id = NEW.branch_id
      AND hidden.question_id = NEW.question_id
      AND hidden.answer_root_id = NEW.chosen_answer_root_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_CHOICE_HIDDEN') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_branch_choice_v2_validate_update
AFTER UPDATE OF chosen_answer_root_id ON branch_choice_v2
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2 AS answer
    WHERE answer.message_id = NEW.chosen_answer_root_id
      AND answer.conversation_id = NEW.conversation_id
      AND answer.role = 'assistant'
      AND answer.answer_root_id = answer.message_id
      AND answer.question_id = NEW.question_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_CHOICE_INVALID') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM branch_answer_hide_v2 AS hidden
    WHERE hidden.branch_id = NEW.branch_id
      AND hidden.question_id = NEW.question_id
      AND hidden.answer_root_id = NEW.chosen_answer_root_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_CHOICE_HIDDEN') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_branch_choice_v2_structure_immutable
BEFORE UPDATE OF branch_id, conversation_id, question_id ON branch_choice_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_GRAPH_CHOICE_STRUCTURE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_branch_answer_hide_v2_validate_insert
AFTER INSERT ON branch_answer_hide_v2
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2 AS answer
    WHERE answer.message_id = NEW.answer_root_id
      AND answer.conversation_id = NEW.conversation_id
      AND answer.role = 'assistant'
      AND answer.answer_root_id = answer.message_id
      AND answer.question_id = NEW.question_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_HIDE_INVALID') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM branch_choice_v2 AS choice
    WHERE choice.branch_id = NEW.branch_id
      AND choice.question_id = NEW.question_id
      AND choice.chosen_answer_root_id = NEW.answer_root_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_HIDE_CHOSEN') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_branch_answer_hide_v2_structure_immutable
BEFORE UPDATE ON branch_answer_hide_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_GRAPH_HIDE_STRUCTURE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_branch_question_hide_v2_validate_insert
AFTER INSERT ON branch_question_hide_v2
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2 AS question
    WHERE question.message_id = NEW.question_id
      AND question.conversation_id = NEW.conversation_id
      AND question.role = 'user'
      AND question.status = 'completed'
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_QUESTION_HIDE_INVALID') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM branch_v2 AS branch
    JOIN message_v2 AS head ON head.message_id = branch.head_message_id
      AND head.conversation_id = branch.conversation_id
    WHERE branch.branch_id = NEW.branch_id
      AND head.question_id = NEW.question_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_GRAPH_QUESTION_HIDE_CURRENT') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_branch_question_hide_v2_structure_immutable
BEFORE UPDATE ON branch_question_hide_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_GRAPH_QUESTION_HIDE_STRUCTURE_IMMUTABLE');
END;
