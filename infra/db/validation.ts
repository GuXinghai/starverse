import { z, type ZodType } from 'zod'
import type {
  AppendMessageInput,
  AppendMessageDeltaInput,
  SetMessageStatusInput,
  SetMessageAnnotationsInput,
  UpsertMessageErrorInput,
  ListMessageErrorByIdsInput,
  PersistMessageAssetsFromDataUrlsInput,
  ListMessageAssetsByMessageIdsInput,
  GetMessageAssetByIdInput,
  CreateFileAssetInput,
  ListFileAssetsByIdsInput,
  SoftDeleteFileAssetInput,
  CreateFileDerivativeInput,
  GetFileDerivativeByIdInput,
  GetLatestReadyFileDerivativeInput,
  UpdateFileDerivativeInput,
  CreateDerivativeJobInput,
  GetDerivativeJobByIdInput,
  ListDerivativeJobsByAssetIdInput,
  RunDerivativeJobInput,
  RetryDerivativeJobInput,
  CancelDerivativeJobInput,
  CapturePdfAnnotationDerivativeInput,
  ListFileDerivativesByParentAssetIdInput,
  CreateMessageAttachmentInput,
  ListMessageAttachmentsByMessageIdInput,
  ListMessageAttachmentsByAssetIdInput,
  RestoreConversationDraftInput,
  UpdateConversationDraftTextInput,
  AddDraftAttachmentInput,
  RemoveDraftAttachmentInput,
  UpdateDraftAttachmentSettingsInput,
  CommitDraftToUserMessageInput,
  AttachDraftToMessageInput,
  CloneMessageAttachmentsToDraftInput,
  DetachMessageAttachmentInput,
  MarkAttachmentAbandonedInput,
  GetAssetAttachmentOwnershipInput,
  GetAttachmentCandidateSnapshotInput,
  BuildCurrentSendPlanInput,
  PrepareOpenRouterReplayFromMessageInput,
  IngestLocalFileInput,
  IngestUrlInput,
  PreviewEnsureInput,
  PreviewGetLatestInput,
  DetectFileTypeInput,
  MarkFileTypeVerdictStaleInput,
  AppendReasoningDetailSegmentsInput,
  FinalizeReasoningDetailsInput,
  SetReasoningRequestConfigInput,
  GetReasoningSegmentsStatsInput,
  CreateConvoInput,
  SaveConvoInput,
  SaveConvoWithMessagesInput,
  DeleteConvoInput,
  CreateProjectInput,
  SaveProjectInput,
  DeleteProjectInput,
  ListProjectParams,
  FulltextQueryParams,
  SearchQueryParams,
  ListConvoParams,
  ListMessageParams,
  ReplaceMessagesInput,
  MessageSnapshot,
  BatchDeleteInput,
  SetConvoProjectInput,
  SetConvoProjectManyInput,
  EnsureDefaultBranchInput,
  ListBranchParams,
  CreateBranchFromMessageInput,
  DeleteBranchInput,
  SwitchCandidateInput,
  RegenerateFromQuestionInput,
  GetBranchPathParams,
  GetCandidatesParams,
  GetQuestionCandidatesParams,
  EffectiveFilterParams,
  BeginTurnInput,
  SetBranchHeadInput,
  SetBranchChoiceInput,
  SetBranchAnswerHideInput,
  RetryReplaceAnswerInput,
  SwitchQuestionCandidateInput,
  ForkQuestionInput,
  RetryReplaceQuestionInput,
  TruncateBranchFromQuestionInput,
  SetBranchFilterInput,
  ClearBranchFilterInput,
  BuildContextForBranchInput,
  GetRenderableTurnsInput,
  ModelPrefsListFavoritesParams,
  ModelPrefsAddFavoriteParams,
  ModelPrefsRemoveFavoriteParams,
  ModelPrefsReorderFavoritesParams,
  ModelPrefsListRecentsParams,
  ModelPrefsRecordRecentParams,
  ModelPrefsScopeType,
} from './types'

export const jsonSchema = z.record(z.any())

// ========== Project Schemas ==========

export const CreateProjectSchema: ZodType<CreateProjectInput> = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  createdAt: z.number().int().optional(),
  meta: jsonSchema.optional().nullable()
})

export const SaveProjectSchema: ZodType<SaveProjectInput> = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
  meta: jsonSchema.optional().nullable()
})

export const DeleteProjectSchema: ZodType<DeleteProjectInput> = z.object({
  id: z.string().min(1)
})

export const ListProjectSchema: ZodType<ListProjectParams> = z
  .object({
    limit: z.number().int().positive().max(1000).optional(),
    offset: z.number().int().nonnegative().optional(),
    order: z.enum(['updatedAt', 'createdAt', 'name']).optional()
  })
  .partial()

export const FindProjectByIdSchema = z.object({
  id: z.string().min(1)
})

