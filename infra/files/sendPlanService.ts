import type { AiPayloadKind, DraftAttachmentSendModePreference, ModelCapability, SendMode } from '../../src/shared/files/fileTypes'
import {
  createDfcDerivedAssetFacade,
  resolveDfcManagedAttachment,
  type DfcConversionOption,
  type DfcDecisionReasonCode,
  type DfcDecisionStatus,
  type DfcDerivedAssetFacade,
  type DfcDerivedTargetKind,
  type DfcManagedAttachmentDecision,
  type DfcSendAssetRef,
  type DfcSendStrategy,
  type DfcTargetKind,
} from '../../src/shared/files/documentFormatConversion'
import type {
  AttachmentSemanticSummary,
  AttachmentLineageSummary,
  AttachmentCompatibilityDescriptor,
  AttachmentDisplayStatus,
  AttachmentPlanSource,
  SendPlan,
  SendPlanAttachmentDetectionSummary,
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
  FileDerivativeRecord,
  FileTypeVerdictRecord,
  GetAttachmentCandidateSnapshotInput,
} from '../db/types'
import type { FileAssetRepo } from '../db/repo/fileAssetRepo'
import type { FileDerivativeRepo } from '../db/repo/fileDerivativeRepo'
import type { FileTypeVerdictRepo } from '../db/repo/fileTypeVerdictRepo'
import type { ConversationAttachmentService } from './conversationAttachmentService'
import {
  buildSendPlanCandidates,
  type FileTypeVerdict,
  type ModelInputCapabilities,
  type SendPlanCandidate,
  type SendRoute,
} from '../../src/next/file-type'

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
type FileDerivativeLookupApi = Pick<FileDerivativeRepo, 'getById'>
type FileTypeVerdictLookupApi = Pick<FileTypeVerdictRepo, 'getCurrentByAssetId'>

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
  dfcManaged: boolean
  selectedOptionId: string | null
  selectedAssetRefs: DfcSendAssetRef[]
  selectedTargetKind: DfcTargetKind | null
  selectedSendStrategy: DfcSendStrategy | null
  dfcDecision: DfcManagedAttachmentDecision | null
  dfcLineage?: AttachmentLineageSummary | null
  fileAsset: FileAssetRecord | null
  fileTypeVerdict?: FileTypeVerdict | null
  semantic?: AttachmentSemanticSummary | null
  routeCandidates?: readonly SendPlanCandidate[] | null
  detection?: SendPlanAttachmentDetectionSummary | null
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

type EligibilityEvaluationMode = 'semantic'

