import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ImmutablePreparedBodyV2,
  stableSerializeProviderRequestBoundedV2,
  stableSerializeProviderRequestV2,
} from './stableSerialize'

describe('Generation Compiler V2 core', () => {
  it('serializes plain provider-native JSON deterministically by Unicode code point', () => {
    const left = { z: 1, a: { beta: true, alpha: ['原样', null, -0] } }
    const right = { a: { alpha: ['原样', null, 0], beta: true }, z: 1 }
    const expected = '{"a":{"alpha":["原样",null,0],"beta":true},"z":1}'
    expect(stableSerializeProviderRequestV2(left)).toBe(expected)
    expect(stableSerializeProviderRequestV2(right)).toBe(expected)
    expect(stableSerializeProviderRequestV2({ '𐀀': 2, '\uE000': 1 }))
      .toBe('{"":1,"𐀀":2}')
    expect(stableSerializeProviderRequestV2({ text: '\uD800' })).toBe('{"text":"\\ud800"}')
    const shared = { value: true }
    expect(stableSerializeProviderRequestV2({ left: shared, right: shared }))
      .toBe('{"left":{"value":true},"right":{"value":true}}')
    const nested = (levels: number): unknown => {
      let value: unknown = true
      for (let index = 0; index < levels; index += 1) value = { value }
      return value
    }
    expect(() => stableSerializeProviderRequestV2(nested(128))).not.toThrow()
    expect(() => stableSerializeProviderRequestV2(nested(129))).toThrow('GENERATION_V2_JSON_DEPTH_EXCEEDED')
  })

  it('rejects values that cannot belong to a closed provider-native JSON request', () => {
    expect(() => stableSerializeProviderRequestV2({ value: undefined })).toThrow('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
    expect(() => stableSerializeProviderRequestV2({ value: Number.NaN })).toThrow('GENERATION_V2_JSON_NON_FINITE_NUMBER')
    expect(() => stableSerializeProviderRequestV2({ value: new Date() })).toThrow('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => stableSerializeProviderRequestV2(cyclic)).toThrow('GENERATION_V2_JSON_CYCLE')
    expect(() => stableSerializeProviderRequestV2({ values: new Array(1) })).toThrow('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
    const symbolObject = { value: 1, [Symbol('hidden')]: 2 }
    expect(() => stableSerializeProviderRequestV2(symbolObject)).toThrow('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
    let getterCalls = 0
    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => { getterCalls += 1; return 'secret' },
    })
    expect(() => stableSerializeProviderRequestV2(accessor)).toThrow('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
    expect(getterCalls).toBe(0)
  })

  it('owns immutable exact bytes and returns defensive copies', () => {
    const body = ImmutablePreparedBodyV2.fromNativeRequest({ model: 'gpt-5', input: 'hello' })
    const first = body.copyBytes()
    first[0] = 0
    const second = body.copyBytes()
    expect(second[0]).toBe('{'.charCodeAt(0))
    expect(body.copyUtf8Text()).toBe('{"input":"hello","model":"gpt-5"}')
    expect(body.sha256).toBe(createHash('sha256').update(body.copyBytes()).digest('hex'))
    expect(() => Reflect.construct(ImmutablePreparedBodyV2 as never, ['raw-json']))
      .toThrow('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
    expect(() => Object.setPrototypeOf(body, { copyBytes: () => new Uint8Array([0]) }))
      .toThrow()
  })

  it('stops canonical serialization at the exact UTF-8 byte boundary including JSON escaping', () => {
    const value = { text: '\u0000\u0000' }
    const exact = stableSerializeProviderRequestV2(value)
    expect(exact).toBe('{"text":"\\u0000\\u0000"}')
    expect(stableSerializeProviderRequestBoundedV2(value, new TextEncoder().encode(exact).byteLength)).toBe(exact)
    expect(() => stableSerializeProviderRequestBoundedV2(value, new TextEncoder().encode(exact).byteLength - 1))
      .toThrow('GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED')
    expect(() => ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes({ a: '123', b: '456' }, 10))
      .toThrow('GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED')
  })

})
