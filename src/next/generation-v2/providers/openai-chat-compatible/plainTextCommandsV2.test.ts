import { describe, expect, it } from 'vitest'
import {
  decodeOpenAIChatCompatibleInitialCommandV2,
  decodeOpenAIChatCompatibleRetryCommandV2,
} from './plainTextCommandsV2'

describe('OpenAI-compatible V2 text commands', () => {
  it('pins the user-selected provider instance in a canonical current-config command', () => {
    const command = decodeOpenAIChatCompatibleInitialCommandV2({
      operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
      providerInstanceId: 'provider:1', modelId: 'model:1', userBody: 'hello', commandAttachments: [],
    })
    expect(command.providerInstanceId.value).toBe('provider:1')
    expect(JSON.parse(command.canonicalJson)).toMatchObject({ providerInstanceId: 'provider:1', modelId: 'model:1' })
  })

  it('rejects profile-owned extraBody at the renderer command boundary', () => {
    const base = { operationId: 'operation:3', branchId: 'branch:1', expectedHeadMessageId: null,
      providerInstanceId: 'provider:1', modelId: 'model:1', userBody: 'hello', commandAttachments: [] }
    expect(() => decodeOpenAIChatCompatibleInitialCommandV2({ ...base,
      extraBody: { chat_template_kwargs: { enable_thinking: true } } }))
      .toThrow('GENERATION_V2_OPENAI_COMPATIBLE_INITIAL_COMMAND_INVALID')
  })

  it('never lets retry replace or retry-as-new infer a different target', () => {
    expect(() => decodeOpenAIChatCompatibleRetryCommandV2({
      actionKind: 'retry_as_new', operationId: 'operation:2', branchId: 'branch:1', questionId: 'question:1',
      sourceAnswerId: 'answer:1', expectedHeadMessageId: 'answer:2',
    })).toThrow('GENERATION_V2_OPENAI_COMPATIBLE_RETRY_COMMAND_INVALID')
  })
})
