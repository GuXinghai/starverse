import { describe, expect, it } from 'vitest'
import {
  createGenerationRequestAttemptOpenStateV2,
  projectGenerationRequestAttemptStateV2,
  restoreGenerationRequestAttemptStateV2,
  transitionGenerationRequestAttemptTerminalV2,
} from './generationRequestTerminalV2'

const key = Object.freeze({ operationId: 'op-terminal-1', requestSequence: 1, attempt: 1 })
const outcomes = Object.freeze([
  Object.freeze({ kind: 'provider_completed', phase: 'mid_stream' }),
  Object.freeze({
    kind: 'provider_failed', phase: 'pre_stream',
    failure: Object.freeze({ code: 'provider_failed', message: 'Provider rejected the request.' }),
  }),
  Object.freeze({
    kind: 'provider_incomplete', phase: 'mid_stream',
    failure: Object.freeze({ code: 'provider_incomplete', message: 'Provider stopped before completion.' }),
  }),
  Object.freeze({ kind: 'user_cancelled', phase: 'mid_stream' }),
  Object.freeze({ kind: 'connection_closed_without_terminal', phase: 'mid_stream' }),
  Object.freeze({ kind: 'process_interrupted', phase: 'pre_stream' }),
])

function signal(outcome: unknown, overrideKey: unknown = key) {
  return { key: overrideKey, outcome }
}

