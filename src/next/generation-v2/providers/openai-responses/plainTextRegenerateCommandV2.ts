import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'
import type { AttachmentIntentV2 } from '../../domain/generationIntentV2'
import { decodeOpenAIResponsesCommandAttachmentsV2, projectOpenAIResponsesCommandAttachmentsV2 } from './commandAttachmentsV2'

const MAX_COMMAND_JSON_BYTES = 64 * 1024

export class OpenAIResponsesPlainTextRegenerateCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_REGENERATE_COMMAND_INVALID') {
    super(code)
    this.name = 'OpenAIResponsesPlainTextRegenerateCommandV2Error'
  }
}

export type OpenAIResponsesPlainTextRegenerateCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'openai_responses_plain_text_regenerate_question'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  questionId: GraphIdentity<'question_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  providerId: Identity<'provider_id'>
  endpointProfileId: Identity<'endpoint_profile_id'>
  modelId: Identity<'model_id'>
  commandAttachments: readonly AttachmentIntentV2[]
  canonicalJson: string
  requestFingerprint: string
}>

const commands = new WeakSet<object>()
export function isOpenAIResponsesPlainTextRegenerateCommandV2(
  value: unknown,
): value is OpenAIResponsesPlainTextRegenerateCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}

function invalid(): never {
  throw new OpenAIResponsesPlainTextRegenerateCommandV2Error('GENERATION_V2_OPENAI_REGENERATE_COMMAND_INVALID')
}

export function decodeOpenAIResponsesPlainTextRegenerateCommandV2(
  value: unknown,
): OpenAIResponsesPlainTextRegenerateCommandV2 {
  try {
    const keys = [
      'operationId', 'branchId', 'questionId', 'expectedHeadMessageId', 'modelId', 'commandAttachments',
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
    const attachments = descriptors.commandAttachments.value
    if (!Array.isArray(attachments)) invalid()
    const operationId = GenerationV2Identity.create('operation_id', read('operationId'))
    const branchId = ConversationGraphV2Identity.create('branch_id', read('branchId'))
    const questionId = ConversationGraphV2Identity.create('question_id', read('questionId'))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', read('expectedHeadMessageId'))
    const modelId = GenerationV2Identity.create('model_id', read('modelId'))
    const commandAttachments = decodeOpenAIResponsesCommandAttachmentsV2(attachments)
    const projection = Object.freeze({
      schemaVersion: 1 as const, kind: 'openai_responses_plain_text_regenerate_question' as const,
      operationId: operationId.value, branchId: branchId.value, questionId: questionId.value,
      expectedHeadMessageId: expectedHeadMessageId.value, providerId: 'openai_responses',
      endpointProfileId: 'openai-api-v1', modelId: modelId.value,
      commandAttachments: projectOpenAIResponsesCommandAttachmentsV2(commandAttachments),
    })
    const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_JSON_BYTES)
    const command = Object.freeze({
      ...projection, operationId, branchId, questionId, expectedHeadMessageId,
      providerId: GenerationV2Identity.create('provider_id', 'openai_responses'),
      endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', 'openai-api-v1'),
      modelId, commandAttachments, canonicalJson,
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof OpenAIResponsesPlainTextRegenerateCommandV2Error) throw error
    throw new OpenAIResponsesPlainTextRegenerateCommandV2Error('GENERATION_V2_OPENAI_REGENERATE_COMMAND_INVALID')
  }
}
