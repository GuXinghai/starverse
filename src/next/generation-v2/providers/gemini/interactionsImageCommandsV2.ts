import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { decodeGenerationCommandAttachmentsV2, projectGenerationCommandAttachmentsV2 } from '../../domain/commandAttachmentsV2'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'
import type { AttachmentIntentV2 } from '../../domain/generationIntentV2'
import { normalizeGeminiImageGenerationModelId } from '../../../provider/gemini/geminiImageGenerationPolicy'
import { isGeminiInteractionsImageModelIdV1 } from './interactionsImageCapabilityPolicyV1'

const MAX = 4 * 1024 * 1024
const issued = new WeakSet<object>()

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((item) => !item.enumerable || !('value' in item) || item.value === undefined)) throw new Error()
  return Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value]))
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) throw new Error()
  return value
}
function issue<T extends object>(projection: object, typed: T): T & Readonly<{ canonicalJson: string; requestFingerprint: string }> {
  const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX)
  const value = Object.freeze({
    ...typed,
    canonicalJson,
    requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
  })
  issued.add(value)
  return value
}
function model(value: unknown): Identity<'model_id'> {
  const raw = text(value)
  const normalized = normalizeGeminiImageGenerationModelId(raw)
  if (raw !== normalized || !isGeminiInteractionsImageModelIdV1(normalized)) throw new Error()
  return GenerationV2Identity.create('model_id', normalized)
}
function prompt(value: unknown): string {
  const result = text(value)
  if (!result.trim() || new TextEncoder().encode(result).byteLength > 1024 * 1024) throw new Error()
  return result
}
function mutationIds(raw: Record<string, unknown>) {
  const operationId = GenerationV2Identity.create('operation_id', text(raw.operationId))
  const clientActionId = text(raw.clientActionId)
  if (clientActionId !== operationId.value) throw new Error()
  return Object.freeze({
    operationId,
    clientActionId,
    sourceBranchId: ConversationGraphV2Identity.create('branch_id', text(raw.sourceBranchId)),
  })
}

export type GeminiInteractionsImageInitialCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'gemini_interactions_image_initial'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'> | null
  prompt: string
  modelId: Identity<'model_id'>
  commandAttachments: readonly AttachmentIntentV2[]
  canonicalJson: string
  requestFingerprint: string
}>
export function decodeGeminiInteractionsImageInitialCommandV2(value: unknown): GeminiInteractionsImageInitialCommandV2 {
  try {
    const raw = object(value, ['operationId', 'branchId', 'expectedHeadMessageId', 'prompt', 'modelId', 'commandAttachments'])
    const operationId = GenerationV2Identity.create('operation_id', text(raw.operationId))
    const branchId = ConversationGraphV2Identity.create('branch_id', text(raw.branchId))
    const expectedHeadMessageId = raw.expectedHeadMessageId === null
      ? null
      : ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId))
    const body = prompt(raw.prompt)
    const modelId = model(raw.modelId)
    const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = {
      schemaVersion: 1 as const,
      kind: 'gemini_interactions_image_initial' as const,
      operationId: operationId.value,
      branchId: branchId.value,
      expectedHeadMessageId: expectedHeadMessageId?.value ?? null,
      prompt: body,
      modelId: modelId.value,
      commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments),
    }
    return issue(projection, { ...projection, operationId, branchId, expectedHeadMessageId, prompt: body, modelId, commandAttachments })
  } catch {
    throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_IMAGE_INITIAL_COMMAND_INVALID')
  }
}
export function isGeminiInteractionsImageInitialCommandV2(value: unknown): value is GeminiInteractionsImageInitialCommandV2 {
  return Boolean(value && typeof value === 'object' && issued.has(value) &&
    (value as GeminiInteractionsImageInitialCommandV2).kind === 'gemini_interactions_image_initial')
}

export type GeminiInteractionsImageRetryCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'gemini_interactions_image_retry'
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
export function decodeGeminiInteractionsImageRetryCommandV2(value: unknown): GeminiInteractionsImageRetryCommandV2 {
  try {
    const raw = object(value, ['actionKind', 'operationId', 'clientActionId', 'sourceBranchId', 'questionId', 'sourceAnswerId', 'expectedHeadMessageId'])
    if (raw.actionKind !== 'retry_as_new' && raw.actionKind !== 'retry_replace') throw new Error()
    const ids = mutationIds(raw)
    const questionId = ConversationGraphV2Identity.create('question_id', text(raw.questionId))
    const sourceAnswerId = ConversationGraphV2Identity.create('answer_root_id', text(raw.sourceAnswerId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId))
    const projection = {
      schemaVersion: 1 as const,
      kind: 'gemini_interactions_image_retry' as const,
      actionKind: raw.actionKind,
      operationId: ids.operationId.value,
      clientActionId: ids.clientActionId,
      sourceBranchId: ids.sourceBranchId.value,
      questionId: questionId.value,
      sourceAnswerId: sourceAnswerId.value,
      expectedHeadMessageId: expectedHeadMessageId.value,
    }
    return issue(projection, {
      ...projection,
      actionKind: raw.actionKind as 'retry_as_new' | 'retry_replace',
      ...ids,
      questionId,
      sourceAnswerId,
      expectedHeadMessageId,
    })
  } catch {
    throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_IMAGE_RETRY_COMMAND_INVALID')
  }
}
export function isGeminiInteractionsImageRetryCommandV2(value: unknown): value is GeminiInteractionsImageRetryCommandV2 {
  return Boolean(value && typeof value === 'object' && issued.has(value) &&
    (value as GeminiInteractionsImageRetryCommandV2).kind === 'gemini_interactions_image_retry')
}

export type GeminiInteractionsImageRegenerateCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'gemini_interactions_image_regenerate'
  operationId: Identity<'operation_id'>
  clientActionId: string
  sourceBranchId: GraphIdentity<'branch_id'>
  questionId: GraphIdentity<'question_id'>
  sourceAnswerId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  modelId: Identity<'model_id'>
  commandAttachments: readonly AttachmentIntentV2[]
  canonicalJson: string
  requestFingerprint: string
}>
export function decodeGeminiInteractionsImageRegenerateCommandV2(value: unknown): GeminiInteractionsImageRegenerateCommandV2 {
  try {
    const raw = object(value, ['operationId', 'clientActionId', 'sourceBranchId', 'questionId', 'sourceAnswerId', 'expectedHeadMessageId', 'modelId', 'commandAttachments'])
    const ids = mutationIds(raw)
    const questionId = ConversationGraphV2Identity.create('question_id', text(raw.questionId))
    const sourceAnswerId = ConversationGraphV2Identity.create('answer_root_id', text(raw.sourceAnswerId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId))
    const modelId = model(raw.modelId)
    const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = {
      schemaVersion: 1 as const,
      kind: 'gemini_interactions_image_regenerate' as const,
      operationId: ids.operationId.value,
      clientActionId: ids.clientActionId,
      sourceBranchId: ids.sourceBranchId.value,
      questionId: questionId.value,
      sourceAnswerId: sourceAnswerId.value,
      expectedHeadMessageId: expectedHeadMessageId.value,
      modelId: modelId.value,
      commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments),
    }
    return issue(projection, { ...projection, ...ids, questionId, sourceAnswerId, expectedHeadMessageId, modelId, commandAttachments })
  } catch {
    throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_IMAGE_REGENERATE_COMMAND_INVALID')
  }
}
export function isGeminiInteractionsImageRegenerateCommandV2(value: unknown): value is GeminiInteractionsImageRegenerateCommandV2 {
  return Boolean(value && typeof value === 'object' && issued.has(value) &&
    (value as GeminiInteractionsImageRegenerateCommandV2).kind === 'gemini_interactions_image_regenerate')
}

export type GeminiInteractionsImageEditResendCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'gemini_interactions_image_edit_resend'
  operationId: Identity<'operation_id'>
  clientActionId: string
  sourceBranchId: GraphIdentity<'branch_id'>
  sourceQuestionId: GraphIdentity<'question_id'>
  sourceAnswerRootId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  prompt: string
  modelId: Identity<'model_id'>
  commandAttachments: readonly AttachmentIntentV2[]
  canonicalJson: string
  requestFingerprint: string
}>
export function decodeGeminiInteractionsImageEditResendCommandV2(value: unknown): GeminiInteractionsImageEditResendCommandV2 {
  try {
    const raw = object(value, ['operationId', 'clientActionId', 'sourceBranchId', 'sourceQuestionId', 'sourceAnswerRootId', 'expectedHeadMessageId', 'prompt', 'modelId', 'commandAttachments'])
    const ids = mutationIds(raw)
    const sourceQuestionId = ConversationGraphV2Identity.create('question_id', text(raw.sourceQuestionId))
    const sourceAnswerRootId = ConversationGraphV2Identity.create('answer_root_id', text(raw.sourceAnswerRootId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId))
    const body = prompt(raw.prompt)
    const modelId = model(raw.modelId)
    const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = {
      schemaVersion: 1 as const,
      kind: 'gemini_interactions_image_edit_resend' as const,
      operationId: ids.operationId.value,
      clientActionId: ids.clientActionId,
      sourceBranchId: ids.sourceBranchId.value,
      sourceQuestionId: sourceQuestionId.value,
      sourceAnswerRootId: sourceAnswerRootId.value,
      expectedHeadMessageId: expectedHeadMessageId.value,
      prompt: body,
      modelId: modelId.value,
      commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments),
    }
    return issue(projection, { ...projection, ...ids, sourceQuestionId, sourceAnswerRootId, expectedHeadMessageId, prompt: body, modelId, commandAttachments })
  } catch {
    throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_IMAGE_EDIT_RESEND_COMMAND_INVALID')
  }
}
export function isGeminiInteractionsImageEditResendCommandV2(value: unknown): value is GeminiInteractionsImageEditResendCommandV2 {
  return Boolean(value && typeof value === 'object' && issued.has(value) &&
    (value as GeminiInteractionsImageEditResendCommandV2).kind === 'gemini_interactions_image_edit_resend')
}
