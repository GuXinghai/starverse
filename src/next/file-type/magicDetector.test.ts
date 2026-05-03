import { describe, expect, it } from 'vitest'
import { detectMagic } from './magicDetector'

describe('magicDetector', () => {
  it.each([
    ['pdf', Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]), 'pdf'],
    ['png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png'],
    ['jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), 'jpeg'],
    ['gif', new TextEncoder().encode('GIF89a123'), 'gif'],
    ['sqlite', new TextEncoder().encode('SQLite format 3\0xxxx'), 'sqlite_db'],
    ['wasm', Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]), 'unknown_binary'],
    ['7z', Uint8Array.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00]), 'seven_zip'],
    ['rar', Uint8Array.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]), 'rar'],
    ['gzip', Uint8Array.from([0x1f, 0x8b, 0x08, 0x00]), 'gzip'],
    ['elf', Uint8Array.from([0x7f, 0x45, 0x4c, 0x46]), 'elf'],
    ['mp3', new TextEncoder().encode('ID3\x04\x00\x00'), 'mp3'],
    ['wav', new TextEncoder().encode('RIFF----WAVEfmt '), 'wav'],
    ['mp4', Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'mp4'],
    ['zip', Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), 'zip'],
    ['ole', Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'unknown_binary'],
  ] as const)('detects %s signature', (_label, bytes, expectedFormatId) => {
    const result = detectMagic(bytes)
    expect(result.evidence?.detectedFormatId).toBe(expectedFormatId)
    expect(result.evidence?.source).toBe('magic')
    expect(result.evidence?.reasonCodes).toEqual(['reason.magic_matched'])
  })

  it('returns null evidence for unknown bytes', () => {
    const result = detectMagic(Uint8Array.from([0x01, 0x02, 0x03, 0x04]))
    expect(result.evidence).toBeNull()
    expect(result.magicId).toBeNull()
  })
})
