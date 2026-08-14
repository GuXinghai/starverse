import { describe, expect, it } from 'vitest'
import {
  isIncludedOpenAIResponsesFileIntentV2,
  preflightOpenAIResponsesAttachmentDescriptorsV2,
} from './openAIResponsesAttachmentPreflightV2'
// eslint-disable-next-line no-restricted-imports -- Main-process attachment preflight test builds verified Generation V2 intents.
import { decodeGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentV2'

const base = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: [{
  kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1',
  assetSha256: 'a'.repeat(64), include: true, sendAs: 'provider_file', conversion: 'none',
}]}).attachments![0]

const urlImage = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: [{
  kind: 'url_reference', referenceId: 'url:1', referenceRevision: 'url-revision:1',
  originalUrl: 'https://example.com/1.png', urlDigest: 'b'.repeat(64), mediaKind: 'image',
  capturedAtMs: 10, provenance: 'user_supplied', include: true, sendAs: 'url_reference', conversion: 'none',
}]}).attachments![0]

describe('OpenAI Responses attachment preflight selection', () => {
  it('accepts only original provider files and derived PDFs', () => {
    expect(isIncludedOpenAIResponsesFileIntentV2(base))
      .toBe(true)
    const pdf = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: [{
      kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64), include: true,
      sendAs: 'converted_document', conversion: 'pdf',
    }]}).attachments![0]
    expect(isIncludedOpenAIResponsesFileIntentV2(pdf))
      .toBe(true)
    const inline = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: [{
      kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64), include: true,
      sendAs: 'inline_text', conversion: 'plain_text',
    }]}).attachments![0]
    expect(isIncludedOpenAIResponsesFileIntentV2(inline))
      .toBe(false)
    const invalidConversion = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: [{
      kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64), include: true,
      sendAs: 'converted_document', conversion: 'none',
    }]}).attachments![0]
    expect(isIncludedOpenAIResponsesFileIntentV2(invalidConversion))
      .toBe(false)
    const excluded = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: [{
      kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64), include: false,
      sendAs: 'converted_document', conversion: 'pdf',
    }]}).attachments![0]
    expect(isIncludedOpenAIResponsesFileIntentV2(excluded))
      .toBe(false)
  })

  it('leaves included URL images out of file preflight', async () => {
    expect(isIncludedOpenAIResponsesFileIntentV2(urlImage))
      .toBe(false)
    await expect(preflightOpenAIResponsesAttachmentDescriptorsV2({
      db: undefined as never,
      attachmentRepo: undefined as never,
      descriptorRepo: undefined as never,
      credentialService: undefined as never,
      commandAttachments: [urlImage],
      expectedCredentialRevision: 1,
      expectedCredentialScopeId: undefined as never,
    })).resolves.toEqual([])
  })
})
