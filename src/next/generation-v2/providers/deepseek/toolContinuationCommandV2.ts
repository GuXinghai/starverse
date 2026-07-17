import { stableSerializeProviderRequestV2, sha256PreparedBytesV2 } from '../../compiler/stableSerialize'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../domain/conversationGraphV2'

export type DeepSeekToolOutputV2 = Readonly<{
  toolCallId: string
  content: string
  userConfirmedExternalSideEffect: boolean
}>

export type DeepSeekToolContinuationCommandV2 = Readonly<{
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  priorRequestSequence: number
  toolOutputs: readonly DeepSeekToolOutputV2[]
  requestFingerprint: string
}>

export class DeepSeekToolContinuationCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_COMMAND_INVALID') {
    super(code)
    this.name = 'DeepSeekToolContinuationCommandV2Error'
  }
}

const commands = new WeakSet<object>()
const ID = /^[^\u0000-\u001f\u007f]{1,512}$/u

export function decodeDeepSeekToolContinuationCommandV2(value: unknown): DeepSeekToolContinuationCommandV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new DeepSeekToolContinuationCommandV2Error('GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_COMMAND_INVALID')
  }
  const input = value as Record<string, unknown>
  const keys = ['operationId', 'branchId', 'answerRootId', 'expectedHeadMessageId', 'priorRequestSequence', 'toolOutputs']
  if (Object.keys(input).some((key) => !keys.includes(key)) || keys.some((key) => !(key in input)) ||
      !Number.isSafeInteger(input.priorRequestSequence) || (input.priorRequestSequence as number) < 1 ||
      !Array.isArray(input.toolOutputs) || input.toolOutputs.length < 1 || input.toolOutputs.length > 128) {
    throw new DeepSeekToolContinuationCommandV2Error('GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_COMMAND_INVALID')
  }
  const outputs = input.toolOutputs.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) {
      throw new DeepSeekToolContinuationCommandV2Error('GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_COMMAND_INVALID')
    }
    const output = raw as Record<string, unknown>
    if (Object.keys(output).some((key) => !['toolCallId', 'content', 'userConfirmedExternalSideEffect'].includes(key)) ||
        typeof output.toolCallId !== 'string' || !ID.test(output.toolCallId) ||
        typeof output.content !== 'string' || new TextEncoder().encode(output.content).byteLength > 4 * 1024 * 1024 ||
        typeof output.userConfirmedExternalSideEffect !== 'boolean') {
      throw new DeepSeekToolContinuationCommandV2Error('GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_COMMAND_INVALID')
    }
    return Object.freeze({
      toolCallId: output.toolCallId,
      content: output.content,
      userConfirmedExternalSideEffect: output.userConfirmedExternalSideEffect,
    })
  })
  if (new Set(outputs.map((output) => output.toolCallId)).size !== outputs.length) {
    throw new DeepSeekToolContinuationCommandV2Error('GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_COMMAND_INVALID')
  }
  try {
    const operationId = GenerationV2Identity.create('operation_id', input.operationId as string)
    const branchId = ConversationGraphV2Identity.create('branch_id', input.branchId as string)
    const answerRootId = ConversationGraphV2Identity.create('answer_root_id', input.answerRootId as string)
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', input.expectedHeadMessageId as string)
    const canonical = stableSerializeProviderRequestV2({
      operationId: operationId.value, branchId: branchId.value, answerRootId: answerRootId.value,
      expectedHeadMessageId: expectedHeadMessageId.value,
      priorRequestSequence: input.priorRequestSequence,
      toolOutputs: outputs,
    })
    const command = Object.freeze({
      operationId, branchId, answerRootId, expectedHeadMessageId,
      priorRequestSequence: input.priorRequestSequence as number,
      toolOutputs: Object.freeze(outputs),
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonical)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof DeepSeekToolContinuationCommandV2Error) throw error
    throw new DeepSeekToolContinuationCommandV2Error('GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_COMMAND_INVALID')
  }
}

export function isDeepSeekToolContinuationCommandV2(value: unknown): value is DeepSeekToolContinuationCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}
