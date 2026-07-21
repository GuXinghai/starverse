import { describe, expect, it } from 'vitest'
import { isOpenRouterChatAttachmentAdmissibleV2 } from './openRouterChatGenerationAuthorityV2Service'

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'managed_file', include: true, sendAs: 'inline_text', conversion: 'plain_text',
    assetId: { value: 'asset' }, assetRevisionId: { value: 'revision' }, assetSha256: { value: 'sha' },
    ...overrides,
  } as never
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    revisionKind: 'derived', conversionKind: 'plain_text', assetKind: 'file',
    blob: { mime: 'text/markdown' },
    ...overrides,
  } as never
}

describe('isOpenRouterChatAttachmentAdmissibleV2', () => {
  it('accepts only a verified plain-text derived revision for inline text', () => {
    expect(isOpenRouterChatAttachmentAdmissibleV2({ attachment: attachment(), revision: revision(), inputModalities: new Set() })).toBe(true)
    expect(isOpenRouterChatAttachmentAdmissibleV2({
      attachment: attachment(), revision: revision({ revisionKind: 'source', conversionKind: 'none' }), inputModalities: new Set(),
    })).toBe(false)
  })

  it('requires a file-capable model and PDF provenance for a converted document', () => {
    const convertedPdf = attachment({ sendAs: 'converted_document', conversion: 'pdf' })
    const pdfRevision = revision({ conversionKind: 'pdf', blob: { mime: 'application/pdf' } })
    expect(isOpenRouterChatAttachmentAdmissibleV2({ attachment: convertedPdf, revision: pdfRevision, inputModalities: new Set(['file']) })).toBe(true)
    expect(isOpenRouterChatAttachmentAdmissibleV2({ attachment: convertedPdf, revision: pdfRevision, inputModalities: new Set() })).toBe(false)
    expect(isOpenRouterChatAttachmentAdmissibleV2({
      attachment: convertedPdf, revision: revision({ conversionKind: 'plain_text', blob: { mime: 'application/pdf' } }), inputModalities: new Set(['file']),
    })).toBe(false)
  })

  it('does not permit cross-mode PDF or text substitution', () => {
    expect(isOpenRouterChatAttachmentAdmissibleV2({
      attachment: attachment({ sendAs: 'provider_file', conversion: 'none' }),
      revision: revision({ blob: { mime: 'application/pdf' } }), inputModalities: new Set(['file']),
    })).toBe(false)
    expect(isOpenRouterChatAttachmentAdmissibleV2({
      attachment: attachment({ sendAs: 'inline_text', conversion: 'plain_text' }),
      revision: revision({ conversionKind: 'pdf', blob: { mime: 'application/pdf' } }), inputModalities: new Set(),
    })).toBe(false)
  })
})
