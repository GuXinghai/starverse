import { randomUUID } from 'node:crypto'
import type { DbMethod } from '../../infra/db/dbMethodsRegistry'
import type {
  CompatibleEndpointRevision,
  CompatibleRequestFieldMapping,
  CompatibleRequestProfile,
  CompatibleRequestMessage,
  CompatibleRequestFieldSettings,
  CompatibleReasoningControlState,
  CompatibleJsonValue,
  CompatibleWireEvent,
  CompatiblePreparedTurnResult,
  CompatibleReasoningMapping,
  CompatibleInlineReasoningPolicy,
  CredentialVersionRef,
} from '../../src/shared/provider/openai-chat-compatible'
import {
  buildCompatibleChatRequest,
  CompatibleSseWireParser,
  decodeCompatibleNonStreamResponse,
  CompatibleChatResponseCoordinator,
  formatCompatibleOpaqueId,
  aggregateCompatibleDiscovery,
  CompatibleHistoricalRouteLookup,
} from '../../src/shared/provider/openai-chat-compatible'
import type { CompatibleDurableChoiceProjection } from '../../src/shared/provider/openai-chat-compatible/display'
import { compatibleNetworkErrorFromHttpStatus, buildCompatibleNetworkError } from '../../src/shared/network/compatibleNetworkError'
import type { CompatibleCredentialService } from '../credentials/compatibleCredentialService'
import {
  COMPATIBLE_NON_STREAM_RESPONSE_MAX_BYTES,
  iterateCompatibleResponseChunks,
  readCompatibleResponseBytes,
  type CompatibleProviderTransport,
} from '../net/compatibleProviderTransport'
import type { CompatibleRequestRegistry } from '../net/compatibleRequestRegistry'
import type { CompatibleRouteCoordinator } from './compatibleRouteCoordinator'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'

const HEADERS_TIMEOUT_MS = 30_000
const IDLE_TIMEOUT_MS = 60_000
const OVERALL_TIMEOUT_MS = 30 * 60_000

type DbCaller = Readonly<{ call: (method: DbMethod, params?: unknown) => Promise<unknown> }>

export type CompatibleChatStartInput = Readonly<{
  requestId: string
  ownerWebContentsId: number
  selection: Readonly<{ providerInstanceId: string; modelId: string }> | Readonly<{
    providerInstanceId: string; modelId: string; endpointRevisionId: string; credentialVersionRef: string | null
    requestProfileId: string; requestProfileVersion: number; responseProfileId: string; responseProfileVersion: number
    reasoningMappingId: string; reasoningMappingVersion: number; inlinePolicyId: string; inlinePolicyVersion: number
  }>
  turn: Readonly<{ branchId: string; userBody: string; userMeta?: Record<string, unknown> | null }>
  messages: readonly CompatibleRequestMessage[]
  stream: boolean
  fields?: CompatibleRequestFieldSettings
  reasoningControls?: CompatibleReasoningControlState
  extraBody?: CompatibleJsonValue
  historicalSource?: Readonly<
    | { kind: 'request_message'; messageId: string }
    | { kind: 'choice_message'; messageId: string }
    | { kind: 'route'; routeProvenanceId: string }
  >
  existingHistoricalTurn?: Readonly<{ sourceRouteProvenanceId: string; branchId: string; questionId: string; assistantId: string }>
  existingPreparedTurn?: Readonly<{ routeProvenanceId: string; branchId: string; questionId: string; assistantId: string }>
}>

export type CompatibleChatSelectedPins = Extract<CompatibleChatStartInput['selection'], { endpointRevisionId: string }>
export type CompatibleChatPreflightOutcome =
  | Readonly<{ ok: true; route: Readonly<{
      routeProvenanceId: string; requestId: string; providerInstanceId: string; modelId: string; createdAtMs: number
    }> }>
  | Readonly<{ ok: false; code: string }>

export type CompatibleChatRuntimeService = Readonly<{
  preflight: (selection: CompatibleChatSelectedPins) => Promise<CompatibleChatPreflightOutcome>
  start: (input: CompatibleChatStartInput, onEvent: (event: CompatibleWireEvent) => void, onPrepared?: (prepared: CompatiblePreparedTurnResult) => void) => Promise<CompatiblePreparedTurnResult>
  abort: (requestId: string, ownerWebContentsId: number) => boolean
  abortOwner: (ownerWebContentsId: number) => number
  abortAll: () => number
  resolveHistorical: (source: CompatibleHistoricalRouteLookup) => ReturnType<CompatibleRouteCoordinator['resolveHistorical']>
}>

