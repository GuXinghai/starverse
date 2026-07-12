import { describe, expect, it } from 'vitest'
import { CompatibleSseFramer } from './sseFramer'
import { CompatibleWireError } from './wireError'

const bytes = (value: string) => new TextEncoder().encode(value)

describe('CompatibleSseFramer', () => {
  it('associates event/id/retry/comments with multiline LF data and removes exactly one space', () => {
    const framer = new CompatibleSseFramer()
    expect(framer.push(bytes(': keep\nevent: chunk\nid: abc\nretry: 12\ndata:  first\ndata:second\n\n'))).toEqual([{
      kind: 'event', event: 'chunk', id: 'abc', retry: 12, comments: ['keep'], data: ' first\nsecond',
    }])
  })

  it('supports CRLF, empty events, comments and DONE', () => {
    const framer = new CompatibleSseFramer()
    expect(framer.push(bytes('\r\n:ping\r\n\r\ndata: [DONE]\r\n\r\n'))).toEqual([
      { kind: 'event', data: '', comments: [] },
      { kind: 'event', data: '', comments: ['ping'] },
      { kind: 'done' },
    ])
    expect(framer.sawDone).toBe(true)
  })

  it('preserves UTF-8 across every byte boundary', () => {
    const encoded = bytes('data: {"text":"你🙂"}\n\n')
    for (let split = 1; split < encoded.length; split += 1) {
      const framer = new CompatibleSseFramer()
      const frames = [...framer.push(encoded.slice(0, split)), ...framer.push(encoded.slice(split))]
      expect(frames).toEqual([{ kind: 'event', data: '{"text":"你🙂"}', comments: [] }])
    }
  })

  it('dispatches an unterminated final event at EOF and is idempotent', () => {
    const framer = new CompatibleSseFramer()
    expect(framer.push(bytes('data: final'))).toEqual([])
    expect(framer.finish()).toEqual([{ kind: 'event', data: 'final', comments: [] }])
    expect(framer.finish()).toEqual([])
  })

  it('rejects bare CR, invalid UTF-8 and late bytes after DONE', () => {
    expect(() => {
      const framer = new CompatibleSseFramer()
      framer.push(bytes('data: x\rdata: y\n\n'))
    }).toThrow(CompatibleWireError)
    expect(() => new CompatibleSseFramer().push(new Uint8Array([0xff]))).toThrow(CompatibleWireError)
    const done = new CompatibleSseFramer()
    done.push(bytes('data: [DONE]\n\n'))
    expect(() => done.push(bytes('data: {}\n\n'))).toThrow(CompatibleWireError)
  })

  it('enforces pending, event and cumulative byte limits', () => {
    expect(() => new CompatibleSseFramer({ maxPendingBytes: 3 }).push(bytes('abcd'))).toThrow(/compatible_sse_overflow/)
    expect(() => new CompatibleSseFramer({ maxEventBytes: 3 }).push(bytes('data: abcd\n'))).toThrow(/compatible_sse_overflow/)
    expect(() => new CompatibleSseFramer({ maxTotalBytes: 3 }).push(bytes('abcd'))).toThrow(/compatible_sse_overflow/)
  })

  it('applies the pending limit to an incomplete line rather than the complete input chunk', () => {
    const framer = new CompatibleSseFramer({ maxPendingBytes: 8, maxEventBytes: 64 })
    const input = 'data: 1\n\ndata: 2\n\n'
    expect(bytes(input).byteLength).toBeGreaterThan(8)
    expect(framer.push(bytes(input))).toHaveLength(2)
  })

  it('rejects non-positive, non-integer and non-finite limits', () => {
    expect(() => new CompatibleSseFramer({ maxEventBytes: 0 })).toThrow(/compatible_config_invalid/)
    expect(() => new CompatibleSseFramer({ maxEventBytes: Number.NaN })).toThrow(/compatible_config_invalid/)
  })

  it('accepts exact byte limits and rejects the next byte', () => {
    expect(new CompatibleSseFramer({ maxPendingBytes: 3 }).push(bytes('abc'))).toEqual([])
    expect(new CompatibleSseFramer({ maxTotalBytes: 3 }).push(bytes('a\n\n'))).toHaveLength(1)
    expect(new CompatibleSseFramer({ maxEventBytes: 8 }).push(bytes('data: x\n\n'))).toHaveLength(1)
    expect(() => new CompatibleSseFramer({ maxEventBytes: 7 }).push(bytes('data: x\n'))).toThrow(/compatible_sse_overflow/)
  })

  it('never exposes partial raw frames on a thrown framing error', () => {
    try {
      new CompatibleSseFramer().push(bytes('data: private-output\n\nbad\rline\n'))
      throw new Error('expected framing failure')
    } catch (error) {
      expect(error).toBeInstanceOf(CompatibleWireError)
      expect(JSON.stringify(error)).not.toContain('private-output')
      expect(error).not.toHaveProperty('partialFrames')
    }
  })
})