export const FindProjectByNameSchema = z.object({
  name: z.string().min(1)
})

export const CountConversationsSchema = z.object({
  projectId: z.string().min(1)
})

// ========== Conversation Schemas ==========

export const CreateConvoSchema: ZodType<CreateConvoInput> = z.object({
  id: z.string().min(1).optional(),
  projectId: z.string().min(1).optional().nullable(),
  title: z.string().min(1),
  meta: jsonSchema.optional().nullable()
})

export const ListConvoSchema: ZodType<ListConvoParams> = z
  .object({
    projectId: z.string().min(1).optional().nullable(),
    limit: z.number().int().positive().max(10000).optional(),
    offset: z.number().int().nonnegative().optional(),
    order: z.enum(['updatedAt', 'createdAt']).optional()
  })
  .partial()

export const AppendMessageSchema: ZodType<AppendMessageInput> = z.object({
  convoId: z.string().min(1),
  role: z.enum(['user', 'assistant', 'tool', 'notice', 'openrouter']),
  body: z.string(),
  createdAt: z.number().int().optional(),
  seq: z.number().int().positive().optional(),
  meta: jsonSchema.optional().nullable(),
  parentId: z.string().min(1).nullable().optional(),
  status: z.enum(['streaming', 'final', 'error']).optional(),
  answerRootId: z.string().min(1).nullable().optional(),
  questionId: z.string().min(1).nullable().optional()
})

export const AppendMessageDeltaSchema: ZodType<AppendMessageDeltaInput> = z.object({
  convoId: z.string().min(1),
  seq: z.number().int().positive(),
  appendBody: z.string().min(1)
})

export const SetMessageStatusSchema: ZodType<SetMessageStatusInput> = z.object({
  messageId: z.string().min(1),
  status: z.enum(['streaming', 'final', 'error']),
  reasoningDurationMs: z.number().int().nullable().optional(),
  reasoningEndReason: z.string().nullable().optional(),
  reasoningDurationIsFallback: z.boolean().optional(),
  metaPatch: jsonSchema.optional().nullable(),
})

export const SetMessageAnnotationsSchema: ZodType<SetMessageAnnotationsInput> = z.object({
  messageId: z.string().min(1),
  annotations: z.array(z.unknown()).nullable().optional(),
})

export const UpsertMessageErrorSchema: ZodType<UpsertMessageErrorInput> = z.object({
  messageId: z.string().min(1),
  envelopeJson: z.string().min(1),
  envelopeBytes: z.number().int().nonnegative(),
  isTruncated: z.boolean(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
  metaPatch: jsonSchema.optional().nullable(),
})

export const ListMessageErrorByIdsSchema: ZodType<ListMessageErrorByIdsInput> = z.object({
  messageIds: z.array(z.string().min(1)).min(1).max(500),
})

export const PersistMessageAssetsFromDataUrlsSchema: ZodType<PersistMessageAssetsFromDataUrlsInput> = z.object({
  messageId: z.string().min(1),
  imageDataUrls: z.array(z.string().min(1)).max(64),
})

export const ListMessageAssetsByMessageIdsSchema: ZodType<ListMessageAssetsByMessageIdsInput> = z.object({
  messageIds: z.array(z.string().min(1)).min(1).max(500),
})

export const GetMessageAssetByIdSchema: ZodType<GetMessageAssetByIdInput> = z.object({
  assetId: z.string().min(1),
})

const AssetKindSchema = z.enum(['image', 'document', 'text', 'audio', 'video', 'archive', 'binary'])
const SourceKindSchema = z.enum(['local_upload', 'url_import', 'generated', 'derived'])
const StorageBackendSchema = z.enum(['local_fs', 'remote_url'])
const FileIngestStatusSchema = z.enum([
  'pending',
  'probing',
  'materializing',
  'registered',
  'stored',
  'probe_failed',
  'materialization_failed',
  'failed',
  'deleted',
])
const FilePreviewStatusSchema = z.enum(['not_requested', 'pending', 'ready', 'failed'])
const DerivedKindSchema = z.enum([
  'thumbnail',
  'extracted_text',
  'ocr_text',
  'transcript',
  'converted_pdf',
  'send_optimized',
  'preview_optimized',
  'embedding_vector',
])
const FileDerivativeStatusSchema = z.enum(['pending', 'ready', 'failed', 'deleted'])
const TaskFamilySchema = z.enum(['chat_context', 'transcription', 'embeddings'])
const DerivativeJobStatusSchema = z.enum(['pending', 'running', 'ready', 'failed', 'cancelled'])
const AiPayloadKindSchema = z.enum(['image', 'pdf', 'text', 'audio', 'video', 'binary'])
const ProcessingStatusSchema = z.enum(['native_supported', 'convertible', 'local_only', 'unsupported'])
const DraftAttachmentSendModePreferenceSchema = z.enum(['default', 'auto', 'url_ref', 'inline_base64'])
const UrlRetentionModeSchema = z.enum(['link_only', 'link_and_file'])

export const CreateFileAssetSchema: ZodType<CreateFileAssetInput> = z.object({
  id: z.string().min(1).optional(),
  sha256: z.string().min(1).nullable().optional(),
  filename: z.string().min(1),
  extension: z.string().min(1).nullable().optional(),
  mime: z.string().min(1).nullable().optional(),
  sizeBytes: z.number().int().nonnegative(),
  assetKind: AssetKindSchema,
  sourceKind: SourceKindSchema,
  storageBackend: StorageBackendSchema.optional(),
  storageUri: z.string().min(1),
  ingestStatus: FileIngestStatusSchema.optional(),
  previewStatus: FilePreviewStatusSchema.optional(),
  sourceMetaJson: jsonSchema.optional().nullable(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
})

export const GetFileAssetByIdSchema = z.object({
  id: z.string().min(1),
})

export const ListFileAssetsByIdsSchema: ZodType<ListFileAssetsByIdsInput> = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
})

