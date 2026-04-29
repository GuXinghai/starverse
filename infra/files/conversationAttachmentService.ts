import type BetterSqlite3 from 'better-sqlite3'
import type { FileAssetRepo } from '../db/repo/fileAssetRepo'
import type { MessageRepo } from '../db/repo/messageRepo'
import type { MessageAttachmentRepo } from '../db/repo/messageAttachmentRepo'
import type { BranchRepo } from '../db/repo/branchRepo'
import { ConversationDraftRepo } from '../db/repo/conversationDraftRepo'
import { inferFileProfile } from '../../src/shared/files/fileRules'
import type {
  AddDraftAttachmentInput,
  AssetAttachmentOwnership,
  AttachmentCandidateSnapshot,
  AttachmentLifecycleStatus,
  AttachmentOwnerKind,
  AttachmentSnapshotItem,
  AttachDraftToMessageInput,
  AttachDraftToMessageResult,
  CloneMessageAttachmentsToDraftInput,
  CommitDraftToUserMessageInput,
  CommitDraftToUserMessageResult,
  ConversationDraftRecord,
  DetachMessageAttachmentInput,
  DraftAttachmentRecord,
  GetAssetAttachmentOwnershipInput,
  GetAttachmentCandidateSnapshotInput,
  MarkAttachmentAbandonedInput,
  MessageAttachmentRecord,
  RemoveDraftAttachmentInput,
  RestoreConversationDraftInput,
  UpdateConversationDraftTextInput,
  UpdateDraftAttachmentSettingsInput,
} from '../db/types'

type SqlDatabase = BetterSqlite3.Database

type AssetProfileRow = Readonly<{
  id: string
  filename: string
  extension: string | null
  mime: string | null
  source_kind: AttachmentSnapshotItem['sourceKind']
  storage_backend: AttachmentSnapshotItem['storageBackend']
  ingest_status: string
  deleted_at: number | null
}>

type MessageBodyRow = Readonly<{
  id: string
  convo_id: string
  role: string
  body: string | null
}>

type LifecycleRow = Readonly<{
  owner_kind: AttachmentOwnerKind
  lifecycle_status: AttachmentLifecycleStatus
  reason: string | null
  updated_at: number
}>

export type ConversationAttachmentServiceDeps = Readonly<{
  db: SqlDatabase
  fileAssetRepo: FileAssetRepo
  messageRepo: MessageRepo
  messageAttachmentRepo: MessageAttachmentRepo
  branchRepo?: BranchRepo
  draftRepo?: ConversationDraftRepo
  now?: () => number
}>

export class ConversationAttachmentService {
  private readonly draftRepo: ConversationDraftRepo
  private readonly now: () => number

  constructor(private readonly deps: ConversationAttachmentServiceDeps) {
    this.draftRepo = deps.draftRepo ?? new ConversationDraftRepo(deps.db)
    this.now = deps.now ?? Date.now
  }

  restoreDraft(input: RestoreConversationDraftInput): ConversationDraftRecord {
    return this.draftRepo.getOrCreate(input.conversationId, this.now())
  }

  updateDraftText(input: UpdateConversationDraftTextInput): ConversationDraftRecord {
    return this.draftRepo.updateText({ ...input, updatedAt: input.updatedAt ?? this.now() })
  }

  addDraftAttachment(input: AddDraftAttachmentInput): DraftAttachmentRecord {
    const asset = this.requireAsset(input.assetId)
    const profile = inferFileProfile({
      filename: asset.filename,
      extension: asset.extension,
      mimeType: asset.mime,
    })
    const attachment = this.draftRepo.addAttachment({
      ...input,
      aiPayloadKind: profile.aiPayloadKind,
      processingStatus: profile.processingStatus,
      createdAt: input.createdAt ?? this.now(),
      updatedAt: input.updatedAt ?? this.now(),
    })
    this.clearLifecycleMark(input.assetId)
    return attachment
  }

  updateDraftAttachmentSettings(input: UpdateDraftAttachmentSettingsInput): DraftAttachmentRecord | null {
    const updated = this.draftRepo.updateAttachmentSettings({
      ...input,
      updatedAt: input.updatedAt ?? this.now(),
    })
    return updated
  }

