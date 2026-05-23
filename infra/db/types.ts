import type { DbMethod } from './dbMethodsRegistry'
import type {
  AiPayloadKind,
  AssetKind,
  DerivedKind,
  DraftAttachmentSendModePreference,
  DraftAttachmentUrlRetentionPreference,
  ProcessingStatus,
  SourceKind,
  TaskFamily,
} from '../../src/shared/files/fileTypes'
import type {
  SendPlan,
  SendPlanModelDescriptor,
  SendPlanProviderContext,
} from '../../src/shared/files/sendPlanTypes'
import type {
  ConfidenceLevel,
  FileFormatId,
  FileKind,
  FileTypeVerdict,
} from '../../src/next/file-type/types'
import type {
  DfcSendAssetRef,
  DfcSendStrategy,
  DfcTargetKind,
} from '../../src/shared/files/documentFormatConversion'

export type JsonObject = Record<string, unknown>

// ========== Project Types ==========

export type ProjectRecord = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  meta: JsonObject | null
}

export type CreateProjectInput = {
  id?: string
  name: string
  meta?: JsonObject | null
  createdAt?: number
}

export type SaveProjectInput = {
  id: string
  name: string
  createdAt?: number
  updatedAt?: number
  meta?: JsonObject | null
}

export type DeleteProjectInput = {
  id: string
}

export type ListProjectParams = {
  limit?: number
  offset?: number
  order?: 'updatedAt' | 'createdAt' | 'name'
}

// ========== Conversation Types ==========

export type ConvoRecord = {
  id: string
  projectId: string | null
  title: string
  createdAt: number
  updatedAt: number
  meta: JsonObject | null
}

export type MessageRecord = {
  id: string
  convoId: string
  role: string
  seq: number
  createdAt: number
  body: string
  meta: JsonObject | null
}

export type MessageErrorRecord = {
  messageId: string
  envelopeJson: string
  envelopeBytes: number
  isTruncated: boolean
  createdAt: number
  updatedAt: number
}

export type AppendReasoningDetailSegmentsInput = Readonly<{
  messageId: string
  details: unknown[]
}>

export type FinalizeReasoningDetailsInput = Readonly<{
  messageId: string
}>

export type SetReasoningRequestConfigInput = Readonly<{
  messageId: string
  value?: unknown
}>

export type GetReasoningSegmentsStatsInput = Readonly<{
  messageId: string
}>

export type CreateConvoInput = {
  id?: string
  projectId?: string | null
  title: string
  meta?: JsonObject | null
}

export type SaveConvoInput = {
  id: string
  projectId?: string | null
  title: string
  createdAt?: number
  updatedAt?: number
  meta?: JsonObject | null
}

export type DeleteConvoInput = {
  id: string
}

export type SaveConvoWithMessagesInput = {
  convo: SaveConvoInput
  messages: MessageSnapshot[]
}

export type ListConvoParams = {
  projectId?: string | null
  limit?: number
  offset?: number
  order?: 'updatedAt' | 'createdAt'
}

export type ArchiveConvoInput = {
  id: string
}

export type RestoreConvoInput = {
  id: string
}

export type SetConvoProjectInput = {
  id: string
  projectId: string | null
}

export type SetConvoProjectManyInput = {
  ids: string[]
  projectId: string | null
}

export type SetConvoProjectManyResult = {
  moved: number
  failed: string[]
}

export type ListArchivedParams = {
  limit?: number
  offset?: number
}

export type ArchivedConvoRecord = {
  id: string
  snapshotAt: number
}

// ========== Message Types ==========

export type AppendMessageInput = {
  convoId: string
  role: 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter'
  body: string
  meta?: JsonObject | null
  createdAt?: number
  seq?: number
  parentId?: string | null
  status?: 'streaming' | 'final' | 'error'
  answerRootId?: string | null
  questionId?: string | null
}

export type AppendMessageDeltaInput = {
  convoId: string
  seq: number
  appendBody: string
}

export type SetMessageStatusInput = {
  messageId: string
  status: 'streaming' | 'final' | 'error'
  reasoningDurationMs?: number | null
  reasoningEndReason?: string | null
  reasoningDurationIsFallback?: boolean
  metaPatch?: JsonObject | null
}

export type SetMessageAnnotationsInput = Readonly<{
  messageId: string
  annotations?: unknown[] | null
}>

export type UpsertMessageErrorInput = {
  messageId: string
  envelopeJson: string
  envelopeBytes: number
  isTruncated: boolean
  createdAt?: number
  updatedAt?: number
  metaPatch?: JsonObject | null
}

export type ListMessageErrorByIdsInput = {
  messageIds: string[]
}

export type PersistMessageAssetsFromDataUrlsInput = Readonly<{
  messageId: string
  imageDataUrls: string[]
}>

export type ListMessageAssetsByMessageIdsInput = Readonly<{
  messageIds: string[]
}>

export type GetMessageAssetByIdInput = Readonly<{
  assetId: string
}>

