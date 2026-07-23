import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { readAnthropicDeveloperApiContractV2 } from '../../contracts/anthropicDeveloperApiContractV2'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'
import { decodeAnthropicCommandAttachmentsV2, projectAnthropicCommandAttachmentsV2 } from './commandAttachmentsV2'
import type { AttachmentIntentV2 } from '../../domain/generationIntentV2'

const MAX_COMMAND_JSON_BYTES = 64 * 1024
const COMMAND_KEYS = Object.freeze([
  'operationId',
  'branchId',
  'questionId',
  'expectedHeadMessageId',
  'modelId',
  'commandAttachments',
] as const)

export class AnthropicPlainTextRegenerateCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_ANTHROPIC_REGENERATE_COMMAND_INVALID') {
    super(code)
    this.name = 'AnthropicPlainTextRegenerateCommandV2Error'
  }
}

export type AnthropicPlainTextRegenerateCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'anthropic_plain_text_regenerate_question'
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

export function isAnthropicPlainTextRegenerateCommandV2(
  value: unknown,
): value is AnthropicPlainTextRegenerateCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}

function invalid(): never {
  throw new AnthropicPlainTextRegenerateCommandV2Error(
    'GENERATION_V2_ANTHROPIC_REGENERATE_COMMAND_INVALID',
  )
}

export function decodeAnthropicPlainTextRegenerateCommandV2(
  value: unknown,
): AnthropicPlainTextRegenerateCommandV2 {
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
    const attachments = descriptors.commandAttachments.value
    if (!Array.isArray(attachments)) invalid()
    const commandAttachments = decodeAnthropicCommandAttachmentsV2(attachments)
    const contract = readAnthropicDeveloperApiContractV2()
    const operationId = GenerationV2Identity.create('operation_id', read('operationId'))
    const branchId = ConversationGraphV2Identity.create('branch_id', read('branchId'))
    const questionId = ConversationGraphV2Identity.create('question_id', read('questionId'))
    const expectedHeadMessageId = ConversationGraphV2Identity.create(
      'message_id',
      read('expectedHeadMessageId'),
    )
    const modelId = GenerationV2Identity.create('model_id', read('modelId'))
    const projection = Object.freeze({
      schemaVersion: 1 as const,
      kind: 'anthropic_plain_text_regenerate_question' as const,
      operationId: operationId.value,
      branchId: branchId.value,
      questionId: questionId.value,
      expectedHeadMessageId: expectedHeadMessageId.value,
      providerId: contract.providerId,
      endpointProfileId: contract.contractFamilyId,
      modelId: modelId.value,
      commandAttachments: projectAnthropicCommandAttachmentsV2(commandAttachments),
    })
    const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_JSON_BYTES)
    const command = Object.freeze({
      ...projection,
      operationId,
      branchId,
      questionId,
      expectedHeadMessageId,
      providerId: GenerationV2Identity.create('provider_id', contract.providerId),
      endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', contract.contractFamilyId),
      modelId,
      commandAttachments,
      canonicalJson,
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof AnthropicPlainTextRegenerateCommandV2Error) throw error
    return invalid()
  }
}
