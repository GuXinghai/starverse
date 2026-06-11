/**
 * OpenRouter RuntimeProviderAdapter — Phase 1 facade.
 *
 * Wraps the existing streamOpenRouterChatAsEvents pipeline without changing
 * request body semantics, SSE decoding, reasoning separation, web search,
 * file/multimodal Send Plan behavior, or error handling.
 *
 * This adapter:
 * 1. Accepts a ProviderStreamRequest (provider-neutral IR)
 * 2. Translates it to LiveStreamOptions (OpenRouter-specific)
 * 3. Delegates to streamOpenRouterChatAsEvents (existing pipeline)
 * 4. Converts DomainEvent output to StarverseStreamEvent (provider-neutral IR)
 *
 * Future adapters (OpenAI Responses, Anthropic Messages, Gemini native,
 * DeepSeek profile, Generic OpenAI-compatible) will implement the same
 * yield signature from their native stream formats.
 *
 * @see docs/architecture/provider-architecture/STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md §4.1
 */

import { streamOpenRouterChatAsEvents } from '@/next/live/openRouterLiveStream'
import type { LiveStreamOptions, LiveRequestConfig } from '@/next/live/openRouterLiveStream'
import type { DomainEvent } from '@/next/state/types'
import type { ProviderStreamRequest, StarverseStreamEvent } from '@/next/provider/providerTypes'
import { domainEventToStreamEvent, streamEventToDomainEvent } from '@/next/provider/streamEventBridge'

/**
 * Execute a chat completion stream via the OpenRouter provider adapter.
 *
 * Accepts a provider-neutral request and yields provider-neutral stream events.
 * Internally delegates to the existing OpenRouter pipeline unchanged.
 *
 * @param request - Provider-neutral stream request
 * @param credentials - OpenRouter credentials (looked up by caller; not stored in request IR)
 * @yields StarverseStreamEvent — provider-neutral stream events
 */
export async function* streamViaOpenRouter(
  request: ProviderStreamRequest,
  credentials: Readonly<{ apiKey: string }>,
): AsyncGenerator<StarverseStreamEvent> {
  const c = request.config
  const liveConfig = {
    apiKey: credentials.apiKey,
    model: c.model,
    requestedReasoningMode: c.requestedReasoningMode,
    ...(c.requestedReasoningEffort !== undefined ? { requestedReasoningEffort: c.requestedReasoningEffort } : {}),
    ...(c.requestedReasoningExclude === true ? { requestedReasoningExclude: true as const } : {}),
    ...(c.tools !== undefined ? { tools: c.tools } : {}),
    ...(c.webSearch !== undefined ? { webSearch: c.webSearch } : {}),
    ...(c.samplingParams !== undefined ? { samplingParams: c.samplingParams } : {}),
    ...(c.imageGeneration !== undefined ? { imageGeneration: c.imageGeneration } : {}),
    ...(c.additionalPlugins !== undefined ? { openRouterAdditionalPlugins: c.additionalPlugins } : {}),
    ...(c.timeoutMs !== undefined ? { timeoutMs: c.timeoutMs } : {}),
    ...(c.baseUrl !== undefined ? { baseUrl: c.baseUrl } : {}),
  } as LiveRequestConfig

  const options: LiveStreamOptions = {
    requestId: request.requestId,
    assistantMessageId: request.assistantMessageId,
    userText: request.userText,
    ...(request.contextMessages !== undefined ? { contextMessages: request.contextMessages as LiveStreamOptions['contextMessages'] } : {}),
    ...(request.currentUserContentBlocks !== undefined ? { currentUserContentBlocks: request.currentUserContentBlocks } : {}),
    ...(request.contextMode !== undefined ? { contextMode: request.contextMode } : {}),
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    config: liveConfig,
  }

  yield* mapDomainStreamToProviderStream(streamOpenRouterChatAsEvents(options))
}

/**
 * Internal: wraps an AsyncGenerator<DomainEvent> and yields
 * StarverseStreamEvent by converting each event via the bridge.
 */
async function* mapDomainStreamToProviderStream(
  source: AsyncGenerator<DomainEvent>,
): AsyncGenerator<StarverseStreamEvent> {
  for await (const event of source) {
    yield domainEventToStreamEvent(event)
  }
}

/**
 * Execute a chat completion stream via the OpenRouter adapter,
 * yielding DomainEvent for direct consumption by the existing
 * state reducer / AssistantStreamSession pipeline.
 *
 * This is a convenience wrapper that calls streamViaOpenRouter
 * and converts StarverseStreamEvent back to DomainEvent via the bridge.
 * Use this when the caller requires AsyncIterable<DomainEvent>.
 */
export async function* streamViaOpenRouterAsDomainEvents(
  request: ProviderStreamRequest,
  credentials: Readonly<{ apiKey: string }>,
): AsyncGenerator<DomainEvent> {
  for await (const event of streamViaOpenRouter(request, credentials)) {
    yield streamEventToDomainEvent(event)
  }
}
