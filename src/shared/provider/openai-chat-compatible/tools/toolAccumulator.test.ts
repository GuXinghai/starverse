import { describe, expect, it } from 'vitest'
import { CompatibleToolAccumulator } from './toolAccumulator'
import { CompatibleToolContractError } from './toolTypes'
import { toCompatibleToolSafeView } from './toolViewModel'

const IDENTITY = Object.freeze({ routeProvenanceId: 'ocp_route_12345678', messageId: 'a1', choiceIndex: 0 })
type BoundApplyInput = Omit<Parameters<CompatibleToolAccumulator['apply']>[0], keyof typeof IDENTITY>

function createAccumulator(options: Readonly<{ maxArgumentsBytes?: number }> = {}) {
  const accumulator = new CompatibleToolAccumulator({ ...IDENTITY, ...options })
  return {
    apply: (input: BoundApplyInput) => accumulator.apply({ ...IDENTITY, ...input }),
    finalize: (finishReason: string | null) => accumulator.finalize(finishReason),
    list: () => accumulator.list(),
  }
}

describe('CompatibleToolAccumulator', () => {
  it('merges fragmented id, name and arguments in monotonic sequence and finalizes a JSON object', () => {
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 2, fragment: { toolIndex: 0, id: 'call_', type: 'function', functionName: 'look', argumentsFragment: '{"city":"上' } })
    accumulator.apply({ sequence: 4, fragment: { toolIndex: 0, id: '1', functionName: 'up', argumentsFragment: '海"}' } })
    expect(accumulator.finalize('tool_calls')).toEqual([expect.objectContaining({
      toolIndex: 0,
      toolCallId: 'call_1',
      toolType: 'function',
      functionName: 'lookup',
      argumentsText: '{"city":"上海"}',
      argumentsJson: '{"city":"上海"}',
      status: 'complete',
      executionState: 'not_executed',
      sequenceStart: 2,
      sequenceEnd: 4,
    })])
  })

  it('keeps parallel calls isolated and orders by tool index', () => {
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 1, fragment: { toolIndex: 2, id: 'c2', type: 'function', functionName: 'b', argumentsFragment: '{}' } })
    accumulator.apply({ sequence: 3, fragment: { toolIndex: 0, id: 'c0', type: 'function', functionName: 'a', argumentsFragment: '{"x":1}' } })
    expect(accumulator.finalize('tool_calls').map((call) => [call.toolIndex, call.toolCallId, call.argumentsText])).toEqual([
      [0, 'c0', '{"x":1}'],
      [2, 'c2', '{}'],
    ])
  })

  it('rejects duplicate provider tool IDs across indexes without partial finalization', () => {
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 1, fragment: { toolIndex: 0, id: 'duplicate', type: 'function', functionName: 'a', argumentsFragment: '{}' } })
    accumulator.apply({ sequence: 2, fragment: { toolIndex: 1, id: 'duplicate', type: 'function', functionName: 'b', argumentsFragment: '{}' } })
    expect(() => accumulator.finalize('tool_calls')).toThrowError(expect.objectContaining({ code: 'tool_id_duplicate' }))
    expect(accumulator.list().every((call) => call.status === 'streaming')).toBe(true)
  })

  it('rejects fragments from a different route, message or choice before mutation', () => {
    const accumulator = new CompatibleToolAccumulator(IDENTITY)
    expect(() => accumulator.apply({ ...IDENTITY, choiceIndex: 1, sequence: 0, fragment: { toolIndex: 0, id: 'wrong' } }))
      .toThrowError(expect.objectContaining({ code: 'tool_sequence_conflict' }))
    expect(accumulator.list()).toEqual([])
  })

  it('treats an exact duplicate sequence as idempotent and rejects changed or lower sequences', () => {
    const accumulator = createAccumulator()
    const input = { sequence: 5, fragment: { toolIndex: 0, id: 'c', type: 'function' as const } }
    expect(accumulator.apply(input)).toEqual(accumulator.apply(input))
    expect(() => accumulator.apply({ sequence: 5, fragment: { toolIndex: 0, id: 'other' } })).toThrowError(expect.objectContaining({ code: 'tool_sequence_conflict' }))
    expect(() => accumulator.apply({ sequence: 4, fragment: { toolIndex: 0, functionName: 'f' } })).toThrowError(expect.objectContaining({ code: 'tool_sequence_out_of_order' }))
  })

  it('normalizes equivalent non-stream and stream fragments to the same final aggregate', () => {
    const stream = createAccumulator()
    stream.apply({ sequence: 0, fragment: { toolIndex: 0, id: 'call' } })
    stream.apply({ sequence: 1, fragment: { toolIndex: 0, type: 'function', functionName: 'f', argumentsFragment: '{"a":' } })
    stream.apply({ sequence: 2, fragment: { toolIndex: 0, argumentsFragment: '1}' } })
    const final = createAccumulator()
    final.apply({ sequence: 0, fragment: { toolIndex: 0, id: 'call', type: 'function', functionName: 'f', argumentsFragment: '{"a":1}' } })
    const stripSequence = ({ sequenceStart: _start, sequenceEnd: _end, ...value }: ReturnType<CompatibleToolAccumulator['finalize']>[number]) => value
    expect(stripSequence(stream.finalize('tool_calls')[0])).toEqual(stripSequence(final.finalize('tool_calls')[0]))
  })

  it.each([
    ['missing id', [{ toolIndex: 0, type: 'function', functionName: 'f', argumentsFragment: '{}' }], 'incomplete', 'tool_id_missing'],
    ['missing name', [{ toolIndex: 0, id: 'c', type: 'function', argumentsFragment: '{}' }], 'incomplete', 'tool_name_missing'],
    ['missing arguments', [{ toolIndex: 0, id: 'c', type: 'function', functionName: 'f' }], 'incomplete', 'tool_arguments_missing'],
    ['malformed arguments', [{ toolIndex: 0, id: 'c', type: 'function', functionName: 'f', argumentsFragment: '{' }], 'malformed', 'tool_arguments_malformed'],
    ['scalar arguments', [{ toolIndex: 0, id: 'c', type: 'function', functionName: 'f', argumentsFragment: '1' }], 'malformed', 'tool_arguments_not_object'],
  ] as const)('persists %s as a visible terminal diagnostic', (_name, fragments, status, diagnosticCode) => {
    const accumulator = createAccumulator()
    fragments.forEach((fragment, sequence) => accumulator.apply({ sequence, fragment }))
    expect(accumulator.finalize('tool_calls')).toEqual([expect.objectContaining({ status, diagnosticCode, argumentsJson: null })])
  })

  it('marks observed calls incomplete when finish reason is not tool_calls', () => {
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 0, fragment: { toolIndex: 0, id: 'c', type: 'function', functionName: 'f', argumentsFragment: '{}' } })
    expect(accumulator.finalize('stop')[0]).toMatchObject({ status: 'incomplete', diagnosticCode: 'tool_finish_reason_mismatch' })
  })

  it('blocks fragments after finalization and makes identical finalization idempotent', () => {
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 0, fragment: { toolIndex: 0, id: 'c', type: 'function', functionName: 'f', argumentsFragment: '{}' } })
    expect(accumulator.finalize('tool_calls')).toEqual(accumulator.finalize('tool_calls'))
    expect(() => accumulator.apply({ sequence: 1, fragment: { toolIndex: 0, argumentsFragment: ' ' } })).toThrowError(expect.objectContaining({ code: 'tool_fragment_after_final' }))
  })

  it('does not poison accumulator state when empty tool_calls finalization is rejected', () => {
    const accumulator = createAccumulator()
    expect(() => accumulator.finalize('tool_calls')).toThrowError(expect.objectContaining({ code: 'tool_arguments_missing' }))
    expect(accumulator.apply({ sequence: 0, fragment: { toolIndex: 0, id: 'c' } })).toMatchObject({ toolCallId: 'c' })
  })

  it('marks deeply nested valid JSON as bounded malformed without partial finalization or throws', () => {
    let deep: unknown = true
    for (let index = 0; index < 70; index += 1) deep = { nested: deep }
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 0, fragment: { toolIndex: 0, id: 'c', type: 'function', functionName: 'f', argumentsFragment: JSON.stringify(deep) } })
    expect(accumulator.finalize('tool_calls')[0]).toMatchObject({
      status: 'malformed', diagnosticCode: 'tool_arguments_overflow', argumentsJson: null,
    })
    expect(accumulator.finalize('tool_calls')[0]).toMatchObject({ status: 'malformed' })
  })

  it('bounds identity and raw arguments without executing or repairing them', () => {
    const argumentsBound = createAccumulator({ maxArgumentsBytes: 3 })
    argumentsBound.apply({ sequence: 0, fragment: { toolIndex: 0, argumentsFragment: '四' } })
    expect(() => argumentsBound.apply({ sequence: 1, fragment: { toolIndex: 0, argumentsFragment: 'a' } }))
      .toThrowError(expect.objectContaining({ code: 'tool_arguments_overflow' }))
    expect(argumentsBound.list()[0]).toMatchObject({ argumentsText: '四', sequenceEnd: 0 })
    expect(argumentsBound.apply({ sequence: 1, fragment: { toolIndex: 0, functionName: 'f' } })).toMatchObject({ sequenceEnd: 1, functionName: 'f' })

    const identityBound = createAccumulator()
    expect(() => identityBound.apply({ sequence: 0, fragment: { toolIndex: 0, id: 'x'.repeat(257) } }))
      .toThrowError(expect.objectContaining({ code: 'tool_id_overflow' }))
    expect(identityBound.list()).toEqual([])
    expect(identityBound.apply({ sequence: 0, fragment: { toolIndex: 0, id: 'ok' } })).toMatchObject({ toolCallId: 'ok' })
  })

  it('preserves identical fragments arriving at different sequences', () => {
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 0, fragment: { toolIndex: 0, id: 'a', functionName: 'x', argumentsFragment: '{"a":"' } })
    expect(accumulator.apply({ sequence: 1, fragment: { toolIndex: 0, id: 'a', functionName: 'x', argumentsFragment: 'x"}' } })).toMatchObject({
      toolCallId: 'aa', functionName: 'xx', argumentsText: '{"a":"x"}',
    })
  })

  it('projects a plain observe-only view with parsed arguments and no executor control', () => {
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 0, fragment: { toolIndex: 0, id: 'c', type: 'function', functionName: '<b>f</b>', argumentsFragment: '{"html":"<script>"}' } })
    const view = toCompatibleToolSafeView(accumulator.finalize('tool_calls')[0])
    expect(view).toMatchObject({ functionName: '<b>f</b>', parsedArguments: { html: '<script>' }, executionState: 'not_executed' })
    expect(view).not.toHaveProperty('execute')
  })

  it('uses a typed error without raw provider payload fields', () => {
    const error = new CompatibleToolContractError('tool_arguments_malformed')
    expect(error.code).toBe('tool_arguments_malformed')
    expect(error).not.toHaveProperty('argumentsText')
  })
})