export type MessageAssetRecord = Readonly<{
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

// ========== File Pipeline Types ==========

export type FileStorageBackend = 'local_fs' | 'remote_url'
export type FileIngestStatus =
  | 'pending'
  | 'probing'
  | 'materializing'
  | 'registered'
  | 'stored'
  | 'probe_failed'
  | 'materialization_failed'
  | 'failed'
  | 'deleted'
export type FilePreviewStatus = 'not_requested' | 'pending' | 'ready' | 'failed'
export type FileDerivativeStatus = 'pending' | 'ready' | 'failed' | 'deleted'
export type DerivativeJobStatus = 'pending' | 'running' | 'ready' | 'failed' | 'cancelled'

export type DerivativeErrorCode =
  | 'derivative_asset_missing'
  | 'derivative_asset_not_supported'
  | 'derivative_kind_not_implemented'
  | 'conversion_not_implemented'
  | 'derivative_input_missing'
  | 'derivative_local_file_missing'
  | 'derivative_local_file_read_failed'
  | 'derivative_output_write_failed'
  | 'derivative_task_timeout'
  | 'derivative_task_cancelled'
  | 'preview_asset_missing'
  | 'preview_asset_not_image'
  | 'preview_source_not_supported'
  | 'preview_local_file_missing'
  | 'preview_local_file_read_failed'
  | 'preview_generation_failed'
  | 'preview_output_write_failed'
  | 'preview_output_invalid'
  | 'extracted_text_empty'
  | 'pdf_annotation_missing'
  | 'pdf_annotation_parse_failed'
  | 'transcript_model_missing'
  | 'transcript_model_not_audio_capable'
  | 'transcript_request_failed'
  | 'audio_url_not_supported_for_transcript'
  | 'embedding_model_missing'
  | 'embedding_input_empty'
  | 'embedding_request_failed'
  | 'embedding_response_invalid'
  | 'embedding_output_write_failed'

export type FileAssetRecord = Readonly<{
  id: string
  sha256: string | null
  filename: string
  extension: string | null
  mime: string | null
  sizeBytes: number
  assetKind: AssetKind
  sourceKind: SourceKind
  storageBackend: FileStorageBackend
  storageUri: string
  ingestStatus: FileIngestStatus
  previewStatus: FilePreviewStatus
  sourceMetaJson: JsonObject | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}>

export type CreateFileAssetInput = Readonly<{
  id?: string
  sha256?: string | null
  filename: string
  extension?: string | null
  mime?: string | null
  sizeBytes: number
  assetKind: AssetKind
  sourceKind: SourceKind
  storageBackend?: FileStorageBackend
  storageUri: string
  ingestStatus?: FileIngestStatus
  previewStatus?: FilePreviewStatus
  sourceMetaJson?: JsonObject | null
  createdAt?: number
  updatedAt?: number
}>

export type ListFileAssetsByIdsInput = Readonly<{
  ids: string[]
}>

export type SoftDeleteFileAssetInput = Readonly<{
  id: string
  deletedAt?: number
}>

export type FileAssetPhysicalCleanupPlan = Readonly<{
  ok: true
  assetId: string
  storageUris: string[]
  physicalDeletePerformed: false
}>

export type FileDerivativeRecord = Readonly<{
  id: string
  parentAssetId: string
  derivedKind: DerivedKind
  mime: string | null
  storageUri: string
  generator: string
  status: FileDerivativeStatus
  metaJson: JsonObject | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}>

export type CreateFileDerivativeInput = Readonly<{
  id?: string
  parentAssetId: string
  derivedKind: DerivedKind
  mime?: string | null
  storageUri: string
  generator: string
  status?: FileDerivativeStatus
  metaJson?: JsonObject | null
  createdAt?: number
  updatedAt?: number
}>

export type ListFileDerivativesByParentAssetIdInput = Readonly<{
  parentAssetId: string
}>

export type GetFileDerivativeByIdInput = Readonly<{
  id: string
}>

export type GetLatestReadyFileDerivativeInput = Readonly<{
  parentAssetId: string
  derivedKind: DerivedKind
}>

export type UpdateFileDerivativeInput = Readonly<{
  id: string
  mime?: string | null
  storageUri?: string
  generator?: string
  status?: FileDerivativeStatus
  metaJson?: JsonObject | null
  updatedAt?: number
  deletedAt?: number | null
}>

export type DerivativeJobRecord = Readonly<{
  id: string
  assetId: string
  derivativeKind: DerivedKind
  taskFamily: TaskFamily
  status: DerivativeJobStatus
  generator: string
  provider: string | null
  modelId: string | null
  inputSnapshotJson: JsonObject | null
  configJson: JsonObject | null
  outputDerivativeId: string | null
  errorCode: DerivativeErrorCode | null
  errorMessage: string | null
  attemptCount: number
  createdAt: number
  updatedAt: number
  startedAt: number | null
  finishedAt: number | null
}>

export type FileTypeFullHashStatus =
  | 'computed'
  | 'not_computed'
  | 'failed'
  | 'not_applicable'

export type FileTypeFingerprintJson = Readonly<{
  algorithmVersion: string
  size: number
  modifiedTime: number | null
  headHash: string | null
  headBytes: number | null
  tailHash: string | null
  tailBytes: number | null
  fullHash: string | null
  fullHashStatus: FileTypeFullHashStatus
}>

export type FileTypeVerdictVersionInfo = Readonly<{
  schemaVersion: string
  taxonomyVersion: string
  taxonomyMapVersion: string
  magicTableVersion: string
  mergeRulesVersion: string
  containerProbeVersion: string
  textProbeVersion: string
  magikaModelVersion: string | null
}>

export type FileTypeVerdictRecord = Readonly<{
  id: string
  assetId: string
  verdict: FileTypeVerdict
  primaryFormatId: FileFormatId
  primaryKind: FileKind
  confidenceLevel: ConfidenceLevel
  versionInfo: FileTypeVerdictVersionInfo
  fingerprintJson: FileTypeFingerprintJson
  isCurrent: boolean
  staleReason: string | null
  createdAt: number
  updatedAt: number
}>

export type UpsertFileTypeVerdictInput = Readonly<{
  id?: string
  assetId: string
  verdict: FileTypeVerdict
  primaryFormatId: FileFormatId
  primaryKind: FileKind
  confidenceLevel: ConfidenceLevel
  versionInfo: FileTypeVerdictVersionInfo
  fingerprintJson: FileTypeFingerprintJson
  createdAt?: number
  updatedAt?: number
}>

export type GetCurrentFileTypeVerdictByAssetIdInput = Readonly<{
  assetId: string
}>

export type MarkFileTypeVerdictStaleByAssetIdInput = Readonly<{
  assetId: string
  staleReason: string
  updatedAt?: number
}>

export type DeleteFileTypeVerdictByAssetIdInput = Readonly<{
  assetId: string
}>

export type EnginePluginInstallState =
  | 'installed'
  | 'failed'
  | 'uninstalled'
  | 'update_available'

export type EnginePluginHealthStatus =
  | 'unknown'
  | 'healthy'
  | 'degraded'
  | 'unhealthy'

export type EnginePluginInstallSource = 'official_catalog' | 'local_package'

export type EnginePluginInstallRootKind =
  | 'managed_root'
  | 'managed_cache'
  | 'test_root'

export type EnginePluginRegistryRecord = Readonly<{
  engineId: string
  displayName: string
  pluginVersion: string
  manifestSchemaVersion: string
  manifestHash: string
  runtimeKind: string
  modelVersion: string | null
  installState: EnginePluginInstallState
  enabled: boolean
  healthStatus: EnginePluginHealthStatus
  failureReason: string | null
  installSource: EnginePluginInstallSource
  installRootKind: EnginePluginInstallRootKind
  installRef: string
  installedAt: number | null
  updatedAt: number
  lastVerifiedAt: number | null
  lastHealthCheckAt: number | null
  metadataJson: JsonObject | null
}>

export type InsertEnginePluginRegistryInput = Readonly<{
  engineId: string
  displayName: string
  pluginVersion: string
  manifestSchemaVersion: string
  manifestHash: string
  runtimeKind: string
  modelVersion?: string | null
  installState?: EnginePluginInstallState
  enabled?: boolean
  healthStatus?: EnginePluginHealthStatus
  failureReason?: string | null
  installSource?: EnginePluginInstallSource
  installRootKind: EnginePluginInstallRootKind
  installRef: string
  installedAt?: number | null
  updatedAt?: number
  lastVerifiedAt?: number | null
  lastHealthCheckAt?: number | null
  metadataJson?: JsonObject | null
}>

export type UpsertEnginePluginRegistryInput = Readonly<{
  engineId: string
  displayName: string
  pluginVersion: string
  manifestSchemaVersion: string
  manifestHash: string
  runtimeKind: string
  modelVersion?: string | null
  installState?: EnginePluginInstallState
  enabled?: boolean
  healthStatus?: EnginePluginHealthStatus
  failureReason?: string | null
  installSource?: EnginePluginInstallSource
  installRootKind: EnginePluginInstallRootKind
  installRef: string
  installedAt?: number | null
  updatedAt?: number
  lastVerifiedAt?: number | null
  lastHealthCheckAt?: number | null
  metadataJson?: JsonObject | null
}>

export type GetEnginePluginRegistryByEngineIdInput = Readonly<{
  engineId: string
}>

export type ListEnginePluginRegistryInput = Readonly<{
  includeUninstalled?: boolean
}>

export type SetEnginePluginEnabledInput = Readonly<{
  engineId: string
  enabled: boolean
  updatedAt?: number
}>

export type MarkEnginePluginFailedInput = Readonly<{
  engineId: string
  failureReason: string
  updatedAt?: number
  lastHealthCheckAt?: number | null
  metadataJson?: JsonObject | null
}>

export type UpdateEnginePluginHealthInput = Readonly<{
  engineId: string
  healthStatus: EnginePluginHealthStatus
  updatedAt?: number
  lastHealthCheckAt?: number | null
}>

export type MarkEnginePluginUninstalledInput = Readonly<{
  engineId: string
  updatedAt?: number
}>

export type CreateDerivativeJobInput = Readonly<{
  id?: string
  assetId: string
  derivativeKind: DerivedKind
  taskFamily: TaskFamily
  generator: string
  provider?: string | null
  modelId?: string | null
  inputSnapshotJson?: JsonObject | null
  configJson?: JsonObject | null
  status?: DerivativeJobStatus
  attemptCount?: number
  createdAt?: number
  updatedAt?: number
  startedAt?: number | null
  finishedAt?: number | null
}>

export type GetDerivativeJobByIdInput = Readonly<{
  id: string
}>

export type ListDerivativeJobsByAssetIdInput = Readonly<{
  assetId: string
}>

export type RunDerivativeJobInput = Readonly<{
  jobId: string
  apiKey?: string | null
  baseUrl?: string | null
  timeoutMs?: number | null
}>

export type RetryDerivativeJobInput = Readonly<{
  jobId: string
  apiKey?: string | null
  baseUrl?: string | null
  timeoutMs?: number | null
}>

export type CancelDerivativeJobInput = Readonly<{
  jobId: string
  reason?: string | null
}>

export type CapturePdfAnnotationDerivativeInput = Readonly<{
  messageId: string
  assetIds: string[]
  generator?: string
}>

export type MessageAttachmentRecord = Readonly<{
  id: string
  messageId: string
  assetId: string
  aiPayloadKind: AiPayloadKind
  processingStatus: ProcessingStatus
  includeInNextRequest: boolean
  excludedReason: string | null
  dfcManaged: boolean
  usedOptionId: string | null
  usedAssetRefs: DfcSendAssetRef[]
  targetKind: DfcTargetKind | null
  sendStrategy: DfcSendStrategy | null
  createdAt: number
  updatedAt: number
}>

export type CreateMessageAttachmentInput = Readonly<{
  id?: string
  messageId: string
  assetId: string
  aiPayloadKind: AiPayloadKind
  processingStatus: ProcessingStatus
  includeInNextRequest?: boolean
  excludedReason?: string | null
  dfcManaged?: boolean
  usedOptionId?: string | null
  usedAssetRefs?: readonly DfcSendAssetRef[]
  targetKind?: DfcTargetKind | null
  sendStrategy?: DfcSendStrategy | null
  createdAt?: number
  updatedAt?: number
}>

export type ListMessageAttachmentsByMessageIdInput = Readonly<{
  messageId: string
}>

export type ListMessageAttachmentsByAssetIdInput = Readonly<{
  assetId: string
}>

export type DraftMode = 'compose' | 'edit'
export type AttachmentOwnerKind = 'draft' | 'message' | 'detached' | 'abandoned'
export type AttachmentLifecycleStatus = 'active' | 'detached' | 'abandoned' | 'soft_deleted'

export type DraftAttachmentRecord = Readonly<{
  id: string
  conversationId: string
  assetId: string
  attachmentOrder: number
  aiPayloadKind: AiPayloadKind
  processingStatus: ProcessingStatus
  includeInNextRequest: boolean
  excludedReason: string | null
  preferredSendMode: DraftAttachmentSendModePreference | null
  urlRetentionMode: DraftAttachmentUrlRetentionPreference | null
  dfcManaged: boolean
  selectedOptionId: string | null
  selectedAssetRefs: DfcSendAssetRef[]
  createdAt: number
  updatedAt: number
}>

export type ConversationDraftRecord = Readonly<{
  conversationId: string
  draftText: string
  draftMode: DraftMode
  editingSourceMessageId: string | null
  attachedAssetIds: string[]
  attachments: DraftAttachmentRecord[]
  updatedAt: number
}>

export type RestoreConversationDraftInput = Readonly<{
  conversationId: string
}>

export type UpdateConversationDraftTextInput = Readonly<{
  conversationId: string
  draftText: string
  draftMode?: DraftMode
  editingSourceMessageId?: string | null
  updatedAt?: number
}>

export type AddDraftAttachmentInput = Readonly<{
  conversationId: string
  assetId: string
  attachmentOrder?: number
  includeInNextRequest?: boolean
  excludedReason?: string | null
  preferredSendMode?: DraftAttachmentSendModePreference | null
  urlRetentionMode?: DraftAttachmentUrlRetentionPreference | null
  dfcManaged?: boolean
  selectedOptionId?: string | null
  selectedAssetRefs?: readonly DfcSendAssetRef[]
  createdAt?: number
  updatedAt?: number
}>

export type RemoveDraftAttachmentInput = Readonly<{
  conversationId: string
  assetId: string
  updatedAt?: number
}>

export type UpdateDraftAttachmentSettingsInput = Readonly<{
  conversationId: string
  assetId: string
  preferredSendMode?: DraftAttachmentSendModePreference | null
  urlRetentionMode?: DraftAttachmentUrlRetentionPreference | null
  dfcManaged?: boolean
  selectedOptionId?: string | null
  selectedAssetRefs?: readonly DfcSendAssetRef[]
  updatedAt?: number
}>

export type CommitDraftToUserMessageInput = Readonly<{
  conversationId: string
  body?: string
  createdAt?: number
  meta?: JsonObject | null
  sentAssetIds?: string[]
}>

export type CommitDraftToUserMessageResult = Readonly<{
  message: MessageRecord
  attachments: MessageAttachmentRecord[]
  draft: ConversationDraftRecord
}>

export type AttachDraftToMessageInput = Readonly<{
  conversationId: string
  messageId: string
  updatedAt?: number
  sentAssetIds?: string[]
}>

export type AttachDraftToMessageResult = Readonly<{
  messageId: string
  attachments: MessageAttachmentRecord[]
  draft: ConversationDraftRecord
}>

export type CloneMessageAttachmentsToDraftInput = Readonly<{
  conversationId: string
  sourceMessageId: string
  updatedAt?: number
}>

export type DetachMessageAttachmentInput = Readonly<{
  messageId: string
  assetId: string
  reason?: string | null
  updatedAt?: number
}>

export type MarkAttachmentAbandonedInput = Readonly<{
  assetId: string
  reason?: string | null
  updatedAt?: number
}>

export type GetAssetAttachmentOwnershipInput = Readonly<{
  assetId: string
}>

export type AssetAttachmentOwnership = Readonly<{
  assetId: string
  ownerKind: AttachmentOwnerKind
  lifecycleStatus: AttachmentLifecycleStatus
  draftConversationIds: string[]
  messageIds: string[]
  reason: string | null
  updatedAt: number | null
}>

export type AttachmentSnapshotItem = Readonly<{
  attachmentId: string
  messageId: string
  assetId: string
  aiPayloadKind: AiPayloadKind
  processingStatus: ProcessingStatus
  included: boolean
  excludedReason: string | null
  sourceKind: SourceKind | null
  storageBackend: FileStorageBackend | null
}>

export type AttachmentCandidateSnapshot = Readonly<{
  scope: 'messages' | 'branch'
  messageIds: string[]
  included: AttachmentSnapshotItem[]
  excluded: AttachmentSnapshotItem[]
  items: AttachmentSnapshotItem[]
}>

export type GetAttachmentCandidateSnapshotInput = Readonly<{
  messageIds?: string[]
  branchId?: string
}>

export type BuildCurrentSendPlanInput = Readonly<{
  conversationId: string
  draftText?: string
  historyScope?: GetAttachmentCandidateSnapshotInput | null
  model: SendPlanModelDescriptor
  providerContext: SendPlanProviderContext
}>

export type BuildCurrentSendPlanResult = Readonly<{
  sendPlan: SendPlan
  draftText: string
  assets: FileAssetRecord[]
  storageRootDir: string
}>

export type PrepareOpenRouterReplayFromMessageInput = Readonly<{
  branchId: string
  userMessageId: string
  model: SendPlanModelDescriptor
  providerContext: SendPlanProviderContext
  replayMode: 'current'
  editedUserText?: string
  attachmentDecisions?: ReadonlyArray<Readonly<{
    attachmentId: string
    source?: 'history' | 'draft' | 'edit_restored'
    decision: 'exclude' | 'remove'
    reasonCode?: string
  }>>
}>

export type PrepareOpenRouterReplayFromMessageResult = Readonly<{
  status: 'sendable' | 'blocked' | 'needs_confirmation'
  currentUserContentBlocks: unknown[]
  sentAssetIds: string[]
  includedAttachments: SendPlan['includedAttachments']
  excludedAttachments: SendPlan['excludedAttachments']
  blockingReasons: SendPlan['blockingReasons']
  diagnostics: Record<string, unknown>
  modelCapabilitySnapshot: Record<string, unknown>
  manifestDraft: Record<string, unknown>
}>

export type UrlRetentionMode = 'link_only' | 'link_and_file'
export type MaterializationStatus = 'not_requested' | 'materializing' | 'stored' | 'materialization_failed'
export type FileImportStatus =
  | 'pending'
  | 'probing'
  | 'materializing'
  | 'ready'
  | 'failed'
  | 'probe_failed'
  | 'materialization_failed'
export type UrlProbeStatus = 'accessible' | 'probe_failed' | 'rejected'

export type FileIngestionWarning = Readonly<{
  code: string
  message: string
}>

export type SendEligibilityHints = Readonly<{
  canUseUrlRef: boolean
  canUseLocalFile: boolean
  canUseInlinePayload: boolean
  urlReferenceMayStillBeUsable: boolean
  notes: string[]
}>

export type FileIngestionResult = Readonly<{
  success: boolean
  sourceKind: SourceKind
  assetId: string | null
  normalizedExtension: string | null
  assetKind: AssetKind
  aiPayloadKind: AiPayloadKind
  processingStatus: ProcessingStatus
  isNativeSupportedForMvp: boolean
  isConvertibleCandidate: boolean
  importStatus: FileImportStatus
  sendEligibilityHints: SendEligibilityHints
  warnings: FileIngestionWarning[]
  failureReasonCode: string | null
  retentionMode?: UrlRetentionMode
  probeStatus?: UrlProbeStatus
  materializationStatus?: MaterializationStatus
  originalUrl?: string
  resolvedUrl?: string
}>

export type IngestLocalFileInput = Readonly<{
  filePath: string
  mimeType?: string | null
  sourceKind?: Extract<SourceKind, 'local_upload' | 'generated'>
}>

export type IngestUrlInput = Readonly<{
  url: string
  retentionMode: UrlRetentionMode
}>

export type PreviewImagePayload = Readonly<{
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

export type PreviewGetLatestInput = Readonly<{
  assetId: string
}>

export type PreviewEnsureInput = Readonly<{
  assetId: string
  generator?: string
  maxEdge?: number
}>

export type FileTypeDetectionMode = 'basic' | 'full'
export type FileTypeDetectionJobStatus = 'running' | 'ready' | 'failed' | 'cancelled'

export type FileTypeDetectionJob = Readonly<{
  jobId: string
  assetId: string
  mode: FileTypeDetectionMode
  status: FileTypeDetectionJobStatus
  createdAt: number
  updatedAt: number
  errorCode: string | null
  errorMessage: string | null
}>

export type DetectFileTypeInput = Readonly<{
  assetId: string
  forceRedetect?: boolean
}>

export type DetectFileTypeResult = Readonly<{
  job: FileTypeDetectionJob
  verdict: FileTypeVerdictRecord | null
  fromCache: boolean
}>

export type MarkFileTypeVerdictStaleInput = Readonly<{
  assetId: string
  staleReason: string
}>

// ========== Branching Types (Phase 4+) ==========

export type BranchRecord = {
  id: string
  convoId: string
  headMessageId: string | null
  name: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type EnsureDefaultBranchInput = {
  convoId: string
  name?: string | null
}

export type ListBranchParams = {
  convoId: string
  includeDeleted?: boolean
}

export type CreateBranchFromMessageInput = {
  sourceBranchId: string
  baseMessageId: string
  name?: string | null
  copyChoices?: boolean
  copyFilters?: boolean
  requireOnSourcePath?: boolean
}

export type DeleteBranchInput = {
  branchId: string
}

export type SwitchCandidateInput = {
  branchId: string
  questionId: string
  answerRootId: string
}

export type RegenerateFromQuestionInput = {
  branchId: string
  questionId: string
}

export type RegenerateFromQuestionResult = {
  ok: true
  newAnswerRootId: string
  newAssistantSeq: number
}

export type GetBranchPathParams = {
  branchId: string
  limit?: number
}

export type GetCandidatesParams = {
  branchId: string
  questionId: string
  limit?: number
}

export type BranchCandidate = {
  answerRootId: string
  createdAt: number
  status: string
}

export type GetQuestionCandidatesParams = {
  branchId: string
  baseMessageId: string | null
  limit?: number
}

export type QuestionCandidate = {
  questionId: string
  createdAt: number
  status: string
}

export type BranchFilterMode = 'include' | 'exclude'

export type EffectiveFilterParams = {
  branchId: string
  questionId: string
  chosenAnswerRootId: string
}

export type EffectiveFilterResult = {
  questionMode: BranchFilterMode
  answerMode: BranchFilterMode
  effectiveMode: BranchFilterMode
  lockedByQuestionExclude: boolean
}

export type BeginTurnInput = {
  branchId: string
  userBody: string
  userMeta?: JsonObject | null
  attachConversationDraft?: boolean
  sentAssetIds?: string[]
}

export type BeginTurnResult = {
  ok: true
  convoId: string
  branchId: string
  questionId: string
  questionSeq: number
  assistantId: string
  assistantSeq: number
}

export type SetBranchHeadInput = {
  branchId: string
  headMessageId: string | null
}

export type SetBranchChoiceInput = {
  branchId: string
  questionId: string
  chosenAnswerRootId: string
}

export type SetBranchAnswerHideInput = {
  branchId: string
  questionId: string
  answerRootId: string
  hidden: boolean
}

export type RetryReplaceAnswerInput = {
  branchId: string
  questionId: string
  currentAnswerRootId: string
}

export type SwitchQuestionCandidateInput = {
  branchId: string
  baseMessageId: string | null
  questionId: string
}

export type SwitchQuestionCandidateResult = Readonly<{ ok: true; headMessageId: string }>

export type ForkQuestionInput = {
  branchId: string
  oldQuestionId: string
  newBody: string
}

export type ForkQuestionResult = Readonly<{
  ok: true
  branchId: string
  baseMessageId: string | null
  newQuestionId: string
  newQuestionSeq: number
  assistantId: string
  assistantSeq: number
}>

export type RetryReplaceQuestionInput = {
  branchId: string
  oldQuestionId: string
  newBody: string
}

export type RetryReplaceQuestionResult = ForkQuestionResult

export type TruncateBranchFromQuestionInput = {
  branchId: string
  questionId: string
}

export type TruncateBranchFromQuestionResult = Readonly<{
  ok: true
  headMessageId: string | null
  fallbackQuestionId: string | null
}>

export type SetBranchFilterInput = {
  branchId: string
  targetType: 'question' | 'answer'
  targetId: string
  mode: 'include' | 'exclude'
}

export type ClearBranchFilterInput = {
  branchId: string
  targetType: 'question' | 'answer'
  targetId: string
}

export type BuildContextForBranchInput = {
  branchId: string
  limit?: number
  debug?: boolean
}

export type BuildContextForBranchResult = Readonly<{
  messages: ReadonlyArray<
    Readonly<{
      id: string
      convoId: string
      role: string
      seq: number
      createdAt: number
      parentId: string | null
      status: string
      answerRootId: string | null
      questionId: string | null
      body: string
      meta: JsonObject | null
    }>
  >
  debug?: Readonly<{
    branchId: string
    excludedQuestionIds: string[]
    includedMessageIds: string[]
    chosenAnswerRootByQuestionId: Record<string, string>
  }>
}>

export type GetRenderableTurnsInput = {
  branchId: string
  limit?: number
  debug?: boolean
}

export type RenderableTurn = Readonly<{
  questionId: string
  chosenAnswerRootId: string | null
  questionMode: BranchFilterMode
  answerMode: BranchFilterMode
  effectiveMode: BranchFilterMode
  lockedByQuestionExclude: boolean
}>

export type GetRenderableTurnsResult = Readonly<{
  messages: BuildContextForBranchResult['messages']
  turns: ReadonlyArray<RenderableTurn>
  debug?: BuildContextForBranchResult['debug']
}>

export type MessageSnapshot = {
  role: 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter'
  body: string
  createdAt?: number
  seq?: number
  meta?: JsonObject | null
}

export type ReplaceMessagesInput = {
  convoId: string
  messages: MessageSnapshot[]
}

export type ListMessageParams = {
  convoId: string
  fromSeq?: number
  limit?: number
  direction?: 'asc' | 'desc'
}

export type FulltextQueryParams = {
  query: string
  projectId?: string | null
  tagIds?: string[]
  after?: number
  before?: number
  limit?: number
  offset?: number
  highlight?: boolean
}

export type FulltextResult = {
  messageId: string
  convoId: string
  seq: number
  snippet: string | null
}

// ========== Search (v0 Skeleton) ==========

export type SearchEntityType = 'project' | 'convo' | 'message'

export type SearchDocInput = {
  entityType: SearchEntityType
  entityId: string
  projectId?: string | null
  convoId?: string | null
  createdAtSec: number
  updatedAtSec: number
  title?: string | null
  body?: string | null
  mediaType?: string | null
  extraJson?: string | null
}

export type SearchScope = {
  projectName: boolean
  convoName: boolean
  convoContent: boolean
}

export type SearchQueryParams = {
  q: string
  scope: SearchScope
  projectId?: string | null
  convoId?: string | null
  timeFromSec?: number
  timeToSec?: number
  limit?: number
  offset?: number
  mode?: 'exact' | 'fuzzy'
}

export type SearchHit = {
  entityType: SearchEntityType
  entityId: string
  projectId?: string | null
  convoId?: string | null
  createdAtSec: number
  /**
   * 纯文本片段，使用 \u0001 和 \u0002 标记高亮区间。
   * 前端必须按“文本方式”渲染并自行做高亮拆分，禁止 v-html。
   */
  snippet: string
  score: number
}

// ========== Usage Statistics Types ==========

export type UsageLogPayload = {
  project_id?: string | null
  convo_id?: string | null
  provider: string
  model: string
  tokens_input: number
  tokens_output: number
  tokens_cached?: number
  tokens_reasoning?: number
  cost?: number
  request_id?: string | null
  attempt?: number
  duration_ms: number
  ttft_ms?: number | null
  timestamp: number
  status?: 'success' | 'error' | 'canceled'
  error_code?: string | null
  meta?: JsonObject | null
}

export type ProjectUsageStats = {
  total: {
    total_input: number
    total_output: number
    total_cached: number
    total_reasoning: number
    total_cost: number
    request_count: number
    total_duration: number
  }
}

export type ConvoUsageStats = {
  total: {
    total_input: number
    total_output: number
    total_cached: number
    total_reasoning: number
    total_cost: number
    request_count: number
    total_duration: number
  }
}

export type ModelUsageStats = {
  total: {
    total_input: number
    total_output: number
    total_cached: number
    total_reasoning: number
    total_cost: number
    request_count: number
    total_duration: number
  }
}

export type DateRangeStats = {
  total: {
    total_input: number
    total_output: number
    total_cached: number
    total_reasoning: number
    total_cost: number
    request_count: number
    total_duration: number
  }
}

export type UsageAggregateFilters = {
  projectId?: string | null
  convoId?: string | null
  provider?: string | null
  model?: string | null
  status?: 'success' | 'error' | 'canceled' | null
  errorCode?: string | null
  startTime?: number
  endTime?: number
  meta?: Partial<Record<'feature' | 'entry' | 'experiment_id' | 'user_id', string | null>>
}

export type UsageAggregateBucket = 'hour' | 'day' | 'week'
export type UsageGroupByDimension =
  | 'project_id'
  | 'convo_id'
  | 'provider'
  | 'model'
  | 'status'
  | 'error_code'
  | 'meta.feature'
  | 'meta.entry'
  | 'meta.experiment_id'
  | 'meta.user_id'

export type UsageAggregateParams = {
  filters?: UsageAggregateFilters
  bucket?: UsageAggregateBucket | null
  groupBy?: UsageGroupByDimension[]
  timezoneOffsetMinutes?: number
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
}

export type UsageAggregateRow = {
  bucket_start?: number | null
  project_id?: string | null
  convo_id?: string | null
  provider?: string | null
  model?: string | null
  status?: 'success' | 'error' | 'canceled' | null
  error_code?: string | null
  meta_feature?: string | null
  meta_entry?: string | null
  meta_experiment_id?: string | null
  meta_user_id?: string | null
  tokens_input: number
  tokens_output: number
  tokens_cached: number
  tokens_reasoning: number
  tokens_total: number
  effective_tokens: number
  cost: number
  request_count: number
  avg_cost_per_req: number
  cost_per_1k_tokens: number
  avg_latency: number
  p50_latency: number | null
  p90_latency: number | null
  success_rate: number
  error_rate: number
  canceled_count: number
  canceled_rate: number
  // 推理相关扩展字段（可选，用于推理专项分析）
  reasoning_request_count?: number
  reasoning_ratio?: number
  reasoning_usage_rate?: number
  cost_per_1k_reasoning?: number
}

export type UsageAggregateResult = {
  data: UsageAggregateRow[]
  pagination: {
    limit: number
    offset: number
  }
}

export type UsageDrillDownSort = 'timestamp' | 'cost' | 'duration_ms'

export type UsageDrillDownParams = {
  filters?: UsageAggregateFilters
  limit?: number
  sort?: UsageDrillDownSort
  order?: 'asc' | 'desc'
  cursor?: {
    value: number
    id: string
  }
}

export type UsageDrillDownRow = {
  id: string
  project_id: string | null
  convo_id: string | null
  provider: string
  model: string
  tokens_input: number
  tokens_output: number
  tokens_cached: number
  tokens_reasoning: number
  cost: number
  request_id?: string | null
  attempt?: number
  duration_ms: number
  ttft_ms: number | null
  timestamp: number
  status: 'success' | 'error'
  error_code: string | null
  meta: JsonObject | null
}

export type UsageDrillDownResult = {
  data: UsageDrillDownRow[]
  nextCursor?: {
    value: number
    id: string
  }
  pagination: {
    limit: number
  }
}

// ========== Dashboard Prefs ==========
export type DashboardLayoutWidget = {
  id: string
  visible: boolean
  order: number
}

export type DashboardFilters = {
  days?: number
  provider?: string | null
  model?: string | null
  status?: 'success' | 'error' | 'canceled' | null
  projectId?: string | null
}

export type DashboardPrefRecord = {
  id: string
  userId: string
  viewId: string
  name: string
  layout: DashboardLayoutWidget[]
  filters: DashboardFilters | null
  isDefault: boolean
  updatedAt: number
}

export type SaveDashboardPrefInput = {
  id?: string
  userId: string
  viewId: string
  name: string
  layout: DashboardLayoutWidget[]
  filters?: DashboardFilters | null
  isDefault?: boolean
}

export type DeleteDashboardPrefInput = {
  userId: string
  viewId: string
}

export type DashboardPrefListResult = {
  items: DashboardPrefRecord[]
}

// ========== Batch Operation Types ==========

export type BatchDeleteResult = {
  deleted: number
}

export type BatchArchiveResult = {
  archived: number
  failed: string[]
}

export type BatchDeleteInput = {
  ids: string[]
}

// ========== Response Types ==========

export type HealthStatsResult = {
  pending: number
  oldestPendingMs: number | null
  restartAttempts: number
  isOnline: boolean
  workerThreadId?: number
}

export type WorkerInitConfig = {
  dbPath: string
  schemaPath?: string
  logSlowQueryMs?: number
  logDirectory?: string
  stampSchemaVersion?: boolean
  startupRebuildReason?: string
  isProduction?: boolean
}

export type { DbMethod } from './dbMethodsRegistry'

export type ModelCatalogUpsertInput = Readonly<{
  modelId: string
  routerSource: string
  vendor: string
  name: string
  description?: string | null
  contextLength?: number | null
  supportedParametersJson?: string | null
  rawJson?: string | null
}>

export type ModelCatalogSyncSnapshotParams = Readonly<{
  snapshotId: string
  routerSource: string
  models: ModelCatalogUpsertInput[]
}>

export type ModelCatalogCoreProviderUpsertInput = Readonly<{
  providerKey: string
  displayName: string
  slug?: string | null
  privacyPolicyUrl?: string | null
  termsOfServiceUrl?: string | null
  statusPageUrl?: string | null
  updatedAtMs: number
  rawJson?: string | null
}>

export type ModelCatalogCoreModelUpsertInput = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
  canonicalSlug?: string | null
  displayName: string
  description?: string | null
  vendor?: string | null
  family?: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength?: number | null
  maxOutputTokens?: number | null
  architectureModality?: string | null
  inputModalitiesJson: string
  outputModalitiesJson: string
  tokenizer?: string | null
  instructType?: string | null
  supportedParametersJson: string
  capabilitiesJson: string
  capReasoning: 0 | 1
  capTools: 0 | 1
  capStructuredOutputs: 0 | 1
  capVision: 0 | 1
  capLongContext: 0 | 1
  pricingJson?: string | null
  pricePrompt?: string | null
  priceCompletion?: string | null
  priceRequest?: string | null
  priceImage?: string | null
  priceWebSearch?: string | null
  priceInternalReasoning?: string | null
  priceInputCacheRead?: string | null
  priceInputCacheWrite?: string | null
  createdAtSec?: number | null
  expirationDate?: string | null
  expirationAtSec?: number | null
  unknownExpiration?: 0 | 1
  perRequestLimitsJson?: string | null
  defaultParametersJson?: string | null
  hasPerRequestLimits?: 0 | 1
  hasDefaultParameters?: 0 | 1
  hasTools?: 0 | 1
  hasStructuredOutputs?: 0 | 1
  hasReasoning?: 0 | 1
  hasSeed?: 0 | 1
  inModalityImage?: 0 | 1
  topProviderContextLength?: number | null
  topProviderIsModerated?: 0 | 1 | null
  firstSeenAtMs: number
  lastSeenAtMs: number
  syncedAtMs: number
  rawJson?: string | null
}>

export type ModelCatalogCoreTagUpsertInput = Readonly<{
  providerKey: string
  modelId: string
  tagKey: string
  tagLabel: string
  tagType: 'capability' | 'category' | 'vendor' | 'status' | 'custom'
  confidence: number
  source: 'derived' | 'provider' | 'manual'
  updatedAtMs: number
}>

export type ModelCatalogCoreMetaUpsertInput = Readonly<{
  providerKey: string
  schemaVersion: number
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  baseUrl: string
  snapshotId: string
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  providerCount?: number | null
  lastCountProbe?: number | null
  lastCountProbeAtMs?: number | null
  lastSyncAtMs: number
  ttlSeconds: number
  syncState: 'idle' | 'syncing' | 'ok' | 'error'
  lastErrorCode?: string | null
  lastErrorMessage?: string | null
  rawRetentionPolicyJson: string
}>

export type ModelCatalogSyncCoreSnapshotParams = Readonly<{
  providerKey: string
  snapshotId: string
  providers: ModelCatalogCoreProviderUpsertInput[]
  models: ModelCatalogCoreModelUpsertInput[]
  tags: ModelCatalogCoreTagUpsertInput[]
  meta: ModelCatalogCoreMetaUpsertInput
}>

export type ModelCatalogEndpointMetaUpsertInput = Readonly<{
  providerKey: string
  baseUrl: string
  modelId: string
  endpointKey: string
  providerName?: string | null
  tag?: string | null
  quantization?: string | null
  contextLength?: number | null
  maxCompletionTokens?: number | null
  maxPromptTokens?: number | null
  supportedParametersJson?: string | null
  supportsImplicitCaching?: 0 | 1 | null
  status?: null
  rawJson?: string | null
}>

export type ModelCatalogReplaceEndpointMetaParams = Readonly<{
  providerKey: string
  baseUrl: string
  modelId: string
  fetchedAtMs: number
  endpoints: ModelCatalogEndpointMetaUpsertInput[]
}>

export type ModelCatalogListEndpointMetaParams = Readonly<{
  providerKey: string
  baseUrl: string
  modelId: string
}>

export type ModelCatalogListParams = Readonly<{
  routerSource: string
}>

export type ModelCatalogGetCoreMetaParams = Readonly<{
  providerKey: string
}>

export type ModelCatalogGetModelDetailParams = Readonly<{
  providerKey: string
  modelId: string
}>

export type ModelCatalogModelDetailRow = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
  canonicalSlug: string | null
  displayName: string
  description: string | null
  vendor: string | null
  family: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength: number | null
  maxOutputTokens: number | null
  architectureModality: string | null
  inputModalitiesJson: string
  outputModalitiesJson: string
  tokenizer: string | null
  instructType: string | null
  supportedParametersJson: string
  capabilitiesJson: string
  capReasoning: 0 | 1
  capTools: 0 | 1
  capStructuredOutputs: 0 | 1
  capVision: 0 | 1
  capLongContext: 0 | 1
  pricingJson: string | null
  pricePrompt: string | null
  priceCompletion: string | null
  priceRequest: string | null
  priceImage: string | null
  priceWebSearch: string | null
  priceInternalReasoning: string | null
  priceInputCacheRead: string | null
  priceInputCacheWrite: string | null
  createdAtSec: number | null
  expirationDate: string | null
  expirationAtSec: number | null
  unknownExpiration: 0 | 1
  perRequestLimitsJson: string | null
  defaultParametersJson: string | null
  hasPerRequestLimits: 0 | 1
  hasDefaultParameters: 0 | 1
  hasTools: 0 | 1
  hasStructuredOutputs: 0 | 1
  hasReasoning: 0 | 1
  hasSeed: 0 | 1
  inModalityImage: 0 | 1
  topProviderContextLength: number | null
  topProviderIsModerated: 0 | 1 | null
  firstSeenAtMs: number
  lastSeenAtMs: number
  syncedAtMs: number
  rawJson: string | null
}>

export type ModelCatalogQueryCoreSortBy = 'name' | 'created_at' | 'context_length' | 'max_output_tokens'
export type ModelCatalogQueryCoreSortOrder = 'asc' | 'desc'
export type ModelCatalogQueryCoreContextBucket = 'small' | 'medium' | 'large' | 'xlarge' | 'unknown'
export type ModelCatalogQueryCorePriceBucket = 'cheap' | 'standard' | 'expensive' | 'unknown'
export type ModelCatalogQueryCoreModality = 'text' | 'image' | 'audio' | 'video' | 'file'
export type ModelCatalogQueryCoreNumberRange = Readonly<{
  min?: number
  max?: number
}>

export type ModelCatalogQueryCoreCursor = Readonly<{
  sortBy: ModelCatalogQueryCoreSortBy
  sortOrder: ModelCatalogQueryCoreSortOrder
  name?: string
  createdAtSec?: number
  contextLength?: number
  maxOutputTokens?: number
  modelKey: string
  /**
   * @deprecated Legacy cursor payload fields.
   */
  providerKey?: string
  /**
   * @deprecated Legacy cursor payload fields.
   */
  modelId?: string
}>

export type ModelCatalogQueryCoreParams = Readonly<{
  /**
   * Source catalog provider dimension.
   * Examples: openrouter, openai-direct, anthropic-direct.
   */
  sourceProviderKey?: string
  /**
   * Source catalog provider dimension used by DB query execution.
   * Deprecated alias of sourceProviderKey. Worker normalizes both.
   */
  providerKey?: string
  searchText?: string
  includeDescriptionInSearch?: boolean
  /**
   * Model vendor/author dimension. Mapped to models.vendor.
   */
  vendors?: string[]
  /**
   * @deprecated Use vendors. Kept for short-term compatibility.
   * Note: this is vendor/author filtering, not source provider filtering.
   */
  providers?: string[]
  modelIds?: string[]
  tags?: string[]
  contextBuckets?: ModelCatalogQueryCoreContextBucket[]
  contextLength?: ModelCatalogQueryCoreNumberRange
  maxOutputTokens?: ModelCatalogQueryCoreNumberRange
  expiringWithinDays?: number
  priceBuckets?: ModelCatalogQueryCorePriceBucket[]
  hasPerRequestLimits?: boolean
  hasDefaultParameters?: boolean
  topProviderIsModerated?: boolean
  architectureModalities?: string[]
  tokenizers?: string[]
  instructTypes?: string[]
  modalities?: ModelCatalogQueryCoreModality[]
  inputModalities?: ModelCatalogQueryCoreModality[]
  outputModalities?: ModelCatalogQueryCoreModality[]
  supportedParameters?: string[]
  sortBy?: ModelCatalogQueryCoreSortBy
  sortOrder?: ModelCatalogQueryCoreSortOrder
  limit?: number
  cursor?: ModelCatalogQueryCoreCursor | null
}>

export type ModelCatalogQueryCoreRow = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
  canonicalSlug: string | null
  displayName: string
  description: string | null
  vendor: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength: number | null
  maxOutputTokens: number | null
  createdAtSec: number | null
  pricePrompt: string | null
  priceCompletion: string | null
  priceRequest: string | null
  priceImage: string | null
  capReasoning: 0 | 1
  capTools: 0 | 1
  capStructuredOutputs: 0 | 1
  capVision: 0 | 1
  capLongContext: 0 | 1
}>

