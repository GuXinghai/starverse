import type { AiPayloadKind, ModelCapability, SendMode } from './fileTypes'

export type SendPlanStatus =
  | 'sendable'
  | 'sendable_with_warnings'
  | 'partially_sendable'
  | 'blocked'

export type AttachmentPlanSource = 'draft' | 'history'

export type AttachmentDisplayStatus =
  | 'parsing'
  | 'ready'
  | 'failed'
  | 'incompatible_with_current_model'
  | 'ready_with_warnings'
  | 'unsupported'

export type AttachmentPlanEligibility =
  | 'included'
  | 'warning'
  | 'excluded'
  | 'blocked'

export type AttachmentTargetKind =
  | 'plain_text'
  | 'markdown'
  | 'code'
  | 'table_markdown'
  | 'pdf_attachment'
  | 'native_file'
  | 'hybrid'
  | 'unsupported'

export type AttachmentSendStrategy =
  | 'text_in_prompt'
  | 'file_attachment'
  | 'mixed'
  | 'unsupported'

export type AttachmentSemanticSummary = Readonly<{
  targetKind: AttachmentTargetKind
  sendStrategy: AttachmentSendStrategy
  mappedFromLegacy: boolean
}>

export type SendPlanIssue = Readonly<{
  code: string
  message: string
  assetId: string | null
  source: AttachmentPlanSource | 'request'
}>

export type SendPlanAttachmentRef = Readonly<{
  assetId: string
  source: AttachmentPlanSource
  attachmentId: string
  messageId: string | null
}>

export type AttachmentLineageState =
  | 'ok'
  | 'unknown'
  | 'preview_only_asset_not_sendable'
  | 'stale_derived_asset'
  | 'preview_send_asset_mismatch'
  | 'send_asset_not_ready'

export type AttachmentLineageSummary = Readonly<{
  state: AttachmentLineageState
  stale: boolean
  staleReason: string | null
  sourceHash: string | null
  previewContentHash: string | null
  sendContentHash: string | null
  conversionSettingsHash: string | null
}>

export type SendPlanAttachment = Readonly<{
  assetId: string
  attachmentId: string
  source: AttachmentPlanSource
  messageId: string | null
  aiPayloadKind: AiPayloadKind
  semantic: AttachmentSemanticSummary
  selectedSendMode: SendMode | null
  fallbackSendModes: SendMode[]
  eligibility: AttachmentPlanEligibility
  exclusionReason: string | null
  displayStatus: AttachmentDisplayStatus
  needsUserAttention: boolean
  notes: string[]
  lineage: AttachmentLineageSummary
}>

export type SendPlan = Readonly<{
  status: SendPlanStatus
  warnings: SendPlanIssue[]
  blockingReasons: SendPlanIssue[]
  includedAttachments: SendPlanAttachmentRef[]
  excludedAttachments: ReadonlyArray<SendPlanAttachmentRef & Readonly<{ exclusionReason: string }>>
  attachmentPlans: SendPlanAttachment[]
  requiresModelChange: boolean
  canProceedAfterDroppingExcluded: boolean
  requiresUserConfirmation: boolean
  plannerVersion: string
}>

export type SendPlanModelDescriptor = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
  inputModalities: string[]
  outputModalities?: string[]
}>

export type SendPlanProviderContext = Readonly<{
  providerKey: string
  baseUrl?: string | null
  supportsImageUrlRef?: boolean
  supportsPdfInputs?: boolean
  supportsPdfUrlRef?: boolean
  supportsTextUrlRef?: boolean
  supportsVideoUrlRef?: boolean
  supportsInlineData?: boolean
  supportsProviderFileRef?: boolean
  preferredDraftSendModes?: SendMode[]
}>

export type AttachmentCompatibilityDescriptor = Readonly<{
  assetId: string
  source: AttachmentPlanSource
  compatible: boolean
  reasonCode: string | null
  missingCapabilities: ModelCapability[]
  acceptedCapabilitySets: ModelCapability[][]
}>
