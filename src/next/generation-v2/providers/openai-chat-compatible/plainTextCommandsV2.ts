import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { decodeGenerationCommandAttachmentsV2, projectGenerationCommandAttachmentsV2 } from '../../domain/commandAttachmentsV2'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphId } from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Id } from '../../domain/identityV2'
import type { AttachmentIntentV2 } from '../../domain/generationIntentV2'
import { compatibleBoundedJsonValueSchema } from '../../../../shared/provider/openai-chat-compatible/schemas'

const MAX_COMMAND_BYTES = 21 * 1024 * 1024
const MAX_BODY_BYTES = 20 * 1024 * 1024
type Raw = Readonly<Record<string, unknown>>
type SharedBase<K extends string> = Readonly<{
  schemaVersion: 1
  kind: K
  operationId: Id<'operation_id'>
  providerInstanceId: Id<'compatible_provider_instance_id'>
  modelId: Id<'model_id'>
  canonicalJson: string
  requestFingerprint: string
}>
type InitialBase<K extends string> = SharedBase<K> & Readonly<{
  branchId: GraphId<'branch_id'>
}>
type MutationBase<K extends string> = SharedBase<K> & Readonly<{
  clientActionId: string
  sourceBranchId: GraphId<'branch_id'>
}>

export type OpenAIChatCompatibleInitialCommandV2 = InitialBase<'openai_chat_compatible_initial'> & Readonly<{
  expectedHeadMessageId: GraphId<'message_id'> | null
  userBody: string
  commandAttachments: readonly AttachmentIntentV2[]
  extraBody: unknown | null
}>
export type OpenAIChatCompatibleRegenerateCommandV2 = MutationBase<'openai_chat_compatible_regenerate'> & Readonly<{
  questionId: GraphId<'question_id'>
  sourceAnswerId: GraphId<'answer_root_id'>
  expectedHeadMessageId: GraphId<'message_id'>
  commandAttachments: readonly AttachmentIntentV2[]
  extraBody: unknown | null
}>
export type OpenAIChatCompatibleEditResendCommandV2 = MutationBase<'openai_chat_compatible_edit_resend'> & Readonly<{
  sourceQuestionId: GraphId<'question_id'>
  sourceAnswerRootId: GraphId<'answer_root_id'>
  expectedHeadMessageId: GraphId<'message_id'>
  userBody: string
  commandAttachments: readonly AttachmentIntentV2[]
  extraBody: unknown | null
}>
export type OpenAIChatCompatibleRetryCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'openai_chat_compatible_retry'
  actionKind: 'retry_as_new' | 'retry_replace'
  operationId: Id<'operation_id'>
  clientActionId: string
  sourceBranchId: GraphId<'branch_id'>
  questionId: GraphId<'question_id'>
  sourceAnswerId: GraphId<'answer_root_id'>
  expectedHeadMessageId: GraphId<'message_id'>
  canonicalJson: string
  requestFingerprint: string
}>

export class OpenAIChatCompatibleCommandV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_COMPATIBLE_INITIAL_COMMAND_INVALID'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_REGENERATE_COMMAND_INVALID'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_EDIT_RESEND_COMMAND_INVALID'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_RETRY_COMMAND_INVALID') {
    super(code)
    this.name = 'OpenAIChatCompatibleCommandV2Error'
  }
}

function closed(value: unknown, keys: readonly string[]): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('invalid')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') || Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((item) => !item.enumerable || !('value' in item) || item.value === undefined)) throw new Error('invalid')
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value])))
}
function token(value: unknown, max = 512): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value) throw new Error('invalid')
  return value
}
function body(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || new TextEncoder().encode(value).byteLength > MAX_BODY_BYTES) throw new Error('invalid')
  return value
}
function extraBody(value: unknown): unknown | null {
  if (value === null) return null
  const parsed = compatibleBoundedJsonValueSchema.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
  return parsed
}
function fingerprint(projection: object): Readonly<{ canonicalJson: string; requestFingerprint: string }> {
  const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_BYTES)
  return Object.freeze({ canonicalJson, requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)) })
}
function sharedBase(raw: Raw) {
  return Object.freeze({
    operationId: GenerationV2Identity.create('operation_id', token(raw.operationId)),
    providerInstanceId: GenerationV2Identity.create('compatible_provider_instance_id', token(raw.providerInstanceId)),
    modelId: GenerationV2Identity.create('model_id', token(raw.modelId)),
  })
}
function initialBase(raw: Raw) {
  return Object.freeze({
    ...sharedBase(raw),
    branchId: ConversationGraphV2Identity.create('branch_id', token(raw.branchId)),
  })
}
function mutationBase(raw: Raw) {
  const base = sharedBase(raw)
  const clientActionId = token(raw.clientActionId)
  if (clientActionId !== base.operationId.value) throw new Error('invalid')
  return Object.freeze({
    ...base,
    clientActionId,
    sourceBranchId: ConversationGraphV2Identity.create('branch_id', token(raw.sourceBranchId)),
  })
}
function fail(kind: 'initial' | 'regenerate' | 'edit_resend' | 'retry'): never {
  throw new OpenAIChatCompatibleCommandV2Error(`GENERATION_V2_OPENAI_COMPATIBLE_${kind.toUpperCase()}_COMMAND_INVALID` as OpenAIChatCompatibleCommandV2Error['code'])
}