export const SoftDeleteFileAssetSchema: ZodType<SoftDeleteFileAssetInput> = z.object({
  id: z.string().min(1),
  deletedAt: z.number().int().optional(),
})

export const CreateFileDerivativeSchema: ZodType<CreateFileDerivativeInput> = z.object({
  id: z.string().min(1).optional(),
  parentAssetId: z.string().min(1),
  derivedKind: DerivedKindSchema,
  mime: z.string().min(1).nullable().optional(),
  storageUri: z.string().min(1),
  generator: z.string().min(1),
  status: FileDerivativeStatusSchema.optional(),
  metaJson: jsonSchema.optional().nullable(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
})

export const ListFileDerivativesByParentAssetIdSchema: ZodType<ListFileDerivativesByParentAssetIdInput> = z.object({
  parentAssetId: z.string().min(1),
})

export const GetFileDerivativeByIdSchema: ZodType<GetFileDerivativeByIdInput> = z.object({
  id: z.string().min(1),
})

export const GetLatestReadyFileDerivativeSchema: ZodType<GetLatestReadyFileDerivativeInput> = z.object({
  parentAssetId: z.string().min(1),
  derivedKind: DerivedKindSchema,
})

export const UpdateFileDerivativeSchema: ZodType<UpdateFileDerivativeInput> = z.object({
  id: z.string().min(1),
  mime: z.string().min(1).nullable().optional(),
  storageUri: z.string().min(1).optional(),
  generator: z.string().min(1).optional(),
  status: FileDerivativeStatusSchema.optional(),
  metaJson: jsonSchema.optional().nullable(),
  updatedAt: z.number().int().optional(),
  deletedAt: z.number().int().nullable().optional(),
})

export const CreateDerivativeJobSchema: ZodType<CreateDerivativeJobInput> = z.object({
  id: z.string().min(1).optional(),
  assetId: z.string().min(1),
  derivativeKind: DerivedKindSchema,
  taskFamily: TaskFamilySchema,
  generator: z.string().min(1),
  provider: z.string().min(1).nullable().optional(),
  modelId: z.string().min(1).nullable().optional(),
  inputSnapshotJson: jsonSchema.optional().nullable(),
  configJson: jsonSchema.optional().nullable(),
  status: DerivativeJobStatusSchema.optional(),
  attemptCount: z.number().int().nonnegative().optional(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
  startedAt: z.number().int().nullable().optional(),
  finishedAt: z.number().int().nullable().optional(),
})

export const GetDerivativeJobByIdSchema: ZodType<GetDerivativeJobByIdInput> = z.object({
  id: z.string().min(1),
})

export const ListDerivativeJobsByAssetIdSchema: ZodType<ListDerivativeJobsByAssetIdInput> = z.object({
  assetId: z.string().min(1),
})

const DerivativeRunTransportSchema = z.object({
  jobId: z.string().min(1),
  apiKey: z.string().min(1).nullable().optional(),
  baseUrl: z.string().min(1).nullable().optional(),
  timeoutMs: z.number().int().positive().nullable().optional(),
})

export const RunDerivativeJobSchema: ZodType<RunDerivativeJobInput> = DerivativeRunTransportSchema

export const RetryDerivativeJobSchema: ZodType<RetryDerivativeJobInput> = DerivativeRunTransportSchema

export const CancelDerivativeJobSchema: ZodType<CancelDerivativeJobInput> = z.object({
  jobId: z.string().min(1),
  reason: z.string().nullable().optional(),
})

export const CapturePdfAnnotationDerivativeSchema: ZodType<CapturePdfAnnotationDerivativeInput> = z.object({
  messageId: z.string().min(1),
  assetIds: z.array(z.string().min(1)).min(1).max(64),
  generator: z.string().min(1).optional(),
})

export const CreateMessageAttachmentSchema: ZodType<CreateMessageAttachmentInput> = z.object({
  id: z.string().min(1).optional(),
  messageId: z.string().min(1),
  assetId: z.string().min(1),
  aiPayloadKind: AiPayloadKindSchema,
  processingStatus: ProcessingStatusSchema,
  includeInNextRequest: z.boolean().optional(),
  excludedReason: z.string().nullable().optional(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
})

export const ListMessageAttachmentsByMessageIdSchema: ZodType<ListMessageAttachmentsByMessageIdInput> = z.object({
  messageId: z.string().min(1),
})

export const ListMessageAttachmentsByAssetIdSchema: ZodType<ListMessageAttachmentsByAssetIdInput> = z.object({
  assetId: z.string().min(1),
})

const DraftModeSchema = z.enum(['compose', 'edit'])

export const RestoreConversationDraftSchema: ZodType<RestoreConversationDraftInput> = z.object({
  conversationId: z.string().min(1),
})

export const UpdateConversationDraftTextSchema: ZodType<UpdateConversationDraftTextInput> = z.object({
  conversationId: z.string().min(1),
  draftText: z.string(),
  draftMode: DraftModeSchema.optional(),
  editingSourceMessageId: z.string().min(1).nullable().optional(),
  updatedAt: z.number().int().optional(),
})

export const AddDraftAttachmentSchema: ZodType<AddDraftAttachmentInput> = z.object({
  conversationId: z.string().min(1),
  assetId: z.string().min(1),
  attachmentOrder: z.number().int().nonnegative().optional(),
  includeInNextRequest: z.boolean().optional(),
  excludedReason: z.string().nullable().optional(),
  preferredSendMode: DraftAttachmentSendModePreferenceSchema.nullable().optional(),
  urlRetentionMode: UrlRetentionModeSchema.nullable().optional(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
})

export const RemoveDraftAttachmentSchema: ZodType<RemoveDraftAttachmentInput> = z.object({
  conversationId: z.string().min(1),
  assetId: z.string().min(1),
  updatedAt: z.number().int().optional(),
})

export const UpdateDraftAttachmentSettingsSchema: ZodType<UpdateDraftAttachmentSettingsInput> = z.object({
  conversationId: z.string().min(1),
  assetId: z.string().min(1),
  preferredSendMode: DraftAttachmentSendModePreferenceSchema.nullable().optional(),
  urlRetentionMode: UrlRetentionModeSchema.nullable().optional(),
  updatedAt: z.number().int().optional(),
})

export const CommitDraftToUserMessageSchema: ZodType<CommitDraftToUserMessageInput> = z.object({
  conversationId: z.string().min(1),
  body: z.string().optional(),
  createdAt: z.number().int().optional(),
  meta: jsonSchema.optional().nullable(),
  sentAssetIds: z.array(z.string().min(1)).optional(),
})

export const AttachDraftToMessageSchema: ZodType<AttachDraftToMessageInput> = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  updatedAt: z.number().int().optional(),
  sentAssetIds: z.array(z.string().min(1)).optional(),
})

export const CloneMessageAttachmentsToDraftSchema: ZodType<CloneMessageAttachmentsToDraftInput> = z.object({
  conversationId: z.string().min(1),
  sourceMessageId: z.string().min(1),
  updatedAt: z.number().int().optional(),
})

export const DetachMessageAttachmentSchema: ZodType<DetachMessageAttachmentInput> = z.object({
  messageId: z.string().min(1),
  assetId: z.string().min(1),
  reason: z.string().nullable().optional(),
  updatedAt: z.number().int().optional(),
})

export const MarkAttachmentAbandonedSchema: ZodType<MarkAttachmentAbandonedInput> = z.object({
  assetId: z.string().min(1),
  reason: z.string().nullable().optional(),
  updatedAt: z.number().int().optional(),
})

export const GetAssetAttachmentOwnershipSchema: ZodType<GetAssetAttachmentOwnershipInput> = z.object({
  assetId: z.string().min(1),
})

export const GetAttachmentCandidateSnapshotSchema: ZodType<GetAttachmentCandidateSnapshotInput> = z.object({
  messageIds: z.array(z.string().min(1)).optional(),
  branchId: z.string().min(1).optional(),
}).refine((value) => !!value.branchId || !!value.messageIds, {
  message: 'messageIds or branchId is required',
})

const SendPlanModelDescriptorSchema = z.object({
  providerKey: z.string().min(1),
  modelId: z.string().min(1),
  modelKey: z.string().min(1),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()).optional(),
})

const SendPlanProviderContextSchema = z.object({
  providerKey: z.string().min(1),
  baseUrl: z.string().nullable().optional(),
  supportsImageUrlRef: z.boolean().optional(),
  supportsPdfInputs: z.boolean().optional(),
  supportsPdfUrlRef: z.boolean().optional(),
  supportsTextUrlRef: z.boolean().optional(),
  supportsVideoUrlRef: z.boolean().optional(),
  supportsInlineData: z.boolean().optional(),
  supportsProviderFileRef: z.boolean().optional(),
  preferredDraftSendModes: z.array(z.enum(['url_ref', 'inline_base64', 'provider_file_ref'])).optional(),
})

const OpenRouterPdfFileParserConfigSchema = z.object({
  enabled: z.boolean().optional(),
  engine: z.enum(['native', 'cloudflare-ai', 'mistral-ocr']).optional(),
}).nullable().optional()

export const BuildCurrentSendPlanSchema: ZodType<BuildCurrentSendPlanInput> = z.object({
  conversationId: z.string().min(1),
  draftText: z.string().optional(),
  historyScope: GetAttachmentCandidateSnapshotSchema.nullable().optional(),
  model: SendPlanModelDescriptorSchema,
  providerContext: SendPlanProviderContextSchema,
})

export const PrepareOpenRouterSendSchema = z.object({
  conversationId: z.string().min(1),
  draftText: z.string().optional(),
  historyMessageIds: z.array(z.string().min(1)).optional(),
  model: SendPlanModelDescriptorSchema,
  providerContext: SendPlanProviderContextSchema,
  pdfFileParser: OpenRouterPdfFileParserConfigSchema,
})

export const PrepareOpenRouterReplayFromMessageSchema: ZodType<PrepareOpenRouterReplayFromMessageInput> = z.object({
  branchId: z.string().min(1),
  userMessageId: z.string().min(1),
  model: SendPlanModelDescriptorSchema,
  providerContext: SendPlanProviderContextSchema,
  replayMode: z.literal('current'),
  editedUserText: z.string().optional(),
  attachmentDecisions: z.array(z.object({
    attachmentId: z.string().min(1),
    source: z.enum(['history', 'draft', 'edit_restored']).optional(),
    decision: z.enum(['exclude', 'remove']),
    reasonCode: z.string().min(1).optional(),
  })).optional(),
})

export const IngestLocalFileSchema: ZodType<IngestLocalFileInput> = z.object({
  filePath: z.string().min(1),
  mimeType: z.string().min(1).nullable().optional(),
  sourceKind: z.enum(['local_upload', 'generated']).optional(),
})

export const IngestUrlSchema: ZodType<IngestUrlInput> = z.object({
  url: z.string().min(1),
  retentionMode: UrlRetentionModeSchema,
})

export const PreviewGetLatestSchema: ZodType<PreviewGetLatestInput> = z.object({
  assetId: z.string().min(1),
})

export const PreviewEnsureSchema: ZodType<PreviewEnsureInput> = z.object({
  assetId: z.string().min(1),
  generator: z.string().min(1).optional(),
  maxEdge: z.number().int().positive().optional(),
})

export const DetectFileTypeSchema: ZodType<DetectFileTypeInput> = z.object({
  assetId: z.string().min(1),
  forceRedetect: z.boolean().optional(),
  detectionTrigger: z.enum([
    'upload',
    'send_plan_build',
    'preview_request',
    'conversion_request',
    'manual_redetect',
    'background_upgrade',
  ]).optional(),
  magikaState: z.enum([
    'not_installed',
    'disabled',
    'unavailable',
    'available',
    'failed',
    'not_requested',
  ]).optional(),
})

export const MarkFileTypeVerdictStaleSchema: ZodType<MarkFileTypeVerdictStaleInput> = z.object({
  assetId: z.string().min(1),
  staleReason: z.string().min(1),
})

export const AppendReasoningDetailSegmentsSchema: ZodType<AppendReasoningDetailSegmentsInput> = z.object({
  messageId: z.string().min(1),
  details: z.array(z.any()).min(1)
})

export const FinalizeReasoningDetailsSchema: ZodType<FinalizeReasoningDetailsInput> = z.object({
  messageId: z.string().min(1)
})

export const SetReasoningRequestConfigSchema: ZodType<SetReasoningRequestConfigInput> = z.object({
  messageId: z.string().min(1),
  value: z.any().optional()
})

export const GetReasoningSegmentsStatsSchema: ZodType<GetReasoningSegmentsStatsInput> = z.object({
  messageId: z.string().min(1)
})

export const SaveConvoSchema: ZodType<SaveConvoInput> = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1).optional().nullable(),
  title: z.string().min(1),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
  meta: jsonSchema.optional().nullable()
})

