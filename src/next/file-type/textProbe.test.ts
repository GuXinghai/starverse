import { describe, expect, it } from 'vitest'
import { probeText } from './textProbe'

function encodeUtf16Le(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    out[i * 2] = code & 0xff
    out[i * 2 + 1] = (code >> 8) & 0xff
  }
  return out
}

function encodeUtf16Be(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    out[i * 2] = (code >> 8) & 0xff
    out[i * 2 + 1] = code & 0xff
  }
  return out
}

describe('textProbe', () => {
  it('detects utf8 json and classifies structured text', () => {
    const bytes = new TextEncoder().encode('{"name":"starverse"}')
    const result = probeText(bytes)
    expect(result.encoding).toBe('utf8')
    expect(result.evidence?.detectedFormatId).toBe('json')
    expect(result.evidence?.confidence).toBe('high')
  })

  it('detects utf16le with NUL bytes and does not treat it as binary directly', () => {
    const bytes = encodeUtf16Le('hello world')
    const result = probeText(bytes)
    expect(result.encoding).toBe('utf16le')
    expect(result.flags).not.toContain('possibly_binary_text')
    expect(result.evidence?.detectedFormatId).toBe('plain_text')
  })

  it('detects utf16be with BOM', () => {
    const payload = encodeUtf16Be('<svg></svg>')
    const withBom = new Uint8Array([0xfe, 0xff, ...payload])
    const result = probeText(withBom)
    expect(result.encoding).toBe('utf16be')
    expect(result.evidence?.detectedFormatId).toBe('svg')
  })

  it('flags large line text', () => {
    const bytes = new TextEncoder().encode('a'.repeat(9000))
    const result = probeText(bytes)
    expect(result.flags).toContain('large_line_text')
  })

  it('flags possibly binary when undecodable', () => {
    const bytes = Uint8Array.from([0xc3, 0x28, 0xa0, 0xa1, 0xff])
    const result = probeText(bytes)
    expect(result.flags).toContain('possibly_binary_text')
  })
})
