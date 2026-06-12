import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamOpenRouterChatAsEvents } from '@/next/live/openRouterLiveStream'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import { OPENROUTER_STREAM_WIRE_VERSION } from '@/shared/ipc/openRouterStreamWire'

function streamFromText(text: string, chunkSize = 17): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(text)
    let offset = 0
    return new ReadableStream<Uint8Array>({
        pull(controller) {
            if (offset >= bytes.length) {
                controller.close()
                return
            }
            const next = bytes.slice(offset, offset + chunkSize)
            offset += chunkSize
            controller.enqueue(next)
        },
    })
}

/* eslint-disable max-lines-per-function */
describe('streamOpenRouterChatAsEvents (smoke)', () => {
    const originalDbBridge = (globalThis as any).dbBridge

    beforeEach(() => {
        globalThis.localStorage?.removeItem('sv_debug_openrouter_echo_upstream_body')
        ;(globalThis as any).dbBridge = {
            invoke: vi.fn(async (method: string) => {
                if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
                return undefined
            }),
        }
    })

    afterEach(() => {
        globalThis.localStorage?.removeItem('sv_debug_openrouter_echo_upstream_body')
        ;(globalThis as any).dbBridge = originalDbBridge
    })

    const fixture = [
        ': OPENROUTER PROCESSING',
        '',
        `data: {"id":"gen_1","model":"${DEFAULT_OPENROUTER_TEST_MODEL}","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}`,
        '',
        'data: {"id":"gen_1","usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3},"choices":[]}',
        '',
        'data: [DONE]',
        '',
    ].join('\n')

    it('yields events for a streamed response (handles usage tail + empty choices)', async () => {
        const originalFetch = globalThis.fetch

        globalThis.fetch = vi.fn(async () => {
            const body = streamFromText(fixture)
            return new Response(body as any, {
                status: 200,
                headers: { 'x-openrouter-generation-id': 'gen_header' },
            })
        }) as any

        try {
            const events = []
            for await (const ev of streamOpenRouterChatAsEvents({
                requestId: 'rid',
                assistantMessageId: 'assistant_1',
                userText: 'hello',
                config: {
                    apiKey: 'k',
                    model: DEFAULT_OPENROUTER_TEST_MODEL,
                    requestedReasoningMode: 'effort',
                    requestedReasoningEffort: 'none',
                    requestedReasoningExclude: false,
                },
            })) {
                events.push(ev)
            }

            expect(events.some((e) => e.type === 'StreamComment')).toBe(true)
            expect(events.some((e) => e.type === 'MessageDeltaText')).toBe(true)
            expect(events.some((e) => e.type === 'UsageDelta')).toBe(true)
            expect(events.some((e) => e.type === 'StreamDone')).toBe(true)
            expect(events.find((e) => e.type === 'MetaDelta' && (e as any).meta?.id === 'gen_header')).toBeTruthy()
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    async function captureRequestBodyText(config: Parameters<typeof streamOpenRouterChatAsEvents>[0]['config']) {
        const originalFetch = globalThis.fetch
        const calls: any[] = []

        globalThis.fetch = vi.fn(async (url: any, init: any) => {
            calls.push({ url, init })
            const body = streamFromText(fixture)
            return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
        }) as any

        try {
            for await (const _ of streamOpenRouterChatAsEvents({
                requestId: 'rid',
                assistantMessageId: 'assistant_1',
                userText: 'hello',
                config,
            })) {
                // consume
            }

            const init = calls[0]?.init
            return String(init.body ?? '')
        } finally {
            globalThis.fetch = originalFetch
        }
    }

    it('Case1 default: mode=effort effort=none exclude=false => body.reasoning.effort==="none"', async () => {
        const bodyText = await captureRequestBodyText({
            apiKey: 'k',
            model: DEFAULT_OPENROUTER_TEST_MODEL,
            requestedReasoningMode: 'effort',
            requestedReasoningEffort: 'none',
            requestedReasoningExclude: false,
        })

        expect(bodyText).toContain('"reasoning":')
        expect(bodyText).toContain('"effort":"none"')
        expect(bodyText).not.toContain('"enabled":')
    })

    it('Case2 mode=auto => body must omit reasoning field', async () => {
        const bodyText = await captureRequestBodyText({
            apiKey: 'k',
            model: DEFAULT_OPENROUTER_TEST_MODEL,
            requestedReasoningMode: 'auto',
        })

        expect(bodyText).not.toContain('"reasoning":')
    })

    it.each([
        ['minimal', 'minimal'],
        ['low', 'low'],
    ] as const)('Case3 effort=%s => body.reasoning.effort=%s', async (_label, effort) => {
        const bodyText = await captureRequestBodyText({
            apiKey: 'k',
            model: DEFAULT_OPENROUTER_TEST_MODEL,
            requestedReasoningMode: 'effort',
            requestedReasoningEffort: effort,
        })

        expect(bodyText).toContain(`\"effort\":\"${effort}\"`)
        expect(bodyText).not.toContain('\"enabled\":')
    })

    it('Case4 exclude=true => body.reasoning.exclude===true', async () => {
        const bodyText = await captureRequestBodyText({
            apiKey: 'k',
            model: DEFAULT_OPENROUTER_TEST_MODEL,
            requestedReasoningMode: 'effort',
            requestedReasoningEffort: 'high',
            requestedReasoningExclude: true,
        })

        expect(bodyText).toContain('"reasoning":{"effort":"high","exclude":true}')
        expect(bodyText).not.toContain('"enabled":')
    })

    it('Case5: never sends reasoning.enabled:true', async () => {
        const bodyText = await captureRequestBodyText({
            apiKey: 'k',
            model: DEFAULT_OPENROUTER_TEST_MODEL,
            requestedReasoningMode: 'effort',
            requestedReasoningEffort: 'medium',
        })

        expect(bodyText).not.toContain('"enabled":')
    })

    it('includes debug echo patch only through the shared stream runtime debug entry', async () => {
        globalThis.localStorage?.setItem('sv_debug_openrouter_echo_upstream_body', '1')

        const bodyText = await captureRequestBodyText({
            apiKey: 'k',
            model: DEFAULT_OPENROUTER_TEST_MODEL,
            requestedReasoningMode: 'auto',
        })

        expect(bodyText).toContain('"debug":{"echo_upstream_body":true}')
    })

    it('mid-stream error chunk yields StreamError and terminates without StreamDone', async () => {
        const originalFetch = globalThis.fetch

        const midstream = [
            `data: {"id":"gen_1","model":"${DEFAULT_OPENROUTER_TEST_MODEL}","provider":"openai","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}`,
            '',
            `data: {"id":"gen_1","model":"${DEFAULT_OPENROUTER_TEST_MODEL}","provider":"openai","error":{"code":"server_error","message":"Provider disconnected","metadata":{"provider_name":"openai"}},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}`,
            '',
            'data: [DONE]',
            '',
        ].join('\n')

        globalThis.fetch = vi.fn(async () => {
            const body = streamFromText(midstream)
            return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
        }) as any

        try {
            const events = []
            for await (const ev of streamOpenRouterChatAsEvents({
                requestId: 'rid',
                assistantMessageId: 'assistant_1',
                userText: 'hello',
                config: { apiKey: 'k', model: DEFAULT_OPENROUTER_TEST_MODEL, requestedReasoningMode: 'auto' },
            })) {
                events.push(ev)
            }

            expect(events.some((e) => e.type === 'MessageDeltaText')).toBe(true)
            const streamError = events.find((e) => e.type === 'StreamError') as any
            expect(streamError).toBeTruthy()
            expect(streamError.error?.normalized?.normalized?.phase).toBe('generation')
            expect(streamError.error?.normalized?.normalized?.transport).toBe('sse')
            expect(streamError.error?.normalized?.normalized?.code).toBe('server_error')
            expect(streamError.error?.normalized?.normalized?.appPhase).toBe('mid_stream_error')
            expect(streamError.error?.normalized?.normalized?.category).toBe('provider_error_unknown')
            expect(streamError.error?.normalized?.normalized?.grade).toBe(1)
            expect(events.some((e) => e.type === 'StreamDone')).toBe(false)
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('maps delta.images chunks to MessageAppendContentBlock during streaming', async () => {
        const originalFetch = globalThis.fetch
        const imageFixture = [
            ': OPENROUTER PROCESSING',
            '',
            `data: {"id":"gen_img_1","model":"${DEFAULT_OPENROUTER_TEST_MODEL}","choices":[{"index":0,"delta":{"images":[{"image_url":{"url":"data:image/png;base64,AAAA"}}]},"finish_reason":null}]}`,
            '',
            'data: [DONE]',
            '',
        ].join('\n')

        globalThis.fetch = vi.fn(async () => {
            const body = streamFromText(imageFixture)
            return new Response(body as any, {
                status: 200,
                headers: { 'x-openrouter-generation-id': 'gen_img_1' },
            })
        }) as any

        try {
            const events = []
            for await (const ev of streamOpenRouterChatAsEvents({
                requestId: 'rid_img',
                assistantMessageId: 'assistant_1',
                userText: 'draw a cat',
                config: {
                    apiKey: 'k',
                    model: DEFAULT_OPENROUTER_TEST_MODEL,
                    requestedReasoningMode: 'auto',
                },
            })) {
                events.push(ev)
            }

            expect(events).toContainEqual({
                type: 'MessageAppendContentBlock',
                messageId: 'assistant_1',
                choiceIndex: 0,
                block: { type: 'image', url: 'data:image/png;base64,AAAA' },
            })
            expect(events.some((e) => e.type === 'StreamDone')).toBe(true)
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('finish_reason=length remains non-error and still emits StreamDone', async () => {
        const originalFetch = globalThis.fetch

        const lengthTruncated = [
            `data: {"id":"gen_1","model":"${DEFAULT_OPENROUTER_TEST_MODEL}","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":"length"}]}`,
            '',
            'data: [DONE]',
            '',
        ].join('\n')

        globalThis.fetch = vi.fn(async () => {
            const body = streamFromText(lengthTruncated)
            return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
        }) as any

        try {
            const events = []
            for await (const ev of streamOpenRouterChatAsEvents({
                requestId: 'rid',
                assistantMessageId: 'assistant_1',
                userText: 'hello',
                config: { apiKey: 'k', model: DEFAULT_OPENROUTER_TEST_MODEL, requestedReasoningMode: 'auto' },
            })) {
                events.push(ev)
            }

            const metaDelta = events.find((e) => e.type === 'MetaDelta' && (e as any).meta?.finish_reason) as any
            expect(metaDelta?.meta?.finish_reason).toBe('length')
            expect(events.some((e) => e.type === 'StreamError')).toBe(false)
            expect(events.some((e) => e.type === 'StreamDone')).toBe(true)
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('finish_reason=content_filter does not get downgraded to internal error', async () => {
        const originalFetch = globalThis.fetch

        const contentFiltered = [
            `data: {"id":"gen_1","model":"${DEFAULT_OPENROUTER_TEST_MODEL}","choices":[{"index":0,"delta":{"content":"filtered"},"finish_reason":"content_filter"}]}`,
            '',
            'data: [DONE]',
            '',
        ].join('\n')

        globalThis.fetch = vi.fn(async () => {
            const body = streamFromText(contentFiltered)
            return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
        }) as any

        try {
            const events = []
            for await (const ev of streamOpenRouterChatAsEvents({
                requestId: 'rid',
                assistantMessageId: 'assistant_1',
                userText: 'hello',
                config: { apiKey: 'k', model: DEFAULT_OPENROUTER_TEST_MODEL, requestedReasoningMode: 'auto' },
            })) {
                events.push(ev)
            }

            const metaDelta = events.find((e) => e.type === 'MetaDelta' && (e as any).meta?.finish_reason) as any
            expect(metaDelta?.meta?.finish_reason).toBe('content_filter')
            expect(events.some((e) => e.type === 'StreamError')).toBe(false)
            expect(events.some((e) => e.type === 'StreamDone')).toBe(true)
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('maps AbortError to StreamAbort (not StreamError)', async () => {
        const originalFetch = globalThis.fetch

        globalThis.fetch = vi.fn(async () => {
            const error = new Error('aborted')
            ;(error as any).name = 'AbortError'
            throw error
        }) as any

        try {
            const events = []
            for await (const ev of streamOpenRouterChatAsEvents({
                requestId: 'rid',
                assistantMessageId: 'assistant_1',
                userText: 'hello',
                config: { apiKey: 'k', model: DEFAULT_OPENROUTER_TEST_MODEL, requestedReasoningMode: 'auto' },
            })) {
                events.push(ev)
            }

            expect(events.some((e) => e.type === 'StreamAbort')).toBe(true)
            expect(events.some((e) => e.type === 'StreamError')).toBe(false)
            const end = events.find((e) => e.type === 'TimingSnapshot' && (e as any).endReason) as any
            expect(end?.endReason).toBe('user_abort')
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('IPC stream sends wireVersion and maps aborted wire event to StreamAbort', async () => {
        const originalElectronStore = (globalThis as any).electronStore
        const originalElectronApi = (globalThis as any).electronAPI
        const listeners = new Map<string, (...args: any[]) => void>()
        let startPayload: any = null
        const rawKey = 'sk-or-live-ipc-legacy-secret'
        const baseUrl = 'https://openrouter-proxy.example.test/custom/v1/'

        ;(globalThis as any).electronStore = {
            get: vi.fn(async (key: string) => {
                if (key === 'netExp.streamInMainProcess') return true
                if (key === 'netExp.tcpKeepAliveIdleMs') return 60000
                return false
            }),
            set: vi.fn(async () => undefined),
        }

        ;(globalThis as any).electronAPI = {
            onOpenRouterChunk: vi.fn((requestId: string, listener: (payload: unknown) => void) => {
                listeners.set(`openrouter:chunk:${requestId}`, listener)
                return () => listeners.delete(`openrouter:chunk:${requestId}`)
            }),
            onOpenRouterEnd: vi.fn((requestId: string, listener: () => void) => {
                listeners.set(`openrouter:end:${requestId}`, listener)
                return () => listeners.delete(`openrouter:end:${requestId}`)
            }),
            startOpenRouterStream: vi.fn(async (payload: any) => {
                startPayload = payload
                queueMicrotask(() => {
                    listeners.get(`openrouter:chunk:${startPayload.requestId}`)?.({
                        type: 'responseMeta',
                        status: 200,
                        requestId: startPayload.requestId,
                    })
                    listeners.get(`openrouter:chunk:${startPayload.requestId}`)?.({
                        type: 'error',
                        error: { kind: 'aborted', name: 'AbortError', code: 'ERR_ABORTED', message: 'aborted' },
                    })
                    listeners.get(`openrouter:end:${startPayload.requestId}`)?.()
                })
                return { ok: true }
            }),
            abortOpenRouterStream: vi.fn(async () => true),
        }

        try {
            const events = []
            for await (const ev of streamOpenRouterChatAsEvents({
                requestId: 'ipc_rid',
                assistantMessageId: 'assistant_1',
                userText: 'hello',
                config: { apiKey: rawKey, baseUrl, model: DEFAULT_OPENROUTER_TEST_MODEL, requestedReasoningMode: 'auto' },
            })) {
                events.push(ev)
            }

            expect(startPayload?.wireVersion).toBe(OPENROUTER_STREAM_WIRE_VERSION)
            expect(startPayload?.config?.apiKey).toBe(rawKey)
            expect(startPayload?.config?.baseUrl).toBe(baseUrl)
            expect(startPayload?.requestBody).toBeTruthy()
            expect(startPayload?.userText).toBe('hello')
            expect(JSON.stringify(startPayload?.requestBody)).not.toContain(rawKey)
            const serializedEvents = JSON.stringify(events)
            expect(serializedEvents).not.toContain(rawKey)
            expect(serializedEvents).not.toContain(`Bearer ${rawKey}`)
            expect(serializedEvents).not.toContain('Authorization')
            expect(events.some((e) => e.type === 'StreamAbort')).toBe(true)
            expect(events.some((e) => e.type === 'StreamError')).toBe(false)
            const end = events.find((e) => e.type === 'TimingSnapshot' && (e as any).endReason) as any
            expect(end?.endReason).toBe('user_abort')
        } finally {
            ;(globalThis as any).electronStore = originalElectronStore
            ;(globalThis as any).electronAPI = originalElectronApi
        }
    })

    it('IPC start protocol_invalid is normalized as local_protocol_error', async () => {
        const originalElectronStore = (globalThis as any).electronStore
        const originalElectronApi = (globalThis as any).electronAPI

        ;(globalThis as any).electronStore = {
            get: vi.fn(async (key: string) => {
                if (key === 'netExp.streamInMainProcess') return true
                if (key === 'netExp.tcpKeepAliveIdleMs') return 60000
                return false
            }),
            set: vi.fn(async () => undefined),
        }

        ;(globalThis as any).electronAPI = {
            onOpenRouterChunk: vi.fn(() => () => undefined),
            onOpenRouterEnd: vi.fn(() => () => undefined),
            startOpenRouterStream: vi.fn(async () => ({
                ok: false,
                code: 'protocol_invalid',
                error: `Unsupported wireVersion=99; expected ${OPENROUTER_STREAM_WIRE_VERSION}`,
                supportedWireVersion: OPENROUTER_STREAM_WIRE_VERSION,
            })),
            abortOpenRouterStream: vi.fn(async () => true),
        }

        try {
            const events = []
            for await (const ev of streamOpenRouterChatAsEvents({
                requestId: 'ipc_protocol_invalid',
                assistantMessageId: 'assistant_1',
                userText: 'hello',
                config: { apiKey: 'k', model: DEFAULT_OPENROUTER_TEST_MODEL, requestedReasoningMode: 'auto' },
            })) {
                events.push(ev)
            }

            const streamError = events.find((e) => e.type === 'StreamError') as any
            expect(streamError).toBeTruthy()
            expect(streamError.error?.normalized?.normalized?.appPhase).toBe('local_protocol_error')
            expect(streamError.error?.normalized?.normalized?.category).toBe('protocol_invalid')
            expect(streamError.error?.normalized?.normalized?.grade).toBe(3)
            expect(events.some((e) => e.type === 'StreamAbort')).toBe(false)
        } finally {
            ;(globalThis as any).electronStore = originalElectronStore
            ;(globalThis as any).electronAPI = originalElectronApi
        }
    })

    it('does not log sensitive error metadata by default', async () => {
        const originalFetch = globalThis.fetch
        const originalConsoleError = console.error
        const spy = vi.fn()
        console.error = spy as any
        try {
            globalThis.localStorage?.removeItem('sv_debug_stream_error')
        } catch {
            // no-op
        }
        try {
            const midstream = [
                `data: {"id":"gen_1","model":"${DEFAULT_OPENROUTER_TEST_MODEL}","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}`,
                '',
                `data: {"id":"gen_1","model":"${DEFAULT_OPENROUTER_TEST_MODEL}","error":{"code":"server_error","message":"Provider disconnected","metadata":{"provider_name":"openai","flagged_input":"very-secret","raw":{"token":"sensitive-raw"}}},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}`,
                '',
                'data: [DONE]',
                '',
            ].join('\n')

            globalThis.fetch = vi.fn(async () => {
                const body = streamFromText(midstream)
                return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
            }) as any

            const events = []
            for await (const ev of streamOpenRouterChatAsEvents({
                requestId: 'rid',
                assistantMessageId: 'assistant_1',
                userText: 'hello',
                config: { apiKey: 'k', model: DEFAULT_OPENROUTER_TEST_MODEL, requestedReasoningMode: 'auto' },
            })) {
                events.push(ev)
            }
            expect(events.some((e) => e.type === 'StreamError')).toBe(true)
            const logs = spy.mock.calls.map((args) => args.map((v) => String(v)).join(' ')).join('\n')
            expect(logs).not.toContain('very-secret')
            expect(logs).not.toContain('sensitive-raw')
            expect(logs).not.toContain('flagged_input')
        } finally {
            console.error = originalConsoleError
            globalThis.fetch = originalFetch
        }
    })

    it('includes multi-turn history when contextMessages are provided', async () => {
        const originalFetch = globalThis.fetch
        const calls: any[] = []

        globalThis.fetch = vi.fn(async (_url: any, init: any) => {
            calls.push({ init })
            const body = streamFromText(fixture)
            return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
        }) as any

        try {
            for await (const _ of streamOpenRouterChatAsEvents({
                requestId: 'rid',
                assistantMessageId: 'assistant_1',
                userText: 'third',
                contextMessages: [
                    { role: 'user', contentText: 'first' },
                    { role: 'assistant', contentText: 'second' },
                ],
                config: {
                    apiKey: 'k',
                    model: DEFAULT_OPENROUTER_TEST_MODEL,
                    requestedReasoningMode: 'auto',
                },
            })) {
                // consume
            }

            const bodyText = String(calls[0]?.init?.body ?? '')
            expect(bodyText).toContain('"messages":[')
            expect(bodyText).toContain('"role":"user","content":"first"')
            expect(bodyText).toContain('"role":"assistant","content":"second"')
            expect(bodyText).toContain('"role":"user","content":"third"')
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('passes pre-serialized multimodal user content blocks through without rebuilding eligibility', async () => {
        const originalFetch = globalThis.fetch
        const calls: any[] = []

        globalThis.fetch = vi.fn(async (_url: any, init: any) => {
            calls.push({ init })
            const body = streamFromText(fixture)
            return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
        }) as any

        try {
            for await (const _ of streamOpenRouterChatAsEvents({
                requestId: 'rid_multimodal',
                assistantMessageId: 'assistant_1',
                userText: 'describe the attachment',
                currentUserContentBlocks: [
                    { type: 'text', text: 'describe the attachment' },
                    { type: 'image_url', image_url: { url: 'https://cdn.example.test/photo.png' } },
                    { type: 'file', file: { filename: 'manual.pdf', file_data: 'https://cdn.example.test/manual.pdf' } },
                ],
                config: {
                    apiKey: 'k',
                    model: DEFAULT_OPENROUTER_TEST_MODEL,
                    requestedReasoningMode: 'auto',
                    openRouterAdditionalPlugins: [{ id: 'file-parser', pdf: { engine: 'native' } }],
                },
            })) {
                // consume
            }

            const bodyText = String(calls[0]?.init?.body ?? '')
            expect(bodyText).toContain('"plugins":[{"id":"file-parser","pdf":{"engine":"native"}}]')
            expect(bodyText).toContain('"content":[{"type":"text","text":"describe the attachment"},{"type":"image_url"')
            expect(bodyText).toContain('"type":"file","file":{"filename":"manual.pdf","file_data":"https://cdn.example.test/manual.pdf"}}')
        } finally {
            globalThis.fetch = originalFetch
        }
    })
})
/* eslint-enable max-lines-per-function */