export const DeleteConvoSchema: ZodType<DeleteConvoInput> = z.object({
  id: z.string().min(1)
})

const MessageSnapshotSchema: ZodType<MessageSnapshot> = z.object({
  role: z.enum(['user', 'assistant', 'tool', 'notice', 'openrouter']),
  body: z.string(),
  createdAt: z.number().int().optional(),
  seq: z.number().int().positive().optional(),
  meta: jsonSchema.optional().nullable()
})

export const SaveConvoWithMessagesSchema: ZodType<SaveConvoWithMessagesInput> = z.object({
  convo: SaveConvoSchema,
  messages: z.array(MessageSnapshotSchema)
})

export const ArchiveConvoSchema = z.object({
  id: z.string().min(1)
})

export const RestoreConvoSchema = z.object({
  id: z.string().min(1)
})

export const SetConvoProjectSchema: ZodType<SetConvoProjectInput> = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1).nullable()
})

export const SetConvoProjectManySchema: ZodType<SetConvoProjectManyInput> = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  projectId: z.string().min(1).nullable()
})

export const ListArchivedSchema = z
  .object({
    limit: z.number().int().positive().max(1000).optional(),
    offset: z.number().int().nonnegative().optional()
  })
  .partial()

// ========== Message Schemas ==========

export const ListMessageSchema: ZodType<ListMessageParams> = z.object({
  convoId: z.string().min(1),
  fromSeq: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(500).optional(),
  direction: z.enum(['asc', 'desc']).optional()
})

