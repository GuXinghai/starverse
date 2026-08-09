import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'
import type { GenerationStreamProjectionSinkV2, GenerationStreamProjectionV2 } from '../services/generationStreamProjectionV2'
import type { GenerationTextCommandResultV2 } from '../services/generationTextCommandResultV2'
import type { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'
import type { GenerationStreamEventV2 } from '../../src/next/generation-v2/domain/generationStreamEventV2'

export type TextGenerationV2IpcRuntime = Readonly<{
  submitInitial: (command: unknown) => Promise<GenerationTextCommandResultV2>
  retry: (command: unknown) => Promise<GenerationTextCommandResultV2>
  regenerate: (command: unknown) => Promise<GenerationTextCommandResultV2>
  editResend: (command: unknown) => Promise<GenerationTextCommandResultV2>
  continueTool?: (command: unknown) => Promise<GenerationTextCommandResultV2>
  abort: (operationId: string) => boolean
}>

export type TextGenerationV2IpcChannels = Readonly<{
  initial: string
  retry: string
  regenerate: string
  editResend: string
  continueTool?: string
  abort: string
  projection: string
}>

function readOperationId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null
  const id = (value as Record<string, unknown>).operationId
  return typeof id === 'string' && id.length > 0 && id.length <= 512 && id.trim() === id ? id : null
}
function senderFromEvent(value: unknown): WebContents | null {
  const candidate = (value as { sender?: unknown } | null)?.sender
  return candidate && typeof (candidate as WebContents).send === 'function' ? candidate as WebContents : null
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
function publicErrorCode(error: unknown, fallback: string): string {
  const value = error instanceof Error ? error.message : ''
  return /^[A-Z][A-Z0-9_]{2,255}$/u.test(value) ? value : fallback
}

/**
 * Transport-neutral IPC relay only. The caller supplies one closed channel set
 * and one already-typed provider runtime; this function never selects a
 * provider or operation by inspecting request data.
 */
export function registerTextGenerationV2IpcCore(input: Readonly<{
  registerInvoke: RegisterInvoke
  providerErrorPrefix: string
  channels: TextGenerationV2IpcChannels
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => TextGenerationV2IpcRuntime
  runtimeRegistry?: GenerationOperationRuntimeRegistryV2
}>): readonly string[] {
  const operationSenders = new Map<string, WebContents>()
  const downstream = Object.freeze({ publish: (projection: GenerationStreamProjectionV2) => {
    const sender = operationSenders.get(projection.operationId)
    if (!sender) return
    try { sender.send(input.channels.projection, safeProjection(projection)) } catch { /* renderer is downstream */ }
    if (projection.type === 'terminal') operationSenders.delete(projection.operationId)
  } })
  const runtime = input.createRuntime(input.runtimeRegistry?.projectionSink ?? downstream)
  if (input.runtimeRegistry) {
    input.runtimeRegistry.subscribe((event) => {
      const sender = operationSenders.get(event.operationId)
      if (!sender) return
      try { sender.send(input.channels.projection, safeEvent(event)) } catch { /* renderer is downstream */ }
      if (event.payload.type === 'terminal' && event.payload.state !== 'awaiting_tool') {
        operationSenders.delete(event.operationId)
      }
    })
  }
  const failed = `${input.providerErrorPrefix}_COMMAND_FAILED`
  const invalid = `${input.providerErrorPrefix}_INVALID_PAYLOAD`
  const invoke = (dispatch: (command: unknown) => Promise<GenerationTextCommandResultV2>) =>
    async (event: unknown, payload: unknown) => {
      const sender = senderFromEvent(event)
      const operationId = readOperationId(payload)
      if (!sender || !operationId) return Object.freeze({ ok: false, code: invalid })
      operationSenders.set(operationId, sender)
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
            chosenAnswerRootId: branch.chosenAnswerRootId?.value ?? null, deletedAtMs: branch.deletedAtMs }),
        })
      } catch (error) {
        operationSenders.delete(operationId)
        return Object.freeze({ ok: false, code: publicErrorCode(error, failed) })
      }
    }

  input.registerInvoke(input.channels.initial, invoke(runtime.submitInitial))
  input.registerInvoke(input.channels.retry, invoke(runtime.retry))
  input.registerInvoke(input.channels.regenerate, invoke(runtime.regenerate))
  input.registerInvoke(input.channels.editResend, invoke(runtime.editResend))
  if (input.channels.continueTool) {
    if (!runtime.continueTool) throw new Error(`${input.providerErrorPrefix}_CONTINUATION_RUNTIME_MISSING`)
    input.registerInvoke(input.channels.continueTool, invoke(runtime.continueTool))
  }
  input.registerInvoke(input.channels.abort, (_event: unknown, raw: unknown) => {
    const operationId = typeof raw === 'string' && raw.length > 0 && raw.length <= 512 && raw.trim() === raw ? raw : null
    return operationId
      ? Object.freeze({ ok: true, aborted: input.runtimeRegistry
        ? input.runtimeRegistry.abort(operationId)
        : runtime.abort(operationId) })
      : Object.freeze({ ok: false, code: invalid })
  })
  return Object.freeze([input.channels.initial, input.channels.retry, input.channels.regenerate,
    input.channels.editResend, ...(input.channels.continueTool ? [input.channels.continueTool] : []), input.channels.abort])
}
