export const DFC_TARGET_KINDS = [
  'original_file',
  'plain_text',
  'markdown',
  'code',
  'table_markdown',
  'pdf_attachment',
] as const

export type DfcTargetKind = (typeof DFC_TARGET_KINDS)[number]

export type DfcDerivedTargetKind = Exclude<DfcTargetKind, 'original_file'>

export type DfcSendStrategy =
  | 'text_in_prompt'
  | 'file_attachment'

export type DfcSendAssetRef =
  | Readonly<{
    kind: 'raw_file'
    assetId: string
  }>
  | Readonly<{
    kind: 'derived_asset'
    assetId: string
  }>

export type DfcAttachmentSendSnapshot = Readonly<{
  attachmentId: string
  assetId: string
  targetKind: DfcTargetKind
  sendStrategy: DfcSendStrategy
  sendAssetRefs: readonly DfcSendAssetRef[]
}>

export type DfcConversionOptionStatus =
  | 'candidate'
  | 'pending'
  | 'ready'
  | 'failed'
  | 'stale'
  | 'blocked'

export type DfcCompatibilityStatus =
  | 'compatible'
  | 'warning'
  | 'incompatible'
  | 'blocked'
  | 'pending'

export type DfcConversionOption = Readonly<{
  optionId: string
  rawFileId: string
  targetKind: DfcTargetKind
  sendStrategy: DfcSendStrategy
  status: DfcConversionOptionStatus
  isAvailable: boolean
  sendAssetRefs: readonly DfcSendAssetRef[]
  compatibilityStatus?: DfcCompatibilityStatus | null
  unavailableReason?: string | null
  warnings?: readonly string[]
}>

export type DfcDerivedAssetUsage =
  | 'preview_and_send'
  | 'preview_only'
  | 'send_only'

export type DfcDerivedAssetStorageClass =
  | 'temporary'
  | 'draft_bound'
  | 'message_bound'

export type DfcDerivedAssetConverterIdentity = Readonly<{
  name: string
  version: string
}>

export type DfcDerivedAssetFacade = Readonly<{
  assetId: string
  sourceFileId: string
  targetKind: DfcDerivedTargetKind
  mime: string | null
  storageRef: string
  usage: DfcDerivedAssetUsage
  storageClass: DfcDerivedAssetStorageClass
  sourceHash: string
  contentHash: string
  conversionSettingsHash: string
  converter: DfcDerivedAssetConverterIdentity
  warnings: readonly string[]
}>

export type DfcDerivedAssetFacadeFailureReason =
  | 'derived_asset_not_ready'
  | 'derived_asset_missing_storage_ref'
  | 'derived_asset_missing_source_hash'
  | 'derived_asset_missing_content_hash'
  | 'derived_asset_missing_target_kind'
  | 'derived_asset_original_file_not_allowed'
  | 'derived_asset_invalid_target_kind'
  | 'derived_asset_missing_conversion_settings_hash'
  | 'derived_asset_missing_usage'
  | 'derived_asset_invalid_usage'
  | 'derived_asset_missing_storage_class'
  | 'derived_asset_invalid_storage_class'
  | 'derived_asset_missing_converter_identity'

export type DfcDerivedAssetFacadeResult =
  | Readonly<{
    ok: true
    asset: DfcDerivedAssetFacade
  }>
  | Readonly<{
    ok: false
    reasonCode: DfcDerivedAssetFacadeFailureReason
  }>

type DfcDerivedAssetFacadeFailure = Extract<DfcDerivedAssetFacadeResult, Readonly<{ ok: false }>>

export type DfcDerivedAssetFacadeInput = Readonly<{
  derivativeId: string
  sourceFileId: string
  mime?: string | null
  storageRef?: string | null
  status: string
  generator?: string | null
  metaJson?: Readonly<Record<string, unknown>> | null
}>

export type DfcLegacyQuarantineInput = Readonly<{
  preferredSendMode?: string | null
  selectedSendMode?: string | null
  legacyTargetKind?: 'native_file' | 'hybrid' | 'unsupported' | string | null
  extension?: string | null
  mimeType?: string | null
}>

export type DfcOptionGenerationState =
  | 'pending'
  | 'ready'
  | 'failed'

