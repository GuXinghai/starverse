import type { AiPayloadKind, DraftAttachmentSendModePreference, ModelCapability, SendMode } from '../../src/shared/files/fileTypes'
import type {
  AttachmentSemanticSummary,
  AttachmentLineageSummary,
  AttachmentCompatibilityDescriptor,
  AttachmentDisplayStatus,
  AttachmentPlanSource,
  SendPlan,
  SendPlanAttachment,
  SendPlanIssue,
  SendPlanModelDescriptor,
  SendPlanProviderContext,
} from '../../src/shared/files/sendPlanTypes'
import type {
  AttachmentCandidateSnapshot,
  AttachmentSnapshotItem,
  ConversationDraftRecord,
  FileAssetRecord,
  GetAttachmentCandidateSnapshotInput,
} from '../db/types'
import type { FileAssetRepo } from '../db/repo/fileAssetRepo'
import type { ConversationAttachmentService } from './conversationAttachmentService'

const SEND_PLANNER_VERSION = 'phase-5/v1'
const DEFAULT_PARSING_TIMEOUT_MS = 5 * 60 * 1000
const MAX_CONVERTED_TEXT_BYTES_HARD = 2 * 1024 * 1024
const INTERMEDIATE_INGEST_STATUSES = new Set(['pending', 'probing', 'materializing'])
const TERMINAL_FAILURE_INGEST_STATUSES = new Set(['probe_failed', 'materialization_failed', 'failed'])

type NormalizedProviderContext = Readonly<Required<Omit<SendPlanProviderContext, 'baseUrl' | 'preferredDraftSendModes'>> & Pick<SendPlanProviderContext, 'baseUrl'> & {
  preferredDraftSendModes: SendMode[]
}>

type DraftRestoreApi = Pick<ConversationAttachmentService, 'restoreDraft' | 'getCandidateAttachmentSnapshot'>
type FileAssetLookupApi = Pick<FileAssetRepo, 'listByIds'>

export type CollectCurrentSendInputsInput = Readonly<{
  conversationId: string
  draftText?: string
  historyScope?: GetAttachmentCandidateSnapshotInput | null
  model: SendPlanModelDescriptor
  providerContext: SendPlanProviderContext
}>

export type CollectedAttachmentInput = Readonly<{
  attachmentId: string
  assetId: string
  source: AttachmentPlanSource
  messageId: string | null
  aiPayloadKind: AiPayloadKind
  processingStatus: string
  includeInNextRequest: boolean
  excludedReason: string | null
  preferredSendMode: DraftAttachmentSendModePreference | null
  fileAsset: FileAssetRecord | null
  semantic?: AttachmentSemanticSummary | null
}>

export type CollectedSendInputs = Readonly<{
  conversationId: string
  draft: ConversationDraftRecord
  draftText: string
  draftAttachments: CollectedAttachmentInput[]
  historySnapshot: AttachmentCandidateSnapshot | null
  historyAttachments: CollectedAttachmentInput[]
  model: SendPlanModelDescriptor
  providerContext: NormalizedProviderContext
}>

export type AttachmentParsingGateResult = Readonly<{
  blocked: boolean
  pendingAttachments: Array<CollectedAttachmentInput>
  timedOutAttachments: Array<CollectedAttachmentInput>
  blockingReasons: SendPlanIssue[]
}>

export type AttachmentSendModeSelection = Readonly<{
  assetId: string
  source: AttachmentPlanSource
  selectedSendMode: SendMode | null
  fallbackSendModes: SendMode[]
  reasonCode: string | null
  notes: string[]
}>

type PlannedAttachmentBatch = Readonly<{
  attachmentPlans: SendPlanAttachment[]
  includedAttachments: Array<SendPlan['includedAttachments'][number]>
  excludedAttachments: Array<SendPlan['excludedAttachments'][number]>
  warnings: SendPlanIssue[]
  blockingReasons: SendPlanIssue[]
  includedAssetIds: Set<string>
}>

type EligibilityEvaluationMode = 'legacy' | 'semantic'

export type SendPlanServiceDeps = Readonly<{
  conversationAttachmentService: DraftRestoreApi
  fileAssetRepo: FileAssetLookupApi
  now?: () => number
  parsingTimeoutMs?: number
}>

export class SendPlanService {
  private readonly now: () => number
  private readonly parsingTimeoutMs: number

  constructor(private readonly deps: SendPlanServiceDeps) {
    this.now = deps.now ?? Date.now
    this.parsingTimeoutMs = deps.parsingTimeoutMs ?? DEFAULT_PARSING_TIMEOUT_MS
  }

  collectCurrentSendInputs(input: CollectCurrentSendInputsInput): CollectedSendInputs {
    const conversationId = requireNonEmpty(input.conversationId, 'conversationId')
    const draft = this.deps.conversationAttachmentService.restoreDraft({ conversationId })
    const draftAssets = this.deps.fileAssetRepo.listByIds({ ids: draft.attachedAssetIds })
    const draftAssetMap = new Map(draftAssets.map((asset) => [asset.id, asset]))
    const historySnapshot = input.historyScope
      ? this.deps.conversationAttachmentService.getCandidateAttachmentSnapshot(input.historyScope)
      : null
    const historyAssetIds = historySnapshot ? Array.from(new Set(historySnapshot.items.map((item) => item.assetId))) : []
    const historyAssets = historyAssetIds.length > 0 ? this.deps.fileAssetRepo.listByIds({ ids: historyAssetIds }) : []
    const historyAssetMap = new Map(historyAssets.map((asset) => [asset.id, asset]))

    const draftText = input.draftText !== undefined ? String(input.draftText) : draft.draftText
    return {
      conversationId,
      draft,
      draftText,
      draftAttachments: draft.attachments.map((attachment) => ({
        attachmentId: attachment.id,
        assetId: attachment.assetId,
        source: 'draft',
        messageId: null,
        aiPayloadKind: attachment.aiPayloadKind,
        processingStatus: attachment.processingStatus,
        includeInNextRequest: attachment.includeInNextRequest,
        excludedReason: attachment.excludedReason,
        preferredSendMode: attachment.preferredSendMode ?? null,
        fileAsset: draftAssetMap.get(attachment.assetId) ?? null,
        semantic: buildDefaultSemanticSummary(attachment, draftAssetMap.get(attachment.assetId) ?? null),
      })),
      historySnapshot,
      historyAttachments: historySnapshot
        ? historySnapshot.items.map((item) => mapHistoryAttachment(item, historyAssetMap.get(item.assetId) ?? null))
        : [],
      model: normalizeModelDescriptor(input.model),
      providerContext: normalizeProviderContext(input.providerContext),
    }
  }

  evaluateAttachmentParsingGate(input: CollectedSendInputs): AttachmentParsingGateResult {
    const pendingAttachments: CollectedAttachmentInput[] = []
    const timedOutAttachments: CollectedAttachmentInput[] = []
    const blockingReasons: SendPlanIssue[] = []

    for (const attachment of allAttachments(input)) {
      if (!attachment.includeInNextRequest) continue
      if (attachment.excludedReason && attachment.source === 'history') continue
      const asset = attachment.fileAsset
      if (!asset) continue
      if (!INTERMEDIATE_INGEST_STATUSES.has(asset.ingestStatus)) continue
      if (isTimedOutParsing(asset, this.now(), this.parsingTimeoutMs)) {
        timedOutAttachments.push(attachment)
        continue
      }
      pendingAttachments.push(attachment)
      blockingReasons.push(issue(
        'attachment_parsing_incomplete',
        attachment.assetId,
        attachment.source,
        `Attachment ${attachment.assetId} is still in parsing state (${asset.ingestStatus}).`
      ))
    }

    return {
      blocked: pendingAttachments.length > 0,
      pendingAttachments,
      timedOutAttachments,
      blockingReasons,
    }
  }

  evaluateAttachmentCompatibility(input: CollectedSendInputs): AttachmentCompatibilityDescriptor[] {
    const modelCapabilities = modelCapabilitiesFromDescriptor(input.model)
    return allAttachments(input).map((attachment) => evaluateCompatibilityForAttachment(attachment, modelCapabilities, input.providerContext))
  }