export type ModelCatalogQueryCoreResult = Readonly<{
  items: ModelCatalogQueryCoreRow[]
  nextCursor: ModelCatalogQueryCoreCursor | null
}>

export type ReasoningIndexSyncFromCatalogParams = Readonly<{
  routerSource: string
}>

export type SetOpenRouterProviderRequireParametersParams = Readonly<{
  value: boolean
}>

export type SetReasoningPrefsParams = Readonly<{
  value: unknown
}>

export type SetWebSearchDefaultsParams = Readonly<{
  value: unknown
}>

export type SetUserMessageRenderDefaultParams = Readonly<{
  value: boolean
}>

// ========== Model Preferences (Favorites/Recents) ==========

export type ModelPrefsScopeType = 'global' | 'project' | 'conversation'

export type ModelPrefsScopeParams = Readonly<{
  scopeType?: ModelPrefsScopeType
  scopeId?: string | null
}>

export type ModelPrefsModelRefParams = Readonly<{
  providerKey?: string
  modelId?: string
  modelKey?: string
}>

export type ModelPrefsFavoriteRecord = Readonly<{
  scopeType: ModelPrefsScopeType
  scopeId: string
  providerKey: string
  modelId: string
  modelKey: string
  sortRank: number
  createdAtMs: number
  updatedAtMs: number
}>

