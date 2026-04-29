import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  CreateMessageAttachmentInput,
  ListMessageAttachmentsByAssetIdInput,
  ListMessageAttachmentsByMessageIdInput,
  MessageAttachmentRecord,
} from '../types'

type SqlDatabase = BetterSqlite3.Database

type MessageAttachmentRow = Readonly<{
  id: string
  message_id: string
  asset_id: string
  ai_payload_kind: MessageAttachmentRecord['aiPayloadKind']
  processing_status: MessageAttachmentRecord['processingStatus']
  include_in_next_request: number
  excluded_reason: string | null
  created_at: number
  updated_at: number
}>

const mapMessageAttachmentRow = (row: MessageAttachmentRow): MessageAttachmentRecord => ({
  id: row.id,
  messageId: row.message_id,
  assetId: row.asset_id,
  aiPayloadKind: row.ai_payload_kind,
  processingStatus: row.processing_status,
  includeInNextRequest: row.include_in_next_request === 1,
  excludedReason: row.excluded_reason ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export class MessageAttachmentRepo {
  private insertStmt: BetterSqlite3.Statement
  private listByMessageStmt: BetterSqlite3.Statement
  private listByAssetStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO message_attachments(
        id,
        message_id,
        asset_id,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @messageId,
        @assetId,
        @aiPayloadKind,
        @processingStatus,
        @includeInNextRequest,
        @excludedReason,
        @createdAt,
        @updatedAt
      )
    `)

    this.listByMessageStmt = this.db.prepare(`
      SELECT *
      FROM message_attachments
      WHERE message_id = @messageId
      ORDER BY created_at ASC
    `)

    this.listByAssetStmt = this.db.prepare(`
      SELECT *
      FROM message_attachments
      WHERE asset_id = @assetId
      ORDER BY created_at ASC
    `)
  }

  create(input: CreateMessageAttachmentInput): MessageAttachmentRecord {
    const now = Date.now()
    const createdAt = input.createdAt ?? now
    const updatedAt = input.updatedAt ?? createdAt
    const row: MessageAttachmentRecord = {
      id: input.id ?? randomUUID(),
      messageId: requireNonEmpty(input.messageId, 'messageId'),
      assetId: requireNonEmpty(input.assetId, 'assetId'),
      aiPayloadKind: input.aiPayloadKind,
      processingStatus: input.processingStatus,
      includeInNextRequest: input.includeInNextRequest ?? true,
      excludedReason: normalizeNullable(input.excludedReason),
      createdAt,
      updatedAt,
    }

    this.insertStmt.run({
      ...row,
      includeInNextRequest: row.includeInNextRequest ? 1 : 0,
    })
    return row
  }

  listByMessageId(input: ListMessageAttachmentsByMessageIdInput): MessageAttachmentRecord[] {
    const messageId = requireNonEmpty(input.messageId, 'messageId')
    return (this.listByMessageStmt.all({ messageId }) as MessageAttachmentRow[]).map(mapMessageAttachmentRow)
  }

  listByAssetId(input: ListMessageAttachmentsByAssetIdInput): MessageAttachmentRecord[] {
    const assetId = requireNonEmpty(input.assetId, 'assetId')
    return (this.listByAssetStmt.all({ assetId }) as MessageAttachmentRow[]).map(mapMessageAttachmentRow)
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

