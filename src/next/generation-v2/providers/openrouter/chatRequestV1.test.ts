import { describe, expect, it } from 'vitest'
import { compileOpenRouterChatRequestV1 } from './chatRequestV1'

describe('OpenRouter Chat V1 attachment wire body', () => {
  it('keeps inline text, image data URL and PDF data URL in the prepared body', () => {
    const request = compileOpenRouterChatRequestV1({
      model: 'openai/gpt-5.4',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe these files.' },
          { type: 'text', text: 'plain text attachment' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          { type: 'file', file: { filename: 'document.pdf', file_data: 'data:application/pdf;base64,JVBERi0=' } },
        ],
      }],
    })

    const body = JSON.parse(request.preparedBody.copyUtf8Text()) as Record<string, unknown>
    expect(body.messages).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: 'Describe these files.' },
        { type: 'text', text: 'plain text attachment' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        { type: 'file', file: { filename: 'document.pdf', file_data: 'data:application/pdf;base64,JVBERi0=' } },
      ],
    }])
  })

  it('restores the typed generation, parallel-tool and structured-output fields', () => {
    const request = compileOpenRouterChatRequestV1({
      model: 'openai/gpt-5.4',
      messages: [{ role: 'user', content: 'Return the answer.' }],
      generation: { repetitionPenalty: 1.1 },
      verbosity: 'high',
      parallelToolCalls: true,
      tools: [{ type: 'function', function: { name: 'answer', parameters: { type: 'object' } } }],
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'answer',
          description: 'A short answer.',
          schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false },
          strict: true,
        },
      },
    })

    expect(JSON.parse(request.preparedBody.copyUtf8Text())).toMatchObject({
      repetition_penalty: 1.1,
      verbosity: 'high',
      parallel_tool_calls: true,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'answer', description: 'A short answer.', strict: true },
      },
    })
    expect(JSON.parse(request.preparedBody.copyUtf8Text()).response_format.json_schema.schema).toEqual({
      type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false,
    })
  })

  it('rejects malformed typed response formats before preparing a body', () => {
    expect(() => compileOpenRouterChatRequestV1({
      model: 'openai/gpt-5.4', messages: [{ role: 'user', content: 'x' }],
      responseFormat: { type: 'json_schema', json_schema: { name: 'not valid', schema: {} } },
    })).toThrow('GENERATION_V2_OPENROUTER_CHAT_REQUEST_INVALID_VALUE')
  })
})