export type DfcDecisionStatus =
  | 'ready'
  | 'needs_user_selection'
  | 'pending'
  | 'blocked'
  | 'failed'
  | 'stale'
  | 'incompatible'

export type DfcDecisionReasonCode =
  | 'selected_option_missing'
  | 'selected_option_pending'
  | 'selected_option_not_found'
  | 'selected_option_failed'
  | 'selected_option_stale'
  | 'selected_option_blocked'
  | 'selected_option_unavailable'
  | 'selected_option_incompatible'
  | 'raw_file_ref_missing'
  | 'derived_asset_ref_missing'
  | 'send_asset_ref_kind_mismatch'
  | null

export type DfcManagedAttachmentResolveInput = Readonly<{
  dfcManaged: true
  rawFileId: string
  selectedOptionId?: string | null
  options: readonly DfcConversionOption[]
  availableRawFileIds: readonly string[]
  availableDerivedAssetIds: readonly string[]
  optionGenerationState?: DfcOptionGenerationState | null
  legacy?: DfcLegacyQuarantineInput | null
}>

export type DfcManagedAttachmentDecision = Readonly<{
  status: DfcDecisionStatus
  reasonCode: DfcDecisionReasonCode
  selectedOptionId: string | null
  targetKind: DfcTargetKind | null
  sendStrategy: DfcSendStrategy | null
  sendAssetRefs: readonly DfcSendAssetRef[]
  needsUserAction: boolean
}>

export type DfcSanitizedDiagnostic = Readonly<{
  code: string
  message: string
  severity?: 'info' | 'warning' | 'error'
  productCode?: string | null
  internalCode?: string | null
  runtimeStatus?: string | null
  runtimeSource?: string | null
  productionApproved?: boolean | null
  ownerGated?: boolean | null
  experimental?: boolean | null
  degraded?: boolean | null
  fallbackTargetKinds?: readonly DfcTargetKind[]
}>

export type DfcSanitizedAttachmentDto = Readonly<{
  attachmentId: string
  rawFileId: string
  filename: string
  sizeBytes: number
  selectedOptionId: string | null
  targetKind: DfcTargetKind | null
  status: DfcDecisionStatus
  warnings: readonly string[]
  diagnostics: readonly DfcSanitizedDiagnostic[]
}>

export type DfcDraftOptionCandidateDto = Readonly<{
  optionId: string
  targetKind: DfcTargetKind
  sendStrategy: DfcSendStrategy
  status: DfcConversionOptionStatus
  isAvailable: boolean
  compatibilityStatus: DfcCompatibilityStatus | null
  sendAssetRefs: readonly DfcSendAssetRef[]
  warnings: readonly string[]
  diagnostics: readonly DfcSanitizedDiagnostic[]
}>

export type DfcDraftAttachmentOptionsDto = Readonly<{
  attachmentId: string
  conversationId: string
  rawFileId: string
  filename: string
  sizeBytes: number
  dfcManaged: boolean
  selectedOptionId: string | null
  selectedAssetRefs: readonly DfcSendAssetRef[]
  recommendedOptionId: string | null
  recommendedReasonCode: string | null
  decision: DfcManagedAttachmentDecision
  options: readonly DfcDraftOptionCandidateDto[]
}>

export type DfcDraftAttachmentPreviewStatus =
  | 'ready'
  | 'needs_user_selection'
  | 'pending'
  | 'blocked'
  | 'failed'
  | 'stale'
  | 'incompatible'

export type DfcDraftAttachmentPreviewKind =
  | 'none'
  | 'raw_file'
  | 'text'

export type DfcDraftAttachmentPreviewPayloadDto = Readonly<{
  kind: DfcDraftAttachmentPreviewKind
  status: DfcDraftAttachmentPreviewStatus
  text: string | null
  characterCount: number | null
  byteLength: number | null
  truncated: boolean
  maxCharacters: number
  diagnostics: readonly DfcSanitizedDiagnostic[]
}>

export type DfcDraftAttachmentPreviewDto = Readonly<{
  attachmentId: string
  conversationId: string
  rawFileId: string
  filename: string
  sizeBytes: number
  dfcManaged: boolean
  selectedOptionId: string | null
  selectedAssetRefs: readonly DfcSendAssetRef[]
  targetKind: DfcTargetKind | null
  sendStrategy: DfcSendStrategy | null
  decision: DfcManagedAttachmentDecision
  preview: DfcDraftAttachmentPreviewPayloadDto
}>