describe('Generation Request terminal V2 reducer', () => {
  it.each(outcomes)('accepts each closed semantic terminal exactly once: $kind', (outcome) => {
    const open = createGenerationRequestAttemptOpenStateV2(key)
    const accepted = transitionGenerationRequestAttemptTerminalV2(open, signal(outcome))
    expect(accepted).toMatchObject({ kind: 'accepted', persistRequired: true })
    expect(accepted.state).toMatchObject({ state: 'terminal', outcome })
    expect(accepted.state.fingerprint).toMatch(/^[0-9a-f]{64}$/u)
    expect(Object.isFrozen(accepted)).toBe(true)
    expect(Object.isFrozen(accepted.state)).toBe(true)
    expect(Object.isFrozen(accepted.state.outcome)).toBe(true)

    const replay = transitionGenerationRequestAttemptTerminalV2(accepted.state, signal(outcome))
    expect(replay).toEqual({ kind: 'idempotent_replay', state: accepted.state, persistRequired: false })
    expect(replay.state).toBe(accepted.state)
  })

  it('reports every changed terminal as a no-write conflict without changing the winner', () => {
    for (let winner = 0; winner < outcomes.length; winner += 1) {
      const accepted = transitionGenerationRequestAttemptTerminalV2(
        createGenerationRequestAttemptOpenStateV2(key), signal(outcomes[winner]),
      )
      expect(accepted.kind).toBe('accepted')
      for (let contender = 0; contender < outcomes.length; contender += 1) {
        if (contender === winner) continue
        const conflict = transitionGenerationRequestAttemptTerminalV2(accepted.state, signal(outcomes[contender]))
        expect(conflict).toMatchObject({
          kind: 'conflict', code: 'GENERATION_V2_ATTEMPT_TERMINAL_CONFLICT',
          state: accepted.state, persistRequired: false,
        })
        if (conflict.kind !== 'conflict') throw new Error('expected terminal conflict')
        expect(conflict.conflictingFingerprint).not.toBe(accepted.state.fingerprint)
      }
    }
  })

  it('locks the complete attempt key and semantic outcome into the terminal fingerprint', () => {
    const accepted = transitionGenerationRequestAttemptTerminalV2(
      createGenerationRequestAttemptOpenStateV2(key), signal(outcomes[0]),
    )
    expect(accepted.state.fingerprint)
      .toBe('0ec75060188eef0b774dc1df55239a067758a7937b793d1c372fb90361e122d5')
  })

  it('makes cancel/completed order explicit without encoding a priority policy', () => {
    const completedFirst = transitionGenerationRequestAttemptTerminalV2(
      createGenerationRequestAttemptOpenStateV2(key), signal(outcomes[0]),
    )
    const cancelAfter = transitionGenerationRequestAttemptTerminalV2(completedFirst.state, signal(outcomes[3]))
    expect(completedFirst.state.outcome.kind).toBe('provider_completed')
    expect(cancelAfter.kind).toBe('conflict')

    const cancelFirst = transitionGenerationRequestAttemptTerminalV2(
      createGenerationRequestAttemptOpenStateV2(key), signal(outcomes[3]),
    )
    const completedAfter = transitionGenerationRequestAttemptTerminalV2(cancelFirst.state, signal(outcomes[0]))
    expect(cancelFirst.state.outcome.kind).toBe('user_cancelled')
    expect(completedAfter.kind).toBe('conflict')
  })

  it('preserves incomplete, EOF and interruption as distinct request outcomes for the future runner', () => {
    expect(outcomes.slice(2).map((outcome) => transitionGenerationRequestAttemptTerminalV2(
      createGenerationRequestAttemptOpenStateV2(key), signal(outcome),
    ).state.outcome.kind)).toEqual([
      'provider_incomplete', 'user_cancelled', 'connection_closed_without_terminal', 'process_interrupted',
    ])
  })

  it('projects and restores open/terminal state with deterministic tamper detection', () => {
    const open = createGenerationRequestAttemptOpenStateV2(key)
    const openProjection = projectGenerationRequestAttemptStateV2(open)
    expect(restoreGenerationRequestAttemptStateV2({ ...openProjection })).toMatchObject(open)

    const accepted = transitionGenerationRequestAttemptTerminalV2(open, signal(outcomes[2]))
    const projection = projectGenerationRequestAttemptStateV2(accepted.state)
    const restored = restoreGenerationRequestAttemptStateV2(JSON.parse(JSON.stringify(projection)))
    expect(projectGenerationRequestAttemptStateV2(restored)).toEqual(projection)
    expect(transitionGenerationRequestAttemptTerminalV2(restored, signal(outcomes[2])).kind)
      .toBe('idempotent_replay')
    expect(() => restoreGenerationRequestAttemptStateV2({
      ...projection, fingerprint: '0'.repeat(64),
    })).toThrow('FINGERPRINT_MISMATCH')
    expect(() => restoreGenerationRequestAttemptStateV2({
      ...projection, outcome: outcomes[0],
    })).toThrow('FINGERPRINT_MISMATCH')
  })

  it('rejects mismatched attempt identity without producing a terminal state', () => {
    const open = createGenerationRequestAttemptOpenStateV2(key)
    for (const changed of [
      { ...key, operationId: 'op-other' },
      { ...key, requestSequence: 2 },
      { ...key, attempt: 2 },
    ]) {
      expect(() => transitionGenerationRequestAttemptTerminalV2(open, signal(outcomes[0], changed)))
        .toThrow('KEY_MISMATCH')
    }
  })

  it('rejects invalid keys, phases, failures and unknown or accessor fields', () => {
    for (const invalidKey of [
      { ...key, requestSequence: 0 }, { ...key, requestSequence: 1.5 },
      { ...key, attempt: 0 }, { ...key, operationId: ' op ' },
    ]) {
      expect(() => createGenerationRequestAttemptOpenStateV2(invalidKey)).toThrow()
    }
    const open = createGenerationRequestAttemptOpenStateV2(key)
    expect(() => transitionGenerationRequestAttemptTerminalV2(open, signal({
      kind: 'provider_completed', phase: 'pre_stream',
    }))).toThrow('INVALID_VALUE')
    expect(() => transitionGenerationRequestAttemptTerminalV2(open, signal({
      kind: 'provider_incomplete', phase: 'pre_stream',
      failure: { code: 'provider_incomplete', message: 'x' },
    }))).toThrow('INVALID_VALUE')
    expect(() => transitionGenerationRequestAttemptTerminalV2(open, signal({
      kind: 'provider_failed', phase: 'mid_stream', failure: { code: ' bad ', message: 'x' },
    }))).toThrow('INVALID_VALUE')
    expect(() => transitionGenerationRequestAttemptTerminalV2(open, signal({
      kind: 'provider_failed', phase: 'mid_stream', failure: { code: 'bad', message: 'x', raw: {} },
    }))).toThrow('INVALID_SHAPE')
    expect(() => transitionGenerationRequestAttemptTerminalV2(open, signal({
      kind: 'user_cancelled', phase: 'mid_stream', priority: 'cancel_wins',
    }))).toThrow('INVALID_SHAPE')
    expect(() => transitionGenerationRequestAttemptTerminalV2(open, signal(Object.defineProperty(
      { phase: 'mid_stream' }, 'kind', { enumerable: true, get: () => 'provider_completed' },
    )))).toThrow('INVALID_SHAPE')
    expect(() => transitionGenerationRequestAttemptTerminalV2(open, signal({
      kind: 'provider_failed', phase: 'mid_stream', failure: {
        code: 'bad', get message() { return 'accessor' },
      },
    }))).toThrow('INVALID_SHAPE')
  })

  it('rejects unbranded state objects and never accepts branch or operation-finalizer fields', () => {
    expect(() => transitionGenerationRequestAttemptTerminalV2(
      { state: 'open', key } as never, signal(outcomes[0]),
    )).toThrow('UNBRANDED_STATE')
    expect(() => transitionGenerationRequestAttemptTerminalV2(
      createGenerationRequestAttemptOpenStateV2(key),
      { ...signal(outcomes[0]), chosenAnswerRootId: 'answer-1' },
    )).toThrow('INVALID_SHAPE')
  })
})
