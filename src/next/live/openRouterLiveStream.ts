import { buildOpenRouterChatCompletionsRequest } from '@/next/openrouter/buildRequest'
import type { OpenRouterImageConfig, OpenRouterOutputModality } from '@/next/openrouter/buildRequest'
import type { OpenRouterAdditionalPlugin } from '@/next/openrouter/buildRequest'
import type { OpenRouterWebRequestPatch } from '@/next/openrouter/searchSettingsResolver'
import type { OpenRouterSamplingParamsPatch } from '@/next/openrouter/samplingParamsResolver'
import { decodeOpenRouterSSE } from '@/next/openrouter/sse/decoder'
import { resolveImageGenerationRequestModalities } from '@/next/openrouter/imageGenerationContract'
import type { ImageCapabilityClass } from '@/next/openrouter/imageGenerationContract'
import {
  mapAppPhaseToEndReason,
  mapAppPhaseToEnvelopePhase,
  streamFetchSemanticCore,
  streamWireSemanticCore,
  semanticMapFetchPreStreamError,
  semanticMapMissingBodyError,
  semanticMapIpcMissingError,
  semanticMapIpcStartInvokeError,
  semanticMapIpcInvokeCatchError,
  buildStreamErrorFromAppError,
} from '@/next/streaming/core'
import {
  isStreamErrorDebugEnabled,
  isTimingDebugEnabled,
  resolveStreamDebugPatch,
} from '@/next/streaming/streamRuntimeDebug'
import { openrouterFetch } from '@/next/transport/openrouterFetch'
import { getOpenRouterProviderRequireParameters } from '@/next/settings/openRouterProviderSettingsClient'
import { getNetExpSettings } from '@/next/netExp/netExpClient'
import type { ReasoningEffort, RequestedReasoningMode, StreamEndReason } from '@/next/state/types'
import type { DomainEvent } from '@/next/state/types'
import { buildOpenRouterMessages, type ContextMode, type InternalMessage } from '@/next/context/buildMessages'
import {
  buildAbortEnvelope,
} from '@/next/errors/openRouterErrorEnvelope'
import type { OpenRouterTransportContext, OpenRouterIpcTransportOptions, OpenRouterFetchTransportOptions, OpenRouterTransportStrategy } from '@/next/transport/streamingTransportStrategy'
import {
  OPENROUTER_STREAM_WIRE_VERSION,
  isOpenRouterStreamWireEvent,
  type OpenRouterStreamWireEvent,
} from '@/shared/ipc/openRouterStreamWire'

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function logStreamError(tag: string, payload: unknown) {
  if (!isStreamErrorDebugEnabled()) return
  try {
    console.error(`[stream-error] ${tag}`, payload)
  } catch {
    console.error(`[stream-error] ${tag} raw`, safeStringify(payload))
  }
}

function logTiming(tag: string, data: Record<string, unknown>) {
  if (!isTimingDebugEnabled()) return
  try {
    console.log(`[timing] ${tag}`, data)
  } catch {
    // ignore
  }
}

function extractWebPluginFromBody(body: unknown):
  | Readonly<{
      enabled?: boolean
      engine?: 'auto' | 'native' | 'exa'
      maxResults?: number
    }>
  | null {
  if (!body || typeof body !== 'object') return null
  const plugins = (body as any).plugins
  if (!Array.isArray(plugins)) return null
  const web = plugins.find((row) => row && typeof row === 'object' && (row as any).id === 'web')
  if (!web || typeof web !== 'object') return null
  const enabled = typeof (web as any).enabled === 'boolean' ? (web as any).enabled : undefined
  const engine =
    (web as any).engine === 'auto' || (web as any).engine === 'native' || (web as any).engine === 'exa'
      ? (web as any).engine
      : undefined
  const maxResults = Number.isFinite((web as any).max_results) ? Number((web as any).max_results) : undefined
  return { enabled, engine, maxResults }
}