export type DfcRendererAttachmentAuditInput = Readonly<{
  attachmentId: string
  rawFileId: string
  filename: string
  sizeBytes: number
  selectedOptionId?: string | null
  targetKind?: DfcTargetKind | null
  status: DfcDecisionStatus
  warnings?: readonly string[]
  diagnostics?: readonly DfcSanitizedDiagnostic[]
  path?: string | null
  fileUrl?: string | null
  hash?: string | null
  contentToken?: string | null
  body?: string | null
  storageRef?: string | null
}>

export function createDfcOriginalFileOption(input: Readonly<{
  optionId: string
  rawFileId: string
  status?: DfcConversionOptionStatus
  isAvailable?: boolean
  compatibilityStatus?: DfcCompatibilityStatus | null
}>): DfcConversionOption {
  return {
    optionId: input.optionId,
    rawFileId: input.rawFileId,
    targetKind: 'original_file',
    sendStrategy: 'file_attachment',
    status: input.status ?? 'ready',
    isAvailable: input.isAvailable ?? true,
    compatibilityStatus: input.compatibilityStatus ?? 'compatible',
    sendAssetRefs: [{ kind: 'raw_file', assetId: input.rawFileId }],
  }
}

export function createDfcDerivedAssetOption(input: Readonly<{
  optionId: string
  rawFileId: string
  derivedAssetId: string
  targetKind: DfcDerivedTargetKind
  status?: DfcConversionOptionStatus
  isAvailable?: boolean
  compatibilityStatus?: DfcCompatibilityStatus | null
}>): DfcConversionOption {
  return {
    optionId: input.optionId,
    rawFileId: input.rawFileId,
    targetKind: input.targetKind,
    sendStrategy: input.targetKind === 'pdf_attachment' ? 'file_attachment' : 'text_in_prompt',
    status: input.status ?? 'ready',
    isAvailable: input.isAvailable ?? true,
    compatibilityStatus: input.compatibilityStatus ?? 'compatible',
    sendAssetRefs: [{ kind: 'derived_asset', assetId: input.derivedAssetId }],
  }
}

export function resolveDfcManagedAttachment(input: DfcManagedAttachmentResolveInput): DfcManagedAttachmentDecision {
  const selectedOptionId = normalizeId(input.selectedOptionId)
  if (!selectedOptionId) {
    if (input.optionGenerationState === 'pending') {
      return blockedDecision({
        status: 'pending',
        reasonCode: 'selected_option_pending',
        selectedOptionId: null,
      })
    }

    return blockedDecision({
      status: 'needs_user_selection',
      reasonCode: 'selected_option_missing',
      selectedOptionId: null,
    })
  }

  const option = input.options.find((item) => item.optionId === selectedOptionId)
  if (!option) {
    return blockedDecision({
      status: 'needs_user_selection',
      reasonCode: 'selected_option_not_found',
      selectedOptionId,
    })
  }

  const optionStatusDecision = decisionForOptionState(option, selectedOptionId)
  if (optionStatusDecision) return optionStatusDecision

  const assetRefReason = validateSendAssetRefs(input, option)
  if (assetRefReason) {
    return blockedDecision({
      status: 'blocked',
      reasonCode: assetRefReason,
      selectedOptionId,
      targetKind: option.targetKind,
      sendStrategy: option.sendStrategy,
    })
  }

  return {
    status: 'ready',
    reasonCode: null,
    selectedOptionId,
    targetKind: option.targetKind,
    sendStrategy: option.sendStrategy,
    sendAssetRefs: option.sendAssetRefs,
    needsUserAction: false,
  }
}

export function sanitizeDfcAttachmentForRenderer(input: DfcRendererAttachmentAuditInput): DfcSanitizedAttachmentDto {
  return {
    attachmentId: input.attachmentId,
    rawFileId: input.rawFileId,
    filename: input.filename,
    sizeBytes: input.sizeBytes,
    selectedOptionId: normalizeId(input.selectedOptionId),
    targetKind: input.targetKind ?? null,
    status: input.status,
    warnings: [...(input.warnings ?? [])],
    diagnostics: [...(input.diagnostics ?? [])],
  }
}

