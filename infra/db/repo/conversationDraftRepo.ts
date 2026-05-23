import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  AddDraftAttachmentInput,
  ConversationDraftRecord,
  DraftAttachmentRecord,
  DraftMode,
  RemoveDraftAttachmentInput,
  UpdateDraftAttachmentSettingsInput,
  UpdateConversationDraftTextInput,
} from '../types'
import {
  assertDfcBindingRequiresManaged,
  normalizeDfcBindingText,
  parseRequiredDfcSendAssetRefsJson,
  stringifyRequiredDfcSendAssetRefs,
} from './dfcAttachmentBinding'

type SqlDatabase = BetterSqlite3.Database

type DraftRow = Readonly<{
  conversation_id: string
  draft_text: string
  draft_mode: DraftMode
  editing_source_message_id: string | null
  updated_at: number
}>

type DraftAttachmentRow = Readonly<{
  id: string
  conversation_id: string
  asset_id: string
  attachment_order: number
  ai_payload_kind: DraftAttachmentRecord['aiPayloadKind']
  processing_status: DraftAttachmentRecord['processingStatus']
  include_in_next_request: number
  excluded_reason: string | null
  preferred_send_mode: DraftAttachmentRecord['preferredSendMode']
  url_retention_mode: DraftAttachmentRecord['urlRetentionMode']
  dfc_managed: number
  selected_option_id: string | null
  selected_asset_refs_json: string | null
  created_at: number
  updated_at: number
}>

