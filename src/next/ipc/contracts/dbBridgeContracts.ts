import { z } from 'zod'
import { decodeWithSchema } from './decodeError'
import type { SendPlan } from '@/shared/files/sendPlanTypes'
import {
  DFC_TARGET_KINDS,
  sanitizeDfcAttachmentForRenderer,
  type DfcCompatibilityStatus,
  type DfcConversionOptionStatus,
  type DfcDecisionStatus,
  type DfcDraftAttachmentOptionsDto,
  type DfcDraftAttachmentPreviewDto,
  type DfcDraftAttachmentPreviewPayloadDto,
  type DfcDraftOptionCandidateDto,
  type DfcManagedAttachmentDecision,
  type DfcSanitizedAttachmentDto,
  type DfcSanitizedDiagnostic,
  type DfcSendAssetRef,
  type DfcSendStrategy,
  type DfcTargetKind,
} from '@/shared/files/documentFormatConversion'

const nonEmpty = z.string().trim().min(1)

export type DecodedProjectSummary = Readonly<{
  id: string
  name: string
  createdAt: number
  updatedAt: number
  meta: Record<string, unknown> | null
  alreadyExists?: boolean
  isSystemProject?: boolean
}>

export type DecodedConvoSummary = Readonly<{
  id: string
  title: string
  projectId: string | null
  createdAt: number
  updatedAt: number
  meta: Record<string, unknown> | null
}>

export type DecodedPersistedMessage = Readonly<{
  id: string
  convoId: string
  role: string
  seq: number
  createdAt: number
  body: string
  meta: unknown
}>

export type DecodedMessageAsset = Readonly<{
  messageId: string
  assetId: string
  ordinal: number
  hash: string
  mime: string
  width: number | null
  height: number | null
  bytes: number
  path: string
  fileUrl: string
  assetUrl: string
}>

export type DecodedMessageAssetRender = Readonly<{
  messageId: string
  assetId: string
  ordinal: number
  mime: string
  width: number | null
  height: number | null
  assetUrl: string
}>

export type DecodedFileAsset = Readonly<{
  id: string
  sha256: string | null
  filename: string
  extension: string | null
  mime: string | null
  sizeBytes: number
  assetKind: string
  sourceKind: string
  storageBackend: string
  storageUri: string
  ingestStatus: string
  previewStatus: string
  sourceMetaJson: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}>

export type DecodedFileDerivative = Readonly<{
  id: string
  parentAssetId: string
  derivedKind: string
  mime: string | null
  storageUri: string
  generator: string
  status: string
  metaJson: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}>

export type DecodedDfcFileAsset = Readonly<{
  rawFileId: string
  filename: string
  extension: string | null
  mime: string | null
  sizeBytes: number
  assetKind: string
  sourceKind: string
  ingestStatus: string
  previewStatus: string
  deletedAt: number | null
}>

export type DecodedDfcFileDerivative = Readonly<{
  derivedAssetId: string
  sourceFileId: string
  derivedKind: string
  mime: string | null
  status: string
  targetKind: string | null
  usage: string | null
  storageClass: string | null
  converterName: string | null
  converterVersion: string | null
  warnings: string[]
  deletedAt: number | null
}>

export type DecodedDerivativeJob = Readonly<{
  id: string
  assetId: string
  derivativeKind: string
  taskFamily: string
  status: string
  generator: string
  provider: string | null
  modelId: string | null
  inputSnapshotJson: Record<string, unknown> | null
  configJson: Record<string, unknown> | null
  outputDerivativeId: string | null
  errorCode: string | null
  errorMessage: string | null
  attemptCount: number
  createdAt: number
  updatedAt: number
  startedAt: number | null
  finishedAt: number | null
}>

export type DecodedMessageAttachment = Readonly<{
  id: string
  messageId: string
  assetId: string
  aiPayloadKind: string
  processingStatus: string
  includeInNextRequest: boolean
  excludedReason: string | null
  createdAt: number
  updatedAt: number
}>

export type DecodedDraftAttachment = Readonly<{
  id: string
  conversationId: string
  assetId: string
  attachmentOrder: number
  aiPayloadKind: string
  processingStatus: string
  includeInNextRequest: boolean
  excludedReason: string | null
  preferredSendMode: 'default' | 'auto' | 'url_ref' | 'inline_base64' | null
  urlRetentionMode: 'default' | 'link_only' | 'link_and_file' | null
  dfcManaged: boolean
  selectedOptionId: string | null
  selectedAssetRefs: DfcSendAssetRef[]
  createdAt: number
  updatedAt: number
}>

export type DecodedDfcDraftAttachmentOptions = DfcDraftAttachmentOptionsDto
export type DecodedDfcDraftAttachmentPreview = DfcDraftAttachmentPreviewDto

export type DecodedConversationDraft = Readonly<{
  conversationId: string
  draftText: string
  draftMode: 'compose' | 'edit'
  editingSourceMessageId: string | null
  attachedAssetIds: string[]
  attachments: DecodedDraftAttachment[]
  updatedAt: number
}>

export type DecodedAssetAttachmentOwnership = Readonly<{
  assetId: string
  ownerKind: string
  lifecycleStatus: string
  draftConversationIds: string[]
  messageIds: string[]
  reason: string | null
  updatedAt: number | null
}>

export type DecodedAttachmentCandidateSnapshot = Readonly<{
  scope: 'messages' | 'branch'
  messageIds: string[]
  included: DecodedAttachmentSnapshotItem[]
  excluded: DecodedAttachmentSnapshotItem[]
  items: DecodedAttachmentSnapshotItem[]
}>

export type DecodedAttachmentSnapshotItem = Readonly<{
  attachmentId: string
  messageId: string
  assetId: string
  aiPayloadKind: string
  processingStatus: string
  included: boolean
  excludedReason: string | null
  sourceKind: string | null
  storageBackend: string | null
  dfcManaged: boolean
  usedOptionId: string | null
  usedAssetRefs: DfcSendAssetRef[]
  targetKind: DfcTargetKind | null
  sendStrategy: DfcSendStrategy | null
}>

export type DecodedCommitDraftToUserMessageResult = Readonly<{
  message: DecodedPersistedMessage
  attachments: DecodedMessageAttachment[]
  draft: DecodedConversationDraft
}>

export type DecodedAttachDraftToMessageResult = Readonly<{
  messageId: string
  attachments: DecodedMessageAttachment[]
  draft: DecodedConversationDraft
}>

export type DecodedFileIngestionResult = Readonly<{
  success: boolean
  sourceKind: string
  assetId: string | null
  normalizedExtension: string | null
  assetKind: string
  aiPayloadKind: string
  processingStatus: string
  isNativeSupportedForMvp: boolean
  isConvertibleCandidate: boolean
  importStatus: string
  sendEligibilityHints: Readonly<{
    canUseUrlRef: boolean
    canUseLocalFile: boolean
    canUseInlinePayload: boolean
    urlReferenceMayStillBeUsable: boolean
    notes: string[]
  }>
  warnings: ReadonlyArray<Readonly<{ code: string; message: string }>>
  failureReasonCode: string | null
  retentionMode?: string
  probeStatus?: string
  materializationStatus?: string
  originalUrl?: string
  resolvedUrl?: string
}>

export type DecodedPreviewPayload = Readonly<{
  assetId: string
  status: 'ready' | 'missing' | 'failed'
  derivativeId: string | null
  mime: string | null
  dataUrl: string | null
  width: number | null
  height: number | null
  bytes: number | null
  reused: boolean
  errorCode: string | null
  errorMessage: string | null
}>

