/**
 * Runtime provider stream adapter contract.
 *
 * This is the minimal shared callable shape extracted from the five
 * integrated provider adapters (DeepSeek, OpenAI Responses, Anthropic, Gemini, Generic).
 *
 * OpenRouter is NOT included yet because the current app path uses the
 * OpenRouter facade with a DomainEvent bridge, not this contract.
 *
 * @see docs/architecture/provider-architecture/STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md
 */

import type { ProviderStreamRequest, StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// ProviderStreamTransport — injectable transport for remote adapters
// ---------------------------------------------------------------------------

/**
 * Injectable transport for remote provider adapters.
 *
 * All remote adapters need: fetch function, base URL, API key.
 * Provider-specific adapters may extend this type with extra fields
 * (e.g. Anthropic adds `anthropicVersion`).
 */
export type ProviderStreamTransport = Readonly<{
  fetch: (url: string, init: RequestInit) => Promise<Response>
  baseUrl: string
  apiKey: string
}>

// ---------------------------------------------------------------------------
// RuntimeProviderStreamAdapter — the shared callable shape
// ---------------------------------------------------------------------------

/**
 * A remote provider stream adapter function.
 *
 * Accepts a provider-neutral request and an injectable transport.
 * Yields provider-neutral stream events.
 *
 * Implemented by: DeepSeek, OpenAI Responses, Anthropic, Gemini.
 * NOT implemented by: OpenRouter (uses DomainEvent bridge path).
 */
export type RuntimeProviderStreamAdapter = (
  request: ProviderStreamRequest,
  transport: ProviderStreamTransport,
) => AsyncGenerator<StarverseStreamEvent, void, unknown>
