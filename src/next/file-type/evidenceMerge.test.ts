import { describe, expect, it } from 'vitest'
import { mergeFileTypeEvidence } from './evidenceMerge'
import type { FileTypeEvidence } from './types'

function evidence(partial: Partial<FileTypeEvidence> & Pick<FileTypeEvidence, 'source' | 'detectedFormatId'>): FileTypeEvidence {
  return {
    source: partial.source,
    detectedFormatId: partial.detectedFormatId,
    detectedMime: partial.detectedMime ?? null,
    detectedExtension: partial.detectedExtension ?? null,
    confidence: partial.confidence ?? 'medium',
    reasonCodes: partial.reasonCodes ?? [],
    errorCode: partial.errorCode ?? null,
    note: partial.note ?? null,
  }
}

describe('evidenceMerge', () => {
  it('prefers container probe over magic zip and extension hints', () => {
    const merged = mergeFileTypeEvidence({
      evidence: [
        evidence({ source: 'magic', detectedFormatId: 'zip', confidence: 'medium', note: 'magic:zip:container-signature' }),
        evidence({ source: 'container_probe', detectedFormatId: 'docx', confidence: 'high' }),
        evidence({ source: 'extension', detectedFormatId: 'zip', confidence: 'low' }),
      ],
    })
    expect(merged.primary.formatId).toBe('docx')
  })

  it('does not let extension/mime-only hints become high-confidence decisive signal', () => {
    const merged = mergeFileTypeEvidence({
      evidence: [
        evidence({ source: 'extension', detectedFormatId: 'pdf', confidence: 'high' }),
        evidence({ source: 'mime_browser', detectedFormatId: 'pdf', confidence: 'high' }),
      ],
    })
    expect(['medium', 'low', 'unknown']).toContain(merged.primary.confidence)
  })

  it('marks executable content and polyglot conflicts conservatively', () => {
    const merged = mergeFileTypeEvidence({
      evidence: [
        evidence({ source: 'magic', detectedFormatId: 'windows_exe', confidence: 'high', note: 'magic:pe:strong' }),
        evidence({ source: 'container_probe', detectedFormatId: 'docx', confidence: 'high' }),
      ],
    })
    expect(merged.flags.map((flag) => flag.reasonCode)).toEqual(
      expect.arrayContaining(['reason.executable_content', 'reason.polyglot_suspected'])
    )
    expect(merged.conflicts.length).toBeGreaterThan(0)
  })

  it('keeps strong magic ahead of high-confidence magika', () => {
    const merged = mergeFileTypeEvidence({
      evidence: [
        evidence({ source: 'magic', detectedFormatId: 'windows_exe', confidence: 'high', note: 'magic:pe:strong' }),
        evidence({ source: 'magika', detectedFormatId: 'pdf', confidence: 'high', note: 'magika:pdf:0.990' }),
      ],
    })
    expect(merged.primary.formatId).toBe('windows_exe')
  })

  it('keeps successful container probe ahead of magika', () => {
    const merged = mergeFileTypeEvidence({
      evidence: [
        evidence({ source: 'container_probe', detectedFormatId: 'docx', confidence: 'high' }),
        evidence({ source: 'magika', detectedFormatId: 'zip', confidence: 'high' }),
      ],
    })
    expect(merged.primary.formatId).toBe('docx')
  })
})
