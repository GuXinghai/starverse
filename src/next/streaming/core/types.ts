import type { AppError, AppErrorPhase } from '@/next/errors/appError'
import type { ErrorEnvelope, ErrorPhase } from '@/next/errors/openRouterErrorEnvelope'
import type { SSEDecodedEvent } from '@/next/openrouter/sse/decoder'
import type { StreamEndReason } from '@/next/state/types'

export type StreamRequestContext = Readonly<{
  model?: string
  stream?: boolean
}>

export type BuildStreamErrorFromAppErrorInput = Readonly<{
  appError: AppError
  phase: ErrorPhase
  request?: StreamRequestContext
  raw?: Record<string, unknown>
}>

export type StreamCoreErrorTools = Readonly<{
  mapAppPhaseToEnvelopePhase: (appPhase: AppErrorPhase, fallback: ErrorPhase) => ErrorPhase
  mapAppPhaseToEndReason: (appPhase: AppErrorPhase, fallback: StreamEndReason) => StreamEndReason
  buildStreamErrorFromAppError: (input: BuildStreamErrorFromAppErrorInput) => ErrorEnvelope
}>

export type StreamSemanticCoreInput = StreamCoreErrorTools &
  Readonly<{
    decodedEvents: AsyncIterable<SSEDecodedEvent>
    assistantMessageId: string
    requestContext: StreamRequestContext
    tRequestStart: number
    signal?: AbortSignal | null
    logTiming?: (tag: string, data: Record<string, unknown>) => void
    logStreamError?: (tag: string, payload: unknown) => void
  }>

export type StreamWireSemanticCoreInput = StreamCoreErrorTools &
  Readonly<{
    wireEvents: AsyncIterable<unknown>
    assistantMessageId: string
    requestContext: StreamRequestContext
    tRequestStart: number
    signal?: AbortSignal | null
    logTiming?: (tag: string, data: Record<string, unknown>) => void
    logStreamError?: (tag: string, payload: unknown) => void
  }>