  removeDraftAttachment(input: RemoveDraftAttachmentInput): { ok: true; removed: boolean; ownership: AssetAttachmentOwnership } {
    const removed = this.draftRepo.removeAttachment(input)
    if (removed) this.markDetachedIfUnowned(input.assetId, input.updatedAt ?? this.now(), 'removed_from_draft')
    return {
      ok: true,
      removed,
      ownership: this.getAssetOwnership({ assetId: input.assetId }),
    }
  }

  commitDraftToUserMessage(input: CommitDraftToUserMessageInput): CommitDraftToUserMessageResult {
    const txn = this.deps.db.transaction(() => {
      const draft = this.draftRepo.getOrCreate(input.conversationId, input.createdAt ?? this.now())
      const migration = this.resolveDraftAttachmentMigration(draft.attachments, input.sentAssetIds)
      const message = this.deps.messageRepo.append({
        convoId: input.conversationId,
        role: 'user',
        body: input.body ?? draft.draftText,
        createdAt: input.createdAt,
        meta: input.meta ?? null,
      })
      const attachments = migration.included.map((attachment) => this.createMessageAttachmentFromDraft(message.id, attachment))
      const cleared = this.draftRepo.clear(input.conversationId, this.now())
      for (const attachment of attachments) this.clearLifecycleMark(attachment.assetId)
      for (const skippedAssetId of migration.skippedAssetIds) {
        this.markDetachedIfUnowned(skippedAssetId, this.now(), 'not_sent_in_transaction')
      }
      return { message, attachments, draft: cleared }
    })
    return txn()
  }

  attachDraftToMessage(input: AttachDraftToMessageInput): AttachDraftToMessageResult {
    const txn = this.deps.db.transaction(() => {
      const conversationId = requireNonEmpty(input.conversationId, 'conversationId')
      const messageId = requireNonEmpty(input.messageId, 'messageId')
      const message = this.requireUserMessage(messageId)
      if (message.convo_id !== conversationId) {
        throw new Error('draft attachments can only migrate to a user message in the same conversation')
      }
      const draft = this.draftRepo.getOrCreate(conversationId, input.updatedAt ?? this.now())
      const migration = this.resolveDraftAttachmentMigration(draft.attachments, input.sentAssetIds)
      const attachments = migration.included.map((attachment) => this.createMessageAttachmentFromDraft(messageId, attachment))
      const cleared = this.draftRepo.clear(conversationId, input.updatedAt ?? this.now())
      for (const attachment of attachments) this.clearLifecycleMark(attachment.assetId)
      for (const skippedAssetId of migration.skippedAssetIds) {
        this.markDetachedIfUnowned(skippedAssetId, this.now(), 'not_sent_in_transaction')
      }
      return { messageId, attachments, draft: cleared }
    })
    return txn()
  }

  listMessageAttachments(messageId: string): MessageAttachmentRecord[] {
    return this.deps.messageAttachmentRepo.listByMessageId({ messageId })
  }

  detachMessageAttachment(input: DetachMessageAttachmentInput): { ok: true; detached: boolean; ownership: AssetAttachmentOwnership } {
    const messageId = requireNonEmpty(input.messageId, 'messageId')
    const assetId = requireNonEmpty(input.assetId, 'assetId')
    const result = this.deps.db.prepare(`
      DELETE FROM message_attachments
      WHERE message_id = @messageId
        AND asset_id = @assetId
    `).run({ messageId, assetId })
    const detached = Number(result.changes ?? 0) > 0
    if (detached) this.markDetachedIfUnowned(assetId, input.updatedAt ?? this.now(), input.reason ?? 'detached_from_message')
    return { ok: true, detached, ownership: this.getAssetOwnership({ assetId }) }
  }