function logWebSearchRequestHints(input: Readonly<{
  requestId: string
  body: unknown
  resolvedMode?: 'enable' | 'default' | 'disable'
}>) {
  const web = extractWebPluginFromBody(input.body)
  if (!web) return

  if (web.enabled === false && input.resolvedMode === 'disable') {
    console.info(
      `[openrouter][web] request=${input.requestId} explicit disable enabled:false; ` +
      'if account-side Prevent overrides is enabled, this disable may be ignored.'
    )
    return
  }

  if (web.enabled !== true) return
  const maxResults = web.maxResults ?? 5
  const costHint = `~$0.02/request scale for ~5 results (current max_results=${maxResults})`
  if (web.engine === 'exa') {
    console.info(`[openrouter][web] request=${input.requestId} engine=exa may add search cost, ${costHint}.`)
    return
  }
  if (web.engine === undefined || web.engine === 'auto') {
    console.info(
      `[openrouter][web] request=${input.requestId} engine=auto may fallback to exa and add search cost, ${costHint}.`
    )
  }
}

function resolveImageGenerationPatch(input: Readonly<{
  imageGeneration?: Readonly<{
    capabilityClass?: ImageCapabilityClass
    modalities?: ReadonlyArray<OpenRouterOutputModality>
    imageConfig?: OpenRouterImageConfig
  }>
}>): Readonly<{
  modalities?: ReadonlyArray<OpenRouterOutputModality>
  imageConfig?: OpenRouterImageConfig
}> {
  const imageGeneration = input.imageGeneration
  if (!imageGeneration) return {}

  const explicitModalities =
    Array.isArray(imageGeneration.modalities) && imageGeneration.modalities.length > 0
      ? [...imageGeneration.modalities]
      : undefined
  const derivedModalities =
    imageGeneration.capabilityClass
      ? resolveImageGenerationRequestModalities(imageGeneration.capabilityClass)
      : undefined
  const modalities = explicitModalities ?? derivedModalities
  if (
    explicitModalities &&
    derivedModalities &&
    explicitModalities.join('|') !== derivedModalities.join('|')
  ) {
    console.info(
      '[openrouter][image] explicit modalities override derived capability modalities',
      { explicit: explicitModalities, derived: derivedModalities }
    )
  }

  return {
    ...(modalities ? { modalities } : {}),
    ...(imageGeneration.imageConfig ? { imageConfig: imageGeneration.imageConfig } : {}),
  }
}

/** Mutable timing state for a single stream request */
type TimingState = {
  tRequestStart: number
  tAck?: number
  tEnd?: number
  endReason?: StreamEndReason
  tTransportClosed?: number
  ackSource?: 'comment' | 'first_chunk'
}

type IpcRendererLike = Readonly<{
  startOpenRouterStream: (payload: unknown) => Promise<any>
  abortOpenRouterStream: (requestId: string) => Promise<any>
  onOpenRouterChunk: (requestId: string, listener: (payload: unknown) => void) => () => void
  onOpenRouterEnd: (requestId: string, listener: () => void) => () => void
}>

function isProtocolInvalidCode(value: unknown): boolean {
  return value === 'protocol_invalid' || value === 'INVALID_WIRE_EVENT'
}

function sanitizeIpcStartFailure(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result
  const record = result as Record<string, unknown>
  const code = typeof record.code === 'string' ? record.code : ''
  if (
    code === 'credential_unresolved' ||
    code === 'credential_invalid' ||
    code === 'invalid_credential_ref'
  ) {
    return {
      ...record,
      error: code === 'credential_invalid'
        ? 'Credential material is invalid.'
        : code === 'invalid_credential_ref'
          ? 'Credential reference is invalid.'
          : 'Credential could not be resolved.',
    }
  }
  return result
}

function getIpcRenderer(): IpcRendererLike | null {
  const api = (globalThis as any).electronAPI as IpcRendererLike | undefined
  if (!api) return null
  if (typeof api.startOpenRouterStream !== 'function') return null
  if (typeof api.abortOpenRouterStream !== 'function') return null
  if (typeof api.onOpenRouterChunk !== 'function') return null
  if (typeof api.onOpenRouterEnd !== 'function') return null
  return api
}

