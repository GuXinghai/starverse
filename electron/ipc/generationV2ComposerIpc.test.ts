import { describe, expect, it } from 'vitest'
import { decodeResolvedGenerationIntentV2 } from '../../src/next/generation-v2/domain/resolvedGenerationIntentV2'
import { projectAnswerSnapshotAttachmentIntentsV2 } from './generationV2ComposerIpc'

describe('Composer replace-from-answer-snapshot attachment projection', () => {
  it('restores the immutable source and URL reference identities from the answer snapshot', () => {
    const semanticIntent = decodeResolvedGenerationIntentV2({
      schemaVersion: 2,
      generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
      image: { mode: 'disabled' }, tools: { mode: 'disabled' }, providerExtension: { kind: 'none' },
      attachments: [{
        kind: 'managed_file', assetId: 'asset:source', assetRevisionId: 'revision:source', assetSha256: 'a'.repeat(64),
        include: true, sendAs: 'provider_file', conversion: 'none',
      }, {
        kind: 'url_reference', referenceId: 'url:1', referenceRevision: 'url-revision:1',
        originalUrl: 'https://example.test/report.pdf', urlDigest: 'b'.repeat(64), mediaKind: 'document',
        capturedAtMs: 10, provenance: 'user_supplied', include: true, sendAs: 'url_reference', conversion: 'none',
      }],
    }).value

    expect(projectAnswerSnapshotAttachmentIntentsV2({ semanticIntent })).toEqual([
      expect.objectContaining({
        kind: 'managed_file', assetId: 'asset:source', assetRevisionId: 'revision:source', assetSha256: 'a'.repeat(64),
        include: true, sendAs: 'provider_file', conversion: 'none',
      }),
      expect.objectContaining({
        kind: 'url_reference', referenceId: 'url:1', referenceRevision: 'url-revision:1',
        originalUrl: 'https://example.test/report.pdf', urlDigest: 'b'.repeat(64),
      }),
    ])
  })
})