export type ModelPrefsRecentRecord = Readonly<{
  scopeType: ModelPrefsScopeType
  scopeId: string
  providerKey: string
  modelId: string
  modelKey: string
  lastUsedAtMs: number
  useCount: number
  createdAtMs: number
  updatedAtMs: number
}>

export type ModelPrefsListFavoritesParams = ModelPrefsScopeParams

export type ModelPrefsAddFavoriteParams = Readonly<
  ModelPrefsScopeParams &
    ModelPrefsModelRefParams & {
      sortRank?: number
    }
>

export type ModelPrefsRemoveFavoriteParams = Readonly<
  ModelPrefsScopeParams &
    ModelPrefsModelRefParams
>

export type ModelPrefsReorderFavoritesParams = Readonly<
  ModelPrefsScopeParams & {
    orderedModelKeys: string[]
  }
>

export type ModelPrefsListRecentsParams = Readonly<
  ModelPrefsScopeParams & {
    limit?: number
  }
>

export type ModelPrefsRecordRecentParams = Readonly<
  ModelPrefsScopeParams &
    ModelPrefsModelRefParams & {
      usedAtMs?: number
    }
>

export type ModelPrefsRemoveFavoriteResult = Readonly<{
  removed: number
}>

export type WorkerRequestMessage = {
  id: string
  method: DbMethod
  params?: unknown
}

