import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'
import type { GenerationStreamProjectionSinkV2, GenerationStreamProjectionV2 } from '../services/generationStreamProjectionV2'
import type { GenerationTextCommandResultV2 } from '../services/generationTextCommandResultV2'
import type { OpenRouterImageInitialSendResultV2 } from '../services/openRouterImageInitialSendCoordinatorV2'
import type { OpenRouterImageActionResultV2 } from '../services/openRouterImageActionCoordinatorV2'
import type { OpenRouterFirstPartyGenerationV2Runtime } from '../services/openRouterFirstPartyGenerationV2Runtime'
import type { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'
import type { GenerationStreamEventV2 } from '../../src/next/generation-v2/domain/generationStreamEventV2'
import { decodeCapabilityBoundGenerationCommandV2 } from '../../src/next/generation-v2/domain/capabilityBoundGenerationCommandV2'
import { runWithExpectedCapabilityRevisionV2 } from '../../src/next/generation-v2/capability/capabilityRevisionExpectationV2'

export const OPENROUTER_CHAT_GENERATION_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:openrouter:chat:initial', 'generation-v2:openrouter:chat:retry',
  'generation-v2:openrouter:chat:regenerate', 'generation-v2:openrouter:chat:edit-resend',
  'generation-v2:openrouter:chat:continue-tool', 'generation-v2:openrouter:chat:abort',
] as const)
export const OPENROUTER_IMAGE_GENERATION_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:openrouter:images:initial', 'generation-v2:openrouter:images:retry',
  'generation-v2:openrouter:images:regenerate', 'generation-v2:openrouter:images:edit-resend',
  'generation-v2:openrouter:images:abort',
] as const)
export const OPENROUTER_IMAGE_ENDPOINT_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:openrouter:images:endpoints:get',
  'generation-v2:openrouter:images:endpoints:select',
  'generation-v2:openrouter:images:endpoints:update-settings',
] as const)
export const OPENROUTER_GENERATION_V2_PROJECTION_CHANNEL = 'generation-v2:openrouter:projection' as const

type Result = GenerationTextCommandResultV2 | OpenRouterImageInitialSendResultV2 | OpenRouterImageActionResultV2
type Success = Readonly<{ ok: true; kind: Result['kind']; operationId: string; answerRootId: string; actionKind: string
  branch: Readonly<{ branchId: string; conversationId: string; questionId: string; headMessageId: string | null;
    chosenAnswerRootId: string | null; deletedAtMs: number | null }> }>
type Failure = Readonly<{ ok: false; code: string }>

function operationId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null
  const id = (value as Record<string, unknown>).operationId
  return typeof id === 'string' && id.length > 0 && id.length <= 512 && id.trim() === id ? id : null
}
function sender(value: unknown): WebContents | null {
  const candidate = (value as { sender?: unknown } | null)?.sender
  return candidate && typeof (candidate as WebContents).send === 'function' ? candidate as WebContents : null
}
function committed(result: Result): Success {
  const branch = result.projection.branchProjection
  return Object.freeze({ ok: true, kind: result.kind, operationId: result.execution.operation.operationId.value,
    answerRootId: result.execution.operation.targetAnswerId.value, actionKind: result.execution.operation.actionKind,
    branch: Object.freeze({ branchId: branch.branchId.value, conversationId: branch.conversationId.value,
      questionId: branch.questionId.value, headMessageId: branch.headMessageId?.value ?? null,
      chosenAnswerRootId: branch.chosenAnswerRootId?.value ?? null, deletedAtMs: branch.deletedAtMs }) })
}
function safeProjection(value: GenerationStreamProjectionV2): GenerationStreamProjectionV2 {
  if (value.type === 'assistant_body') return Object.freeze({ ...value })
  if (value.type === 'reasoning_detail') return Object.freeze({ ...value, detail: Object.freeze({ ...value.detail }) })
  if (value.type === 'image_output') return Object.freeze({ ...value })
  return Object.freeze({ ...value })
}
function safeEvent(value: GenerationStreamEventV2): GenerationStreamEventV2 {
  const payload = value.payload.type === 'reasoning_detail'
    ? Object.freeze({ ...value.payload, detail: Object.freeze({ ...value.payload.detail }) })
    : Object.freeze({ ...value.payload })
  return Object.freeze({ operationId: value.operationId, sequence: value.sequence, payload })
}
function publicErrorCode(error: unknown): string {
  const value = error instanceof Error ? error.message : ''
  return /^[A-Z][A-Z0-9_]{2,255}$/u.test(value) ? value : 'GENERATION_V2_OPENROUTER_IPC_COMMAND_FAILED'
}

