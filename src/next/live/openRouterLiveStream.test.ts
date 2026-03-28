import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamOpenRouterChatAsEvents } from '@/next/live/openRouterLiveStream'
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
        'data: {"id":"gen_1","model":"openrouter/auto","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}',
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
                    model: 'openrouter/auto',
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
            model: 'openrouter/auto',
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
            model: 'openrouter/auto',
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
            model: 'openrouter/auto',
            requestedReasoningMode: 'effort',
            requestedReasoningEffort: effort,
        })

        expect(bodyText).toContain(`\"effort\":\"${effort}\"`)
        expect(bodyText).not.toContain('\"enabled\":')
    })

    it('Case4 exclude=true => body.reasoning.exclude===true', async () => {
        const bodyText = await captureRequestBodyText({
            apiKey: 'k',
            model: 'openrouter/auto',
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
            model: 'openrouter/auto',
            requestedReasoningMode: 'effort',
            requestedReasoningEffort: 'medium',
        })

        expect(bodyText).not.toContain('"enabled":')
    })

    it('includes debug echo patch only through the shared stream runtime debug entry', async () => {
        globalThis.localStorage?.setItem('sv_debug_openrouter_echo_upstream_body', '1')

        const bodyText = await captureRequestBodyText({
            apiKey: 'k',
            model: 'openrouter/auto',
            requestedReasoningMode: 'auto',
        })

        expect(bodyText).toContain('"debug":{"echo_upstream_body":true}')
    })

    it('mid-stream error chunk yields StreamError and terminates without StreamDone', async () => {
        const originalFetch = globalThis.fetch

        const midstream = [
            'data: {"id":"gen_1","model":"openrouter/auto","provider":"openai","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}',
            '',
            'data: {"id":"gen_1","model":"openrouter/auto","provider":"openai","error":{"code":"server_error","message":"Provider disconnected","metadata":{"provider_name":"openai"}},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}',
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
                config: { apiKey: 'k', model: 'openrouter/auto', requestedReasoningMode: 'auto' },
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
            'data: {"id":"gen_img_1","model":"openrouter/auto","choices":[{"index":0,"delta":{"images":[{"image_url":{"url":"data:image/png;base64,AAAA"}}]},"finish_reason":null}]}',
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
                    model: 'openrouter/auto',
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
            'data: {"id":"gen_1","model":"openrouter/auto","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":"length"}]}',
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
                config: { apiKey: 'k', model: 'openrouter/auto', requestedReasoningMode: 'auto' },
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
            'data: {"id":"gen_1","model":"openrouter/auto","choices":[{"index":0,"delta":{"content":"filtered"},"finish_reason":"content_filter"}]}',
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
                config: { apiKey: 'k', model: 'openrouter/auto', requestedReasoningMode: 'auto' },
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
                config: { apiKey: 'k', model: 'openrouter/auto', requestedReasoningMode: 'auto' },
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
        const originalIpcRenderer = (globalThis as any).ipcRenderer
        const listeners = new Map<string, (...args: any[]) => void>()
        let startPayload: any = null

        ;(globalThis as any).electronStore = {
            get: vi.fn(async (key: string) => {
                if (key === 'netExp.streamInMainProcess') return true
                if (key === 'netExp.tcpKeepAliveIdleMs') return 60000
                return false
            }),
            set: vi.fn(async () => undefined),
        }

        ;(globalThis as any).ipcRenderer = {
            on: vi.fn((channel: string, listener: (...args: any[]) => void) => {
                listeners.set(channel, listener)
            }),
            off: vi.fn((channel: string) => {
                listeners.delete(channel)
            }),
            invoke: vi.fn(async (channel: string, ...args: any[]) => {
                if (channel === 'openrouter:stream-chat') {
                    startPayload = args[0]
                    queueMicrotask(() => {
                        listeners.get(`openrouter:chunk:${startPayload.requestId}`)?.({}, {
                            type: 'responseMeta',
                            status: 200,
                            requestId: startPayload.requestId,
                        })
                        listeners.get(`openrouter:chunk:${startPayload.requestId}`)?.({}, {
                            type: 'error',
                            error: { kind: 'aborted', name: 'AbortError', code: 'ERR_ABORTED', message: 'aborted' },
                        })
                        listeners.get(`openrouter:end:${startPayload.requestId}`)?.({})
                    })
                    return { ok: true }
                }
                if (channel === 'openrouter:abort') return true
                return undefined
            }),
        }

        try {
            const events = []
            for await (const ev of streamOpenRouterChatAsEvents({
                requestId: 'ipc_rid',
                assistantMessageId: 'assistant_1',
                userText: 'hello',
                config: { apiKey: 'k', model: 'openrouter/auto', requestedReasoningMode: 'auto' },
            })) {
                events.push(ev)
            }

            expect(startPayload?.wireVersion).toBe(OPENROUTER_STREAM_WIRE_VERSION)
            expect(startPayload?.requestBody).toBeTruthy()
            expect(startPayload?.userText).toBe('hello')
            expect(events.some((e) => e.type === 'StreamAbort')).toBe(true)
            expect(events.some((e) => e.type === 'StreamError')).toBe(false)
            const end = events.find((e) => e.type === 'TimingSnapshot' && (e as any).endReason) as any
            expect(end?.endReason).toBe('user_abort')
        } finally {
            ;(globalThis as any).electronStore = originalElectronStore
            ;(globalThis as any).ipcRenderer = originalIpcRenderer
        }
    })

    it('IPC start protocol_invalid is normalized as local_protocol_error', async () => {
        const originalElectronStore = (globalThis as any).electronStore
        const originalIpcRenderer = (globalThis as any).ipcRenderer

        ;(globalThis as any).electronStore = {
            get: vi.fn(async (key: string) => {
                if (key === 'netExp.streamInMainProcess') return true
                if (key === 'netExp.tcpKeepAliveIdleMs') return 60000
                return false
            }),
            set: vi.fn(async () => undefined),
        }

        ;(globalThis as any).ipcRenderer = {
            on: vi.fn(),
            off: vi.fn(),
            invoke: vi.fn(async (channel: string) => {
                if (channel === 'openrouter:stream-chat') {
                    return {
                        ok: false,
                        code: 'protocol_invalid',
                        error: `Unsupported wireVersion=99; expected ${OPENROUTER_STREAM_WIRE_VERSION}`,
                        supportedWireVersion: OPENROUTER_STREAM_WIRE_VERSION,
                    }
                }
                return true
            }),
        }

        try {
            const events = []
            for await (const ev of streamOpenRouterChatAsEvents({
                requestId: 'ipc_protocol_invalid',
                assistantMessageId: 'assistant_1',
                userText: 'hello',
                config: { apiKey: 'k', model: 'openrouter/auto', requestedReasoningMode: 'auto' },
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
            ;(globalThis as any).ipcRenderer = originalIpcRenderer
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
                'data: {"id":"gen_1","model":"openrouter/auto","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}',
                '',
                'data: {"id":"gen_1","model":"openrouter/auto","error":{"code":"server_error","message":"Provider disconnected","metadata":{"provider_name":"openai","flagged_input":"very-secret","raw":{"token":"sensitive-raw"}}},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}',
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
                config: { apiKey: 'k', model: 'openrouter/auto', requestedReasoningMode: 'auto' },
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
                    model: 'openrouter/auto',
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
})
/* eslint-enable max-lines-per-function */
