import type { DomainEvent } from '@/next/state/types'
import type { InternalMessage } from '@/next/context/buildMessages'

export type OpenRouterTransportContext = Readonly<{
    requestId: string
    assistantMessageId: string
    requestContext: Readonly<{ model: string; stream: boolean }>
    signal: AbortSignal | null
}>

export type OpenRouterIpcTransportOptions = Readonly<{
    userText: string
    contextMessages: ReadonlyArray<InternalMessage>
    contextMode: string
    requestBody: unknown
    config: Record<string, unknown>
}>

export type OpenRouterFetchTransportOptions = Readonly<{
    apiKey: string
    body: unknown
    timeoutMs?: number
    baseUrl?: string
}>

export interface OpenRouterTransportStrategy<TOptions> {
    executeStream(
        context: OpenRouterTransportContext,
        options: TOptions
    ): AsyncGenerator<DomainEvent>
}
