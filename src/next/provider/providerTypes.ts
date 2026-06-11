/**
 * Provider-neutral IR types for Starverse multi-provider architecture.
 *
 * These types define the contract between the app layer and provider adapters.
 * UI / DB / Send Plan consume provider-neutral types; provider-native schema
 * stays inside adapter boundaries.
 *
 * @see docs/architecture/provider-architecture/STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md
 * @see docs/architecture/provider-architecture/STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md
 */

import type {
  ContentBlock,
  MessageAnnotation,
  ReasoningEffort,
  RequestedReasoningMode,
  ToolCallDelta,
} from '@/next/state/types'

// ---------------------------------------------------------------------------
// StarverseProviderError — provider-neutral error shape
//
// Replaces the OpenRouter-shaped ErrorEnvelope in provider-neutral contexts.
// OpenRouter adapter constructs this from ErrorEnvelope internally;
// non-OpenRouter adapters construct it directly from provider-native errors.
// ---------------------------------------------------------------------------

export type StarverseProviderError = Readonly<{
  phase: 'request_build' | 'transport' | 'http' | 'sse_decode' | 'stream' | 'provider' | 'abort'
  provider: string
  category:
    | 'auth'
    | 'rate_limit'
    | 'bad_request'
    | 'network'
    | 'http'
    | 'provider_error'
    | 'protocol'
    | 'aborted'
    | 'unknown'
  message: string
  retryable?: boolean
  httpStatus?: number
  code?: string
  requestId?: string
  raw?: unknown
}>

// ---------------------------------------------------------------------------
// StarverseStreamEvent — provider-neutral stream IR
//
// This is the canonical event vocabulary that all RuntimeProviderAdapters
// must produce. The OpenRouter adapter maps existing DomainEvent shapes
// into this vocabulary; future adapters (OpenAI Responses, Anthropic Messages,
// Gemini native, DeepSeek profile, Generic OpenAI-compatible) will produce
// the same vocabulary from their native stream formats.
//
// Field semantics mirror the existing DomainEvent union to preserve
// backward compatibility with current state reducers via streamEventBridge.
// ---------------------------------------------------------------------------

export type StarverseStreamEvent =
  | Readonly<{ type: 'stream.comment'; text: string }>
  | Readonly<{ type: 'stream.error'; error: StarverseProviderError; terminal: true }>
  | Readonly<{ type: 'stream.done' }>
  | Readonly<{ type: 'stream.abort'; reason?: string; error: StarverseProviderError }>
  | Readonly<{
      type: 'stream.timing'
      tRequestStart?: number
      tAck?: number
      tEnd?: number
      endReason?: string
      tTransportClosed?: number
    }>
  | Readonly<{ type: 'message.text_delta'; messageId: string; choiceIndex: number; text: string }>
  | Readonly<{ type: 'message.content_block_append'; messageId: string; choiceIndex: number; block: ContentBlock }>
  | Readonly<{
      type: 'message.tool_call_delta'
      messageId: string
      choiceIndex: number
      mergeStrategy: 'append' | 'replace'
      toolCallDeltas: ToolCallDelta[]
    }>
  | Readonly<{
      type: 'message.annotation_batch'
      messageId: string
      choiceIndex: number
      mergeStrategy: 'append' | 'replace'
      annotations: MessageAnnotation[]
    }>
  | Readonly<{ type: 'message.reasoning_detail'; messageId: string; choiceIndex: number; detail: unknown; chunkNo?: number }>
  | Readonly<{ type: 'message.reasoning_detail_batch'; messageId: string; choiceIndex: number; details: unknown[] }>
  | Readonly<{ type: 'usage.delta'; usage: unknown }>
  | Readonly<{
      type: 'meta.delta'
      meta: {
        id?: string
        model?: string
        provider?: string
        finish_reason?: string
        native_finish_reason?: string
      }
    }>

// ---------------------------------------------------------------------------
// ProviderStreamRequest — provider-neutral stream request IR
//
// This replaces direct construction of provider-specific request options.
// The adapter translates this into provider-native request parameters.
// ---------------------------------------------------------------------------

export type ProviderStreamConfig = Readonly<{
  model: string
  requestedReasoningMode: RequestedReasoningMode
  requestedReasoningEffort?: ReasoningEffort
  requestedReasoningExclude?: boolean
  tools?: unknown[]
  webSearch?: Readonly<{
    requestPatch: unknown
    resolvedMode?: 'enable' | 'default' | 'disable'
  }>
  samplingParams?: unknown
  imageGeneration?: Readonly<{
    capabilityClass?: string
    modalities?: ReadonlyArray<string>
    imageConfig?: unknown
  }>
  additionalPlugins?: ReadonlyArray<unknown>
  timeoutMs?: number
  baseUrl?: string
}>

export type ProviderStreamRequest = Readonly<{
  requestId: string
  assistantMessageId: string
  userText: string
  contextMessages?: ReadonlyArray<unknown>
  currentUserContentBlocks?: ReadonlyArray<Readonly<{ type: string; [key: string]: unknown }>>
  contextMode?: 'default' | 'advanced_reasoning_blocks'
  signal?: AbortSignal | null
  config: ProviderStreamConfig
}>