export type DecodedBuildCurrentSendPlanResult = Readonly<{
  sendPlan: SendPlan
  draftText: string
  assets: DecodedFileAsset[]
  storageRootDir: string
}>

export type DecodedBeginTurnResult = Readonly<{
  convoId: string
  questionId: string
  questionSeq: number
  assistantId: string
  assistantSeq: number
}>

export type DecodedSwitchCandidateResult = Readonly<{ headMessageId: string }>

export type DecodedRegenerateFromQuestionResult = Readonly<{
  newAnswerRootId: string
  newAssistantSeq: number
}>

export type DecodedSwitchQuestionCandidateResult = Readonly<{ headMessageId: string }>

export type DecodedForkQuestionResult = Readonly<{
  baseMessageId: string | null
  newQuestionId: string
  newQuestionSeq: number
  assistantId: string
  assistantSeq: number
}>

export type DecodedTruncateBranchFromQuestionResult = Readonly<{
  headMessageId: string | null
  fallbackQuestionId: string | null
}>

export type DecodedConvoSetProjectManyResult = Readonly<{
  moved: number
  failed: string[]
}>

export type DecodedSearchHit = Readonly<{
  entityType: 'project' | 'convo' | 'message'
  entityId: string
  projectId: string | null
  convoId: string | null
  createdAtSec: number
  snippet: string
  score: number
}>

const projectSummarySchema = z.object({
  id: nonEmpty,
  name: nonEmpty,
  createdAt: z.number().finite().default(0),
  updatedAt: z.number().finite().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
  alreadyExists: z.boolean().optional(),
  isSystemProject: z.boolean().optional(),
}).transform((row) => ({
  ...row,
  updatedAt: row.updatedAt ?? row.createdAt,
}))

const convoSummarySchema = z.object({
  id: nonEmpty,
  title: nonEmpty,
  projectId: z.string().trim().nullable().optional(),
  createdAt: z.number().finite().default(0),
  updatedAt: z.number().finite().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
}).transform((row) => ({
  ...row,
  projectId: row.projectId && row.projectId.length > 0 ? row.projectId : null,
  updatedAt: row.updatedAt ?? row.createdAt,
}))

const persistedMessageSchema = z.object({
  id: nonEmpty,
  convoId: nonEmpty,
  role: z.string().trim().default('assistant'),
  seq: z.number().finite(),
  createdAt: z.number().finite().default(0),
  body: z.string().default(''),
  meta: z.unknown().optional(),
}).transform((row) => ({
  ...row,
  meta: row.meta ?? null,
}))

const messageAssetObjectSchema = z.object({
  messageId: nonEmpty,
  assetId: nonEmpty,
  ordinal: z.number().int().nonnegative(),
  hash: nonEmpty,
  mime: nonEmpty,
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  bytes: z.number().int().nonnegative(),
  path: nonEmpty,
  fileUrl: nonEmpty,
  assetUrl: nonEmpty,
})

const messageAssetRenderSchema = messageAssetObjectSchema.omit({
  path: true,
  fileUrl: true,
  hash: true,
  bytes: true,
}).transform((row) => ({
  messageId: row.messageId,
  assetId: row.assetId,
  ordinal: row.ordinal,
  mime: row.mime,
  width: row.width ?? null,
  height: row.height ?? null,
  assetUrl: row.assetUrl,
}))

const fileAssetSchema = z.object({
  id: nonEmpty,
  sha256: z.string().trim().nullable().optional(),
  filename: nonEmpty,
  extension: z.string().trim().nullable().optional(),
  mime: z.string().trim().nullable().optional(),
  sizeBytes: z.number().int().nonnegative(),
  assetKind: nonEmpty,
  sourceKind: nonEmpty,
  storageBackend: nonEmpty,
  storageUri: nonEmpty,
  ingestStatus: nonEmpty,
  previewStatus: nonEmpty,
  sourceMetaJson: z.record(z.unknown()).nullable().optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  deletedAt: z.number().finite().nullable().optional(),
}).transform((row) => ({
  ...row,
  extension: row.extension ?? null,
  mime: row.mime ?? null,
  sha256: row.sha256 ?? null,
  sourceMetaJson: row.sourceMetaJson ?? null,
  deletedAt: row.deletedAt ?? null,
}))

const fileDerivativeSchema = z.object({
  id: nonEmpty,
  parentAssetId: nonEmpty,
  derivedKind: nonEmpty,
  mime: z.string().trim().nullable().optional(),
  storageUri: nonEmpty,
  generator: nonEmpty,
  status: nonEmpty,
  metaJson: z.record(z.unknown()).nullable().optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  deletedAt: z.number().finite().nullable().optional(),
}).transform((row) => ({
  ...row,
  mime: row.mime ?? null,
  metaJson: row.metaJson ?? null,
  deletedAt: row.deletedAt ?? null,
}))

const dfcTargetKindSchema = z.enum(DFC_TARGET_KINDS)
const dfcSendStrategySchema = z.enum(['text_in_prompt', 'file_attachment'])
const dfcSendAssetRefSchema = z.union([
  z.object({
    kind: z.literal('raw_file'),
    assetId: nonEmpty,
  }),
  z.object({
    kind: z.literal('derived_asset'),
    assetId: nonEmpty,
  }),
])
const dfcConversionOptionStatusSchema = z.enum([
  'candidate',
  'pending',
  'ready',
  'failed',
  'stale',
  'blocked',
])
const dfcCompatibilityStatusSchema = z.enum([
  'compatible',
  'warning',
  'incompatible',
  'blocked',
  'pending',
])

const dfcDecisionStatusSchema = z.enum([
  'ready',
  'needs_user_selection',
  'pending',
  'blocked',
  'failed',
  'stale',
  'incompatible',
])
const dfcDecisionReasonCodeSchema = z.enum([
  'selected_option_missing',
  'selected_option_pending',
  'selected_option_not_found',
  'selected_option_failed',
  'selected_option_stale',
  'selected_option_blocked',
  'selected_option_unavailable',
  'selected_option_incompatible',
  'raw_file_ref_missing',
  'derived_asset_ref_missing',
  'send_asset_ref_kind_mismatch',
]).nullable()

const dfcDiagnosticSchema = z.object({
  code: nonEmpty,
  message: z.string(),
})

const dfcAttachmentAuditSchema = z.object({
  attachmentId: nonEmpty,
  rawFileId: nonEmpty,
  filename: nonEmpty,
  sizeBytes: z.number().int().nonnegative(),
  selectedOptionId: z.string().trim().nullable().optional(),
  targetKind: dfcTargetKindSchema.nullable().optional(),
  status: dfcDecisionStatusSchema,
  warnings: z.array(z.string()).optional(),
  diagnostics: z.array(dfcDiagnosticSchema).optional(),
  path: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  hash: z.string().nullable().optional(),
  contentToken: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  storageRef: z.string().nullable().optional(),
}).transform((row): DfcSanitizedAttachmentDto => sanitizeDfcAttachmentForRenderer({
  attachmentId: row.attachmentId,
  rawFileId: row.rawFileId,
  filename: row.filename,
  sizeBytes: row.sizeBytes,
  selectedOptionId: row.selectedOptionId ?? null,
  targetKind: row.targetKind as DfcTargetKind | null | undefined,
  status: row.status as DfcDecisionStatus,
  warnings: row.warnings ?? [],
  diagnostics: row.diagnostics as DfcSanitizedDiagnostic[] | undefined,
  path: row.path ?? null,
  fileUrl: row.fileUrl ?? null,
  hash: row.hash ?? null,
  contentToken: row.contentToken ?? null,
  body: row.body ?? null,
  storageRef: row.storageRef ?? null,
}))