  selectAttachmentSendMode(
    attachment: CollectedAttachmentInput,
    model: SendPlanModelDescriptor,
    providerContext: SendPlanProviderContext
  ): AttachmentSendModeSelection {
    const normalizedProviderContext = normalizeProviderContext(providerContext)
    const normalizedModel = normalizeModelDescriptor(model)
    const compatibility = evaluateCompatibilityForAttachment(
      attachment,
      modelCapabilitiesFromDescriptor(normalizedModel),
      normalizedProviderContext
    )
    if (!compatibility.compatible) {
      return {
        assetId: attachment.assetId,
        source: attachment.source,
        selectedSendMode: null,
        fallbackSendModes: [],
        reasonCode: compatibility.reasonCode,
        notes: [],
      }
    }
    return selectAttachmentSendModeInternal(attachment, normalizedProviderContext)
  }

  buildSendPlan(input: CollectedSendInputs): SendPlan {
    const parsingGate = this.evaluateAttachmentParsingGate(input)
    const compatibilityByAsset = new Map(
      this.evaluateAttachmentCompatibility(input).map((item) => [compatibilityKey(item.assetId, item.source), item])
    )
    const draftBatch = this.planDraftAttachments(input, parsingGate, compatibilityByAsset)
    const historyBatch = this.planHistoryAttachments(input, parsingGate, compatibilityByAsset, draftBatch.includedAssetIds)

    const trimmedDraftText = input.draftText.trim()
    const attachmentPlans = [...draftBatch.attachmentPlans, ...historyBatch.attachmentPlans]
    const includedAttachments = [...draftBatch.includedAttachments, ...historyBatch.includedAttachments]
    const excludedAttachments = [...draftBatch.excludedAttachments, ...historyBatch.excludedAttachments]
    const includedDraftPlans = draftBatch.attachmentPlans.filter(
      (plan) => plan.source === 'draft' && (plan.eligibility === 'included' || plan.eligibility === 'warning')
    )
    const excludedDraftPlans = draftBatch.attachmentPlans.filter(
      (plan) =>
        plan.source === 'draft' &&
        plan.exclusionReason !== null &&
        plan.exclusionReason !== 'manually_excluded'
    )
    const hasEffectiveCurrentInput = trimmedDraftText.length > 0 || includedDraftPlans.length > 0
    const blockingReasons = [...parsingGate.blockingReasons, ...draftBatch.blockingReasons, ...historyBatch.blockingReasons]
    if (!parsingGate.blocked && !hasEffectiveCurrentInput) {
      const currentModelBlocked = excludedDraftPlans.some((plan) => plan.exclusionReason === 'incompatible_with_current_model')
      blockingReasons.push(issue(
        currentModelBlocked ? 'current_draft_incompatible_with_current_model' : 'no_sendable_current_input',
        null,
        'request',
        currentModelBlocked
          ? 'Current draft input is incompatible with the selected model.'
          : 'Current draft has no sendable text or attachment input.'
      ))
    }

    const uniqueWarnings = dedupeIssues([...draftBatch.warnings, ...historyBatch.warnings])
    const uniqueBlockingReasons = dedupeIssues(blockingReasons)
    const status = resolveSendPlanStatus({
      blockingReasons: uniqueBlockingReasons,
      hasEffectiveCurrentInput,
      excludedDraftPlans,
      warnings: uniqueWarnings,
    })

    return {
      status,
      warnings: uniqueWarnings,
      blockingReasons: uniqueBlockingReasons,
      includedAttachments,
      excludedAttachments,
      attachmentPlans,
      requiresModelChange:
        uniqueBlockingReasons.some((reason) => reason.code === 'current_draft_incompatible_with_current_model'),
      canProceedAfterDroppingExcluded: status === 'partially_sendable',
      requiresUserConfirmation: status === 'sendable_with_warnings' || status === 'partially_sendable',
      plannerVersion: SEND_PLANNER_VERSION,
    }
  }

  recomputeEligibilityOnAttachmentResolved(input: CollectCurrentSendInputsInput | CollectedSendInputs): SendPlan {
    return this.buildSendPlan(isCollectedInput(input) ? input : this.collectCurrentSendInputs(input))
  }

  recomputeEligibilityOnModelChanged(input: CollectCurrentSendInputsInput | CollectedSendInputs): SendPlan {
    return this.buildSendPlan(isCollectedInput(input) ? input : this.collectCurrentSendInputs(input))
  }

  private buildDraftAttachmentPlan(
    attachment: CollectedAttachmentInput,
    compatibility: AttachmentCompatibilityDescriptor,
    parsingGate: AttachmentParsingGateResult,
    providerContext: NormalizedProviderContext
  ): SendPlanAttachment {
    const lineageGate = evaluateAttachmentLineageGuard(attachment)
    if (!attachment.includeInNextRequest) {
      return excludedPlan(attachment, 'manually_excluded', 'ready', false, ['Attachment is manually excluded from the next request.'], lineageGate.lineage)
    }
    if (parsingGate.pendingAttachments.some((item) => sameAttachment(item, attachment))) {
      return blockedPlan(attachment, 'parsing', 'attachment_parsing_incomplete', [
        `Attachment ${attachment.assetId} is still parsing and blocks the current send.`,
      ])
    }
    if (!attachment.fileAsset) {
      return excludedPlan(attachment, 'asset_record_missing', 'failed', true, ['Attachment asset metadata is missing.'], lineageGate.lineage)
    }
    if (attachment.fileAsset.deletedAt != null || attachment.fileAsset.ingestStatus === 'deleted') {
      return excludedPlan(attachment, 'asset_soft_deleted', 'failed', true, ['Attachment asset has been soft deleted.'], lineageGate.lineage)
    }
    if (lineageGate.blocked) {
      return blockedPlan(
        attachment,
        'failed',
        lineageGate.reasonCode ?? 'attachment_lineage_blocked',
        lineageGate.notes,
        lineageGate.lineage
      )
    }
    if (!compatibility.compatible) {
      return excludedPlan(attachment, 'incompatible_with_current_model', 'incompatible_with_current_model', true, [
        compatibilityMessage(attachment, compatibility),
      ], lineageGate.lineage)
    }
    const hardGateReason = evaluateConvertedTextHardGate(attachment)
    if (hardGateReason) {
      return blockedPlan(attachment, 'failed', 'converted_text_hard_limit_exceeded', [hardGateReason], lineageGate.lineage)
    }
    const modeSelection = selectAttachmentSendModeInternal(attachment, providerContext)
    if (!modeSelection.selectedSendMode) {
      return excludedPlan(attachment, modeSelection.reasonCode ?? 'no_send_mode_available', deriveDisplayStatus(attachment, false, []), true, [
        ...modeSelection.notes,
        noSendModeMessage(attachment, modeSelection.reasonCode),
      ], lineageGate.lineage)
    }
    const notes = [...baseAttachmentNotes(attachment), ...modeSelection.notes]
    return includedPlan(attachment, modeSelection.selectedSendMode, modeSelection.fallbackSendModes, notes, lineageGate.lineage)
  }