export function createCompatibleChatRuntimeService(input: Readonly<{
  db: DbCaller
  credentials: CompatibleCredentialService
  transport: CompatibleProviderTransport
  requests: CompatibleRequestRegistry
  routes: CompatibleRouteCoordinator
  rawGenerationRequestStore?: RawGenerationRequestStore
  nowMs?: () => number
}>): CompatibleChatRuntimeService {
  const nowMs = input.nowMs ?? Date.now
  return Object.freeze({
    preflight: async (selection) => {
      const provider = await input.db.call('compatibleProvider.get', {
        providerInstanceId: selection.providerInstanceId,
      }) as Readonly<{ status?: string }> | null
      if (!provider || provider.status === 'deleted') return { ok: false as const, code: 'provider_deleted' }
      if (provider.status !== 'active') return { ok: false as const, code: 'provider_disabled' }
      const endpoint = await input.db.call('compatibleEndpoint.getRevision', {
        endpointRevisionId: selection.endpointRevisionId,
      }) as CompatibleEndpointRevision | null
      if (!endpoint || endpoint.providerInstanceId !== selection.providerInstanceId ||
          endpoint.credentialVersionRef !== selection.credentialVersionRef ||
          endpoint.requestProfileId !== selection.requestProfileId || endpoint.requestProfileVersion !== selection.requestProfileVersion ||
          endpoint.responseProfileId !== selection.responseProfileId || endpoint.responseProfileVersion !== selection.responseProfileVersion) {
        return { ok: false as const, code: 'compatible_selection_pins_stale' }
      }
      if (selection.credentialVersionRef) {
        const descriptor = await input.db.call('compatibleCredential.getDescriptor', {
          credentialVersionRef: selection.credentialVersionRef,
        }) as Readonly<{ providerInstanceId?: string; deletedAtMs?: number | null }> | null
        if (!descriptor || descriptor.providerInstanceId !== selection.providerInstanceId || descriptor.deletedAtMs != null ||
            !input.credentials.has(selection.credentialVersionRef as CredentialVersionRef)) {
          return { ok: false as const, code: 'credential_missing' }
        }
      }
      const requestBundle = await input.db.call('compatibleProfile.getRequestBundle', {
        requestProfileId: selection.requestProfileId,
        version: selection.requestProfileVersion,
      }) as Readonly<{ profile?: Readonly<{ requestProfileId?: string; version?: number }> }> | null
      const responseProfile = await input.db.call('compatibleProfile.getResponse', {
        responseProfileId: selection.responseProfileId,
        version: selection.responseProfileVersion,
      }) as Readonly<{
        responseProfileId?: string; version?: number
        reasoningMappingId?: string; reasoningMappingVersion?: number
        inlinePolicyId?: string; inlinePolicyVersion?: number
      }> | null
      if (!requestBundle?.profile || requestBundle.profile.requestProfileId !== selection.requestProfileId ||
          requestBundle.profile.version !== selection.requestProfileVersion || !responseProfile ||
          responseProfile.responseProfileId !== selection.responseProfileId || responseProfile.version !== selection.responseProfileVersion ||
          responseProfile.reasoningMappingId !== selection.reasoningMappingId || responseProfile.reasoningMappingVersion !== selection.reasoningMappingVersion ||
          responseProfile.inlinePolicyId !== selection.inlinePolicyId || responseProfile.inlinePolicyVersion !== selection.inlinePolicyVersion) {
        return { ok: false as const, code: 'compatible_selection_profiles_stale' }
      }
      const reasoningMapping = await input.db.call('compatibleProfile.getReasoningMapping', {
        mappingId: selection.reasoningMappingId,
        version: selection.reasoningMappingVersion,
      }) as Readonly<{ mappingId?: string; version?: number }> | null
      const inlinePolicy = await input.db.call('compatibleProfile.getInlinePolicy', {
        inlinePolicyId: selection.inlinePolicyId,
        version: selection.inlinePolicyVersion,
      }) as Readonly<{ inlinePolicyId?: string; version?: number }> | null
      if (!reasoningMapping || reasoningMapping.mappingId !== selection.reasoningMappingId || reasoningMapping.version !== selection.reasoningMappingVersion ||
          !inlinePolicy || inlinePolicy.inlinePolicyId !== selection.inlinePolicyId || inlinePolicy.version !== selection.inlinePolicyVersion) {
        return { ok: false as const, code: 'compatible_selection_profiles_stale' }
      }
      const strictProxy = await input.db.call('settings.getNetworkProxySettingsStrict') as Readonly<{ value: unknown }>
      const transportPreflight = await input.transport.preflight({
        endpoint,
        operation: 'chat_completions',
        proxySettings: strictProxy.value,
      })
      return transportPreflight.ok
        ? {
            ok: true as const,
            route: {
              routeProvenanceId: formatCompatibleOpaqueId('route', randomUUID()),
              requestId: `ocp_request_${randomUUID()}`,
              providerInstanceId: selection.providerInstanceId,
              modelId: selection.modelId,
              createdAtMs: nowMs(),
            },
          }
        : { ok: false as const, code: transportPreflight.error.code }
    },
    start: async (command, onEvent, onPrepared) => {
      const prepared = command.existingPreparedTurn
        ? await input.routes.usePreparedTurn(command.existingPreparedTurn)
        : command.existingHistoricalTurn
        ? await input.routes.prepareExistingHistoricalTurn(command.existingHistoricalTurn)
        : command.historicalSource
        ? await input.routes.prepareHistoricalTurn({ source: command.historicalSource, turn: command.turn })
        : await input.routes.prepareTurn({ selection: command.selection, turn: command.turn })
      if (!prepared.ok) throw new Error(`compatible_route_blocked:${prepared.code}`)
      const value = prepared.value
      onPrepared?.(value)
      let handle
      let projector: CompatibleChatResponseCoordinator | null = null
      let terminalFinalized = false
      let lastSequence = 0
      const terminalAttempt: { value: Readonly<{ choices: readonly CompatibleDurableChoiceProjection[]; bundle: Awaited<ReturnType<typeof buildTerminalBundle>> }> | null } = { value: null }
      try {
        const endpoint = await input.db.call('compatibleEndpoint.getRevision', {
          endpointRevisionId: value.route.endpointRevisionId,
        }) as CompatibleEndpointRevision | null
        if (!endpoint || endpoint.providerInstanceId !== value.route.providerInstanceId) throw new Error('compatible_endpoint_revision_missing')
        const bundle = await input.db.call('compatibleProfile.getRequestBundle', {
          requestProfileId: value.route.requestProfileId,
          version: value.route.requestProfileVersion,
        }) as Readonly<{ profile: CompatibleRequestProfile; mappings: readonly CompatibleRequestFieldMapping[] }> | null
        if (!bundle || bundle.profile.requestProfileId !== value.route.requestProfileId || bundle.profile.version !== value.route.requestProfileVersion) {
          throw new Error('compatible_request_profile_missing')
        }
        const reasoningMapping = await input.db.call('compatibleProfile.getReasoningMapping', {
          mappingId: value.route.reasoningMappingId,
          version: value.route.reasoningMappingVersion,
        }) as CompatibleReasoningMapping | null
        if (!reasoningMapping || reasoningMapping.mappingId !== value.route.reasoningMappingId || reasoningMapping.version !== value.route.reasoningMappingVersion) {
          throw new Error('compatible_reasoning_mapping_missing')
        }
        const inlinePolicy = await input.db.call('compatibleProfile.getInlinePolicy', {
          inlinePolicyId: value.route.inlinePolicyId,
          version: value.route.inlinePolicyVersion,
        }) as CompatibleInlineReasoningPolicy | null
        if (!inlinePolicy || inlinePolicy.inlinePolicyId !== value.route.inlinePolicyId || inlinePolicy.version !== value.route.inlinePolicyVersion) {
          throw new Error('compatible_inline_policy_missing')
        }
        const strictProxy = await input.db.call('settings.getNetworkProxySettingsStrict') as Readonly<{ value: unknown }>
        const transportPreflight = await input.transport.preflight({
          endpoint,
          operation: 'chat_completions',
          proxySettings: strictProxy.value,
        })
        if (!transportPreflight.ok) throw transportPreflight.error
        const built = buildCompatibleChatRequest({
          modelId: value.route.modelId,
          messages: command.messages,
          stream: command.stream,
          profile: bundle.profile.config,
          requestMappings: bundle.mappings.map((mapping) => mapping.config),
          ...(command.fields ? { fields: command.fields } : {}),
          ...(command.reasoningControls ? { reasoningControls: command.reasoningControls } : {}),
          ...(command.extraBody !== undefined ? { extraBody: command.extraBody } : {}),
        })
        const choices = await input.db.call('compatibleRoute.prepareChoices', {
          routeProvenanceId: value.route.routeProvenanceId,
          choiceCount: built.choiceCount,
          createdAtMs: nowMs(),
        }) as readonly Readonly<{ choiceIndex: number; messageId: string }>[]
        const primaryAnswerRootId = choices.find((choice) => choice.choiceIndex === 0)?.messageId ?? choices[0]?.messageId
        if (primaryAnswerRootId) input.rawGenerationRequestStore?.tryPersist({
          operationId: command.requestId,
          answerRootId: primaryAnswerRootId,
          requestSequence: 1,
          providerId: 'openai_chat_compatible',
          modelId: value.route.modelId,
          branchId: command.turn.branchId,
        }, built.serialized)
        projector = new CompatibleChatResponseCoordinator({
          route: value.route,
          choices,
          reasoningMapping: reasoningMapping.config,
          inlinePolicy,
        })
        handle = input.requests.start({
          requestId: command.requestId,
          ownerWebContentsId: command.ownerWebContentsId,
          headersTimeoutMs: HEADERS_TIMEOUT_MS,
          overallTimeoutMs: OVERALL_TIMEOUT_MS,
        })
        await input.routes.transition({ routeProvenanceId: value.route.routeProvenanceId, targetState: 'streaming', atMs: nowMs() })
        const result = await input.transport.request({
          endpoint,
          operation: 'chat_completions',
          proxySettings: strictProxy.value,
          body: built.serialized,
          signal: handle.signal,
          ...(value.route.credentialVersionRef
            ? { resolveCredential: () => input.credentials.readForMain(value.route.credentialVersionRef!) }
            : {}),
        })
        if (!result.ok) throw result.error
        handle.markHeadersReceived()
        if (result.response.status < 200 || result.response.status >= 300) {
          await result.response.body?.cancel().catch(() => undefined)
          throw compatibleNetworkErrorFromHttpStatus(result.response.status)
        }
        let terminalOutcome: Extract<CompatibleWireEvent, { kind: 'terminal' }>['outcome'] | null = null
        const emit = async (event: CompatibleWireEvent) => {
          lastSequence = Math.max(lastSequence, event.sequence)
          if (event.kind === 'terminal') terminalOutcome = event.outcome
          const terminalBundle = event.kind === 'terminal'
            ? await buildTerminalBundle(input.db, projector!, value.route, nowMs())
            : null
          const projections = projector!.apply(event)
          if (event.kind === 'terminal') {
            const status = terminalProjectionStatus(projections)
            terminalAttempt.value = { choices: projections, bundle: terminalBundle! }
            await input.db.call('compatibleProjection.finalizeBundle', {
              routeProvenanceId: value.route.routeProvenanceId,
              status,
              atMs: nowMs(), choices: projections,
              tools: buildToolCalls(projections, nowMs()),
              reasoning: buildReasoning(projector!.reasoningStates(), value.route, nowMs()),
              ...terminalBundle,
            })
            terminalFinalized = true
          } else {
            for (const projection of projections) {
              await input.db.call('compatibleProjection.saveStreaming', { projection, updatedAtMs: nowMs() })
            }
          }
          onEvent(event)
        }
        if (command.stream) {
          const parser = new CompatibleSseWireParser({ expectedChoiceCount: built.choiceCount })
          for await (const chunk of iterateCompatibleResponseChunks(result.response, {
            signal: handle.signal,
            armIdleTimeout: () => handle!.armIdleTimeout(IDLE_TIMEOUT_MS),
            clearIdleTimeout: () => handle!.clearIdleTimeout(),
          })) for (const event of parser.push(chunk)) await emit(event)
          for (const event of parser.finish()) await emit(event)
        } else {
          const bytes = await readCompatibleResponseBytes(result.response, COMPATIBLE_NON_STREAM_RESPONSE_MAX_BYTES, handle.signal)
          for (const event of decodeCompatibleNonStreamResponse({ bytes, expectedChoiceCount: built.choiceCount })) await emit(event)
        }
        if (terminalOutcome !== 'done') throw new Error('compatible_response_terminal_failure')
        return value
      } catch (error) {
        const aborted = handle?.signal.aborted === true
        if (projector && !terminalFinalized) {
          const network = compatibleFailureEnvelope(error, aborted)
          const terminal: CompatibleWireEvent = Object.freeze({
            kind: 'terminal', source: 'stream', sequence: lastSequence + 1,
            outcome: aborted ? 'aborted' : 'error',
            ...(aborted ? {} : { error: { network, diagnostic: { category: 'lifecycle' as const } } }),
          })
          try {
            const terminalBundle = terminalAttempt.value?.bundle ?? await buildTerminalBundle(input.db, projector, value.route, nowMs())
            const projections = terminalAttempt.value
              ? terminalAttempt.value.choices.map((projection) => ({
                  ...projection,
                  status: aborted ? 'aborted' as const : 'failed' as const,
                  terminalCause: aborted ? 'aborted' as const : 'error' as const,
                  error: aborted ? null : { network, diagnostic: { category: 'lifecycle' as const } },
                }))
              : projector.apply(terminal)
            await input.db.call('compatibleProjection.finalizeBundle', {
              routeProvenanceId: value.route.routeProvenanceId,
              status: aborted ? 'aborted' : 'failed',
              atMs: nowMs(), choices: projections,
              tools: buildToolCalls(projections, nowMs()),
              reasoning: buildReasoning(projector.reasoningStates(), value.route, nowMs()),
              ...terminalBundle,
            })
            terminalFinalized = true
            onEvent(terminal)
          } catch {
            await input.routes.transition({
              routeProvenanceId: value.route.routeProvenanceId,
              targetState: aborted ? 'aborted' : 'interrupted', atMs: nowMs(),
            }).catch(() => undefined)
          }
        } else if (!terminalFinalized) {
          await input.routes.transition({
            routeProvenanceId: value.route.routeProvenanceId,
            targetState: aborted ? 'aborted' : 'interrupted', atMs: nowMs(),
          }).catch(() => undefined)
        }
        if (aborted) throw buildCompatibleNetworkError({ code: 'compatible_aborted', stage: 'lifecycle' })
        throw error
      } finally {
        handle?.finish()
      }
    },
    abort: (requestId, ownerWebContentsId) => input.requests.abortRequestForOwner(requestId, ownerWebContentsId, 'user_abort'),
    abortOwner: (ownerWebContentsId) => input.requests.abortOwner(ownerWebContentsId, 'window_destroyed'),
    abortAll: () => input.requests.abortAll('app_shutdown'),
    resolveHistorical: (source) => input.routes.resolveHistorical(source),
  })
}