export function createDfcDerivedAssetFacade(input: DfcDerivedAssetFacadeInput): DfcDerivedAssetFacadeResult {
  if (input.status !== 'ready') return { ok: false, reasonCode: 'derived_asset_not_ready' }

  const storageRef = normalizeId(input.storageRef)
  if (!storageRef) return { ok: false, reasonCode: 'derived_asset_missing_storage_ref' }

  const meta = input.metaJson ?? {}
  const sourceHash = readNonEmptyMetaString(meta, 'sourceHash')
  if (!sourceHash) return { ok: false, reasonCode: 'derived_asset_missing_source_hash' }

  const contentHash = readNonEmptyMetaString(meta, 'contentHash')
  if (!contentHash) return { ok: false, reasonCode: 'derived_asset_missing_content_hash' }

  const targetKind = readDfcDerivedTargetKind(meta)
  if (!targetKind.ok) return targetKind

  const conversionSettingsHash = readNonEmptyMetaString(meta, 'conversionSettingsHash')
  if (!conversionSettingsHash) return { ok: false, reasonCode: 'derived_asset_missing_conversion_settings_hash' }

  const usage = readDfcDerivedAssetUsage(meta)
  if (!usage.ok) return usage

  const storageClass = readDfcDerivedAssetStorageClass(meta)
  if (!storageClass.ok) return storageClass

  const converterName = readNonEmptyMetaString(meta, 'converterName') ?? normalizeId(input.generator)
  const converterVersion = readNonEmptyMetaString(meta, 'converterVersion')
  if (!converterName || !converterVersion) {
    return { ok: false, reasonCode: 'derived_asset_missing_converter_identity' }
  }

  return {
    ok: true,
    asset: {
      assetId: input.derivativeId,
      sourceFileId: input.sourceFileId,
      targetKind: targetKind.value,
      mime: input.mime ?? null,
      storageRef,
      usage: usage.value,
      storageClass: storageClass.value,
      sourceHash,
      contentHash,
      conversionSettingsHash,
      converter: {
        name: converterName,
        version: converterVersion,
      },
      warnings: readMetaStringArray(meta, 'warnings'),
    },
  }
}

function decisionForOptionState(
  option: DfcConversionOption,
  selectedOptionId: string,
): DfcManagedAttachmentDecision | null {
  if (option.status === 'candidate' || option.status === 'pending' || option.compatibilityStatus === 'pending') {
    return blockedDecision({
      status: 'pending',
      reasonCode: 'selected_option_pending',
      selectedOptionId,
      targetKind: option.targetKind,
      sendStrategy: option.sendStrategy,
    })
  }

  if (option.status === 'failed') {
    return blockedDecision({
      status: 'failed',
      reasonCode: 'selected_option_failed',
      selectedOptionId,
      targetKind: option.targetKind,
      sendStrategy: option.sendStrategy,
    })
  }

  if (option.status === 'stale') {
    return blockedDecision({
      status: 'stale',
      reasonCode: 'selected_option_stale',
      selectedOptionId,
      targetKind: option.targetKind,
      sendStrategy: option.sendStrategy,
    })
  }

  if (option.status === 'blocked' || option.compatibilityStatus === 'blocked') {
    return blockedDecision({
      status: 'blocked',
      reasonCode: 'selected_option_blocked',
      selectedOptionId,
      targetKind: option.targetKind,
      sendStrategy: option.sendStrategy,
    })
  }

  if (option.compatibilityStatus === 'incompatible') {
    return blockedDecision({
      status: 'incompatible',
      reasonCode: 'selected_option_incompatible',
      selectedOptionId,
      targetKind: option.targetKind,
      sendStrategy: option.sendStrategy,
    })
  }

  if (!option.isAvailable) {
    return blockedDecision({
      status: 'blocked',
      reasonCode: 'selected_option_unavailable',
      selectedOptionId,
      targetKind: option.targetKind,
      sendStrategy: option.sendStrategy,
    })
  }

  return null
}

