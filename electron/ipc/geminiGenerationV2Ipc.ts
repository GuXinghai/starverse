import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'
import type { GenerationStreamProjectionSinkV2, GenerationStreamProjectionV2 } from '../services/generationStreamProjectionV2'
import type { GenerationTextCommandResultV2 } from '../services/generationTextCommandResultV2'
import type { GeminiGenerateContentGenerationV2Runtime } from '../services/geminiGenerateContentGenerationV2Runtime'
import type { GeminiInteractionsImageCommandResultV2 } from '../services/geminiInteractionsImageInitialSendCoordinatorV2'
import type { GeminiInteractionsImageGenerationV2Runtime } from '../services/geminiInteractionsImageGenerationV2Runtime'
import type { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'
import type { GenerationStreamEventV2 } from '../../src/next/generation-v2/domain/generationStreamEventV2'

export const GEMINI_GENERATION_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:gemini:generate-content:initial', 'generation-v2:gemini:generate-content:retry',
  'generation-v2:gemini:generate-content:regenerate', 'generation-v2:gemini:generate-content:edit-resend',
  'generation-v2:gemini:generate-content:continue-tool', 'generation-v2:gemini:generate-content:abort',
  'generation-v2:gemini:interactions-image:initial', 'generation-v2:gemini:interactions-image:retry',
  'generation-v2:gemini:interactions-image:regenerate', 'generation-v2:gemini:interactions-image:edit-resend',
  'generation-v2:gemini:interactions-image:abort',
] as const)
export const GEMINI_GENERATION_V2_PROJECTION_CHANNEL = 'generation-v2:gemini:projection' as const
export const GEMINI_INTERACTIONS_IMAGE_V2_PROJECTION_CHANNEL = 'generation-v2:gemini:interactions-image:projection' as const

type Result = GenerationTextCommandResultV2 | GeminiInteractionsImageCommandResultV2
function operationId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null
  const id = (value as Record<string, unknown>).operationId
  return typeof id === 'string' && id.length > 0 && id.length <= 512 && id.trim() === id ? id : null
}
function sender(value: unknown): WebContents | null {
  const candidate = (value as { sender?: unknown } | null)?.sender
  return candidate && typeof (candidate as WebContents).send === 'function' ? candidate as WebContents : null
}
function publicErrorCode(error: unknown): string {
  const value = error instanceof Error ? error.message : ''
  return /^[A-Z][A-Z0-9_]{2,255}$/u.test(value) ? value : 'GENERATION_V2_GEMINI_IPC_COMMAND_FAILED'
}
function safeProjection(value: GenerationStreamProjectionV2): GenerationStreamProjectionV2 {
  if (value.type === 'reasoning_detail') return Object.freeze({ ...value, detail: Object.freeze({ ...value.detail }) })
  return Object.freeze({ ...value })
}
function safeEvent(value: GenerationStreamEventV2): GenerationStreamEventV2 {
  const payload = value.payload.type === 'reasoning_detail'
    ? Object.freeze({ ...value.payload, detail: Object.freeze({ ...value.payload.detail }) })
    : Object.freeze({ ...value.payload })
  return Object.freeze({ operationId: value.operationId, sequence: value.sequence, payload })
}

