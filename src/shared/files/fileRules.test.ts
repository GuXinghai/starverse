import { describe, expect, it } from 'vitest'
import {
  classifyAiPayloadKind,
  classifyAssetKind,
  classifyProcessingStatus,
  inferFileProfile,
  isConvertibleCandidate,
  isNativeSupportedForMvp,
  isPotentiallyPreviewable,
  normalizeExtension,
} from './fileRules'

describe('fileRules classifiers', () => {
  it.each([
    ['png', 'image/png', 'image', 'image'],
    ['jpg', 'image/jpeg', 'image', 'image'],
    ['jpeg', 'image/jpeg', 'image', 'image'],
    ['pdf', 'application/pdf', 'document', 'pdf'],
    ['txt', 'text/plain', 'text', 'text'],
    ['md', 'text/markdown', 'text', 'text'],
  ] as const)('classifies MVP native %s files', (extension, mimeType, assetKind, payloadKind) => {
    const input = { extension, mimeType }

    expect(classifyAssetKind(input)).toBe(assetKind)
    expect(classifyAiPayloadKind(input)).toBe(payloadKind)
    expect(classifyProcessingStatus(input)).toBe('native_supported')
    expect(isNativeSupportedForMvp(input)).toBe(true)
    expect(isConvertibleCandidate(input)).toBe(false)
  })

  it.each(['docx', 'xlsx', 'pptx'] as const)('marks %s as a conversion candidate', (extension) => {
    const input = { extension }

    expect(classifyProcessingStatus(input)).toBe('convertible')
    expect(isNativeSupportedForMvp(input)).toBe(false)
    expect(isConvertibleCandidate(input)).toBe(true)
    expect(isPotentiallyPreviewable(input)).toBe(true)
  })

  it.each(['html', 'htm', 'ps', 'eps'] as const)('marks %s as a safe text conversion candidate', (extension) => {
    const input = { extension }

    expect(classifyAssetKind(input)).toBe('text')
    expect(classifyAiPayloadKind(input)).toBe('text')
    expect(classifyProcessingStatus(input)).toBe('convertible')
    expect(isConvertibleCandidate(input)).toBe(true)
  })

  it('falls back for archive and unknown binary files', () => {
    expect(inferFileProfile({ filename: 'bundle.zip' })).toMatchObject({
      assetKind: 'archive',
      aiPayloadKind: 'binary',
      processingStatus: 'unsupported',
      mvpNativeSupported: false,
    })

    expect(inferFileProfile({ filename: 'payload.bin' })).toMatchObject({
      assetKind: 'binary',
      aiPayloadKind: 'binary',
      processingStatus: 'unsupported',
      mvpNativeSupported: false,
    })
  })

  it('uses MIME when extension is missing', () => {
    expect(inferFileProfile({ mimeType: 'application/pdf' })).toMatchObject({
      extension: null,
      mimeType: 'application/pdf',
      assetKind: 'document',
      aiPayloadKind: 'pdf',
      processingStatus: 'native_supported',
    })
  })

  it('classifies text/html and application/postscript MIME as convertible text assets', () => {
    expect(inferFileProfile({ mimeType: 'text/html' })).toMatchObject({
      assetKind: 'text',
      aiPayloadKind: 'text',
      processingStatus: 'convertible',
    })
    expect(inferFileProfile({ mimeType: 'application/postscript' })).toMatchObject({
      assetKind: 'text',
      aiPayloadKind: 'text',
      processingStatus: 'convertible',
    })
  })

  it('uses extension when MIME is missing', () => {
    expect(inferFileProfile({ filename: 'notes.MD' })).toMatchObject({
      extension: 'md',
      mimeType: null,
      assetKind: 'text',
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
    })
  })

  it('uses a conservative fallback when MIME and extension conflict', () => {
    expect(inferFileProfile({ filename: 'photo.png', mimeType: 'application/pdf' })).toMatchObject({
      extension: 'png',
      mimeType: 'application/pdf',
      assetKind: 'binary',
      aiPayloadKind: 'binary',
      processingStatus: 'local_only',
      mvpNativeSupported: false,
      futureConversionCandidate: false,
      hasConflictingSignals: true,
    })
  })

  it('normalizes extension-like and filename-like inputs', () => {
    expect(normalizeExtension('.JPEG')).toBe('jpeg')
    expect(normalizeExtension('C:\\tmp\\archive.tar.gz')).toBe('gz')
    expect(normalizeExtension('https://example.test/a/file.pdf?token=1')).toBe('pdf')
  })
})

describe('inferFileProfile', () => {
  it('returns a complete aggregate profile', () => {
    const profile = inferFileProfile({ filename: 'report.docx' })

    expect(profile).toEqual({
      extension: 'docx',
      mimeType: null,
      assetKind: 'document',
      aiPayloadKind: 'pdf',
      processingStatus: 'convertible',
      mvpNativeSupported: false,
      futureConversionCandidate: true,
      potentiallyPreviewable: true,
      hasConflictingSignals: false,
    })
  })
})