const dfcManagedAttachmentDecisionSchema = z.object({
  status: dfcDecisionStatusSchema,
  reasonCode: dfcDecisionReasonCodeSchema,
  selectedOptionId: z.string().trim().nullable().optional(),
  targetKind: dfcTargetKindSchema.nullable().optional(),
  sendStrategy: dfcSendStrategySchema.nullable().optional(),
  sendAssetRefs: z.array(dfcSendAssetRefSchema),
  needsUserAction: z.boolean(),
}).transform((row): DfcManagedAttachmentDecision => ({
  status: row.status as DfcDecisionStatus,
  reasonCode: row.reasonCode,
  selectedOptionId: row.selectedOptionId ?? null,
  targetKind: (row.targetKind as DfcTargetKind | null | undefined) ?? null,
  sendStrategy: (row.sendStrategy as DfcSendStrategy | null | undefined) ?? null,
  sendAssetRefs: [...row.sendAssetRefs],
  needsUserAction: row.needsUserAction,
}))

const dfcDraftOptionCandidateSchema = z.object({
  optionId: nonEmpty,
  targetKind: dfcTargetKindSchema,
  sendStrategy: dfcSendStrategySchema,
  status: dfcConversionOptionStatusSchema,
  isAvailable: z.boolean(),
  compatibilityStatus: dfcCompatibilityStatusSchema.nullable().optional(),
  sendAssetRefs: z.array(dfcSendAssetRefSchema),
  warnings: z.array(z.string()).optional(),
  diagnostics: z.array(dfcDiagnosticSchema).optional(),
}).transform((row): DfcDraftOptionCandidateDto => ({
  optionId: row.optionId,
  targetKind: row.targetKind as DfcTargetKind,
  sendStrategy: row.sendStrategy as DfcSendStrategy,
  status: row.status as DfcConversionOptionStatus,
  isAvailable: row.isAvailable,
  compatibilityStatus: (row.compatibilityStatus as DfcCompatibilityStatus | null | undefined) ?? null,
  sendAssetRefs: [...row.sendAssetRefs],
  warnings: [...(row.warnings ?? [])],
  diagnostics: [...((row.diagnostics as DfcSanitizedDiagnostic[] | undefined) ?? [])],
}))

const dfcDraftAttachmentOptionsSchema = z.object({
  attachmentId: nonEmpty,
  conversationId: nonEmpty,
  rawFileId: nonEmpty,
  filename: nonEmpty,
  sizeBytes: z.number().int().nonnegative(),
  dfcManaged: z.boolean(),
  selectedOptionId: z.string().trim().nullable().optional(),
  selectedAssetRefs: z.array(dfcSendAssetRefSchema),
  decision: dfcManagedAttachmentDecisionSchema,
  options: z.array(dfcDraftOptionCandidateSchema),
}).transform((row): DfcDraftAttachmentOptionsDto => ({
  attachmentId: row.attachmentId,
  conversationId: row.conversationId,
  rawFileId: row.rawFileId,
  filename: row.filename,
  sizeBytes: row.sizeBytes,
  dfcManaged: row.dfcManaged,
  selectedOptionId: row.selectedOptionId ?? null,
  selectedAssetRefs: [...row.selectedAssetRefs],
  decision: row.decision,
  options: [...row.options],
}))

const dfcDraftAttachmentPreviewPayloadSchema = z.object({
  kind: z.enum(['none', 'raw_file', 'text']),
  status: dfcDecisionStatusSchema,
  text: z.string().nullable().optional(),
  characterCount: z.number().int().nonnegative().nullable().optional(),
  byteLength: z.number().int().nonnegative().nullable().optional(),
  truncated: z.boolean(),
  maxCharacters: z.number().int().positive(),
  diagnostics: z.array(dfcDiagnosticSchema).optional(),
}).transform((row): DfcDraftAttachmentPreviewPayloadDto => ({
  kind: row.kind,
  status: row.status,
  text: row.text ?? null,
  characterCount: row.characterCount ?? null,
  byteLength: row.byteLength ?? null,
  truncated: row.truncated,
  maxCharacters: row.maxCharacters,
  diagnostics: [...((row.diagnostics as DfcSanitizedDiagnostic[] | undefined) ?? [])],
}))

const dfcDraftAttachmentPreviewSchema = z.object({
  attachmentId: nonEmpty,
  conversationId: nonEmpty,
  rawFileId: nonEmpty,
  filename: nonEmpty,
  sizeBytes: z.number().int().nonnegative(),
  dfcManaged: z.boolean(),
  selectedOptionId: z.string().trim().nullable().optional(),
  selectedAssetRefs: z.array(dfcSendAssetRefSchema),
  targetKind: dfcTargetKindSchema.nullable().optional(),
  sendStrategy: dfcSendStrategySchema.nullable().optional(),
  decision: dfcManagedAttachmentDecisionSchema,
  preview: dfcDraftAttachmentPreviewPayloadSchema,
}).transform((row): DfcDraftAttachmentPreviewDto => ({
  attachmentId: row.attachmentId,
  conversationId: row.conversationId,
  rawFileId: row.rawFileId,
  filename: row.filename,
  sizeBytes: row.sizeBytes,
  dfcManaged: row.dfcManaged,
  selectedOptionId: row.selectedOptionId ?? null,
  selectedAssetRefs: [...row.selectedAssetRefs],
  targetKind: (row.targetKind as DfcTargetKind | null | undefined) ?? null,
  sendStrategy: (row.sendStrategy as DfcSendStrategy | null | undefined) ?? null,
  decision: row.decision,
  preview: row.preview,
}))