/* eslint-disable max-lines-per-function, max-statements, complexity */
export const ipcTransportStrategy: OpenRouterTransportStrategy<OpenRouterIpcTransportOptions> = {
  async *executeStream(
    context: OpenRouterTransportContext,
    options: OpenRouterIpcTransportOptions
  ): AsyncGenerator<DomainEvent> {
    const { requestId, assistantMessageId, requestContext, signal } = context
    if (signal?.aborted) {
      const envelope = buildAbortEnvelope({ phase: 'pre_stream', completionClass: 'aborted', reason: 'aborted', request: requestContext })
      yield { type: 'StreamAbort', reason: 'aborted', envelope }
      return
    }

    const ipc = getIpcRenderer()
    if (!ipc) {
      yield* semanticMapIpcMissingError(requestContext)
      return
    }

    const wireQueue: OpenRouterStreamWireEvent[] = []
    let done = false
    let wake: (() => void) | null = null

    const enqueue = (event: OpenRouterStreamWireEvent) => {
      wireQueue.push(event)
      if (wake) {
        wake()
        wake = null
      }
    }
    const onChunk = (_event: unknown, payload: unknown) => {
      if (isOpenRouterStreamWireEvent(payload)) {
        enqueue(payload)
        return
      }
      enqueue({
        type: 'error',
        error: {
          kind: 'transport_error',
          message: 'Invalid wire payload shape',
          code: 'INVALID_WIRE_EVENT',
        },
      })
    }
    const onEnd = () => {
      done = true
      if (wake) {
        wake()
        wake = null
      }
    }

    const abortHandler = () => {
      ipc.abortOpenRouterStream(requestId).catch(() => { })
    }

    const unsubscribeChunk = ipc.onOpenRouterChunk(requestId, (payload) => onChunk(undefined, payload))
    const unsubscribeEnd = ipc.onOpenRouterEnd(requestId, onEnd)
    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true })
    }

    try {
      const result = await ipc.startOpenRouterStream({
        requestId,
        wireVersion: OPENROUTER_STREAM_WIRE_VERSION,
        assistantMessageId,
        userText: options.userText,
        contextMessages: options.contextMessages,
        contextMode: options.contextMode,
        requestBody: options.requestBody,
        config: options.config,
      })
      if (result && result.ok === false) {
        const safeResult = sanitizeIpcStartFailure(result)
        yield* semanticMapIpcStartInvokeError(safeResult, isProtocolInvalidCode(result.code), requestContext)
        return
      }
    } catch (err) {
      yield* semanticMapIpcInvokeCatchError(err, requestContext)
      return
    }

    try {
      const nextWireEvent = async (): Promise<OpenRouterStreamWireEvent | null> => {
        while (wireQueue.length === 0 && !done) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }
        if (wireQueue.length > 0) return wireQueue.shift() ?? null
        return null
      }

      const wireEvents: AsyncIterable<OpenRouterStreamWireEvent> = {
        [Symbol.asyncIterator]: async function* () {
          while (true) {
            const wire = await nextWireEvent()
            if (!wire) return
            yield wire
          }
        },
      }

      yield* streamWireSemanticCore({
        wireEvents,
        assistantMessageId,
        requestContext,
        tRequestStart: Date.now(),
        signal,
        logTiming,
        logStreamError,
        mapAppPhaseToEnvelopePhase,
        mapAppPhaseToEndReason,
        buildStreamErrorFromAppError,
      })
    } finally {
      unsubscribeChunk()
      unsubscribeEnd()
      if (signal) {
        signal.removeEventListener('abort', abortHandler)
      }
    }
  }
}
/* eslint-enable max-lines-per-function, max-statements, complexity */

