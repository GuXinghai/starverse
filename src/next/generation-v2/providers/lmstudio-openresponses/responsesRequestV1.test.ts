import { describe, expect, it } from 'vitest'
import { compileLmStudioOpenResponsesRequestV1 } from '../../../../core/generation-v2/providers/lmstudio-openresponses/responsesRequestV1'
import { readApiRequestBodyContractV2, readLegacyLmStudioOpenResponsesBodyRequestContractV2 } from '../../../../core/generation-v2/contracts/apiRequestBodyContractV2'
import { getLmStudioLegacyToolEncodingRevisionV2, resolveEncodingCoverageRegistryV2 } from '../../../../core/generation-v2/capability/encodingCoverageRegistryV2'

const user = Object.freeze({ role: 'user' as const,
  content: Object.freeze([Object.freeze({ type: 'input_text' as const, text: 'add 2 and 3' })]) })
const tool = Object.freeze({ type: 'function' as const, name: 'add_numbers', description: 'Add two integers.',
  parameters: Object.freeze({ type: 'object', properties: Object.freeze({
    a: Object.freeze({ type: 'integer' }), b: Object.freeze({ type: 'integer' }),
  }), required: Object.freeze(['a', 'b']), additionalProperties: false }), strict: true as const })

describe('LM Studio OpenResponses request codec', () => {
  it('encodes the verified sampling, reasoning, tool and client-managed history shape exactly', () => {
    const compiled = compileLmStudioOpenResponsesRequestV1({ model: 'gate0-qwen3-4b', replayItems: [user],
      generation: { temperature: 0.7, topP: 0.8, maxOutputTokens: 128, frequencyPenalty: 0, presencePenalty: 0 },
      reasoningEffort: 'low', tools: [tool], toolChoice: 'required' })
    expect(compiled.nativeRequest).toEqual({ model: 'gate0-qwen3-4b', input: [user], stream: true, store: false,
      temperature: 0.7, top_p: 0.8, max_output_tokens: 128, frequency_penalty: 0, presence_penalty: 0,
      reasoning: { effort: 'low' }, tools: [tool], tool_choice: 'required' })
    expect(JSON.parse(new TextDecoder().decode(compiled.preparedBody.copyBytes()))).not.toHaveProperty('previous_response_id')
  })

  it('rejects unverified explicit tool choice and non-strict tool shapes before fetch', () => {
    expect(() => compileLmStudioOpenResponsesRequestV1({ model: 'm', replayItems: [user], tools: [tool],
      toolChoice: 'auto' as never })).toThrow('GENERATION_V2_LMSTUDIO_REQUEST_UNSUPPORTED_EXPLICIT_FIELD')
    expect(() => compileLmStudioOpenResponsesRequestV1({ model: 'm', replayItems: [user],
      tools: [{ ...tool, strict: false }] })).toThrow('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
  })

  it('keeps the legacy strict codec and allows an explicit boolean only under the new frozen body revision', () => {
    const current = readApiRequestBodyContractV2('lmstudio', 'text')
    const legacy = readLegacyLmStudioOpenResponsesBodyRequestContractV2('text')
    expect(current.bodySchemaRevision).not.toBe(legacy.bodySchemaRevision)
    const legacyEncoderRevision = getLmStudioLegacyToolEncodingRevisionV2('text')
    const legacyEncoder = resolveEncodingCoverageRegistryV2({ providerId: 'lmstudio', protocolContractId: 'lmstudio-openresponses',
      operation: 'text', encoderRevision: legacyEncoderRevision })
    expect(legacyEncoder.bodySchemaRevision).toBe(legacy.bodySchemaRevision)
    expect(() => compileLmStudioOpenResponsesRequestV1({ model: 'm', replayItems: [user], tools: [{ ...tool, strict: false }] },
      'text', legacy.bodySchemaRevision)).toThrow('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
    const compiled = compileLmStudioOpenResponsesRequestV1({ model: 'm', replayItems: [user], tools: [{ ...tool, strict: false }] },
      'text', current.bodySchemaRevision)
    expect(compiled.nativeRequest.tools?.[0].strict).toBe(false)
    expect(JSON.parse(new TextDecoder().decode(compiled.preparedBody.copyBytes())).tools[0].strict).toBe(false)
  })
})
