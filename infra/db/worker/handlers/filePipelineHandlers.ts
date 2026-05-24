import type { DbWorkerRuntime } from '../runtime'
import type { RegisterHandler } from './types'
import { readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { resolveManagedStoragePath } from '../../../../src/shared/files/localStorageResolver'
import type { SendPlan } from '../../../../src/shared/files/sendPlanTypes'
import { serializeSendPlanForOpenRouter } from '../../../../src/next/openrouter/openRouterSendPlanSerializer'
import {
  CreateFileAssetSchema,
  CreateFileDerivativeSchema,
  CreateDerivativeJobSchema,
  CreateMessageAttachmentSchema,
  GetDerivativeJobByIdSchema,
  GetFileAssetByIdSchema,
  GetFileDerivativeByIdSchema,
  GetLatestReadyFileDerivativeSchema,
  ListFileAssetsByIdsSchema,
  ListDerivativeJobsByAssetIdSchema,
  ListFileDerivativesByParentAssetIdSchema,
  ListMessageAttachmentsByAssetIdSchema,
  ListMessageAttachmentsByMessageIdSchema,
  AddDraftAttachmentSchema,
  AttachDraftToMessageSchema,
  BuildCurrentSendPlanSchema,
  CloneMessageAttachmentsToDraftSchema,
  CommitDraftToUserMessageSchema,
  DetachMessageAttachmentSchema,
  GetAssetAttachmentOwnershipSchema,
  GetAttachmentCandidateSnapshotSchema,
  GetDfcDraftAttachmentOptionsSchema,
  MarkAttachmentAbandonedSchema,
  CapturePdfAnnotationDerivativeSchema,
  RemoveDraftAttachmentSchema,
  RestoreConversationDraftSchema,
  RetryDerivativeJobSchema,
  RunDerivativeJobSchema,
  CancelDerivativeJobSchema,
  SoftDeleteFileAssetSchema,
  UpdateConversationDraftTextSchema,
  UpdateDraftAttachmentSettingsSchema,
  PrepareOpenRouterSendSchema,
  PrepareOpenRouterReplayFromMessageSchema,
  IngestLocalFileSchema,
  IngestUrlSchema,
  PreviewGetLatestSchema,
  PreviewEnsureSchema,
  DetectFileTypeSchema,
  MarkFileTypeVerdictStaleSchema,
} from '../../validation'

export function registerFilePipelineHandlers(register: RegisterHandler, runtime: DbWorkerRuntime) {
  register('fileAsset.create', (raw) => {
    const input = CreateFileAssetSchema.parse(raw)
    return runtime.fileAssetRepo.create(input)
  })

  register('fileAsset.getById', (raw) => {
    const input = GetFileAssetByIdSchema.parse(raw)
    return runtime.fileAssetRepo.getById(input.id)
  })

  register('fileAsset.listByIds', (raw) => {
    const input = ListFileAssetsByIdsSchema.parse(raw)
    return runtime.fileAssetRepo.listByIds(input)
  })

  register('fileAsset.softDelete', (raw) => {
    const input = SoftDeleteFileAssetSchema.parse(raw)
    return runtime.fileAssetRepo.softDelete(input)
  })

  register('fileAsset.planPhysicalCleanup', (raw) => {
    const input = SoftDeleteFileAssetSchema.parse(raw)
    return runtime.fileAssetRepo.planPhysicalCleanup(input)
  })

  register('fileDerivative.create', (raw) => {
    const input = CreateFileDerivativeSchema.parse(raw)
    return runtime.fileDerivativeRepo.create(input)
  })

  register('fileDerivative.getById', (raw) => {
    const input = GetFileDerivativeByIdSchema.parse(raw)
    return runtime.fileDerivativeRepo.getById(input.id)
  })

  register('fileDerivative.listByParentAssetId', (raw) => {
    const input = ListFileDerivativesByParentAssetIdSchema.parse(raw)
    return runtime.fileDerivativeRepo.listByParentAssetId(input)
  })

  register('fileDerivative.getLatestReady', (raw) => {
    const input = GetLatestReadyFileDerivativeSchema.parse(raw)
    return runtime.fileDerivativeRepo.getLatestReady(input)
  })

  register('derivativeJob.create', (raw) => {
    const input = CreateDerivativeJobSchema.parse(raw)
    return runtime.derivativeJobService.createDerivativeJob(input)
  })

  register('derivativeJob.getById', (raw) => {
    const input = GetDerivativeJobByIdSchema.parse(raw)
    return runtime.derivativeJobService.getDerivativeJobById(input.id)
  })

  register('derivativeJob.listByAssetId', (raw) => {
    const input = ListDerivativeJobsByAssetIdSchema.parse(raw)
    return runtime.derivativeJobService.listDerivativeJobsByAssetId(input.assetId)
  })

  register('derivativeJob.run', async (raw) => {
    const input = RunDerivativeJobSchema.parse(raw)
    return runtime.derivativeJobService.runDerivativeJob(input)
  })

  register('derivativeJob.retry', async (raw) => {
    const input = RetryDerivativeJobSchema.parse(raw)
    return runtime.derivativeJobService.retryDerivativeJob(input)
  })

  register('derivativeJob.cancel', (raw) => {
    const input = CancelDerivativeJobSchema.parse(raw)
    return runtime.derivativeJobService.cancelDerivativeJob(input)
  })

  register('derivativeJob.capturePdfAnnotations', async (raw) => {
    const input = CapturePdfAnnotationDerivativeSchema.parse(raw)
    return runtime.derivativeJobService.capturePdfAnnotations(input)
  })

  register('messageAttachment.create', (raw) => {
    const input = CreateMessageAttachmentSchema.parse(raw)
    return runtime.messageAttachmentRepo.create(input)
  })

  register('messageAttachment.listByMessageId', (raw) => {
    const input = ListMessageAttachmentsByMessageIdSchema.parse(raw)
    return runtime.messageAttachmentRepo.listByMessageId(input)
  })

  register('messageAttachment.listByAssetId', (raw) => {
    const input = ListMessageAttachmentsByAssetIdSchema.parse(raw)
    return runtime.messageAttachmentRepo.listByAssetId(input)
  })

  registerConversationAttachmentHandlers(register, runtime)

  register('fileIngestion.ingestLocalFile', async (raw) => {
    const input = IngestLocalFileSchema.parse(raw)
    return await runtime.fileIngestionService.ingestLocalFile(input)
  })

  register('fileIngestion.ingestUrl', async (raw) => {
    const input = IngestUrlSchema.parse(raw)
    return await runtime.fileIngestionService.ingestUrl(input)
  })

  register('preview.getLatestReady', async (raw) => {
    const input = PreviewGetLatestSchema.parse(raw)
    return await buildPreviewPayload(runtime, input.assetId, false)
  })

  register('preview.ensure', async (raw) => {
    const input = PreviewEnsureSchema.parse(raw)
    try {
      const ensured = await runtime.derivativeJobService.ensurePreviewDerivative(input)
      return await buildPreviewPayload(runtime, input.assetId, ensured.reused)
    } catch (error) {
      return {
        assetId: input.assetId,
        status: 'failed',
        derivativeId: null,
        mime: null,
        dataUrl: null,
        width: null,
        height: null,
        bytes: null,
        reused: false,
        errorCode: 'preview_ensure_failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      } as const
    }
  })

  register('fileType.detectBasic', async (raw) => {
    const input = DetectFileTypeSchema.parse(raw)
    return await runtime.fileTypeDetectionService.detectBasic(input)
  })

  register('fileType.detectFull', async (raw) => {
    const input = DetectFileTypeSchema.parse(raw)
    return await runtime.fileTypeDetectionService.detectFull(input)
  })

  register('fileType.markStale', (raw) => {
    const input = MarkFileTypeVerdictStaleSchema.parse(raw)
    return runtime.fileTypeDetectionService.markStaleByAssetId(input.assetId, input.staleReason)
  })
}

function registerConversationAttachmentHandlers(register: RegisterHandler, runtime: DbWorkerRuntime) {
  register('conversationDraft.restore', (raw) => {
    const input = RestoreConversationDraftSchema.parse(raw)
    return runtime.conversationAttachmentService.restoreDraft(input)
  })

  register('conversationDraft.updateText', (raw) => {
    const input = UpdateConversationDraftTextSchema.parse(raw)
    return runtime.conversationAttachmentService.updateDraftText(input)
  })

  register('conversationDraft.addAttachment', (raw) => {
    const input = AddDraftAttachmentSchema.parse(raw)
    const attachment = runtime.conversationAttachmentService.addDraftAttachment(input)
    runtime.fileTypeDetectionCoordinator.scheduleDraftAttachmentDetection(attachment.assetId, {
      detectionTrigger: 'upload',
    })
    return attachment
  })

  register('conversationDraft.removeAttachment', (raw) => {
    const input = RemoveDraftAttachmentSchema.parse(raw)
    return runtime.conversationAttachmentService.removeDraftAttachment(input)
  })

  register('conversationDraft.updateAttachmentSettings', (raw) => {
    const input = UpdateDraftAttachmentSettingsSchema.parse(raw)
    return runtime.conversationAttachmentService.updateDraftAttachmentSettings(input)
  })

  register('conversationDraft.getDfcOptions', (raw) => {
    const input = GetDfcDraftAttachmentOptionsSchema.parse(raw)
    return runtime.conversationAttachmentService.getDfcDraftAttachmentOptions(input)
  })

  register('conversationDraft.commitToUserMessage', (raw) => {
    const input = CommitDraftToUserMessageSchema.parse(raw)
    return runtime.conversationAttachmentService.commitDraftToUserMessage(input)
  })

  register('conversationDraft.attachToMessage', (raw) => {
    const input = AttachDraftToMessageSchema.parse(raw)
    return runtime.conversationAttachmentService.attachDraftToMessage(input)
  })

  register('conversationDraft.cloneFromMessage', (raw) => {
    const input = CloneMessageAttachmentsToDraftSchema.parse(raw)
    return runtime.conversationAttachmentService.cloneMessageToDraft(input)
  })

  register('messageAttachment.detach', (raw) => {
    const input = DetachMessageAttachmentSchema.parse(raw)
    return runtime.conversationAttachmentService.detachMessageAttachment(input)
  })

  register('messageAttachment.getAssetOwnership', (raw) => {
    const input = GetAssetAttachmentOwnershipSchema.parse(raw)
    return runtime.conversationAttachmentService.getAssetOwnership(input)
  })

  register('messageAttachment.getCandidateSnapshot', (raw) => {
    const input = GetAttachmentCandidateSnapshotSchema.parse(raw)
    return runtime.conversationAttachmentService.getCandidateAttachmentSnapshot(input)
  })

  register('messageAttachment.markAssetAbandoned', (raw) => {
    const input = MarkAttachmentAbandonedSchema.parse(raw)
    return runtime.conversationAttachmentService.markAssetAbandoned(input)
  })

  register('sendPlan.buildCurrent', async (raw) => {
    const input = BuildCurrentSendPlanSchema.parse(raw)
    return await buildCurrentSendPlanPayloadAsync(runtime, input)
  })

  register('sendPlan.prepareOpenRouter', async (raw) => {
    const input = PrepareOpenRouterSendSchema.parse(raw)
    let collected = runtime.sendPlanService.collectCurrentSendInputs({
      conversationId: input.conversationId,
      draftText: input.draftText,
      historyScope: historyScopeFromIds(input.historyMessageIds),
      model: input.model,
      providerContext: input.providerContext,
    })
    const conversionUpdated = await ensureTextDerivativesForCollected(runtime, collected)
    if (conversionUpdated) {
      collected = runtime.sendPlanService.collectCurrentSendInputs({
        conversationId: input.conversationId,
        draftText: input.draftText,
        historyScope: historyScopeFromIds(input.historyMessageIds),
        model: input.model,
        providerContext: input.providerContext,
      })
    }
    const sendPlan = runtime.sendPlanService.buildSendPlan(collected)
    if (sendPlan.status === 'blocked') {
      return {
        sendPlan,
        contentParts: [],
        additionalPlugins: [],
        diagnostics: buildBlockedOpenRouterDiagnostics(sendPlan),
        hasDraftAttachmentPlans: sendPlan.attachmentPlans.some((plan) => plan.source === 'draft'),
      }
    }
    const assetIds = Array.from(new Set([
      ...sendPlan.attachmentPlans.map((plan) => plan.assetId),
      ...sendPlan.includedAttachments.map((attachment) => attachment.assetId),
      ...sendPlan.excludedAttachments.map((attachment) => attachment.assetId),
    ]))
    const assets = assetIds.length > 0 ? runtime.fileAssetRepo.listByIds({ ids: assetIds }) : []
    const serialized = await serializeSendPlanForOpenRouter({
      sendPlan,
      userText: collected.draftText,
      assetsById: new Map(assets.map((asset) => [asset.id, asset])),
      storageRootDir: runtime.fileStorageRootDir,
      pdfFileParser: input.pdfFileParser,
      providerContext: {
        allowVideoUrlRef: input.providerContext.supportsVideoUrlRef === true,
      },
    })

    return {
      sendPlan,
      contentParts: serialized.contentParts,
      additionalPlugins: serialized.additionalPlugins,
      diagnostics: serialized.diagnostics,
      hasDraftAttachmentPlans: sendPlan.attachmentPlans.some((plan) => plan.source === 'draft'),
    }
  })

  register('sendPlan.prepareOpenRouterReplayFromMessage', async (raw) => {
    const input = PrepareOpenRouterReplayFromMessageSchema.parse(raw)
    const messageId = String(input.userMessageId ?? '').trim()
    const branchId = String(input.branchId ?? '').trim()
    if (!messageId || !branchId) throw new Error('Missing branchId/userMessageId')

    const messageRow = runtime.db.prepare(`
      SELECT m.id AS id, m.convo_id AS convoId, m.role AS role, b.body AS body
      FROM message m
      LEFT JOIN message_body b ON b.message_id = m.id
      WHERE m.id=@id
      LIMIT 1
    `).get({ id: messageId }) as { id: string; convoId: string; role: string; body: string | null } | undefined
    if (!messageRow) throw new Error(`Replay source message not found: ${messageId}`)
    if (messageRow.role !== 'user') throw new Error('Replay source must be a user message')

    const replayText = typeof input.editedUserText === 'string' && input.editedUserText.trim().length > 0
      ? input.editedUserText
      : String(messageRow.body ?? '')
    if (!replayText.trim()) throw new Error('Replay source message text is empty')

    let collected = runtime.sendPlanService.collectCurrentSendInputs({
      conversationId: messageRow.convoId,
      draftText: replayText,
      historyScope: { messageIds: [messageId] },
      model: input.model,
      providerContext: input.providerContext,
    })
    const normalizedDecisions = Array.isArray(input.attachmentDecisions)
      ? input.attachmentDecisions
          .map((item) => ({
            attachmentId: String(item.attachmentId ?? '').trim(),
            source: typeof item.source === 'string' ? item.source : null,
            decision: item.decision,
            reasonCode: typeof item.reasonCode === 'string' ? item.reasonCode.trim() : '',
          }))
          .filter((item) => item.attachmentId.length > 0)
      : []
    const decisionByAttachmentId = new Map(normalizedDecisions.map((item) => [item.attachmentId, item]))
    collected = {
      ...collected,
      draftText: replayText,
      draftAttachments: [],
      historyAttachments: collected.historyAttachments.map((attachment) => {
        const decision = decisionByAttachmentId.get(attachment.attachmentId)
        if (!decision) return attachment
        if (decision.source && decision.source !== 'history') return attachment
        return {
          ...attachment,
          includeInNextRequest: false,
          excludedReason: decision.reasonCode || 'manually_excluded',
        }
      }),
    }

    const conversionUpdated = await ensureTextDerivativesForCollected(runtime, collected)
    if (conversionUpdated) {
      const refreshed = runtime.sendPlanService.collectCurrentSendInputs({
        conversationId: messageRow.convoId,
        draftText: replayText,
        historyScope: { messageIds: [messageId] },
        model: input.model,
        providerContext: input.providerContext,
      })
      collected = {
        ...refreshed,
        draftText: replayText,
        draftAttachments: [],
        historyAttachments: refreshed.historyAttachments.map((attachment) => {
          const decision = decisionByAttachmentId.get(attachment.attachmentId)
          if (!decision) return attachment
          if (decision.source && decision.source !== 'history') return attachment
          return {
            ...attachment,
            includeInNextRequest: false,
            excludedReason: decision.reasonCode || 'manually_excluded',
          }
        }),
      }
    }

    const sendPlan = runtime.sendPlanService.buildSendPlan(collected)
    const assetIds = Array.from(new Set([
      ...sendPlan.attachmentPlans.map((plan) => plan.assetId),
      ...sendPlan.includedAttachments.map((attachment) => attachment.assetId),
      ...sendPlan.excludedAttachments.map((attachment) => attachment.assetId),
    ]))
    const assets = assetIds.length > 0 ? runtime.fileAssetRepo.listByIds({ ids: assetIds }) : []
    const serialized = await serializeSendPlanForOpenRouter({
      sendPlan,
      userText: replayText,
      assetsById: new Map(assets.map((asset) => [asset.id, asset])),
      storageRootDir: runtime.fileStorageRootDir,
      pdfFileParser: { enabled: true, engine: 'native' },
      providerContext: {
        allowVideoUrlRef: input.providerContext.supportsVideoUrlRef === true,
      },
    })

    const historyNeedsConfirmation = sendPlan.attachmentPlans.some((plan) =>
      plan.source === 'history' &&
      (plan.eligibility === 'excluded' || plan.eligibility === 'blocked') &&
      !decisionByAttachmentId.has(plan.attachmentId)
    )
    const status: 'sendable' | 'blocked' | 'needs_confirmation' =
      sendPlan.status === 'blocked'
        ? 'blocked'
        : historyNeedsConfirmation
          ? 'needs_confirmation'
          : 'sendable'

    return {
      status,
      currentUserContentBlocks: serialized.contentParts,
      sentAssetIds: Array.from(new Set(sendPlan.includedAttachments.map((attachment) => attachment.assetId))),
      includedAttachments: sendPlan.includedAttachments,
      excludedAttachments: sendPlan.excludedAttachments,
      blockingReasons: sendPlan.blockingReasons,
      diagnostics: {
        sendPlanStatus: sendPlan.status,
        replayStatus: status,
        confirmationRequired: status === 'needs_confirmation',
        attachmentDecisions: normalizedDecisions,
        warnings: sendPlan.warnings,
        serializer: serialized.diagnostics,
      },
      modelCapabilitySnapshot: {
        modelId: input.model.modelId,
        providerKey: input.model.providerKey,
        modelKey: input.model.modelKey,
        inputModalities: input.model.inputModalities,
        outputModalities: input.model.outputModalities ?? [],
        providerContext: input.providerContext,
      },
      manifestDraft: {
        replayMode: input.replayMode,
        sourceUserMessageId: messageId,
        branchId,
        modelId: input.model.modelId,
        providerKey: input.model.providerKey,
        sentAssetIds: Array.from(new Set(sendPlan.includedAttachments.map((attachment) => attachment.assetId))),
        includedAttachments: sendPlan.includedAttachments,
        excludedAttachments: sendPlan.excludedAttachments,
        attachmentDecisions: normalizedDecisions,
      },
    }
  })
}

function buildBlockedOpenRouterDiagnostics(sendPlan: SendPlan) {
  const excludedAttachments = sendPlan.attachmentPlans
    .filter((plan) => plan.eligibility !== 'included' && plan.eligibility !== 'warning')
    .map((plan) => ({
      assetId: plan.assetId,
      attachmentId: plan.attachmentId,
      source: plan.source,
      exclusionReason: plan.exclusionReason ?? plan.displayStatus,
    }))
  return {
    sendPlanStatus: sendPlan.status,
    includedAttachmentCount: 0,
    excludedAttachmentCount: excludedAttachments.length,
    includedAttachments: [],
    excludedAttachments,
    injectedPlugins: [],
    attachmentErrors: sendPlan.attachmentPlans
      .filter((plan) => plan.eligibility === 'blocked' || plan.exclusionReason != null)
      .map((plan) => ({
        code: plan.exclusionReason ?? 'send_plan_blocked',
        message: plan.notes[0] ?? 'Attachment is blocked by the current send plan.',
        assetId: plan.assetId,
        attachmentId: plan.attachmentId,
        messageId: plan.messageId,
        selectedSendMode: plan.selectedSendMode,
        aiPayloadKind: plan.aiPayloadKind,
      })),
    containsMultimodalParts: false,
  }
}

async function buildCurrentSendPlanPayloadAsync(
  runtime: DbWorkerRuntime,
  input: Parameters<DbWorkerRuntime['sendPlanService']['collectCurrentSendInputs']>[0]
) {
  let collected = runtime.sendPlanService.collectCurrentSendInputs(input)
  await ensureFileTypeVerdictsForCollected(runtime, collected)
  collected = runtime.sendPlanService.collectCurrentSendInputs(input)
  const conversionUpdated = await ensureTextDerivativesForCollected(runtime, collected)
  if (conversionUpdated) {
    collected = runtime.sendPlanService.collectCurrentSendInputs(input)
  }
  const sendPlan = runtime.sendPlanService.buildSendPlan(collected)
  const assetIds = Array.from(new Set([
    ...sendPlan.attachmentPlans.map((plan) => plan.assetId),
    ...sendPlan.includedAttachments.map((attachment) => attachment.assetId),
    ...sendPlan.excludedAttachments.map((attachment) => attachment.assetId),
  ]))
  const assets = assetIds.length > 0 ? runtime.fileAssetRepo.listByIds({ ids: assetIds }) : []
  return {
    sendPlan,
    draftText: collected.draftText,
    assets,
    storageRootDir: runtime.fileStorageRootDir,
  }
}

async function ensureFileTypeVerdictsForCollected(
  runtime: DbWorkerRuntime,
  collected: ReturnType<DbWorkerRuntime['sendPlanService']['collectCurrentSendInputs']>
): Promise<void> {
  const assetIds = Array.from(new Set(
    [...collected.draftAttachments, ...collected.historyAttachments]
      .filter((attachment) => attachment.includeInNextRequest && !attachment.excludedReason)
      .filter((attachment) => attachment.fileAsset && attachment.fileAsset.deletedAt == null && attachment.fileAsset.ingestStatus !== 'deleted')
      .map((attachment) => attachment.assetId)
  ))
  if (assetIds.length === 0) return
  await runtime.fileTypeDetectionCoordinator.ensureVerdictsForAssets(assetIds, {
    detectionTrigger: 'send_plan_build',
  })
}

function historyScopeFromIds(messageIds: ReadonlyArray<string> | undefined): Readonly<{ messageIds: string[] }> | null {
  const normalized = Array.from(new Set((messageIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)))
  return normalized.length > 0 ? { messageIds: normalized } : null
}

async function ensureTextDerivativesForCollected(
  runtime: DbWorkerRuntime,
  collected: ReturnType<DbWorkerRuntime['sendPlanService']['collectCurrentSendInputs']>
): Promise<boolean> {
  let updated = false
  const attachmentMap = new Map<string, typeof collected.draftAttachments[number] | typeof collected.historyAttachments[number]>()
  for (const attachment of [...collected.draftAttachments, ...collected.historyAttachments]) {
    if (!attachmentMap.has(attachment.assetId)) attachmentMap.set(attachment.assetId, attachment)
  }
  for (const attachment of attachmentMap.values()) {
    if (!attachment.fileAsset) continue
    if (!isTextSemanticTarget(attachment.semantic?.targetKind ?? null)) continue
    const currentMeta = normalizeObject(attachment.fileAsset.sourceMetaJson)
    const textConversion = normalizeObject(currentMeta?.textConversion)
    if (textConversion?.status === 'failed') {
      const errorCode = typeof textConversion?.errorCode === 'string' ? textConversion.errorCode.trim() : ''
      if (NON_RETRYABLE_TEXT_CONVERSION_ERRORS.has(errorCode)) continue
    }
    const lineage = normalizeObject(currentMeta?.lineage)
    if (lineage?.sendAssetReady === true && typeof lineage?.sendTextStorageUri === 'string' && lineage.sendTextStorageUri.trim()) {
      continue
    }
    const converted = await ensureTextDerivativeAsset(runtime, attachment.assetId, attachment.semantic?.targetKind ?? 'plain_text')
    if (converted.changed) updated = true
  }
  return updated
}

async function ensureTextDerivativeAsset(
  runtime: DbWorkerRuntime,
  assetId: string,
  targetKind: string
): Promise<Readonly<{ changed: boolean }>> {
  const existing = runtime.fileDerivativeRepo.getLatestReady({ parentAssetId: assetId, derivedKind: 'extracted_text' })
  let derivative = existing
  if (!derivative) {
    const job = runtime.derivativeJobService.createDerivativeJob({
      id: randomUUID(),
      assetId,
      derivativeKind: 'extracted_text',
      taskFamily: 'chat_context',
      generator: 'step3-text-structured-conversion',
      configJson: { targetKind },
    })
    const ran = await runtime.derivativeJobService.runDerivativeJob({ jobId: job.id })
    if (ran.job.status !== 'ready' || !ran.derivative) {
      writeAssetConversionFailureMeta(runtime, assetId, ran.job.errorCode ?? 'derivative_output_write_failed', ran.job.errorMessage ?? 'Text conversion failed.')
      return { changed: true }
    }
    derivative = ran.derivative
  }
  if (!derivative) return { changed: false }
  const resolved = resolveManagedStoragePath(runtime.fileStorageRootDir, derivative.storageUri, {
    backend: 'local_fs',
    deletedAt: derivative.deletedAt,
  })
  if (resolved.kind !== 'ok') {
    writeAssetConversionFailureMeta(runtime, assetId, 'derivative_local_file_missing', 'Converted text derivative storage is unavailable.')
    return { changed: true }
  }
  const textBytes = new Uint8Array(await readFile(resolved.path))
  const contentHash = sha256Bytes(textBytes)
  const derivativeMeta = normalizeObject(derivative.metaJson)
  const sourceHash = readStringMeta(derivativeMeta, 'sourceHash')
  const settingsHash = sha256Bytes(Buffer.from(JSON.stringify({ targetKind })))
  writeAssetConversionReadyMeta(runtime, assetId, {
    targetKind,
    derivativeId: derivative.id,
    storageUri: derivative.storageUri,
    mime: derivative.mime ?? 'text/plain',
    bytes: textBytes.byteLength,
    contentHash,
    sourceHash,
    conversionSettingsHash: settingsHash,
  })
  return { changed: true }
}

function writeAssetConversionReadyMeta(
  runtime: DbWorkerRuntime,
  assetId: string,
  input: Readonly<{
    targetKind: string
    derivativeId: string
    storageUri: string
    mime: string
    bytes: number
    contentHash: string
    sourceHash: string | null
    conversionSettingsHash: string
  }>
): void {
  const row = runtime.db.prepare('SELECT source_meta_json AS sourceMetaJson FROM file_assets WHERE id=@id LIMIT 1').get({ id: assetId }) as { sourceMetaJson?: string | null } | undefined
  const existing = row?.sourceMetaJson ? safeParseJson(row.sourceMetaJson) : null
  const next = {
    ...(existing ?? {}),
    textConversion: {
      status: 'ready',
      targetKind: input.targetKind,
      derivedKind: 'extracted_text',
      usage: 'preview_and_send',
      derivativeId: input.derivativeId,
      storageUri: input.storageUri,
      mime: input.mime,
      bytes: input.bytes,
      contentHash: input.contentHash,
      sourceHash: input.sourceHash,
      conversionSettingsHash: input.conversionSettingsHash,
    },
    lineage: {
      ...(normalizeObject(existing?.lineage) ?? {}),
      stale: false,
      staleReason: null,
      previewOnly: false,
      sendAssetReady: true,
      sourceHash: input.sourceHash,
      previewContentHash: input.contentHash,
      sendContentHash: input.contentHash,
      conversionSettingsHash: input.conversionSettingsHash,
      sendTextStorageUri: input.storageUri,
      sendTextBytes: input.bytes,
      sendTextMime: input.mime,
      sendTextEncoding: 'utf-8',
    },
  }
  runtime.db.prepare(`
    UPDATE file_assets
    SET source_meta_json=@sourceMetaJson, updated_at=@updatedAt
    WHERE id=@id
  `).run({
    id: assetId,
    sourceMetaJson: JSON.stringify(next),
    updatedAt: Date.now(),
  })
}

function writeAssetConversionFailureMeta(
  runtime: DbWorkerRuntime,
  assetId: string,
  errorCode: string,
  errorMessage: string
): void {
  const row = runtime.db.prepare('SELECT source_meta_json AS sourceMetaJson FROM file_assets WHERE id=@id LIMIT 1').get({ id: assetId }) as { sourceMetaJson?: string | null } | undefined
  const existing = row?.sourceMetaJson ? safeParseJson(row.sourceMetaJson) : null
  const routeLevelOnly = isRouteLevelTextConversionFailure(errorCode)
  const existingLineage = normalizeObject(existing?.lineage) ?? {}
  const nextLineage = routeLevelOnly
    ? clearRouteLevelTextConversionStale(existingLineage)
    : {
        ...existingLineage,
        sendAssetReady: false,
        stale: true,
        staleReason: errorCode || 'send_asset_not_ready',
      }
  const next = {
    ...(existing ?? {}),
    textConversion: {
      status: 'failed',
      errorCode,
      errorMessage,
    },
    lineage: nextLineage,
  }
  runtime.db.prepare(`
    UPDATE file_assets
    SET source_meta_json=@sourceMetaJson, updated_at=@updatedAt
    WHERE id=@id
  `).run({
    id: assetId,
    sourceMetaJson: JSON.stringify(next),
    updatedAt: Date.now(),
  })
}

function isRouteLevelTextConversionFailure(errorCode: string): boolean {
  return errorCode === 'derivative_asset_not_supported'
}

function clearRouteLevelTextConversionStale(lineage: Record<string, any>): Record<string, any> {
  const next = { ...lineage }
  if (next.staleReason === 'derivative_asset_not_supported') {
    next.stale = false
    next.staleReason = null
    delete next.sendAssetReady
  }
  return next
}

function normalizeObject(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' ? value as Record<string, any> : null
}

function safeParseJson(value: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readStringMeta(meta: Record<string, any> | null, key: string): string | null {
  const value = meta?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isTextSemanticTarget(targetKind: string | null): boolean {
  return targetKind === 'plain_text' || targetKind === 'markdown' || targetKind === 'code' || targetKind === 'table_markdown'
}

const NON_RETRYABLE_TEXT_CONVERSION_ERRORS = new Set([
  'conversion_not_implemented',
  'derivative_asset_not_supported',
  'unsupported_processing_status',
])

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

async function buildPreviewPayload(runtime: DbWorkerRuntime, assetId: string, reused: boolean) {
  const derivative = runtime.derivativeJobService.getLatestReadyPreviewDerivative(assetId)
  if (!derivative) {
    return {
      assetId,
      status: 'missing',
      derivativeId: null,
      mime: null,
      dataUrl: null,
      width: null,
      height: null,
      bytes: null,
      reused,
      errorCode: null,
      errorMessage: null,
    } as const
  }

  const mime = typeof derivative.mime === 'string' && derivative.mime.trim().length > 0
    ? derivative.mime
    : 'image/png'
  const width = readNumberMeta(derivative.metaJson, 'previewWidth')
  const height = readNumberMeta(derivative.metaJson, 'previewHeight')
  const bytes = readNumberMeta(derivative.metaJson, 'previewBytes')
  const resolved = resolveManagedStoragePath(runtime.fileStorageRootDir, derivative.storageUri, {
    backend: 'local_fs',
    deletedAt: derivative.deletedAt,
  })
  if (resolved.kind !== 'ok') {
    return {
      assetId,
      status: 'failed',
      derivativeId: derivative.id,
      mime,
      dataUrl: null,
      width,
      height,
      bytes,
      reused,
      errorCode: 'preview_storage_unavailable',
      errorMessage: resolved.kind === 'invalid' ? resolved.message : 'Preview file is unavailable.',
    } as const
  }

  try {
    const fileBytes = await readFile(resolved.path)
    const dataUrl = `data:${mime};base64,${Buffer.from(fileBytes).toString('base64')}`
    return {
      assetId,
      status: 'ready',
      derivativeId: derivative.id,
      mime,
      dataUrl,
      width,
      height,
      bytes,
      reused,
      errorCode: null,
      errorMessage: null,
    } as const
  } catch (error) {
    return {
      assetId,
      status: 'failed',
      derivativeId: derivative.id,
      mime,
      dataUrl: null,
      width,
      height,
      bytes,
      reused,
      errorCode: 'preview_read_failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    } as const
  }
}

function readNumberMeta(meta: unknown, key: string): number | null {
  if (!meta || typeof meta !== 'object') return null
  const value = (meta as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