export const ReplaceMessagesSchema: ZodType<ReplaceMessagesInput> = z.object({
  convoId: z.string().min(1),
  messages: z.array(MessageSnapshotSchema)
})

// ========== Branching Schemas (Phase 4+) ==========

export const EnsureDefaultBranchSchema: ZodType<EnsureDefaultBranchInput> = z.object({
  convoId: z.string().min(1),
  name: z.string().min(1).nullable().optional()
})

export const ListBranchSchema: ZodType<ListBranchParams> = z.object({
  convoId: z.string().min(1),
  includeDeleted: z.boolean().optional()
})

export const CreateBranchFromMessageSchema: ZodType<CreateBranchFromMessageInput> = z.object({
  sourceBranchId: z.string().min(1),
  baseMessageId: z.string().min(1),
  name: z.string().min(1).nullable().optional(),
  copyChoices: z.boolean().optional(),
  copyFilters: z.boolean().optional(),
  requireOnSourcePath: z.boolean().optional(),
})

export const DeleteBranchSchema: ZodType<DeleteBranchInput> = z.object({
  branchId: z.string().min(1),
})

export const SwitchCandidateSchema: ZodType<SwitchCandidateInput> = z.object({
  branchId: z.string().min(1),
  questionId: z.string().min(1),
  answerRootId: z.string().min(1),
})

