-- Generation Compiler V2 immutable document-format-conversion facts. Epoch-2 only.
-- The composer retains its raw source revision as the UI anchor. A selected output
-- is a separate immutable revision and is never substituted at send time.
CREATE TABLE IF NOT EXISTS dfc_conversion_output_v2 (
  derived_asset_revision_id TEXT PRIMARY KEY
    REFERENCES asset_revision_v2(asset_revision_id) ON DELETE RESTRICT,
  source_asset_revision_id TEXT NOT NULL
    REFERENCES asset_revision_v2(asset_revision_id) ON DELETE RESTRICT,
  target_kind TEXT NOT NULL CHECK (target_kind IN (
    'plain_text', 'markdown', 'code', 'table_markdown', 'pdf_attachment'
  )),
  converter_contract_id TEXT NOT NULL CHECK (length(converter_contract_id) BETWEEN 1 AND 512),
  converter_revision TEXT NOT NULL CHECK (length(converter_revision) BETWEEN 1 AND 512),
  conversion_settings_digest TEXT NOT NULL CHECK (
    length(conversion_settings_digest) = 64
    AND conversion_settings_digest NOT GLOB '*[^0-9a-f]*'
  ),
  warnings_json TEXT NOT NULL CHECK (json_valid(warnings_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (source_asset_revision_id, target_kind, converter_contract_id, converter_revision, conversion_settings_digest)
);

CREATE TRIGGER IF NOT EXISTS trg_dfc_conversion_output_v2_derived_revision_guard
BEFORE INSERT ON dfc_conversion_output_v2
WHEN NOT EXISTS (
  SELECT 1 FROM asset_revision_v2
  WHERE asset_revision_id = NEW.derived_asset_revision_id
    AND revision_kind = 'derived'
)
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_DFC_OUTPUT_NOT_DERIVED'); END;

CREATE TRIGGER IF NOT EXISTS trg_dfc_conversion_output_v2_parent_guard
BEFORE INSERT ON dfc_conversion_output_v2
WHEN NOT EXISTS (
  SELECT 1 FROM asset_revision_v2
  WHERE asset_revision_id = NEW.derived_asset_revision_id
    AND parent_asset_revision_id = NEW.source_asset_revision_id
)
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_DFC_OUTPUT_PARENT_MISMATCH'); END;

CREATE TRIGGER IF NOT EXISTS trg_dfc_conversion_output_v2_immutable_update
BEFORE UPDATE ON dfc_conversion_output_v2
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_DFC_OUTPUT_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS trg_dfc_conversion_output_v2_immutable_delete
BEFORE DELETE ON dfc_conversion_output_v2
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_DFC_OUTPUT_IMMUTABLE'); END;

CREATE TABLE IF NOT EXISTS composer_draft_dfc_selection_v2 (
  conversation_id TEXT NOT NULL REFERENCES composer_draft_v2(conversation_id) ON DELETE CASCADE,
  source_asset_revision_id TEXT NOT NULL
    REFERENCES asset_revision_v2(asset_revision_id) ON DELETE RESTRICT,
  selected_option_id TEXT NOT NULL CHECK (length(selected_option_id) BETWEEN 1 AND 512),
  target_kind TEXT NOT NULL CHECK (target_kind IN (
    'original_file', 'plain_text', 'markdown', 'code', 'table_markdown', 'pdf_attachment'
  )),
  send_strategy TEXT NOT NULL CHECK (send_strategy IN ('text_in_prompt', 'file_attachment')),
  effective_asset_id TEXT NOT NULL REFERENCES file_asset_v2(asset_id) ON DELETE RESTRICT,
  effective_asset_revision_id TEXT NOT NULL
    REFERENCES asset_revision_v2(asset_revision_id) ON DELETE RESTRICT,
  effective_asset_sha256 TEXT NOT NULL CHECK (
    length(effective_asset_sha256) = 64 AND effective_asset_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  selected_at_ms INTEGER NOT NULL CHECK (selected_at_ms >= 0),
  PRIMARY KEY (conversation_id, source_asset_revision_id),
  UNIQUE (conversation_id, source_asset_revision_id, selected_option_id),
  CHECK (
    (target_kind = 'original_file' AND send_strategy = 'file_attachment'
      AND effective_asset_revision_id = source_asset_revision_id)
    OR
    (target_kind IN ('plain_text', 'markdown', 'code', 'table_markdown')
      AND send_strategy = 'text_in_prompt'
      AND effective_asset_revision_id <> source_asset_revision_id)
    OR
    (target_kind = 'pdf_attachment' AND send_strategy = 'file_attachment'
      AND effective_asset_revision_id <> source_asset_revision_id)
  )
);

CREATE TRIGGER IF NOT EXISTS trg_composer_draft_dfc_selection_v2_effective_fact_guard
BEFORE INSERT ON composer_draft_dfc_selection_v2
WHEN NOT EXISTS (
  SELECT 1 FROM asset_revision_v2 AS revision
  JOIN file_blob_v2 AS blob ON blob.blob_id = revision.blob_id
  WHERE revision.asset_revision_id = NEW.effective_asset_revision_id
    AND revision.asset_id = NEW.effective_asset_id
    AND blob.sha256 = NEW.effective_asset_sha256
)
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_DFC_SELECTION_EFFECTIVE_FACT_INVALID'); END;

CREATE TRIGGER IF NOT EXISTS trg_composer_draft_dfc_selection_v2_source_anchor_guard
BEFORE INSERT ON composer_draft_dfc_selection_v2
WHEN NOT EXISTS (
  SELECT 1 FROM composer_draft_attachment_v2
  WHERE conversation_id = NEW.conversation_id
    AND attachment_kind = 'managed_file'
    AND asset_revision_id = NEW.source_asset_revision_id
)
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_DFC_SELECTION_SOURCE_NOT_IN_DRAFT'); END;

CREATE TRIGGER IF NOT EXISTS trg_composer_draft_dfc_selection_v2_effective_fact_update_guard
BEFORE UPDATE ON composer_draft_dfc_selection_v2
WHEN NOT EXISTS (
  SELECT 1 FROM asset_revision_v2 AS revision
  JOIN file_blob_v2 AS blob ON blob.blob_id = revision.blob_id
  WHERE revision.asset_revision_id = NEW.effective_asset_revision_id
    AND revision.asset_id = NEW.effective_asset_id
    AND blob.sha256 = NEW.effective_asset_sha256
)
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_DFC_SELECTION_EFFECTIVE_FACT_INVALID'); END;

CREATE TRIGGER IF NOT EXISTS trg_composer_draft_dfc_selection_v2_source_anchor_update_guard
BEFORE UPDATE ON composer_draft_dfc_selection_v2
WHEN NOT EXISTS (
  SELECT 1 FROM composer_draft_attachment_v2
  WHERE conversation_id = NEW.conversation_id
    AND attachment_kind = 'managed_file'
    AND asset_revision_id = NEW.source_asset_revision_id
)
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_DFC_SELECTION_SOURCE_NOT_IN_DRAFT'); END;

CREATE INDEX IF NOT EXISTS idx_dfc_conversion_output_v2_source
  ON dfc_conversion_output_v2(source_asset_revision_id, target_kind, created_at_ms);