  private buildHistoryAttachmentPlan(
    attachment: CollectedAttachmentInput,
    compatibility: AttachmentCompatibilityDescriptor,
    parsingGate: AttachmentParsingGateResult,
    providerContext: NormalizedProviderContext,
    dedupeReason: string | null
  ): SendPlanAttachment {
    const lineageGate = evaluateAttachmentLineageGuard(attachment)
    if (dedupeReason) {
      return excludedPlan(attachment, dedupeReason, 'ready', false, ['Attachment is already represented by a higher-priority input.'], lineageGate.lineage)
    }
    if (!attachment.includeInNextRequest || attachment.excludedReason) {
      return excludedPlan(
        attachment,
        attachment.excludedReason ?? 'history_attachment_excluded',
        deriveDisplayStatus(attachment, false, []),
        shouldWarnForHistoryExclusion(attachment.excludedReason),
        [`History attachment ${attachment.assetId} is excluded from the current semantic snapshot.`]
        ,
        lineageGate.lineage
      )
    }
    if (parsingGate.pendingAttachments.some((item) => sameAttachment(item, attachment))) {
      return blockedPlan(attachment, 'parsing', 'attachment_parsing_incomplete', [
        `History attachment ${attachment.assetId} is still parsing and blocks the current send.`,
      ])
    }
    if (!attachment.fileAsset) {
      return excludedPlan(attachment, 'asset_record_missing', 'failed', true, ['History attachment asset metadata is missing.'], lineageGate.lineage)
    }
    if (attachment.fileAsset.deletedAt != null || attachment.fileAsset.ingestStatus === 'deleted') {
      return excludedPlan(attachment, 'asset_soft_deleted', 'failed', true, ['History attachment asset has been soft deleted.'], lineageGate.lineage)
    }
    if (lineageGate.blocked) {
      return blockedPlan(
        attachment,
        'failed',
        lineageGate.reasonCode ?? 'attachment_lineage_blocked',
        lineageGate.notes,
        lineageGate.lineage
      )
    }
    if (!compatibility.compatible) {
      return excludedPlan(attachment, 'incompatible_with_current_model', 'incompatible_with_current_model', true, [
        compatibilityMessage(attachment, compatibility),
      ], lineageGate.lineage)
    }
    const hardGateReason = evaluateConvertedTextHardGate(attachment)
    if (hardGateReason) {
      return blockedPlan(attachment, 'failed', 'converted_text_hard_limit_exceeded', [hardGateReason], lineageGate.lineage)
    }
    const modeSelection = selectAttachmentSendModeInternal(attachment, providerContext)
    if (!modeSelection.selectedSendMode) {
      return excludedPlan(attachment, modeSelection.reasonCode ?? 'no_send_mode_available', deriveDisplayStatus(attachment, false, []), true, [
        ...modeSelection.notes,
        noSendModeMessage(attachment, modeSelection.reasonCode),
      ], lineageGate.lineage)
    }
    const notes = [...baseAttachmentNotes(attachment), ...modeSelection.notes]
    return includedPlan(attachment, modeSelection.selectedSendMode, modeSelection.fallbackSendModes, notes, lineageGate.lineage)
  }

  private planDraftAttachments(
    input: CollectedSendInputs,
    parsingGate: AttachmentParsingGateResult,
    compatibilityByAsset: Map<string, AttachmentCompatibilityDescriptor>
  ): PlannedAttachmentBatch {
    const attachmentPlans: SendPlanAttachment[] = []
    const includedAttachments: Array<SendPlan['includedAttachments'][number]> = []
    const excludedAttachments: Array<SendPlan['excludedAttachments'][number]> = []
    const warnings: SendPlanIssue[] = []
    const blockingReasons: SendPlanIssue[] = []
    const includedAssetIds = new Set<string>()

    for (const attachment of input.draftAttachments) {
      const compatibility = compatibilityByAsset.get(compatibilityKey(attachment.assetId, attachment.source))!
      const plan = this.buildDraftAttachmentPlan(attachment, compatibility, parsingGate, input.providerContext)
      attachmentPlans.push(plan)
      applyAttachmentPlan(plan, attachment, includedAttachments, excludedAttachments, warnings)
      if (plan.eligibility === 'included' || plan.eligibility === 'warning') {
        includedAssetIds.add(attachment.assetId)
      }
      if (plan.eligibility === 'blocked') {
        blockingReasons.push(issue(
          'draft_attachment_blocked',
          attachment.assetId,
          'draft',
          plan.notes[0] ?? `Current draft attachment ${attachment.assetId} is blocked.`
        ))
      }
    }

    return {
      attachmentPlans,
      includedAttachments,
      excludedAttachments,
      warnings,
      blockingReasons,
      includedAssetIds,
    }
  }

  private planHistoryAttachments(
    input: CollectedSendInputs,
    parsingGate: AttachmentParsingGateResult,
    compatibilityByAsset: Map<string, AttachmentCompatibilityDescriptor>,
    includedDraftAssetIds: Set<string>
  ): PlannedAttachmentBatch {
    const attachmentPlans: SendPlanAttachment[] = []
    const includedAttachments: Array<SendPlan['includedAttachments'][number]> = []
    const excludedAttachments: Array<SendPlan['excludedAttachments'][number]> = []
    const warnings: SendPlanIssue[] = []
    const blockingReasons: SendPlanIssue[] = []
    const includedAssetIds = new Set<string>()

    for (const attachment of input.historyAttachments) {
      const compatibility = compatibilityByAsset.get(compatibilityKey(attachment.assetId, attachment.source))!
      const dedupeReason =
        includedDraftAssetIds.has(attachment.assetId)
          ? 'deduped_to_current_draft'
          : includedAssetIds.has(attachment.assetId)
            ? 'duplicate_history_asset'
            : null
      const plan = this.buildHistoryAttachmentPlan(
        attachment,
        compatibility,
        parsingGate,
        input.providerContext,
        dedupeReason
      )
      attachmentPlans.push(plan)
      applyAttachmentPlan(plan, attachment, includedAttachments, excludedAttachments, warnings)
      if (plan.eligibility === 'included' || plan.eligibility === 'warning') {
        includedAssetIds.add(attachment.assetId)
      }
      if (plan.eligibility === 'blocked') {
        blockingReasons.push(issue(
          'history_attachment_blocked',
          attachment.assetId,
          'history',
          plan.notes[0] ?? `History attachment ${attachment.assetId} is blocked.`
        ))
      }
    }

    return {
      attachmentPlans,
      includedAttachments,
      excludedAttachments,
      warnings,
      blockingReasons,
      includedAssetIds,
    }
  }
}

function mapHistoryAttachment(
  item: AttachmentSnapshotItem,
  fileAsset: FileAssetRecord | null
): CollectedAttachmentInput {
  const base = {
    attachmentId: item.attachmentId,
    assetId: item.assetId,
    source: 'history',
    messageId: item.messageId,
    aiPayloadKind: item.aiPayloadKind,
    processingStatus: item.processingStatus,
    includeInNextRequest: item.included,
    excludedReason: item.excludedReason,
    preferredSendMode: null,
    fileAsset,
  } satisfies Omit<CollectedAttachmentInput, 'semantic'>
  return {
    ...base,
    semantic: buildDefaultSemanticSummary(base, fileAsset),
  }
}

function normalizeModelDescriptor(model: SendPlanModelDescriptor): SendPlanModelDescriptor {
  return {
    providerKey: requireNonEmpty(model.providerKey, 'model.providerKey'),
    modelId: requireNonEmpty(model.modelId, 'model.modelId'),
    modelKey: requireNonEmpty(model.modelKey, 'model.modelKey'),
    inputModalities: normalizeStringArray(model.inputModalities),
    outputModalities: normalizeStringArray(model.outputModalities ?? []),
  }
}

function normalizeProviderContext(context: SendPlanProviderContext): NormalizedProviderContext {
  return {
    providerKey: requireNonEmpty(context.providerKey, 'providerContext.providerKey'),
    baseUrl: typeof context.baseUrl === 'string' ? context.baseUrl : null,
    supportsImageUrlRef: context.supportsImageUrlRef ?? true,
    supportsPdfInputs: context.supportsPdfInputs ?? true,
    supportsPdfUrlRef: context.supportsPdfUrlRef ?? true,
    supportsTextUrlRef: context.supportsTextUrlRef ?? true,
    supportsVideoUrlRef: context.supportsVideoUrlRef ?? false,
    supportsInlineData: context.supportsInlineData ?? true,
    supportsProviderFileRef: context.supportsProviderFileRef ?? false,
    preferredDraftSendModes: context.preferredDraftSendModes?.length
      ? dedupeSendModes(context.preferredDraftSendModes)
      : ['url_ref', 'inline_base64'],
  }
}

function allAttachments(input: CollectedSendInputs): CollectedAttachmentInput[] {
  return [...input.draftAttachments, ...input.historyAttachments]
}

function modelCapabilitiesFromDescriptor(model: SendPlanModelDescriptor): Set<ModelCapability> {
  const capabilities = new Set<ModelCapability>()
  for (const modality of model.inputModalities) {
    const normalized = modality.toLowerCase()
    if (normalized === 'text') capabilities.add('text_in')
    if (normalized === 'image') capabilities.add('image_in')
    if (normalized === 'audio') capabilities.add('audio_in')
    if (normalized === 'video') capabilities.add('video_in')
    if (normalized === 'file') capabilities.add('file_in')
  }
  return capabilities
}

