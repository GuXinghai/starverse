import { describe, expect, it } from 'vitest'
import { detectBasicFileTypeV2 } from './basicFileTypeDetectionV2'

describe('detectBasicFileTypeV2', () => {
  it('accepts plain text using core evidence when Magika is unavailable', () => {
    const result = detectBasicFileTypeV2({
      bytes: new TextEncoder().encode('hello world\n'), filename: 'note.txt', declaredMime: 'text/plain',
      detectionTrigger: 'upload', magika: { state: 'not_installed', used: false, modelVersion: null },
    })
    expect(result.verdict.primary.kind).toBe('text')
    expect(result.staticPolicy.blocked).toBe(false)
    expect(result.verdict.provenance?.magikaState).toBe('not_installed')
  })

  it('blocks executable bytes even when the filename claims text', () => {
    const bytes = new Uint8Array(128)
    bytes[0] = 0x4d; bytes[1] = 0x5a
    bytes[0x3c] = 0x40
    bytes[0x40] = 0x50; bytes[0x41] = 0x45
    const result = detectBasicFileTypeV2({ bytes, filename: 'safe.txt', declaredMime: 'text/plain', detectionTrigger: 'upload' })
    expect(result.verdict.primary.formatId).toBe('windows_exe')
    expect(result.staticPolicy.blocked).toBe(true)
    expect(result.staticPolicy.blockingReasonCodes).toContain('reason.executable_content')
  })

  it('blocks unknown binary content', () => {
    const bytes = new Uint8Array(4096)
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 131 + 0x80) & 0xff
    const result = detectBasicFileTypeV2({ bytes, filename: null, declaredMime: null,
      detectionTrigger: 'upload' })
    expect(result.staticPolicy.blocked).toBe(true)
  })
})