export const RegenerateFromQuestionSchema: ZodType<RegenerateFromQuestionInput> = z.object({
  branchId: z.string().min(1),
  questionId: z.string().min(1),
})

export const GetBranchPathSchema: ZodType<GetBranchPathParams> = z.object({
  branchId: z.string().min(1),
  limit: z.number().int().positive().max(5000).optional()
})

export const GetCandidatesSchema: ZodType<GetCandidatesParams> = z.object({
  branchId: z.string().min(1),
  questionId: z.string().min(1),
  limit: z.number().int().positive().max(200).optional()
})

export const GetQuestionCandidatesSchema: ZodType<GetQuestionCandidatesParams> = z.object({
  branchId: z.string().min(1),
  baseMessageId: z.string().min(1).nullable(),
  limit: z.number().int().positive().max(200).optional(),
})

export const EffectiveFilterSchema: ZodType<EffectiveFilterParams> = z.object({
  branchId: z.string().min(1),
  questionId: z.string().min(1),
  chosenAnswerRootId: z.string().min(1)
})

export const BeginTurnSchema: ZodType<BeginTurnInput> = z.object({
  branchId: z.string().min(1),
  userBody: z.string(),
  userMeta: z.record(z.any()).nullable().optional(),
  attachConversationDraft: z.boolean().optional(),
  sentAssetIds: z.array(z.string().min(1)).optional(),
})

export const SetBranchHeadSchema: ZodType<SetBranchHeadInput> = z.object({
  branchId: z.string().min(1),
  headMessageId: z.string().min(1).nullable()
})

export const SetBranchChoiceSchema: ZodType<SetBranchChoiceInput> = z.object({
  branchId: z.string().min(1),
  questionId: z.string().min(1),
  chosenAnswerRootId: z.string().min(1)
})

export const SetBranchAnswerHideSchema: ZodType<SetBranchAnswerHideInput> = z.object({
  branchId: z.string().min(1),
  questionId: z.string().min(1),
  answerRootId: z.string().min(1),
  hidden: z.boolean()
})

export const RetryReplaceAnswerSchema: ZodType<RetryReplaceAnswerInput> = z.object({
  branchId: z.string().min(1),
  questionId: z.string().min(1),
  currentAnswerRootId: z.string().min(1)
})

export const SwitchQuestionCandidateSchema: ZodType<SwitchQuestionCandidateInput> = z.object({
  branchId: z.string().min(1),
  baseMessageId: z.string().min(1).nullable(),
  questionId: z.string().min(1),
})

