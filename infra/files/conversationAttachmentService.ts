import type BetterSqlite3 from 'better-sqlite3'
import { readFile } from 'node:fs/promises'
import type { FileAssetRepo } from '../db/repo/fileAssetRepo'
import type { MessageRepo } from '../db/repo/messageRepo'
import type { MessageAttachmentRepo } from '../db/repo/messageAttachmentRepo'
import type { BranchRepo } from '../db/repo/branchRepo'
import { ConversationDraftRepo } from '../db/repo/conversationDraftRepo'
import { resolveManagedStoragePath } from '../../src/shared/files/localStorageResolver'
import {
  normalizeDfcSendStrategy,
  normalizeDfcSendAssetRefs,
  normalizeDfcTargetKind,
  parseDfcSendAssetRefsJson,
  parseRequiredDfcSendAssetRefsJson,
} from '../db/repo/dfcAttachmentBinding'
import { inferFileProfile } from '../../src/shared/files/fileRules'
import type {
  DfcAttachmentSendSnapshot,
  DfcConversionOption,
  DfcConversionOptionStatus,
  DfcDerivedTargetKind,
  DfcDraftAttachmentOptionsDto,
  DfcDraftAttachmentPreviewDto,
  DfcDraftAttachmentPreviewPayloadDto,
  DfcDraftAttachmentPreviewStatus,
  DfcDraftOptionCandidateDto,
  DfcManagedAttachmentDecision,
  DfcSanitizedDiagnostic,
  DfcSendAssetRef,
  DfcTargetKind,
} from '../../src/shared/files/documentFormatConversion'
import {
  createDfcDerivedAssetFacade,
  createDfcDerivedAssetOption,
  createDfcOriginalFileOption,
  resolveDfcManagedAttachment,
} from '../../src/shared/files/documentFormatConversion'
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
  FileAssetRecord,
  FileDerivativeRecord,
  GetAssetAttachmentOwnershipInput,
  GetAttachmentCandidateSnapshotInput,
  GetDfcDraftAttachmentOptionsInput,
  GetDfcDraftAttachmentOptionsResult,
  GetDfcDraftAttachmentPreviewInput,
  GetDfcDraftAttachmentPreviewResult,
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

type FileDerivativeCandidateRow = Readonly<{
  id: string
  parentAssetId: string
  derivedKind: FileDerivativeRecord['derivedKind']
  mime: string | null
  storageUri: string
  generator: string
  status: FileDerivativeRecord['status']
  metaJson: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}>

type DfcPreviewSource = Readonly<{
  derivativeId: string
  storageUri: string
  mime: string | null
  status: FileDerivativeRecord['status']
  generator: string | null
  metaJson: Record<string, unknown> | null
  deletedAt: number | null
}>

