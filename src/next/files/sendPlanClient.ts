import {
  decodeBuildCurrentSendPlanResponse,
  type DecodedBuildCurrentSendPlanResult,
} from '@/next/ipc/contracts/dbBridgeContracts'
import type { SendPlanModelDescriptor, SendPlanProviderContext } from '@/shared/files/sendPlanTypes'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<unknown>
}>

export type BuildCurrentSendPlanInput = Readonly<{
  conversationId: string
  draftText?: string
  historyScope?: Readonly<{
    messageIds?: string[]
    branchId?: string
  }> | null
  model: SendPlanModelDescriptor
  providerContext: SendPlanProviderContext
}>

export type PrepareOpenRouterReplayFromMessageInput = Readonly<{
  branchId: string
  userMessageId: string
  model: SendPlanModelDescriptor
  providerContext: SendPlanProviderContext
  replayMode: 'current'
  editedUserText?: string
  attachmentDecisions?: ReadonlyArray<Readonly<{
    attachmentId: string
    source?: 'history' | 'draft' | 'edit_restored'
    decision: 'exclude' | 'remove'
    reasonCode?: string
  }>>
}>

export type PrepareOpenRouterReplayFromMessageResult = Readonly<{
  status: 'sendable' | 'blocked' | 'needs_confirmation'
  currentUserContentBlocks: unknown[]
  sentAssetIds: string[]
  includedAttachments: unknown[]
  excludedAttachments: unknown[]
  blockingReasons: unknown[]
  diagnostics: Record<string, unknown>
  modelCapabilitySnapshot: Record<string, unknown>
  manifestDraft: Record<string, unknown>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

function requireDbBridge(): DbBridge {
  const bridge = getDbBridge()
  if (!bridge) throw new Error('Missing dbBridge')
  return bridge
}

export async function buildCurrentSendPlan(input: BuildCurrentSendPlanInput): Promise<DecodedBuildCurrentSendPlanResult> {
  const raw = await requireDbBridge().invoke('sendPlan.buildCurrent', input)
  return decodeBuildCurrentSendPlanResponse(raw)
}

export async function prepareOpenRouterReplayFromMessage(
  input: PrepareOpenRouterReplayFromMessageInput
): Promise<PrepareOpenRouterReplayFromMessageResult> {
  const raw = await requireDbBridge().invoke('sendPlan.prepareOpenRouterReplayFromMessage', input) as any
  const status = raw?.status === 'sendable' || raw?.status === 'needs_confirmation' ? raw.status : 'blocked'
  return {
    status,
    currentUserContentBlocks: Array.isArray(raw?.currentUserContentBlocks) ? raw.currentUserContentBlocks : [],
    sentAssetIds: Array.isArray(raw?.sentAssetIds) ? raw.sentAssetIds.map((id: unknown) => String(id ?? '').trim()).filter(Boolean) : [],
    includedAttachments: Array.isArray(raw?.includedAttachments) ? raw.includedAttachments : [],
    excludedAttachments: Array.isArray(raw?.excludedAttachments) ? raw.excludedAttachments : [],
    blockingReasons: Array.isArray(raw?.blockingReasons) ? raw.blockingReasons : [],
    diagnostics: raw?.diagnostics && typeof raw.diagnostics === 'object' ? raw.diagnostics : {},
    modelCapabilitySnapshot: raw?.modelCapabilitySnapshot && typeof raw.modelCapabilitySnapshot === 'object' ? raw.modelCapabilitySnapshot : {},
    manifestDraft: raw?.manifestDraft && typeof raw.manifestDraft === 'object' ? raw.manifestDraft : {},
  }
}