export type SendPlanServiceDeps = Readonly<{
  conversationAttachmentService: DraftRestoreApi
  fileAssetRepo: FileAssetLookupApi
  fileDerivativeRepo?: FileDerivativeLookupApi
  fileTypeVerdictRepo?: FileTypeVerdictLookupApi
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
    const normalizedModel = normalizeModelDescriptor(input.model)
    const normalizedProviderContext = normalizeProviderContext(input.providerContext)
    const modelCapabilities = modelInputCapabilitiesFromDescriptor(normalizedModel, normalizedProviderContext)
    const draft = this.deps.conversationAttachmentService.restoreDraft({ conversationId })
    const draftAssets = this.deps.fileAssetRepo.listByIds({ ids: draft.attachedAssetIds })
    const draftAssetMap = new Map(draftAssets.map((asset) => [asset.id, asset]))
    const historySnapshot = input.historyScope
      ? this.deps.conversationAttachmentService.getCandidateAttachmentSnapshot(input.historyScope)
      : null
    const historyAssetIds = historySnapshot ? Array.from(new Set(historySnapshot.items.map((item) => item.assetId))) : []
    const historyAssets = historyAssetIds.length > 0 ? this.deps.fileAssetRepo.listByIds({ ids: historyAssetIds }) : []
    const historyAssetMap = new Map(historyAssets.map((asset) => [asset.id, asset]))
    const verdictByAssetId = loadCurrentVerdictByAssetId(
      this.deps.fileTypeVerdictRepo,
      [...draftAssets, ...historyAssets].map((asset) => asset.id)
    )

    const draftText = input.draftText !== undefined ? String(input.draftText) : draft.draftText
    return {
      conversationId,
      draft,
      draftText,
      draftAttachments: draft.attachments.map((attachment) => {
        const fileAsset = draftAssetMap.get(attachment.assetId) ?? null
        const verdictRecord = verdictByAssetId.get(attachment.assetId) ?? null
        const verdict = verdictRecord?.verdict ?? null
        const routeCandidates = applyRouteLevelDerivativeAvailability(
          buildRouteCandidatesFromVerdict(
            verdict,
            modelCapabilities
          ),
          fileAsset
        )
        const base = {
          attachmentId: attachment.id,
          assetId: attachment.assetId,
          source: 'draft',
          messageId: null,
          aiPayloadKind: attachment.aiPayloadKind,
          processingStatus: attachment.processingStatus,
          includeInNextRequest: attachment.includeInNextRequest,
          excludedReason: attachment.excludedReason,
          preferredSendMode: attachment.preferredSendMode ?? null,
          dfcManaged: attachment.dfcManaged,
          selectedOptionId: attachment.selectedOptionId,
          selectedAssetRefs: attachment.selectedAssetRefs,
          selectedTargetKind: null,
          selectedSendStrategy: null,
          fileAsset,
          fileTypeVerdict: verdict,
          routeCandidates,
          detection: buildAttachmentDetectionSummary(verdict, fileAsset),
        } satisfies Omit<CollectedAttachmentInput, 'dfcDecision' | 'semantic'>
        const dfc = resolveDfcContextForCollectedAttachment(base, this.deps.fileDerivativeRepo)
        return {
          ...base,
          dfcDecision: dfc.decision,
          dfcLineage: dfc.lineage,
          semantic: semanticSummaryForCollectedAttachment(base, dfc.decision),
        }
      }),
      historySnapshot,
      historyAttachments: historySnapshot
        ? historySnapshot.items.map((item) => mapHistoryAttachment(
          item,
          historyAssetMap.get(item.assetId) ?? null,
          verdictByAssetId.get(item.assetId)?.verdict ?? null,
          modelCapabilities,
          this.deps.fileDerivativeRepo
        ))
        : [],
      model: normalizedModel,
      providerContext: normalizedProviderContext,
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
    const currentModelBlocked =
      !parsingGate.blocked &&
      !hasEffectiveCurrentInput &&
      excludedDraftPlans.some((plan) => plan.exclusionReason === 'incompatible_with_current_model')
    if (currentModelBlocked) {
      blockingReasons.push(issue(
        'current_draft_incompatible_with_current_model',
        null,
        'request',
        'Current draft input is incompatible with the selected model.'
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
    if (attachment.dfcManaged) {
      const dfcBlocked = blockedPlanFromDfcDecision(attachment, lineageGate.lineage)
      if (dfcBlocked) return dfcBlocked
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
    const detectionGate = evaluateAttachmentDetectionGate(attachment)
    if (detectionGate.blocked) {
      return blockedPlan(
        attachment,
        detectionGate.displayStatus,
        detectionGate.reasonCode,
        detectionGate.notes,
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
    const modeSelection = attachment.dfcManaged
      ? selectDfcAttachmentSendMode(attachment, providerContext)
      : selectAttachmentSendModeInternal(attachment, providerContext)
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
    if (attachment.dfcManaged) {
      const dfcBlocked = blockedPlanFromDfcDecision(attachment, lineageGate.lineage)
      if (dfcBlocked) return dfcBlocked
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
    const detectionGate = evaluateAttachmentDetectionGate(attachment)
    if (detectionGate.blocked) {
      return blockedPlan(
        attachment,
        detectionGate.displayStatus,
        detectionGate.reasonCode,
        detectionGate.notes,
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
    const modeSelection = attachment.dfcManaged
      ? selectDfcAttachmentSendMode(attachment, providerContext)
      : selectAttachmentSendModeInternal(attachment, providerContext)
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
  fileAsset: FileAssetRecord | null,
  verdict: FileTypeVerdict | null,
  modelCapabilities: ModelInputCapabilities,
  fileDerivativeRepo: FileDerivativeLookupApi | undefined
): CollectedAttachmentInput {
  const routeCandidates = applyRouteLevelDerivativeAvailability(
    buildRouteCandidatesFromVerdict(verdict, modelCapabilities),
    fileAsset
  )
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
    dfcManaged: item.dfcManaged,
    selectedOptionId: item.usedOptionId,
    selectedAssetRefs: item.usedAssetRefs,
    selectedTargetKind: item.targetKind,
    selectedSendStrategy: item.sendStrategy,
    fileAsset,
    fileTypeVerdict: verdict,
    routeCandidates,
    detection: buildAttachmentDetectionSummary(verdict, fileAsset),
  } satisfies Omit<CollectedAttachmentInput, 'dfcDecision' | 'semantic'>
  const dfc = resolveDfcContextForCollectedAttachment(base, fileDerivativeRepo)
  return {
    ...base,
    dfcDecision: dfc.decision,
    dfcLineage: dfc.lineage,
    semantic: semanticSummaryForCollectedAttachment(base, dfc.decision),
  }
}

function semanticSummaryForCollectedAttachment(
  attachment: Omit<CollectedAttachmentInput, 'dfcDecision' | 'semantic'>,
  dfcDecision: DfcManagedAttachmentDecision | null
): AttachmentSemanticSummary | null {
  if (attachment.dfcManaged) {
    return dfcDecision?.targetKind && dfcDecision.sendStrategy
      ? {
          targetKind: dfcDecision.targetKind,
          sendStrategy: dfcDecision.sendStrategy,
          mappedFromLegacy: false,
      }
      : null
  }
  return semanticSummaryFromRouteCandidates(attachment.routeCandidates ?? null, attachment.aiPayloadKind)
}

function resolveDfcContextForCollectedAttachment(
  attachment: Omit<CollectedAttachmentInput, 'dfcDecision' | 'semantic'>,
  fileDerivativeRepo: FileDerivativeLookupApi | undefined
): Readonly<{ decision: DfcManagedAttachmentDecision | null; lineage: AttachmentLineageSummary | null }> {
  if (!attachment.dfcManaged) return { decision: null, lineage: null }
  const optionBundle = buildDfcOptionsForSelectedRefs(attachment, fileDerivativeRepo)
  const fileAvailable = Boolean(
    attachment.fileAsset &&
    attachment.fileAsset.deletedAt == null &&
    attachment.fileAsset.ingestStatus !== 'deleted'
  )
  const decision = resolveDfcManagedAttachment({
    dfcManaged: true,
    rawFileId: attachment.assetId,
    selectedOptionId: attachment.selectedOptionId,
    options: optionBundle.options,
    availableRawFileIds: fileAvailable ? [attachment.assetId] : [],
    availableDerivedAssetIds: optionBundle.availableDerivedAssetIds,
    optionGenerationState: null,
    legacy: {
      preferredSendMode: attachment.preferredSendMode,
      selectedSendMode: null,
      legacyTargetKind: semanticSummaryFromRouteCandidates(attachment.routeCandidates ?? null, attachment.aiPayloadKind)?.targetKind ?? null,
      extension: attachment.fileAsset?.extension ?? null,
      mimeType: attachment.fileAsset?.mime ?? null,
    },
  })
  return {
    decision,
    lineage: evaluateDfcSelectedAssetRefLineage(attachment, decision, fileDerivativeRepo),
  }
}

function buildDfcOptionsForSelectedRefs(
  attachment: Omit<CollectedAttachmentInput, 'dfcDecision' | 'semantic'>,
  fileDerivativeRepo: FileDerivativeLookupApi | undefined
): Readonly<{ options: DfcConversionOption[]; availableDerivedAssetIds: string[] }> {
  const selectedOptionId = normalizeNullableText(attachment.selectedOptionId)
  if (!selectedOptionId) return { options: [], availableDerivedAssetIds: [] }
  const refs = attachment.selectedAssetRefs
  if (refs.length === 1 && refs[0]?.kind === 'raw_file') {
    const targetKind = attachment.selectedTargetKind ?? 'original_file'
    return {
      options: [{
        optionId: selectedOptionId,
        rawFileId: attachment.assetId,
        targetKind,
        sendStrategy: attachment.selectedSendStrategy ?? expectedDfcSendStrategy(targetKind),
        status: 'ready',
        isAvailable: true,
        compatibilityStatus: 'compatible',
        sendAssetRefs: refs,
      }],
      availableDerivedAssetIds: [],
    }
  }

  const derivedRefs = refs.filter((ref) => ref.kind === 'derived_asset')
  if (derivedRefs.length !== refs.length || derivedRefs.length === 0) return { options: [], availableDerivedAssetIds: [] }

  const targetKind = attachment.selectedTargetKind ?? resolveDfcDerivedTargetKind(attachment, derivedRefs[0]!.assetId, fileDerivativeRepo)
  if (!targetKind) return { options: [], availableDerivedAssetIds: [] }

  const selectedDerivatives = derivedRefs.map((ref) => fileDerivativeRepo?.getById(ref.assetId) ?? null)
  const allReady = selectedDerivatives.every((derivative, index) =>
    isDfcDerivedRefAvailable(attachment, derivedRefs[index]!.assetId, derivative, fileDerivativeRepo !== undefined)
  )
  const anyFailed = selectedDerivatives.some((derivative) => derivative?.status === 'failed')
  const anyStale = selectedDerivatives.some((derivative) => derivative?.status === 'deleted' || derivative?.deletedAt != null)
  const anySourceMismatch = selectedDerivatives.some((derivative) =>
    derivative ? dfcDerivedRefSourceHashMismatch(attachment, derivative) : false
  )
  const anyPending = selectedDerivatives.some((derivative) => derivative?.status === 'pending')
  const status: DfcConversionOption['status'] =
    anyFailed ? 'failed'
      : anyStale || anySourceMismatch ? 'stale'
        : anyPending ? 'pending'
          : 'ready'

  return {
    options: [{
      optionId: selectedOptionId,
      rawFileId: attachment.assetId,
      targetKind,
      sendStrategy: attachment.selectedSendStrategy ?? expectedDfcSendStrategy(targetKind),
      status,
      isAvailable: allReady,
      compatibilityStatus: allReady ? 'compatible' : null,
      sendAssetRefs: derivedRefs,
    }],
    availableDerivedAssetIds: allReady ? derivedRefs.map((ref) => ref.assetId) : [],
  }
}

function resolveDfcDerivedTargetKind(
  attachment: Omit<CollectedAttachmentInput, 'dfcDecision' | 'semantic'>,
  derivedAssetId: string,
  fileDerivativeRepo: FileDerivativeLookupApi | undefined
): DfcDerivedTargetKind | null {
  const derivative = fileDerivativeRepo?.getById(derivedAssetId) ?? null
  const fromDerivative = readDfcDerivedTargetKind(derivative?.metaJson ?? null)
  if (fromDerivative) return fromDerivative
  const textConversion = readSelectedTextConversionMeta(attachment.fileAsset, derivedAssetId)
  return readDfcDerivedTargetKind(textConversion)
}

function expectedDfcSendStrategy(targetKind: DfcTargetKind): DfcSendStrategy {
  return targetKind === 'pdf_attachment' || targetKind === 'original_file' ? 'file_attachment' : 'text_in_prompt'
}

function isDfcDerivedRefAvailable(
  attachment: Omit<CollectedAttachmentInput, 'dfcDecision' | 'semantic'>,
  derivedAssetId: string,
  derivative: FileDerivativeRecord | null,
  derivativeRepoAvailable: boolean
): boolean {
  if (derivative) {
    if (derivative.parentAssetId !== attachment.assetId) return false
    if (derivative.status !== 'ready' || derivative.deletedAt != null) return false
    const facade = createDfcDerivedAssetFacade({
      derivativeId: derivative.id,
      sourceFileId: attachment.assetId,
      mime: derivative.mime,
      storageRef: derivative.storageUri,
      status: derivative.status,
      generator: derivative.generator,
      metaJson: derivative.metaJson,
    })
    if (facade.ok && dfcDerivedAssetSourceHashMismatch(attachment.fileAsset, facade.asset)) return false
    return readDfcDerivedTargetKind(derivative.metaJson) !== null
  }
  if (derivativeRepoAvailable) return false
  const textConversion = readSelectedTextConversionMeta(attachment.fileAsset, derivedAssetId)
  return textConversion?.status === 'ready'
    && typeof textConversion?.storageUri === 'string'
    && textConversion.storageUri.trim().length > 0
    && readDfcDerivedTargetKind(textConversion) !== null
}

function readSelectedTextConversionMeta(
  asset: FileAssetRecord | null,
  derivedAssetId: string
): Record<string, unknown> | null {
  const root = normalizeObject(asset?.sourceMetaJson)
  const textConversion = normalizeObject(root?.textConversion)
  const derivativeId = typeof textConversion?.derivativeId === 'string' ? textConversion.derivativeId.trim() : ''
  return derivativeId === derivedAssetId ? textConversion : null
}

function readDfcDerivedTargetKind(meta: Record<string, unknown> | null): DfcDerivedTargetKind | null {
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

function evaluateDfcSelectedAssetRefLineage(
  attachment: Omit<CollectedAttachmentInput, 'dfcDecision' | 'semantic'>,
  decision: DfcManagedAttachmentDecision,
  fileDerivativeRepo: FileDerivativeLookupApi | undefined
): AttachmentLineageSummary | null {
  if (decision.status !== 'ready') return null
  const refs = decision.sendAssetRefs
  if (refs.length === 1 && refs[0]?.kind === 'raw_file') {
    return {
      state: refs[0].assetId === attachment.assetId ? 'ok' : 'send_asset_not_ready',
      stale: false,
      staleReason: refs[0].assetId === attachment.assetId ? null : 'raw_file_ref_mismatch',
      sourceHash: null,
      previewContentHash: null,
      sendContentHash: null,
      conversionSettingsHash: null,
    }
  }
  if (refs.length === 0 || refs.some((ref) => ref.kind !== 'derived_asset')) return null
  if (!fileDerivativeRepo) return null

  const facades: DfcDerivedAssetFacade[] = []
  for (const ref of refs) {
    const derivative = fileDerivativeRepo.getById(ref.assetId)
    if (!derivative) {
      return dfcDerivedLineageSummary('send_asset_not_ready', 'derived_asset_missing')
    }
    if (derivative.parentAssetId !== attachment.assetId) {
      return dfcDerivedLineageSummary('preview_send_asset_mismatch', 'derived_asset_parent_mismatch')
    }
    if (derivative.deletedAt != null || derivative.status === 'deleted') {
      return dfcDerivedLineageSummary('stale_derived_asset', 'derived_asset_deleted')
    }
    const facade = createDfcDerivedAssetFacade({
      derivativeId: derivative.id,
      sourceFileId: attachment.assetId,
      mime: derivative.mime,
      storageRef: derivative.storageUri,
      status: derivative.status,
      generator: derivative.generator,
      metaJson: derivative.metaJson,
    })
    if (!facade.ok) {
      return dfcDerivedLineageSummary('send_asset_not_ready', facade.reasonCode)
    }
    if (dfcDerivedAssetSourceHashMismatch(attachment.fileAsset, facade.asset)) {
      return dfcDerivedLineageSummary('stale_derived_asset', 'selected_derived_asset_source_hash_mismatch')
    }
    if (facade.asset.usage === 'preview_only') {
      return dfcDerivedLineageSummary('preview_only_asset_not_sendable', 'derived_asset_preview_only')
    }
    facades.push(facade.asset)
  }

  if (facades.length === 0) return null
  const first = facades[0]!
  const mismatched = facades.some((facade) =>
    facade.sourceHash !== first.sourceHash
    || facade.contentHash !== first.contentHash
    || facade.conversionSettingsHash !== first.conversionSettingsHash
  )
  return {
    state: mismatched ? 'preview_send_asset_mismatch' : 'ok',
    stale: false,
    staleReason: mismatched ? 'selected_derived_asset_lineage_mismatch' : null,
    sourceHash: null,
    previewContentHash: null,
    sendContentHash: null,
    conversionSettingsHash: null,
  }
}

function dfcDerivedLineageSummary(
  state: Exclude<AttachmentLineageSummary['state'], 'ok' | 'unknown'>,
  staleReason: string
): AttachmentLineageSummary {
  return {
    state,
    stale: state === 'stale_derived_asset',
    staleReason,
    sourceHash: null,
    previewContentHash: null,
    sendContentHash: null,
    conversionSettingsHash: null,
  }
}

function dfcDerivedRefSourceHashMismatch(
  attachment: Omit<CollectedAttachmentInput, 'dfcDecision' | 'semantic'>,
  derivative: FileDerivativeRecord
): boolean {
  const facade = createDfcDerivedAssetFacade({
    derivativeId: derivative.id,
    sourceFileId: attachment.assetId,
    mime: derivative.mime,
    storageRef: derivative.storageUri,
    status: derivative.status,
    generator: derivative.generator,
    metaJson: derivative.metaJson,
  })
  return facade.ok && dfcDerivedAssetSourceHashMismatch(attachment.fileAsset, facade.asset)
}

function dfcDerivedAssetSourceHashMismatch(
  rawAsset: FileAssetRecord | null,
  facade: DfcDerivedAssetFacade
): boolean {
  const sourceHash = normalizeNullableText(rawAsset?.sha256 ?? null)
  return sourceHash !== null && facade.sourceHash !== sourceHash
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

function modelInputCapabilitiesFromDescriptor(
  model: SendPlanModelDescriptor,
  providerContext: NormalizedProviderContext
): ModelInputCapabilities {
  const capabilities = modelCapabilitiesFromDescriptor(model)
  return {
    acceptsText: capabilities.has('text_in'),
    acceptsImage: capabilities.has('image_in'),
    acceptsAudio: capabilities.has('audio_in'),
    acceptsVideo: capabilities.has('video_in'),
    acceptsFile: capabilities.has('file_in'),
    acceptsPdf: capabilities.has('file_in') && providerContext.supportsPdfInputs,
    acceptsCsv: capabilities.has('text_in'),
    acceptsTsv: capabilities.has('text_in'),
    acceptsUrlRef: providerContext.supportsImageUrlRef
      || providerContext.supportsPdfUrlRef
      || providerContext.supportsTextUrlRef
      || providerContext.supportsVideoUrlRef,
    acceptsInlineData: providerContext.supportsInlineData,
  }
}

function loadCurrentVerdictByAssetId(
  repo: FileTypeVerdictLookupApi | undefined,
  assetIds: readonly string[]
): Map<string, FileTypeVerdictRecord> {
  const out = new Map<string, FileTypeVerdictRecord>()
  if (!repo) return out
  for (const assetId of new Set(assetIds)) {
    const verdictRecord = repo.getCurrentByAssetId(assetId)
    if (verdictRecord?.verdict) {
      out.set(assetId, verdictRecord)
    }
  }
  return out
}

function buildRouteCandidatesFromVerdict(
  verdict: FileTypeVerdict | null,
  modelCapabilities: ModelInputCapabilities
): readonly SendPlanCandidate[] | null {
  if (!verdict) return null
  return buildSendPlanCandidates({
    verdict,
    modelCapabilities,
  })
}

function applyRouteLevelDerivativeAvailability(
  routeCandidates: readonly SendPlanCandidate[] | null,
  fileAsset: FileAssetRecord | null
): readonly SendPlanCandidate[] | null {
  const reason = routeLevelTextDerivativeUnavailableReason(fileAsset)
  if (!routeCandidates || !reason) return routeCandidates
  return routeCandidates.map((candidate) => {
    if (!routeDependsOnTextDerivative(candidate.route)) return candidate
    const blockedBy = Array.from(new Set([...candidate.blockedBy, reason]))
    const reasonCodes = Array.from(new Set([...candidate.reasonCodes, reason]))
    return {
      ...candidate,
      compatible: false,
      blocked: true,
      blockedBy,
      reasonCodes,
      blockedLabelCodes: candidate.blockedLabelCodes.length > 0 ? [...candidate.blockedLabelCodes] : ['blocked.policy_denied'],
    }
  })
}

function routeLevelTextDerivativeUnavailableReason(fileAsset: FileAssetRecord | null): string | null {
  const meta = normalizeObject(fileAsset?.sourceMetaJson)
  const textConversion = normalizeObject(meta?.textConversion)
  const status = typeof textConversion?.status === 'string' ? textConversion.status.trim() : ''
  const errorCode = typeof textConversion?.errorCode === 'string' ? textConversion.errorCode.trim() : ''
  return status === 'failed' && isRouteLevelTextConversionFailure(errorCode) ? errorCode : null
}

function isRouteLevelTextConversionFailure(errorCode: string | null): boolean {
  return errorCode === 'derivative_asset_not_supported'
}

function routeDependsOnTextDerivative(route: SendRoute): boolean {
  switch (route) {
    case 'converted_markdown':
    case 'converted_plain_text':
    case 'converted_csv':
    case 'converted_tsv':
    case 'extracted_text':
      return true
    default:
      return false
  }
}

function semanticSummaryFromRouteCandidates(
  routeCandidates: readonly SendPlanCandidate[] | null,
  aiPayloadKind: AiPayloadKind
): AttachmentSemanticSummary | null {
  if (!routeCandidates || routeCandidates.length === 0) return null
  const candidate = preferredRouteCandidate(routeCandidates)
  if (!candidate) return null
  return semanticFromRoute(candidate.route, aiPayloadKind)
}

function preferredRouteCandidate(candidates: readonly SendPlanCandidate[]): SendPlanCandidate | null {
  const viable = candidates.find((candidate) => candidate.compatible && !candidate.blocked)
  if (viable) return viable
  const askUser = candidates.find((candidate) => candidate.route === 'ask_user')
  if (askUser) return askUser
  const blocked = candidates.find((candidate) => candidate.route === 'blocked')
  if (blocked) return blocked
  return candidates[0] ?? null
}

function semanticFromRoute(route: SendRoute, aiPayloadKind: AiPayloadKind): AttachmentSemanticSummary {
  switch (route) {
    case 'direct_text':
      return { targetKind: 'plain_text', sendStrategy: 'text_in_prompt', mappedFromLegacy: false }
    case 'converted_markdown':
      return { targetKind: 'markdown', sendStrategy: 'text_in_prompt', mappedFromLegacy: false }
    case 'converted_plain_text':
    case 'extracted_text':
      return { targetKind: 'plain_text', sendStrategy: 'text_in_prompt', mappedFromLegacy: false }
    case 'converted_csv':
    case 'converted_tsv':
      return { targetKind: 'table_markdown', sendStrategy: 'text_in_prompt', mappedFromLegacy: false }
    case 'direct_file':
    case 'converted_pdf':
      return {
        targetKind: aiPayloadKind === 'pdf' ? 'pdf_attachment' : 'native_file',
        sendStrategy: 'file_attachment',
        mappedFromLegacy: false,
      }
    case 'direct_image':
    case 'rendered_images':
    case 'direct_audio':
    case 'extracted_audio':
    case 'direct_video':
    case 'selected_frames':
      return { targetKind: 'native_file', sendStrategy: 'file_attachment', mappedFromLegacy: false }
    case 'ask_user':
    case 'blocked':
    case 'skip':
    default:
      return { targetKind: 'unsupported', sendStrategy: 'unsupported', mappedFromLegacy: false }
  }
}

function unsupportedSemanticSummary(): AttachmentSemanticSummary {
  return { targetKind: 'unsupported', sendStrategy: 'unsupported', mappedFromLegacy: false }
}

function buildAttachmentDetectionSummary(
  verdict: FileTypeVerdict | null,
  asset: FileAssetRecord | null
): SendPlanAttachmentDetectionSummary {
  const meta = readFileTypeDetectionMeta(asset)
  if (verdict?.primary) {
    const provenance = verdict.provenance ?? null
    const usedMagika = provenance?.usedMagika ?? verdict.evidence.some((item) => item.source === 'magika')
    const evidenceSources = provenance?.evidenceSources
      ? [...provenance.evidenceSources]
      : Array.from(new Set(verdict.evidence.map((item) => item.source)))
    return {
      routeEligibility: 'verdict_ready',
      detectionLevel: provenance?.detectionLevel ?? (usedMagika ? 'advanced' : 'basic'),
      engineMode: provenance?.engineMode ?? (usedMagika ? 'core_plus_magika' : 'core_only'),
      usedMagika,
      magikaState: provenance?.magikaState ?? (usedMagika ? 'available' : normalizeMagikaState(meta?.magikaState, 'not_requested')),
      evidenceSources,
      decisiveEvidenceSource: provenance?.decisiveEvidenceSource ?? resolveDecisiveEvidenceSource(verdict),
      detectionTrigger: provenance?.detectionTrigger ?? readMetaString(meta, 'detectionTrigger'),
      magikaModelVersion: provenance?.magikaModelVersion ?? readMetaString(meta, 'magikaModelVersion'),
      advancedAttempted: provenance?.advancedAttempted ?? usedMagika,
      advancedFailureReason: provenance?.advancedFailureReason ?? null,
    }
  }

  const routeEligibility = normalizeRouteEligibility(meta?.routeEligibility)
  return {
    routeEligibility,
    detectionLevel: normalizeDetectionLevel(meta?.detectionLevel),
    engineMode: normalizeEngineMode(meta?.engineMode),
    usedMagika: meta?.usedMagika === true,
    magikaState: normalizeMagikaState(meta?.magikaState, 'not_requested'),
    evidenceSources: [],
    decisiveEvidenceSource: null,
    detectionTrigger: readMetaString(meta, 'detectionTrigger'),
    magikaModelVersion: readMetaString(meta, 'magikaModelVersion'),
    advancedAttempted: meta?.advancedAttempted === true,
    advancedFailureReason: readMetaString(meta, 'advancedFailureReason'),
  }
}

function evaluateAttachmentDetectionGate(
  attachment: CollectedAttachmentInput
): Readonly<{ blocked: boolean; displayStatus: AttachmentDisplayStatus; reasonCode: string; notes: string[] }> {
  if (attachment.fileTypeVerdict?.primary) {
    return { blocked: false, displayStatus: 'ready', reasonCode: '', notes: [] }
  }
  const detection = attachment.detection ?? buildAttachmentDetectionSummary(null, attachment.fileAsset)
  if (detection.routeEligibility === 'detection_failed') {
    const advancedFailed = detection.advancedAttempted || detection.detectionLevel === 'advanced'
    return {
      blocked: true,
      displayStatus: 'detection_failed',
      reasonCode: advancedFailed ? 'advanced_file_type_detection_failed' : 'file_type_detection_failed',
      notes: [
        advancedFailed
          ? `Attachment ${attachment.assetId} advanced file type detection failed. Retry will re-check Magika availability.`
          : `Attachment ${attachment.assetId} file type detection failed. Retry detection before sending.`,
      ],
    }
  }
  if (detection.routeEligibility === 'detection_pending') {
    return {
      blocked: true,
      displayStatus: 'detection_pending',
      reasonCode: 'file_type_detection_pending',
      notes: [`Attachment ${attachment.assetId} file type detection is still running.`],
    }
  }
  return {
    blocked: true,
    displayStatus: 'detection_required',
    reasonCode: 'file_type_detection_required',
    notes: [`Attachment ${attachment.assetId} requires file type detection before send planning.`],
  }
}

function detectionReasonCode(attachment: CollectedAttachmentInput): string {
  const detection = attachment.detection ?? buildAttachmentDetectionSummary(null, attachment.fileAsset)
  if (detection.routeEligibility === 'detection_failed') {
    return detection.advancedAttempted ? 'advanced_file_type_detection_failed' : 'file_type_detection_failed'
  }
  if (detection.routeEligibility === 'detection_pending') return 'file_type_detection_pending'
  return 'file_type_detection_required'
}

function evaluateRouteCandidateGate(
  routeCandidates: readonly SendPlanCandidate[] | null
): Readonly<{ blocked: boolean; reasonCode: string; notes: string[] }> {
  if (!routeCandidates || routeCandidates.length === 0) {
    return { blocked: false, reasonCode: '', notes: [] }
  }
  const supported = routeCandidates.some((candidate) => candidate.compatible && !candidate.blocked)
  if (supported) {
    return { blocked: false, reasonCode: '', notes: [] }
  }
  const blockedReasons = Array.from(new Set(
    routeCandidates
      .flatMap((candidate) => candidate.blockedBy)
      .filter((reason) => typeof reason === 'string' && reason.trim().length > 0)
  ))
  const blockedLabel = blockedReasons.length > 0 ? blockedReasons.join(', ') : 'policy'
  return {
    blocked: true,
    reasonCode: 'file_type_route_blocked',
    notes: [`Attachment is blocked by file type route policy (${blockedLabel}).`],
  }
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
    return detectionCompatibilityDescriptor(attachment)
  }
  return {
    assetId: attachment.assetId,
    source: attachment.source,
    compatible: false,
    reasonCode: detectionReasonCode(attachment),
    missingCapabilities: [],
    acceptedCapabilitySets: [],
  }
}

function detectionCompatibilityDescriptor(attachment: CollectedAttachmentInput): AttachmentCompatibilityDescriptor {
  return {
    assetId: attachment.assetId,
    source: attachment.source,
    compatible: false,
    reasonCode: detectionReasonCode(attachment),
    missingCapabilities: [],
    acceptedCapabilitySets: [],
  }
}

function evaluateCompatibilityFromSemantic(
  attachment: CollectedAttachmentInput,
  modelCapabilities: Set<ModelCapability>,
  providerContext: NormalizedProviderContext,
  semantic: AttachmentSemanticSummary
): AttachmentCompatibilityDescriptor {
  const acceptedCapabilitySets = capabilitySetsForSemantic(semantic, providerContext, attachment.aiPayloadKind)
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

function capabilitySetsForSemantic(
  semantic: AttachmentSemanticSummary,
  providerContext: NormalizedProviderContext,
  aiPayloadKind: AiPayloadKind
): ModelCapability[][] {
  if (semantic.sendStrategy === 'unsupported') return []

  switch (semantic.sendStrategy) {
    case 'text_in_prompt':
      return [['text_in']]
    case 'file_attachment':
      if (semantic.targetKind === 'original_file') {
        if (aiPayloadKind === 'pdf' && !providerContext.supportsPdfInputs) return []
        return [['file_in']]
      }
      if (semantic.targetKind === 'pdf_attachment') {
        if (!providerContext.supportsPdfInputs) return []
        return [['file_in']]
      }
      if (semantic.targetKind === 'native_file') {
        switch (aiPayloadKind) {
          case 'image':
            return [['image_in'], ['file_in']]
          case 'audio':
            return [['audio_in'], ['file_in']]
          case 'video':
            return [['video_in'], ['file_in']]
          default:
            return [['file_in']]
        }
      }
      return [['file_in']]
    case 'mixed':
      return [['text_in', 'file_in']]
    default:
      return []
  }
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
  if (semantic.targetKind === 'original_file') return 'missing_file_input_capability'
  if (semantic.sendStrategy === 'file_attachment') return 'missing_file_input_capability'
  return 'unsupported_attachment_payload'
}

function blockedPlanFromDfcDecision(
  attachment: CollectedAttachmentInput,
  lineage: AttachmentLineageSummary
): SendPlanAttachment | null {
  if (!attachment.dfcDecision || attachment.dfcDecision.status === 'ready') return null
  return blockedPlan(
    attachment,
    displayStatusFromDfcDecision(attachment.dfcDecision.status),
    attachment.dfcDecision.reasonCode ?? 'dfc_selected_option_blocked',
    [dfcDecisionMessage(attachment, attachment.dfcDecision.reasonCode, attachment.dfcDecision.status)],
    lineage
  )
}

function displayStatusFromDfcDecision(status: DfcDecisionStatus): AttachmentDisplayStatus {
  switch (status) {
    case 'pending':
      return 'parsing'
    case 'needs_user_selection':
    case 'incompatible':
      return 'incompatible_with_current_model'
    case 'failed':
    case 'stale':
    case 'blocked':
    default:
      return 'failed'
  }
}

function dfcDecisionMessage(
  attachment: CollectedAttachmentInput,
  reasonCode: DfcDecisionReasonCode,
  status: DfcDecisionStatus
): string {
  switch (reasonCode) {
    case 'selected_option_missing':
      return `Attachment ${attachment.assetId} requires a selected conversion option before send planning.`
    case 'selected_option_pending':
      return `Attachment ${attachment.assetId} selected conversion option is still pending.`
    case 'selected_option_not_found':
      return `Attachment ${attachment.assetId} selected conversion option is unavailable.`
    case 'selected_option_failed':
      return `Attachment ${attachment.assetId} selected conversion option failed.`
    case 'selected_option_stale':
      return `Attachment ${attachment.assetId} selected conversion option is stale and must be regenerated.`
    case 'selected_option_blocked':
      return `Attachment ${attachment.assetId} selected conversion option is blocked.`
    case 'selected_option_unavailable':
      return `Attachment ${attachment.assetId} selected conversion option is not available.`
    case 'selected_option_incompatible':
      return `Attachment ${attachment.assetId} selected conversion option is incompatible with the current model.`
    case 'raw_file_ref_missing':
      return `Attachment ${attachment.assetId} selected original file reference is missing.`
    case 'derived_asset_ref_missing':
      return `Attachment ${attachment.assetId} selected derived asset reference is missing.`
    case 'send_asset_ref_kind_mismatch':
      return `Attachment ${attachment.assetId} selected send asset reference does not match its target kind.`
    default:
      return `Attachment ${attachment.assetId} selected conversion option is ${status}.`
  }
}

function selectDfcAttachmentSendMode(
  attachment: CollectedAttachmentInput,
  providerContext: NormalizedProviderContext
): AttachmentSendModeSelection {
  const semantic = resolveAttachmentSemanticSummary(attachment)
  if (!semantic) {
    return noModeSelection(attachment, attachment.dfcDecision?.reasonCode ?? 'selected_option_missing', [
      'DFC-managed attachment has no selected target kind.',
    ])
  }
  const asset = attachment.fileAsset
  if (!asset) return noModeSelection(attachment, 'asset_record_missing', ['Attachment asset metadata is missing.'])
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
    null
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
  const detectionGate = evaluateAttachmentDetectionGate(attachment)
  if (detectionGate.blocked) {
    return noModeSelection(attachment, detectionGate.reasonCode, detectionGate.notes)
  }
  const semantic = resolveAttachmentSemanticSummary(attachment)
  if (!semantic) {
    return noModeSelection(attachment, detectionReasonCode(attachment), ['Attachment has no verdict-based send route candidate.'])
  }
  const candidateGate = evaluateRouteCandidateGate(attachment.routeCandidates ?? null)
  if (candidateGate.blocked) {
    return noModeSelection(attachment, candidateGate.reasonCode, candidateGate.notes)
  }
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

  if (semantic.targetKind === 'original_file') {
    return {
      modes: aiPayloadKind === 'pdf'
        ? pdfModes(url, hasLocalCopy, providerContext)
        : nativeFileModes(url, hasLocalCopy, providerContext),
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
    semantic: resolveAttachmentSemanticSummary(attachment) ?? unsupportedSemanticSummary(),
    sendAssetRefs: attachment.dfcDecision?.sendAssetRefs ? [...attachment.dfcDecision.sendAssetRefs] : [],
    selectedSendMode,
    fallbackSendModes,
    eligibility: notes.length > 0 ? 'warning' : 'included',
    exclusionReason: null,
    displayStatus,
    needsUserAttention: notes.length > 0,
    notes,
    lineage,
    fileType: buildAttachmentFileTypeSummary(attachment),
    detection: attachment.detection ?? null,
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
    semantic: resolveAttachmentSemanticSummary(attachment) ?? unsupportedSemanticSummary(),
    sendAssetRefs: attachment.dfcDecision?.sendAssetRefs ? [...attachment.dfcDecision.sendAssetRefs] : [],
    selectedSendMode: null,
    fallbackSendModes: [],
    eligibility: 'excluded',
    exclusionReason,
    displayStatus,
    needsUserAttention,
    notes,
    lineage,
    fileType: buildAttachmentFileTypeSummary(attachment),
    detection: attachment.detection ?? null,
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
    semantic: resolveAttachmentSemanticSummary(attachment) ?? unsupportedSemanticSummary(),
    sendAssetRefs: attachment.dfcDecision?.sendAssetRefs ? [...attachment.dfcDecision.sendAssetRefs] : [],
    selectedSendMode: null,
    fallbackSendModes: [],
    eligibility: 'blocked',
    exclusionReason,
    displayStatus,
    needsUserAttention: true,
    notes,
    lineage,
    fileType: buildAttachmentFileTypeSummary(attachment),
    detection: attachment.detection ?? null,
  }
}

function buildAttachmentFileTypeSummary(
  attachment: CollectedAttachmentInput
): SendPlanAttachment['fileType'] {
  const verdict = attachment.fileTypeVerdict
  if (!verdict?.primary) return null
  const preferredCandidate = preferredRouteCandidate(attachment.routeCandidates ?? [])
  const blockedBy = preferredCandidate?.blockedBy ? [...preferredCandidate.blockedBy] : []
  const engineUnavailable = blockedBy.some((reason) => reason.startsWith('engine_'))
  const hasExtensionMimeConflict = verdict.conflicts.some((conflict) =>
    conflict.reasonCodes.some((code) => code === 'reason.extension_mismatch' || code === 'reason.browser_mime_mismatch' || code === 'reason.os_mime_mismatch')
  )
  const compatibility: 'compatible' | 'warning' | 'blocked' | 'unknown' =
    !preferredCandidate ? 'unknown'
      : preferredCandidate.blocked ? 'blocked'
        : preferredCandidate.warnings.length > 0 ? 'warning'
          : preferredCandidate.compatible ? 'compatible'
            : 'unknown'
  return {
    formatId: verdict.primary.formatId,
    kind: verdict.primary.kind,
    confidenceLevel: verdict.primary.confidence,
    recommendedRoute: preferredCandidate?.route ?? null,
    recommendedRouteLabelCode: preferredCandidate?.routeLabelCode ?? null,
    compatibility,
    blocked: preferredCandidate?.blocked ?? false,
    requiresJob: preferredCandidate?.requiresJob ?? false,
    engineUnavailable,
    hasConflicts: verdict.conflicts.length > 0,
    hasExtensionMimeConflict,
    warningLabelCodes: preferredCandidate ? [...preferredCandidate.warningLabelCodes] : [],
    blockedLabelCodes: preferredCandidate ? [...preferredCandidate.blockedLabelCodes] : [],
    blockedBy,
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
  if (attachment.dfcManaged) return attachment.dfcLineage ?? redactedDfcLineageSummary()
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

  const staleReason = readString('staleReason')
  const routeLevelDerivativeUnavailable = isRouteLevelTextConversionStale(meta, staleReason)
  const stale = readBoolean('stale') === true && !routeLevelDerivativeUnavailable
  const sourceHash = readString('sourceHash') ?? asset.sha256 ?? null
  const previewContentHash = readString('previewContentHash')
  const sendContentHash = readString('sendContentHash')
  const previewSourceHash = readString('previewSourceHash')
  const sendSourceHash = readString('sendSourceHash')
  const previewSettingsHash = readString('previewSettingsHash')
  const sendSettingsHash = readString('sendSettingsHash')
  const conversionSettingsHash = readString('conversionSettingsHash') ?? sendSettingsHash
  const sendAssetReady = routeLevelDerivativeUnavailable ? null : readBoolean('sendAssetReady')
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

function redactedDfcLineageSummary(): AttachmentLineageSummary {
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

function isRouteLevelTextConversionStale(meta: Record<string, unknown> | null, staleReason: string | null): boolean {
  const textConversion = normalizeObject(meta?.textConversion)
  const status = typeof textConversion?.status === 'string' ? textConversion.status.trim() : ''
  const errorCode = typeof textConversion?.errorCode === 'string' ? textConversion.errorCode.trim() : ''
  return status === 'failed' && isRouteLevelTextConversionFailure(errorCode) && staleReason === errorCode
}

function valuePairMismatch(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left !== right)
}

function normalizeObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readFileTypeDetectionMeta(asset: FileAssetRecord | null): Record<string, unknown> | null {
  const root = normalizeObject(asset?.sourceMetaJson)
  return normalizeObject(root?.fileTypeDetection)
}

function readMetaString(meta: Record<string, unknown> | null, key: string): string | null {
  const value = meta?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normalizeRouteEligibility(value: unknown): SendPlanAttachmentDetectionSummary['routeEligibility'] {
  switch (value) {
    case 'verdict_ready':
    case 'detection_pending':
    case 'detection_failed':
    case 'detection_required':
      return value
    default:
      return 'detection_required'
  }
}

function normalizeDetectionLevel(value: unknown): SendPlanAttachmentDetectionSummary['detectionLevel'] {
  switch (value) {
    case 'basic':
    case 'advanced':
    case 'parser_validated':
      return value
    default:
      return null
  }
}

function normalizeEngineMode(value: unknown): SendPlanAttachmentDetectionSummary['engineMode'] {
  switch (value) {
    case 'core_only':
    case 'core_plus_magika':
    case 'core_plus_parser':
    case 'core_plus_external':
      return value
    default:
      return null
  }
}

function normalizeMagikaState(
  value: unknown,
  fallback: SendPlanAttachmentDetectionSummary['magikaState']
): SendPlanAttachmentDetectionSummary['magikaState'] {
  switch (value) {
    case 'not_installed':
    case 'disabled':
    case 'unavailable':
    case 'available':
    case 'failed':
    case 'not_requested':
      return value
    default:
      return fallback
  }
}

function resolveDecisiveEvidenceSource(verdict: FileTypeVerdict): string | null {
  const provenanceSource = verdict.provenance?.decisiveEvidenceSource ?? null
  if (provenanceSource) return provenanceSource
  const primaryFormatId = verdict.primary.formatId
  const matching = verdict.evidence.filter((item) => item.detectedFormatId === primaryFormatId)
  return matching[0]?.source ?? verdict.evidence[0]?.source ?? null
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
    case 'file_type_detection_required':
      return `Attachment ${attachment.assetId} requires file type detection before it can be sent.`
    case 'file_type_detection_pending':
      return `Attachment ${attachment.assetId} file type detection is still running.`
    case 'file_type_detection_failed':
    case 'advanced_file_type_detection_failed':
      return `Attachment ${attachment.assetId} file type detection failed and must be retried before sending.`
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
  if (typeof sendUri !== 'string' || sendUri.trim().length === 0) return false
  if (!attachment.dfcManaged) return true
  const selectedDerivedIds = attachment.dfcDecision?.sendAssetRefs
    .filter((ref) => ref.kind === 'derived_asset')
    .map((ref) => ref.assetId) ?? []
  if (selectedDerivedIds.length === 0) return false
  const textConversion = normalizeObject(root.textConversion)
  const derivativeId = typeof textConversion?.derivativeId === 'string' ? textConversion.derivativeId.trim() : ''
  return selectedDerivedIds.includes(derivativeId)
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

const TEXT_TARGET_KINDS = new Set<AttachmentSemanticSummary['targetKind']>([
  'plain_text',
  'markdown',
  'code',
  'table_markdown',
])

function resolveAttachmentSemanticSummary(
  attachment: Pick<CollectedAttachmentInput, 'aiPayloadKind' | 'processingStatus' | 'semantic'>
): AttachmentSemanticSummary | null {
  if (attachment.semantic) return attachment.semantic
  return null
}

function resolveEligibilityEvaluationMode(
  _attachment: Pick<CollectedAttachmentInput, 'semantic'>
): EligibilityEvaluationMode {
  return 'semantic'
}

function normalizeStringArray(values: ReadonlyArray<string>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean)))
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
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
  evaluateCompatibilityFromSemantic,
  evaluateAttachmentCompatibilityByMode,
  buildRouteCandidatesFromVerdict,
  applyRouteLevelDerivativeAvailability,
  semanticSummaryFromRouteCandidates,
  evaluateRouteCandidateGate,
  modelInputCapabilitiesFromDescriptor,
  resolveAttachmentSemanticSummary,
  resolveEligibilityEvaluationMode,
  evaluateAttachmentLineageSummary,
  evaluateAttachmentLineageGuard,
}