function evaluateCompatibilityForAttachment(
  attachment: CollectedAttachmentInput,
  modelCapabilities: Set<ModelCapability>,
  providerContext: NormalizedProviderContext
): AttachmentCompatibilityDescriptor {
  const mode = resolveEligibilityEvaluationMode(attachment)
  return evaluateAttachmentCompatibilityByMode(attachment, modelCapabilities, providerContext, mode)
}

function evaluateAttachmentCompatibilityByMode(
  attachment: CollectedAttachmentInput,
  modelCapabilities: Set<ModelCapability>,
  providerContext: NormalizedProviderContext,
  mode: EligibilityEvaluationMode
): AttachmentCompatibilityDescriptor {
  if (mode === 'semantic') {
    const semantic = resolveAttachmentSemanticSummary(attachment)
    if (semantic) {
      return evaluateCompatibilityFromSemantic(attachment, modelCapabilities, providerContext, semantic)
    }
    return evaluateCompatibilityFromLegacy(attachment, modelCapabilities, providerContext)
  }
  return evaluateCompatibilityFromLegacy(attachment, modelCapabilities, providerContext)
}

function evaluateCompatibilityFromLegacy(
  attachment: CollectedAttachmentInput,
  modelCapabilities: Set<ModelCapability>,
  providerContext: NormalizedProviderContext
): AttachmentCompatibilityDescriptor {
  const acceptedCapabilitySets = capabilitySetsForLegacyAttachment(attachment, providerContext)
  const reasonCodeFromStatus = compatibilityReasonFromProcessingStatus(attachment.processingStatus)
  if (reasonCodeFromStatus) {
    return {
      assetId: attachment.assetId,
      source: attachment.source,
      compatible: false,
      reasonCode: reasonCodeFromStatus,
      missingCapabilities: [],
      acceptedCapabilitySets,
    }
  }

  if (acceptedCapabilitySets.length === 0) {
    return {
      assetId: attachment.assetId,
      source: attachment.source,
      compatible: false,
      reasonCode: 'unsupported_attachment_payload',
      missingCapabilities: [],
      acceptedCapabilitySets,
    }
  }

  const satisfied = acceptedCapabilitySets.find((set) => set.every((capability) => modelCapabilities.has(capability)))
  if (satisfied) {
    return {
      assetId: attachment.assetId,
      source: attachment.source,
      compatible: true,
      reasonCode: null,
      missingCapabilities: [],
      acceptedCapabilitySets,
    }
  }

  const bestSet = acceptedCapabilitySets.reduce<ModelCapability[]>((best, current) => {
    if (best.length === 0 || current.length < best.length) return current
    return best
  }, [])
  return {
    assetId: attachment.assetId,
    source: attachment.source,
    compatible: false,
    reasonCode: missingCapabilityReason(attachment.aiPayloadKind),
    missingCapabilities: bestSet.filter((capability) => !modelCapabilities.has(capability)),
    acceptedCapabilitySets,
  }
}

function evaluateCompatibilityFromSemantic(
  attachment: CollectedAttachmentInput,
  modelCapabilities: Set<ModelCapability>,
  providerContext: NormalizedProviderContext,
  semantic: AttachmentSemanticSummary = buildAttachmentSemanticSummary(attachment)
): AttachmentCompatibilityDescriptor {
  const acceptedCapabilitySets = capabilitySetsForSemantic(semantic, providerContext)
  const reasonCodeFromStatus = compatibilityReasonFromProcessingStatusForSemantic(attachment, semantic)
  if (reasonCodeFromStatus) {
    return {
      assetId: attachment.assetId,
      source: attachment.source,
      compatible: false,
      reasonCode: reasonCodeFromStatus,
      missingCapabilities: [],
      acceptedCapabilitySets,
    }
  }

  if (semantic.sendStrategy === 'unsupported') {
    return {
      assetId: attachment.assetId,
      source: attachment.source,
      compatible: false,
      reasonCode: 'unsupported_attachment_payload',
      missingCapabilities: [],
      acceptedCapabilitySets,
    }
  }

  if (acceptedCapabilitySets.length === 0) {
    return {
      assetId: attachment.assetId,
      source: attachment.source,
      compatible: false,
      reasonCode: semanticCompatibilityMissingReason(semantic),
      missingCapabilities: [],
      acceptedCapabilitySets,
    }
  }

  const satisfied = acceptedCapabilitySets.find((set) => set.every((capability) => modelCapabilities.has(capability)))
  if (satisfied) {
    return {
      assetId: attachment.assetId,
      source: attachment.source,
      compatible: true,
      reasonCode: null,
      missingCapabilities: [],
      acceptedCapabilitySets,
    }
  }

  const bestSet = acceptedCapabilitySets.reduce<ModelCapability[]>((best, current) => {
    if (best.length === 0 || current.length < best.length) return current
    return best
  }, [])
  return {
    assetId: attachment.assetId,
    source: attachment.source,
    compatible: false,
    reasonCode: semanticCompatibilityMissingReason(semantic),
    missingCapabilities: bestSet.filter((capability) => !modelCapabilities.has(capability)),
    acceptedCapabilitySets,
  }
}

function capabilitySetsForLegacyAttachment(
  attachment: CollectedAttachmentInput,
  providerContext: NormalizedProviderContext
): ModelCapability[][] {
  switch (attachment.aiPayloadKind) {
    case 'text':
      return [['text_in']]
    case 'image':
      return [['image_in']]
    case 'audio':
      return [['audio_in']]
    case 'video':
      return [['video_in']]
    case 'pdf':
      if (!providerContext.supportsPdfInputs) return []
      return [['file_in']]
    case 'binary':
    default:
      return []
  }
}

function capabilitySetsForSemantic(
  semantic: AttachmentSemanticSummary,
  providerContext: NormalizedProviderContext
): ModelCapability[][] {
  if (semantic.sendStrategy === 'unsupported') return []

  switch (semantic.sendStrategy) {
    case 'text_in_prompt':
      return [['text_in']]
    case 'file_attachment':
      if (semantic.targetKind === 'pdf_attachment') {
        if (!providerContext.supportsPdfInputs) return []
        return [['file_in']]
      }
      return [['file_in']]
    case 'mixed':
      return [['text_in', 'file_in']]
    case 'unsupported':
    default:
      return []
  }
}

function compatibilityReasonFromProcessingStatus(processingStatus: string): string | null {
  if (processingStatus === 'unsupported') return 'unsupported_processing_status'
  if (processingStatus === 'convertible') return 'conversion_required_before_send'
  return null
}

function compatibilityReasonFromProcessingStatusForSemantic(
  attachment: CollectedAttachmentInput,
  semantic: AttachmentSemanticSummary
): string | null {
  if (attachment.processingStatus === 'unsupported') return 'unsupported_processing_status'
  if (attachment.processingStatus !== 'convertible') return null
  if (semantic.sendStrategy === 'text_in_prompt' && hasReadyTextConversionAsset(attachment, semantic)) return null
  if (semantic.sendStrategy === 'mixed' && hasReadyMixedConversionAssets(attachment, semantic)) return null
  return 'conversion_required_before_send'
}

function semanticCompatibilityMissingReason(semantic: AttachmentSemanticSummary): string {
  if (semantic.sendStrategy === 'text_in_prompt') return 'missing_text_input_capability'
  if (semantic.sendStrategy === 'mixed') return 'missing_mixed_input_capability'
  if (semantic.targetKind === 'pdf_attachment') return 'missing_pdf_input_capability'
  if (semantic.sendStrategy === 'file_attachment') return 'missing_file_input_capability'
  return 'unsupported_attachment_payload'
}

function missingCapabilityReason(aiPayloadKind: AiPayloadKind): string {
  switch (aiPayloadKind) {
    case 'text':
      return 'missing_text_input_capability'
    case 'image':
      return 'missing_image_input_capability'
    case 'audio':
      return 'missing_audio_input_capability'
    case 'video':
      return 'missing_video_input_capability'
    case 'pdf':
      return 'missing_pdf_input_capability'
    case 'binary':
    default:
      return 'unsupported_attachment_payload'
  }
}