export type ConversationAttachmentServiceDeps = Readonly<{
  db: SqlDatabase
  fileAssetRepo: FileAssetRepo
  messageRepo: MessageRepo
  messageAttachmentRepo: MessageAttachmentRepo
  branchRepo?: BranchRepo
  draftRepo?: ConversationDraftRepo
  storageRootDir?: string
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

  getDfcDraftAttachmentOptions(input: GetDfcDraftAttachmentOptionsInput): GetDfcDraftAttachmentOptionsResult {
    const conversationId = requireNonEmpty(input.conversationId, 'conversationId')
    const assetId = requireNonEmpty(input.assetId, 'assetId')
    const draft = this.draftRepo.getOrCreate(conversationId, this.now())
    const attachment = draft.attachments.find((item) => item.assetId === assetId)
    if (!attachment) throw new Error(`draft attachment not found: ${assetId}`)
    return this.buildDfcDraftAttachmentOptions(conversationId, attachment)
  }

  async getDfcDraftAttachmentPreview(input: GetDfcDraftAttachmentPreviewInput): Promise<GetDfcDraftAttachmentPreviewResult> {
    const conversationId = requireNonEmpty(input.conversationId, 'conversationId')
    const assetId = requireNonEmpty(input.assetId, 'assetId')
    const draft = this.draftRepo.getOrCreate(conversationId, this.now())
    const attachment = draft.attachments.find((item) => item.assetId === assetId)
    if (!attachment) throw new Error(`draft attachment not found: ${assetId}`)
    return await this.buildDfcDraftAttachmentPreview(conversationId, attachment, input.maxCharacters)
  }

  updateDraftAttachmentSettings(input: UpdateDraftAttachmentSettingsInput): DraftAttachmentRecord | null {
    const normalized = this.normalizeDraftAttachmentSettingsUpdate(input)
    if (!normalized) return null
    const updated = this.draftRepo.updateAttachmentSettings({
      ...normalized,
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
      const snapshotMap = this.createDfcSnapshotMap(input.dfcAttachmentSendSnapshots)
      const message = this.deps.messageRepo.append({
        convoId: input.conversationId,
        role: 'user',
        body: input.body ?? draft.draftText,
        createdAt: input.createdAt,
        meta: input.meta ?? null,
      })
      const attachments = migration.included.map((attachment) =>
        this.createMessageAttachmentFromDraft(message.id, attachment, snapshotMap.get(attachment.id), input.dfcAttachmentSendSnapshots !== undefined)
      )
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
      const snapshotMap = this.createDfcSnapshotMap(input.dfcAttachmentSendSnapshots)
      const attachments = migration.included.map((attachment) =>
        this.createMessageAttachmentFromDraft(messageId, attachment, snapshotMap.get(attachment.id), input.dfcAttachmentSendSnapshots !== undefined)
      )
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
      dfcManaged: attachment.dfcManaged,
      selectedOptionId: attachment.dfcManaged ? attachment.usedOptionId : null,
      selectedAssetRefs: attachment.dfcManaged ? attachment.usedAssetRefs : [],
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

  private normalizeDraftAttachmentSettingsUpdate(input: UpdateDraftAttachmentSettingsInput): UpdateDraftAttachmentSettingsInput | null {
    const conversationId = requireNonEmpty(input.conversationId, 'conversationId')
    const assetId = requireNonEmpty(input.assetId, 'assetId')
    const draft = this.draftRepo.getOrCreate(conversationId, this.now())
    const attachment = draft.attachments.find((item) => item.assetId === assetId)
    if (!attachment) return null
    const dfcManaged = input.dfcManaged !== undefined ? input.dfcManaged === true : attachment.dfcManaged
    const selectedOptionId = input.selectedOptionId !== undefined ? normalizeNullableText(input.selectedOptionId) : attachment.selectedOptionId
    const selectedAssetRefs = input.selectedAssetRefs !== undefined ? normalizeDfcSendAssetRefsForUpdate(input.selectedAssetRefs) : attachment.selectedAssetRefs
    if (!dfcManaged) return input
    this.assertDfcDraftSelectionCoherent(attachment, selectedOptionId, selectedAssetRefs)
    return {
      ...input,
      dfcManaged: true,
      selectedOptionId,
      selectedAssetRefs,
    }
  }

  private assertDfcDraftSelectionCoherent(
    attachment: DraftAttachmentRecord,
    selectedOptionId: string | null,
    selectedAssetRefs: readonly DfcSendAssetRef[]
  ): void {
    if (!selectedOptionId) {
      if (selectedAssetRefs.length > 0) {
        throw new Error(`DFC selectedAssetRefs require selectedOptionId for draft attachment: ${attachment.id}`)
      }
      return
    }
    if (selectedAssetRefs.length === 0) {
      throw new Error(`DFC selectedOptionId requires selectedAssetRefs for draft attachment: ${attachment.id}`)
    }
    const asset = this.requireFileAssetRecord(attachment.assetId)
    const options = this.buildDfcOptionCandidates(attachment, asset)
    const option = options.find((item) => item.optionId === selectedOptionId)
    if (!option) throw new Error(`DFC selected option is not available for draft attachment: ${attachment.id}`)
    if (!dfcSendAssetRefsEqual(option.sendAssetRefs, selectedAssetRefs)) {
      throw new Error(`DFC selected option refs do not match selectedAssetRefs for draft attachment: ${attachment.id}`)
    }
    const decision = resolveDfcManagedAttachment({
      dfcManaged: true,
      rawFileId: attachment.assetId,
      selectedOptionId,
      options,
      availableRawFileIds: this.isDfcRawFileAvailable(asset) ? [asset.id] : [],
      availableDerivedAssetIds: options.flatMap((candidate) =>
        candidate.isAvailable ? candidate.sendAssetRefs.filter((ref) => ref.kind === 'derived_asset').map((ref) => ref.assetId) : []
      ),
      optionGenerationState: null,
    })
    if (decision.reasonCode === 'send_asset_ref_kind_mismatch'
      || decision.reasonCode === 'raw_file_ref_missing'
      || decision.reasonCode === 'derived_asset_ref_missing') {
      throw new Error(`DFC selected option is not coherent for draft attachment: ${attachment.id}`)
    }
  }

  private buildDfcDraftAttachmentOptions(
    conversationId: string,
    attachment: DraftAttachmentRecord
  ): DfcDraftAttachmentOptionsDto {
    const asset = this.requireFileAssetRecord(attachment.assetId)
    const options = this.buildDfcOptionCandidates(attachment, asset)
    const decision = this.resolveDfcDraftDecision(attachment, asset, options)
    return {
      attachmentId: attachment.id,
      conversationId,
      rawFileId: attachment.assetId,
      filename: asset.filename,
      sizeBytes: asset.sizeBytes,
      dfcManaged: attachment.dfcManaged,
      selectedOptionId: attachment.dfcManaged ? attachment.selectedOptionId : null,
      selectedAssetRefs: attachment.dfcManaged ? [...attachment.selectedAssetRefs] : [],
      decision,
      options: options.map((option) => this.toDfcDraftOptionCandidateDto(option)),
    }
  }

  private async buildDfcDraftAttachmentPreview(
    conversationId: string,
    attachment: DraftAttachmentRecord,
    requestedMaxCharacters: number | undefined
  ): Promise<DfcDraftAttachmentPreviewDto> {
    const asset = this.requireFileAssetRecord(attachment.assetId)
    const options = this.buildDfcOptionCandidates(attachment, asset)
    const decision = this.resolveDfcDraftDecision(attachment, asset, options)
    const maxCharacters = normalizeDfcPreviewMaxCharacters(requestedMaxCharacters)
    const mismatchDiagnostic = this.dfcPersistedSelectionMismatchDiagnostic(attachment, decision)
    const preview = mismatchDiagnostic
      ? dfcPreviewPayload({
        kind: 'none',
        status: 'blocked',
        maxCharacters,
        diagnostics: [mismatchDiagnostic],
      })
      : await this.resolveSelectedDfcPreview({
        attachment,
        rawAsset: asset,
        decision,
        maxCharacters,
      })
    return {
      attachmentId: attachment.id,
      conversationId,
      rawFileId: attachment.assetId,
      filename: asset.filename,
      sizeBytes: asset.sizeBytes,
      dfcManaged: attachment.dfcManaged,
      selectedOptionId: attachment.dfcManaged ? attachment.selectedOptionId : null,
      selectedAssetRefs: attachment.dfcManaged ? [...attachment.selectedAssetRefs] : [],
      targetKind: decision.targetKind,
      sendStrategy: decision.sendStrategy,
      decision,
      preview,
    }
  }

  private resolveDfcDraftDecision(
    attachment: DraftAttachmentRecord,
    asset: FileAssetRecord,
    options: readonly DfcConversionOption[]
  ): DfcManagedAttachmentDecision {
    return resolveDfcManagedAttachment({
      dfcManaged: true,
      rawFileId: attachment.assetId,
      selectedOptionId: attachment.dfcManaged ? attachment.selectedOptionId : null,
      options,
      availableRawFileIds: this.isDfcRawFileAvailable(asset) ? [asset.id] : [],
      availableDerivedAssetIds: options.flatMap((candidate) =>
        candidate.isAvailable ? candidate.sendAssetRefs.filter((ref) => ref.kind === 'derived_asset').map((ref) => ref.assetId) : []
      ),
      optionGenerationState: null,
    })
  }

  private dfcPersistedSelectionMismatchDiagnostic(
    attachment: DraftAttachmentRecord,
    decision: DfcManagedAttachmentDecision
  ): DfcSanitizedDiagnostic | null {
    if (!attachment.dfcManaged || decision.status !== 'ready') return null
    if (dfcSendAssetRefsEqual(attachment.selectedAssetRefs, decision.sendAssetRefs)) return null
    return dfcDiagnostic('dfc_selection_refs_mismatch', 'Persisted DFC selectedAssetRefs do not match the backend-selected option.')
  }

  private async resolveSelectedDfcPreview(input: Readonly<{
    attachment: DraftAttachmentRecord
    rawAsset: FileAssetRecord
    decision: DfcManagedAttachmentDecision
    maxCharacters: number
  }>): Promise<DfcDraftAttachmentPreviewPayloadDto> {
    const { rawAsset, decision, maxCharacters } = input
    if (decision.status !== 'ready') {
      return dfcPreviewPayload({
        kind: 'none',
        status: dfcPreviewStatusFromDecision(decision.status),
        maxCharacters,
        diagnostics: decision.reasonCode
          ? [dfcDiagnostic(decision.reasonCode, `DFC preview is unavailable: ${decision.reasonCode}`)]
          : [],
      })
    }
    if (decision.targetKind === 'original_file') {
      return dfcPreviewPayload({
        kind: 'raw_file',
        status: 'ready',
        maxCharacters,
        diagnostics: [dfcDiagnostic('dfc_preview_raw_file_metadata_only', 'Original-file preview uses the selected raw_file ref and does not create a DerivedAsset.')],
      })
    }
    if (!decision.targetKind || !isDfcTextPreviewTargetKind(decision.targetKind)) {
      return dfcPreviewPayload({
        kind: 'none',
        status: 'blocked',
        maxCharacters,
        diagnostics: [dfcDiagnostic('dfc_preview_target_not_supported', 'Selected DFC target is not supported by the Phase 1 text preview endpoint.')],
      })
    }
    if (decision.sendStrategy !== 'text_in_prompt') {
      return dfcPreviewPayload({
        kind: 'none',
        status: 'blocked',
        maxCharacters,
        diagnostics: [dfcDiagnostic('dfc_preview_send_strategy_mismatch', 'Selected DFC target is not a text preview/send strategy.')],
      })
    }
    const refs = decision.sendAssetRefs
    if (refs.length !== 1 || refs[0]?.kind !== 'derived_asset') {
      return dfcPreviewPayload({
        kind: 'none',
        status: 'blocked',
        maxCharacters,
        diagnostics: [dfcDiagnostic('dfc_preview_ref_malformed', 'Selected DFC preview requires exactly one derived_asset ref.')],
      })
    }

    const source = this.resolveDfcPreviewSource(rawAsset, refs[0].assetId)
    if (!source) {
      return dfcPreviewPayload({
        kind: 'none',
        status: 'blocked',
        maxCharacters,
        diagnostics: [dfcDiagnostic('dfc_preview_source_not_found', 'Selected DFC derived asset is unavailable for preview.')],
      })
    }
    const facade = createDfcDerivedAssetFacade({
      derivativeId: source.derivativeId,
      sourceFileId: rawAsset.id,
      mime: source.mime,
      storageRef: source.storageUri,
      status: source.status,
      generator: source.generator,
      metaJson: source.metaJson,
    })
    if (!facade.ok) {
      return dfcPreviewPayload({
        kind: 'none',
        status: 'blocked',
        maxCharacters,
        diagnostics: [dfcDiagnostic(facade.reasonCode, `Selected DFC preview asset is malformed: ${facade.reasonCode}`)],
      })
    }
    if (facade.asset.targetKind !== decision.targetKind) {
      return dfcPreviewPayload({
        kind: 'none',
        status: 'blocked',
        maxCharacters,
        diagnostics: [dfcDiagnostic('dfc_preview_target_mismatch', 'Selected DFC preview target does not match the selected option.')],
      })
    }
    if (facade.asset.usage !== 'preview_and_send') {
      return dfcPreviewPayload({
        kind: 'none',
        status: 'blocked',
        maxCharacters,
        diagnostics: [dfcDiagnostic('dfc_preview_usage_not_preview_and_send', 'Selected DFC asset is not marked preview_and_send.')],
      })
    }

    const read = await this.readDfcPreviewTextSource(source)
    if (!read.ok) {
      return dfcPreviewPayload({
        kind: 'none',
        status: read.status,
        maxCharacters,
        diagnostics: [dfcDiagnostic(read.code, read.message)],
      })
    }
    return dfcTextPreviewPayload(read.text, maxCharacters)
  }

  private resolveDfcPreviewSource(rawAsset: FileAssetRecord, derivativeId: string): DfcPreviewSource | null {
    const derivative = this.getDfcDerivativeById(derivativeId)
    if (derivative) {
      if (derivative.parentAssetId !== rawAsset.id) return null
      return {
        derivativeId: derivative.id,
        storageUri: derivative.storageUri,
        mime: derivative.mime,
        status: derivative.status,
        generator: derivative.generator,
        metaJson: derivative.metaJson,
        deletedAt: derivative.deletedAt,
      }
    }

    const root = normalizeObject(rawAsset.sourceMetaJson)
    const textConversion = normalizeObject(root?.textConversion)
    const textConversionDerivativeId = typeof textConversion?.derivativeId === 'string' ? textConversion.derivativeId.trim() : ''
    if (textConversionDerivativeId !== derivativeId) return null
    const storageUri = typeof textConversion?.storageUri === 'string' ? textConversion.storageUri.trim() : ''
    if (!storageUri) return null
    return {
      derivativeId,
      storageUri,
      mime: typeof textConversion?.mime === 'string' ? textConversion.mime : null,
      status: dfcOptionStatusFromTextConversion(textConversion) === 'ready' ? 'ready' : 'pending',
      generator: typeof textConversion?.converterName === 'string' ? textConversion.converterName : null,
      metaJson: textConversion,
      deletedAt: null,
    }
  }

  private getDfcDerivativeById(derivativeId: string): FileDerivativeRecord | null {
    const id = requireNonEmpty(derivativeId, 'derivativeId')
    const row = this.deps.db.prepare(`
      SELECT
        id,
        parent_asset_id AS parentAssetId,
        derived_kind AS derivedKind,
        mime,
        storage_uri AS storageUri,
        generator,
        status,
        meta_json AS metaJson,
        created_at AS createdAt,
        updated_at AS updatedAt,
        deleted_at AS deletedAt
      FROM file_derivatives
      WHERE id = @id
      LIMIT 1
    `).get({ id }) as FileDerivativeCandidateRow | undefined
    if (!row) return null
    return {
      id: row.id,
      parentAssetId: row.parentAssetId,
      derivedKind: row.derivedKind,
      mime: row.mime ?? null,
      storageUri: row.storageUri,
      generator: row.generator,
      status: row.status,
      metaJson: parseJsonObject(row.metaJson),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt ?? null,
    }
  }

  private async readDfcPreviewTextSource(source: DfcPreviewSource): Promise<
    | Readonly<{ ok: true; text: string }>
    | Readonly<{ ok: false; status: DfcDraftAttachmentPreviewStatus; code: string; message: string }>
  > {
    const storageRootDir = String(this.deps.storageRootDir ?? '').trim()
    if (!storageRootDir) {
      return { ok: false, status: 'blocked', code: 'dfc_preview_storage_root_missing', message: 'DFC preview storage root is not configured.' }
    }
    const resolved = resolveManagedStoragePath(storageRootDir, source.storageUri, {
      backend: 'local_fs',
      deletedAt: source.deletedAt,
    })
    if (resolved.kind === 'missing') {
      return { ok: false, status: 'stale', code: 'dfc_preview_source_missing', message: 'Selected DFC preview asset is missing.' }
    }
    if (resolved.kind === 'invalid') {
      return { ok: false, status: 'blocked', code: resolved.code, message: resolved.message }
    }
    const bytes = await readFile(resolved.path).catch(() => null)
    if (!bytes) {
      return { ok: false, status: 'failed', code: 'dfc_preview_read_failed', message: 'Selected DFC preview content could not be read.' }
    }
    return { ok: true, text: Buffer.from(bytes).toString('utf8') }
  }

  private buildDfcOptionCandidates(
    attachment: DraftAttachmentRecord,
    asset: FileAssetRecord
  ): DfcConversionOption[] {
    const options: DfcConversionOption[] = []
    const rawRefs: DfcSendAssetRef[] = [{ kind: 'raw_file', assetId: asset.id }]
    options.push({
      ...createDfcOriginalFileOption({
        optionId: this.optionIdForCandidate(attachment, 'original_file', rawRefs),
        rawFileId: asset.id,
        status: this.isDfcRawFileAvailable(asset) ? 'ready' : 'stale',
        isAvailable: this.isDfcRawFileAvailable(asset),
        compatibilityStatus: this.isDfcRawFileAvailable(asset) ? 'compatible' : 'blocked',
      }),
      sendAssetRefs: rawRefs,
    })

    for (const derivative of this.listDfcDerivativeCandidates(asset.id)) {
      const targetKind = readDfcDerivedTargetKindFromMeta(derivative.metaJson)
      if (!targetKind) continue
      const refs: DfcSendAssetRef[] = [{ kind: 'derived_asset', assetId: derivative.id }]
      const status = dfcOptionStatusFromDerivative(derivative)
      const facade = createDfcDerivedAssetFacade({
        derivativeId: derivative.id,
        sourceFileId: asset.id,
        mime: derivative.mime,
        storageRef: derivative.storageUri,
        status: derivative.status,
        generator: derivative.generator,
        metaJson: derivative.metaJson,
      })
      const unavailableReason = status === 'ready'
        ? dfcDerivativeUnavailableReason(facade)
        : null
      const candidateStatus = unavailableReason ? 'blocked' : status
      const isAvailable = status === 'ready' && !unavailableReason
      options.push({
        ...createDfcDerivedAssetOption({
          optionId: this.optionIdForCandidate(attachment, targetKind, refs),
          rawFileId: asset.id,
          derivedAssetId: derivative.id,
          targetKind,
          status: candidateStatus,
          isAvailable,
          compatibilityStatus: isAvailable ? 'compatible' : candidateStatus === 'pending' ? 'pending' : 'blocked',
        }),
        unavailableReason: unavailableReason ?? undefined,
        warnings: facade.ok ? facade.asset.warnings : [],
      })
    }

    const textConversionOption = this.textConversionOptionCandidate(attachment, asset)
    if (textConversionOption && !options.some((option) => dfcSendAssetRefsEqual(option.sendAssetRefs, textConversionOption.sendAssetRefs))) {
      options.push(textConversionOption)
    }
    return options
  }

  private optionIdForCandidate(
    attachment: DraftAttachmentRecord,
    targetKind: DfcTargetKind,
    refs: readonly DfcSendAssetRef[]
  ): string {
    const refPart = refs.map((ref) => `${ref.kind}:${ref.assetId}`).sort().join(',')
    return `dfc:${attachment.assetId}:${targetKind}:${refPart}`
  }

  private textConversionOptionCandidate(
    attachment: DraftAttachmentRecord,
    asset: FileAssetRecord
  ): DfcConversionOption | null {
    const root = normalizeObject(asset.sourceMetaJson)
    const textConversion = normalizeObject(root?.textConversion)
    const derivativeId = typeof textConversion?.derivativeId === 'string' ? textConversion.derivativeId.trim() : ''
    const targetKind = readDfcDerivedTargetKindFromMeta(textConversion)
    if (!derivativeId || !targetKind) return null
    const refs: DfcSendAssetRef[] = [{ kind: 'derived_asset', assetId: derivativeId }]
    const status = dfcOptionStatusFromTextConversion(textConversion)
    const facade = createDfcDerivedAssetFacade({
      derivativeId,
      sourceFileId: asset.id,
      mime: typeof textConversion?.mime === 'string' ? textConversion.mime : null,
      storageRef: typeof textConversion?.storageUri === 'string' ? textConversion.storageUri : null,
      status,
      generator: typeof textConversion?.converterName === 'string' ? textConversion.converterName : null,
      metaJson: textConversion,
    })
    const unavailableReason = status === 'ready'
      ? dfcDerivativeUnavailableReason(facade)
      : null
    const candidateStatus = unavailableReason ? 'blocked' : status
    const hasStorageRef = typeof textConversion?.storageUri === 'string' && textConversion.storageUri.trim().length > 0
    const isAvailable = status === 'ready' && hasStorageRef && !unavailableReason
    return {
      ...createDfcDerivedAssetOption({
        optionId: this.optionIdForCandidate(attachment, targetKind, refs),
        rawFileId: asset.id,
        derivedAssetId: derivativeId,
        targetKind,
        status: candidateStatus,
        isAvailable,
        compatibilityStatus: isAvailable ? 'compatible' : candidateStatus === 'pending' || candidateStatus === 'candidate' ? 'pending' : 'blocked',
      }),
      unavailableReason: unavailableReason ?? undefined,
      warnings: facade.ok ? facade.asset.warnings : [],
    }
  }

  private toDfcDraftOptionCandidateDto(option: DfcConversionOption): DfcDraftOptionCandidateDto {
    return {
      optionId: option.optionId,
      targetKind: option.targetKind,
      sendStrategy: option.sendStrategy,
      status: option.status,
      isAvailable: option.isAvailable,
      compatibilityStatus: option.compatibilityStatus ?? null,
      sendAssetRefs: [...option.sendAssetRefs],
      warnings: [...(option.warnings ?? [])],
      diagnostics: option.unavailableReason
        ? [{ code: option.unavailableReason, message: `DFC option unavailable: ${option.unavailableReason}` }]
        : [],
    }
  }

  private requireFileAssetRecord(assetId: string): FileAssetRecord {
    const asset = this.deps.fileAssetRepo.getById(assetId)
    if (!asset) throw new Error(`file asset not found: ${assetId}`)
    return asset
  }

  private isDfcRawFileAvailable(asset: FileAssetRecord): boolean {
    return asset.deletedAt == null && asset.ingestStatus !== 'deleted'
  }

  private listDfcDerivativeCandidates(parentAssetId: string): FileDerivativeRecord[] {
    const rows = this.deps.db.prepare(`
      SELECT
        id,
        parent_asset_id AS parentAssetId,
        derived_kind AS derivedKind,
        mime,
        storage_uri AS storageUri,
        generator,
        status,
        meta_json AS metaJson,
        created_at AS createdAt,
        updated_at AS updatedAt,
        deleted_at AS deletedAt
      FROM file_derivatives
      WHERE parent_asset_id = @parentAssetId
      ORDER BY created_at ASC, id ASC
    `).all({ parentAssetId }) as FileDerivativeCandidateRow[]
    return rows.map((row) => ({
      id: row.id,
      parentAssetId: row.parentAssetId,
      derivedKind: row.derivedKind,
      mime: row.mime ?? null,
      storageUri: row.storageUri,
      generator: row.generator,
      status: row.status,
      metaJson: parseJsonObject(row.metaJson),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt ?? null,
    }))
  }

  private createMessageAttachmentFromDraft(
    messageId: string,
    attachment: DraftAttachmentRecord,
    dfcSnapshot: DfcAttachmentSendSnapshot | undefined,
    dfcSnapshotsProvided: boolean
  ): MessageAttachmentRecord {
    const normalizedDfcSnapshot = this.resolveDfcSendSnapshot(attachment, dfcSnapshot, dfcSnapshotsProvided)
    return this.deps.messageAttachmentRepo.create({
      messageId,
      assetId: attachment.assetId,
      aiPayloadKind: attachment.aiPayloadKind,
      processingStatus: attachment.processingStatus,
      includeInNextRequest: attachment.includeInNextRequest,
      excludedReason: attachment.excludedReason,
      dfcManaged: attachment.dfcManaged,
      usedOptionId: attachment.dfcManaged ? attachment.selectedOptionId : null,
      usedAssetRefs: attachment.dfcManaged ? normalizedDfcSnapshot?.sendAssetRefs ?? [] : [],
      targetKind: normalizedDfcSnapshot?.targetKind ?? null,
      sendStrategy: normalizedDfcSnapshot?.sendStrategy ?? null,
      createdAt: attachment.createdAt,
      updatedAt: this.now(),
    })
  }

  private createDfcSnapshotMap(
    snapshots: readonly DfcAttachmentSendSnapshot[] | undefined
  ): ReadonlyMap<string, DfcAttachmentSendSnapshot> {
    const result = new Map<string, DfcAttachmentSendSnapshot>()
    for (const snapshot of snapshots ?? []) {
      const attachmentId = requireNonEmpty(snapshot.attachmentId, 'dfcAttachmentSendSnapshot.attachmentId')
      if (result.has(attachmentId)) {
        throw new Error(`duplicate DFC send snapshot for draft attachment: ${attachmentId}`)
      }
      result.set(attachmentId, snapshot)
    }
    return result
  }

  private resolveDfcSendSnapshot(
    attachment: DraftAttachmentRecord,
    snapshot: DfcAttachmentSendSnapshot | undefined,
    snapshotsProvided: boolean
  ): DfcAttachmentSendSnapshot | null {
    if (!attachment.dfcManaged) return null
    const backendSnapshot = this.deriveDfcSendSnapshotFromSelectedRefs(attachment)
    if (!snapshot) {
      if (snapshotsProvided) throw new Error(`missing DFC send snapshot for draft attachment: ${attachment.id}`)
      return backendSnapshot
    }
    if (snapshot.assetId !== attachment.assetId) {
      throw new Error(`DFC send snapshot asset mismatch for draft attachment: ${attachment.id}`)
    }
    if (!dfcSendAssetRefsEqual(snapshot.sendAssetRefs, backendSnapshot.sendAssetRefs)) {
      throw new Error(`DFC send snapshot refs do not match selectedAssetRefs for draft attachment: ${attachment.id}`)
    }
    if (!dfcTargetAndRefsAreCoherent(snapshot, attachment.assetId)) {
      throw new Error(`DFC send snapshot targetKind does not match sendAssetRefs for draft attachment: ${attachment.id}`)
    }
    if (snapshot.targetKind !== backendSnapshot.targetKind || snapshot.sendStrategy !== backendSnapshot.sendStrategy) {
      throw new Error(`DFC send snapshot targetKind/sendStrategy does not match backend-selected option for draft attachment: ${attachment.id}`)
    }
    return backendSnapshot
  }

  private deriveDfcSendSnapshotFromSelectedRefs(attachment: DraftAttachmentRecord): DfcAttachmentSendSnapshot {
    if (!attachment.selectedOptionId) {
      throw new Error(`DFC-managed draft attachment requires selectedOptionId before message binding: ${attachment.id}`)
    }
    const asset = this.requireFileAssetRecord(attachment.assetId)
    const options = this.buildDfcOptionCandidates(attachment, asset)
    const decision = this.resolveDfcDraftDecision(attachment, asset, options)
    if (decision.status !== 'ready' || !decision.targetKind || !decision.sendStrategy) {
      throw new Error(`DFC-managed draft attachment selected option is not ready for message binding: ${attachment.id}`)
    }
    if (!dfcSendAssetRefsEqual(attachment.selectedAssetRefs, decision.sendAssetRefs)) {
      throw new Error(`DFC selected option refs do not match selectedAssetRefs for draft attachment: ${attachment.id}`)
    }
    return {
      attachmentId: attachment.id,
      assetId: attachment.assetId,
      targetKind: decision.targetKind,
      sendStrategy: decision.sendStrategy,
      sendAssetRefs: decision.sendAssetRefs,
    }
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
        ma.dfc_managed AS dfcManaged,
        ma.used_option_id AS usedOptionId,
        ma.used_asset_refs_json AS usedAssetRefsJson,
        ma.target_kind AS targetKind,
        ma.send_strategy AS sendStrategy,
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
  dfcManaged: number
  usedOptionId: string | null
  usedAssetRefsJson: string | null
  targetKind: string | null
  sendStrategy: string | null
  sourceKind: AttachmentSnapshotItem['sourceKind']
  storageBackend: AttachmentSnapshotItem['storageBackend']
  ingestStatus: string | null
  deletedAt: number | null
}>

function toSnapshotItem(row: AttachmentSnapshotRow): AttachmentSnapshotItem {
  const computedReason = computeExcludedReason(row)
  const dfcManaged = row.dfcManaged === 1
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
    dfcManaged,
    usedOptionId: dfcManaged ? row.usedOptionId ?? null : null,
    usedAssetRefs: dfcManaged ? parseRequiredDfcSendAssetRefsJson(row.usedAssetRefsJson) : parseDfcSendAssetRefsJson(null),
    targetKind: dfcManaged ? normalizeDfcTargetKind(row.targetKind) : null,
    sendStrategy: dfcManaged ? normalizeDfcSendStrategy(row.sendStrategy) : null,
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

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeDfcSendAssetRefsForUpdate(value: readonly DfcSendAssetRef[]): DfcSendAssetRef[] {
  return normalizeDfcSendAssetRefs(value)
}

function normalizeObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readDfcDerivedTargetKindFromMeta(meta: Record<string, unknown> | null): DfcDerivedTargetKind | null {
  const value = typeof meta?.targetKind === 'string' ? meta.targetKind.trim() : ''
  switch (value) {
    case 'plain_text':
    case 'markdown':
    case 'code':
    case 'table_markdown':
    case 'pdf_attachment':
      return value
    default:
      return null
  }
}

function dfcOptionStatusFromDerivative(derivative: FileDerivativeRecord): DfcConversionOptionStatus {
  if (derivative.deletedAt != null || derivative.status === 'deleted') return 'stale'
  if (derivative.status === 'ready') return 'ready'
  if (derivative.status === 'failed') return 'failed'
  if (derivative.status === 'pending') return 'pending'
  return 'blocked'
}

function dfcOptionStatusFromTextConversion(textConversion: Record<string, unknown> | null): DfcConversionOptionStatus {
  const status = typeof textConversion?.status === 'string' ? textConversion.status.trim() : ''
  if (status === 'ready') return 'ready'
  if (status === 'failed') return 'failed'
  if (status === 'stale') return 'stale'
  if (status === 'blocked') return 'blocked'
  if (status === 'pending' || status === 'running' || status === 'candidate') return 'pending'
  return 'candidate'
}

function dfcDerivativeUnavailableReason(
  facade: ReturnType<typeof createDfcDerivedAssetFacade>
): string | null {
  if (!facade.ok) return facade.reasonCode
  if (facade.asset.usage === 'preview_only') return 'preview_only_asset_not_sendable'
  return null
}

function dfcSendAssetRefsEqual(
  left: DfcAttachmentSendSnapshot['sendAssetRefs'],
  right: DfcAttachmentSendSnapshot['sendAssetRefs']
): boolean {
  return canonicalDfcSendAssetRefs(left) === canonicalDfcSendAssetRefs(right)
}

function canonicalDfcSendAssetRefs(refs: DfcAttachmentSendSnapshot['sendAssetRefs']): string {
  return refs
    .map((ref) => `${ref.kind}:${String(ref.assetId ?? '').trim()}`)
    .sort()
    .join('|')
}

function dfcTargetAndRefsAreCoherent(snapshot: DfcAttachmentSendSnapshot, rawFileId: string): boolean {
  const refs = snapshot.sendAssetRefs
  if (refs.length === 0) return false
  if (snapshot.targetKind === 'original_file') {
    return snapshot.sendStrategy === 'file_attachment'
      && refs.length === 1
      && refs[0]?.kind === 'raw_file'
      && refs[0].assetId === rawFileId
  }
  if (snapshot.targetKind === 'pdf_attachment') {
    return snapshot.sendStrategy === 'file_attachment'
      && refs.every((ref) => ref.kind === 'derived_asset')
  }
  return snapshot.sendStrategy === 'text_in_prompt'
    && refs.every((ref) => ref.kind === 'derived_asset')
}

function normalizeDfcPreviewMaxCharacters(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 4096
  return Math.max(1, Math.min(4096, Math.floor(value)))
}

function dfcPreviewStatusFromDecision(status: DfcManagedAttachmentDecision['status']): DfcDraftAttachmentPreviewStatus {
  return status === 'ready' ? 'ready' : status
}

function isDfcTextPreviewTargetKind(targetKind: DfcTargetKind): targetKind is Exclude<DfcTargetKind, 'original_file' | 'pdf_attachment'> {
  return targetKind === 'plain_text'
    || targetKind === 'markdown'
    || targetKind === 'code'
    || targetKind === 'table_markdown'
}

function dfcPreviewPayload(input: Readonly<{
  kind: DfcDraftAttachmentPreviewPayloadDto['kind']
  status: DfcDraftAttachmentPreviewStatus
  maxCharacters: number
  diagnostics?: readonly DfcSanitizedDiagnostic[]
}>): DfcDraftAttachmentPreviewPayloadDto {
  return {
    kind: input.kind,
    status: input.status,
    text: null,
    characterCount: null,
    byteLength: null,
    truncated: false,
    maxCharacters: input.maxCharacters,
    diagnostics: [...(input.diagnostics ?? [])],
  }
}

function dfcTextPreviewPayload(text: string, maxCharacters: number): DfcDraftAttachmentPreviewPayloadDto {
  const characterCount = text.length
  const previewText = characterCount > maxCharacters ? text.slice(0, maxCharacters) : text
  return {
    kind: 'text',
    status: 'ready',
    text: previewText,
    characterCount,
    byteLength: Buffer.byteLength(text, 'utf8'),
    truncated: characterCount > maxCharacters,
    maxCharacters,
    diagnostics: [],
  }
}

function dfcDiagnostic(code: string, message: string): DfcSanitizedDiagnostic {
  return { code, message }
}

function parseJsonObject(json: string | null | undefined): Record<string, unknown> | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}
