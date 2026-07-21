import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'
import type {
  DeepSeekGenerationV2Runtime,
} from '../services/deepSeekGenerationV2Runtime'
import type {
  GenerationStreamProjectionSinkV2,
  GenerationStreamProjectionV2,
} from '../services/generationStreamProjectionV2'
import type { GenerationTextCommandResultV2 } from '../services/generationTextCommandResultV2'

export const DEEPSEEK_GENERATION_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:deepseek:initial',
  'generation-v2:deepseek:retry',
  'generation-v2:deepseek:regenerate',
  'generation-v2:deepseek:edit-resend',
  'generation-v2:deepseek:continue-tool',
  'generation-v2:deepseek:abort',
] as const)

export const DEEPSEEK_GENERATION_V2_PROJECTION_CHANNEL = 'generation-v2:deepseek:projection' as const

type DeepSeekGenerationV2IpcSuccess = Readonly<{
  ok: true
  kind: GenerationTextCommandResultV2['kind']
  operationId: string
  answerRootId: string
  actionKind: GenerationTextCommandResultV2['execution']['operation']['actionKind']
  branch: Readonly<{
    branchId: string
    conversationId: string
    questionId: string
    headMessageId: string | null
    chosenAnswerRootId: string | null
    deletedAtMs: number | null
  }>
  visibleAnswerRootIds: readonly string[]
  visibleQuestionIds: readonly string[]
}>

type DeepSeekGenerationV2IpcFailure = Readonly<{
  ok: false
  code: 'GENERATION_V2_DEEPSEEK_IPC_INVALID_PAYLOAD' | 'GENERATION_V2_DEEPSEEK_IPC_COMMAND_FAILED'
}>

type RegisterDeepSeekGenerationV2IpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  createRuntime: (sink: GenerationStreamProjectionSinkV2) => DeepSeekGenerationV2Runtime
}>

function senderFromEvent(event: unknown): WebContents | null {
  const sender = (event as { sender?: unknown } | null)?.sender
  return sender && typeof (sender as WebContents).send === 'function' ? sender as WebContents : null
}

function readOperationId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) {
    return null
  }
  const value = (payload as { operationId?: unknown }).operationId
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 || value.trim() !== value) return null
  return value
}

function projectCommitted(result: GenerationTextCommandResultV2): DeepSeekGenerationV2IpcSuccess {
  const branch = result.projection.branchProjection
  return Object.freeze({
    ok: true,
    kind: result.kind,
    operationId: result.preparedRequest.operationId,
    answerRootId: result.preparedRequest.answerRootId,
    actionKind: result.execution.operation.actionKind,
    branch: Object.freeze({
      branchId: branch.branchId.value,
      conversationId: branch.conversationId.value,
      questionId: branch.questionId.value,
      headMessageId: branch.headMessageId?.value ?? null,
      chosenAnswerRootId: branch.chosenAnswerRootId?.value ?? null,
      deletedAtMs: branch.deletedAtMs,
    }),
    visibleAnswerRootIds: Object.freeze(result.projection.visibleCandidates.map((item) => item.value)),
    visibleQuestionIds: Object.freeze(result.projection.visibleQuestionCandidates.map((item) => item.value)),
  })
}

function safeProjection(projection: GenerationStreamProjectionV2): GenerationStreamProjectionV2 {
  if (projection.type === 'reasoning_detail') {
    return Object.freeze({ ...projection, detail: Object.freeze({ ...projection.detail }) })
  }
  return Object.freeze({ ...projection })
}

/**
 * V2-only IPC contract. It is intentionally separate from the legacy
 * `deepseek-chat:*` bridge: no renderer message history or UI generation
 * parameters are translated into a V2 command here.
 */
export function registerDeepSeekGenerationV2Ipc(input: RegisterDeepSeekGenerationV2IpcInput): string[] {
  const operationSenders = new Map<string, WebContents>()
  const runtime = input.createRuntime(Object.freeze({
    publish: (projection) => {
      const sender = operationSenders.get(projection.operationId)
      if (!sender) return
      try {
        sender.send(DEEPSEEK_GENERATION_V2_PROJECTION_CHANNEL, safeProjection(projection))
      } catch {
        // A renderer lifecycle failure cannot affect a committed V2 operation.
      }
      if (projection.type === 'terminal') operationSenders.delete(projection.operationId)
    },
  }))

  const invoke = (
    dispatch: (command: unknown) => Promise<GenerationTextCommandResultV2>,
  ) => async (event: unknown, payload: unknown): Promise<DeepSeekGenerationV2IpcSuccess | DeepSeekGenerationV2IpcFailure> => {
    const sender = senderFromEvent(event)
    const operationId = readOperationId(payload)
    if (!sender || !operationId) return Object.freeze({ ok: false, code: 'GENERATION_V2_DEEPSEEK_IPC_INVALID_PAYLOAD' })
    operationSenders.set(operationId, sender)
    try {
      return projectCommitted(await dispatch(payload))
    } catch {
      operationSenders.delete(operationId)
      return Object.freeze({ ok: false, code: 'GENERATION_V2_DEEPSEEK_IPC_COMMAND_FAILED' })
    }
  }

  input.registerInvoke('generation-v2:deepseek:initial', invoke((command) => runtime.submitInitial(command)))
  input.registerInvoke('generation-v2:deepseek:retry', invoke((command) => runtime.retry(command)))
  input.registerInvoke('generation-v2:deepseek:regenerate', invoke((command) => runtime.regenerate(command)))
  input.registerInvoke('generation-v2:deepseek:edit-resend', invoke((command) => runtime.editResend(command)))
  input.registerInvoke('generation-v2:deepseek:continue-tool', invoke((command) => runtime.continueTool(command)))
  input.registerInvoke('generation-v2:deepseek:abort', (_event: unknown, operationId: unknown) => {
    const value = typeof operationId === 'string' && operationId.trim() === operationId && operationId.length > 0 && operationId.length <= 512
      ? operationId : null
    if (!value) return Object.freeze({ ok: false, code: 'GENERATION_V2_DEEPSEEK_IPC_INVALID_PAYLOAD' })
    return Object.freeze({ ok: true, aborted: runtime.abort(value) })
  })
  return [...DEEPSEEK_GENERATION_V2_IPC_CHANNELS]
}
