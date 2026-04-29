import { describe, expect, it, vi, afterEach } from 'vitest'
import { stripTiming, firstOfType } from '../../../tests/utils/streamAsserts'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'

let capturedBody: any | null = null
const testModel = DEFAULT_OPENROUTER_TEST_MODEL

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
    globalThis.localStorage?.removeItem('sv_debug_openrouter_echo_upstream_body')
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
                model: testModel,
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
                model: testModel,
                requestedReasoningMode: 'auto',
            },
        })) {
            // consume
        }

        expect(capturedBody).not.toHaveProperty('provider')
    })

    it('injects web plugin payload and keeps disable override shape stable', async () => {
        ; (globalThis as any).dbBridge = {
            invoke: vi.fn(async (method: string) => {
                if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
                return undefined
            }),
        }

        for await (const _ev of streamOpenRouterChatAsEvents({
            requestId: 'rid_web_enable',
            assistantMessageId: 'mid',
            userText: 'hi',
            config: {
                apiKey: 'k',
                model: testModel,
                requestedReasoningMode: 'auto',
                webSearch: {
                    requestPatch: {
                        plugins: [{ id: 'web', enabled: true, engine: 'exa', max_results: 5 }],
                        web_search_options: { search_context_size: 'high' },
                    },
                    resolvedMode: 'enable',
                },
            },
        })) {
            // consume
        }

        expect(capturedBody).toMatchObject({
            plugins: [{ id: 'web', enabled: true, engine: 'exa', max_results: 5 }],
        })
        // default policy is native_only; exa path should not include web_search_options.
        expect(capturedBody).not.toHaveProperty('web_search_options')

        for await (const _ev of streamOpenRouterChatAsEvents({
            requestId: 'rid_web_disable',
            assistantMessageId: 'mid',
            userText: 'hi',
            config: {
                apiKey: 'k',
                model: testModel,
                requestedReasoningMode: 'auto',
                webSearch: {
                    requestPatch: { plugins: [{ id: 'web', enabled: false }] },
                    resolvedMode: 'disable',
                },
            },
        })) {
            // consume
        }

        expect(capturedBody).toMatchObject({
            plugins: [{ id: 'web', enabled: false }],
        })
    })

    it('injects image generation fields (modalities + image_config) into request body', async () => {
        ; (globalThis as any).dbBridge = {
            invoke: vi.fn(async (method: string) => {
                if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
                return undefined
            }),
        }

        for await (const _ev of streamOpenRouterChatAsEvents({
            requestId: 'rid_image_gen',
            assistantMessageId: 'mid',
            userText: 'draw a fox',
            config: {
                apiKey: 'k',
                model: testModel,
                requestedReasoningMode: 'auto',
                imageGeneration: {
                    modalities: ['image', 'text'],
                    imageConfig: {
                        aspect_ratio: '16:9',
                        image_size: '1024x1024',
                        quality: 'high',
                    },
                },
            },
        })) {
            // consume
        }

        expect(capturedBody).toMatchObject({
            modalities: ['image', 'text'],
            image_config: {
                aspect_ratio: '16:9',
                image_size: '1024x1024',
                quality: 'high',
            },
        })
    })

    it('derives modalities from capability class when explicit modalities are omitted', async () => {
        ; (globalThis as any).dbBridge = {
            invoke: vi.fn(async (method: string) => {
                if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
                return undefined
            }),
        }

        for await (const _ev of streamOpenRouterChatAsEvents({
            requestId: 'rid_image_only',
            assistantMessageId: 'mid',
            userText: 'draw',
            config: {
                apiKey: 'k',
                model: testModel,
                requestedReasoningMode: 'auto',
                imageGeneration: {
                    capabilityClass: 'image_only',
                },
            },
        })) {
            // consume
        }
        expect(capturedBody?.modalities).toEqual(['image'])

        for await (const _ev of streamOpenRouterChatAsEvents({
            requestId: 'rid_text_and_image',
            assistantMessageId: 'mid',
            userText: 'draw',
            config: {
                apiKey: 'k',
                model: testModel,
                requestedReasoningMode: 'auto',
                imageGeneration: {
                    capabilityClass: 'text_and_image',
                },
            },
        })) {
            // consume
        }
        expect(capturedBody?.modalities).toEqual(['image', 'text'])
    })

    it('enables debug.echo_upstream_body only when dev toggle is on', async () => {
        ; (globalThis as any).dbBridge = {
            invoke: vi.fn(async (method: string) => {
                if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
                return undefined
            }),
        }

        globalThis.localStorage?.setItem('sv_debug_openrouter_echo_upstream_body', '1')

        for await (const _ev of streamOpenRouterChatAsEvents({
            requestId: 'rid_debug_echo',
            assistantMessageId: 'mid',
            userText: 'hi',
            config: {
                apiKey: 'k',
                model: testModel,
                requestedReasoningMode: 'auto',
            },
        })) {
            // consume
        }

        expect(capturedBody).toMatchObject({
            debug: { echo_upstream_body: true },
        })
    })
})
