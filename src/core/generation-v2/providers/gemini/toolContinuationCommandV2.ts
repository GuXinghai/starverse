import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2, stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/u

export type GeminiFunctionResponseOutputV2 = Readonly<{
  partOrdinal: number
  functionName: string
  response: Readonly<Record<string, unknown>>
  userConfirmedExternalSideEffect: boolean
}>

export type GeminiToolContinuationCommandV2 = Readonly<{
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  priorRequestSequence: number
  toolOutputs: readonly GeminiFunctionResponseOutputV2[]
  requestFingerprint: string
}>

export class GeminiToolContinuationCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_TOOL_CONTINUATION_COMMAND_INVALID') {
    super(code)
    this.name = 'GeminiToolContinuationCommandV2Error'
  }
}

const commands = new WeakSet<object>()
function invalid(): never {
  throw new GeminiToolContinuationCommandV2Error('GENERATION_V2_GEMINI_TOOL_CONTINUATION_COMMAND_INVALID')
}
function plain(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid()
  return value as Readonly<Record<string, unknown>>
}
function cloneResponse(value: unknown): Readonly<Record<string, unknown>> {
  try {
    const canonical = stableSerializeProviderRequestBoundedV2(plain(value), MAX_RESPONSE_BYTES)
    return Object.freeze(JSON.parse(canonical) as Record<string, unknown>)
  } catch { return invalid() }
}

export function geminiFunctionCallAssociationKeyV2(
  requestSequence: number,
  partOrdinal: number,
  functionName: string,
): string {
  if (!Number.isSafeInteger(requestSequence) || requestSequence < 1 ||
      !Number.isSafeInteger(partOrdinal) || partOrdinal < 0 || !NAME.test(functionName)) invalid()
  return `gemini:${requestSequence}:${partOrdinal}:${functionName}`
}

export function decodeGeminiToolContinuationCommandV2(value: unknown): GeminiToolContinuationCommandV2 {
  const input = plain(value)
  const keys = ['operationId', 'branchId', 'answerRootId', 'expectedHeadMessageId', 'priorRequestSequence', 'toolOutputs']
  if (Object.keys(input).some((key) => !keys.includes(key)) || keys.some((key) => !(key in input)) ||
      !Number.isSafeInteger(input.priorRequestSequence) || (input.priorRequestSequence as number) < 1 ||
      !Array.isArray(input.toolOutputs) || input.toolOutputs.length < 1 || input.toolOutputs.length > 128) invalid()
  const priorRequestSequence = input.priorRequestSequence as number
  const outputs = input.toolOutputs.map((raw) => {
    const output = plain(raw)
    if (Object.keys(output).some((key) =>
      !['partOrdinal', 'functionName', 'response', 'userConfirmedExternalSideEffect'].includes(key)) ||
        !Number.isSafeInteger(output.partOrdinal) || (output.partOrdinal as number) < 0 ||
        typeof output.functionName !== 'string' || !NAME.test(output.functionName) ||
        typeof output.userConfirmedExternalSideEffect !== 'boolean') invalid()
    const response = cloneResponse(output.response)
    geminiFunctionCallAssociationKeyV2(priorRequestSequence, output.partOrdinal as number, output.functionName)
    return Object.freeze({
      partOrdinal: output.partOrdinal as number,
      functionName: output.functionName,
      response,
      userConfirmedExternalSideEffect: output.userConfirmedExternalSideEffect,
    })
  })
  const keysSeen = outputs.map((output) =>
    geminiFunctionCallAssociationKeyV2(priorRequestSequence, output.partOrdinal, output.functionName))
  if (new Set(keysSeen).size !== outputs.length) invalid()
  try {
    const operationId = GenerationV2Identity.create('operation_id', input.operationId as string)
    const branchId = ConversationGraphV2Identity.create('branch_id', input.branchId as string)
    const answerRootId = ConversationGraphV2Identity.create('answer_root_id', input.answerRootId as string)
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', input.expectedHeadMessageId as string)
    const canonical = stableSerializeProviderRequestV2({
      operationId: operationId.value, branchId: branchId.value, answerRootId: answerRootId.value,
      expectedHeadMessageId: expectedHeadMessageId.value, priorRequestSequence, toolOutputs: outputs,
    })
    const command = Object.freeze({ operationId, branchId, answerRootId, expectedHeadMessageId,
      priorRequestSequence, toolOutputs: Object.freeze(outputs),
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonical)) })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof GeminiToolContinuationCommandV2Error) throw error
    return invalid()
  }
}

export function isGeminiToolContinuationCommandV2(value: unknown): value is GeminiToolContinuationCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}