function compatibleFailureEnvelope(error: unknown, aborted: boolean) {
  if (aborted) return buildCompatibleNetworkError({ code: 'compatible_aborted', stage: 'lifecycle' })
  if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' &&
      typeof (error as { stage?: unknown }).stage === 'string' && typeof (error as { safeMessage?: unknown }).safeMessage === 'string' &&
      typeof (error as { retryable?: unknown }).retryable === 'boolean') return error as ReturnType<typeof buildCompatibleNetworkError>
  return buildCompatibleNetworkError({ code: 'compatible_network_unknown', stage: 'lifecycle' })
}

function terminalProjectionStatus(projections: readonly CompatibleDurableChoiceProjection[]): 'completed' | 'failed' | 'aborted' | 'interrupted' {
  const statuses = new Set(projections.map((projection) => projection.status))
  if (statuses.size !== 1) throw new Error('compatible_projection_terminal_status_invalid')
  const status = projections[0]?.status
  if (!status || status === 'streaming') throw new Error('compatible_projection_terminal_status_invalid')
  return status
}

function buildToolCalls(projections: readonly CompatibleDurableChoiceProjection[], atMs: number) {
  return projections.flatMap((projection) => projection.blocks
    .filter((block): block is Extract<typeof block, { kind: 'tool_call' }> => block.kind === 'tool_call')
    .map((block) => {
      let argumentsJson: string | null = null
      if (block.status === 'complete') argumentsJson = block.argumentsText
      return {
        routeProvenanceId: projection.routeProvenanceId,
        messageId: projection.messageId,
        choiceIndex: projection.choiceIndex,
        toolIndex: block.toolIndex,
        toolCallId: block.toolCallId,
        toolType: block.toolCallId || block.functionName ? 'function' as const : null,
        functionName: block.functionName,
        argumentsText: block.argumentsText,
        argumentsObserved: block.argumentsText.length > 0,
        argumentsJson,
        status: block.status,
        parseErrorCode: block.parseErrorCode,
        executionState: 'not_executed' as const,
        sequenceStart: block.sequenceStart,
        sequenceEnd: block.sequenceEnd,
        createdAtMs: atMs,
        updatedAtMs: atMs,
      }
    }))
}

