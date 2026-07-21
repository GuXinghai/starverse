import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'

const MAX_COMMAND_JSON_BYTES = 64 * 1024
const COMMAND_KEYS = Object.freeze([
  'actionKind',
  'operationId',
  'branchId',
  'questionId',
  'targetAnswerRootId',
  'expectedHeadMessageId',
] as const)

export class AnthropicPlainTextRetryCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_ANTHROPIC_RETRY_COMMAND_INVALID') {
    super(code)
    this.name = 'AnthropicPlainTextRetryCommandV2Error'
  }
}

export type AnthropicPlainTextRetryCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'anthropic_plain_text_retry'
  actionKind: 'retry_as_new' | 'retry_replace'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  questionId: GraphIdentity<'question_id'>
  targetAnswerRootId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  canonicalJson: string
  requestFingerprint: string
}>

const commands = new WeakSet<object>()

export function isAnthropicPlainTextRetryCommandV2(
  value: unknown,
): value is AnthropicPlainTextRetryCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}

function invalid(): never {
  throw new AnthropicPlainTextRetryCommandV2Error('GENERATION_V2_ANTHROPIC_RETRY_COMMAND_INVALID')
}

export function decodeAnthropicPlainTextRetryCommandV2(
  value: unknown,
): AnthropicPlainTextRetryCommandV2 {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) invalid()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
        Object.keys(descriptors).sort().join('\0') !== [...COMMAND_KEYS].sort().join('\0') ||
        Object.values(descriptors).some((descriptor) => !descriptor.enumerable ||
          !('value' in descriptor) || descriptor.value === undefined)) invalid()
    const read = (key: (typeof COMMAND_KEYS)[number]): string => {
      const field = descriptors[key].value
      if (typeof field !== 'string') invalid()
      return field
    }
    const actionKind = read('actionKind')
    if (actionKind !== 'retry_as_new' && actionKind !== 'retry_replace') invalid()
    const operationId = GenerationV2Identity.create('operation_id', read('operationId'))
    const branchId = ConversationGraphV2Identity.create('branch_id', read('branchId'))
    const questionId = ConversationGraphV2Identity.create('question_id', read('questionId'))
    const targetAnswerRootId = ConversationGraphV2Identity.create(
      'answer_root_id',
      read('targetAnswerRootId'),
    )
    const expectedHeadMessageId = ConversationGraphV2Identity.create(
      'message_id',
      read('expectedHeadMessageId'),
    )
    if (expectedHeadMessageId.value !== targetAnswerRootId.value) invalid()
    const projection = Object.freeze({
      schemaVersion: 1 as const,
      kind: 'anthropic_plain_text_retry' as const,
      actionKind,
      operationId: operationId.value,
      branchId: branchId.value,
      questionId: questionId.value,
      targetAnswerRootId: targetAnswerRootId.value,
      expectedHeadMessageId: expectedHeadMessageId.value,
    })
    const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_JSON_BYTES)
    const command = Object.freeze({
      ...projection,
      actionKind,
      operationId,
      branchId,
      questionId,
      targetAnswerRootId,
      expectedHeadMessageId,
      canonicalJson,
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof AnthropicPlainTextRetryCommandV2Error) throw error
    return invalid()
  }
}
