import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'
import type { OpenAIChatCompatibleGenerationV2Runtime } from '../services/openAIChatCompatibleGenerationV2Runtime'
import type { GenerationStreamProjectionSinkV2, GenerationStreamProjectionV2 } from '../services/generationStreamProjectionV2'
import type { GenerationTextCommandResultV2 } from '../services/generationTextCommandResultV2'

export const OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:openai-compatible:initial',
  'generation-v2:openai-compatible:retry',
  'generation-v2:openai-compatible:regenerate',
  'generation-v2:openai-compatible:edit-resend',
  'generation-v2:openai-compatible:abort',
] as const)
export const OPENAI_COMPATIBLE_GENERATION_V2_PROJECTION_CHANNEL = 'generation-v2:openai-compatible:projection' as const

type Success = Readonly<{
  ok: true
  kind: GenerationTextCommandResultV2['kind']
  operationId: string
  answerRootId: string
  actionKind: GenerationTextCommandResultV2['execution']['operation']['actionKind']
  branch: Readonly<{ branchId: string; conversationId: string; questionId: string; headMessageId: string | null; chosenAnswerRootId: string | null; deletedAtMs: number | null }>
  visibleAnswerRootIds: readonly string[]
  visibleQuestionIds: readonly string[]
}>
type Failure = Readonly<{ ok: false; code: 'GENERATION_V2_OPENAI_COMPATIBLE_IPC_INVALID_PAYLOAD' | 'GENERATION_V2_OPENAI_COMPATIBLE_IPC_COMMAND_FAILED' }>

function senderFromEvent(event: unknown): WebContents | null {
  const sender = (event as { sender?: unknown } | null)?.sender
  return sender && typeof (sender as WebContents).send === 'function' ? sender as WebContents : null
}
function operationIdFrom(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) return null
  const value = (payload as { operationId?: unknown }).operationId
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value ? value : null
}
function project(result: GenerationTextCommandResultV2): Success {
  const branch = result.projection.branchProjection
  return Object.freeze({ ok: true, kind: result.kind, operationId: result.preparedRequest.operationId, answerRootId: result.preparedRequest.answerRootId,
    actionKind: result.execution.operation.actionKind, branch: Object.freeze({ branchId: branch.branchId.value, conversationId: branch.conversationId.value,
      questionId: branch.questionId.value, headMessageId: branch.headMessageId?.value ?? null, chosenAnswerRootId: branch.chosenAnswerRootId?.value ?? null,
      deletedAtMs: branch.deletedAtMs }), visibleAnswerRootIds: Object.freeze(result.projection.visibleCandidates.map((value) => value.value)),
    visibleQuestionIds: Object.freeze(result.projection.visibleQuestionCandidates.map((value) => value.value)) })
}
function safeProjection(projection: GenerationStreamProjectionV2): GenerationStreamProjectionV2 {
  return projection.type === 'reasoning_detail' ? Object.freeze({ ...projection, detail: Object.freeze({ ...projection.detail }) }) : Object.freeze({ ...projection })
}

/** V2-only command bridge. Renderer payloads are dispatched to the explicit compatible runtime; no legacy route, builder or fetch path is invoked. */
export function registerOpenAICompatibleGenerationV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => OpenAIChatCompatibleGenerationV2Runtime
}>): readonly string[] {
  const senders = new Map<string, WebContents>()
  const runtime = input.createRuntime(Object.freeze({ publish: (projection) => {
    const sender = senders.get(projection.operationId)
    if (sender) { try { sender.send(OPENAI_COMPATIBLE_GENERATION_V2_PROJECTION_CHANNEL, safeProjection(projection)) } catch { /* renderer loss cannot roll back V2 state */ } }
    if (projection.type === 'terminal') senders.delete(projection.operationId)
  } }))
  const invoke = (dispatch: (command: unknown) => Promise<GenerationTextCommandResultV2>) => async (event: unknown, payload: unknown): Promise<Success | Failure> => {
    const sender = senderFromEvent(event); const operationId = operationIdFrom(payload)
    if (!sender || !operationId) return Object.freeze({ ok: false, code: 'GENERATION_V2_OPENAI_COMPATIBLE_IPC_INVALID_PAYLOAD' })
    senders.set(operationId, sender)
    try { return project(await dispatch(payload)) }
    catch { senders.delete(operationId); return Object.freeze({ ok: false, code: 'GENERATION_V2_OPENAI_COMPATIBLE_IPC_COMMAND_FAILED' }) }
  }
  input.registerInvoke(OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS[0], invoke((command) => runtime.submitInitial(command)))
  input.registerInvoke(OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS[1], invoke((command) => runtime.retry(command)))
  input.registerInvoke(OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS[2], invoke((command) => runtime.regenerate(command)))
  input.registerInvoke(OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS[3], invoke((command) => runtime.editResend(command)))
  input.registerInvoke(OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS[4], (_event: unknown, value: unknown) => {
    const operationId = typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value ? value : null
    return operationId ? Object.freeze({ ok: true, aborted: runtime.abort(operationId) }) : Object.freeze({ ok: false, code: 'GENERATION_V2_OPENAI_COMPATIBLE_IPC_INVALID_PAYLOAD' })
  })
  return OPENAI_COMPATIBLE_GENERATION_V2_IPC_CHANNELS
}
