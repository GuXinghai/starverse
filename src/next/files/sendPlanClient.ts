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

export class SendPlanClientContractError extends Error {
  readonly code = 'sendplan_contract_decode_failed'
  readonly method: string
  readonly issues: string[]

  constructor(method: string, issues: readonly string[]) {
    super(`${method} returned malformed IPC response: ${issues.join('; ')}`)
    this.name = 'SendPlanClientContractError'
    this.method = method
    this.issues = [...issues]
  }
}

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
  const raw = await requireDbBridge().invoke('sendPlan.prepareOpenRouterReplayFromMessage', input)
  return decodePrepareOpenRouterReplayFromMessageResponse(raw)
}

function decodePrepareOpenRouterReplayFromMessageResponse(raw: unknown): PrepareOpenRouterReplayFromMessageResult {
  const method = 'sendPlan.prepareOpenRouterReplayFromMessage'
  const issues: string[] = []
  if (!isRecord(raw)) {
    throw new SendPlanClientContractError(method, ['response must be an object'])
  }
  const status = raw.status
  if (status !== 'sendable' && status !== 'blocked' && status !== 'needs_confirmation') {
    issues.push('status must be sendable, blocked, or needs_confirmation')
  }
  for (const field of [
    'currentUserContentBlocks',
    'sentAssetIds',
    'includedAttachments',
    'excludedAttachments',
    'blockingReasons',
  ] as const) {
    if (!Array.isArray(raw[field])) issues.push(`${field} must be an array`)
  }
  for (const field of ['diagnostics', 'modelCapabilitySnapshot', 'manifestDraft'] as const) {
    if (!isRecord(raw[field])) issues.push(`${field} must be an object`)
  }
  if (Array.isArray(raw.sentAssetIds) && raw.sentAssetIds.some((id) => typeof id !== 'string')) {
    issues.push('sentAssetIds must contain only strings')
  }
  if (issues.length > 0) throw new SendPlanClientContractError(method, issues)

  return {
    status: status as PrepareOpenRouterReplayFromMessageResult['status'],
    currentUserContentBlocks: raw.currentUserContentBlocks as unknown[],
    sentAssetIds: (raw.sentAssetIds as string[]).map((id) => id.trim()).filter(Boolean),
    includedAttachments: raw.includedAttachments as unknown[],
    excludedAttachments: raw.excludedAttachments as unknown[],
    blockingReasons: raw.blockingReasons as unknown[],
    diagnostics: raw.diagnostics as Record<string, unknown>,
    modelCapabilitySnapshot: raw.modelCapabilitySnapshot as Record<string, unknown>,
    manifestDraft: raw.manifestDraft as Record<string, unknown>,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
