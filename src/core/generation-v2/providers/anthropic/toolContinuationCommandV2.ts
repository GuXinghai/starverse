import { stableSerializeProviderRequestV2, sha256PreparedBytesV2 } from '../../compiler/stableSerialize'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../domain/conversationGraphV2'

export type AnthropicToolOutputV2 = Readonly<{
  toolUseId: string
  content: string
  isError: boolean
  userConfirmedExternalSideEffect: boolean
}>

export type AnthropicToolContinuationCommandV2 = Readonly<{
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  priorRequestSequence: number
  toolOutputs: readonly AnthropicToolOutputV2[]
  requestFingerprint: string
}>

export class AnthropicToolContinuationCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_ANTHROPIC_TOOL_CONTINUATION_COMMAND_INVALID') {
    super(code)
    this.name = 'AnthropicToolContinuationCommandV2Error'
  }
}

const commands = new WeakSet<object>()
const ID = /^[^\u0000-\u001f\u007f]{1,512}$/u

function invalid(): never {
  throw new AnthropicToolContinuationCommandV2Error('GENERATION_V2_ANTHROPIC_TOOL_CONTINUATION_COMMAND_INVALID')
}

export function decodeAnthropicToolContinuationCommandV2(value: unknown): AnthropicToolContinuationCommandV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid()
  const input = value as Record<string, unknown>
  const keys = ['operationId', 'branchId', 'answerRootId', 'expectedHeadMessageId', 'priorRequestSequence', 'toolOutputs']
  if (Object.keys(input).some((key) => !keys.includes(key)) || keys.some((key) => !(key in input)) ||
      !Number.isSafeInteger(input.priorRequestSequence) || (input.priorRequestSequence as number) < 1 ||
      !Array.isArray(input.toolOutputs) || input.toolOutputs.length < 1 || input.toolOutputs.length > 128) invalid()
  const toolOutputs = input.toolOutputs.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) invalid()
    const output = raw as Record<string, unknown>
    if (Object.keys(output).some((key) => !['toolUseId', 'content', 'isError', 'userConfirmedExternalSideEffect'].includes(key)) ||
        typeof output.toolUseId !== 'string' || !ID.test(output.toolUseId) ||
        typeof output.content !== 'string' || new TextEncoder().encode(output.content).byteLength > 4 * 1024 * 1024 ||
        typeof output.isError !== 'boolean' || typeof output.userConfirmedExternalSideEffect !== 'boolean') invalid()
    return Object.freeze({
      toolUseId: output.toolUseId,
      content: output.content,
      isError: output.isError,
      userConfirmedExternalSideEffect: output.userConfirmedExternalSideEffect,
    })
  })
  if (new Set(toolOutputs.map((output) => output.toolUseId)).size !== toolOutputs.length) invalid()
  try {
    const operationId = GenerationV2Identity.create('operation_id', input.operationId as string)
    const branchId = ConversationGraphV2Identity.create('branch_id', input.branchId as string)
    const answerRootId = ConversationGraphV2Identity.create('answer_root_id', input.answerRootId as string)
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', input.expectedHeadMessageId as string)
    const canonical = stableSerializeProviderRequestV2({
      operationId: operationId.value,
      branchId: branchId.value,
      answerRootId: answerRootId.value,
      expectedHeadMessageId: expectedHeadMessageId.value,
      priorRequestSequence: input.priorRequestSequence,
      toolOutputs,
    })
    const command = Object.freeze({
      operationId,
      branchId,
      answerRootId,
      expectedHeadMessageId,
      priorRequestSequence: input.priorRequestSequence as number,
      toolOutputs: Object.freeze(toolOutputs),
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonical)),
    })
    commands.add(command)
    return command
  } catch {
    return invalid()
  }
}

export function isAnthropicToolContinuationCommandV2(value: unknown): value is AnthropicToolContinuationCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}