const derivativeJobSchema = z.object({
  id: nonEmpty,
  assetId: nonEmpty,
  derivativeKind: nonEmpty,
  taskFamily: nonEmpty,
  status: nonEmpty,
  generator: nonEmpty,
  provider: z.string().trim().nullable().optional(),
  modelId: z.string().trim().nullable().optional(),
  inputSnapshotJson: z.record(z.unknown()).nullable().optional(),
  configJson: z.record(z.unknown()).nullable().optional(),
  outputDerivativeId: z.string().trim().nullable().optional(),
  errorCode: z.string().trim().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  attemptCount: z.number().int().nonnegative(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  startedAt: z.number().finite().nullable().optional(),
  finishedAt: z.number().finite().nullable().optional(),
}).transform((row) => ({
  ...row,
  provider: row.provider ?? null,
  modelId: row.modelId ?? null,
  inputSnapshotJson: row.inputSnapshotJson ?? null,
  configJson: row.configJson ?? null,
  outputDerivativeId: row.outputDerivativeId ?? null,
  errorCode: row.errorCode ?? null,
  errorMessage: row.errorMessage ?? null,
  startedAt: row.startedAt ?? null,
  finishedAt: row.finishedAt ?? null,
}))

const messageAttachmentSchema = z.object({
  id: nonEmpty,
  messageId: nonEmpty,
  assetId: nonEmpty,
  aiPayloadKind: nonEmpty,
  processingStatus: nonEmpty,
  includeInNextRequest: z.boolean(),
  excludedReason: z.string().nullable().optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
}).transform((row) => ({
  ...row,
  excludedReason: row.excludedReason ?? null,
}))

const draftAttachmentSchema = z.object({
  id: nonEmpty,
  conversationId: nonEmpty,
  assetId: nonEmpty,
  attachmentOrder: z.number().int().nonnegative(),
  aiPayloadKind: nonEmpty,
  processingStatus: nonEmpty,
  includeInNextRequest: z.boolean(),
  excludedReason: z.string().nullable().optional(),
  preferredSendMode: z.enum(['default', 'auto', 'url_ref', 'inline_base64']).nullable().optional(),
  urlRetentionMode: z.enum(['link_only', 'link_and_file']).nullable().optional(),
  dfcManaged: z.boolean().optional(),
  selectedOptionId: z.string().trim().nullable().optional(),
  selectedAssetRefs: z.array(dfcSendAssetRefSchema).optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
}).transform((row) => ({
  ...row,
  excludedReason: row.excludedReason ?? null,
  preferredSendMode: row.preferredSendMode ?? null,
  urlRetentionMode: row.urlRetentionMode ?? null,
  dfcManaged: row.dfcManaged ?? false,
  selectedOptionId: row.dfcManaged ? row.selectedOptionId ?? null : null,
  selectedAssetRefs: row.dfcManaged ? [...(row.selectedAssetRefs ?? [])] : [],
}))

const conversationDraftSchema = z.object({
  conversationId: nonEmpty,
  draftText: z.string(),
  draftMode: z.enum(['compose', 'edit']),
  editingSourceMessageId: z.string().trim().nullable().optional(),
  attachedAssetIds: z.array(nonEmpty),
  attachments: z.array(draftAttachmentSchema),
  updatedAt: z.number().finite(),
}).transform((row) => ({
  ...row,
  editingSourceMessageId: row.editingSourceMessageId ?? null,
}))

const assetAttachmentOwnershipSchema = z.object({
  assetId: nonEmpty,
  ownerKind: nonEmpty,
  lifecycleStatus: nonEmpty,
  draftConversationIds: z.array(nonEmpty),
  messageIds: z.array(nonEmpty),
  reason: z.string().nullable().optional(),
  updatedAt: z.number().finite().nullable().optional(),
}).transform((row) => ({
  ...row,
  reason: row.reason ?? null,
  updatedAt: row.updatedAt ?? null,
}))

const attachmentSnapshotItemSchema = z.object({
  attachmentId: nonEmpty,
  messageId: nonEmpty,
  assetId: nonEmpty,
  aiPayloadKind: nonEmpty,
  processingStatus: nonEmpty,
  included: z.boolean(),
  excludedReason: z.string().nullable().optional(),
  sourceKind: z.string().nullable().optional(),
  storageBackend: z.string().nullable().optional(),
  dfcManaged: z.boolean().optional(),
  usedOptionId: z.string().trim().nullable().optional(),
  usedAssetRefs: z.array(dfcSendAssetRefSchema).optional(),
  targetKind: dfcTargetKindSchema.nullable().optional(),
  sendStrategy: dfcSendStrategySchema.nullable().optional(),
}).transform((row) => ({
  ...row,
  excludedReason: row.excludedReason ?? null,
  sourceKind: row.sourceKind ?? null,
  storageBackend: row.storageBackend ?? null,
  dfcManaged: row.dfcManaged ?? false,
  usedOptionId: row.dfcManaged ? row.usedOptionId ?? null : null,
  usedAssetRefs: row.dfcManaged ? [...(row.usedAssetRefs ?? [])] : [],
  targetKind: row.dfcManaged ? row.targetKind ?? null : null,
  sendStrategy: row.dfcManaged ? row.sendStrategy ?? null : null,
}))

const attachmentCandidateSnapshotSchema = z.object({
  scope: z.enum(['messages', 'branch']),
  messageIds: z.array(nonEmpty),
  included: z.array(attachmentSnapshotItemSchema),
  excluded: z.array(attachmentSnapshotItemSchema),
  items: z.array(attachmentSnapshotItemSchema),
})

const commitDraftToUserMessageResultSchema = z.object({
  message: persistedMessageSchema,
  attachments: z.array(messageAttachmentSchema),
  draft: conversationDraftSchema,
})

const attachDraftToMessageResultSchema = z.object({
  messageId: nonEmpty,
  attachments: z.array(messageAttachmentSchema),
  draft: conversationDraftSchema,
})

const fileIngestionWarningSchema = z.object({
  code: nonEmpty,
  message: nonEmpty,
})

const fileIngestionHintsSchema = z.object({
  canUseUrlRef: z.boolean(),
  canUseLocalFile: z.boolean(),
  canUseInlinePayload: z.boolean(),
  urlReferenceMayStillBeUsable: z.boolean(),
  notes: z.array(z.string()),
})

const fileIngestionResultSchema = z.object({
  success: z.boolean(),
  sourceKind: nonEmpty,
  assetId: z.string().trim().nullable().optional(),
  normalizedExtension: z.string().trim().nullable().optional(),
  assetKind: nonEmpty,
  aiPayloadKind: nonEmpty,
  processingStatus: nonEmpty,
  isNativeSupportedForMvp: z.boolean(),
  isConvertibleCandidate: z.boolean(),
  importStatus: nonEmpty,
  sendEligibilityHints: fileIngestionHintsSchema,
  warnings: z.array(fileIngestionWarningSchema),
  failureReasonCode: z.string().nullable().optional(),
  retentionMode: z.string().optional(),
  probeStatus: z.string().optional(),
  materializationStatus: z.string().optional(),
  originalUrl: z.string().optional(),
  resolvedUrl: z.string().optional(),
}).transform((row) => ({
  ...row,
  assetId: row.assetId ?? null,
  normalizedExtension: row.normalizedExtension ?? null,
  failureReasonCode: row.failureReasonCode ?? null,
}))

const previewPayloadSchema = z.object({
  assetId: nonEmpty,
  status: z.enum(['ready', 'missing', 'failed']),
  derivativeId: z.string().trim().nullable().optional(),
  mime: z.string().trim().nullable().optional(),
  dataUrl: z.string().nullable().optional(),
  width: z.number().finite().nullable().optional(),
  height: z.number().finite().nullable().optional(),
  bytes: z.number().finite().nullable().optional(),
  reused: z.boolean(),
  errorCode: z.string().trim().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
}).transform((row) => ({
  ...row,
  derivativeId: row.derivativeId ?? null,
  mime: row.mime ?? null,
  dataUrl: row.dataUrl ?? null,
  width: row.width ?? null,
  height: row.height ?? null,
  bytes: row.bytes ?? null,
  errorCode: row.errorCode ?? null,
  errorMessage: row.errorMessage ?? null,
}))

const sendPlanIssueSchema = z.object({
  code: nonEmpty,
  message: nonEmpty,
  assetId: z.string().trim().nullable().optional(),
  source: z.enum(['draft', 'history', 'request']),
}).transform((row) => ({
  ...row,
  assetId: row.assetId ?? null,
}))

const sendPlanAttachmentRefBaseSchema = z.object({
  assetId: nonEmpty,
  source: z.enum(['draft', 'history']),
  attachmentId: nonEmpty,
  messageId: z.string().trim().nullable().optional(),
})

const sendPlanAttachmentRefSchema = sendPlanAttachmentRefBaseSchema.transform((row) => ({
  ...row,
  messageId: row.messageId ?? null,
}))

const aiPayloadKindSchema = z.enum(['image', 'pdf', 'text', 'audio', 'video', 'binary'])

const sendPlanAttachmentDetectionSchema = z.object({
  routeEligibility: z.enum(['verdict_ready', 'detection_pending', 'detection_failed', 'detection_required']),
  detectionLevel: z.enum(['basic', 'advanced', 'parser_validated']).nullable().optional(),
  engineMode: z.enum(['core_only', 'core_plus_magika', 'core_plus_parser', 'core_plus_external']).nullable().optional(),
  usedMagika: z.boolean(),
  magikaState: z.enum(['not_installed', 'disabled', 'unavailable', 'available', 'failed', 'not_requested']),
  evidenceSources: z.array(z.string()),
  decisiveEvidenceSource: z.string().trim().nullable().optional(),
  detectionTrigger: z.string().trim().nullable().optional(),
  magikaModelVersion: z.string().trim().nullable().optional(),
  advancedAttempted: z.boolean(),
  advancedFailureReason: z.string().trim().nullable().optional(),
}).transform((row) => ({
  routeEligibility: row.routeEligibility,
  detectionLevel: row.detectionLevel ?? null,
  engineMode: row.engineMode ?? null,
  usedMagika: row.usedMagika,
  magikaState: row.magikaState,
  evidenceSources: [...row.evidenceSources],
  decisiveEvidenceSource: row.decisiveEvidenceSource ?? null,
  detectionTrigger: row.detectionTrigger ?? null,
  magikaModelVersion: row.magikaModelVersion ?? null,
  advancedAttempted: row.advancedAttempted,
  advancedFailureReason: row.advancedFailureReason ?? null,
}))

const sendPlanAttachmentSchema = z.object({
  assetId: nonEmpty,
  attachmentId: nonEmpty,
  source: z.enum(['draft', 'history']),
  messageId: z.string().trim().nullable().optional(),
  aiPayloadKind: aiPayloadKindSchema,
  semantic: z.object({
    targetKind: z.enum(['original_file', 'plain_text', 'markdown', 'code', 'table_markdown', 'pdf_attachment', 'native_file', 'hybrid', 'unsupported']),
    sendStrategy: z.enum(['text_in_prompt', 'file_attachment', 'mixed', 'unsupported']),
    mappedFromLegacy: z.boolean(),
  }).optional(),
  sendAssetRefs: z.array(dfcSendAssetRefSchema).optional(),
  selectedSendMode: z.enum(['url_ref', 'inline_base64', 'provider_file_ref']).nullable().optional(),
  fallbackSendModes: z.array(z.enum(['url_ref', 'inline_base64', 'provider_file_ref'])),
  eligibility: z.enum(['included', 'warning', 'excluded', 'blocked']),
  exclusionReason: z.string().trim().nullable().optional(),
  displayStatus: z.enum(['parsing', 'detection_pending', 'detection_failed', 'detection_required', 'ready', 'failed', 'incompatible_with_current_model', 'ready_with_warnings', 'unsupported']),
  needsUserAttention: z.boolean(),
  notes: z.array(z.string()),
  lineage: z.object({
    state: z.enum(['ok', 'unknown', 'preview_only_asset_not_sendable', 'stale_derived_asset', 'preview_send_asset_mismatch', 'send_asset_not_ready']),
    stale: z.boolean(),
    staleReason: z.string().nullable().optional(),
    sourceHash: z.string().nullable().optional(),
    previewContentHash: z.string().nullable().optional(),
    sendContentHash: z.string().nullable().optional(),
    conversionSettingsHash: z.string().nullable().optional(),
  }).optional(),
  fileType: z.object({
    formatId: nonEmpty,
    kind: nonEmpty,
    confidenceLevel: nonEmpty,
    recommendedRoute: z.string().trim().nullable().optional(),
    recommendedRouteLabelCode: z.string().trim().nullable().optional(),
    compatibility: z.enum(['compatible', 'warning', 'blocked', 'unknown']),
    blocked: z.boolean(),
    requiresJob: z.boolean(),
    engineUnavailable: z.boolean(),
    hasConflicts: z.boolean(),
    hasExtensionMimeConflict: z.boolean(),
    warningLabelCodes: z.array(z.string()),
    blockedLabelCodes: z.array(z.string()),
    blockedBy: z.array(z.string()),
  }).nullable().optional(),
  detection: sendPlanAttachmentDetectionSchema.nullable().optional(),
}).transform((row) => ({
  ...row,
  messageId: row.messageId ?? null,
  selectedSendMode: row.selectedSendMode ?? null,
  exclusionReason: row.exclusionReason ?? null,
  semantic: row.semantic ?? inferMissingAttachmentSemantic(),
  sendAssetRefs: [...(row.sendAssetRefs ?? [])] as DfcSendAssetRef[],
  lineage: row.lineage
    ? {
        state: row.lineage.state,
        stale: row.lineage.stale,
        staleReason: row.lineage.staleReason ?? null,
        sourceHash: row.lineage.sourceHash ?? null,
        previewContentHash: row.lineage.previewContentHash ?? null,
        sendContentHash: row.lineage.sendContentHash ?? null,
        conversionSettingsHash: row.lineage.conversionSettingsHash ?? null,
      }
    : {
        state: 'unknown',
        stale: false,
        staleReason: null,
        sourceHash: null,
        previewContentHash: null,
        sendContentHash: null,
        conversionSettingsHash: null,
      },
  fileType: row.fileType
    ? {
        formatId: row.fileType.formatId,
        kind: row.fileType.kind,
        confidenceLevel: row.fileType.confidenceLevel,
        recommendedRoute: row.fileType.recommendedRoute ?? null,
        recommendedRouteLabelCode: row.fileType.recommendedRouteLabelCode ?? null,
        compatibility: row.fileType.compatibility,
        blocked: row.fileType.blocked,
        requiresJob: row.fileType.requiresJob,
        engineUnavailable: row.fileType.engineUnavailable,
        hasConflicts: row.fileType.hasConflicts,
        hasExtensionMimeConflict: row.fileType.hasExtensionMimeConflict,
        warningLabelCodes: [...row.fileType.warningLabelCodes],
        blockedLabelCodes: [...row.fileType.blockedLabelCodes],
        blockedBy: [...row.fileType.blockedBy],
      }
    : null,
  detection: row.detection ?? null,
}))

const sendPlanSchema = z.object({
  status: z.enum(['sendable', 'sendable_with_warnings', 'partially_sendable', 'blocked']),
  warnings: z.array(sendPlanIssueSchema),
  blockingReasons: z.array(sendPlanIssueSchema),
  includedAttachments: z.array(sendPlanAttachmentRefSchema),
  excludedAttachments: z.array(sendPlanAttachmentRefBaseSchema.extend({
    exclusionReason: nonEmpty,
  }).transform((row) => ({
    ...row,
    messageId: row.messageId ?? null,
  }))),
  attachmentPlans: z.array(sendPlanAttachmentSchema),
  requiresModelChange: z.boolean(),
  canProceedAfterDroppingExcluded: z.boolean(),
  requiresUserConfirmation: z.boolean(),
  plannerVersion: nonEmpty,
})

function inferMissingAttachmentSemantic(): {
  targetKind: 'unsupported'
  sendStrategy: 'unsupported'
  mappedFromLegacy: false
} {
  return { targetKind: 'unsupported', sendStrategy: 'unsupported', mappedFromLegacy: false }
}

const buildCurrentSendPlanResultSchema = z.object({
  sendPlan: sendPlanSchema,
  draftText: z.string(),
  assets: z.array(fileAssetSchema),
  storageRootDir: nonEmpty,
})

type BuildCurrentSendPlanSchemaOutput = z.output<typeof buildCurrentSendPlanResultSchema>

function toDecodedBuildCurrentSendPlanResult(
  value: BuildCurrentSendPlanSchemaOutput,
): DecodedBuildCurrentSendPlanResult {
  // Zod has validated the runtime shape. TypeScript may still complain about
  // deep `readonly` compatibility (mutable arrays vs ReadonlyArray). The
  // conversion below performs a shallow field mapping; we use a single
  // assertion at the boundary to satisfy the Readonly<> return type without
  // changing runtime behavior.
  return {
    draftText: value.draftText,
    sendPlan: value.sendPlan,
    assets: value.assets,
    storageRootDir: value.storageRootDir,
  } as DecodedBuildCurrentSendPlanResult
}

const fileAssetSoftDeleteSchema = z.object({
  ok: z.literal(true),
  softDeleted: z.boolean(),
  physicalCleanupRequired: z.literal(true),
})

const fileAssetPhysicalCleanupPlanSchema = z.object({
  ok: z.literal(true),
  assetId: nonEmpty,
  storageUris: z.array(nonEmpty),
  physicalDeletePerformed: z.literal(false),
})

const appendReasoningDetailSegmentsResultSchema = z.object({
  ok: z.boolean(),
  received: z.number().finite(),
  inserted: z.number().finite(),
  skipped: z.number().finite(),
  ignored: z.number().finite(),
  sumDeltaLenInserted: z.number().finite(),
})

const beginTurnResultSchema = z.object({
  ok: z.literal(true),
  convoId: nonEmpty,
  questionId: nonEmpty,
  questionSeq: z.number().finite(),
  assistantId: nonEmpty,
  assistantSeq: z.number().finite(),
})

const switchCandidateResultSchema = z.object({
  headMessageId: nonEmpty,
})

const switchQuestionCandidateResultSchema = z.object({
  ok: z.literal(true),
  headMessageId: nonEmpty,
})

const regenerateFromQuestionResultSchema = z.object({
  ok: z.literal(true),
  newAnswerRootId: nonEmpty,
  newAssistantSeq: z.number().finite(),
})

const forkQuestionResultSchema = z.object({
  ok: z.literal(true),
  baseMessageId: z.string().trim().nullable().optional(),
  newQuestionId: nonEmpty,
  newQuestionSeq: z.number().finite(),
  assistantId: nonEmpty,
  assistantSeq: z.number().finite(),
})

const truncateBranchFromQuestionResultSchema = z.object({
  ok: z.literal(true),
  headMessageId: z.string().trim().nullable(),
  fallbackQuestionId: z.string().trim().nullable(),
})

const searchHitSchema = z.object({
  entityType: z.enum(['project', 'convo', 'message']),
  entityId: nonEmpty,
  projectId: z.string().trim().nullable().optional(),
  convoId: z.string().trim().nullable().optional(),
  createdAtSec: z.number().finite().default(0),
  snippet: z.string().default(''),
  score: z.number().finite().default(0),
}).transform((row) => ({
  ...row,
  projectId: row.projectId && row.projectId.length > 0 ? row.projectId : null,
  convoId: row.convoId && row.convoId.length > 0 ? row.convoId : null,
}))

const booleanAckSchema = z.object({
  ok: z.boolean().optional(),
}).transform((row) => row.ok ?? true)

const messageAssetPersistAckSchema = z.object({
  ok: z.boolean().optional(),
  assets: z.array(messageAssetRenderSchema).optional(),
}).transform((row) => row.assets ?? [])

const strictAckSchema = z.object({
  ok: z.boolean(),
})

const openRouterProviderRequireParametersSchema = z.object({
  value: z.boolean(),
})

const definedUnknownSchema = z.any().refine((value) => value !== undefined)

const webSearchDefaultsSchema = z.object({
  value: definedUnknownSchema.nullable(),
})

const samplingParamsDefaultsSchema = z.object({
  value: definedUnknownSchema.nullable(),
})

const imageGenerationDefaultSchema = z.object({
  value: definedUnknownSchema.nullable(),
})

const userMessageRenderDefaultSchema = z.object({
  value: z.boolean().nullable(),
})

const chatReasoningDisplayModeSchema = z.object({
  value: z.enum(['inline', 'rail']),
})

const chatReasoningPanelDefaultExpandedSchema = z.object({
  value: z.boolean(),
})

const chatDraftSchema = z.object({
  value: z.string().nullable(),
})

const deletedCountSchema = z.object({
  deleted: z.number().int().nonnegative(),
})

const projectCountSchema = z.object({
  count: z.number().finite(),
})

const projectCountBatchSchema = z.object({
  counts: z.record(z.number().finite()),
})

const convoSetProjectManySchema = z.object({
  moved: z.number().finite(),
  failed: z.array(z.string()),
})

const convoDeleteManySchema = z.object({
  deleted: z.number().finite(),
})

export function decodeProjectListResponse(raw: unknown): DecodedProjectSummary[] {
  const rows = decodeWithSchema('project.list', z.array(projectSummarySchema), raw)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    meta: row.meta ?? null,
    ...(row.alreadyExists !== undefined ? { alreadyExists: row.alreadyExists } : {}),
    ...(row.isSystemProject !== undefined ? { isSystemProject: row.isSystemProject } : {}),
  }))
}

