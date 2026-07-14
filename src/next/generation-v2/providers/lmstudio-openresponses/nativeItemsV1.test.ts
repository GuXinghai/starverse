import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  decodeLmStudioOpenResponsesClientItemsV1,
  decodeLmStudioOpenResponsesReplayItemV1,
  decodeLmStudioOpenResponsesReplayItemsV1,
  decodeLmStudioOpenResponsesReturnedItemsV1,
  LMSTUDIO_OPENRESPONSES_MAX_ITEM_STRING_BYTES_V1,
} from './nativeItemsV1'

const evidence = JSON.parse(readFileSync(path.resolve(
  'docs/architecture/generation-compiler-v2/evidence/lmstudio-openresponses-compliance-20260714.json',
), 'utf8')) as { requests: Array<{ name: string; serializedBody?: string; response?: { output?: unknown[] } }> }

function request(name: string) {
  const value = evidence.requests.find((item) => item.name === name)
  if (!value) throw new Error(`missing evidence request ${name}`)
  return value
}

function bodyInput(name: string): unknown[] {
  return (JSON.parse(request(name).serializedBody!) as { input: unknown[] }).input
}

describe('LM Studio OpenResponses V1 native replay items', () => {
  it('decodes every qualified native item shape without reducing it to visible text', () => {
    const user = bodyInput('text_turn_1')[0]
    const message = request('text_turn_1').response!.output![0]
    const reasoning = request('reasoning_item_capture').response!.output![0]
    const call = request('function_call_capture').response!.output![0]
    const callOutput = bodyInput('function_call_output_full_item_replay')[2]
    const items = decodeLmStudioOpenResponsesReplayItemsV1([user, message, reasoning, call, callOutput])
    expect(items.map((item) => 'type' in item ? item.type : item.role)).toEqual([
      'user', 'message', 'reasoning', 'function_call', 'function_call_output',
    ])
    expect(items[3]).toMatchObject({ arguments: '{"a":2,"b":3}', call_id: 'call_1345753369540001' })
    expect(items[4]).toMatchObject({ output: '5', call_id: 'call_1345753369540001' })
    expect(Object.isFrozen(items)).toBe(true)
    expect(Object.isFrozen((items[1] as { content: unknown }).content)).toBe(true)
  })

  it('keeps returned and client item directions closed', () => {
    const user = bodyInput('text_turn_1')[0]
    const message = request('text_turn_1').response!.output![0]
    const callOutput = bodyInput('function_call_output_full_item_replay')[2]
    expect(decodeLmStudioOpenResponsesClientItemsV1([user, callOutput])).toHaveLength(2)
    expect(decodeLmStudioOpenResponsesReturnedItemsV1([message])).toHaveLength(1)
    expect(() => decodeLmStudioOpenResponsesClientItemsV1([message])).toThrow('DIRECTION_INVALID')
    expect(() => decodeLmStudioOpenResponsesReturnedItemsV1([user])).toThrow('DIRECTION_INVALID')
    expect(() => decodeLmStudioOpenResponsesReturnedItemsV1([callOutput])).toThrow('DIRECTION_INVALID')
  })

  it('rejects unknown fields, item/content types and unqualified native variants', () => {
    const message = request('text_turn_1').response!.output![0] as Record<string, unknown>
    for (const value of [
      { ...message, extra: true },
      { ...message, status: 'in_progress' },
      { ...message, type: 'computer_call' },
      { ...message, content: [{ type: 'refusal', refusal: 'no' }] },
      { ...message, content: [{ type: 'output_text', text: 'x', annotations: [{}], logprobs: [] }] },
      { id: 'rs_1', type: 'reasoning', status: 'completed', summary: [{}], content: [] },
    ]) expect(() => decodeLmStudioOpenResponsesReplayItemV1(value)).toThrow()
  })

  it('rejects accessors, symbols, sparse arrays, custom prototypes and undefined', () => {
    let getterCalls = 0
    const accessor = Object.defineProperty({ role: 'user' }, 'content', {
      enumerable: true,
      get: () => { getterCalls += 1; return [{ type: 'input_text', text: 'x' }] },
    })
    const symbol = { role: 'user', content: [{ type: 'input_text', text: 'x' }], [Symbol('x')]: true }
    const sparse = new Array(1)
    const custom = Object.create({ inherited: true })
    Object.assign(custom, { role: 'user', content: [{ type: 'input_text', text: 'x' }] })
    for (const value of [
      accessor, symbol, { role: 'user', content: sparse }, custom,
      { role: 'user', content: undefined },
    ]) expect(() => decodeLmStudioOpenResponsesReplayItemV1(value)).toThrow()
    expect(getterCalls).toBe(0)
  })

  it('enforces per-string and aggregate replay budgets', () => {
    const oversized = 'x'.repeat(LMSTUDIO_OPENRESPONSES_MAX_ITEM_STRING_BYTES_V1 + 1)
    expect(() => decodeLmStudioOpenResponsesReplayItemV1({
      role: 'user', content: [{ type: 'input_text', text: oversized }],
    })).toThrow('LIMIT_EXCEEDED')
    const parts = Array.from({ length: 4_096 }, () => ({ type: 'input_text', text: '' }))
    expect(() => decodeLmStudioOpenResponsesReplayItemsV1(
      Array.from({ length: 5 }, () => ({ role: 'user', content: parts })),
    )).toThrow('LIMIT_EXCEEDED')
  })
})
