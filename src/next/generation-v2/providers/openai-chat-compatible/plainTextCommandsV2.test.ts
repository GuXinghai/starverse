import { describe, expect, it } from 'vitest'
import {
  decodeOpenAIChatCompatibleInitialCommandV2,
  decodeOpenAIChatCompatibleRetryCommandV2,
} from './plainTextCommandsV2'

describe('OpenAI-compatible V2 text commands', () => {
  it('pins the user-selected provider instance in a canonical current-config command', () => {
    const command = decodeOpenAIChatCompatibleInitialCommandV2({
      operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
      providerInstanceId: 'provider:1', modelId: 'model:1', userBody: 'hello', commandAttachments: [], extraBody: null,
    })
    expect(command.providerInstanceId.value).toBe('provider:1')
    expect(JSON.parse(command.canonicalJson)).toMatchObject({ providerInstanceId: 'provider:1', modelId: 'model:1' })
  })

  it('makes explicit extraBody part of the immutable command identity', () => {
    const base = { operationId: 'operation:3', branchId: 'branch:1', expectedHeadMessageId: null,
      providerInstanceId: 'provider:1', modelId: 'model:1', userBody: 'hello', commandAttachments: [] }
    const left = decodeOpenAIChatCompatibleInitialCommandV2({ ...base, extraBody: { chat_template_kwargs: { enable_thinking: true } } })
    const right = decodeOpenAIChatCompatibleInitialCommandV2({ ...base, extraBody: { chat_template_kwargs: { enable_thinking: false } } })
    expect(left.requestFingerprint).not.toBe(right.requestFingerprint)
  })

  it('never lets retry replace or retry-as-new infer a different target', () => {
    expect(() => decodeOpenAIChatCompatibleRetryCommandV2({
      actionKind: 'retry_as_new', operationId: 'operation:2', branchId: 'branch:1', questionId: 'question:1',
      targetAnswerRootId: 'answer:1', expectedHeadMessageId: 'answer:2',
    })).toThrow('GENERATION_V2_OPENAI_COMPATIBLE_RETRY_COMMAND_INVALID')
  })
})
