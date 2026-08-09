import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../domain/identityV2'
import type { AttachmentIntentV2 } from '../../domain/generationIntentV2'
import {
  decodeGenerationCommandAttachmentsV2,
  projectGenerationCommandAttachmentsV2,
} from '../../domain/commandAttachmentsV2'

const MAX_COMMAND_BYTES = 2 * 1024 * 1024
const MAX_PROMPT_BYTES = 1024 * 1024

export type OpenRouterImageInitialSendCommandV2 = Readonly<{
  schemaVersion: 1
  kind: 'openrouter_image_initial_send'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'> | null
  prompt: string
  modelId: Identity<'model_id'>
  requestedProviderTag: Identity<'provider_tag'> | null
  commandAttachments: readonly AttachmentIntentV2[]
  canonicalJson: string
  requestFingerprint: string
}>

export class OpenRouterImageInitialSendCommandV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENROUTER_IMAGE_INITIAL_COMMAND_INVALID') {
    super(code)
    this.name = 'OpenRouterImageInitialSendCommandV2Error'
  }
}

const commands = new WeakSet<object>()

function closedObject(value: unknown): Readonly<Record<string, unknown>> {
  const keys = [
    'operationId', 'branchId', 'expectedHeadMessageId', 'prompt', 'modelId', 'requestedProviderTag',
    'commandAttachments',
  ]
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new OpenRouterImageInitialSendCommandV2Error('GENERATION_V2_OPENROUTER_IMAGE_INITIAL_COMMAND_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor))) {
    throw new OpenRouterImageInitialSendCommandV2Error('GENERATION_V2_OPENROUTER_IMAGE_INITIAL_COMMAND_INVALID')
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new OpenRouterImageInitialSendCommandV2Error('GENERATION_V2_OPENROUTER_IMAGE_INITIAL_COMMAND_INVALID')
  return value
}

export function decodeOpenRouterImageInitialSendCommandV2(value: unknown): OpenRouterImageInitialSendCommandV2 {
  try {
    const input = closedObject(value)
    const prompt = string(input.prompt)
    if (prompt.trim().length === 0 || new TextEncoder().encode(prompt).byteLength > MAX_PROMPT_BYTES) throw new Error('prompt')
    const operationId = GenerationV2Identity.create('operation_id', string(input.operationId))
    const branchId = ConversationGraphV2Identity.create('branch_id', string(input.branchId))
    const expectedHeadMessageId = input.expectedHeadMessageId === null ? null :
      ConversationGraphV2Identity.create('message_id', string(input.expectedHeadMessageId))
    const modelId = GenerationV2Identity.create('model_id', string(input.modelId))
    const requestedProviderTag = input.requestedProviderTag === null ? null :
      GenerationV2Identity.create('provider_tag', string(input.requestedProviderTag))
    const commandAttachments = decodeGenerationCommandAttachmentsV2(input.commandAttachments)
    const projection = Object.freeze({
      schemaVersion: 1 as const, kind: 'openrouter_image_initial_send' as const, operationId: operationId.value,
      branchId: branchId.value, expectedHeadMessageId: expectedHeadMessageId?.value ?? null,
      prompt, modelId: modelId.value, requestedProviderTag: requestedProviderTag?.value ?? null,
      commandAttachments: projectGenerationCommandAttachmentsV2(commandAttachments),
    })
    const canonicalJson = stableSerializeProviderRequestBoundedV2(projection, MAX_COMMAND_BYTES)
    const command = Object.freeze({
      ...projection, operationId, branchId, expectedHeadMessageId, modelId, requestedProviderTag, commandAttachments,
      canonicalJson, requestFingerprint: sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson)),
    })
    commands.add(command)
    return command
  } catch (error) {
    if (error instanceof OpenRouterImageInitialSendCommandV2Error) throw error
    throw new OpenRouterImageInitialSendCommandV2Error('GENERATION_V2_OPENROUTER_IMAGE_INITIAL_COMMAND_INVALID')
  }
}

export function isOpenRouterImageInitialSendCommandV2(value: unknown): value is OpenRouterImageInitialSendCommandV2 {
  return Boolean(value && typeof value === 'object' && commands.has(value))
}