export type WorkerResponseMessage = {
  id: string
  ok: boolean
  result?: unknown
  error?: DbErrorShape
}

export type DbErrorCode =
  | 'ERR_NOT_FOUND'
  | 'ERR_VALIDATION'
  | 'ERR_INVALID'
  | 'ERR_INTERNAL'
  | 'ERR_FORBIDDEN'
  | 'ERR_UNAVAILABLE'
  | 'ERR_MUTATION_FORBIDDEN_ON_BRANCHING_CONVO'
  | 'ERR_DELETE_FORBIDDEN'

export type DbErrorShape = {
  code: DbErrorCode
  message: string
  details?: unknown
}

export type DbHandler = (params: any) => any | Promise<any>

// ========== Database Events ==========
// Worker -> Renderer 结构化事件类型

export type DbEvent =
  | { type: 'project.created'; projectId: string; name: string }
  | { type: 'project.updated'; projectId: string; name?: string }
  | { type: 'project.deleted'; projectId: string }
  | { type: 'conversation.moved'; convoId: string; fromProjectId: string | null; toProjectId: string | null }
  | { type: 'conversation.activity_updated'; convoId: string; updatedAt: number }

export type WorkerEventMessage = {
  type: 'event'
  event: DbEvent
}

// ========== Model Data Types ==========
// 参考规范：/docs/openrouter-model-sync-spec.md

