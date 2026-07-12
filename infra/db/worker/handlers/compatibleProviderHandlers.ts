import { z } from 'zod'
import { compatibleDurableChoiceProjectionSchema } from '../../../../src/shared/provider/openai-chat-compatible/display'
import type { DbWorkerRuntime } from '../runtime'
import type { RegisterHandler } from './types'
import {
  catalogSnapshotIdSchema,
  compatibleChoiceIndexSchema,
  compatibleAuthDescriptorSchema,
  compatibleEndpointSecurityPolicySchema,
  compatibleOrdinaryHeadersSchema,
  compatibleQueryConfigSchema,
  compatibleSensitiveHeaderRefsSchema,
  compatibleMessageIdSchema,
  compatibleModelIdSchema,
  compatibleProfileVersionSchema,
  compatibleHistoricalRouteLookupSchema,
  compatibleRouteAdditionalChoiceSchema,
  compatibleRoutePrepareChoicesSchema,
  compatibleRoutePrepareExistingHistoricalSchema,
  compatibleRoutePinSourceSchema,
  compatibleRoutePrepareIdentitySchema,
  compatibleRouteTransitionSchema,
  credentialVersionRefSchema,
  endpointRevisionIdSchema,
  inlinePolicyIdSchema,
  providerInstanceIdSchema,
  reasoningMappingIdSchema,
  requestFieldMappingIdSchema,
  requestProfileIdSchema,
  responseProfileIdSchema,
  routeProvenanceIdSchema,
} from '../../../../src/shared/provider/openai-chat-compatible'
import {
  CreateCompatibleCredentialDescriptorInputSchema,
  CreateCompatibleEndpointRevisionInputSchema,
  CreateCompatibleProviderInputSchema,
  DeleteCompatibleCredentialDescriptorInputSchema,
  TombstoneCompatibleProviderInputSchema,
  UpdateCompatibleProviderInputSchema,
  CreateCompatibleInlinePolicyInputSchema,
  CreateCompatibleReasoningMappingInputSchema,
  CreateCompatibleRequestFieldMappingInputSchema,
  CreateCompatibleRequestProfileInputSchema,
  CreateCompatibleResponseProfileInputSchema,
  ApplyCompatibleRemoteSyncSuccessInputSchema,
  RecordCompatibleCatalogSyncFailureInputSchema,
  UpsertCompatibleCatalogSyncStateInputSchema,
  UpsertCompatibleManualModelInputSchema,
  CreateCompatibleToolResultInputSchema,
  SaveCompatibleToolCallInputSchema,
  CreateCompatibleRawExtensionRecordInputSchema,
  UpsertCompatibleDiscoveredFieldInputSchema,
  SaveCompatibleReasoningChoiceInputSchema,
  BeginTurnSchema,
} from '../../validation'

const providerIdInputSchema = z.object({ providerInstanceId: providerInstanceIdSchema }).strict()
const credentialRefInputSchema = z.object({ credentialVersionRef: credentialVersionRefSchema }).strict()
const endpointIdInputSchema = z.object({ endpointRevisionId: endpointRevisionIdSchema }).strict()
const versionInput = <T extends z.ZodTypeAny>(idSchema: T, idKey: string) => z.object({
  [idKey]: idSchema,
  version: compatibleProfileVersionSchema,
}).strict()

