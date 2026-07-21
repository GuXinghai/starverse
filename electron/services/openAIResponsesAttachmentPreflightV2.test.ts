import { describe, expect, it } from 'vitest'
import { isIncludedOpenAIResponsesFileIntentV2 } from './openAIResponsesAttachmentPreflightV2'

const base = Object.freeze({
  kind: 'managed_file' as const, assetId: 'asset:1', assetRevisionId: 'revision:1',
  assetSha256: 'a'.repeat(64), include: true,
})

describe('OpenAI Responses attachment preflight selection', () => {
  it('accepts only original provider files and derived PDFs', () => {
    expect(isIncludedOpenAIResponsesFileIntentV2({ ...base, sendAs: 'provider_file', conversion: 'none' }))
      .toBe(true)
    expect(isIncludedOpenAIResponsesFileIntentV2({ ...base, sendAs: 'converted_document', conversion: 'pdf' }))
      .toBe(true)
    expect(isIncludedOpenAIResponsesFileIntentV2({ ...base, sendAs: 'inline_text', conversion: 'plain_text' }))
      .toBe(false)
    expect(isIncludedOpenAIResponsesFileIntentV2({ ...base, sendAs: 'converted_document', conversion: 'none' }))
      .toBe(false)
    expect(isIncludedOpenAIResponsesFileIntentV2({ ...base, include: false, sendAs: 'converted_document', conversion: 'pdf' }))
      .toBe(false)
  })
})
