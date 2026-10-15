import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'

const MAX_COMMAND_JSON_BYTES = 64 * 1024

export class OpenAIResponsesPlainTextRetryCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_RETRY_COMMAND_INVALID') {
    super(code)
    this.name = 'OpenAIResponsesPlainTextRetryCommandV2Error'
  }
}

export type OpenAIResponsesPlainTextRetryCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'openai_responses_plain_text_retry'
  actionKind: 'retry_as_new' | 'retry_replace'
  operationId: Identity<'operation_id'>
  clientActionId: string
  sourceBranchId: GraphIdentity<'branch_id'>
  questionId: GraphIdentity<'question_id'>
  sourceAnswerId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  canonicalJson: string
  requestFingerprint: string
}>

const commands = new WeakSet<object>()

export function isOpenAIResponsesPlainTextRetryCommandV2(
  value: unknown,
): value is OpenAIResponsesPlainTextRetryCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}

function invalid(): never {
  throw new OpenAIResponsesPlainTextRetryCommandV2Error('GENERATION_V2_OPENAI_RETRY_COMMAND_INVALID')
}

export function decodeOpenAIResponsesPlainTextRetryCommandV2(
  value: unknown,
): OpenAIResponsesPlainTextRetryCommandV2 {
  try {
    const keys = [
      'actionKind', 'operationId', 'clientActionId', 'sourceBranchId', 'questionId', 'sourceAnswerId', 'expectedHeadMessageId',
    ]
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
        Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
        Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) ||
          descriptor.value === undefined)) invalid()
    const read = (key: string): string => {
      const field = descriptors[key].value
      if (typeof field !== 'string') invalid()
      return field
    }
    const actionKind = read('actionKind')
    if (actionKind !== 'retry_as_new' && actionKind !== 'retry_replace') invalid()
    const operationId = GenerationV2Identity.create('operation_id', read('operationId'))
    const clientActionId = read('clientActionId')
    if (clientActionId !== operationId.value) invalid()
    const sourceBranchId = ConversationGraphV2Identity.create('branch_id', read('sourceBranchId'))
    const questionId = ConversationGraphV2Identity.create('question_id', read('questionId'))
    const sourceAnswerId = ConversationGraphV2Identity.create('answer_root_id', read('sourceAnswerId'))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', read('expectedHeadMessageId'))
    const projection = Object.freeze({
      schemaVersion: 1 as const, kind: 'openai_responses_plain_text_retry' as const, actionKind,
      operationId: operationId.value, clientActionId,
      sourceBranchId: sourceBranchId.value, questionId: questionId.value,
      sourceAnswerId: sourceAnswerId.value, expectedHeadMessageId: expectedHeadMessageId.value,
    })
    const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_JSON_BYTES)
    const command = Object.freeze({
      ...projection, actionKind, operationId, clientActionId, sourceBranchId, questionId, sourceAnswerId, expectedHeadMessageId,
      canonicalJson, requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof OpenAIResponsesPlainTextRetryCommandV2Error) throw error
    throw new OpenAIResponsesPlainTextRetryCommandV2Error('GENERATION_V2_OPENAI_RETRY_COMMAND_INVALID')
  }
}
