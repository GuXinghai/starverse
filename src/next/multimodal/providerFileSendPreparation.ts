import type { SendPlan, SendPlanModelDescriptor, SendPlanProviderContext } from '@/shared/files/sendPlanTypes'
import type { ProviderRuntimeContentBlock } from './providerRuntimeContentBlocks'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

export type ProviderFileRuntimeProvider =
  | 'openai_responses'
  | 'anthropic_messages'
  | 'google_ai_studio'
  | 'openrouter'

export type PrepareProviderFileSendInput = Readonly<{
  provider: ProviderFileRuntimeProvider
  conversationId: string
  userText: string
  model: SendPlanModelDescriptor
  providerContext: SendPlanProviderContext
  historyMessageIds?: ReadonlyArray<string>
}>

export type PreparedProviderFileSend =
  | Readonly<{
      ok: true
      provider: ProviderFileRuntimeProvider
      sendPlan: SendPlan
      contentParts: ProviderRuntimeContentBlock[]
      sentAssetIds: string[]
      hasDraftAttachmentPlans: boolean
      diagnostics: Record<string, unknown>
    }>
  | Readonly<{
      ok: false
      code: string
      message: string
      sendPlan?: SendPlan
      contentParts?: []
      sentAssetIds?: []
      hasDraftAttachmentPlans?: boolean
    }>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export async function prepareProviderFileSendFromDraft(
  input: PrepareProviderFileSendInput
): Promise<PreparedProviderFileSend | null> {
  const bridge = getDbBridge()
  if (!bridge) return null
  const conversationId = String(input.conversationId ?? '').trim()
  if (!conversationId) return null

  let raw: unknown
  try {
    raw = await bridge.invoke('providerFileInput.prepareDraftFiles', {
      provider: input.provider,
      conversationId,
      draftText: input.userText,
      historyMessageIds: input.historyMessageIds,
      model: input.model,
      providerContext: input.providerContext,
    })
  } catch (error) {
    if (isMissingProviderFileInputBridgeError(error)) return null
    throw error
  }

  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (record.ok === false) {
    return {
      ok: false,
      code: String(record.code ?? 'provider_file_input_failed'),
      message: String(record.message ?? 'Provider file input preparation failed.'),
      ...(record.sendPlan ? { sendPlan: record.sendPlan as SendPlan } : {}),
      ...(record.hasDraftAttachmentPlans !== undefined ? { hasDraftAttachmentPlans: Boolean(record.hasDraftAttachmentPlans) } : {}),
    }
  }
  if (record.ok !== true || !record.sendPlan) return null

  return {
    ok: true,
    provider: input.provider,
    sendPlan: record.sendPlan as SendPlan,
    contentParts: Array.isArray(record.contentParts) ? (record.contentParts as ProviderRuntimeContentBlock[]) : [],
    sentAssetIds: Array.isArray(record.sentAssetIds) ? record.sentAssetIds.map((id) => String(id)) : [],
    hasDraftAttachmentPlans: Boolean(record.hasDraftAttachmentPlans),
    diagnostics: record.diagnostics && typeof record.diagnostics === 'object'
      ? record.diagnostics as Record<string, unknown>
      : {},
  }
}

function isMissingProviderFileInputBridgeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /providerFileInput\.prepareDraftFiles|unknown method|not registered|unsupported method|method.*not/i.test(message)
}