function buildReasoning(
  states: ReturnType<CompatibleChatResponseCoordinator['reasoningStates']>,
  route: CompatiblePreparedTurnResult['route'],
  atMs: number,
 ) {
  return states.flatMap(({ choice, state }) => state.lockedSource ? [{
      routeProvenanceId: route.routeProvenanceId,
      messageId: choice.messageId,
      choiceIndex: choice.choiceIndex,
      reasoningMappingId: route.reasoningMappingId,
      reasoningMappingVersion: route.reasoningMappingVersion,
      mode: route.reasoningMode,
      status: state.status,
      lockedSource: state.lockedSource,
      lockedSourceKey: state.lockedSourceKey,
      reasoningText: state.value,
      selectedSegmentIds: state.selectedSegmentIds,
      conflicts: state.conflicts,
      updatedAtMs: atMs,
    }] : [])
}

function buildRawExtensions(
  coordinator: CompatibleChatResponseCoordinator,
  route: CompatiblePreparedTurnResult['route'],
  atMs: number,
 ) {
  const drafts = coordinator.rawDrafts()
  if (drafts.length === 0) return []
  const records = drafts.map((draft) => ({
    recordId: formatCompatibleOpaqueId('rawExtension', randomUUID()),
    routeProvenanceId: route.routeProvenanceId,
    messageId: draft.context.messageId,
    choiceIndex: draft.choiceIndex,
    responseProfileId: route.responseProfileId,
    responseProfileVersion: route.responseProfileVersion,
    sourcePath: draft.sourcePath,
    sequenceStart: draft.sequenceStart,
    sequenceEnd: draft.sequenceEnd,
    extensionKind: draft.mode,
    semantic: draft.semantic,
    value: draft.value,
    redactionState: draft.redactionState,
    createdAtMs: atMs,
  }))
  const byChoice = new Map<number, string[]>()
  for (const record of records) byChoice.set(record.choiceIndex, [...(byChoice.get(record.choiceIndex) ?? []), record.recordId])
  for (const [choiceIndex, ids] of byChoice) coordinator.setRawExtensionRecordIds(choiceIndex, ids)
  return records
}

