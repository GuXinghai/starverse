import { describe, expect, it, vi, afterEach } from 'vitest'
import { stripTiming, firstOfType } from '../../../tests/utils/streamAsserts'

let capturedBody: any | null = null

vi.mock('@/next/transport/openrouterFetch', () => {
    return {
        openrouterFetch: vi.fn(async (opts: any) => {
            capturedBody = opts?.body ?? null
            throw { type: 'aborted', requestId: String(opts?.requestId ?? ''), message: 'Request aborted' }
        }),
    }
})

import { streamOpenRouterChatAsEvents } from '@/next/live/openRouterLiveStream'

describe('streamOpenRouterChatAsEvents (provider.require_parameters)', () => {
    const originalDbBridge = (globalThis as any).dbBridge

    afterEach(() => {
        capturedBody = null
            ; (globalThis as any).dbBridge = originalDbBridge
    })

    it('injects provider.require_parameters=true when setting is true', async () => {
        ; (globalThis as any).dbBridge = {
            invoke: vi.fn(async (method: string) => {
                if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: true }
                return undefined
            }),
        }

        const events: any[] = []
        for await (const ev of streamOpenRouterChatAsEvents({
            requestId: 'rid',
            assistantMessageId: 'mid',
            userText: 'hi',
            config: {
                apiKey: 'k',
                model: 'openrouter/auto',
                requestedReasoningMode: 'auto',
            },
        })) {
            events.push(ev)
        }

        const nonTiming = stripTiming(events)
        expect(nonTiming[0]?.type).toBe('StreamAbort')
        expect(firstOfType(events, 'StreamAbort')).toBeTruthy()
        expect(capturedBody).toMatchObject({ provider: { require_parameters: true } })
    })

    it('omits provider.require_parameters when setting is false (default behavior)', async () => {
        ; (globalThis as any).dbBridge = {
            invoke: vi.fn(async (method: string) => {
                if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
                return undefined
            }),
        }

        for await (const _ev of streamOpenRouterChatAsEvents({
            requestId: 'rid',
            assistantMessageId: 'mid',
            userText: 'hi',
            config: {
                apiKey: 'k',
                model: 'openrouter/auto',
                requestedReasoningMode: 'auto',
            },
        })) {
            // consume
        }

        expect(capturedBody).not.toHaveProperty('provider')
    })
})
