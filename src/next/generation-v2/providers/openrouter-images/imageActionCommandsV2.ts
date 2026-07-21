import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'
import { decodeGenerationCommandAttachmentsV2, projectGenerationCommandAttachmentsV2 } from '../../domain/commandAttachmentsV2'
import type { AttachmentIntentV2 } from '../../domain/generationIntentV2'

const MAX = 4 * 1024 * 1024
const commands = new WeakSet<object>()
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') || Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((entry) => !entry.enumerable || !('value' in entry) || entry.value === undefined)) throw new Error()
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]))
}
function text(value: unknown): string { if (typeof value !== 'string') throw new Error(); return value }
function issue<T extends object>(projection: object, typed: T): T & Readonly<{ canonicalJson: string; requestFingerprint: string }> {
  const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX)
  const command = Object.freeze({ ...typed, canonicalJson,
    requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)) })
  commands.add(command); return command
}

export type OpenRouterImageRetryCommandV2 = Readonly<{
  schemaVersion: 1; kind: 'openrouter_image_retry'; actionKind: 'retry_as_new' | 'retry_replace'; operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>; questionId: GraphIdentity<'question_id'>
  targetAnswerRootId: GraphIdentity<'answer_root_id'>; expectedHeadMessageId: GraphIdentity<'message_id'>
  canonicalJson: string; requestFingerprint: string
}>
export function isOpenRouterImageRetryCommandV2(value: unknown): value is OpenRouterImageRetryCommandV2 { return Boolean(value && typeof value === 'object' && commands.has(value) && (value as OpenRouterImageRetryCommandV2).kind === 'openrouter_image_retry') }
export function decodeOpenRouterImageRetryCommandV2(value: unknown): OpenRouterImageRetryCommandV2 {
  try {
    const raw = object(value, ['actionKind', 'operationId', 'branchId', 'questionId', 'targetAnswerRootId', 'expectedHeadMessageId'])
    if (raw.actionKind !== 'retry_as_new' && raw.actionKind !== 'retry_replace') throw new Error()
    const operationId = GenerationV2Identity.create('operation_id', text(raw.operationId)); const branchId = ConversationGraphV2Identity.create('branch_id', text(raw.branchId))
    const questionId = ConversationGraphV2Identity.create('question_id', text(raw.questionId)); const targetAnswerRootId = ConversationGraphV2Identity.create('answer_root_id', text(raw.targetAnswerRootId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId)); if (expectedHeadMessageId.value !== targetAnswerRootId.value) throw new Error()
    const projection = { schemaVersion: 1 as const, kind: 'openrouter_image_retry' as const, actionKind: raw.actionKind, operationId: operationId.value,
      branchId: branchId.value, questionId: questionId.value, targetAnswerRootId: targetAnswerRootId.value, expectedHeadMessageId: expectedHeadMessageId.value }
    return issue(projection, { ...projection, actionKind: raw.actionKind as 'retry_as_new' | 'retry_replace', operationId, branchId, questionId, targetAnswerRootId, expectedHeadMessageId })
  } catch { throw new Error('GENERATION_V2_OPENROUTER_IMAGE_RETRY_COMMAND_INVALID') }
}

