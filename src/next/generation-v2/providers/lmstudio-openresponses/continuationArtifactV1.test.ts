import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildLmStudioOpenResponsesReplayInputV1,
  completeLmStudioOpenResponsesRequestV1,
  createLmStudioOpenResponsesContinuationArtifactV1,
  decodeLmStudioOpenResponsesContinuationArtifactV1,
  isLmStudioOpenResponsesContinuationArtifactV1,
  serializeLmStudioOpenResponsesContinuationArtifactV1,
} from './continuationArtifactV1'

const evidenceRaw = readFileSync(path.resolve(
  'docs/architecture/generation-compiler-v2/evidence/lmstudio-openresponses-compliance-20260714.json',
), 'utf8')
const evidence = JSON.parse(evidenceRaw) as { requests: Array<{
  name: string
  serializedBody?: string
  response?: { output?: unknown[] }
}> }

function request(name: string) {
  const value = evidence.requests.find((item) => item.name === name)
  if (!value) throw new Error(`missing evidence request ${name}`)
  return value
}

function input(name: string): unknown[] {
  return (JSON.parse(request(name).serializedBody!) as { input: unknown[] }).input
}

function output(name: string): unknown[] {
  return request(name).response!.output!
}

describe('LM Studio OpenResponses V1 continuation artifact', () => {
  it('locks the qualified local Gate 0 evidence bytes', () => {
    expect(createHash('sha256').update(evidenceRaw, 'utf8').digest('hex'))
      .toBe('6a30197f5d9a313ca9cc82b759fb8eb859bc62a0291e917ed7cdab3c477d57e5')
  })

  it('reproduces the qualified full-item replay body exactly without previous_response_id', () => {
    const first = completeLmStudioOpenResponsesRequestV1({
      priorArtifact: null,
      requestSequence: 1,
      clientItems: input('text_turn_1'),
      returnedItems: output('text_turn_1'),
    })
    const secondBody = input('text_turn_2_full_item_replay')
    const replay = buildLmStudioOpenResponsesReplayInputV1({
      priorArtifact: first,
      clientItems: [secondBody.at(-1)],
    })
    expect(replay).toEqual(secondBody)
    expect(JSON.stringify(replay)).not.toContain('previous_response_id')
    expect(first).not.toHaveProperty('responseId')
    expect(first).not.toHaveProperty('previousResponseId')
  })

  it('round-trips deterministic bytes/hash through a fresh decode', () => {
    const artifact = completeLmStudioOpenResponsesRequestV1({
      priorArtifact: null,
      requestSequence: 1,
      clientItems: input('reasoning_item_capture'),
      returnedItems: output('reasoning_item_capture'),
    })
    const serialized = serializeLmStudioOpenResponsesContinuationArtifactV1(artifact)
    const decoded = decodeLmStudioOpenResponsesContinuationArtifactV1(JSON.parse(serialized))
    expect(decoded).toEqual(artifact)
    expect(decoded.artifactHash).toBe(artifact.artifactHash)
    expect(serializeLmStudioOpenResponsesContinuationArtifactV1(decoded)).toBe(serialized)
    expect(isLmStudioOpenResponsesContinuationArtifactV1(decoded)).toBe(true)
    expect(Object.isFrozen(decoded)).toBe(true)
    expect(decoded).not.toHaveProperty('contractId')
    expect(decoded).not.toHaveProperty('contractRevision')
  })

  it('keeps shared branch prefixes immutable and produces independent artifacts', () => {
    const prefix = completeLmStudioOpenResponsesRequestV1({
      priorArtifact: null,
      requestSequence: 1,
      clientItems: input('text_turn_1'),
      returnedItems: output('text_turn_1'),
    })
    const before = serializeLmStudioOpenResponsesContinuationArtifactV1(prefix)
    const branchAInput = input('branch_a_from_same_prefix')
    const branchBInput = input('branch_b_from_same_prefix')
    const branchA = completeLmStudioOpenResponsesRequestV1({
      priorArtifact: prefix, requestSequence: 2,
      clientItems: [branchAInput.at(-1)], returnedItems: output('branch_a_from_same_prefix'),
    })
    const branchB = completeLmStudioOpenResponsesRequestV1({
      priorArtifact: prefix, requestSequence: 2,
      clientItems: [branchBInput.at(-1)], returnedItems: output('branch_b_from_same_prefix'),
    })
    expect(serializeLmStudioOpenResponsesContinuationArtifactV1(prefix)).toBe(before)
    expect(branchA.artifactHash).not.toBe(branchB.artifactHash)
    expect(branchA.orderedItems.slice(0, prefix.orderedItems.length)).toEqual(prefix.orderedItems)
    expect(branchB.orderedItems.slice(0, prefix.orderedItems.length)).toEqual(prefix.orderedItems)
  })

  it('preserves reasoning and function call/output items across request sequences', () => {
    const reasoning = completeLmStudioOpenResponsesRequestV1({
      priorArtifact: null, requestSequence: 1,
      clientItems: input('reasoning_item_capture'), returnedItems: output('reasoning_item_capture'),
    })
    const reasoningReplay = buildLmStudioOpenResponsesReplayInputV1({
      priorArtifact: reasoning,
      clientItems: [input('reasoning_item_exact_replay').at(-1)],
    })
    expect(reasoningReplay).toEqual(input('reasoning_item_exact_replay'))

    const called = completeLmStudioOpenResponsesRequestV1({
      priorArtifact: null, requestSequence: 1,
      clientItems: input('function_call_capture'), returnedItems: output('function_call_capture'),
    })
    const toolReplay = input('function_call_output_full_item_replay')
    const completed = completeLmStudioOpenResponsesRequestV1({
      priorArtifact: called, requestSequence: 2,
      clientItems: toolReplay.slice(called.orderedItems.length),
      returnedItems: output('function_call_output_full_item_replay'),
    })
    expect(completed.orderedItems.slice(0, -1)).toEqual(toolReplay)
    expect(completed.orderedItems).toContainEqual(expect.objectContaining({
      type: 'function_call', arguments: '{"a":2,"b":3}',
    }))
    expect(completed.orderedItems).toContainEqual(expect.objectContaining({
      type: 'function_call_output', output: '5',
    }))
  })

  it('rejects hash/content/wrapper tampering and unbranded artifact input', () => {
    const artifact = completeLmStudioOpenResponsesRequestV1({
      priorArtifact: null, requestSequence: 1,
      clientItems: input('text_turn_1'), returnedItems: output('text_turn_1'),
    })
    const raw = JSON.parse(serializeLmStudioOpenResponsesContinuationArtifactV1(artifact))
    expect(() => decodeLmStudioOpenResponsesContinuationArtifactV1({ ...raw, artifactHash: '0'.repeat(64) }))
      .toThrow('HASH_MISMATCH')
    expect(() => decodeLmStudioOpenResponsesContinuationArtifactV1({ ...raw, previous_response_id: 'resp_bad' }))
      .toThrow('INVALID_SHAPE')
    expect(() => buildLmStudioOpenResponsesReplayInputV1({
      priorArtifact: raw, clientItems: [],
    })).toThrow('UNBRANDED')
  })

  it('rejects nonadjacent request sequences, unmatched/duplicate tool output and duplicate returned ids', () => {
    const called = completeLmStudioOpenResponsesRequestV1({
      priorArtifact: null, requestSequence: 1,
      clientItems: input('function_call_capture'), returnedItems: output('function_call_capture'),
    })
    expect(() => completeLmStudioOpenResponsesRequestV1({
      priorArtifact: called, requestSequence: 3, clientItems: [], returnedItems: [],
    })).toThrow('SEQUENCE_INVALID')
    expect(() => buildLmStudioOpenResponsesReplayInputV1({
      priorArtifact: null,
      clientItems: [{ type: 'function_call_output', call_id: 'missing', output: '5' }],
    })).toThrow('SEQUENCE_INVALID')
    const outputItem = { type: 'function_call_output', call_id: 'call_1345753369540001', output: '5' }
    expect(() => createLmStudioOpenResponsesContinuationArtifactV1({
      requestSequence: 2,
      orderedItems: [...called.orderedItems, outputItem, outputItem],
    })).toThrow('SEQUENCE_INVALID')
    const message = output('text_turn_1')[0]
    expect(() => createLmStudioOpenResponsesContinuationArtifactV1({
      requestSequence: 1,
      orderedItems: [input('text_turn_1')[0], message, message],
    })).toThrow('SEQUENCE_INVALID')
  })

  it('rejects replay bodies whose escaped serialized bytes exceed the wire limit', () => {
    const escaping = '\u0000'.repeat(3_500_000)
    expect(() => buildLmStudioOpenResponsesReplayInputV1({
      priorArtifact: null,
      clientItems: [{ role: 'user', content: [{ type: 'input_text', text: escaping }] }],
    })).toThrow('LIMIT_EXCEEDED')
  })
})
