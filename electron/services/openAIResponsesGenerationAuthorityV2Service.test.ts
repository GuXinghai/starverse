import { describe, expect, it } from 'vitest'
import { OPENAI_RESPONSES_IMAGE_SIZE_DOMAIN_V2 } from './openAIResponsesGenerationAuthorityV2Service'

describe('OpenAI Responses canonical model facts', () => {
  it('keeps image.size as the exact provider-supported set', () => {
    expect(OPENAI_RESPONSES_IMAGE_SIZE_DOMAIN_V2).toEqual({
      kind: 'dimensions_enum',
      values: [
        { width: 1024, height: 1024 },
        { width: 1024, height: 1536 },
        { width: 1536, height: 1024 },
      ],
    })
    expect(OPENAI_RESPONSES_IMAGE_SIZE_DOMAIN_V2.values).not.toContainEqual({ width: 1536, height: 1536 })
  })
})
