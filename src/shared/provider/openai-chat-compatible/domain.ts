import type {
  CatalogSnapshotId,
  CompatibleModelIdentity,
  CredentialVersionRef,
  EndpointRevisionId,
  InlinePolicyId,
  ProviderInstanceId,
  RawExtensionRecordId,
  ReasoningMappingId,
  RequestFieldMappingId,
  RequestProfileId,
  ResponseProfileId,
  RouteProvenanceId,
} from './identity'
import type {
  CompatibleAuthDescriptor,
  CompatibleCatalogSyncDiagnostics,
  CompatibleCredentialMaskedSummary,
  CompatibleDiscoveredFieldAggregate,
  CompatibleEndpointSecurityPolicy,
  CompatibleInlinePolicyConfig,
  CompatibleModelMetadata,
  CompatibleOrdinaryHeaders,
  CompatibleQueryConfig,
  CompatibleReasoningMappingConfig,
  CompatibleRequestFieldMappingConfig,
  CompatibleRequestProfileConfig,
  CompatibleResponseProfileConfig,
  CompatibleSensitiveHeaderRefs,
} from './schemas'
import { OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY } from './identity'
import type { CompatibleToolDiagnosticCode } from './tools/toolTypes'

export type CompatibleProviderStatus = 'active' | 'disabled' | 'deleted'
export type CompatibleCredentialBackend = 'electron_safe_storage'
export type CompatibleAuthMode = 'none' | 'bearer' | 'basic' | 'custom_headers'
export type CompatibleModelSource = 'remote_sync' | 'manual'
export type CompatibleModelRecordState = 'active' | 'stale'
export type CompatibleCatalogSyncStatus = 'never' | 'syncing' | 'success' | 'empty_success' | 'failed' | 'backoff'
export type CompatibleDiscoveredFieldState = 'candidate' | 'ignored' | 'confirmed'
export type CompatibleToolCallStatus = 'streaming' | 'complete' | 'malformed' | 'incomplete'
export type CompatibleRawRedactionState = 'redacted' | 'truncated_redacted' | 'dropped'
export type CompatibleRouteState = 'prepared' | 'streaming' | 'completed' | 'failed' | 'aborted' | 'interrupted'

export type CompatibleProviderInstance = Readonly<{
  providerInstanceId: ProviderInstanceId
  protocolKey: typeof OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY
  displayName: string
  status: CompatibleProviderStatus
  createdAtMs: number
  updatedAtMs: number
  deletedAtMs: number | null
}>

export type CompatibleCredentialDescriptor = Readonly<{
  credentialVersionRef: CredentialVersionRef
  providerInstanceId: ProviderInstanceId
  version: number
  authMode: CompatibleAuthMode
  backend: CompatibleCredentialBackend
  maskedSummary: CompatibleCredentialMaskedSummary
  createdAtMs: number
  deletedAtMs: number | null
}>

export type CompatibleEndpointRevision = Readonly<{
  endpointRevisionId: EndpointRevisionId
  providerInstanceId: ProviderInstanceId
  revision: number
  baseUrl: string
  allowInsecureHttp: boolean
  securityPolicy: CompatibleEndpointSecurityPolicy
  auth: CompatibleAuthDescriptor
  credentialVersionRef: CredentialVersionRef | null
  ordinaryHeaders: CompatibleOrdinaryHeaders
  sensitiveHeaderRefs: CompatibleSensitiveHeaderRefs
  query: CompatibleQueryConfig
  requestProfileId: RequestProfileId
  requestProfileVersion: number
  responseProfileId: ResponseProfileId
  responseProfileVersion: number
  createdAtMs: number
}>

export type CompatibleRequestProfile = Readonly<{
  requestProfileId: RequestProfileId
  version: number
  config: CompatibleRequestProfileConfig
  createdAtMs: number
}>

export type CompatibleRequestFieldMapping = Readonly<{
  mappingId: RequestFieldMappingId
  version: number
  requestProfileId: RequestProfileId
  requestProfileVersion: number
  targetPath: readonly (string | number)[]
  config: CompatibleRequestFieldMappingConfig
  createdAtMs: number
}>

export type CompatibleReasoningMapping = Readonly<{
  mappingId: ReasoningMappingId
  version: number
  mode: 'custom_preferred_with_builtin_fallback' | 'custom_only'
  config: CompatibleReasoningMappingConfig
  createdAtMs: number
}>

export type CompatibleInlineReasoningPolicy = Readonly<{
  inlinePolicyId: InlinePolicyId
  version: number
  config: CompatibleInlinePolicyConfig
  createdAtMs: number
}>

export type CompatibleResponseProfile = Readonly<{
  responseProfileId: ResponseProfileId
  version: number
  reasoningMappingId: ReasoningMappingId
  reasoningMappingVersion: number
  inlinePolicyId: InlinePolicyId
  inlinePolicyVersion: number
  config: CompatibleResponseProfileConfig
  createdAtMs: number
}>