function validateSendAssetRefs(
  input: DfcManagedAttachmentResolveInput,
  option: DfcConversionOption,
): Exclude<DfcDecisionReasonCode, null> | null {
  if (option.targetKind === 'original_file') {
    if (option.sendAssetRefs.length !== 1) return 'raw_file_ref_missing'

    const [ref] = option.sendAssetRefs
    if (!ref || ref.kind !== 'raw_file') return 'send_asset_ref_kind_mismatch'
    if (ref.assetId !== input.rawFileId) return 'raw_file_ref_missing'
    if (!input.availableRawFileIds.includes(ref.assetId)) return 'raw_file_ref_missing'
    return null
  }

  if (option.sendAssetRefs.length === 0) return 'derived_asset_ref_missing'
  if (option.targetKind === 'pdf_attachment' && option.sendStrategy !== 'file_attachment') return 'send_asset_ref_kind_mismatch'
  if (option.targetKind !== 'pdf_attachment' && option.sendStrategy !== 'text_in_prompt') return 'send_asset_ref_kind_mismatch'

  for (const ref of option.sendAssetRefs) {
    if (ref.kind !== 'derived_asset') return 'send_asset_ref_kind_mismatch'
    if (!input.availableDerivedAssetIds.includes(ref.assetId)) return 'derived_asset_ref_missing'
  }

  return null
}

function readDfcDerivedTargetKind(meta: Readonly<Record<string, unknown>>): DfcDerivedAssetFacadeFailure | Readonly<{
  ok: true
  value: DfcDerivedTargetKind
}> {
  const targetKind = readNonEmptyMetaString(meta, 'targetKind')
  if (!targetKind) return { ok: false, reasonCode: 'derived_asset_missing_target_kind' }
  if (targetKind === 'original_file') return { ok: false, reasonCode: 'derived_asset_original_file_not_allowed' }
  if (!isDfcTargetKind(targetKind)) return { ok: false, reasonCode: 'derived_asset_invalid_target_kind' }
  return { ok: true, value: targetKind }
}

function readDfcDerivedAssetUsage(meta: Readonly<Record<string, unknown>>): DfcDerivedAssetFacadeFailure | Readonly<{
  ok: true
  value: DfcDerivedAssetUsage
}> {
  const usage = readNonEmptyMetaString(meta, 'usage')
  if (!usage) return { ok: false, reasonCode: 'derived_asset_missing_usage' }
  if (usage === 'preview_and_send' || usage === 'preview_only' || usage === 'send_only') return { ok: true, value: usage }
  return { ok: false, reasonCode: 'derived_asset_invalid_usage' }
}

function readDfcDerivedAssetStorageClass(meta: Readonly<Record<string, unknown>>): DfcDerivedAssetFacadeFailure | Readonly<{
  ok: true
  value: DfcDerivedAssetStorageClass
}> {
  const storageClass = readNonEmptyMetaString(meta, 'storageClass')
  if (!storageClass) return { ok: false, reasonCode: 'derived_asset_missing_storage_class' }
  if (storageClass === 'temporary' || storageClass === 'draft_bound' || storageClass === 'message_bound') {
    return { ok: true, value: storageClass }
  }
  return { ok: false, reasonCode: 'derived_asset_invalid_storage_class' }
}

function isDfcTargetKind(value: string): value is DfcDerivedTargetKind {
  return value === 'plain_text'
    || value === 'markdown'
    || value === 'code'
    || value === 'table_markdown'
    || value === 'pdf_attachment'
}

function readNonEmptyMetaString(meta: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = meta[key]
  return typeof value === 'string' ? normalizeId(value) : null
}

function readMetaStringArray(meta: Readonly<Record<string, unknown>>, key: string): string[] {
  const value = meta[key]
  if (!Array.isArray(value)) return []
  return value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
}

function blockedDecision(input: Readonly<{
  status: Exclude<DfcDecisionStatus, 'ready'>
  reasonCode: Exclude<DfcDecisionReasonCode, null>
  selectedOptionId: string | null
  targetKind?: DfcTargetKind | null
  sendStrategy?: DfcSendStrategy | null
}>): DfcManagedAttachmentDecision {
  return {
    status: input.status,
    reasonCode: input.reasonCode,
    selectedOptionId: input.selectedOptionId,
    targetKind: input.targetKind ?? null,
    sendStrategy: input.sendStrategy ?? null,
    sendAssetRefs: [],
    needsUserAction: input.status !== 'pending',
  }
}

function normalizeId(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