export function registerCompatibleProviderHandlers(register: RegisterHandler, runtime: DbWorkerRuntime) {
  const rt = runtime as any
  const legacyProviderKeys = ['generic_openai_compatible'] as const
  const resetCensus = () => {
    const counts: Record<string, number> = {}
    for (const table of ['message_reasoning_display_blocks', 'message_provider_native_contents', 'model_favorites', 'model_recents', 'catalog_models', 'catalog_scope_meta', 'providers'] as const) {
      counts[table] = Number((runtime.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE provider_key = ?`).get(legacyProviderKeys[0]) as { count: number }).count)
    }
    for (const table of ['model_data', 'model_catalog'] as const) counts[table] = Number((runtime.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE router_source = ?`).get(legacyProviderKeys[0]) as { count: number }).count)
    const ambiguous = Object.freeze({
      conversationSelections: Number((runtime.db.prepare(`SELECT COUNT(*) AS count FROM convo WHERE json_valid(meta) AND json_extract(meta, '$.selectedProviderId') = ?`).get(legacyProviderKeys[0]) as { count: number }).count),
      messageConversations: Number((runtime.db.prepare(`SELECT COUNT(DISTINCT convo_id) AS count FROM message WHERE json_valid(meta) AND json_extract(meta, '$.providerId') = ?`).get(legacyProviderKeys[0]) as { count: number }).count),
      providerlessSelections: Number((runtime.db.prepare(`SELECT COUNT(*) AS count FROM convo WHERE json_valid(meta) AND json_type(meta, '$.selectedModelKey') IS NOT NULL AND json_type(meta, '$.selectedProviderId') IS NULL`).get() as { count: number }).count),
    })
    const retainedCredentialRefs = (runtime.db.prepare(`SELECT credential_version_ref AS ref FROM compatible_credential_descriptors WHERE deleted_at_ms IS NULL ORDER BY credential_version_ref`).all() as Array<{ ref: string }>).map((row) => row.ref)
    return Object.freeze({ schemaVersion: 1, legacyProviderKeys: [...legacyProviderKeys], counts, ambiguous, retainedCredentialRefs })
  }
  register('compatibleProvider.create', (raw) => runtime.compatibleProviderRepo.createProvider(CreateCompatibleProviderInputSchema.parse(raw)))
  register('compatibleProvider.get', (raw) => {
    const input = providerIdInputSchema.parse(raw)
    return runtime.compatibleProviderRepo.getProvider(input.providerInstanceId)
  })
  register('compatibleProvider.list', (raw) => runtime.compatibleProviderRepo.listProviders(
    z.object({ includeDeleted: z.boolean().optional() }).strict().parse(raw ?? {}),
  ))
  register('compatibleProvider.update', (raw) => runtime.compatibleProviderRepo.updateProvider(UpdateCompatibleProviderInputSchema.parse(raw)))
  register('compatibleProvider.tombstone', (raw) => runtime.compatibleProviderRepo.tombstoneProvider(TombstoneCompatibleProviderInputSchema.parse(raw)))

  register('compatibleCredential.createDescriptor', (raw) => runtime.compatibleProviderRepo.createCredentialDescriptor(CreateCompatibleCredentialDescriptorInputSchema.parse(raw)))
  register('compatibleCredential.getDescriptor', (raw) => {
    const input = credentialRefInputSchema.parse(raw)
    return runtime.compatibleProviderRepo.getCredentialDescriptor(input.credentialVersionRef)
  })
  register('compatibleCredential.listDescriptors', (raw) => {
    const input = z.object({ providerInstanceId: providerInstanceIdSchema, includeDeleted: z.boolean().optional() }).strict().parse(raw)
    return runtime.compatibleProviderRepo.listCredentialDescriptors(input.providerInstanceId, { includeDeleted: input.includeDeleted })
  })
  register('compatibleCredential.deleteDescriptor', (raw) => runtime.compatibleProviderRepo.deleteCredentialDescriptor(DeleteCompatibleCredentialDescriptorInputSchema.parse(raw)))

  register('compatibleEndpoint.createRevision', (raw) => runtime.compatibleProviderRepo.createEndpointRevision(CreateCompatibleEndpointRevisionInputSchema.parse(raw)))
  register('compatibleEndpoint.getRevision', (raw) => {
    const input = endpointIdInputSchema.parse(raw)
    return runtime.compatibleProviderRepo.getEndpointRevision(input.endpointRevisionId)
  })
  register('compatibleEndpoint.listRevisions', (raw) => {
    const input = providerIdInputSchema.parse(raw)
    return runtime.compatibleProviderRepo.listEndpointRevisions(input.providerInstanceId)
  })

  register('compatibleRegistry.create', (raw) => {
    const input = z.object({
      provider: CreateCompatibleProviderInputSchema,
      credential: CreateCompatibleCredentialDescriptorInputSchema.nullable(),
      requestProfile: CreateCompatibleRequestProfileInputSchema,
      requestMappings: z.array(CreateCompatibleRequestFieldMappingInputSchema).max(32).default([]),
      reasoningMapping: CreateCompatibleReasoningMappingInputSchema,
      inlinePolicy: CreateCompatibleInlinePolicyInputSchema,
      responseProfile: CreateCompatibleResponseProfileInputSchema,
      endpoint: CreateCompatibleEndpointRevisionInputSchema,
    }).strict().parse(raw)
    return runtime.db.transaction(() => {
      const provider = runtime.compatibleProviderRepo.createProvider(input.provider)
      runtime.compatibleProfileRepo.createRequestProfile(input.requestProfile)
      for (const mapping of input.requestMappings) runtime.compatibleProfileRepo.createRequestFieldMapping(mapping)
      runtime.compatibleProfileRepo.createReasoningMapping(input.reasoningMapping)
      runtime.compatibleProfileRepo.createInlinePolicy(input.inlinePolicy)
      runtime.compatibleProfileRepo.createResponseProfile(input.responseProfile)
      const credential = input.credential
        ? runtime.compatibleProviderRepo.createCredentialDescriptor(input.credential)
        : null
      const endpoint = runtime.compatibleProviderRepo.createEndpointRevision(input.endpoint)
      return { provider, credential, endpoint }
    })()
  })

  register('compatibleRegistry.updateEndpoint', (raw) => {
    const input = z.object({
      providerInstanceId: providerInstanceIdSchema,
      endpointRevisionId: endpointRevisionIdSchema,
      baseUrl: z.string().trim().url().max(2048),
      allowInsecureHttp: z.boolean(),
      securityPolicy: compatibleEndpointSecurityPolicySchema,
      ordinaryHeaders: compatibleOrdinaryHeadersSchema,
      query: compatibleQueryConfigSchema,
      clearAuthentication: z.boolean().default(false),
      createdAtMs: z.number().int().nonnegative(),
    }).strict().parse(raw)
    return runtime.db.transaction(() => {
      const latest = runtime.compatibleProviderRepo.getLatestEndpointRevision(input.providerInstanceId)
      if (!latest) throw new Error('Compatible endpoint revision is unavailable.')
      const endpoint = runtime.compatibleProviderRepo.createEndpointRevision({
        ...latest,
        endpointRevisionId: input.endpointRevisionId,
        revision: latest.revision + 1,
        baseUrl: input.baseUrl,
        allowInsecureHttp: input.allowInsecureHttp,
        securityPolicy: input.securityPolicy,
        ordinaryHeaders: input.ordinaryHeaders,
        query: input.query,
        ...(input.clearAuthentication ? { auth: { mode: 'none' as const }, credentialVersionRef: null, sensitiveHeaderRefs: [] } : {}),
        createdAtMs: input.createdAtMs,
      })
      if (input.clearAuthentication && latest.credentialVersionRef) runtime.compatibleProviderRepo.deleteCredentialDescriptor({
        credentialVersionRef: latest.credentialVersionRef,
        deletedAtMs: input.createdAtMs,
      })
      return endpoint
    })()
  })

  register('compatibleRegistry.deleteProvider', (raw) => {
    const input = z.object({ providerInstanceId: providerInstanceIdSchema, deletedAtMs: z.number().int().nonnegative() }).strict().parse(raw)
    return runtime.db.transaction(() => {
      const descriptors = runtime.compatibleProviderRepo.listCredentialDescriptors(input.providerInstanceId, { includeDeleted: true })
      const provider = runtime.compatibleProviderRepo.tombstoneProvider(input)
      for (const descriptor of descriptors) if (descriptor.deletedAtMs === null) runtime.compatibleProviderRepo.deleteCredentialDescriptor({
        credentialVersionRef: descriptor.credentialVersionRef,
        deletedAtMs: input.deletedAtMs,
      })
      return { provider, credentialVersionRefs: descriptors.map((descriptor) => descriptor.credentialVersionRef) }
    })()
  })

  register('compatibleRegistry.reviseConfiguration', (raw) => {
    const input = z.object({
      providerInstanceId: providerInstanceIdSchema,
      endpointRevisionId: endpointRevisionIdSchema,
      requestProfile: CreateCompatibleRequestProfileInputSchema,
      requestMappings: z.array(CreateCompatibleRequestFieldMappingInputSchema).max(32),
      reasoningMapping: CreateCompatibleReasoningMappingInputSchema,
      inlinePolicy: CreateCompatibleInlinePolicyInputSchema,
      responseProfile: CreateCompatibleResponseProfileInputSchema,
      acceptedDiscoveryPaths: z.array(z.string().trim().min(1).max(1024)).max(32).default([]),
      createdAtMs: z.number().int().nonnegative(),
    }).strict().parse(raw)
    return runtime.db.transaction(() => {
      const latest = runtime.compatibleProviderRepo.getLatestEndpointRevision(input.providerInstanceId)
      if (!latest) throw new Error('Compatible endpoint revision is unavailable.')
      const currentResponse = runtime.compatibleProfileRepo.getResponseProfile(latest.responseProfileId, latest.responseProfileVersion)
      if (!currentResponse) throw new Error('Compatible response profile is unavailable.')
      if (
        input.requestProfile.requestProfileId !== latest.requestProfileId || input.requestProfile.version !== latest.requestProfileVersion + 1 ||
        input.responseProfile.responseProfileId !== latest.responseProfileId || input.responseProfile.version !== latest.responseProfileVersion + 1 ||
        input.reasoningMapping.mappingId !== currentResponse.reasoningMappingId || input.reasoningMapping.version !== currentResponse.reasoningMappingVersion + 1 ||
        input.inlinePolicy.inlinePolicyId !== currentResponse.inlinePolicyId || input.inlinePolicy.version !== currentResponse.inlinePolicyVersion + 1
      ) throw new Error('Compatible profile revision must advance the active immutable lineage exactly once.')
      for (const streamPath of input.acceptedDiscoveryPaths) {
        const acceptedRules = input.reasoningMapping.config.rules.filter((rule) => rule.stream.path === streamPath)
        if (acceptedRules.length !== 1 || acceptedRules[0]!.semantic !== 'text') {
          throw new Error('Accepted discovery path must be pinned by the new reasoning mapping.')
        }
        const candidate = runtime.compatibleDiagnosticsRepo.getDiscoveredField(
          input.providerInstanceId, latest.responseProfileId, latest.responseProfileVersion, streamPath,
        )
        if (!candidate || candidate.state !== 'candidate' || candidate.aggregate.observedShapes.every((shape) => shape !== 'string' && shape !== 'array')) {
          throw new Error('Compatible discovery candidate cannot be accepted as reasoning.')
        }
      }
      runtime.compatibleProfileRepo.createRequestProfile(input.requestProfile)
      for (const mapping of input.requestMappings) runtime.compatibleProfileRepo.createRequestFieldMapping(mapping)
      runtime.compatibleProfileRepo.createReasoningMapping(input.reasoningMapping)
      runtime.compatibleProfileRepo.createInlinePolicy(input.inlinePolicy)
      runtime.compatibleProfileRepo.createResponseProfile(input.responseProfile)
      for (const streamPath of input.acceptedDiscoveryPaths) runtime.compatibleDiagnosticsRepo.setDiscoveredFieldState({
        providerInstanceId: input.providerInstanceId,
        responseProfileId: latest.responseProfileId,
        profileVersion: latest.responseProfileVersion,
        streamPath,
        state: 'confirmed',
      })
      return runtime.compatibleProviderRepo.createEndpointRevision({
        ...latest,
        endpointRevisionId: input.endpointRevisionId,
        revision: latest.revision + 1,
        requestProfileId: input.requestProfile.requestProfileId,
        requestProfileVersion: input.requestProfile.version,
        responseProfileId: input.responseProfile.responseProfileId,
        responseProfileVersion: input.responseProfile.version,
        createdAtMs: input.createdAtMs,
      })
    })()
  })

  register('compatibleRegistry.rotateCredential', (raw) => {
    const input = z.object({
      providerInstanceId: providerInstanceIdSchema,
      credential: CreateCompatibleCredentialDescriptorInputSchema.omit({ version: true }),
      endpointRevisionId: endpointRevisionIdSchema,
      auth: compatibleAuthDescriptorSchema,
      sensitiveHeaderRefs: compatibleSensitiveHeaderRefsSchema,
      createdAtMs: z.number().int().nonnegative(),
    }).strict().parse(raw)
    return runtime.db.transaction(() => {
      const latest = runtime.compatibleProviderRepo.getLatestEndpointRevision(input.providerInstanceId)
      if (!latest) throw new Error('Compatible endpoint revision is unavailable.')
      const descriptors = runtime.compatibleProviderRepo.listCredentialDescriptors(input.providerInstanceId, { includeDeleted: true })
      const version = Math.max(0, ...descriptors.map((item) => item.version)) + 1
      const credential = runtime.compatibleProviderRepo.createCredentialDescriptor({ ...input.credential, version })
      const endpoint = runtime.compatibleProviderRepo.createEndpointRevision({
        ...latest,
        endpointRevisionId: input.endpointRevisionId,
        revision: latest.revision + 1,
        auth: input.auth,
        credentialVersionRef: credential.credentialVersionRef,
        sensitiveHeaderRefs: input.sensitiveHeaderRefs,
        createdAtMs: input.createdAtMs,
      })
      return { credential, endpoint }
    })()
  })

  register('compatibleProfile.createRequest', (raw) => runtime.compatibleProfileRepo.createRequestProfile(CreateCompatibleRequestProfileInputSchema.parse(raw)))
  register('compatibleProfile.getRequest', (raw) => {
    const input = versionInput(requestProfileIdSchema, 'requestProfileId').parse(raw)
    return runtime.compatibleProfileRepo.getRequestProfile(input.requestProfileId, input.version)
  })
  register('compatibleProfile.createRequestMapping', (raw) => runtime.compatibleProfileRepo.createRequestFieldMapping(CreateCompatibleRequestFieldMappingInputSchema.parse(raw)))
  register('compatibleProfile.getRequestMapping', (raw) => {
    const input = versionInput(requestFieldMappingIdSchema, 'mappingId').parse(raw)
    return runtime.compatibleProfileRepo.getRequestFieldMapping(input.mappingId, input.version)
  })
  register('compatibleProfile.listRequestMappings', (raw) => {
    const input = versionInput(requestProfileIdSchema, 'requestProfileId').parse(raw)
    return runtime.compatibleProfileRepo.listRequestFieldMappings(input.requestProfileId, input.version)
  })
  register('compatibleProfile.getRequestBundle', (raw) => {
    const input = versionInput(requestProfileIdSchema, 'requestProfileId').parse(raw)
    const profile = runtime.compatibleProfileRepo.getRequestProfile(input.requestProfileId, input.version)
    if (!profile) return null
    return {
      profile,
      mappings: runtime.compatibleProfileRepo.listRequestFieldMappings(input.requestProfileId, input.version),
    }
  })
  register('compatibleProfile.createReasoningMapping', (raw) => runtime.compatibleProfileRepo.createReasoningMapping(CreateCompatibleReasoningMappingInputSchema.parse(raw)))
  register('compatibleProfile.getReasoningMapping', (raw) => {
    const input = versionInput(reasoningMappingIdSchema, 'mappingId').parse(raw)
    return runtime.compatibleProfileRepo.getReasoningMapping(input.mappingId, input.version)
  })
  register('compatibleProfile.createInlinePolicy', (raw) => runtime.compatibleProfileRepo.createInlinePolicy(CreateCompatibleInlinePolicyInputSchema.parse(raw)))
  register('compatibleProfile.getInlinePolicy', (raw) => {
    const input = versionInput(inlinePolicyIdSchema, 'inlinePolicyId').parse(raw)
    return runtime.compatibleProfileRepo.getInlinePolicy(input.inlinePolicyId, input.version)
  })
  register('compatibleProfile.createResponse', (raw) => runtime.compatibleProfileRepo.createResponseProfile(CreateCompatibleResponseProfileInputSchema.parse(raw)))
  register('compatibleProfile.getResponse', (raw) => {
    const input = versionInput(responseProfileIdSchema, 'responseProfileId').parse(raw)
    return runtime.compatibleProfileRepo.getResponseProfile(input.responseProfileId, input.version)
  })

  register('compatibleCatalog.applyRemoteSyncSuccess', (raw) => runtime.compatibleCatalogRepo.applyRemoteSyncSuccess(ApplyCompatibleRemoteSyncSuccessInputSchema.parse(raw)))
  register('compatibleCatalog.getSnapshot', (raw) => {
    const input = z.object({ snapshotId: catalogSnapshotIdSchema }).strict().parse(raw)
    return runtime.compatibleCatalogRepo.getSnapshot(input.snapshotId)
  })
  register('compatibleCatalog.upsertManualModel', (raw) => runtime.compatibleCatalogRepo.upsertManualModel(UpsertCompatibleManualModelInputSchema.parse(raw)))
  register('compatibleCatalog.deleteManualModel', (raw) => {
    const input = z.object({ providerInstanceId: providerInstanceIdSchema, modelId: compatibleModelIdSchema }).strict().parse(raw)
    return { deleted: runtime.compatibleCatalogRepo.deleteManualModel(input.providerInstanceId, input.modelId) }
  })
  register('compatibleCatalog.listModelRecords', (raw) => {
    const input = z.object({ providerInstanceId: providerInstanceIdSchema, modelId: compatibleModelIdSchema.optional() }).strict().parse(raw)
    return runtime.compatibleCatalogRepo.listModelRecords(input.providerInstanceId, input.modelId)
  })
  register('compatibleCatalog.listMergedModels', (raw) => {
    const input = providerIdInputSchema.parse(raw)
    return runtime.compatibleCatalogRepo.listMergedModels(input.providerInstanceId)
  })
  register('compatibleCatalog.getNextSnapshotSequence', (raw) => {
    const input = providerIdInputSchema.parse(raw)
    return runtime.compatibleCatalogRepo.getNextSnapshotSequence(input.providerInstanceId)
  })
  register('compatibleCatalog.markSyncing', (raw) => {
    const input = z.object({ providerInstanceId: providerInstanceIdSchema, attemptedAtMs: z.number().int().nonnegative() }).strict().parse(raw)
    return runtime.compatibleCatalogRepo.markSyncing(input.providerInstanceId, input.attemptedAtMs)
  })
  register('compatibleCatalog.recordSyncFailure', (raw) => runtime.compatibleCatalogRepo.recordSyncFailure(RecordCompatibleCatalogSyncFailureInputSchema.parse(raw)))
  register('compatibleCatalog.recoverInterrupted', (raw) => {
    const input = z.object({ atMs: z.number().int().nonnegative() }).strict().parse(raw)
    return { recovered: runtime.compatibleCatalogRepo.recoverInterruptedSyncs(input.atMs) }
  })
  register('compatibleCatalog.upsertSyncState', (raw) => runtime.compatibleCatalogRepo.upsertSyncState(UpsertCompatibleCatalogSyncStateInputSchema.parse(raw)))
  register('compatibleCatalog.getSyncState', (raw) => {
    const input = providerIdInputSchema.parse(raw)
    return runtime.compatibleCatalogRepo.getSyncState(input.providerInstanceId)
  })

  register('compatibleRoute.prepareTurn', (raw) => {
    const input = z.object({
      route: compatibleRoutePrepareIdentitySchema,
      pinSource: compatibleRoutePinSourceSchema,
      turn: z.unknown(),
    }).strict().parse(raw)
    const turn = BeginTurnSchema.parse(input.turn)
    const txn = runtime.db.transaction(() => {
      const branch = rt.branchRepo.get(turn.branchId)
      if (!branch?.convoId) throw new Error('Compatible route branch is unavailable.')
      if (branch.deletedAt != null) throw new Error('Compatible route branch is deleted.')
      const sourceRoute = input.pinSource.kind === 'historical'
        ? runtime.compatibleRouteRepo.getRoute(input.pinSource.routeProvenanceId)
        : null
      if (input.pinSource.kind === 'historical' && !sourceRoute) throw new Error('Historical compatible route is unavailable.')
      const providerInstanceId = sourceRoute?.providerInstanceId ?? input.route.providerInstanceId
      const modelId = sourceRoute?.modelId ?? input.route.modelId
      if (sourceRoute && (input.route.providerInstanceId !== providerInstanceId || input.route.modelId !== modelId)) {
        throw new Error('Historical compatible route selection cannot be overridden.')
      }
      const provider = runtime.compatibleProviderRepo.getProvider(providerInstanceId)
      if (!provider) throw new Error('Compatible provider is unavailable for a new route.')
      const endpoint = sourceRoute
        ? runtime.compatibleProviderRepo.getEndpointRevision(sourceRoute.endpointRevisionId)
        : runtime.compatibleProviderRepo.getEndpointRevision(input.pinSource.kind === 'selected' ? input.pinSource.pins.endpointRevisionId : '')
      if (!endpoint) throw new Error('Compatible endpoint revision is unavailable.')
      if (input.pinSource.kind === 'selected') {
        const pins = input.pinSource.pins
        if (endpoint.providerInstanceId !== providerInstanceId || endpoint.credentialVersionRef !== pins.credentialVersionRef ||
            endpoint.requestProfileId !== pins.requestProfileId || endpoint.requestProfileVersion !== pins.requestProfileVersion ||
            endpoint.responseProfileId !== pins.responseProfileId || endpoint.responseProfileVersion !== pins.responseProfileVersion) {
          throw new Error('Selected compatible endpoint pins do not match the immutable endpoint revision.')
        }
      }
      if (endpoint.credentialVersionRef) {
        const credential = runtime.compatibleProviderRepo.getCredentialDescriptor(endpoint.credentialVersionRef)
        if (!credential || credential.providerInstanceId !== providerInstanceId) {
          throw new Error('Compatible credential is unavailable for a new route.')
        }
      }
      const requestProfile = runtime.compatibleProfileRepo.getRequestProfile(endpoint.requestProfileId, endpoint.requestProfileVersion)
      const responseProfile = runtime.compatibleProfileRepo.getResponseProfile(endpoint.responseProfileId, endpoint.responseProfileVersion)
      if (!requestProfile || !responseProfile) throw new Error('Compatible endpoint profile is unavailable.')
      const reasoning = runtime.compatibleProfileRepo.getReasoningMapping(responseProfile.reasoningMappingId, responseProfile.reasoningMappingVersion)
      const inlinePolicy = runtime.compatibleProfileRepo.getInlinePolicy(responseProfile.inlinePolicyId, responseProfile.inlinePolicyVersion)
      if (!reasoning || !inlinePolicy) throw new Error('Compatible response mapping is unavailable.')
      if (input.pinSource.kind === 'selected') {
        const pins = input.pinSource.pins
        if (reasoning.mappingId !== pins.reasoningMappingId || reasoning.version !== pins.reasoningMappingVersion ||
            inlinePolicy.inlinePolicyId !== pins.inlinePolicyId || inlinePolicy.version !== pins.inlinePolicyVersion) {
          throw new Error('Selected compatible response pins do not match the immutable response profile.')
        }
      }

      const question = rt.messageRepo.append({
        convoId: branch.convoId,
        role: 'user',
        body: turn.userBody,
        ...(turn.userMeta !== undefined ? { meta: turn.userMeta } : {}),
        parentId: branch.headMessageId,
        createdAt: input.route.createdAtMs,
      })
      const questionDoc = rt.loadMessageSearchDoc(question.id)
      if (questionDoc) rt.searchRepo.upsertDoc(questionDoc)
      if (turn.attachConversationDraft === true) {
        rt.conversationAttachmentService.attachDraftToMessage({
          conversationId: branch.convoId,
          messageId: question.id,
          ...(turn.sentAssetIds && turn.sentAssetIds.length > 0 ? { sentAssetIds: turn.sentAssetIds } : {}),
          ...(turn.dfcAttachmentSendSnapshots && turn.dfcAttachmentSendSnapshots.length > 0
            ? { dfcAttachmentSendSnapshots: turn.dfcAttachmentSendSnapshots }
            : {}),
        })
      }
      const assistant = rt.messageRepo.append({
        convoId: branch.convoId,
        role: 'assistant',
        body: '',
        parentId: question.id,
        status: 'streaming',
        createdAt: input.route.createdAtMs,
      })
      const route = runtime.compatibleRouteRepo.createRouteWithChoices({
        ...input.route,
        providerInstanceId,
        modelId,
        requestMessageId: question.id,
        protocolKey: 'openai_chat_compatible',
        endpointRevisionId: endpoint.endpointRevisionId,
        credentialVersionRef: endpoint.credentialVersionRef,
        requestProfileId: requestProfile.requestProfileId,
        requestProfileVersion: requestProfile.version,
        responseProfileId: responseProfile.responseProfileId,
        responseProfileVersion: responseProfile.version,
        reasoningMappingId: reasoning.mappingId,
        reasoningMappingVersion: reasoning.version,
        reasoningMode: reasoning.mode,
        inlinePolicyId: inlinePolicy.inlinePolicyId,
        inlinePolicyVersion: inlinePolicy.version,
        state: 'prepared',
      }, [{
        routeProvenanceId: input.route.routeProvenanceId,
        choiceIndex: 0,
        messageId: assistant.id,
        createdAtMs: input.route.createdAtMs,
      }])
      rt.branchRepo.setChoice(turn.branchId, question.id, assistant.id)
      rt.branchRepo.setHead(turn.branchId, assistant.id)
      const availability = runtime.compatibleRouteRepo.getAvailability(route.routeProvenanceId)
      if (!availability) throw new Error('Compatible route availability is unavailable.')
      return {
        route,
        choice: runtime.compatibleRouteRepo.listChoices(route.routeProvenanceId)[0],
        convoId: branch.convoId,
        branchId: turn.branchId,
        questionId: question.id,
        questionSeq: question.seq,
        assistantId: assistant.id,
        assistantSeq: assistant.seq,
        availability,
      }
    })
    const result = txn()
    rt.emitActivityUpdated(result.convoId)
    return result
  })
  register('compatibleRoute.get', (raw) => {
    const input = z.object({ routeProvenanceId: routeProvenanceIdSchema }).strict().parse(raw)
    return runtime.compatibleRouteRepo.getRoute(input.routeProvenanceId)
  })
  register('compatibleRoute.getPreparedTurn', (raw) => {
    const input = z.object({
      routeProvenanceId: routeProvenanceIdSchema,
      branchId: z.string().min(1), questionId: z.string().min(1), assistantId: z.string().min(1),
    }).strict().parse(raw)
    const route = runtime.compatibleRouteRepo.getRoute(input.routeProvenanceId)
    const branch = rt.branchRepo.get(input.branchId)
    const choice = runtime.compatibleRouteRepo.listChoices(input.routeProvenanceId)[0]
    const question = runtime.db.prepare('SELECT convo_id AS convoId, role, seq FROM message WHERE id = ?').get(input.questionId) as any
    const assistant = runtime.db.prepare('SELECT convo_id AS convoId, role, parent_id AS parentId, status, seq FROM message WHERE id = ?').get(input.assistantId) as any
    if (!route || route.state !== 'prepared' || route.requestMessageId !== input.questionId ||
        !branch?.convoId || branch.deletedAt != null || branch.headMessageId !== input.assistantId ||
        !choice || choice.choiceIndex !== 0 || choice.messageId !== input.assistantId ||
        !question || question.convoId !== branch.convoId || question.role !== 'user' ||
        !assistant || assistant.convoId !== branch.convoId || assistant.role !== 'assistant' ||
        assistant.parentId !== input.questionId || assistant.status !== 'streaming') {
      throw new Error('Compatible prepared turn is invalid.')
    }
    const availability = runtime.compatibleRouteRepo.getAvailability(input.routeProvenanceId)
    if (!availability) throw new Error('Compatible route availability is unavailable.')
    return {
      route, choice, convoId: branch.convoId, branchId: input.branchId,
      questionId: input.questionId, questionSeq: question.seq,
      assistantId: input.assistantId, assistantSeq: assistant.seq, availability,
    }
  })
  register('compatibleRoute.prepareExistingHistorical', (raw) => {
    const input = compatibleRoutePrepareExistingHistoricalSchema.parse(raw)
    const txn = runtime.db.transaction(() => {
      const source = runtime.compatibleRouteRepo.getRoute(input.sourceRouteProvenanceId)
      if (!source) throw new Error('Historical compatible route is unavailable.')
      const branch = rt.branchRepo.get(input.branchId)
      if (!branch?.convoId || branch.deletedAt != null || branch.headMessageId !== input.assistantId) {
        throw new Error('Historical compatible branch head is invalid.')
      }
      const question = runtime.db.prepare(`SELECT id, convo_id AS convoId, role, seq FROM message WHERE id = ?`).get(input.questionId) as { id: string; convoId: string; role: string; seq: number } | undefined
      const assistant = runtime.db.prepare(`SELECT id, convo_id AS convoId, role, parent_id AS parentId, status, seq FROM message WHERE id = ?`).get(input.assistantId) as { id: string; convoId: string; role: string; parentId: string | null; status: string; seq: number } | undefined
      if (!question || question.role !== 'user' || question.convoId !== branch.convoId || !assistant || assistant.role !== 'assistant' ||
          assistant.convoId !== branch.convoId || assistant.parentId !== question.id || assistant.status !== 'streaming') {
        throw new Error('Historical compatible message pair is invalid.')
      }
      const route = runtime.compatibleRouteRepo.createRouteWithChoices({
        routeProvenanceId: input.route.routeProvenanceId,
        requestId: input.route.requestId,
        requestMessageId: question.id,
        protocolKey: 'openai_chat_compatible',
        providerInstanceId: source.providerInstanceId,
        modelId: source.modelId,
        endpointRevisionId: source.endpointRevisionId,
        credentialVersionRef: source.credentialVersionRef,
        requestProfileId: source.requestProfileId,
        requestProfileVersion: source.requestProfileVersion,
        responseProfileId: source.responseProfileId,
        responseProfileVersion: source.responseProfileVersion,
        reasoningMappingId: source.reasoningMappingId,
        reasoningMappingVersion: source.reasoningMappingVersion,
        reasoningMode: source.reasoningMode,
        inlinePolicyId: source.inlinePolicyId,
        inlinePolicyVersion: source.inlinePolicyVersion,
        state: 'prepared',
        createdAtMs: input.route.createdAtMs,
      }, [{
        routeProvenanceId: input.route.routeProvenanceId,
        choiceIndex: 0,
        messageId: assistant.id,
        createdAtMs: input.route.createdAtMs,
      }])
      const availability = runtime.compatibleRouteRepo.getAvailability(route.routeProvenanceId)
      if (!availability) throw new Error('Compatible route availability is unavailable.')
      return {
        route,
        choice: runtime.compatibleRouteRepo.listChoices(route.routeProvenanceId)[0],
        convoId: branch.convoId,
        branchId: input.branchId,
        questionId: question.id,
        questionSeq: question.seq,
        assistantId: assistant.id,
        assistantSeq: assistant.seq,
        availability,
      }
    })
    const result = txn()
    rt.emitActivityUpdated(result.convoId)
    return result
  })
  register('compatibleRoute.addChoiceMessage', (raw) => {
    const input = compatibleRouteAdditionalChoiceSchema.parse(raw)
    const txn = runtime.db.transaction(() => {
      const route = runtime.compatibleRouteRepo.getRoute(input.routeProvenanceId)
      if (!route) throw new Error('Compatible route provenance is unavailable.')
      const existing = runtime.compatibleRouteRepo.listChoices(input.routeProvenanceId)
        .find((choice) => choice.choiceIndex === input.choiceIndex)
      if (existing) {
        const row = runtime.db.prepare(`SELECT seq FROM message WHERE id = ?`).get(existing.messageId) as { seq: number }
        return { choice: existing, messageId: existing.messageId, messageSeq: row.seq }
      }
      if (route.state !== 'prepared' && route.state !== 'streaming') {
        throw new Error('Cannot add a choice to a terminal compatible route.')
      }
      const choices = runtime.compatibleRouteRepo.listChoices(input.routeProvenanceId)
      if (!choices.some((choice) => choice.choiceIndex === input.choiceIndex - 1)) {
        throw new Error('Compatible route choice indexes must be contiguous.')
      }
      const requestMessage = runtime.db.prepare(`SELECT convo_id FROM message WHERE id = ?`).get(route.requestMessageId) as { convo_id: string } | undefined
      if (!requestMessage) throw new Error('Compatible route request message is unavailable.')
      const assistant = rt.messageRepo.append({
        convoId: requestMessage.convo_id,
        role: 'assistant',
        body: '',
        parentId: route.requestMessageId,
        status: 'streaming',
        createdAt: input.createdAtMs,
      })
      const choice = runtime.compatibleRouteRepo.addChoice({
        ...input,
        messageId: assistant.id,
      })
      return { choice, messageId: assistant.id, messageSeq: assistant.seq }
    })
    return txn()
  })
  register('compatibleRoute.prepareChoices', (raw) => {
    const input = compatibleRoutePrepareChoicesSchema.parse(raw)
    const txn = runtime.db.transaction(() => {
      const route = runtime.compatibleRouteRepo.getRoute(input.routeProvenanceId)
      if (!route) throw new Error('Compatible route provenance is unavailable.')
      if (route.state !== 'prepared') throw new Error('Compatible route choices can only be prepared before streaming.')
      const existing = runtime.compatibleRouteRepo.listChoices(input.routeProvenanceId)
      if (existing.length > input.choiceCount) throw new Error('Compatible route already has more choices than requested.')
      for (let choiceIndex = existing.length; choiceIndex < input.choiceCount; choiceIndex += 1) {
        const requestMessage = runtime.db.prepare(`SELECT convo_id FROM message WHERE id = ?`).get(route.requestMessageId) as { convo_id: string } | undefined
        if (!requestMessage) throw new Error('Compatible route request message is unavailable.')
        const assistant = rt.messageRepo.append({
          convoId: requestMessage.convo_id,
          role: 'assistant',
          body: '',
          parentId: route.requestMessageId,
          status: 'streaming',
          createdAt: input.createdAtMs,
        })
        runtime.compatibleRouteRepo.addChoice({
          routeProvenanceId: input.routeProvenanceId,
          choiceIndex,
          messageId: assistant.id,
          createdAtMs: input.createdAtMs,
        })
      }
      return runtime.compatibleRouteRepo.listChoices(input.routeProvenanceId)
    })
    return txn()
  })
  register('compatibleRoute.listChoices', (raw) => {
    const input = z.object({ routeProvenanceId: routeProvenanceIdSchema }).strict().parse(raw)
    return runtime.compatibleRouteRepo.listChoices(input.routeProvenanceId)
  })
  register('compatibleRoute.transition', (raw) => {
    const input = compatibleRouteTransitionSchema.parse(raw)
    const txn = runtime.db.transaction(() => {
      const before = runtime.compatibleRouteRepo.getRoute(input.routeProvenanceId)
      const route = runtime.compatibleRouteRepo.transition(input)
      if (before?.state !== route.state && route.terminalAtMs !== null) {
        runtime.db.prepare(`
          UPDATE message
          SET status = @status
          WHERE id IN (
            SELECT message_id FROM compatible_route_choices WHERE route_provenance_id = @routeProvenanceId
          )
        `).run({
          routeProvenanceId: route.routeProvenanceId,
          status: route.state === 'completed' ? 'final' : 'error',
        })
      }
      return route
    })
    return txn()
  })
  register('compatibleRoute.recoverIncomplete', (raw) => {
    const input = z.object({ atMs: z.number().int().nonnegative() }).strict().parse(raw)
    const txn = runtime.db.transaction(() => {
      const projectedRouteIds = runtime.compatibleTurnProjectionRepo.recoverIncomplete(input.atMs)
      runtime.db.prepare(`
        UPDATE message
        SET status = 'error'
        WHERE id IN (
          SELECT choice_record.message_id
          FROM compatible_route_choices choice_record
          JOIN compatible_route_provenance route
            ON route.route_provenance_id = choice_record.route_provenance_id
          WHERE route.state IN ('prepared', 'streaming')
        )
      `).run()
      return { recovered: projectedRouteIds.length + runtime.compatibleRouteRepo.recoverIncomplete(input.atMs), projectedRouteIds }
    })
    return txn()
  })
  register('compatibleRoute.resolveHistorical', (raw) => {
    const input = compatibleHistoricalRouteLookupSchema.parse(raw)
    const route = input.kind === 'request_message'
      ? runtime.compatibleRouteRepo.getRouteByRequestMessageId(input.messageId)
      : input.kind === 'choice_message'
        ? runtime.compatibleRouteRepo.getRouteByChoiceMessageId(input.messageId)
        : runtime.compatibleRouteRepo.getRoute(input.routeProvenanceId)
    if (!route) return null
    return {
      route,
      choices: runtime.compatibleRouteRepo.listChoices(route.routeProvenanceId),
      availability: runtime.compatibleRouteRepo.getAvailability(route.routeProvenanceId),
    }
  })
  register('compatibleTool.saveCall', (raw) => runtime.compatibleToolRepo.saveCall(SaveCompatibleToolCallInputSchema.parse(raw)))
  register('compatibleTool.saveCalls', (raw) => runtime.compatibleToolRepo.saveCalls(z.array(SaveCompatibleToolCallInputSchema).min(1).max(256).parse(raw)))
  register('compatibleTool.getCall', (raw) => {
    const input = z.object({
      messageId: compatibleMessageIdSchema,
      choiceIndex: compatibleChoiceIndexSchema,
      toolIndex: z.number().int().nonnegative().max(1024),
    }).strict().parse(raw)
    return runtime.compatibleToolRepo.getCall(input.messageId, input.choiceIndex, input.toolIndex)
  })
  register('compatibleTool.listCalls', (raw) => {
    const input = z.object({
      routeProvenanceId: routeProvenanceIdSchema,
      choiceIndex: compatibleChoiceIndexSchema.optional(),
    }).strict().parse(raw)
    return runtime.compatibleToolRepo.listCalls(input.routeProvenanceId, input.choiceIndex)
  })
  register('compatibleTool.createResult', (raw) => runtime.compatibleToolRepo.createResult(CreateCompatibleToolResultInputSchema.parse(raw)))
  register('compatibleTool.getResult', (raw) => {
    const input = z.object({ toolResultMessageId: compatibleMessageIdSchema }).strict().parse(raw)
    return runtime.compatibleToolRepo.getResult(input.toolResultMessageId)
  })
  register('compatibleTool.listResults', (raw) => {
    const input = z.object({ routeProvenanceId: routeProvenanceIdSchema }).strict().parse(raw)
    return runtime.compatibleToolRepo.listResults(input.routeProvenanceId)
  })
  register('compatibleTool.loadChoiceChain', (raw) => {
    const input = z.object({ routeProvenanceId: routeProvenanceIdSchema, choiceIndex: compatibleChoiceIndexSchema }).strict().parse(raw)
    return runtime.compatibleToolRepo.loadChoiceChain(input.routeProvenanceId, input.choiceIndex)
  })

  register('compatibleDiagnostics.upsertDiscoveredField', (raw) => runtime.compatibleDiagnosticsRepo.upsertDiscoveredField(UpsertCompatibleDiscoveredFieldInputSchema.parse(raw)))
  register('compatibleDiagnostics.getDiscoveredField', (raw) => {
    const input = z.object({
      providerInstanceId: providerInstanceIdSchema,
      responseProfileId: responseProfileIdSchema,
      profileVersion: compatibleProfileVersionSchema,
      streamPath: z.string().trim().min(1).max(1024),
    }).strict().parse(raw)
    return runtime.compatibleDiagnosticsRepo.getDiscoveredField(input.providerInstanceId, input.responseProfileId, input.profileVersion, input.streamPath)
  })
  register('compatibleDiagnostics.listDiscoveredFields', (raw) => runtime.compatibleDiagnosticsRepo.listDiscoveredFields(raw))
  register('compatibleDiagnostics.setDiscoveredFieldState', (raw) => runtime.compatibleDiagnosticsRepo.setDiscoveredFieldState(raw))
  register('compatibleDiagnostics.createRawExtensions', (raw) => runtime.compatibleDiagnosticsRepo.createRawExtensionRecords(z.array(CreateCompatibleRawExtensionRecordInputSchema).max(256).parse(raw)))
  register('compatibleDiagnostics.listRawExtensions', (raw) => {
    const input = z.object({ messageId: compatibleMessageIdSchema }).strict().parse(raw)
    return runtime.compatibleDiagnosticsRepo.listRawExtensionRecords(input.messageId)
  })
  register('compatibleDiagnostics.purgeExpiredRawExtensions', (raw) => runtime.compatibleDiagnosticsRepo.purgeExpiredRawExtensionRecords(raw))
  register('compatibleReasoning.saveChoice', (raw) => runtime.compatibleReasoningRepo.save(SaveCompatibleReasoningChoiceInputSchema.parse(raw)))
  register('compatibleReasoning.getChoice', (raw) => {
    const input = z.object({ routeProvenanceId: routeProvenanceIdSchema, choiceIndex: compatibleChoiceIndexSchema }).strict().parse(raw)
    return runtime.compatibleReasoningRepo.get(input.routeProvenanceId, input.choiceIndex)
  })
  register('compatibleProjection.saveStreaming', (raw) => {
    const input = z.object({ projection: compatibleDurableChoiceProjectionSchema, updatedAtMs: z.number().int().nonnegative() }).strict().parse(raw)
    return runtime.compatibleTurnProjectionRepo.saveStreaming(input.projection, input.updatedAtMs)
  })
  register('compatibleProjection.finalizeRoute', (raw) => {
    const input = z.object({ routeProvenanceId: routeProvenanceIdSchema, status: z.enum(['completed', 'failed', 'aborted', 'interrupted']), atMs: z.number().int().nonnegative(), choices: z.array(compatibleDurableChoiceProjectionSchema).min(1).max(1025) }).strict().parse(raw)
    return runtime.compatibleTurnProjectionRepo.finalizeRoute(input)
  })
  register('compatibleProjection.finalizeBundle', (raw) => {
    const input = z.object({
      routeProvenanceId: routeProvenanceIdSchema,
      status: z.enum(['completed', 'failed', 'aborted', 'interrupted']),
      atMs: z.number().int().nonnegative(),
      choices: z.array(compatibleDurableChoiceProjectionSchema).min(1).max(1025),
      tools: z.array(SaveCompatibleToolCallInputSchema).max(256),
      reasoning: z.array(SaveCompatibleReasoningChoiceInputSchema).max(1025),
      rawExtensions: z.array(CreateCompatibleRawExtensionRecordInputSchema).max(256),
      discovery: z.array(UpsertCompatibleDiscoveredFieldInputSchema).max(256),
    }).strict().parse(raw)
    const txn = runtime.db.transaction(() => {
      for (const field of input.discovery) runtime.compatibleDiagnosticsRepo.upsertDiscoveredField(field)
      if (input.rawExtensions.length > 0) runtime.compatibleDiagnosticsRepo.createRawExtensionRecords(input.rawExtensions)
      if (input.tools.length > 0) runtime.compatibleToolRepo.saveCalls(input.tools)
      for (const reasoning of input.reasoning) runtime.compatibleReasoningRepo.save(reasoning)
      return runtime.compatibleTurnProjectionRepo.finalizeRoute(input)
    })
    return txn()
  })
  register('compatibleProjection.loadChoice', (raw) => {
    const input = z.object({ routeProvenanceId: routeProvenanceIdSchema, choiceIndex: compatibleChoiceIndexSchema }).strict().parse(raw)
    return runtime.compatibleTurnProjectionRepo.loadChoice(input.routeProvenanceId, input.choiceIndex)
  })
  register('compatibleProjection.loadRoute', (raw) => {
    const input = z.object({ routeProvenanceId: routeProvenanceIdSchema }).strict().parse(raw)
    return runtime.compatibleTurnProjectionRepo.loadRoute(input.routeProvenanceId)
  })
  register('compatibleProjection.loadBundle', (raw) => {
    const input = z.object({ routeProvenanceId: routeProvenanceIdSchema }).strict().parse(raw)
    return runtime.compatibleTurnProjectionRepo.loadBundle(input.routeProvenanceId)
  })
  register('compatibleProjection.recoverIncomplete', (raw) => {
    const input = z.object({ atMs: z.number().int().nonnegative() }).strict().parse(raw)
    return runtime.compatibleTurnProjectionRepo.recoverIncomplete(input.atMs)
  })
  register('compatibleReset.census', (raw) => {
    z.object({}).strict().parse(raw ?? {})
    return resetCensus()
  })
  register('compatibleReset.execute', (raw) => {
    z.object({ confirm: z.literal('delete_incompatible_compatible_state') }).strict().parse(raw)
    const before = resetCensus()
    const txn = runtime.db.transaction(() => {
      for (const table of ['message_reasoning_display_blocks', 'message_provider_native_contents', 'model_favorites', 'model_recents', 'catalog_models', 'catalog_scope_meta', 'providers'] as const) runtime.db.prepare(`DELETE FROM ${table} WHERE provider_key = ?`).run(legacyProviderKeys[0])
      for (const table of ['model_data', 'model_catalog'] as const) runtime.db.prepare(`DELETE FROM ${table} WHERE router_source = ?`).run(legacyProviderKeys[0])
      return resetCensus()
    })
    return Object.freeze({ before, after: txn() })
  })
}