  cloneMessageToDraft(input: CloneMessageAttachmentsToDraftInput): ConversationDraftRecord {
    const message = this.requireUserMessage(input.sourceMessageId)
    if (message.convo_id !== input.conversationId) throw new Error('source message does not belong to conversation')
    const attachments = this.listMessageAttachments(input.sourceMessageId).map((attachment) => ({
      conversationId: input.conversationId,
      assetId: attachment.assetId,
      attachmentOrder: 0,
      includeInNextRequest: attachment.includeInNextRequest,
      excludedReason: attachment.excludedReason,
      aiPayloadKind: attachment.aiPayloadKind,
      processingStatus: attachment.processingStatus,
    }))
    return this.draftRepo.replace({
      conversationId: input.conversationId,
      draftText: message.body ?? '',
      draftMode: 'edit',
      editingSourceMessageId: input.sourceMessageId,
      attachments,
      updatedAt: input.updatedAt ?? this.now(),
    })
  }

  getResendAttachmentDefaults(messageId: string): MessageAttachmentRecord[] {
    return this.listMessageAttachments(messageId)
  }

  markAssetAbandoned(input: MarkAttachmentAbandonedInput): AssetAttachmentOwnership {
    const assetId = requireNonEmpty(input.assetId, 'assetId')
    this.upsertLifecycleMark(assetId, 'abandoned', 'abandoned', input.reason ?? 'explicitly_abandoned', input.updatedAt ?? this.now())
    return this.getAssetOwnership({ assetId })
  }

  getAssetOwnership(input: GetAssetAttachmentOwnershipInput): AssetAttachmentOwnership {
    const assetId = requireNonEmpty(input.assetId, 'assetId')
    const draftConversationIds = this.listDraftOwners(assetId)
    const messageIds = this.listMessageOwners(assetId)
    const asset = this.deps.fileAssetRepo.getById(assetId)
    const mark = this.getLifecycleMark(assetId)
    if (draftConversationIds.length > 0) {
      return ownership({ assetId, ownerKind: 'draft', lifecycleStatus: 'active', draftConversationIds, messageIds })
    }
    if (messageIds.length > 0) {
      return ownership({ assetId, ownerKind: 'message', lifecycleStatus: 'active', draftConversationIds: [], messageIds })
    }
    if (asset?.deletedAt != null || asset?.ingestStatus === 'deleted') {
      return ownership({
        assetId,
        ownerKind: 'detached',
        lifecycleStatus: 'soft_deleted',
        draftConversationIds: [],
        messageIds: [],
        reason: mark?.reason ?? null,
        updatedAt: mark?.updated_at ?? asset.deletedAt,
      })
    }
    if (mark) {
      return ownership({
        assetId,
        ownerKind: mark.owner_kind,
        lifecycleStatus: mark.lifecycle_status,
        draftConversationIds: [],
        messageIds: [],
        reason: mark.reason,
        updatedAt: mark.updated_at,
      })
    }
    return ownership({ assetId, ownerKind: 'detached', lifecycleStatus: 'detached', draftConversationIds: [], messageIds: [] })
  }

  getCandidateAttachmentSnapshot(input: GetAttachmentCandidateSnapshotInput): AttachmentCandidateSnapshot {
    const messageIds = input.branchId
      ? this.branchMessageIds(input.branchId)
      : normalizeIds(input.messageIds ?? [])
    const rows = this.listAttachmentSnapshotRows(messageIds)
    const items = rows.map(toSnapshotItem)
    return {
      scope: input.branchId ? 'branch' : 'messages',
      messageIds,
      included: items.filter((item) => item.included),
      excluded: items.filter((item) => !item.included),
      items,
    }
  }

  private createMessageAttachmentFromDraft(messageId: string, attachment: DraftAttachmentRecord): MessageAttachmentRecord {
    return this.deps.messageAttachmentRepo.create({
      messageId,
      assetId: attachment.assetId,
      aiPayloadKind: attachment.aiPayloadKind,
      processingStatus: attachment.processingStatus,
      includeInNextRequest: attachment.includeInNextRequest,
      excludedReason: attachment.excludedReason,
      createdAt: attachment.createdAt,
      updatedAt: this.now(),
    })
  }