export function decodeProjectCreateResponse(raw: unknown): DecodedProjectSummary {
  const row = decodeWithSchema('project.create', projectSummarySchema, raw)
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    meta: row.meta ?? null,
    ...(row.alreadyExists !== undefined ? { alreadyExists: row.alreadyExists } : {}),
    ...(row.isSystemProject !== undefined ? { isSystemProject: row.isSystemProject } : {}),
  }
}

export function decodeProjectFindByIdResponse(raw: unknown): DecodedProjectSummary | null {
  if (raw === null || raw === undefined) return null
  return decodeProjectCreateResponse(raw)
}

export function decodeProjectGetInboxResponse(raw: unknown): DecodedProjectSummary | null {
  if (raw === null || raw === undefined) return null
  return decodeProjectCreateResponse(raw)
}

export function decodeProjectCountConversationsResponse(raw: unknown): number {
  return decodeWithSchema('project.countConversations', projectCountSchema, raw).count
}

export function decodeProjectCountConversationsBatchResponse(raw: unknown): Record<string, number> {
  return decodeWithSchema('project.countConversationsBatch', projectCountBatchSchema, raw).counts
}

export function decodeConvoListResponse(raw: unknown): DecodedConvoSummary[] {
  const rows = decodeWithSchema('convo.list', z.array(convoSummarySchema), raw)
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    projectId: row.projectId ?? null,
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    meta: row.meta ?? null,
  }))
}

