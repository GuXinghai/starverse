import type { SendPlan, SendPlanModelDescriptor, SendPlanProviderContext } from '../../shared/files/sendPlanTypes'
import type { OpenRouterAdditionalPlugin, OpenRouterFileParserEngine } from './buildRequest'
import {
  prepareOpenRouterReplayFromMessage as prepareOpenRouterReplayFromMessageClient,
  type PrepareOpenRouterReplayFromMessageInput as PrepareOpenRouterReplayFromMessageClientInput,
} from '../files/sendPlanClient'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

export type OpenRouterPdfFileParserConfig = Readonly<{
  enabled?: boolean
  engine?: OpenRouterFileParserEngine
}> | null | undefined

export type OpenRouterTextContentPart = Readonly<{
  type: 'text'
  text: string
}>

export type OpenRouterImageContentPart = Readonly<{
  type: 'image_url'
  image_url: Readonly<{
    url: string
  }>
}>

export type OpenRouterPdfContentPart = Readonly<{
  type: 'file'
  file: Readonly<{
    filename: string
    file_data: string
  }>
}>

export type OpenRouterAudioContentPart = Readonly<{
  type: 'input_audio'
  input_audio: Readonly<{
    data: string
    format: string
  }>
}>

export type OpenRouterVideoContentPart = Readonly<{
  type: 'video_url'
  video_url: Readonly<{
    url: string
  }>
}>

export type OpenRouterContentPart =
  | OpenRouterTextContentPart
  | OpenRouterImageContentPart
  | OpenRouterPdfContentPart
  | OpenRouterAudioContentPart
  | OpenRouterVideoContentPart

export type OpenRouterAttachmentDiagnostics = Readonly<{
  assetId: string
  attachmentId: string
  source: SendPlan['attachmentPlans'][number]['source']
  aiPayloadKind: SendPlan['attachmentPlans'][number]['aiPayloadKind']
  selectedSendMode: NonNullable<SendPlan['attachmentPlans'][number]['selectedSendMode']>
  finalSendMode: NonNullable<SendPlan['attachmentPlans'][number]['selectedSendMode']>
  fallbackApplied: boolean
  contentType: OpenRouterContentPart['type']
}>

export type OpenRouterExcludedAttachmentDiagnostic = Readonly<{
  assetId: string
  attachmentId: string
  source: SendPlan['attachmentPlans'][number]['source']
  exclusionReason: string
}>

export type OpenRouterSendPlanDiagnostics = Readonly<{
  sendPlanStatus: SendPlan['status']
  includedAttachmentCount: number
  excludedAttachmentCount: number
  includedAttachments: OpenRouterAttachmentDiagnostics[]
  excludedAttachments: OpenRouterExcludedAttachmentDiagnostic[]
  injectedPlugins: string[]
  attachmentErrors: Array<Readonly<{
    code: string
    message: string
    assetId: string | null
    attachmentId: string | null
    messageId: string | null
    selectedSendMode: SendPlan['attachmentPlans'][number]['selectedSendMode']
    aiPayloadKind: string | null
    cause?: unknown
  }>>
  containsMultimodalParts: boolean
}>

export type PrepareOpenRouterSendInput = Readonly<{
  conversationId: string
  userText: string
  model: SendPlanModelDescriptor
  providerContext: SendPlanProviderContext
  historyMessageIds?: ReadonlyArray<string>
  pdfFileParser?: OpenRouterPdfFileParserConfig | null
}>

export type PreparedOpenRouterSend = Readonly<{
  sendPlan: SendPlan
  contentParts: OpenRouterContentPart[]
  additionalPlugins: OpenRouterAdditionalPlugin[]
  diagnostics: OpenRouterSendPlanDiagnostics
  hasDraftAttachmentPlans: boolean
}>

export type PreparedOpenRouterReplay = Readonly<{
  status: 'sendable' | 'blocked' | 'needs_confirmation'
  currentUserContentBlocks: OpenRouterContentPart[]
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

export async function prepareOpenRouterSendFromDraft(input: PrepareOpenRouterSendInput): Promise<PreparedOpenRouterSend | null> {
  const bridge = getDbBridge()
  if (!bridge) return null
  const conversationId = String(input.conversationId ?? '').trim()
  if (!conversationId) return null

  let raw: unknown
  try {
    raw = await bridge.invoke('sendPlan.prepareOpenRouter', {
      conversationId,
      draftText: input.userText,
      historyMessageIds: input.historyMessageIds,
      model: input.model,
      providerContext: input.providerContext,
      pdfFileParser: input.pdfFileParser ?? undefined,
    })
  } catch (error) {
    if (isMissingSendPlanBridgeError(error)) return null
    throw error
  }

  if (!raw || typeof raw !== 'object') return null
  const sendPlan = (raw as { sendPlan?: SendPlan }).sendPlan
  if (!sendPlan) return null

  return {
    sendPlan,
    contentParts: (raw as { contentParts?: OpenRouterContentPart[] }).contentParts ?? [],
    additionalPlugins: (raw as { additionalPlugins?: OpenRouterAdditionalPlugin[] }).additionalPlugins ?? [],
    diagnostics: (raw as { diagnostics?: OpenRouterSendPlanDiagnostics }).diagnostics ?? {
      sendPlanStatus: sendPlan.status,
      includedAttachmentCount: 0,
      excludedAttachmentCount: 0,
      includedAttachments: [],
      excludedAttachments: [],
      injectedPlugins: [],
      attachmentErrors: [],
      containsMultimodalParts: false,
    },
    hasDraftAttachmentPlans: (raw as { hasDraftAttachmentPlans?: boolean }).hasDraftAttachmentPlans ?? sendPlan.attachmentPlans.some((plan) => plan.source === 'draft'),
  }
}

export async function prepareOpenRouterReplayFromMessage(
  input: PrepareOpenRouterReplayFromMessageClientInput
): Promise<PreparedOpenRouterReplay | null> {
  const bridge = getDbBridge()
  if (!bridge) return null
  const prepared = await prepareOpenRouterReplayFromMessageClient(input)
  return {
    status: prepared.status,
    currentUserContentBlocks: prepared.currentUserContentBlocks as OpenRouterContentPart[],
    sentAssetIds: prepared.sentAssetIds,
    includedAttachments: prepared.includedAttachments,
    excludedAttachments: prepared.excludedAttachments,
    blockingReasons: prepared.blockingReasons,
    diagnostics: prepared.diagnostics,
    modelCapabilitySnapshot: prepared.modelCapabilitySnapshot,
    manifestDraft: prepared.manifestDraft,
  }
}

function isMissingSendPlanBridgeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /sendPlan\.prepareOpenRouter|sendPlan\.buildCurrent|unknown method|not registered|unsupported method|method.*not/i.test(message)
}
