import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'

const MAX_COMMAND_JSON_BYTES = 21 * 1024 * 1024
const MAX_BODY_BYTES = 20 * 1024 * 1024

export class OpenAIResponsesPlainTextEditResendCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_EDIT_RESEND_COMMAND_INVALID') {
    super(code)
    this.name = 'OpenAIResponsesPlainTextEditResendCommandV2Error'
  }
}

export type OpenAIResponsesPlainTextEditResendCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'openai_responses_plain_text_edit_resend'
  operationId: Identity<'operation_id'>
  mode: 'fork' | 'replace'
  branchId: GraphIdentity<'branch_id'>
  sourceQuestionId: GraphIdentity<'question_id'>
  sourceAnswerRootId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  userBody: string
  providerId: Identity<'provider_id'>
  endpointProfileId: Identity<'endpoint_profile_id'>
  modelId: Identity<'model_id'>
  commandAttachments: readonly []
  canonicalJson: string
  requestFingerprint: string
}>

const commands = new WeakSet<object>()
export function isOpenAIResponsesPlainTextEditResendCommandV2(
  value: unknown,
): value is OpenAIResponsesPlainTextEditResendCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}
function invalid(): never {
  throw new OpenAIResponsesPlainTextEditResendCommandV2Error('GENERATION_V2_OPENAI_EDIT_RESEND_COMMAND_INVALID')
}

export function decodeOpenAIResponsesPlainTextEditResendCommandV2(
  value: unknown,
): OpenAIResponsesPlainTextEditResendCommandV2 {
  try {
    const keys = [
      'operationId', 'mode', 'branchId', 'sourceQuestionId', 'sourceAnswerRootId',
      'expectedHeadMessageId', 'userBody', 'modelId', 'commandAttachments',
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
    const mode = descriptors.mode.value
    if (mode !== 'fork' && mode !== 'replace') invalid()
    const userBody = read('userBody')
    if (userBody.trim().length === 0 || new TextEncoder().encode(userBody).byteLength > MAX_BODY_BYTES) invalid()
    const attachments = descriptors.commandAttachments.value
    if (!Array.isArray(attachments) || attachments.length !== 0 || Reflect.ownKeys(attachments).length !== 1) invalid()
    const operationId = GenerationV2Identity.create('operation_id', read('operationId'))
    const branchId = ConversationGraphV2Identity.create('branch_id', read('branchId'))
    const sourceQuestionId = ConversationGraphV2Identity.create('question_id', read('sourceQuestionId'))
    const sourceAnswerRootId = ConversationGraphV2Identity.create('answer_root_id', read('sourceAnswerRootId'))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', read('expectedHeadMessageId'))
    const modelId = GenerationV2Identity.create('model_id', read('modelId'))
    const projection = Object.freeze({
      schemaVersion: 1 as const, kind: 'openai_responses_plain_text_edit_resend' as const,
      operationId: operationId.value, mode, branchId: branchId.value,
      sourceQuestionId: sourceQuestionId.value, sourceAnswerRootId: sourceAnswerRootId.value,
      expectedHeadMessageId: expectedHeadMessageId.value, userBody,
      providerId: 'openai_responses', endpointProfileId: 'openai-api-v1', modelId: modelId.value,
      commandAttachments: Object.freeze([]),
    })
    const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_JSON_BYTES)
    const command = Object.freeze({
      ...projection, operationId, branchId, sourceQuestionId, sourceAnswerRootId, expectedHeadMessageId,
      providerId: GenerationV2Identity.create('provider_id', 'openai_responses'),
      endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', 'openai-api-v1'),
      modelId, commandAttachments: Object.freeze([]) as readonly [], canonicalJson,
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof OpenAIResponsesPlainTextEditResendCommandV2Error) throw error
    throw new OpenAIResponsesPlainTextEditResendCommandV2Error('GENERATION_V2_OPENAI_EDIT_RESEND_COMMAND_INVALID')
  }
}