export function decodeConvoCreateResponse(raw: unknown): DecodedConvoSummary {
  const row = decodeWithSchema('convo.create', convoSummarySchema, raw)
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId ?? null,
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    meta: row.meta ?? null,
  }
}

export function decodeConvoSetProjectManyResponse(raw: unknown): DecodedConvoSetProjectManyResult {
  const row = decodeWithSchema('convo.setProjectMany', convoSetProjectManySchema, raw)
  return { moved: row.moved, failed: row.failed }
}

export function decodeConvoDeleteManyResponse(raw: unknown): number {
  return decodeWithSchema('convo.deleteMany', convoDeleteManySchema, raw).deleted
}

export function decodeMessageListResponse(raw: unknown): DecodedPersistedMessage[] {
  const rows = decodeWithSchema('message.list', z.array(persistedMessageSchema), raw)
  return rows.map((row) => ({
    id: row.id,
    convoId: row.convoId,
    role: row.role ?? 'assistant',
    seq: row.seq,
    createdAt: row.createdAt ?? 0,
    body: row.body ?? '',
    meta: row.meta ?? null,
  }))
}

export function decodeMessageAppendResponse(raw: unknown): DecodedPersistedMessage {
  const row = decodeWithSchema('message.append', persistedMessageSchema, raw)
  return {
    id: row.id,
    convoId: row.convoId,
    role: row.role ?? 'assistant',
    seq: row.seq,
    createdAt: row.createdAt ?? 0,
    body: row.body ?? '',
    meta: row.meta ?? null,
  }
}