function selectAttachmentSendModeInternal(
  attachment: CollectedAttachmentInput,
  providerContext: NormalizedProviderContext
): AttachmentSendModeSelection {
  const asset = attachment.fileAsset
  if (!asset) {
    return noModeSelection(attachment, 'asset_record_missing', ['Attachment asset metadata is missing.'])
  }
  if (asset.deletedAt != null || asset.ingestStatus === 'deleted') {
    return noModeSelection(attachment, 'asset_soft_deleted', ['Attachment asset has been soft deleted.'])
  }
  const semantic = resolveAttachmentSemanticSummary(attachment) ?? buildAttachmentSemanticSummary(attachment)
  if (attachment.processingStatus === 'convertible' && !hasReadyTextConversionAsset(attachment, semantic)) {
    return noModeSelection(attachment, 'conversion_required_before_send', ['Attachment requires conversion before it can be sent.'])
  }
  if (attachment.processingStatus === 'unsupported' || attachment.aiPayloadKind === 'binary') {
    return noModeSelection(attachment, 'unsupported_processing_status', ['Attachment is not directly sendable in the current pipeline phase.'])
  }

  const url = resolveUrlReference(asset)
  const hasLocalCopy = hasStoredLocalCopy(asset)
  const modesOrFailure = candidateModesForAttachment(
    attachment.aiPayloadKind,
    semantic,
    url,
    hasLocalCopy,
    providerContext,
    hasReadyTextConversionAsset(attachment, semantic),
    hasReadyMixedConversionAssets(attachment, semantic)
  )
  if ('reasonCode' in modesOrFailure) {
    return noModeSelection(attachment, modesOrFailure.reasonCode, modesOrFailure.notes)
  }

  const ordered = orderModes(
    modesOrFailure.modes,
    attachment.source,
    providerContext.preferredDraftSendModes,
    resolvePreferredAttachmentSendMode(attachment.preferredSendMode)
  )
  if (ordered.length === 0) {
    return noModeSelection(attachment, noModeReason(attachment.aiPayloadKind, url !== null, hasLocalCopy), noModeNotes(attachment.aiPayloadKind, url !== null, hasLocalCopy))
  }

  return {
    assetId: attachment.assetId,
    source: attachment.source,
    selectedSendMode: ordered[0],
    fallbackSendModes: ordered.slice(1),
    reasonCode: null,
    notes: [],
  }
}

function candidateModesForAttachment(
  aiPayloadKind: AiPayloadKind,
  semantic: AttachmentSemanticSummary,
  url: string | null,
  hasLocalCopy: boolean,
  providerContext: NormalizedProviderContext,
  hasReadyTextConversion: boolean,
  hasReadyMixedConversion: boolean
): Readonly<{ modes: SendMode[] }> | Readonly<{ reasonCode: string; notes: string[] }> {
  if (semantic.sendStrategy === 'mixed') {
    if (aiPayloadKind === 'text') {
      return {
        reasonCode: 'unsupported_processing_status',
        notes: ['Hybrid strategy requires a file/PDF send asset and will not downgrade to text-only.'],
      }
    }
    if (!hasReadyMixedConversion) {
      return {
        reasonCode: 'conversion_required_before_send',
        notes: ['Hybrid attachment requires both ready converted text and a ready file/PDF send asset.'],
      }
    }
    if (aiPayloadKind === 'pdf' && !providerContext.supportsPdfInputs) {
      return {
        reasonCode: 'pdf_not_supported_by_provider',
        notes: ['Current provider context does not allow PDF inputs.'],
      }
    }
    return {
      modes: aiPayloadKind === 'pdf'
        ? pdfModes(url, hasLocalCopy, providerContext)
        : nativeFileModes(url, hasLocalCopy, providerContext),
    }
  }

  if (aiPayloadKind === 'pdf' && !providerContext.supportsPdfInputs) {
    return {
      reasonCode: 'pdf_not_supported_by_provider',
      notes: ['Current provider context does not allow PDF inputs.'],
    }
  }

  switch (aiPayloadKind) {
    case 'image':
      return { modes: imageModes(url, hasLocalCopy, providerContext) }
    case 'pdf':
      return { modes: pdfModes(url, hasLocalCopy, providerContext) }
    case 'text':
      return { modes: textModes(url, hasLocalCopy, providerContext, hasReadyTextConversion) }
    case 'audio':
      return { modes: audioModes(hasLocalCopy, providerContext) }
    case 'video':
      return { modes: videoModes(url, hasLocalCopy, providerContext) }
    case 'binary':
    default:
      return { modes: [] }
  }
}

function imageModes(url: string | null, hasLocalCopy: boolean, providerContext: NormalizedProviderContext): SendMode[] {
  return [
    ...(providerContext.supportsImageUrlRef && url ? ['url_ref' as const] : []),
    ...(providerContext.supportsInlineData && hasLocalCopy ? ['inline_base64' as const] : []),
  ]
}

function pdfModes(url: string | null, hasLocalCopy: boolean, providerContext: NormalizedProviderContext): SendMode[] {
  return [
    ...(providerContext.supportsPdfUrlRef && url ? ['url_ref' as const] : []),
    ...(providerContext.supportsInlineData && hasLocalCopy ? ['inline_base64' as const] : []),
  ]
}

function textModes(
  url: string | null,
  hasLocalCopy: boolean,
  providerContext: NormalizedProviderContext,
  hasReadyTextConversion: boolean
): SendMode[] {
  return [
    ...(providerContext.supportsInlineData && (hasLocalCopy || hasReadyTextConversion) ? ['inline_base64' as const] : []),
    ...(providerContext.supportsTextUrlRef && url ? ['url_ref' as const] : []),
  ]
}

function audioModes(hasLocalCopy: boolean, providerContext: NormalizedProviderContext): SendMode[] {
  return providerContext.supportsInlineData && hasLocalCopy ? ['inline_base64'] : []
}

function videoModes(url: string | null, hasLocalCopy: boolean, providerContext: NormalizedProviderContext): SendMode[] {
  return [
    ...(providerContext.supportsVideoUrlRef && url ? ['url_ref' as const] : []),
    ...(providerContext.supportsInlineData && hasLocalCopy ? ['inline_base64' as const] : []),
  ]
}

function nativeFileModes(url: string | null, hasLocalCopy: boolean, providerContext: NormalizedProviderContext): SendMode[] {
  return [
    ...(url ? ['url_ref' as const] : []),
    ...(providerContext.supportsInlineData && hasLocalCopy ? ['inline_base64' as const] : []),
  ]
}

function resolvePreferredAttachmentSendMode(
  preference: DraftAttachmentSendModePreference | null
): SendMode | null {
  if (preference === 'url_ref') return 'url_ref'
  if (preference === 'inline_base64') return 'inline_base64'
  return null
}

function orderModes(
  modes: SendMode[],
  source: AttachmentPlanSource,
  preferredDraftModes: SendMode[],
  preferredAttachmentMode: SendMode | null
): SendMode[] {
  const unique = dedupeSendModes(modes)
  if (source === 'history') return unique
  const order = new Map(preferredDraftModes.map((mode, index) => [mode, index]))
  return [...unique].sort((left, right) => {
    if (preferredAttachmentMode) {
      if (left === preferredAttachmentMode) return -1
      if (right === preferredAttachmentMode) return 1
    }
    return (order.get(left) ?? 99) - (order.get(right) ?? 99)
  })
}

function baseAttachmentNotes(attachment: CollectedAttachmentInput): string[] {
  const asset = attachment.fileAsset
  if (!asset) return []
  const meta = parseUrlMeta(asset)
  const notes: string[] = []
  if (isTimedOutParsing(asset, Date.now(), Number.MAX_SAFE_INTEGER)) return notes
  if (asset.ingestStatus === 'probe_failed' || meta.probeStatus === 'probe_failed') {
    notes.push('Current device could not complete URL probing; URL reference is still retained.')
  }
  if (asset.ingestStatus === 'materialization_failed' || meta.materializationStatus === 'materialization_failed') {
    notes.push('Current device could not save a local file copy; URL reference is still retained.')
  }
  if (asset.ingestStatus === 'failed') {
    notes.push('Attachment ingestion failed on this device. Remove or retry before sending it as a file.')
  }
  return notes
}