export const ForkQuestionSchema: ZodType<ForkQuestionInput> = z.object({
  branchId: z.string().min(1),
  oldQuestionId: z.string().min(1),
  newBody: z.string(),
})

export const RetryReplaceQuestionSchema: ZodType<RetryReplaceQuestionInput> = z.object({
  branchId: z.string().min(1),
  oldQuestionId: z.string().min(1),
  newBody: z.string(),
})

export const TruncateBranchFromQuestionSchema: ZodType<TruncateBranchFromQuestionInput> = z.object({
  branchId: z.string().min(1),
  questionId: z.string().min(1),
})

export const SetBranchFilterSchema: ZodType<SetBranchFilterInput> = z.object({
  branchId: z.string().min(1),
  targetType: z.enum(['question', 'answer']),
  targetId: z.string().min(1),
  mode: z.enum(['include', 'exclude'])
})

export const ClearBranchFilterSchema: ZodType<ClearBranchFilterInput> = z.object({
  branchId: z.string().min(1),
  targetType: z.enum(['question', 'answer']),
  targetId: z.string().min(1)
})

export const BuildContextForBranchSchema: ZodType<BuildContextForBranchInput> = z.object({
  branchId: z.string().min(1),
  limit: z.number().int().positive().max(5000).optional(),
  debug: z.boolean().optional()
})

export const GetRenderableTurnsSchema: ZodType<GetRenderableTurnsInput> = z.object({
  branchId: z.string().min(1),
  limit: z.number().int().positive().max(5000).optional(),
  debug: z.boolean().optional(),
})

export const FulltextQuerySchema: ZodType<FulltextQueryParams> = z.object({
  query: z.string().min(1),
  projectId: z.string().min(1).optional().nullable(),
  tagIds: z.array(z.string().min(1)).optional(),
  after: z.number().int().optional(),
  before: z.number().int().optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
  highlight: z.boolean().optional()
})

const SearchScopeSchema = z.object({
  projectName: z.boolean(),
  convoName: z.boolean(),
  convoContent: z.boolean()
})

export const SearchQuerySchema: ZodType<SearchQueryParams> = z.object({
  q: z.string().min(1),
  scope: SearchScopeSchema,
  projectId: z.string().min(1).optional().nullable(),
  convoId: z.string().min(1).optional().nullable(),
  timeFromSec: z.number().int().optional(),
  timeToSec: z.number().int().optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
  mode: z.enum(['exact', 'fuzzy']).optional()
})

// ========== Batch Operation Schemas ==========

export const BatchDeleteSchema: ZodType<BatchDeleteInput> = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100) // 闄愬埗涓€娆℃渶澶氬垹闄?100 涓?})
})

// ========== Usage Log & Stats Schemas ==========

export const LogUsageSchema = z.object({
  project_id: z.string().nullable().optional(),
  convo_id: z.string().nullable().optional(),
  provider: z.string(),
  model: z.string(),
  tokens_input: z.number().int().nonnegative().default(0),
  tokens_output: z.number().int().nonnegative().default(0),
  tokens_cached: z.number().int().nonnegative().default(0),
  tokens_reasoning: z.number().int().nonnegative().default(0),
  cost: z.number().nonnegative().default(0.0),
  request_id: z.string().nullable().optional(),
  attempt: z.number().int().positive().optional(),
  duration_ms: z.number().int().nonnegative().default(0),
  ttft_ms: z.number().int().nonnegative().nullable().optional(),
  timestamp: z.number().int(),
  status: z.enum(['success', 'error', 'canceled']).default('success'),
  error_code: z.string().optional().nullable(),
  meta: z.record(z.any()).nullable().optional()
})

export const GetProjectUsageStatsSchema = z.object({
  projectId: z.string(),
  days: z.number().int().positive().optional()
})

export const GetConvoUsageStatsSchema = z.object({
  convoId: z.string(),
  days: z.number().int().positive().optional()
})

export const GetModelUsageStatsSchema = z.object({
  model: z.string(),
  days: z.number().int().positive().optional()
})

export const GetDateRangeUsageStatsSchema = z.object({
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative()
})

const metaFilterSchema = z
  .object({
    feature: z.string().optional().nullable(),
    entry: z.string().optional().nullable(),
    experiment_id: z.string().optional().nullable(),
    user_id: z.string().optional().nullable()
  })
  .partial()

