import { describe, expect, it } from 'vitest'
import { createLmStudioTerminalCheckpointV1, readLmStudioTerminalCheckpointV1 } from '../../../../core/generation-v2/providers/lmstudio-openresponses/terminalCheckpointV1'

const item = (text: string) => ({ id: 'reasoning:1', type: 'reasoning', status: 'incomplete',
  summary: [], content: [{ type: 'reasoning_text', text }] })
const terminal = (text: string) => ({ state: 'incomplete', returnedItems: [item(text)],
  responseId: 'response:1', model: 'local-model', usage: { output_tokens: 4 }, error: null })
const event = (text: string) => ({ type: 'response.incomplete', sequence_number: 1,
  response: { status: 'incomplete', id: 'response:1', model: 'local-model', output: [item(text)],
    usage: { output_tokens: 4 }, error: null } })

describe('LM Studio terminal checkpoint', () => {
  it('retains every original wire fact and refers to its validated terminal once', () => {
    const wire = [{ type: 'response.created' }, event('partial reasoning')]
    const checkpoint = createLmStudioTerminalCheckpointV1(wire, terminal('partial reasoning'))
    expect(checkpoint.wireEvents).toBe(wire)
    expect(checkpoint).not.toHaveProperty('terminalResult')
    expect(checkpoint.terminalResultRef).toEqual({ kind: 'wire_terminal', index: 1 })
    expect(readLmStudioTerminalCheckpointV1(JSON.parse(JSON.stringify(checkpoint)))).toEqual(terminal('partial reasoning'))
  })

  it('retains a receipt-derived terminal once after restart and reads prior inline checkpoints', () => {
    const checkpoint = createLmStudioTerminalCheckpointV1([], terminal('recovered'))
    expect(readLmStudioTerminalCheckpointV1(checkpoint)).toEqual(terminal('recovered'))
    expect(readLmStudioTerminalCheckpointV1({ wireEvents: [], complete: false })).toBeNull()
    expect(readLmStudioTerminalCheckpointV1({ wireEvents: [event('legacy')],
      terminalResult: terminal('legacy') })).toEqual(terminal('legacy'))
  })

  it('rejects an inconsistent native result or a forged wire reference', () => {
    expect(() => createLmStudioTerminalCheckpointV1([event('original')], terminal('changed'))).toThrow()
    expect(() => readLmStudioTerminalCheckpointV1({ wireEvents: [event('original')],
      terminalResultRef: { kind: 'wire_terminal', index: 2 } })).toThrow()
    expect(() => readLmStudioTerminalCheckpointV1({ wireEvents: [event('original')],
      terminalResult: terminal('original'), terminalResultRef: { kind: 'wire_terminal', index: 0 } })).toThrow()
  })

  it('fits the existing 128 MiB snapshot ceiling for a valid large terminal and prompt', () => {
    const reasoning = 'r'.repeat(55 * 1024 * 1024)
    const prompt = 'q'.repeat(19 * 1024 * 1024)
    const wire = [event(reasoning)], result = terminal(reasoning)
    const oldBytes = Buffer.byteLength(JSON.stringify({ native: { wireEvents: wire, terminalResult: result },
      replay: [{ role: 'user', content: prompt }] }))
    expect(oldBytes).toBeGreaterThan(128 * 1024 * 1024)
    const compact = { native: createLmStudioTerminalCheckpointV1(wire, result),
      replay: [{ role: 'user', content: prompt }] }
    expect(Buffer.byteLength(JSON.stringify(compact))).toBeLessThan(128 * 1024 * 1024)
    expect(readLmStudioTerminalCheckpointV1(compact.native)?.returnedItems[0]).toEqual(item(reasoning))
  }, 30_000)
})