export function decodeMessageAssetPersistResponse(raw: unknown): DecodedMessageAssetRender[] {
  const rows = decodeWithSchema('messageAsset.persistFromDataUrls', messageAssetPersistAckSchema, raw)
  return rows.map((row) => ({
    messageId: row.messageId,
    assetId: row.assetId,
    ordinal: row.ordinal,
    mime: row.mime,
    width: row.width,
    height: row.height,
    assetUrl: row.assetUrl,
  }))
}

export function decodeMessageAssetListResponse(raw: unknown): DecodedMessageAssetRender[] {
  const rows = decodeWithSchema('messageAsset.listByMessageIds', z.array(messageAssetRenderSchema), raw)
  return rows.map((row) => ({
    messageId: row.messageId,
    assetId: row.assetId,
    ordinal: row.ordinal,
    mime: row.mime,
    width: row.width,
    height: row.height,
    assetUrl: row.assetUrl,
  }))
}

export function decodeFileAssetResponse(raw: unknown): DecodedFileAsset {
  return decodeWithSchema('fileAsset', fileAssetSchema, raw)
}

export function decodeNullableFileAssetResponse(raw: unknown): DecodedFileAsset | null {
  if (raw === null || raw === undefined) return null
  return decodeFileAssetResponse(raw)
}

export function decodeFileAssetListResponse(raw: unknown): DecodedFileAsset[] {
  return decodeWithSchema('fileAsset.listByIds', z.array(fileAssetSchema), raw)
}

export function decodeDfcFileAssetResponse(raw: unknown): DecodedDfcFileAsset {
  return sanitizeDfcFileAsset(decodeFileAssetResponse(raw))
}

export function decodeDfcFileAssetListResponse(raw: unknown): DecodedDfcFileAsset[] {
  return decodeFileAssetListResponse(raw).map(sanitizeDfcFileAsset)
}

export function decodeFileDerivativeResponse(raw: unknown): DecodedFileDerivative {
  return decodeWithSchema('fileDerivative', fileDerivativeSchema, raw)
}

export function decodeFileDerivativeListResponse(raw: unknown): DecodedFileDerivative[] {
  return decodeWithSchema('fileDerivative.listByParentAssetId', z.array(fileDerivativeSchema), raw)
}

export function decodeDfcFileDerivativeResponse(raw: unknown): DecodedDfcFileDerivative {
  return sanitizeDfcFileDerivative(decodeFileDerivativeResponse(raw))
}

export function decodeDfcFileDerivativeListResponse(raw: unknown): DecodedDfcFileDerivative[] {
  return decodeFileDerivativeListResponse(raw).map(sanitizeDfcFileDerivative)
}

export function decodeDfcAttachmentDtoResponse(raw: unknown): DfcSanitizedAttachmentDto {
  return decodeWithSchema('dfcAttachment', dfcAttachmentAuditSchema, raw)
}

export function decodeDfcAttachmentDtoListResponse(raw: unknown): DfcSanitizedAttachmentDto[] {
  return decodeWithSchema('dfcAttachment.list', z.array(dfcAttachmentAuditSchema), raw)
}

export function decodeDfcDraftAttachmentOptionsResponse(raw: unknown): DecodedDfcDraftAttachmentOptions {
  return decodeWithSchema('conversationDraft.getDfcOptions', dfcDraftAttachmentOptionsSchema, raw)
}

export function decodeDfcDraftAttachmentPreviewResponse(raw: unknown): DecodedDfcDraftAttachmentPreview {
  return decodeWithSchema('conversationDraft.getDfcPreview', dfcDraftAttachmentPreviewSchema, raw)
}

export function decodeDerivativeJobResponse(raw: unknown): DecodedDerivativeJob {
  return decodeWithSchema('derivativeJob', derivativeJobSchema, raw)
}

export function decodeNullableDerivativeJobResponse(raw: unknown): DecodedDerivativeJob | null {
  if (raw === null || raw === undefined) return null
  return decodeDerivativeJobResponse(raw)
}

function sanitizeDfcFileAsset(asset: DecodedFileAsset): DecodedDfcFileAsset {
  return {
    rawFileId: asset.id,
    filename: asset.filename,
    extension: asset.extension,
    mime: asset.mime,
    sizeBytes: asset.sizeBytes,
    assetKind: asset.assetKind,
    sourceKind: asset.sourceKind,
    ingestStatus: asset.ingestStatus,
    previewStatus: asset.previewStatus,
    deletedAt: asset.deletedAt,
  }
}

function sanitizeDfcFileDerivative(derivative: DecodedFileDerivative): DecodedDfcFileDerivative {
  const meta = derivative.metaJson ?? {}
  return {
    derivedAssetId: derivative.id,
    sourceFileId: derivative.parentAssetId,
    derivedKind: derivative.derivedKind,
    mime: derivative.mime,
    status: derivative.status,
    targetKind: readStringMeta(meta, 'targetKind'),
    usage: readStringMeta(meta, 'usage'),
    storageClass: readStringMeta(meta, 'storageClass'),
    converterName: readStringMeta(meta, 'converterName'),
    converterVersion: readStringMeta(meta, 'converterVersion'),
    warnings: readStringArrayMeta(meta, 'warnings'),
    deletedAt: derivative.deletedAt,
  }
}