export type CompatibleModelRecord = Readonly<CompatibleModelIdentity & {
  source: CompatibleModelSource
  state: CompatibleModelRecordState
  snapshotId: CatalogSnapshotId | null
  metadata: CompatibleModelMetadata
  createdAtMs: number
  updatedAtMs: number
}>

export type CompatibleMergedModel = Readonly<CompatibleModelIdentity & {
  protocolKey: typeof OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY
  metadata: CompatibleModelMetadata
  availability: 'active' | 'stale'
  sourcePresence: Readonly<{ remote: CompatibleModelRecordState | 'absent'; manual: boolean }>
  conflictFields: readonly string[]
}>

export type CompatibleCatalogSnapshot = Readonly<{
  snapshotId: CatalogSnapshotId
  providerInstanceId: ProviderInstanceId
  snapshotSequence: number
  observedAtMs: number
  modelCount: number
  checksum: string | null
  metadata: Readonly<Record<string, unknown>> | null
}>

export type CompatibleCatalogApplyResult = Readonly<{
  snapshot: CompatibleCatalogSnapshot
  syncState: CompatibleCatalogSyncState
  models: readonly CompatibleMergedModel[]
}>

export type CompatibleCatalogSyncState = Readonly<{
  providerInstanceId: ProviderInstanceId
  status: CompatibleCatalogSyncStatus
  lastAttemptAtMs: number | null
  lastSuccessAtMs: number | null
  lastSuccessSnapshotId: CatalogSnapshotId | null
  failureCount: number
  backoffUntilMs: number | null
  diagnostics: CompatibleCatalogSyncDiagnostics | null
  updatedAtMs: number
}>

export type CompatibleDiscoveredResponseField = Readonly<{
  providerInstanceId: ProviderInstanceId
  responseProfileId: ResponseProfileId
  profileVersion: number
  streamPath: string
  state: CompatibleDiscoveredFieldState
  aggregate: CompatibleDiscoveredFieldAggregate
  occurrenceCount: number
  firstObservedAtMs: number
  lastObservedAtMs: number
}>

export type CompatibleRouteProvenance = Readonly<{
  routeProvenanceId: RouteProvenanceId
  requestId: string
  requestMessageId: string
  protocolKey: typeof OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY
  providerInstanceId: ProviderInstanceId
  modelId: string
  endpointRevisionId: EndpointRevisionId
  credentialVersionRef: CredentialVersionRef | null
  requestProfileId: RequestProfileId
  requestProfileVersion: number
  responseProfileId: ResponseProfileId
  responseProfileVersion: number
  reasoningMappingId: ReasoningMappingId
  reasoningMappingVersion: number
  reasoningMode: CompatibleReasoningMapping['mode']
  inlinePolicyId: InlinePolicyId
  inlinePolicyVersion: number
  state: CompatibleRouteState
  createdAtMs: number
  updatedAtMs: number
  terminalAtMs: number | null
}>

export type CompatibleRouteChoice = Readonly<{
  routeProvenanceId: RouteProvenanceId
  choiceIndex: number
  messageId: string
  createdAtMs: number
}>

export type CompatibleToolCall = Readonly<{
  routeProvenanceId: RouteProvenanceId
  messageId: string
  choiceIndex: number
  toolIndex: number
  toolCallId: string | null
  toolType: 'function' | null
  functionName: string | null
  argumentsText: string
  argumentsObserved: boolean
  argumentsJson: string | null
  status: CompatibleToolCallStatus
  parseErrorCode: CompatibleToolDiagnosticCode | null
  executionState: 'not_executed'
  sequenceStart: number
  sequenceEnd: number
  createdAtMs: number
  updatedAtMs: number
}>

export type CompatibleToolResult = Readonly<{
  toolResultMessageId: string
  routeProvenanceId: RouteProvenanceId
  toolCallId: string
  contentJson: string
  messageSequence: number
  createdAtMs: number
}>

export type CompatibleRawExtensionRecord = Readonly<{
  recordId: RawExtensionRecordId
  routeProvenanceId: RouteProvenanceId
  messageId: string
  choiceIndex: number
  responseProfileId: ResponseProfileId
  responseProfileVersion: number
  sourcePath: string
  sequenceStart: number
  sequenceEnd: number
  extensionKind: 'append' | 'snapshot'
  semantic: 'reasoning' | 'diagnostic'
  value: unknown
  valueBytes: number
  redactionState: CompatibleRawRedactionState
  createdAtMs: number
}>

export type CompatibleProviderAvailability = Readonly<{
  providerInstanceId: ProviderInstanceId
  available: boolean
  observedAtMs: number
  warnings: readonly string[]
}>