function deriveDisplayStatus(
  attachment: CollectedAttachmentInput,
  compatible: boolean,
  notes: string[]
): AttachmentDisplayStatus {
  const asset = attachment.fileAsset
  if (!asset) return 'failed'
  if (INTERMEDIATE_INGEST_STATUSES.has(asset.ingestStatus)) return 'parsing'
  if (!compatible) return 'incompatible_with_current_model'
  if (TERMINAL_FAILURE_INGEST_STATUSES.has(asset.ingestStatus) && notes.length === 0) return 'failed'
  return notes.length > 0 ? 'ready_with_warnings' : 'ready'
}

function includedPlan(
  attachment: CollectedAttachmentInput,
  selectedSendMode: SendMode,
  fallbackSendModes: SendMode[],
  notes: string[],
  lineage: AttachmentLineageSummary = evaluateAttachmentLineageSummary(attachment)
): SendPlanAttachment {
  const displayStatus = deriveDisplayStatus(attachment, true, notes)
  return {
    assetId: attachment.assetId,
    attachmentId: attachment.attachmentId,
    source: attachment.source,
    messageId: attachment.messageId,
    aiPayloadKind: attachment.aiPayloadKind,
    semantic: resolveAttachmentSemanticSummary(attachment) ?? buildAttachmentSemanticSummary(attachment),
    selectedSendMode,
    fallbackSendModes,
    eligibility: notes.length > 0 ? 'warning' : 'included',
    exclusionReason: null,
    displayStatus,
    needsUserAttention: notes.length > 0,
    notes,
    lineage,
  }
}

function excludedPlan(
  attachment: CollectedAttachmentInput,
  exclusionReason: string,
  displayStatus: AttachmentDisplayStatus,
  needsUserAttention: boolean,
  notes: string[],
  lineage: AttachmentLineageSummary = evaluateAttachmentLineageSummary(attachment)
): SendPlanAttachment {
  return {
    assetId: attachment.assetId,
    attachmentId: attachment.attachmentId,
    source: attachment.source,
    messageId: attachment.messageId,
    aiPayloadKind: attachment.aiPayloadKind,
    semantic: resolveAttachmentSemanticSummary(attachment) ?? buildAttachmentSemanticSummary(attachment),
    selectedSendMode: null,
    fallbackSendModes: [],
    eligibility: 'excluded',
    exclusionReason,
    displayStatus,
    needsUserAttention,
    notes,
    lineage,
  }
}

function blockedPlan(
  attachment: CollectedAttachmentInput,
  displayStatus: AttachmentDisplayStatus,
  exclusionReason: string,
  notes: string[],
  lineage: AttachmentLineageSummary = evaluateAttachmentLineageSummary(attachment)
): SendPlanAttachment {
  return {
    assetId: attachment.assetId,
    attachmentId: attachment.attachmentId,
    source: attachment.source,
    messageId: attachment.messageId,
    aiPayloadKind: attachment.aiPayloadKind,
    semantic: resolveAttachmentSemanticSummary(attachment) ?? buildAttachmentSemanticSummary(attachment),
    selectedSendMode: null,
    fallbackSendModes: [],
    eligibility: 'blocked',
    exclusionReason,
    displayStatus,
    needsUserAttention: true,
    notes,
    lineage,
  }
}

type LineageGuardResult = Readonly<{
  blocked: boolean
  reasonCode: string | null
  notes: string[]
  lineage: AttachmentLineageSummary
}>

function evaluateAttachmentLineageGuard(attachment: CollectedAttachmentInput): LineageGuardResult {
  const lineage = evaluateAttachmentLineageSummary(attachment)
  switch (lineage.state) {
    case 'preview_only_asset_not_sendable':
    case 'stale_derived_asset':
    case 'preview_send_asset_mismatch':
    case 'send_asset_not_ready':
      return {
        blocked: true,
        reasonCode: lineage.state,
        notes: [lineageBlockingMessage(attachment, lineage)],
        lineage,
      }
    case 'ok':
    case 'unknown':
    default:
      return {
        blocked: false,
        reasonCode: null,
        notes: [],
        lineage,
      }
  }
}

function lineageBlockingMessage(
  attachment: CollectedAttachmentInput,
  lineage: AttachmentLineageSummary
): string {
  switch (lineage.state) {
    case 'preview_only_asset_not_sendable':
      return `Attachment ${attachment.assetId} is preview-only and cannot be used as a send asset.`
    case 'stale_derived_asset':
      return lineage.staleReason
        ? `Attachment ${attachment.assetId} is stale: ${lineage.staleReason}.`
        : `Attachment ${attachment.assetId} is stale and must be regenerated before send.`
    case 'preview_send_asset_mismatch':
      return `Attachment ${attachment.assetId} preview/send lineage mismatch detected.`
    case 'send_asset_not_ready':
      return `Attachment ${attachment.assetId} send asset is not ready.`
    default:
      return `Attachment ${attachment.assetId} failed lineage validation.`
  }
}

function evaluateAttachmentLineageSummary(attachment: CollectedAttachmentInput): AttachmentLineageSummary {
  const asset = attachment.fileAsset
  if (!asset) {
    return {
      state: 'unknown',
      stale: false,
      staleReason: null,
      sourceHash: null,
      previewContentHash: null,
      sendContentHash: null,
      conversionSettingsHash: null,
    }
  }
  const meta = normalizeObject(asset.sourceMetaJson)
  const lineageMeta = normalizeObject(meta?.lineage)
  const readString = (key: string): string | null => {
    const fromLineage = lineageMeta?.[key]
    if (typeof fromLineage === 'string' && fromLineage.trim().length > 0) return fromLineage.trim()
    const fromRoot = meta?.[key]
    return typeof fromRoot === 'string' && fromRoot.trim().length > 0 ? fromRoot.trim() : null
  }
  const readBoolean = (key: string): boolean | null => {
    const fromLineage = lineageMeta?.[key]
    if (typeof fromLineage === 'boolean') return fromLineage
    const fromRoot = meta?.[key]
    return typeof fromRoot === 'boolean' ? fromRoot : null
  }

  const stale = readBoolean('stale') === true
  const staleReason = readString('staleReason')
  const sourceHash = readString('sourceHash') ?? asset.sha256 ?? null
  const previewContentHash = readString('previewContentHash')
  const sendContentHash = readString('sendContentHash')
  const previewSourceHash = readString('previewSourceHash')
  const sendSourceHash = readString('sendSourceHash')
  const previewSettingsHash = readString('previewSettingsHash')
  const sendSettingsHash = readString('sendSettingsHash')
  const conversionSettingsHash = readString('conversionSettingsHash') ?? sendSettingsHash
  const sendAssetReady = readBoolean('sendAssetReady')
  const isPreviewOnlyExplicit = readBoolean('previewOnly') === true
  const isDerived = asset.sourceKind === 'derived'

  const hasHashMismatch = valuePairMismatch(previewContentHash, sendContentHash) ||
    valuePairMismatch(previewSourceHash, sendSourceHash) ||
    valuePairMismatch(previewSettingsHash, sendSettingsHash)

  const state: AttachmentLineageSummary['state'] =
    stale ? 'stale_derived_asset'
      : hasHashMismatch ? 'preview_send_asset_mismatch'
        : sendAssetReady === false ? 'send_asset_not_ready'
          : (isPreviewOnlyExplicit || isDerived) ? 'preview_only_asset_not_sendable'
            : 'ok'

  return {
    state,
    stale,
    staleReason,
    sourceHash,
    previewContentHash,
    sendContentHash,
    conversionSettingsHash,
  }
}

function valuePairMismatch(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left !== right)
}

function normalizeObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function resolveSendPlanStatus(input: Readonly<{
  blockingReasons: SendPlanIssue[]
  hasEffectiveCurrentInput: boolean
  excludedDraftPlans: SendPlanAttachment[]
  warnings: SendPlanIssue[]
}>): SendPlan['status'] {
  if (input.blockingReasons.length > 0) return 'blocked'
  if (!input.hasEffectiveCurrentInput) return 'blocked'
  if (input.excludedDraftPlans.length > 0) return 'partially_sendable'
  if (input.warnings.length > 0) return 'sendable_with_warnings'
  return 'sendable'
}