export type LiveRequestConfig = Readonly<{
  apiKey?: string
  credentialSource?: 'legacy_store'
  model: string
  requestedReasoningMode: RequestedReasoningMode
  requestedReasoningEffort?: ReasoningEffort
  requestedReasoningExclude?: boolean
  /**
   * Tool definitions sent in every request when tool calling is supported.
   * For minimal compliance, callers may pass an empty array.
   */
  tools?: unknown[]
  webSearch?: Readonly<{
    requestPatch: OpenRouterWebRequestPatch
    resolvedMode?: 'enable' | 'default' | 'disable'
  }>
  samplingParams?: OpenRouterSamplingParamsPatch
  imageGeneration?: Readonly<{
    capabilityClass?: ImageCapabilityClass
    modalities?: ReadonlyArray<OpenRouterOutputModality>
    imageConfig?: OpenRouterImageConfig
  }>
  openRouterAdditionalPlugins?: ReadonlyArray<OpenRouterAdditionalPlugin>
  timeoutMs?: number
  baseUrl?: string
}>

export type LiveStreamOptions = Readonly<{
  requestId: string
  assistantMessageId: string
  userText: string
  /**
   * Prior turns to include as request `messages[]` context.
   * Must NOT include the current user input (passed via `userText`).
   *
   * Keep this as InternalMessage[] to allow future multimodal/tool support without
   * pushing OpenRouter request-shaping into UI layers.
   */
  contextMessages?: ReadonlyArray<InternalMessage>
  currentUserContentBlocks?: ReadonlyArray<Readonly<{ type: string; [key: string]: unknown }>>
  contextMode?: ContextMode
  signal?: AbortSignal | null
  config: LiveRequestConfig
}>

/**
 * LIVE pipeline: openrouterFetch -> decodeOpenRouterSSE -> mapChunkToEvents.
 * This function does not mutate state; it only yields SSOT Domain Events.
 */
/* eslint-disable max-lines-per-function, max-statements, complexity */

/* eslint-disable max-lines-per-function, max-statements, complexity */
export const fetchTransportStrategy: OpenRouterTransportStrategy<OpenRouterFetchTransportOptions> = {
  async *executeStream(
    context: OpenRouterTransportContext,
    options: OpenRouterFetchTransportOptions
  ): AsyncGenerator<DomainEvent> {
    const { requestId, assistantMessageId, requestContext, signal } = context
    const timing: TimingState = {
      tRequestStart: Date.now(),
    }
    logTiming('request_start', { tRequestStart: timing.tRequestStart, requestId })

    let transport
    try {
      transport = await openrouterFetch({
        apiKey: options.apiKey,
        body: options.body,
        requestId,
        signal,
        timeoutMs: options.timeoutMs,
        baseUrl: options.baseUrl,
      })
    } catch (err: any) {
      yield* semanticMapFetchPreStreamError(err, {
        requestId,
        requestContext,
        tRequestStart: timing.tRequestStart,
        timeoutMs: options.timeoutMs,
        baseUrl: options.baseUrl,
        logTiming,
        logStreamError,
      })
      return
    }

    if (transport.generationId) {
      yield { type: 'MetaDelta', meta: { id: transport.generationId } }
    }

    const bodyStream = transport.response.body
    if (!bodyStream) {
      yield* semanticMapMissingBodyError({
        requestContext,
        tRequestStart: timing.tRequestStart,
        logTiming,
      })
      return
    }

    yield* streamFetchSemanticCore({
      decodedEvents: decodeOpenRouterSSE(bodyStream),
      assistantMessageId,
      requestContext,
      tRequestStart: timing.tRequestStart,
      signal,
      logTiming,
      logStreamError,
      mapAppPhaseToEnvelopePhase,
      mapAppPhaseToEndReason,
      buildStreamErrorFromAppError,
    })
  }
}