/** Explicit operation channels; request shape is never used to choose Chat versus Images. */
export function registerOpenRouterGenerationV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => OpenRouterFirstPartyGenerationV2Runtime
  runtimeRegistry?: GenerationOperationRuntimeRegistryV2
}>): readonly string[] {
  const senders = new Map<string, WebContents>()
  const downstream = Object.freeze({ publish: (projection: GenerationStreamProjectionV2) => {
    const target = senders.get(projection.operationId); if (!target) return
    try { target.send(OPENROUTER_GENERATION_V2_PROJECTION_CHANNEL, safeProjection(projection)) } catch { /* downstream only */ }
    if (projection.type === 'terminal') senders.delete(projection.operationId)
  } })
  const runtime = input.createRuntime(input.runtimeRegistry?.projectionSink ?? downstream)
  if (input.runtimeRegistry) input.runtimeRegistry.subscribe((event) => {
    const target = senders.get(event.operationId)
    if (!target) return
    try { target.send(OPENROUTER_GENERATION_V2_PROJECTION_CHANNEL, safeEvent(event)) } catch { /* downstream only */ }
    if (event.payload.type === 'terminal' && event.payload.state !== 'awaiting_tool') senders.delete(event.operationId)
  })
  const invoke = (dispatch: (command: unknown) => Promise<Result>) =>
    async (event: unknown, payload: unknown): Promise<Success | Failure> => {
    const target = sender(event)
    let bound: ReturnType<typeof decodeCapabilityBoundGenerationCommandV2>
    try { bound = decodeCapabilityBoundGenerationCommandV2(payload) }
    catch { return Object.freeze({ ok: false, code: 'GENERATION_V2_OPENROUTER_IPC_INVALID_PAYLOAD' }) }
    const id = operationId(bound.command)
    if (!target || !id) return Object.freeze({ ok: false, code: 'GENERATION_V2_OPENROUTER_IPC_INVALID_PAYLOAD' })
    senders.set(id, target)
    try {
      const result = await runWithExpectedCapabilityRevisionV2(bound.expectedCapabilityRevision,
        () => dispatch(bound.command))
      if (input.runtimeRegistry) {
        input.runtimeRegistry.register(result)
      }
      return committed(result)
    } catch (error) {
      senders.delete(id); return Object.freeze({ ok: false, code: publicErrorCode(error) })
    }
  }
  input.registerInvoke('generation-v2:openrouter:chat:initial', invoke(runtime.chat.submitInitial))
  input.registerInvoke('generation-v2:openrouter:chat:retry', invoke(runtime.chat.retry))
  input.registerInvoke('generation-v2:openrouter:chat:regenerate', invoke(runtime.chat.regenerate))
  input.registerInvoke('generation-v2:openrouter:chat:edit-resend', invoke(runtime.chat.editResend))
  input.registerInvoke('generation-v2:openrouter:chat:continue-tool', invoke(runtime.chat.continueTool))
  input.registerInvoke('generation-v2:openrouter:images:initial', invoke(runtime.images.submitInitial))
  input.registerInvoke('generation-v2:openrouter:images:retry', invoke(runtime.images.retry))
  input.registerInvoke('generation-v2:openrouter:images:regenerate', invoke(runtime.images.regenerate))
  input.registerInvoke('generation-v2:openrouter:images:edit-resend', invoke(runtime.images.editResend))
  const endpointInvoke = (dispatch: (payload: unknown) => Promise<unknown> | unknown) =>
    async (_event: unknown, payload: unknown): Promise<Readonly<{ ok: true; value: unknown }> | Failure> => {
      try { return Object.freeze({ ok: true, value: await dispatch(payload) }) }
      catch (error) { return Object.freeze({ ok: false, code: publicErrorCode(error) }) }
    }
  input.registerInvoke('generation-v2:openrouter:images:endpoints:get', endpointInvoke(runtime.imageEndpoints.read))
  input.registerInvoke('generation-v2:openrouter:images:endpoints:select', endpointInvoke(runtime.imageEndpoints.select))
  input.registerInvoke('generation-v2:openrouter:images:endpoints:update-settings', endpointInvoke(runtime.imageEndpoints.updateSettings))
  const abort = (dispatch: (id: string) => boolean) => (_event: unknown, raw: unknown) => {
    const id = typeof raw === 'string' && raw.length > 0 && raw.length <= 512 && raw.trim() === raw ? raw : null
    return id ? Object.freeze({ ok: true, aborted: input.runtimeRegistry
      ? input.runtimeRegistry.abort(id)
      : dispatch(id) }) : Object.freeze({ ok: false, code: 'GENERATION_V2_OPENROUTER_IPC_INVALID_PAYLOAD' })
  }
  input.registerInvoke('generation-v2:openrouter:chat:abort', abort(runtime.chat.abort))
  input.registerInvoke('generation-v2:openrouter:images:abort', abort(runtime.images.abort))
  return Object.freeze([
    ...OPENROUTER_CHAT_GENERATION_V2_IPC_CHANNELS,
    ...OPENROUTER_IMAGE_GENERATION_V2_IPC_CHANNELS,
    ...OPENROUTER_IMAGE_ENDPOINT_V2_IPC_CHANNELS,
  ])
}
