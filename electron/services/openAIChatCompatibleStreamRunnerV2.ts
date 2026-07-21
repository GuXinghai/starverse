import { session } from 'electron'
import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenAIChatCompatibleNativeHistoryV2Repo } from '../../infra/db/repo/openAIChatCompatibleNativeHistoryV2Repo'
import { OpenAICompatibleV2Repo } from '../../infra/db/repo/openAICompatibleV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
// Approved Generation V2 main-process composition boundary: prepared requests never cross IPC as mutable values.
// eslint-disable-next-line no-restricted-imports
import { isPreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { CompatibleSseWireParser, decodeCompatibleNonStreamResponse, type CompatibleWireEvent } from '../../src/shared/provider/openai-chat-compatible/wire'
import { CompatibleChatResponseCoordinator } from '../../src/shared/provider/openai-chat-compatible/runtime/compatibleChatResponseCoordinator'
import { aggregateCompatibleDiscovery, type CompatibleDiscoveryObservation } from '../../src/shared/provider/openai-chat-compatible/extensions'
import { compatibleInlinePolicyConfigSchema, compatibleReasoningMappingConfigSchema } from '../../src/shared/provider/openai-chat-compatible/schemas'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { createOpenAICompatibleCredentialV2Service } from '../credentials/openAICompatibleCredentialV2Service'
import { isGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { publishGenerationStreamProjectionV2, type GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
// eslint-disable-next-line no-restricted-imports
import { OpenAIChatCompatibleResponseAssemblerV2, type OpenAIChatCompatibleStreamResultV2 } from '../../src/next/generation-v2/providers/openai-chat-compatible/chatResponseAssemblerV2'
import { createOpenAICompatibleHeadersV2 } from './openAICompatibleNetworkV2'

type CredentialService = ReturnType<typeof createOpenAICompatibleCredentialV2Service>

function abortScope(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController(); let timedOut = false; const abort = () => controller.abort('user_cancelled')
  if (external?.aborted) abort(); else external?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort('timeout') }, timeoutMs); (timer as NodeJS.Timeout).unref?.()
  return Object.freeze({ signal: controller.signal, timedOut: () => timedOut,
    dispose: () => { clearTimeout(timer); external?.removeEventListener('abort', abort) } })
}
function errorFromTerminal(event: Extract<CompatibleWireEvent, { kind: 'terminal' }>): string {
  if (event.outcome === 'done') return ''
  return event.error?.network.code ?? `GENERATION_V2_OPENAI_COMPATIBLE_${event.outcome.toUpperCase()}`
}

/**
 * The legacy compatible display assembler requires an opaque route id, while
 * V2 deliberately does not create or consult a legacy compatible route.  Tie
 * that display-only identity deterministically to the immutable operation so
 * every replay of the same operation receives the identical provenance.
 */
function responseRouteProvenanceId(operationId: string): string {
  return `ocp_route_${createHash('sha256').update(operationId, 'utf8').digest('hex')}`
}

export function createOpenAIChatCompatibleStreamRunnerV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: CredentialService
  rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  nowMs?: () => number
  timeoutMs?: number
}>) {
  const nowMs = input.nowMs ?? Date.now; const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs); const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db); const historyRepo = new OpenAIChatCompatibleNativeHistoryV2Repo(input.db)
  const providers = new OpenAICompatibleV2Repo(input.db, nowMs)
  function begin(command: GenerationTextCommandResultV2) { runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
    const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
    if (!execution) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_AUTHORITY_INVALID')
    const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
    if (executionRepo.openAttempt(context, { operationId: command.preparedRequest.operationId, requestSequence: 1, attempt: 1 }, nowMs()).kind !== 'created') {
      throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_ALREADY_STARTED')
    }
    requestRepo.markStreaming(context, request, nowMs())
    if (execution.operation.state === 'committed') executionRepo.markOperationStreaming(context, execution, nowMs())
  }) }
  function append(command: GenerationTextCommandResultV2, previous: string, next: string) {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => graphRepo.compareAndSetStreamingAssistantBody(context, command.preparedRequest.answerRootId, previous, next, nowMs()))
    publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'assistant_body', operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, content: next })
  }
  function terminal(command: GenerationTextCommandResultV2, state: 'completed' | 'failed' | 'cancelled', result: OpenAIChatCompatibleStreamResultV2 | null,
    errorCode: string | null, errorMessage: string | null, phase: 'pre_stream' | 'mid_stream',
    assistantReasoning: Readonly<{ reasoning: string; hasCompleteToolChain: boolean }> | null = null,
    discovery: readonly CompatibleDiscoveryObservation[] = []) {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      executionRepo.terminalizeAttempt(context, { key: { operationId: command.preparedRequest.operationId, requestSequence: 1, attempt: 1 },
        outcome: state === 'completed' ? { kind: 'provider_completed', phase } : state === 'cancelled' ? { kind: 'user_cancelled', phase }
          : { kind: 'provider_failed', phase, failure: { code: errorCode!, message: errorMessage! } } }, nowMs())
      const terminalRequest = requestRepo.terminalize(context, request, state, nowMs())
      graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state,
        state === 'completed' ? result!.assistantMessage.content : null, nowMs())
      const terminalExecution = executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage }, nowMs())
      if (state === 'completed' && result) {
        const fact = historyRepo.loadRequestHistory(context, command.preparedRequest.operationId)
        historyRepo.persistCompletedArtifact({ context, execution: terminalExecution, request: terminalRequest,
          requestMessages: fact.replayMessages, requestReasoningReplay: fact.reasoningReplay, assistantMessage: result.assistantMessage,
          assistantReasoning, createdAtMs: nowMs() })
        const provenance = terminalExecution.snapshot.providerConfiguration
        if (provenance.kind === 'openai_chat_compatible' && discovery.length > 0) {
          const aggregates = aggregateCompatibleDiscovery(discovery)
          providers.observeDiscovery({ providerInstanceId: provenance.providerInstanceId.value,
            responseProfileId: provenance.responseProfile.id.value, responseProfileVersion: provenance.responseProfile.version,
            observations: Object.freeze([...aggregates].map(([streamPath, aggregate]) => Object.freeze({ streamPath,
              occurrenceCount: aggregate.sampleCount, aggregate: Object.freeze({ schemaVersion: 1,
                observedShapes: aggregate.observedShapes, redactedPreview: aggregate.observedShapes[0]
                  ? Object.freeze({ kind: 'redacted' as const, valueType: aggregate.observedShapes[0], originalLength: null }) : null,
                sampleCount: aggregate.sampleCount }) }))) })
        }
      }
    })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'terminal', operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, state, errorCode, errorMessage })
    return Object.freeze({ operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId, state, errorCode, errorMessage })
  }
  function consume(events: readonly CompatibleWireEvent[], assembler: OpenAIChatCompatibleResponseAssemblerV2, reasoning: CompatibleChatResponseCoordinator | null, command: GenerationTextCommandResultV2,
    visible: { value: string }): void {
    for (const event of events) {
      if (event.kind === 'terminal') { reasoning?.apply(event); const code = errorFromTerminal(event); if (code) throw new Error(code); continue }
      reasoning?.apply(event)
      const delta = assembler.push(event)
      if (delta) { const previous = visible.value; visible.value += delta; append(command, previous, visible.value) }
    }
  }
  function createReasoningCoordinator(command: GenerationTextCommandResultV2): CompatibleChatResponseCoordinator | null {
    const provenance = command.execution.snapshot.providerConfiguration
    if (provenance.kind !== 'openai_chat_compatible') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_PROVENANCE_INVALID')
    const configuration = providers.getConfigurationForEndpointRevision(provenance.providerInstanceId.value, provenance.endpointRevisionId.value)
    let mapping: ReturnType<typeof compatibleReasoningMappingConfigSchema.parse>; let inline: ReturnType<typeof compatibleInlinePolicyConfigSchema.parse>
    try { mapping = compatibleReasoningMappingConfigSchema.parse(configuration.reasoningMapping.payload); inline = compatibleInlinePolicyConfigSchema.parse(configuration.inlinePolicy.payload) }
    catch { throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_CONFIGURATION_INVALID') }
    return new CompatibleChatResponseCoordinator({ route: { routeProvenanceId: responseRouteProvenanceId(command.preparedRequest.operationId),
      providerInstanceId: provenance.providerInstanceId.value, responseProfileId: provenance.responseProfile.id.value,
      responseProfileVersion: provenance.responseProfile.version, reasoningMappingId: provenance.reasoningMapping.id.value,
      reasoningMappingVersion: provenance.reasoningMapping.version, reasoningMode: mapping.mode },
      choices: [{ choiceIndex: 0, messageId: command.preparedRequest.answerRootId }], reasoningMapping: mapping,
      inlinePolicy: { inlinePolicyId: provenance.inlinePolicy.id.value, version: provenance.inlinePolicy.version, config: inline } })
  }
  async function requestHeaders(command: GenerationTextCommandResultV2): Promise<Headers> {
    const provenance = command.execution.snapshot.providerConfiguration
    if (provenance.kind !== 'openai_chat_compatible') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_PROVENANCE_INVALID')
    const endpoint = providers.getEndpointRevision(provenance.providerInstanceId.value, provenance.endpointRevisionId.value)
    const headers = await createOpenAICompatibleHeadersV2({ credentialService: input.credentialService,
      providerInstanceId: provenance.providerInstanceId.value, endpoint, expectedRevision: provenance.credentialRevision,
      expectedCredentialScopeId: command.preparedRequest.credentialScopeId, accept: 'text/event-stream' })
    headers.set('content-type', 'application/json')
    return headers
  }
  return Object.freeze({ run: async (command: GenerationTextCommandResultV2, signal?: AbortSignal) => {
    if (!isGenerationTextCommandResultV2(command) || !isPreparedProviderRequestV2(command.preparedRequest) ||
        command.preparedRequest.providerId !== 'openai_compatible' || command.preparedRequest.contractId !== 'openai_chat_compatible') {
      throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_AUTHORITY_INVALID')
    }
    begin(command); const scope = abortScope(signal, input.timeoutMs ?? 5 * 60_000); const visible = { value: '' }; let started = false
    try {
      try { input.rawGenerationRequestStore?.tryPersistPreparedV2({ operationId: command.preparedRequest.operationId,
        answerRootId: command.preparedRequest.answerRootId, requestSequence: 1, providerId: 'openai_compatible', modelId: command.preparedRequest.modelId,
        conversationId: command.execution.operation.conversationId.value, branchId: command.execution.operation.branchId.value,
        questionId: command.execution.operation.questionId.value, actionKind: command.execution.operation.actionKind }, command.preparedRequest.body) } catch { /* debug persistence is non-fatal */ }
      const headers = await requestHeaders(command); const bytes = command.preparedRequest.body.copyBytes(); let response: Response
      try { response = await fetchImpl(command.preparedRequest.endpoint, { method: 'POST', redirect: 'error', signal: scope.signal, headers, body: Buffer.from(bytes) }) } finally { bytes.fill(0) }
      if (!response.ok || !response.body) { try { await response.body?.cancel() } catch {}; throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_HTTP_FAILED') }
      const assembler = new OpenAIChatCompatibleResponseAssemblerV2(); const reasoning = createReasoningCoordinator(command); const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (contentType.includes('text/event-stream')) {
        const parser = new CompatibleSseWireParser({ expectedChoiceCount: 1 }); const reader = response.body.getReader()
        try { while (true) { const item = await reader.read(); if (item.done) break; if (item.value.byteLength) started = true; consume(parser.push(item.value), assembler, reasoning, command, visible) }
          consume(parser.finish(), assembler, reasoning, command, visible)
        } finally { try { await reader.cancel() } catch {}; reader.releaseLock() }
      } else if (contentType.includes('application/json')) {
        const bytes = new Uint8Array(await response.arrayBuffer()); try { started = bytes.byteLength > 0; consume(decodeCompatibleNonStreamResponse({ bytes, expectedChoiceCount: 1 }), assembler, reasoning, command, visible) } finally { bytes.fill(0) }
      } else throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_CONTENT_TYPE_INVALID')
      const result = assembler.finish()
      if (result.model !== command.preparedRequest.modelId) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_MODEL_MISMATCH')
      if (result.assistantMessage.tool_calls?.length) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_TOOL_CONTINUATION_UNAVAILABLE')
      const reasoningState = reasoning.reasoningStates()[0]?.state
      const replay = reasoningState?.value ? { reasoning: reasoningState.value, hasCompleteToolChain: false } : null
      return terminal(command, 'completed', result, null, null, 'mid_stream', replay, reasoning?.discoveryObservations() ?? [])
    } catch (error) {
      const cancelled = signal?.aborted === true && !scope.timedOut()
      const code = cancelled ? 'user_cancelled' : scope.timedOut() ? 'GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_TIMEOUT'
        : error instanceof Error ? error.message : 'GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_TRANSPORT_FAILED'
      return terminal(command, cancelled ? 'cancelled' : 'failed', null, code, cancelled ? 'Generation cancelled by user.' : code,
        started ? 'mid_stream' : 'pre_stream')
    } finally { scope.dispose() }
  } })
}
