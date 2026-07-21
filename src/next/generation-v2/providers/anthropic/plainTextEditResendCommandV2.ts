import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { readAnthropicDeveloperApiContractV2 } from '../../contracts/anthropicDeveloperApiContractV2'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'

const MAX_COMMAND_JSON_BYTES = 21 * 1024 * 1024
const MAX_BODY_BYTES = 20 * 1024 * 1024
const COMMAND_KEYS = Object.freeze([
  'operationId',
  'mode',
  'branchId',
  'sourceQuestionId',
  'sourceAnswerRootId',
  'expectedHeadMessageId',
  'userBody',
  'modelId',
  'commandAttachments',
] as const)

export class AnthropicPlainTextEditResendCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_ANTHROPIC_EDIT_RESEND_COMMAND_INVALID') {
    super(code)
    this.name = 'AnthropicPlainTextEditResendCommandV2Error'
  }
}

export type AnthropicPlainTextEditResendCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'anthropic_plain_text_edit_resend'
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

export function isAnthropicPlainTextEditResendCommandV2(
  value: unknown,
): value is AnthropicPlainTextEditResendCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}

function invalid(): never {
  throw new AnthropicPlainTextEditResendCommandV2Error(
    'GENERATION_V2_ANTHROPIC_EDIT_RESEND_COMMAND_INVALID',
  )
}

export function decodeAnthropicPlainTextEditResendCommandV2(
  value: unknown,
): AnthropicPlainTextEditResendCommandV2 {
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
    const mode = read('mode')
    if (mode !== 'fork' && mode !== 'replace') invalid()
    const userBody = read('userBody')
    if (userBody.trim().length === 0 ||
        new TextEncoder().encode(userBody).byteLength > MAX_BODY_BYTES) invalid()
    const attachments = descriptors.commandAttachments.value
    if (!Array.isArray(attachments) || attachments.length !== 0 ||
        Reflect.ownKeys(attachments).length !== 1) invalid()
    const contract = readAnthropicDeveloperApiContractV2()
    const operationId = GenerationV2Identity.create('operation_id', read('operationId'))
    const branchId = ConversationGraphV2Identity.create('branch_id', read('branchId'))
    const sourceQuestionId = ConversationGraphV2Identity.create(
      'question_id',
      read('sourceQuestionId'),
    )
    const sourceAnswerRootId = ConversationGraphV2Identity.create(
      'answer_root_id',
      read('sourceAnswerRootId'),
    )
    const expectedHeadMessageId = ConversationGraphV2Identity.create(
      'message_id',
      read('expectedHeadMessageId'),
    )
    const modelId = GenerationV2Identity.create('model_id', read('modelId'))
    const projection = Object.freeze({
      schemaVersion: 1 as const,
      kind: 'anthropic_plain_text_edit_resend' as const,
      operationId: operationId.value,
      mode,
      branchId: branchId.value,
      sourceQuestionId: sourceQuestionId.value,
      sourceAnswerRootId: sourceAnswerRootId.value,
      expectedHeadMessageId: expectedHeadMessageId.value,
      userBody,
      providerId: contract.providerId,
      endpointProfileId: contract.contractFamilyId,
      modelId: modelId.value,
      commandAttachments: Object.freeze([]),
    })
    const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_JSON_BYTES)
    const command = Object.freeze({
      ...projection,
      operationId,
      mode,
      branchId,
      sourceQuestionId,
      sourceAnswerRootId,
      expectedHeadMessageId,
      providerId: GenerationV2Identity.create('provider_id', contract.providerId),
      endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', contract.contractFamilyId),
      modelId,
      commandAttachments: Object.freeze([]) as readonly [],
      canonicalJson,
      requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof AnthropicPlainTextEditResendCommandV2Error) throw error
    return invalid()
  }
}
