import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialState, startGeneration, applyEvent } from './reducer'
import { buildAbortEnvelope, buildTransportErrorEnvelope } from '../errors/openRouterErrorEnvelope'
import { normalizeOpenRouterUnknownStreamingError } from '../errors/normalizeOpenRouterError'
import type { DomainEvent, RootState } from './types'

describe('reducer TimingSnapshot handling', () => {
    const runId = 'run_1'
    const requestId = 'req_1'

    afterEach(() => {
        vi.useRealTimers()
    })

    function setup(): RootState {
        const { state } = startGeneration(createInitialState(), {
            runId,
            requestId,
            model: 'test-model',
        })
        return state
    }

    it('applies tRequestStart from TimingSnapshot', () => {
        let state = setup()
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tRequestStart: 1000,
        })

        expect(state.runs[runId].tRequestStart).toBe(1000)
        expect(state.runs[runId].tAck).toBeUndefined()
        expect(state.runs[runId].tEnd).toBeUndefined()
        expect(state.runs[runId].localProcessingDurationMs).toBeUndefined()
    })

    it('applies tAck from TimingSnapshot (first-write-wins)', () => {
        let state = setup()

        // First tAck
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 1500,
        })
        expect(state.runs[runId].tAck).toBe(1500)

        // Attempt to overwrite tAck - should be ignored
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 9999,
        })
        expect(state.runs[runId].tAck).toBe(1500) // unchanged
    })

    it('calculates duration when first output arrives after tAck', () => {
        let state = setup()

        const assistantId = state.runs[runId].targetAssistantMessageId!

        // First event: only tAck
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 1000,
        })
        expect(state.runs[runId].tAck).toBe(1000)
        expect(state.runs[runId].localProcessingDurationMs).toBeUndefined()

        vi.useFakeTimers()
        vi.setSystemTime(3500)

        // First output -> freeze tEnd
        state = applyEvent(state, runId, {
            type: 'MessageDeltaText',
            messageId: assistantId,
            choiceIndex: 0,
            text: 'hello',
        })

        // End reason may arrive later; duration should already be computed
        expect(state.runs[runId].tEnd).toBe(3500)
        expect(state.runs[runId].localProcessingDurationMs).toBe(2500)

        // End reason update should not change tEnd
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tEnd: 3500,
            endReason: 'normal_complete',
        } as DomainEvent)
        expect(state.runs[runId].endReason).toBe('normal_complete')
        expect(state.runs[runId].localProcessingDurationMs).toBe(2500) // 3500 - 1000
    })

    it('calculates duration when tool calls appear as first output', () => {
        let state = setup()

        const assistantId = state.runs[runId].targetAssistantMessageId!

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 2000,
        } as DomainEvent)

        vi.useFakeTimers()
        vi.setSystemTime(5000)

        state = applyEvent(state, runId, {
            type: 'MessageDeltaToolCall',
            messageId: assistantId,
            choiceIndex: 0,
            mergeStrategy: 'append',
            toolCallDeltas: [{ index: 0, function: { name: 'test', arguments: '{}' } }],
        })

        expect(state.runs[runId].tAck).toBe(2000)
        expect(state.runs[runId].tEnd).toBe(5000)
        expect(state.runs[runId].localProcessingDurationMs).toBe(3000)
    })

    it('freezes tEnd on first output and does not overwrite on later output', () => {
        let state = setup()

        const assistantId = state.runs[runId].targetAssistantMessageId!

        state = applyEvent(state, runId, { type: 'TimingSnapshot', tAck: 1000 })

        vi.useFakeTimers()
        vi.setSystemTime(3500)
        state = applyEvent(state, runId, {
            type: 'MessageDeltaText',
            messageId: assistantId,
            choiceIndex: 0,
            text: 'x',
        })

        expect(state.runs[runId].tEnd).toBe(3500)
        expect(state.runs[runId].localProcessingDurationMs).toBe(2500)

        vi.setSystemTime(9999)
        state = applyEvent(state, runId, {
            type: 'MessageDeltaText',
            messageId: assistantId,
            choiceIndex: 0,
            text: 'y',
        })

        expect(state.runs[runId].tEnd).toBe(3500) // unchanged
        expect(state.runs[runId].localProcessingDurationMs).toBe(2500) // unchanged
    })

    it('applies tTransportClosed for diagnostics', () => {
        let state = setup()

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 1000,
            endReason: 'transport_error',
            tTransportClosed: 3100,
        } as DomainEvent)

        expect(state.runs[runId].tTransportClosed).toBe(3100)
        expect(state.runs[runId].localProcessingDurationMs).toBeUndefined()
    })

    it('handles user_abort end reason', () => {
        let state = setup()

        const assistantId = state.runs[runId].targetAssistantMessageId!

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 500,
        })

        vi.useFakeTimers()
        vi.setSystemTime(2500)
        state = applyEvent(state, runId, {
            type: 'MessageDeltaText',
            messageId: assistantId,
            choiceIndex: 0,
            text: 'hi',
        })

        state = applyEvent(state, runId, { type: 'StreamAbort', reason: 'aborted', envelope: buildAbortEnvelope({ phase: 'mid_stream', completionClass: 'aborted', reason: 'aborted' }) })

        expect(state.runs[runId].endReason).toBe('user_abort')
        expect(state.runs[runId].localProcessingDurationMs).toBe(2000)
    })

    it('handles pre_stream_error with no tAck', () => {
        let state = setup()

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tRequestStart: 1000,
            endReason: 'pre_stream_error',
        } as DomainEvent)

        expect(state.runs[runId].tRequestStart).toBe(1000)
        expect(state.runs[runId].tAck).toBeUndefined()
        expect(state.runs[runId].tEnd).toBeUndefined()
        expect(state.runs[runId].endReason).toBe('pre_stream_error')
        expect(state.runs[runId].localProcessingDurationMs).toBeUndefined() // no tAck = no duration
    })

    it('handles mid_stream_error end reason', () => {
        let state = setup()

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 1000,
            endReason: 'mid_stream_error',
        } as DomainEvent)

        expect(state.runs[runId].endReason).toBe('mid_stream_error')
        expect(state.runs[runId].localProcessingDurationMs).toBeUndefined()
    })

    it('preserves existing tRequestStart when not provided in event', () => {
        let state = setup()

        // First set tRequestStart
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tRequestStart: 100,
        })
        expect(state.runs[runId].tRequestStart).toBe(100)

        // Send tAck without tRequestStart - should preserve
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 200,
        })
        expect(state.runs[runId].tRequestStart).toBe(100) // unchanged
        expect(state.runs[runId].tAck).toBe(200)
    })

    it('finalizes timing once and preserves user_abort priority', () => {
        let state = setup()

        const assistantId = state.runs[runId].targetAssistantMessageId!

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 1000,
            endReason: 'normal_complete',
        } as DomainEvent)

        vi.useFakeTimers()
        vi.setSystemTime(2500)
        state = applyEvent(state, runId, {
            type: 'MessageDeltaText',
            messageId: assistantId,
            choiceIndex: 0,
            text: 'hi',
        })

        state = applyEvent(state, runId, { type: 'StreamAbort', reason: 'aborted', envelope: buildAbortEnvelope({ phase: 'mid_stream', completionClass: 'aborted', reason: 'aborted' }) })
        const msg = state.messages[assistantId]

        expect(msg.reasoningDurationMs).toBe(1500)
        expect(msg.reasoningEndReason).toBe('user_abort')

        const normalized1 = normalizeOpenRouterUnknownStreamingError({ message: 'oops' })
        const envelope1 = buildTransportErrorEnvelope({
            phase: 'mid_stream',
            completionClass: 'error',
            message: 'oops',
            normalized: normalized1,
            kind: 'transport_error',
        })
        state = applyEvent(state, runId, { type: 'StreamError', error: envelope1, terminal: true } as DomainEvent)
        const msgAfter = state.messages[assistantId]
        expect(msgAfter.reasoningDurationMs).toBe(1500)
        expect(msgAfter.reasoningEndReason).toBe('user_abort')
    })

    it('finalizes with NULL duration when tAck missing', () => {
        let state = setup()

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tEnd: 1500,
            endReason: 'pre_stream_error',
        } as DomainEvent)

        const normalized2 = normalizeOpenRouterUnknownStreamingError({ message: 'oops' })
        const envelope2 = buildTransportErrorEnvelope({
            phase: 'pre_stream',
            completionClass: 'error',
            message: 'oops',
            normalized: normalized2,
            kind: 'transport_error',
        })
        state = applyEvent(state, runId, { type: 'StreamError', error: envelope2, terminal: true } as DomainEvent)
        const assistantId = state.runs[runId].targetAssistantMessageId!
        const msg = state.messages[assistantId]

        expect(msg.reasoningDurationMs).toBeNull()
        expect(msg.reasoningEndReason).toBe('pre_stream_error')
    })

    it('clamps negative duration to zero on finalize', () => {
        let state = setup()

        const assistantId = state.runs[runId].targetAssistantMessageId!

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 5000,
            endReason: 'normal_complete',
        } as DomainEvent)

        vi.useFakeTimers()
        vi.setSystemTime(3000)
        state = applyEvent(state, runId, {
            type: 'MessageDeltaText',
            messageId: assistantId,
            choiceIndex: 0,
            text: 'x',
        })

        state = applyEvent(state, runId, { type: 'StreamDone' })
        const msg = state.messages[assistantId]

        expect(msg.reasoningDurationMs).toBe(0)
        expect(msg.reasoningEndReason).toBe('normal_complete')
    })
})