const mapAttachmentRow = (row: DraftAttachmentRow): DraftAttachmentRecord => {
  const dfcManaged = row.dfc_managed === 1
  return {
    id: row.id,
    conversationId: row.conversation_id,
    assetId: row.asset_id,
    attachmentOrder: row.attachment_order,
    aiPayloadKind: row.ai_payload_kind,
    processingStatus: row.processing_status,
    includeInNextRequest: row.include_in_next_request === 1,
    excludedReason: row.excluded_reason ?? null,
    preferredSendMode: dfcManaged ? null : row.preferred_send_mode ?? null,
    urlRetentionMode: dfcManaged ? null : row.url_retention_mode ?? null,
    dfcManaged,
    selectedOptionId: dfcManaged ? row.selected_option_id ?? null : null,
    selectedAssetRefs: dfcManaged ? parseRequiredDfcSendAssetRefsJson(row.selected_asset_refs_json) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class ConversationDraftRepo {
  private upsertDraftStmt: BetterSqlite3.Statement
  private getDraftStmt: BetterSqlite3.Statement
  private listAttachmentsStmt: BetterSqlite3.Statement
  private nextOrderStmt: BetterSqlite3.Statement
  private insertAttachmentStmt: BetterSqlite3.Statement
  private updateAttachmentSettingsStmt: BetterSqlite3.Statement
  private deleteAttachmentStmt: BetterSqlite3.Statement
  private clearAttachmentsStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.upsertDraftStmt = this.db.prepare(`
      INSERT INTO conversation_drafts(
        conversation_id,
        draft_text,
        draft_mode,
        editing_source_message_id,
        updated_at
      )
      VALUES (
        @conversationId,
        @draftText,
        @draftMode,
        @editingSourceMessageId,
        @updatedAt
      )
      ON CONFLICT(conversation_id) DO UPDATE SET
        draft_text = excluded.draft_text,
        draft_mode = excluded.draft_mode,
        editing_source_message_id = excluded.editing_source_message_id,
        updated_at = excluded.updated_at
    `)

    this.getDraftStmt = this.db.prepare(`
      SELECT *
      FROM conversation_drafts
      WHERE conversation_id = @conversationId
      LIMIT 1
    `)

    this.listAttachmentsStmt = this.db.prepare(`
      SELECT *
      FROM draft_attachments
      WHERE conversation_id = @conversationId
      ORDER BY attachment_order ASC, created_at ASC
    `)

    this.nextOrderStmt = this.db.prepare(`
      SELECT COALESCE(MAX(attachment_order), -1) + 1 AS nextOrder
      FROM draft_attachments
      WHERE conversation_id = @conversationId
    `)

    this.insertAttachmentStmt = this.db.prepare(`
      INSERT INTO draft_attachments(
        id,
        conversation_id,
        asset_id,
        attachment_order,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        preferred_send_mode,
        url_retention_mode,
        dfc_managed,
        selected_option_id,
        selected_asset_refs_json,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @conversationId,
        @assetId,
        @attachmentOrder,
        @aiPayloadKind,
        @processingStatus,
        @includeInNextRequest,
        @excludedReason,
        @preferredSendMode,
        @urlRetentionMode,
        @dfcManaged,
        @selectedOptionId,
        @selectedAssetRefsJson,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(conversation_id, asset_id) DO UPDATE SET
        include_in_next_request = excluded.include_in_next_request,
        excluded_reason = excluded.excluded_reason,
        preferred_send_mode = excluded.preferred_send_mode,
        url_retention_mode = excluded.url_retention_mode,
        dfc_managed = excluded.dfc_managed,
        selected_option_id = excluded.selected_option_id,
        selected_asset_refs_json = excluded.selected_asset_refs_json,
        updated_at = excluded.updated_at
    `)

    this.updateAttachmentSettingsStmt = this.db.prepare(`
      UPDATE draft_attachments
      SET preferred_send_mode = @preferredSendMode,
          url_retention_mode = @urlRetentionMode,
          dfc_managed = @dfcManaged,
          selected_option_id = @selectedOptionId,
          selected_asset_refs_json = @selectedAssetRefsJson,
          updated_at = @updatedAt
      WHERE conversation_id = @conversationId
        AND asset_id = @assetId
    `)

    this.deleteAttachmentStmt = this.db.prepare(`
      DELETE FROM draft_attachments
      WHERE conversation_id = @conversationId
        AND asset_id = @assetId
    `)

    this.clearAttachmentsStmt = this.db.prepare(`
      DELETE FROM draft_attachments
      WHERE conversation_id = @conversationId
    `)
  }

  getOrCreate(conversationId: string, now = Date.now()): ConversationDraftRecord {
    const existing = this.get(conversationId)
    if (existing) return existing
    this.updateText({ conversationId, draftText: '', draftMode: 'compose', editingSourceMessageId: null, updatedAt: now })
    return this.get(conversationId) as ConversationDraftRecord
  }

  get(conversationId: string): ConversationDraftRecord | null {
    const id = requireNonEmpty(conversationId, 'conversationId')
    const row = this.getDraftStmt.get({ conversationId: id }) as DraftRow | undefined
    if (!row) return null
    const attachments = this.listAttachments(id)
    return {
      conversationId: row.conversation_id,
      draftText: row.draft_text,
      draftMode: row.draft_mode,
      editingSourceMessageId: row.editing_source_message_id ?? null,
      attachedAssetIds: attachments.map((attachment) => attachment.assetId),
      attachments,
      updatedAt: row.updated_at,
    }
  }

  updateText(input: UpdateConversationDraftTextInput): ConversationDraftRecord {
    const now = input.updatedAt ?? Date.now()
    this.upsertDraftStmt.run({
      conversationId: requireNonEmpty(input.conversationId, 'conversationId'),
      draftText: String(input.draftText ?? ''),
      draftMode: input.draftMode ?? 'compose',
      editingSourceMessageId: normalizeNullable(input.editingSourceMessageId),
      updatedAt: now,
    })
    return this.get(input.conversationId) as ConversationDraftRecord
  }

  addAttachment(input: AddDraftAttachmentInput & Pick<DraftAttachmentRecord, 'aiPayloadKind' | 'processingStatus'>): DraftAttachmentRecord {
    const conversationId = requireNonEmpty(input.conversationId, 'conversationId')
    const now = input.updatedAt ?? input.createdAt ?? Date.now()
    const order = input.attachmentOrder ?? this.nextAttachmentOrder(conversationId)
    const dfcManaged = input.dfcManaged === true
    assertDfcBindingRequiresManaged(dfcManaged, {
      selectedOptionId: input.selectedOptionId,
      selectedAssetRefs: input.selectedAssetRefs,
    }, 'draft')
    this.getOrCreate(conversationId, now)
    this.insertAttachmentStmt.run({
      id: randomUUID(),
      conversationId,
      assetId: requireNonEmpty(input.assetId, 'assetId'),
      attachmentOrder: order,
      aiPayloadKind: input.aiPayloadKind,
      processingStatus: input.processingStatus,
      includeInNextRequest: (input.includeInNextRequest ?? true) ? 1 : 0,
      excludedReason: normalizeNullable(input.excludedReason),
      preferredSendMode: dfcManaged ? null : normalizeNullable(input.preferredSendMode),
      urlRetentionMode: dfcManaged ? null : normalizeNullable(input.urlRetentionMode),
      dfcManaged: dfcManaged ? 1 : 0,
      selectedOptionId: dfcManaged ? normalizeDfcBindingText(input.selectedOptionId) : null,
      selectedAssetRefsJson: dfcManaged ? stringifyRequiredDfcSendAssetRefs(input.selectedAssetRefs) : null,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    })
    return this.listAttachments(conversationId).find((attachment) => attachment.assetId === input.assetId) as DraftAttachmentRecord
  }

  updateAttachmentSettings(input: UpdateDraftAttachmentSettingsInput): DraftAttachmentRecord | null {
    const conversationId = requireNonEmpty(input.conversationId, 'conversationId')
    const assetId = requireNonEmpty(input.assetId, 'assetId')
    const existing = this.listAttachments(conversationId).find((attachment) => attachment.assetId === assetId)
    if (!existing) return null
    const updatedAt = input.updatedAt ?? Date.now()
    const dfcManaged = input.dfcManaged !== undefined ? input.dfcManaged === true : existing.dfcManaged
    assertDfcBindingRequiresManaged(dfcManaged, {
      selectedOptionId: input.selectedOptionId,
      selectedAssetRefs: input.selectedAssetRefs,
    }, 'draft')
    const preferredSendMode =
      dfcManaged ? null : input.preferredSendMode !== undefined ? normalizeNullable(input.preferredSendMode) : existing.preferredSendMode
    const urlRetentionMode =
      dfcManaged ? null : input.urlRetentionMode !== undefined ? normalizeNullable(input.urlRetentionMode) : existing.urlRetentionMode
    const selectedOptionId = dfcManaged
      ? input.selectedOptionId !== undefined ? normalizeDfcBindingText(input.selectedOptionId) : existing.selectedOptionId
      : null
    const selectedAssetRefsJson = dfcManaged
      ? stringifyRequiredDfcSendAssetRefs(input.selectedAssetRefs !== undefined ? input.selectedAssetRefs : existing.selectedAssetRefs)
      : null
    this.updateAttachmentSettingsStmt.run({
      conversationId,
      assetId,
      preferredSendMode,
      urlRetentionMode,
      dfcManaged: dfcManaged ? 1 : 0,
      selectedOptionId,
      selectedAssetRefsJson,
      updatedAt,
    })
    return this.listAttachments(conversationId).find((attachment) => attachment.assetId === assetId) as DraftAttachmentRecord
  }

  removeAttachment(input: RemoveDraftAttachmentInput): boolean {
    const result = this.deleteAttachmentStmt.run({
      conversationId: requireNonEmpty(input.conversationId, 'conversationId'),
      assetId: requireNonEmpty(input.assetId, 'assetId'),
    })
    return Number(result.changes ?? 0) > 0
  }

  clear(conversationId: string, updatedAt = Date.now()): ConversationDraftRecord {
    const id = requireNonEmpty(conversationId, 'conversationId')
    this.clearAttachmentsStmt.run({ conversationId: id })
    return this.updateText({ conversationId: id, draftText: '', draftMode: 'compose', editingSourceMessageId: null, updatedAt })
  }

  replace(input: Readonly<{
    conversationId: string
    draftText: string
    draftMode: DraftMode
    editingSourceMessageId: string | null
    attachments: Array<AddDraftAttachmentInput & Pick<DraftAttachmentRecord, 'aiPayloadKind' | 'processingStatus'>>
    updatedAt?: number
  }>): ConversationDraftRecord {
    const now = input.updatedAt ?? Date.now()
    const conversationId = requireNonEmpty(input.conversationId, 'conversationId')
    this.clearAttachmentsStmt.run({ conversationId })
    this.updateText({
      conversationId,
      draftText: input.draftText,
      draftMode: input.draftMode,
      editingSourceMessageId: input.editingSourceMessageId,
      updatedAt: now,
    })
    input.attachments.forEach((attachment, index) => {
      this.addAttachment({ ...attachment, conversationId, attachmentOrder: index, createdAt: now, updatedAt: now })
    })
    return this.get(conversationId) as ConversationDraftRecord
  }

  listAttachments(conversationId: string): DraftAttachmentRecord[] {
    const id = requireNonEmpty(conversationId, 'conversationId')
    return (this.listAttachmentsStmt.all({ conversationId: id }) as DraftAttachmentRow[]).map(mapAttachmentRow)
  }

  private nextAttachmentOrder(conversationId: string): number {
    const row = this.nextOrderStmt.get({ conversationId }) as { nextOrder?: number } | undefined
    return Number(row?.nextOrder ?? 0)
  }
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}