export const UsageAggregateSchema = z.object({
  filters: z
    .object({
      projectId: z.string().nullable().optional(),
      convoId: z.string().nullable().optional(),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      status: z.enum(['success', 'error', 'canceled']).nullable().optional(),
      errorCode: z.string().nullable().optional(),
      startTime: z.number().int().nonnegative().optional(),
      endTime: z.number().int().nonnegative().optional(),
      meta: metaFilterSchema.optional()
    })
    .optional(),
  bucket: z.enum(['hour', 'day', 'week']).nullable().optional(),
  groupBy: z
    .array(
      z.enum([
        'project_id',
        'convo_id',
        'provider',
        'model',
        'status',
        'error_code',
        'meta.feature',
        'meta.entry',
        'meta.experiment_id',
        'meta.user_id'
      ])
    )
    .optional(),
  timezoneOffsetMinutes: z.number().int().optional(),
  limit: z.number().int().positive().max(500).optional(),
  offset: z.number().int().nonnegative().optional(),
  order: z.enum(['asc', 'desc']).optional()
})

export const UsageDrillDownSchema = z.object({
  filters: z
    .object({
      projectId: z.string().nullable().optional(),
      convoId: z.string().nullable().optional(),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      status: z.enum(['success', 'error', 'canceled']).nullable().optional(),
      errorCode: z.string().nullable().optional(),
      startTime: z.number().int().nonnegative().optional(),
      endTime: z.number().int().nonnegative().optional(),
      meta: metaFilterSchema.optional()
    })
    .optional(),
  limit: z.number().int().positive().max(200).optional(),
  sort: z.enum(['timestamp', 'cost', 'duration_ms']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  cursor: z
    .object({
      value: z.number().int().nonnegative(),
      id: z.string().min(1)
    })
    .optional()
})

const layoutWidgetSchema = z.object({
  id: z.string().min(1),
  visible: z.boolean().default(true),
  order: z.number().int().nonnegative()
})

const dashboardFiltersSchema = z.object({
  days: z.number().int().positive().optional(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  status: z.enum(['success', 'error', 'canceled']).nullable().optional(),
  projectId: z.string().nullable().optional()
})

export const SaveDashboardPrefSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1),
  viewId: z.string().min(1),
  name: z.string().min(1).max(200),
  layout: z.array(layoutWidgetSchema).min(1),
  filters: dashboardFiltersSchema.optional().nullable(),
  isDefault: z.boolean().optional()
})

export const DeleteDashboardPrefSchema = z.object({
  userId: z.string().min(1),
  viewId: z.string().min(1)
})

export const GetDashboardPrefsSchema = z.object({
  userId: z.string().min(1)
})

// ========== Model Preferences Schemas ==========

const modelPrefsScopeTypeSchema: z.ZodType<ModelPrefsScopeType> = z.enum([
  'global',
  'project',
  'conversation',
])

const modelPrefsScopeSchema = z.object({
  scopeType: modelPrefsScopeTypeSchema.optional(),
  scopeId: z.string().max(256).nullable().optional(),
})

const modelPrefsModelRefObjectSchema = z.object({
  providerKey: z.string().min(1).max(128).optional(),
  modelId: z.string().min(1).max(512).optional(),
  modelKey: z.string().min(1).max(768).optional(),
})

const validateModelPrefsModelRef = (
  row: {
    providerKey?: string
    modelId?: string
    modelKey?: string
  },
  ctx: z.RefinementCtx,
) => {
  const hasModelKey = typeof row.modelKey === 'string' && row.modelKey.trim().length > 0
  const hasProviderModel =
    typeof row.providerKey === 'string' &&
    row.providerKey.trim().length > 0 &&
    typeof row.modelId === 'string' &&
    row.modelId.trim().length > 0

  if (!hasModelKey && !hasProviderModel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'model refs require modelKey or providerKey+modelId',
    })
  }
}

export const ModelPrefsListFavoritesSchema: ZodType<ModelPrefsListFavoritesParams> = modelPrefsScopeSchema

export const ModelPrefsAddFavoriteSchema: ZodType<ModelPrefsAddFavoriteParams> = modelPrefsScopeSchema
  .merge(modelPrefsModelRefObjectSchema)
  .extend({
    sortRank: z.number().int().nonnegative().optional(),
  })
  .superRefine(validateModelPrefsModelRef)

export const ModelPrefsRemoveFavoriteSchema: ZodType<ModelPrefsRemoveFavoriteParams> = modelPrefsScopeSchema
  .merge(modelPrefsModelRefObjectSchema)
  .superRefine(validateModelPrefsModelRef)

export const ModelPrefsReorderFavoritesSchema: ZodType<ModelPrefsReorderFavoritesParams> = modelPrefsScopeSchema
  .extend({
    orderedModelKeys: z.array(z.string().min(1)).min(1).max(2000),
  })

export const ModelPrefsListRecentsSchema: ZodType<ModelPrefsListRecentsParams> = modelPrefsScopeSchema.extend({
  limit: z.number().int().positive().max(500).optional(),
})

export const ModelPrefsRecordRecentSchema: ZodType<ModelPrefsRecordRecentParams> = modelPrefsScopeSchema
  .merge(modelPrefsModelRefObjectSchema)
  .extend({
    usedAtMs: z.number().int().nonnegative().optional(),
  })
  .superRefine(validateModelPrefsModelRef)