export async function* streamOpenRouterChatAsEvents(options: LiveStreamOptions): AsyncGenerator<DomainEvent> {
  const signal = options.signal ?? null
  const requestContext = { model: options.config.model, stream: true }

  if (signal?.aborted) {
    const envelope = buildAbortEnvelope({ phase: 'pre_stream', completionClass: 'aborted', reason: 'aborted', request: requestContext })
    yield { type: 'StreamAbort', reason: 'aborted', envelope }
    return
  }

  const { apiKey, credentialSource, model } = options.config
  const providerRequireParameters = await getOpenRouterProviderRequireParameters()
  const netExp = await getNetExpSettings()

  const internalMessages: InternalMessage[] = [
    ...((options.contextMessages ?? []) as InternalMessage[]),
    options.currentUserContentBlocks && options.currentUserContentBlocks.length > 0
      ? { role: 'user', contentBlocks: options.currentUserContentBlocks }
      : { role: 'user', contentText: options.userText },
  ]

  const messages = buildOpenRouterMessages(internalMessages, { mode: options.contextMode ?? 'default' })

  const reasoning =
    options.config.requestedReasoningMode === 'auto'
      ? undefined
      : {
        effort: options.config.requestedReasoningEffort ?? 'none',
        ...(options.config.requestedReasoningExclude === true ? { exclude: true } : {}),
      }
  const imageGenerationPatch = resolveImageGenerationPatch({
    imageGeneration: options.config.imageGeneration,
  })
  const streamDebugPatch = resolveStreamDebugPatch()

  const body = buildOpenRouterChatCompletionsRequest({
    model,
    messages,
    stream: true,
    tools: options.config.tools ?? [],
    ...imageGenerationPatch,
    ...(options.config.webSearch?.requestPatch ? { webSearchPatch: options.config.webSearch.requestPatch } : {}),
    ...(options.config.samplingParams ? { samplingParams: options.config.samplingParams } : {}),
    ...(providerRequireParameters === true ? { providerRequireParameters: true } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(options.config.openRouterAdditionalPlugins ? { additionalPlugins: options.config.openRouterAdditionalPlugins } : {}),
    ...streamDebugPatch,
  })
  
  if (streamDebugPatch.debug) {
    console.info(`[openrouter][debug] request=${options.requestId} debug.echo_upstream_body enabled (DEV only).`)
  }
  logWebSearchRequestHints({
    requestId: options.requestId,
    body,
    resolvedMode: options.config.webSearch?.resolvedMode,
  })

  const context: OpenRouterTransportContext = {
    requestId: options.requestId,
    assistantMessageId: options.assistantMessageId,
    requestContext,
    signal,
  }

  if (netExp.streamInMainProcess === true || credentialSource === 'legacy_store') {
    const ipcOptions: OpenRouterIpcTransportOptions = {
      userText: options.userText,
      contextMessages: options.contextMessages ?? [],
      contextMode: options.contextMode ?? 'default',
      requestBody: body,
      config: {
        ...(credentialSource ? { credentialSource } : { apiKey: apiKey ?? '' }),
        model,
        requestedReasoningMode: options.config.requestedReasoningMode,
        ...(options.config.requestedReasoningEffort ? { requestedReasoningEffort: options.config.requestedReasoningEffort } : {}),
        ...(options.config.requestedReasoningExclude ? { requestedReasoningExclude: true } : {}),
        ...(imageGenerationPatch.modalities ? { modalities: imageGenerationPatch.modalities } : {}),
        ...(imageGenerationPatch.imageConfig ? { imageConfig: imageGenerationPatch.imageConfig } : {}),
        ...(options.config.timeoutMs ? { timeoutMs: options.config.timeoutMs } : {}),
        ...(credentialSource ? {} : options.config.baseUrl ? { baseUrl: options.config.baseUrl } : {}),
        ...(options.config.tools ? { tools: options.config.tools } : {}),
        ...(options.config.openRouterAdditionalPlugins ? { openRouterAdditionalPlugins: options.config.openRouterAdditionalPlugins } : {}),
        providerRequireParameters,
        forceHttp1: netExp.forceHttp1 === true,
        tcpKeepAliveEnable: netExp.tcpKeepAliveEnable === true,
        tcpKeepAliveIdleMs: netExp.tcpKeepAliveIdleMs,
      },
    }
    yield* ipcTransportStrategy.executeStream(context, ipcOptions)
    return
  }

  const fetchOptions: OpenRouterFetchTransportOptions = {
    apiKey: apiKey ?? '',
    body,
    timeoutMs: options.config.timeoutMs,
    baseUrl: options.config.baseUrl,
  }
  yield* fetchTransportStrategy.executeStream(context, fetchOptions)
}
/* eslint-enable max-lines-per-function, max-statements, complexity */