  private resolveDraftAttachmentMigration(
    attachments: ReadonlyArray<DraftAttachmentRecord>,
    sentAssetIds: ReadonlyArray<string> | undefined
  ): Readonly<{ included: DraftAttachmentRecord[]; skippedAssetIds: string[] }> {
    const allowed = sentAssetIds && sentAssetIds.length > 0
      ? new Set(sentAssetIds.map((id) => String(id ?? '').trim()).filter(Boolean))
      : null
    const included: DraftAttachmentRecord[] = []
    const skippedAssetIds: string[] = []
    for (const attachment of attachments) {
      if (allowed && !allowed.has(attachment.assetId)) {
        skippedAssetIds.push(attachment.assetId)
        continue
      }
      const asset = this.deps.fileAssetRepo.getById(attachment.assetId)
      if (!this.isMessageBindableAsset(asset)) {
        skippedAssetIds.push(attachment.assetId)
        continue
      }
      included.push(attachment)
    }
    return { included, skippedAssetIds: Array.from(new Set(skippedAssetIds)) }
  }

  private isMessageBindableAsset(asset: ReturnType<FileAssetRepo['getById']>): boolean {
    if (!asset) return false
    if (asset.deletedAt != null || asset.ingestStatus === 'deleted') return false
    if (asset.sourceKind === 'derived') return false
    const meta = asset.sourceMetaJson && typeof asset.sourceMetaJson === 'object'
      ? asset.sourceMetaJson as Record<string, unknown>
      : null
    if (meta?.previewOnly === true) return false
    return true
  }

  private requireAsset(assetId: string): AssetProfileRow {
    const id = requireNonEmpty(assetId, 'assetId')
    const row = this.deps.db.prepare(`
      SELECT
        id,
        filename,
        extension,
        mime,
        source_kind,
        storage_backend,
        ingest_status,
        deleted_at
      FROM file_assets
      WHERE id = @id
      LIMIT 1
    `).get({ id }) as AssetProfileRow | undefined
    if (!row) throw new Error(`file asset not found: ${id}`)
    return row
  }

  private requireUserMessage(messageId: string): MessageBodyRow {
    const id = requireNonEmpty(messageId, 'messageId')
    const row = this.deps.db.prepare(`
      SELECT m.id, m.convo_id, m.role, b.body
      FROM message m
      LEFT JOIN message_body b ON b.message_id = m.id
      WHERE m.id = @id
      LIMIT 1
    `).get({ id }) as MessageBodyRow | undefined
    if (!row) throw new Error(`message not found: ${id}`)
    if (row.role !== 'user') throw new Error('only user messages can own file attachments')
    return row
  }

  private branchMessageIds(branchId: string): string[] {
    if (!this.deps.branchRepo) throw new Error('branch repo is required for branch attachment snapshots')
    return this.deps.branchRepo
      .getPathMessages(branchId)
      .filter((message) => message.role === 'user')
      .map((message) => message.id)
  }

  private listAttachmentSnapshotRows(messageIds: string[]): AttachmentSnapshotRow[] {
    if (messageIds.length === 0) return []
    const placeholders = messageIds.map((_, index) => `@id${index}`).join(', ')
    const params = Object.fromEntries(messageIds.map((id, index) => [`id${index}`, id]))
    return this.deps.db.prepare(`
      SELECT
        ma.id AS attachmentId,
        ma.message_id AS messageId,
        ma.asset_id AS assetId,
        ma.ai_payload_kind AS aiPayloadKind,
        ma.processing_status AS processingStatus,
        ma.include_in_next_request AS includeInNextRequest,
        ma.excluded_reason AS excludedReason,
        fa.source_kind AS sourceKind,
        fa.storage_backend AS storageBackend,
        fa.ingest_status AS ingestStatus,
        fa.deleted_at AS deletedAt
      FROM message_attachments ma
      LEFT JOIN file_assets fa ON fa.id = ma.asset_id
      WHERE ma.message_id IN (${placeholders})
      ORDER BY ma.created_at ASC, ma.id ASC
    `).all(params) as AttachmentSnapshotRow[]
  }

  private listDraftOwners(assetId: string): string[] {
    const rows = this.deps.db.prepare(`
      SELECT conversation_id AS conversationId
      FROM draft_attachments
      WHERE asset_id = @assetId
      ORDER BY conversation_id ASC
    `).all({ assetId }) as Array<{ conversationId: string }>
    return rows.map((row) => row.conversationId)
  }

  private listMessageOwners(assetId: string): string[] {
    const rows = this.deps.db.prepare(`
      SELECT message_id AS messageId
      FROM message_attachments
      WHERE asset_id = @assetId
      ORDER BY created_at ASC
    `).all({ assetId }) as Array<{ messageId: string }>
    return rows.map((row) => row.messageId)
  }

