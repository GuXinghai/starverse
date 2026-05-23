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

  for (const ref of option.sendAssetRefs) {
    if (ref.kind !== 'derived_asset') return 'send_asset_ref_kind_mismatch'
    if (!input.availableDerivedAssetIds.includes(ref.assetId)) return 'derived_asset_ref_missing'
  }

  return null
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