async function buildDiscovery(db: DbCaller, coordinator: CompatibleChatResponseCoordinator, atMs: number) {
  const observations = coordinator.discoveryObservations()
  if (observations.length === 0) return []
  const aggregates = aggregateCompatibleDiscovery(observations)
  const context = observations[0]!.context
  const result = []
  for (const [streamPath, aggregate] of aggregates) {
    if (aggregate.excluded) continue
    const existing = await db.call('compatibleDiagnostics.getDiscoveredField', {
      providerInstanceId: context.providerInstanceId,
      responseProfileId: context.responseProfileId,
      profileVersion: context.responseProfileVersion,
      streamPath,
    }) as null | Readonly<{
      state: 'candidate' | 'ignored' | 'confirmed'; occurrenceCount: number; firstObservedAtMs: number
      aggregate: Readonly<{ observedShapes: readonly string[]; sampleCount: number; redactedPreview: unknown }>
    }>
    const observedShapes = [...new Set([...(existing?.aggregate.observedShapes ?? []), ...aggregate.observedShapes])]
    result.push({
      providerInstanceId: context.providerInstanceId,
      responseProfileId: context.responseProfileId,
      profileVersion: context.responseProfileVersion,
      streamPath,
      state: existing?.state ?? 'candidate',
      aggregate: {
        schemaVersion: 1,
        observedShapes,
        redactedPreview: existing?.aggregate.redactedPreview ?? { kind: 'redacted', valueType: aggregate.observedShapes[0] ?? 'null', originalLength: null },
        sampleCount: (existing?.aggregate.sampleCount ?? 0) + aggregate.sampleCount,
      },
      occurrenceCount: (existing?.occurrenceCount ?? 0) + aggregate.sampleCount,
      firstObservedAtMs: existing?.firstObservedAtMs ?? atMs,
      lastObservedAtMs: atMs,
    })
  }
  return result
}

async function buildTerminalBundle(
  db: DbCaller,
  coordinator: CompatibleChatResponseCoordinator,
  route: CompatiblePreparedTurnResult['route'],
  atMs: number,
) {
  const rawExtensions = buildRawExtensions(coordinator, route, atMs)
  const discovery = await buildDiscovery(db, coordinator, atMs)
  return { rawExtensions, discovery }
}