  private getLifecycleMark(assetId: string): LifecycleRow | null {
    const row = this.deps.db.prepare(`
      SELECT owner_kind, lifecycle_status, reason, updated_at
      FROM file_attachment_lifecycle
      WHERE asset_id = @assetId
      LIMIT 1
    `).get({ assetId }) as LifecycleRow | undefined
    return row ?? null
  }

  private clearLifecycleMark(assetId: string): void {
    this.deps.db.prepare(`DELETE FROM file_attachment_lifecycle WHERE asset_id = @assetId`).run({ assetId })
  }

  private markDetachedIfUnowned(assetId: string, updatedAt: number, reason: string): void {
    const hasDraft = this.listDraftOwners(assetId).length > 0
    const hasMessage = this.listMessageOwners(assetId).length > 0
    if (!hasDraft && !hasMessage) this.upsertLifecycleMark(assetId, 'detached', 'detached', reason, updatedAt)
  }

  private upsertLifecycleMark(
    assetId: string,
    ownerKind: Extract<AttachmentOwnerKind, 'detached' | 'abandoned'>,
    lifecycleStatus: Extract<AttachmentLifecycleStatus, 'detached' | 'abandoned' | 'soft_deleted'>,
    reason: string,
    updatedAt: number
  ): void {
    this.deps.db.prepare(`
      INSERT INTO file_attachment_lifecycle(asset_id, owner_kind, lifecycle_status, reason, updated_at)
      VALUES (@assetId, @ownerKind, @lifecycleStatus, @reason, @updatedAt)
      ON CONFLICT(asset_id) DO UPDATE SET
        owner_kind = excluded.owner_kind,
        lifecycle_status = excluded.lifecycle_status,
        reason = excluded.reason,
        updated_at = excluded.updated_at
    `).run({ assetId, ownerKind, lifecycleStatus, reason, updatedAt })
  }
}

type AttachmentSnapshotRow = Readonly<{
  attachmentId: string
  messageId: string
  assetId: string
  aiPayloadKind: AttachmentSnapshotItem['aiPayloadKind']
  processingStatus: AttachmentSnapshotItem['processingStatus']
  includeInNextRequest: number
  excludedReason: string | null
  sourceKind: AttachmentSnapshotItem['sourceKind']
  storageBackend: AttachmentSnapshotItem['storageBackend']
  ingestStatus: string | null
  deletedAt: number | null
}>

function toSnapshotItem(row: AttachmentSnapshotRow): AttachmentSnapshotItem {
  const computedReason = computeExcludedReason(row)
  return {
    attachmentId: row.attachmentId,
    messageId: row.messageId,
    assetId: row.assetId,
    aiPayloadKind: row.aiPayloadKind,
    processingStatus: row.processingStatus,
    included: computedReason === null,
    excludedReason: computedReason,
    sourceKind: row.sourceKind ?? null,
    storageBackend: row.storageBackend ?? null,
  }
}

function computeExcludedReason(row: AttachmentSnapshotRow): string | null {
  if (row.deletedAt != null || row.ingestStatus === 'deleted') return 'asset_soft_deleted'
  if (row.includeInNextRequest !== 1) return row.excludedReason ?? 'manually_excluded'
  if (row.processingStatus === 'unsupported') return 'unsupported_processing_status'
  return null
}

function ownership(input: Readonly<{
  assetId: string,
  ownerKind: AttachmentOwnerKind,
  lifecycleStatus: AttachmentLifecycleStatus,
  draftConversationIds: string[],
  messageIds: string[],
  reason?: string | null,
  updatedAt?: number | null
}>): AssetAttachmentOwnership {
  return {
    assetId: input.assetId,
    ownerKind: input.ownerKind,
    lifecycleStatus: input.lifecycleStatus,
    draftConversationIds: input.draftConversationIds,
    messageIds: input.messageIds,
    reason: input.reason ?? null,
    updatedAt: input.updatedAt ?? null,
  }
}

function normalizeIds(ids: ReadonlyArray<string>): string[] {
  return Array.from(new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean)))
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}
