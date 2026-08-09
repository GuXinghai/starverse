import { describe, expect, it } from 'vitest'
import { projectGenerationV2ComposerAttachments, type GenerationV2ComposerDraft } from './generationV2ComposerClient'

describe('Generation V2 Composer attachment projection', () => {
  it('keeps the source triple or projects the selected immutable DFC triple', () => {
    const draft: GenerationV2ComposerDraft = {
      conversationId: 'conversation:1', draftText: 'send these', draftMode: 'compose',
      editingSourceQuestionId: null, revision: 3, updatedAtMs: 10,
      attachments: [{
        kind: 'managed_file', assetId: 'asset:source', assetRevisionId: 'revision:source', assetSha256: 'a'.repeat(64),
        include: true, sendAs: 'provider_file', conversion: 'none', attachmentOrder: 0, filename: 'source.txt',
        assetKind: 'file', mime: 'text/plain', sizeBytes: 12, sourceKind: 'user_import', originalUrl: null,
        dfcSelection: null,
      }, {
        kind: 'managed_file', assetId: 'asset:raw', assetRevisionId: 'revision:raw', assetSha256: 'b'.repeat(64),
        include: true, sendAs: 'provider_file', conversion: 'none', attachmentOrder: 1, filename: 'report.pdf',
        assetKind: 'file', mime: 'application/pdf', sizeBytes: 20, sourceKind: 'user_import', originalUrl: null,
        dfcSelection: { optionId: 'dfc:plain_text', targetKind: 'plain_text', sendStrategy: 'text_in_prompt',
          effectiveAssetId: 'asset:derived', effectiveAssetRevisionId: 'revision:derived', effectiveAssetSha256: 'c'.repeat(64) },
      }, {
        kind: 'url_reference', referenceId: 'url:1', referenceRevision: 'url-revision:1', originalUrl: 'https://example.com/a.png',
        urlDigest: 'd'.repeat(64), mediaKind: 'image', declaredMediaType: null, capturedAtMs: 10, provenance: 'user_supplied',
        include: true, sendAs: 'url_reference', conversion: 'none', attachmentOrder: 2,
      }],
    }

    expect(projectGenerationV2ComposerAttachments(draft)).toEqual([
      expect.objectContaining({ assetId: 'asset:source', assetRevisionId: 'revision:source', assetSha256: 'a'.repeat(64), sendAs: 'provider_file', conversion: 'none' }),
      expect.objectContaining({ assetId: 'asset:derived', assetRevisionId: 'revision:derived', assetSha256: 'c'.repeat(64), sendAs: 'inline_text', conversion: 'plain_text' }),
      expect.objectContaining({ referenceId: 'url:1', referenceRevision: 'url-revision:1', urlDigest: 'd'.repeat(64), originalUrl: 'https://example.com/a.png' }),
    ])
  })
})
