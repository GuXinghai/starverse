import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256Hex, sha256HexBytes } from '../crypto/sha256Hex'
import { decodeBase64Bytes, encodeBase64Bytes, utf8ByteLength } from './binaryEncoding'

describe('portable bytes preserve Node encoding and integrity semantics', () => {
  it.each(['', 'ASCII\0\r\n', '来源 😀', '\ud800', '\udc00', ...[55, 56, 63, 64, 65, 1000].map(size => 'a'.repeat(size))])(
    'preserves UTF-8 byte length and SHA-256 for %j', value => {
      expect(utf8ByteLength(value)).toBe(Buffer.byteLength(value, 'utf8'))
      expect(sha256Hex(value)).toBe(createHash('sha256').update(value, 'utf8').digest('hex'))
    },
  )

  it.each([0, 1, 2, 3, 255, 32768, 32769, 65537])('preserves all binary byte values at length %i', size => {
    const bytes = Uint8Array.from({ length: size }, (_, index) => index % 256)
    const encoded = encodeBase64Bytes(bytes)
    expect(encoded).toBe(Buffer.from(bytes).toString('base64'))
    expect(decodeBase64Bytes(encoded)).toEqual(bytes)
    expect(sha256HexBytes(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'))
  })
})
