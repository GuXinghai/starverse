import { describe, expect, it } from 'vitest'
import {
  createOpenAIResponsesTerminalArtifactV1,
  decodeOpenAIResponsesTerminalArtifactV1,
  isOpenAIResponsesTerminalArtifactV1,
} from './terminalArtifactV1'
import { OpenAIResponsesStreamAssemblerV1, OpenAIResponsesTypedSseDecoderV1 } from './responsesStreamV1'

function completedResult() {
  const response = {
    id: 'resp_1', object: 'response', created_at: 1, completed_at: 2, status: 'completed', model: 'gpt-5.6-sol',
    output: [{ id: 'm1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }, error: null, incomplete_details: null,
  }
  const type = 'response.completed'
  const bytes = new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: 1, response })}\n\n`)
  const decoder = new OpenAIResponsesTypedSseDecoderV1()
  const assembler = new OpenAIResponsesStreamAssemblerV1()
  for (const event of decoder.push(bytes)) assembler.push(event)
  decoder.finish()
  return assembler.finish()
}

describe('OpenAI Responses terminal artifact V1', () => {
  it('persists and reopens a content-addressed provider-native terminal result', () => {
    const artifact = createOpenAIResponsesTerminalArtifactV1(completedResult())
    const reopened = decodeOpenAIResponsesTerminalArtifactV1(artifact.canonicalJson)
    expect(isOpenAIResponsesTerminalArtifactV1(reopened)).toBe(true)
    expect(reopened).toEqual(artifact)
  })

  it('rejects mutation and unbranded construction', () => {
    const artifact = createOpenAIResponsesTerminalArtifactV1(completedResult())
    expect(() => decodeOpenAIResponsesTerminalArtifactV1(artifact.canonicalJson.replace('"ok"', '"changed"')))
      .toThrow('GENERATION_V2_OPENAI_TERMINAL_ARTIFACT_INVALID')
    expect(() => createOpenAIResponsesTerminalArtifactV1({ ...completedResult() }))
      .toThrow('GENERATION_V2_OPENAI_TERMINAL_ARTIFACT_INVALID')
  })
})