export type OpenRouterImageRegenerateCommandV2 = Readonly<{
  schemaVersion: 1; kind: 'openrouter_image_regenerate'; operationId: Identity<'operation_id'>; branchId: GraphIdentity<'branch_id'>
  questionId: GraphIdentity<'question_id'>; expectedHeadMessageId: GraphIdentity<'message_id'>; modelId: Identity<'model_id'>
  requestedProviderTag: Identity<'provider_tag'> | null
  canonicalJson: string; requestFingerprint: string
}>
export function isOpenRouterImageRegenerateCommandV2(value: unknown): value is OpenRouterImageRegenerateCommandV2 { return Boolean(value && typeof value === 'object' && commands.has(value) && (value as OpenRouterImageRegenerateCommandV2).kind === 'openrouter_image_regenerate') }
export function decodeOpenRouterImageRegenerateCommandV2(value: unknown): OpenRouterImageRegenerateCommandV2 {
  try {
    const raw = object(value, ['operationId', 'branchId', 'questionId', 'expectedHeadMessageId', 'modelId', 'requestedProviderTag'])
    const operationId = GenerationV2Identity.create('operation_id', text(raw.operationId)); const branchId = ConversationGraphV2Identity.create('branch_id', text(raw.branchId))
    const questionId = ConversationGraphV2Identity.create('question_id', text(raw.questionId)); const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId))
    const modelId = GenerationV2Identity.create('model_id', text(raw.modelId)); const requestedProviderTag = raw.requestedProviderTag === null ? null : GenerationV2Identity.create('provider_tag', text(raw.requestedProviderTag))
    const projection = { schemaVersion: 1 as const, kind: 'openrouter_image_regenerate' as const, operationId: operationId.value, branchId: branchId.value,
      questionId: questionId.value, expectedHeadMessageId: expectedHeadMessageId.value, modelId: modelId.value,
      requestedProviderTag: requestedProviderTag?.value ?? null }
    return issue(projection, { ...projection, operationId, branchId, questionId, expectedHeadMessageId, modelId, requestedProviderTag })
  } catch { throw new Error('GENERATION_V2_OPENROUTER_IMAGE_REGENERATE_COMMAND_INVALID') }
}

export type OpenRouterImageEditResendCommandV2 = Readonly<{
  schemaVersion: 1; kind: 'openrouter_image_edit_resend'; mode: 'fork' | 'replace'; operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>; sourceQuestionId: GraphIdentity<'question_id'>; sourceAnswerRootId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>; prompt: string; modelId: Identity<'model_id'>
  requestedProviderTag: Identity<'provider_tag'> | null; commandAttachments: readonly AttachmentIntentV2[]
  canonicalJson: string; requestFingerprint: string
}>
export function isOpenRouterImageEditResendCommandV2(value: unknown): value is OpenRouterImageEditResendCommandV2 { return Boolean(value && typeof value === 'object' && commands.has(value) && (value as OpenRouterImageEditResendCommandV2).kind === 'openrouter_image_edit_resend') }
export function decodeOpenRouterImageEditResendCommandV2(value: unknown): OpenRouterImageEditResendCommandV2 {
  try {
    const raw = object(value, ['mode', 'operationId', 'branchId', 'sourceQuestionId', 'sourceAnswerRootId', 'expectedHeadMessageId', 'prompt', 'modelId', 'requestedProviderTag', 'commandAttachments'])
    if (raw.mode !== 'fork' && raw.mode !== 'replace') throw new Error()
    const prompt = text(raw.prompt); if (prompt.trim().length === 0 || new TextEncoder().encode(prompt).byteLength > 1024 * 1024) throw new Error()
    const operationId = GenerationV2Identity.create('operation_id', text(raw.operationId)); const branchId = ConversationGraphV2Identity.create('branch_id', text(raw.branchId))
    const sourceQuestionId = ConversationGraphV2Identity.create('question_id', text(raw.sourceQuestionId)); const sourceAnswerRootId = ConversationGraphV2Identity.create('answer_root_id', text(raw.sourceAnswerRootId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create('message_id', text(raw.expectedHeadMessageId)); const modelId = GenerationV2Identity.create('model_id', text(raw.modelId))
    const requestedProviderTag = raw.requestedProviderTag === null ? null : GenerationV2Identity.create('provider_tag', text(raw.requestedProviderTag)); const commandAttachments = decodeGenerationCommandAttachmentsV2(raw.commandAttachments)
    const projection = { schemaVersion: 1 as const, kind: 'openrouter_image_edit_resend' as const, mode: raw.mode, operationId: operationId.value, branchId: branchId.value,
      sourceQuestionId: sourceQuestionId.value, sourceAnswerRootId: sourceAnswerRootId.value, expectedHeadMessageId: expectedHeadMessageId.value,
      prompt, modelId: modelId.value, requestedProviderTag: requestedProviderTag?.value ?? null, commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments) }
    return issue(projection, { ...projection, mode: raw.mode as 'fork' | 'replace', operationId, branchId, sourceQuestionId, sourceAnswerRootId,
      expectedHeadMessageId, prompt, modelId, requestedProviderTag, commandAttachments })
  } catch { throw new Error('GENERATION_V2_OPENROUTER_IMAGE_EDIT_RESEND_COMMAND_INVALID') }
}
