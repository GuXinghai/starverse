import { stableSerializeProviderRequestV2, sha256PreparedBytesV2 } from '../../compiler/stableSerialize'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../domain/conversationGraphV2'

export type OpenRouterToolContinuationCommandV2 = Readonly<{
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  priorRequestSequence: number
  toolOutputs: readonly Readonly<{ toolCallId: string; content: string; userConfirmedExternalSideEffect: boolean }>[]
  requestFingerprint: string
}>
export class OpenRouterToolContinuationCommandV2Error extends Error {
  constructor() { super('GENERATION_V2_OPENROUTER_TOOL_CONTINUATION_COMMAND_INVALID') }
}
const commands = new WeakSet<object>(); const ID = /^[^\u0000-\u001f\u007f]{1,512}$/u
export function isOpenRouterToolContinuationCommandV2(value: unknown): value is OpenRouterToolContinuationCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}
export function decodeOpenRouterToolContinuationCommandV2(value: unknown): OpenRouterToolContinuationCommandV2 {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('invalid')
    const input = value as Record<string, unknown>
    const keys = ['operationId', 'branchId', 'answerRootId', 'expectedHeadMessageId', 'priorRequestSequence', 'toolOutputs']
    if (Object.keys(input).sort().join('\0') !== [...keys].sort().join('\0') || !Number.isSafeInteger(input.priorRequestSequence) ||
        (input.priorRequestSequence as number) < 1 || !Array.isArray(input.toolOutputs) || input.toolOutputs.length < 1 || input.toolOutputs.length > 128) throw new Error('invalid')
    const outputs = input.toolOutputs.map((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid')
      const item = raw as Record<string, unknown>
      if (Object.keys(item).sort().join('\0') !== ['content', 'toolCallId', 'userConfirmedExternalSideEffect'].sort().join('\0') ||
          typeof item.toolCallId !== 'string' || !ID.test(item.toolCallId) || typeof item.content !== 'string' ||
          new TextEncoder().encode(item.content).byteLength > 4 * 1024 * 1024 || typeof item.userConfirmedExternalSideEffect !== 'boolean') throw new Error('invalid')
      return Object.freeze({ toolCallId: item.toolCallId, content: item.content, userConfirmedExternalSideEffect: item.userConfirmedExternalSideEffect })
    })
    if (new Set(outputs.map((item) => item.toolCallId)).size !== outputs.length) throw new Error('invalid')
    const operationId = GenerationV2Identity.create('operation_id', input.operationId as string)
    const branchId = ConversationGraphV2Identity.create('branch_id', input.branchId as string)
    const answerRootId = ConversationGraphV2Identity.create('answer_root_id', input.answerRootId as string)
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', input.expectedHeadMessageId as string)
    if (expectedHeadMessageId.value !== answerRootId.value) throw new Error('invalid')
    const canonical = stableSerializeProviderRequestV2({ operationId: operationId.value, branchId: branchId.value,
      answerRootId: answerRootId.value, expectedHeadMessageId: expectedHeadMessageId.value,
      priorRequestSequence: input.priorRequestSequence, toolOutputs: outputs })
    const command = Object.freeze({ operationId, branchId, answerRootId, expectedHeadMessageId,
      priorRequestSequence: input.priorRequestSequence as number, toolOutputs: Object.freeze(outputs),
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonical)) })
    commands.add(command); return command
  } catch { throw new OpenRouterToolContinuationCommandV2Error() }
}
