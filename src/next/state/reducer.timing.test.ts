import { describe, expect, it } from 'vitest'
import { createInitialState, startGeneration, applyEvent } from './reducer'
import type { DomainEvent, RootState } from './types'

describe('reducer TimingSnapshot handling', () => {
    const runId = 'run_1'
    const requestId = 'req_1'

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

    it('calculates duration when tAck and tEnd arrive in separate events', () => {
        let state = setup()

        // First event: only tAck
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 1000,
        })
        expect(state.runs[runId].tAck).toBe(1000)
        expect(state.runs[runId].localProcessingDurationMs).toBeUndefined()

        // Second event: tEnd + endReason
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tEnd: 3500,
            endReason: 'normal_complete',
        } as DomainEvent)
        expect(state.runs[runId].tEnd).toBe(3500)
        expect(state.runs[runId].endReason).toBe('normal_complete')
        expect(state.runs[runId].localProcessingDurationMs).toBe(2500) // 3500 - 1000
    })

    it('calculates duration when tAck and tEnd arrive in same event', () => {
        let state = setup()

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 2000,
            tEnd: 5000,
            endReason: 'normal_complete',
        } as DomainEvent)

        expect(state.runs[runId].tAck).toBe(2000)
        expect(state.runs[runId].tEnd).toBe(5000)
        expect(state.runs[runId].endReason).toBe('normal_complete')
        expect(state.runs[runId].localProcessingDurationMs).toBe(3000)
    })

    it('does not overwrite terminal state (guard rail)', () => {
        let state = setup()

        // Set terminal state
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 1000,
            tEnd: 3500,
            endReason: 'normal_complete',
        } as DomainEvent)
        expect(state.runs[runId].tEnd).toBe(3500)
        expect(state.runs[runId].endReason).toBe('normal_complete')
        expect(state.runs[runId].localProcessingDurationMs).toBe(2500)

        // Attempt to overwrite with different values - should be ignored
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tEnd: 9999,
            endReason: 'transport_error',
        } as DomainEvent)
        expect(state.runs[runId].tEnd).toBe(3500) // unchanged
        expect(state.runs[runId].endReason).toBe('normal_complete') // unchanged
        expect(state.runs[runId].localProcessingDurationMs).toBe(2500) // unchanged
    })

    it('applies tTransportClosed for diagnostics', () => {
        let state = setup()

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 1000,
            tEnd: 3000,
            endReason: 'transport_error',
            tTransportClosed: 3100,
        } as DomainEvent)

        expect(state.runs[runId].tTransportClosed).toBe(3100)
        expect(state.runs[runId].localProcessingDurationMs).toBe(2000) // based on tEnd, not tTransportClosed
    })

    it('handles user_abort end reason', () => {
        let state = setup()

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 500,
        })
        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tEnd: 2500,
            endReason: 'user_abort',
        } as DomainEvent)

        expect(state.runs[runId].endReason).toBe('user_abort')
        expect(state.runs[runId].localProcessingDurationMs).toBe(2000)
    })

    it('handles pre_stream_error with no tAck', () => {
        let state = setup()

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tRequestStart: 1000,
            tEnd: 1500,
            endReason: 'pre_stream_error',
        } as DomainEvent)

        expect(state.runs[runId].tRequestStart).toBe(1000)
        expect(state.runs[runId].tAck).toBeUndefined()
        expect(state.runs[runId].tEnd).toBe(1500)
        expect(state.runs[runId].endReason).toBe('pre_stream_error')
        expect(state.runs[runId].localProcessingDurationMs).toBeUndefined() // no tAck = no duration
    })

    it('handles mid_stream_error end reason', () => {
        let state = setup()

        state = applyEvent(state, runId, {
            type: 'TimingSnapshot',
            tAck: 1000,
            tEnd: 2000,
            endReason: 'mid_stream_error',
        } as DomainEvent)

        expect(state.runs[runId].endReason).toBe('mid_stream_error')
        expect(state.runs[runId].localProcessingDurationMs).toBe(1000)
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
})
