import { describe, expect, it } from 'vitest'
import { IpcContractDecodeError } from './decodeError'
import { decodeOpenRouterStreamWireEvent } from './openRouterStreamWireContracts'

type WireContractCase = Readonly<{
  name: string
  valid: unknown
  missing: unknown
  wrongType: unknown
  withExtra: unknown
}>

function expectProtocolInvalidError(error: unknown): void {
  expect(error).toBeInstanceOf(IpcContractDecodeError)
  const e = error as IpcContractDecodeError
  expect(e.appError.phase).toBe('local_protocol_error')
  expect(e.appError.category).toBe('protocol_invalid')
  expect(e.appError.grade).toBe(3)
}

const cases: WireContractCase[] = [
  {
    name: 'chunk',
    valid: { type: 'chunk', data: 'data: {"id":"gen_1"}\n\n' },
    missing: { type: 'chunk' },
    wrongType: { type: 'chunk', data: 123 },
    withExtra: { type: 'chunk', data: 'x', traceId: 'trace_1' },
  },
  {
    name: 'responseMeta',
    valid: { type: 'responseMeta', status: 200, requestId: 'rid_1', headers: { 'x-request-id': 'rid_1' } },
    missing: { type: 'responseMeta', requestId: 'rid_1' },
    wrongType: { type: 'responseMeta', status: '200' },
    withExtra: { type: 'responseMeta', status: 200, provider: 'openrouter', traceId: 'trace_2' },
  },
  {
    name: 'error',
    valid: { type: 'error', error: { kind: 'transport_error', message: 'socket closed', code: 'ECONNRESET' } },
    missing: { type: 'error', error: { message: 'socket closed' } },
    wrongType: { type: 'error', error: { kind: 1, message: 'socket closed' } },
    withExtra: { type: 'error', error: { kind: 'transport_error', message: 'x' }, traceId: 'trace_3' },
  },
  {
    name: 'end',
    valid: { type: 'end' },
    missing: {},
    wrongType: { type: 1 },
    withExtra: { type: 'end', traceId: 'trace_4' },
  },
]

describe('open router stream wire contract decoder', () => {
  for (const c of cases) {
    it(`${c.name}: missing required field rejects with protocol_invalid`, () => {
      expect(() => decodeOpenRouterStreamWireEvent(c.missing)).toThrowError(IpcContractDecodeError)
      try {
        decodeOpenRouterStreamWireEvent(c.missing)
      } catch (error) {
        expectProtocolInvalidError(error)
      }
    })

    it(`${c.name}: wrong field type rejects with protocol_invalid`, () => {
      expect(() => decodeOpenRouterStreamWireEvent(c.wrongType)).toThrowError(IpcContractDecodeError)
      try {
        decodeOpenRouterStreamWireEvent(c.wrongType)
      } catch (error) {
        expectProtocolInvalidError(error)
      }
    })

    it(`${c.name}: unknown extra field is tolerated`, () => {
      const decoded = decodeOpenRouterStreamWireEvent(c.withExtra) as Record<string, unknown>
      expect(decoded.type).toBe((c.valid as Record<string, unknown>).type)
      expect(decoded.traceId).toMatch(/trace_/)
    })
  }

  it('unknown event type rejects with protocol_invalid', () => {
    expect(() => decodeOpenRouterStreamWireEvent({ type: 'mystery', foo: 'bar' })).toThrowError(IpcContractDecodeError)
    try {
      decodeOpenRouterStreamWireEvent({ type: 'mystery', foo: 'bar' })
    } catch (error) {
      expectProtocolInvalidError(error)
    }
  })
})