export function decodeOpenAIChatCompatibleInitialCommandV2(value: unknown): OpenAIChatCompatibleInitialCommandV2 {
  try {
    const raw = closed(value, ['operationId', 'branchId', 'expectedHeadMessageId', 'providerInstanceId', 'modelId', 'userBody', 'commandAttachments', 'extraBody'])
    const ids = initialBase(raw); const userBody = body(raw.userBody)
    const expectedHeadMessageId = raw.expectedHeadMessageId === null ? null : ConversationGraphV2Identity.create('message_id', token(raw.expectedHeadMessageId))
    const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const requestExtraBody = extraBody(raw.extraBody)
    const projection = { schemaVersion: 1 as const, kind: 'openai_chat_compatible_initial' as const,
      operationId: ids.operationId.value, branchId: ids.branchId.value, expectedHeadMessageId: expectedHeadMessageId?.value ?? null,
      providerInstanceId: ids.providerInstanceId.value, modelId: ids.modelId.value, userBody,
      commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments), extraBody: requestExtraBody }
    return Object.freeze({ ...projection, ...ids, expectedHeadMessageId, userBody, commandAttachments, extraBody: requestExtraBody, ...fingerprint(projection) })
  } catch { return fail('initial') }
}

export function decodeOpenAIChatCompatibleRegenerateCommandV2(value: unknown): OpenAIChatCompatibleRegenerateCommandV2 {
  try {
    const raw = closed(value, ['operationId', 'clientActionId', 'sourceBranchId', 'questionId', 'sourceAnswerId', 'expectedHeadMessageId', 'providerInstanceId', 'modelId', 'commandAttachments', 'extraBody'])
    const ids = mutationBase(raw); const questionId = ConversationGraphV2Identity.create('question_id', token(raw.questionId))
    const sourceAnswerId = ConversationGraphV2Identity.create('answer_root_id', token(raw.sourceAnswerId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', token(raw.expectedHeadMessageId))
    const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const requestExtraBody = extraBody(raw.extraBody)
    const projection = { schemaVersion: 1 as const, kind: 'openai_chat_compatible_regenerate' as const,
      operationId: ids.operationId.value, clientActionId: ids.clientActionId, sourceBranchId: ids.sourceBranchId.value,
      questionId: questionId.value, sourceAnswerId: sourceAnswerId.value,
      expectedHeadMessageId: expectedHeadMessageId.value, providerInstanceId: ids.providerInstanceId.value, modelId: ids.modelId.value,
      commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments), extraBody: requestExtraBody }
    return Object.freeze({ ...projection, ...ids, questionId, sourceAnswerId, expectedHeadMessageId,
      commandAttachments, extraBody: requestExtraBody, ...fingerprint(projection) })
  } catch { return fail('regenerate') }
}

export function decodeOpenAIChatCompatibleEditResendCommandV2(value: unknown): OpenAIChatCompatibleEditResendCommandV2 {
  try {
    const raw = closed(value, ['operationId', 'clientActionId', 'sourceBranchId', 'sourceQuestionId', 'sourceAnswerRootId', 'expectedHeadMessageId', 'providerInstanceId', 'modelId', 'userBody', 'commandAttachments', 'extraBody'])
    const ids = mutationBase(raw); const userBody = body(raw.userBody)
    const sourceQuestionId = ConversationGraphV2Identity.create('question_id', token(raw.sourceQuestionId))
    const sourceAnswerRootId = ConversationGraphV2Identity.create('answer_root_id', token(raw.sourceAnswerRootId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', token(raw.expectedHeadMessageId))
    const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const requestExtraBody = extraBody(raw.extraBody)
    const projection = { schemaVersion: 1 as const, kind: 'openai_chat_compatible_edit_resend' as const,
      operationId: ids.operationId.value, clientActionId: ids.clientActionId, sourceBranchId: ids.sourceBranchId.value,
      sourceQuestionId: sourceQuestionId.value,
      sourceAnswerRootId: sourceAnswerRootId.value, expectedHeadMessageId: expectedHeadMessageId.value,
      providerInstanceId: ids.providerInstanceId.value, modelId: ids.modelId.value, userBody,
      commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments), extraBody: requestExtraBody }
    return Object.freeze({ ...projection, ...ids, sourceQuestionId, sourceAnswerRootId, expectedHeadMessageId,
      userBody, commandAttachments, extraBody: requestExtraBody, ...fingerprint(projection) }) as OpenAIChatCompatibleEditResendCommandV2
  } catch { return fail('edit_resend') }
}

export function decodeOpenAIChatCompatibleRetryCommandV2(value: unknown): OpenAIChatCompatibleRetryCommandV2 {
  try {
    const raw = closed(value, ['actionKind', 'operationId', 'clientActionId', 'sourceBranchId', 'questionId', 'sourceAnswerId', 'expectedHeadMessageId'])
    if (raw.actionKind !== 'retry_as_new' && raw.actionKind !== 'retry_replace') throw new Error('invalid')
    const operationId = GenerationV2Identity.create('operation_id', token(raw.operationId))
    const clientActionId = token(raw.clientActionId)
    if (clientActionId !== operationId.value) throw new Error('invalid')
    const sourceBranchId = ConversationGraphV2Identity.create('branch_id', token(raw.sourceBranchId))
    const questionId = ConversationGraphV2Identity.create('question_id', token(raw.questionId))
    const sourceAnswerId = ConversationGraphV2Identity.create('answer_root_id', token(raw.sourceAnswerId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', token(raw.expectedHeadMessageId))
    const projection = { schemaVersion: 1 as const, kind: 'openai_chat_compatible_retry' as const, actionKind: raw.actionKind,
      operationId: operationId.value, clientActionId, sourceBranchId: sourceBranchId.value, questionId: questionId.value,
      sourceAnswerId: sourceAnswerId.value, expectedHeadMessageId: expectedHeadMessageId.value }
    return Object.freeze({ ...projection, actionKind: raw.actionKind, operationId, clientActionId, sourceBranchId, questionId,
      sourceAnswerId, expectedHeadMessageId, ...fingerprint(projection) }) as OpenAIChatCompatibleRetryCommandV2
  } catch { return fail('retry') }
}