function planToWarnings(plan: SendPlanAttachment, attachment: CollectedAttachmentInput): SendPlanIssue[] {
  if (plan.eligibility === 'warning') {
    return plan.notes.map((message, index) =>
      issue(index === 0 ? 'attachment_warning' : `attachment_warning_${index + 1}`, attachment.assetId, attachment.source, message)
    )
  }
  if (plan.source === 'history' && plan.eligibility === 'excluded' && shouldWarnForHistoryExclusion(plan.exclusionReason)) {
    return [
      issue(
        'history_attachment_excluded',
        attachment.assetId,
        'history',
        plan.notes[0] ?? `History attachment ${attachment.assetId} is excluded from the current send plan.`
      ),
    ]
  }
  return []
}

function shouldWarnForHistoryExclusion(reason: string | null): boolean {
  if (!reason) return false
  return reason !== 'deduped_to_current_draft' && reason !== 'duplicate_history_asset' && reason !== 'manually_excluded'
}

function compatibilityMessage(
  attachment: CollectedAttachmentInput,
  compatibility: AttachmentCompatibilityDescriptor
): string {
  if (compatibility.missingCapabilities.length > 0) {
    return `Attachment ${attachment.assetId} requires model capabilities: ${compatibility.missingCapabilities.join(', ')}.`
  }
  switch (compatibility.reasonCode) {
    case 'conversion_required_before_send':
      return `Attachment ${attachment.assetId} requires conversion before it can be sent.`
    case 'unsupported_processing_status':
      return `Attachment ${attachment.assetId} is unsupported for direct send planning.`
    default:
      return `Attachment ${attachment.assetId} is incompatible with the current model.`
  }
}

function noSendModeMessage(attachment: CollectedAttachmentInput, reasonCode: string | null): string {
  switch (reasonCode) {
    case 'audio_requires_local_file':
      return `Attachment ${attachment.assetId} requires a local file copy because audio is not sent by URL.`
    case 'video_url_ref_not_allowed':
      return `Attachment ${attachment.assetId} cannot use video URL send mode with the current provider context.`
    case 'conversion_required_before_send':
      return `Attachment ${attachment.assetId} requires conversion before a send mode can be selected.`
    case 'unsupported_processing_status':
      return `Attachment ${attachment.assetId} is unsupported for direct send planning.`
    case 'pdf_not_supported_by_provider':
      return `Attachment ${attachment.assetId} cannot be sent because the current provider context does not allow PDF inputs.`
    default:
      return `Attachment ${attachment.assetId} has no supported send mode in the current planning context.`
  }
}

function noModeSelection(
  attachment: CollectedAttachmentInput,
  reasonCode: string,
  notes: string[]
): AttachmentSendModeSelection {
  return {
    assetId: attachment.assetId,
    source: attachment.source,
    selectedSendMode: null,
    fallbackSendModes: [],
    reasonCode,
    notes,
  }
}

function noModeReason(aiPayloadKind: AiPayloadKind, hasUrl: boolean, hasLocalCopy: boolean): string {
  if (aiPayloadKind === 'audio' && !hasLocalCopy) return 'audio_requires_local_file'
  if (aiPayloadKind === 'video' && hasUrl && !hasLocalCopy) return 'video_url_ref_not_allowed'
  if (!hasUrl && !hasLocalCopy) return 'no_sendable_representation'
  return 'no_send_mode_available'
}

function noModeNotes(aiPayloadKind: AiPayloadKind, hasUrl: boolean, hasLocalCopy: boolean): string[] {
  if (aiPayloadKind === 'audio' && !hasLocalCopy) {
    return ['Audio inputs require a local file copy and cannot be planned as URL references.']
  }
  if (aiPayloadKind === 'video' && hasUrl && !hasLocalCopy) {
    return ['Video URL references are disabled in the current provider context and no local file copy is available.']
  }
  if (!hasUrl && !hasLocalCopy) {
    return ['Neither a retained URL reference nor a local file copy is available.']
  }
  return []
}

function resolveUrlReference(asset: FileAssetRecord): string | null {
  const meta = parseUrlMeta(asset)
  const candidates = [
    meta.resolvedUrl,
    meta.originalUrl,
    asset.storageBackend === 'remote_url' ? asset.storageUri : null,
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const parsed = new URL(candidate)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString()
    } catch {
      // keep searching
    }
  }
  return null
}

function hasStoredLocalCopy(asset: FileAssetRecord): boolean {
  return asset.storageBackend === 'local_fs' && asset.ingestStatus === 'stored' && asset.deletedAt == null
}

function parseUrlMeta(asset: FileAssetRecord): Readonly<{
  originalUrl: string | null
  resolvedUrl: string | null
  probeStatus: string | null
  materializationStatus: string | null
}> {
  const meta = asset.sourceMetaJson ?? null
  const readString = (key: string): string | null => {
    const value = meta?.[key]
    return typeof value === 'string' && value.trim().length > 0 ? value : null
  }
  return {
    originalUrl: readString('originalUrl'),
    resolvedUrl: readString('resolvedUrl'),
    probeStatus: readString('probeStatus'),
    materializationStatus: readString('materializationStatus'),
  }
}

function hasReadyTextConversionAsset(
  attachment: CollectedAttachmentInput,
  semantic: AttachmentSemanticSummary
): boolean {
  if (semantic.sendStrategy !== 'text_in_prompt') return false
  if (!TEXT_TARGET_KINDS.has(semantic.targetKind)) return false
  const asset = attachment.fileAsset
  if (!asset || !asset.sourceMetaJson || typeof asset.sourceMetaJson !== 'object') return false
  const root = asset.sourceMetaJson as Record<string, unknown>
  const lineage = normalizeObject(root.lineage)
  if (lineage?.sendAssetReady !== true) return false
  const sendUri = lineage?.sendTextStorageUri
  return typeof sendUri === 'string' && sendUri.trim().length > 0
}

function hasReadyMixedConversionAssets(
  attachment: CollectedAttachmentInput,
  semantic: AttachmentSemanticSummary
): boolean {
  if (semantic.sendStrategy !== 'mixed') return false
  const asset = attachment.fileAsset
  if (!asset || !asset.sourceMetaJson || typeof asset.sourceMetaJson !== 'object') return false
  const root = asset.sourceMetaJson as Record<string, unknown>
  const lineage = normalizeObject(root.lineage)
  const hasReadyText = lineage?.sendAssetReady === true
    && typeof lineage?.sendTextStorageUri === 'string'
    && lineage.sendTextStorageUri.trim().length > 0
  const hasReadyFile = Boolean(resolveUrlReference(asset) || hasStoredLocalCopy(asset))
  return hasReadyText && hasReadyFile
}

function evaluateConvertedTextHardGate(attachment: CollectedAttachmentInput): string | null {
  const semantic = resolveAttachmentSemanticSummary(attachment)
  if (!semantic || semantic.sendStrategy !== 'text_in_prompt') return null
  const asset = attachment.fileAsset
  if (!asset || !asset.sourceMetaJson || typeof asset.sourceMetaJson !== 'object') return null
  const root = asset.sourceMetaJson as Record<string, unknown>
  const lineage = normalizeObject(root.lineage)
  const size = lineage && typeof lineage.sendTextBytes === 'number' && Number.isFinite(lineage.sendTextBytes)
    ? lineage.sendTextBytes
    : null
  if (size == null || size <= MAX_CONVERTED_TEXT_BYTES_HARD) return null
  return `Attachment ${attachment.assetId} converted text exceeds hard limit (${size} bytes > ${MAX_CONVERTED_TEXT_BYTES_HARD} bytes).`
}

function isTimedOutParsing(asset: FileAssetRecord, now: number, parsingTimeoutMs: number): boolean {
  return INTERMEDIATE_INGEST_STATUSES.has(asset.ingestStatus) && now - asset.updatedAt > parsingTimeoutMs
}