/** Separate GenerateContent and Interactions channels; payload shape never selects a protocol. */
export function registerGeminiGenerationV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => GeminiGenerateContentGenerationV2Runtime
  createInteractionsImageRuntime: (sink: GenerationStreamProjectionSinkV2) => GeminiInteractionsImageGenerationV2Runtime
  runtimeRegistry?: GenerationOperationRuntimeRegistryV2
}>): readonly string[] {
  const senders = new Map<string, Readonly<{ target: WebContents; channel: string }>>()
  const sink = (channel: string) => Object.freeze({ publish: (projection: GenerationStreamProjectionV2) => {
    const relay = senders.get(projection.operationId)
    if (!relay) return
    try { relay.target.send(channel, safeProjection(projection)) } catch { /* downstream */ }
    if (projection.type === 'terminal') senders.delete(projection.operationId)
  } })
  const generateContent = input.createRuntime(input.runtimeRegistry?.projectionSink ?? sink(GEMINI_GENERATION_V2_PROJECTION_CHANNEL))
  const interactionsImage = input.createInteractionsImageRuntime(input.runtimeRegistry?.projectionSink ?? sink(GEMINI_INTERACTIONS_IMAGE_V2_PROJECTION_CHANNEL))
  if (input.runtimeRegistry) input.runtimeRegistry.subscribe((event) => {
    const relay = senders.get(event.operationId)
    if (!relay) return
    try { relay.target.send(relay.channel, safeEvent(event)) } catch { /* downstream */ }
    if (event.payload.type === 'terminal' && event.payload.state !== 'awaiting_tool') senders.delete(event.operationId)
  })
  const invoke = (
    dispatch: (command: unknown) => Promise<Result>,
    channel: string,
  ) => async (event: unknown, payload: unknown) => {
    const target = sender(event); const id = operationId(payload)
    if (!target || !id) return Object.freeze({ ok: false, code: 'GENERATION_V2_GEMINI_IPC_INVALID_PAYLOAD' })
    senders.set(id, Object.freeze({ target, channel }))
    try {
      const result = await dispatch(payload)
      if (input.runtimeRegistry) {
        input.runtimeRegistry.register(result)
      }
      const branch = result.projection.branchProjection
      return Object.freeze({ ok: true, kind: result.kind,
        operationId: result.execution.operation.operationId.value,
        answerRootId: result.execution.operation.targetAnswerId.value,
        actionKind: result.execution.operation.actionKind,
        branch: Object.freeze({ branchId: branch.branchId.value, conversationId: branch.conversationId.value,
          questionId: branch.questionId.value, headMessageId: branch.headMessageId?.value ?? null,
          chosenAnswerRootId: branch.chosenAnswerRootId?.value ?? null, deletedAtMs: branch.deletedAtMs }) })
    } catch (error) { senders.delete(id); return Object.freeze({ ok: false, code: publicErrorCode(error) }) }
  }
  const abort = (dispatch: (id: string) => boolean) => (_event: unknown, raw: unknown) => {
    const id = typeof raw === 'string' && raw.length > 0 && raw.length <= 512 && raw.trim() === raw ? raw : null
    return id ? Object.freeze({ ok: true, aborted: input.runtimeRegistry
      ? input.runtimeRegistry.abort(id)
      : dispatch(id) })
      : Object.freeze({ ok: false, code: 'GENERATION_V2_GEMINI_IPC_INVALID_PAYLOAD' })
  }
  input.registerInvoke(GEMINI_GENERATION_V2_IPC_CHANNELS[0], invoke(generateContent.submitInitial, GEMINI_GENERATION_V2_PROJECTION_CHANNEL))
  input.registerInvoke(GEMINI_GENERATION_V2_IPC_CHANNELS[1], invoke(generateContent.retry, GEMINI_GENERATION_V2_PROJECTION_CHANNEL))
  input.registerInvoke(GEMINI_GENERATION_V2_IPC_CHANNELS[2], invoke(generateContent.regenerate, GEMINI_GENERATION_V2_PROJECTION_CHANNEL))
  input.registerInvoke(GEMINI_GENERATION_V2_IPC_CHANNELS[3], invoke(generateContent.editResend, GEMINI_GENERATION_V2_PROJECTION_CHANNEL))
  input.registerInvoke(GEMINI_GENERATION_V2_IPC_CHANNELS[4], invoke(generateContent.continueTool, GEMINI_GENERATION_V2_PROJECTION_CHANNEL))
  input.registerInvoke(GEMINI_GENERATION_V2_IPC_CHANNELS[5], abort(generateContent.abort))
  input.registerInvoke(GEMINI_GENERATION_V2_IPC_CHANNELS[6], invoke(interactionsImage.submitInitial, GEMINI_INTERACTIONS_IMAGE_V2_PROJECTION_CHANNEL))
  input.registerInvoke(GEMINI_GENERATION_V2_IPC_CHANNELS[7], invoke(interactionsImage.retry, GEMINI_INTERACTIONS_IMAGE_V2_PROJECTION_CHANNEL))
  input.registerInvoke(GEMINI_GENERATION_V2_IPC_CHANNELS[8], invoke(interactionsImage.regenerate, GEMINI_INTERACTIONS_IMAGE_V2_PROJECTION_CHANNEL))
  input.registerInvoke(GEMINI_GENERATION_V2_IPC_CHANNELS[9], invoke(interactionsImage.editResend, GEMINI_INTERACTIONS_IMAGE_V2_PROJECTION_CHANNEL))
  input.registerInvoke(GEMINI_GENERATION_V2_IPC_CHANNELS[10], abort(interactionsImage.abort))
  return GEMINI_GENERATION_V2_IPC_CHANNELS
}