/**
 * 模型能力映射（持久化结构）
 */
export type ModelCapabilitiesRecord = {
  hasReasoning: boolean
  hasTools: boolean
  hasJsonMode: boolean
  isMultimodal: boolean
}

/**
 * 模型价格信息（持久化结构）
 */
export type ModelPricingRecord = {
  prompt: string
  completion: string
  request: string
  image: string
  web_search: string
  internal_reasoning: string
  input_cache_read: string
  input_cache_write: string
}

/**
 * 模型数据记录（数据库持久化）
 */
export type ModelDataRecord = {
  id: string
  routerSource: string              // 接入来源: openrouter, openai_api, anthropic_api, local
  vendor: string                    // 模型厂商: openai, anthropic, google, deepseek 等
  name: string
  description?: string
  contextLength: number             // -1 表示未知
  pricing?: ModelPricingRecord
  capabilities?: ModelCapabilitiesRecord
  isArchived: boolean               // 软删除标记
  firstSeenAt?: string              // ISO8601
  lastSeenAt?: string               // ISO8601
  createdAt: number
  updatedAt: number
  meta?: Record<string, unknown>
}

/**
 * 保存模型数据输入
 */
export type SaveModelDataInput = {
  id: string
  routerSource?: string             // 默认 'openrouter'
  vendor?: string                   // 默认从 id 前缀解析
  name?: string
  description?: string
  contextLength?: number            // 默认 -1
  pricing?: ModelPricingRecord
  capabilities?: ModelCapabilitiesRecord
  isArchived?: boolean              // 默认 false
  firstSeenAt?: string
  lastSeenAt?: string
  createdAt?: number
  meta?: Record<string, unknown>
}

/**
 * 模型列表查询参数
 */
export type ListModelParams = {
  routerSource?: string
  vendor?: string
  includeArchived?: boolean         // 默认 false
  limit?: number
  offset?: number
}
