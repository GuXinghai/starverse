import type {
  CompatibleCatalogSnapshot,
  CompatibleCatalogApplyResult,
  CompatibleCatalogSyncState,
  CompatibleCredentialDescriptor,
  CompatibleDiscoveredResponseField,
  CompatibleEndpointRevision,
  CompatibleInlineReasoningPolicy,
  CompatibleModelRecord,
  CompatibleMergedModel,
  CompatibleProviderInstance,
  CompatibleRawExtensionRecord,
  CompatibleReasoningMapping,
  CompatibleRequestFieldMapping,
  CompatibleRequestProfile,
  CompatibleResponseProfile,
  CompatibleRouteChoice,
  CompatibleRouteProvenance,
  CompatibleToolCall,
  CompatibleToolResult,
} from './domain'

export interface CompatibleProviderRepositoryContract {
  createProvider(input: unknown): CompatibleProviderInstance
  getProvider(providerInstanceId: unknown): CompatibleProviderInstance | null
  listProviders(input?: Readonly<{ includeDeleted?: boolean }>): readonly CompatibleProviderInstance[]
  updateProvider(input: unknown): CompatibleProviderInstance
  tombstoneProvider(input: unknown): CompatibleProviderInstance
  createCredentialDescriptor(input: unknown): CompatibleCredentialDescriptor
  getCredentialDescriptor(credentialVersionRef: unknown): CompatibleCredentialDescriptor | null
  deleteCredentialDescriptor(input: unknown): CompatibleCredentialDescriptor
  createEndpointRevision(input: unknown): CompatibleEndpointRevision
  getEndpointRevision(endpointRevisionId: unknown): CompatibleEndpointRevision | null
  listEndpointRevisions(providerInstanceId: unknown): readonly CompatibleEndpointRevision[]
}

export interface CompatibleProfileRepositoryContract {
  createRequestProfile(input: unknown): CompatibleRequestProfile
  getRequestProfile(requestProfileId: unknown, version: unknown): CompatibleRequestProfile | null
  createRequestFieldMapping(input: unknown): CompatibleRequestFieldMapping
  getRequestFieldMapping(mappingId: unknown, version: unknown): CompatibleRequestFieldMapping | null
  listRequestFieldMappings(requestProfileId: unknown, version: unknown): readonly CompatibleRequestFieldMapping[]
  createReasoningMapping(input: unknown): CompatibleReasoningMapping
  getReasoningMapping(mappingId: unknown, version: unknown): CompatibleReasoningMapping | null
  createInlinePolicy(input: unknown): CompatibleInlineReasoningPolicy
  getInlinePolicy(inlinePolicyId: unknown, version: unknown): CompatibleInlineReasoningPolicy | null
  createResponseProfile(input: unknown): CompatibleResponseProfile
  getResponseProfile(responseProfileId: unknown, version: unknown): CompatibleResponseProfile | null
}

export interface CompatibleCatalogRepositoryContract {
  applyRemoteSyncSuccess(input: unknown): CompatibleCatalogApplyResult
  getSnapshot(snapshotId: unknown): CompatibleCatalogSnapshot | null
  upsertManualModel(input: unknown): CompatibleModelRecord
  deleteManualModel(providerInstanceId: unknown, modelId: unknown): boolean
  listModelRecords(providerInstanceId: unknown, modelId?: unknown): readonly CompatibleModelRecord[]
  listMergedModels(providerInstanceId: unknown): readonly CompatibleMergedModel[]
  getNextSnapshotSequence(providerInstanceId: unknown): number
  markSyncing(providerInstanceId: unknown, attemptedAtMs: unknown): CompatibleCatalogSyncState
  recordSyncFailure(input: unknown): CompatibleCatalogSyncState
  recoverInterruptedSyncs(atMs: unknown): number
  upsertSyncState(input: unknown): CompatibleCatalogSyncState
  getSyncState(providerInstanceId: unknown): CompatibleCatalogSyncState | null
}

export interface CompatibleRouteRepositoryContract {
  createRouteWithChoices(route: unknown, choices?: readonly unknown[]): CompatibleRouteProvenance
  addChoice(input: unknown): CompatibleRouteChoice
  getRoute(routeProvenanceId: unknown): CompatibleRouteProvenance | null
  getRouteByRequestMessageId(messageId: unknown): CompatibleRouteProvenance | null
  getRouteByChoiceMessageId(messageId: unknown): CompatibleRouteProvenance | null
  getAvailability(routeProvenanceId: unknown): import('./route').CompatibleRouteAvailability | null
  listChoices(routeProvenanceId: unknown): readonly CompatibleRouteChoice[]
  transition(input: unknown): CompatibleRouteProvenance
  recoverIncomplete(atMs: unknown): number
}

export interface CompatibleToolRepositoryContract {
  saveCall(input: unknown): CompatibleToolCall
  saveCalls(input: readonly unknown[]): readonly CompatibleToolCall[]
  getCall(messageId: unknown, choiceIndex: unknown, toolIndex: unknown): CompatibleToolCall | null
  listCalls(routeProvenanceId: unknown, choiceIndex?: unknown): readonly CompatibleToolCall[]
  createResult(input: unknown): CompatibleToolResult
  getResult(toolResultMessageId: unknown): CompatibleToolResult | null
  listResults(routeProvenanceId: unknown): readonly CompatibleToolResult[]
  loadChoiceChain(routeProvenanceId: unknown, choiceIndex: unknown): Readonly<{
    calls: readonly CompatibleToolCall[]
    results: readonly CompatibleToolResult[]
  }>
}

export interface CompatibleDiagnosticsRepositoryContract {
  upsertDiscoveredField(input: unknown): CompatibleDiscoveredResponseField
  getDiscoveredField(
    providerInstanceId: unknown,
    responseProfileId: unknown,
    profileVersion: unknown,
    streamPath: unknown,
  ): CompatibleDiscoveredResponseField | null
  createRawExtensionRecords(inputs: readonly unknown[]): readonly CompatibleRawExtensionRecord[]
  listRawExtensionRecords(messageId: unknown): readonly CompatibleRawExtensionRecord[]
}

export interface CompatibleReasoningRepositoryContract {
  save(input: unknown): unknown
  get(routeProvenanceId: unknown, choiceIndex: unknown): unknown
}