function readStringMeta(meta: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = meta[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function readStringArrayMeta(meta: Readonly<Record<string, unknown>>, key: string): string[] {
  const value = meta[key]
  if (!Array.isArray(value)) return []
  return value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
}

export function decodeDerivativeJobListResponse(raw: unknown): DecodedDerivativeJob[] {
  return decodeWithSchema('derivativeJob.listByAssetId', z.array(derivativeJobSchema), raw)
}

export function decodeMessageAttachmentResponse(raw: unknown): DecodedMessageAttachment {
  return decodeWithSchema('messageAttachment', messageAttachmentSchema, raw)
}

export function decodeMessageAttachmentListResponse(raw: unknown): DecodedMessageAttachment[] {
  return decodeWithSchema('messageAttachment.list', z.array(messageAttachmentSchema), raw)
}

export function decodeConversationDraftResponse(raw: unknown): DecodedConversationDraft {
  return decodeWithSchema('conversationDraft', conversationDraftSchema, raw)
}

export function decodeDraftAttachmentResponse(raw: unknown): DecodedDraftAttachment {
  return decodeWithSchema('conversationDraft.attachment', draftAttachmentSchema, raw)
}

export function decodeUpdateDraftAttachmentSettingsResponse(raw: unknown): DecodedDraftAttachment {
  return decodeWithSchema('conversationDraft.updateAttachmentSettings', draftAttachmentSchema, raw)
}

export function decodeCommitDraftToUserMessageResponse(raw: unknown): DecodedCommitDraftToUserMessageResult {
  return decodeWithSchema('conversationDraft.commitToUserMessage', commitDraftToUserMessageResultSchema, raw)
}

export function decodeAttachDraftToMessageResponse(raw: unknown): DecodedAttachDraftToMessageResult {
  return decodeWithSchema('conversationDraft.attachToMessage', attachDraftToMessageResultSchema, raw)
}

export function decodeFileIngestionResultResponse(method: string, raw: unknown): DecodedFileIngestionResult {
  return decodeWithSchema(method, fileIngestionResultSchema, raw)
}

export function decodePreviewPayloadResponse(method: string, raw: unknown): DecodedPreviewPayload {
  return decodeWithSchema(method, previewPayloadSchema, raw)
}

export function decodeBuildCurrentSendPlanResponse(raw: unknown): DecodedBuildCurrentSendPlanResult {
  const parsed = decodeWithSchema('sendPlan.buildCurrent', buildCurrentSendPlanResultSchema, raw) as BuildCurrentSendPlanSchemaOutput
  return toDecodedBuildCurrentSendPlanResult(parsed)
}

export function decodeAssetAttachmentOwnershipResponse(raw: unknown): DecodedAssetAttachmentOwnership {
  return decodeWithSchema('messageAttachment.getAssetOwnership', assetAttachmentOwnershipSchema, raw)
}

export function decodeAttachmentCandidateSnapshotResponse(raw: unknown): DecodedAttachmentCandidateSnapshot {
  return decodeWithSchema('messageAttachment.getCandidateSnapshot', attachmentCandidateSnapshotSchema, raw)
}

export function decodeRemoveDraftAttachmentResponse(raw: unknown) {
  return decodeWithSchema('conversationDraft.removeAttachment', z.object({
    ok: z.literal(true),
    removed: z.boolean(),
    ownership: assetAttachmentOwnershipSchema,
  }), raw)
}

export function decodeDetachMessageAttachmentResponse(raw: unknown) {
  return decodeWithSchema('messageAttachment.detach', z.object({
    ok: z.literal(true),
    detached: z.boolean(),
    ownership: assetAttachmentOwnershipSchema,
  }), raw)
}

export function decodeFileAssetSoftDeleteResponse(raw: unknown) {
  return decodeWithSchema('fileAsset.softDelete', fileAssetSoftDeleteSchema, raw)
}

export function decodeFileAssetPhysicalCleanupPlanResponse(raw: unknown) {
  return decodeWithSchema('fileAsset.planPhysicalCleanup', fileAssetPhysicalCleanupPlanSchema, raw)
}

export function decodeAppendReasoningDetailSegmentsResponse(raw: unknown) {
  return decodeWithSchema('message.appendReasoningDetailSegments', appendReasoningDetailSegmentsResultSchema, raw)
}

export function decodeBranchBeginTurnResponse(raw: unknown): DecodedBeginTurnResult {
  const row = decodeWithSchema('branch.beginTurn', beginTurnResultSchema, raw)
  return {
    convoId: row.convoId,
    questionId: row.questionId,
    questionSeq: row.questionSeq,
    assistantId: row.assistantId,
    assistantSeq: row.assistantSeq,
  }
}

export function decodeBranchSwitchCandidateResponse(raw: unknown): DecodedSwitchCandidateResult {
  return decodeWithSchema('branch.switchCandidate', switchCandidateResultSchema, raw)
}

export function decodeBranchSwitchQuestionCandidateResponse(raw: unknown): DecodedSwitchQuestionCandidateResult {
  const row = decodeWithSchema('branch.switchQuestionCandidate', switchQuestionCandidateResultSchema, raw)
  return { headMessageId: row.headMessageId }
}

export function decodeBranchRegenerateFromQuestionResponse(raw: unknown): DecodedRegenerateFromQuestionResult {
  const row = decodeWithSchema('branch.regenerateFromQuestion', regenerateFromQuestionResultSchema, raw)
  return {
    newAnswerRootId: row.newAnswerRootId,
    newAssistantSeq: row.newAssistantSeq,
  }
}

export function decodeBranchForkQuestionResponse(raw: unknown): DecodedForkQuestionResult {
  const row = decodeWithSchema('branch.forkQuestion', forkQuestionResultSchema, raw)
  return {
    baseMessageId: row.baseMessageId ?? null,
    newQuestionId: row.newQuestionId,
    newQuestionSeq: row.newQuestionSeq,
    assistantId: row.assistantId,
    assistantSeq: row.assistantSeq,
  }
}

export function decodeBranchRetryReplaceQuestionResponse(raw: unknown): DecodedForkQuestionResult {
  const row = decodeWithSchema('branch.retryReplaceQuestion', forkQuestionResultSchema, raw)
  return {
    baseMessageId: row.baseMessageId ?? null,
    newQuestionId: row.newQuestionId,
    newQuestionSeq: row.newQuestionSeq,
    assistantId: row.assistantId,
    assistantSeq: row.assistantSeq,
  }
}

export function decodeBranchTruncateFromQuestionResponse(raw: unknown): DecodedTruncateBranchFromQuestionResult {
  const row = decodeWithSchema('branch.truncateFromQuestion', truncateBranchFromQuestionResultSchema, raw)
  return {
    headMessageId: row.headMessageId ?? null,
    fallbackQuestionId: row.fallbackQuestionId ?? null,
  }
}

export function decodeSearchQueryResponse(raw: unknown): DecodedSearchHit[] {
  const rows = decodeWithSchema('search.query', z.array(searchHitSchema), raw)
  return rows.map((row) => ({
    entityType: row.entityType,
    entityId: row.entityId,
    projectId: row.projectId ?? null,
    convoId: row.convoId ?? null,
    createdAtSec: row.createdAtSec ?? 0,
    snippet: row.snippet ?? '',
    score: row.score ?? 0,
  }))
}

export function decodeBooleanAck(method: string, raw: unknown): boolean {
  return decodeWithSchema(method, booleanAckSchema, raw)
}

export function decodeStrictAck(method: string, raw: unknown): boolean {
  return decodeWithSchema(method, strictAckSchema, raw).ok
}

export function decodeOpenRouterProviderRequireParametersResponse(raw: unknown): boolean {
  return decodeWithSchema('settings.getOpenRouterProviderRequireParameters', openRouterProviderRequireParametersSchema, raw).value
}

export function decodeWebSearchDefaultsResponse(raw: unknown): unknown | null {
  return decodeWithSchema('settings.getWebSearchDefaults', webSearchDefaultsSchema, raw).value
}

export function decodeSamplingParamsDefaultsResponse(raw: unknown): unknown | null {
  return decodeWithSchema('settings.getSamplingParamsDefaults', samplingParamsDefaultsSchema, raw).value
}

export function decodeImageGenerationDefaultResponse(raw: unknown): unknown | null {
  return decodeWithSchema('settings.getImageGenerationDefault', imageGenerationDefaultSchema, raw).value
}

export function decodeUserMessageRenderDefaultResponse(raw: unknown): boolean | null {
  return decodeWithSchema('settings.getUserMessageRenderDefault', userMessageRenderDefaultSchema, raw).value
}

export function decodeChatReasoningDisplayModeResponse(raw: unknown): 'inline' | 'rail' {
  return decodeWithSchema('settings.getChatReasoningDisplayMode', chatReasoningDisplayModeSchema, raw).value
}

export function decodeChatReasoningPanelDefaultExpandedResponse(raw: unknown): boolean {
  return decodeWithSchema('settings.getChatReasoningPanelDefaultExpanded', chatReasoningPanelDefaultExpandedSchema, raw).value
}

export function decodeChatDraftResponse(raw: unknown): string | null {
  return decodeWithSchema('settings.getChatDraft', chatDraftSchema, raw).value
}

export function decodeDeletedCountResponse(method: string, raw: unknown): number {
  return decodeWithSchema(method, deletedCountSchema, raw).deleted
}

export function decodeMessageSetStatusResponse(raw: unknown): boolean {
  return decodeStrictAck('message.setStatus', raw)
}

export function decodeMessageFinalizeReasoningDetailsResponse(raw: unknown): boolean {
  return decodeStrictAck('message.finalizeReasoningDetails', raw)
}

export function decodeBranchSetHeadResponse(raw: unknown): boolean {
  return decodeStrictAck('branch.setHead', raw)
}
