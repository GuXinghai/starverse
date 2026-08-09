import { describe, expect, it } from 'vitest'
import { isIncludedOpenAIResponsesFileIntentV2 } from './openAIResponsesAttachmentPreflightV2'
import { decodeGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentV2'

const base = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: [{
  kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1',
  assetSha256: 'a'.repeat(64), include: true, sendAs: 'provider_file', conversion: 'none',
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
})