function dedupeIssues(issues: SendPlanIssue[]): SendPlanIssue[] {
  const seen = new Set<string>()
  const deduped: SendPlanIssue[] = []
  for (const issueRow of issues) {
    const key = `${issueRow.code}::${issueRow.assetId ?? ''}::${issueRow.source}::${issueRow.message}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(issueRow)
  }
  return deduped
}

function applyAttachmentPlan(
  plan: SendPlanAttachment,
  attachment: CollectedAttachmentInput,
  includedAttachments: Array<SendPlan['includedAttachments'][number]>,
  excludedAttachments: Array<SendPlan['excludedAttachments'][number]>,
  warnings: SendPlanIssue[]
): void {
  if (plan.eligibility === 'included' || plan.eligibility === 'warning') {
    includedAttachments.push(toAttachmentRef(plan, attachment))
  } else {
    excludedAttachments.push(toExcludedAttachmentRef(plan, attachment))
  }
  warnings.push(...planToWarnings(plan, attachment))
}

function toAttachmentRef(plan: SendPlanAttachment, attachment: CollectedAttachmentInput): SendPlan['includedAttachments'][number] {
  return {
    assetId: plan.assetId,
    source: plan.source,
    attachmentId: attachment.attachmentId,
    messageId: attachment.messageId,
  }
}

function toExcludedAttachmentRef(
  plan: SendPlanAttachment,
  attachment: CollectedAttachmentInput
): SendPlan['excludedAttachments'][number] {
  return {
    assetId: plan.assetId,
    source: plan.source,
    attachmentId: attachment.attachmentId,
    messageId: attachment.messageId,
    exclusionReason: plan.exclusionReason ?? 'excluded',
  }
}

function issue(code: string, assetId: string | null, source: SendPlanIssue['source'], message: string): SendPlanIssue {
  return { code, assetId, source, message }
}

function buildAttachmentSemanticSummary(
  attachment: Pick<CollectedAttachmentInput, 'aiPayloadKind' | 'processingStatus'>
): AttachmentSemanticSummary {
  // Step 1 migration note: selected conversion option will populate semantic directly;
  // this legacy mapper remains as a compatibility fallback during the transition.
  if (attachment.processingStatus === 'unsupported') {
    return {
      targetKind: 'unsupported',
      sendStrategy: 'unsupported',
      mappedFromLegacy: true,
    }
  }

  if (attachment.processingStatus === 'convertible') {
    return {
      targetKind: defaultTargetKindForPayload(attachment.aiPayloadKind),
      sendStrategy: 'unsupported',
      mappedFromLegacy: true,
    }
  }

  switch (attachment.aiPayloadKind) {
    case 'text':
      return {
        targetKind: 'plain_text',
        sendStrategy: 'text_in_prompt',
        mappedFromLegacy: true,
      }
    case 'pdf':
      return {
        targetKind: 'pdf_attachment',
        sendStrategy: 'file_attachment',
        mappedFromLegacy: true,
      }
    case 'image':
    case 'audio':
    case 'video':
      return {
        targetKind: 'native_file',
        sendStrategy: 'file_attachment',
        mappedFromLegacy: true,
      }
    case 'binary':
    default:
      return {
        targetKind: 'unsupported',
        sendStrategy: 'unsupported',
        mappedFromLegacy: true,
      }
  }
}

const CODE_EXTENSIONS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'py', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'env', 'sql', 'go', 'rs',
  'java', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'swift', 'kt',
  'scala', 'lua', 'dockerfile',
])

const OFFICE_MARKDOWN_EXTENSIONS = new Set([
  'docx',
  'doc',
  'rtf',
])

const OFFICE_TABLE_EXTENSIONS = new Set([
  'xlsx',
  'xls',
])

const HTML_MARKDOWN_EXTENSIONS = new Set([
  'html',
  'htm',
])

const PS_CODE_EXTENSIONS = new Set([
  'ps',
  'eps',
])

const TEXT_TARGET_KINDS = new Set<AttachmentSemanticSummary['targetKind']>([
  'plain_text',
  'markdown',
  'code',
  'table_markdown',
])

function buildDefaultSemanticSummary(
  attachment: Pick<CollectedAttachmentInput, 'aiPayloadKind' | 'processingStatus'>,
  fileAsset: FileAssetRecord | null
): AttachmentSemanticSummary {
  const ext = String(fileAsset?.extension ?? '').trim().toLowerCase()
  const mime = String(fileAsset?.mime ?? '').trim().toLowerCase()
  if (attachment.processingStatus === 'convertible') {
    if (OFFICE_MARKDOWN_EXTENSIONS.has(ext)) {
      return { targetKind: 'markdown', sendStrategy: 'text_in_prompt', mappedFromLegacy: true }
    }
    if (OFFICE_TABLE_EXTENSIONS.has(ext)) {
      return { targetKind: 'table_markdown', sendStrategy: 'text_in_prompt', mappedFromLegacy: true }
    }
    if (HTML_MARKDOWN_EXTENSIONS.has(ext) || mime === 'text/html') {
      return { targetKind: 'markdown', sendStrategy: 'text_in_prompt', mappedFromLegacy: true }
    }
    if (PS_CODE_EXTENSIONS.has(ext) || mime === 'application/postscript') {
      return { targetKind: 'code', sendStrategy: 'text_in_prompt', mappedFromLegacy: true }
    }
  }
  const legacy = buildAttachmentSemanticSummary(attachment)
  if (attachment.aiPayloadKind !== 'text') return legacy
  if (ext === 'md' || ext === 'markdown' || mime === 'text/markdown' || mime === 'text/x-markdown') {
    return { targetKind: 'markdown', sendStrategy: 'text_in_prompt', mappedFromLegacy: true }
  }
  if (ext === 'csv' || ext === 'tsv' || mime === 'text/csv' || mime === 'text/tab-separated-values') {
    return { targetKind: 'table_markdown', sendStrategy: 'text_in_prompt', mappedFromLegacy: true }
  }
  if (CODE_EXTENSIONS.has(ext)) {
    return { targetKind: 'code', sendStrategy: 'text_in_prompt', mappedFromLegacy: true }
  }
  if (ext === 'txt' || ext === 'log' || mime === 'text/plain') {
    return { targetKind: 'plain_text', sendStrategy: 'text_in_prompt', mappedFromLegacy: true }
  }
  return legacy
}

function resolveAttachmentSemanticSummary(
  attachment: Pick<CollectedAttachmentInput, 'aiPayloadKind' | 'processingStatus' | 'semantic'>
): AttachmentSemanticSummary | null {
  if (attachment.semantic) return attachment.semantic
  return buildAttachmentSemanticSummary(attachment)
}

function resolveEligibilityEvaluationMode(
  attachment: Pick<CollectedAttachmentInput, 'semantic'>
): EligibilityEvaluationMode {
  // Step 1 close-out: semantic is the canonical eligibility entry when present.
  // Legacy mode remains available as an explicit compatibility fallback.
  return attachment.semantic ? 'semantic' : 'legacy'
}

function defaultTargetKindForPayload(
  aiPayloadKind: CollectedAttachmentInput['aiPayloadKind']
): AttachmentSemanticSummary['targetKind'] {
  switch (aiPayloadKind) {
    case 'text':
      return 'plain_text'
    case 'pdf':
      return 'pdf_attachment'
    case 'image':
    case 'audio':
    case 'video':
      return 'native_file'
    case 'binary':
    default:
      return 'unsupported'
  }
}

function normalizeStringArray(values: ReadonlyArray<string>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean)))
}

function dedupeSendModes(modes: ReadonlyArray<SendMode>): SendMode[] {
  return Array.from(new Set(modes))
}

function isCollectedInput(input: CollectCurrentSendInputsInput | CollectedSendInputs): input is CollectedSendInputs {
  return 'draft' in input && 'draftAttachments' in input && 'historyAttachments' in input
}

function compatibilityKey(assetId: string, source: AttachmentPlanSource): string {
  return `${source}::${assetId}`
}

function sameAttachment(left: CollectedAttachmentInput, right: CollectedAttachmentInput): boolean {
  return left.source === right.source && left.attachmentId === right.attachmentId
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

export const __sendPlanEligibilityInternals = {
  evaluateCompatibilityFromLegacy,
  evaluateCompatibilityFromSemantic,
  evaluateAttachmentCompatibilityByMode,
  buildAttachmentSemanticSummary,
  buildDefaultSemanticSummary,
  resolveAttachmentSemanticSummary,
  resolveEligibilityEvaluationMode,
  evaluateAttachmentLineageSummary,
  evaluateAttachmentLineageGuard,
}
