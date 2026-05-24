import {
  decodeAttachDraftToMessageResponse,
  decodeConversationDraftResponse,
  decodeDfcDraftAttachmentOptionsResponse,
  decodeDraftAttachmentResponse,
  decodeRemoveDraftAttachmentResponse,
  decodeUpdateDraftAttachmentSettingsResponse,
  type DecodedAssetAttachmentOwnership,
  type DecodedAttachDraftToMessageResult,
  type DecodedDfcDraftAttachmentOptions,
  type DecodedDraftAttachment,
  type DecodedConversationDraft,
} from '@/next/ipc/contracts/dbBridgeContracts'
import type { DraftAttachmentSendModePreference, DraftAttachmentUrlRetentionPreference } from '@/shared/files/fileTypes'
import type { DfcAttachmentSendSnapshot, DfcSendAssetRef } from '@/shared/files/documentFormatConversion'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<unknown>
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

export async function restoreConversationDraft(conversationId: string): Promise<DecodedConversationDraft> {
  const raw = await requireDbBridge().invoke('conversationDraft.restore', { conversationId })
  return decodeConversationDraftResponse(raw)
}

export async function updateConversationDraftText(input: Readonly<{
  conversationId: string
  draftText: string
  draftMode?: 'compose' | 'edit'
  editingSourceMessageId?: string | null
  updatedAt?: number
}>): Promise<DecodedConversationDraft> {
  const raw = await requireDbBridge().invoke('conversationDraft.updateText', input)
  return decodeConversationDraftResponse(raw)
}

export async function addConversationDraftAttachment(input: Readonly<{
  conversationId: string
  assetId: string
  attachmentOrder?: number
  includeInNextRequest?: boolean
  excludedReason?: string | null
  preferredSendMode?: DraftAttachmentSendModePreference | null
  urlRetentionMode?: DraftAttachmentUrlRetentionPreference | null
  createdAt?: number
  updatedAt?: number
}>): Promise<DecodedDraftAttachment> {
  const raw = await requireDbBridge().invoke('conversationDraft.addAttachment', input)
  return decodeDraftAttachmentResponse(raw)
}

export async function updateConversationDraftAttachmentSettings(input: Readonly<{
  conversationId: string
  assetId: string
  preferredSendMode?: DraftAttachmentSendModePreference | null
  urlRetentionMode?: DraftAttachmentUrlRetentionPreference | null
  dfcManaged?: boolean
  selectedOptionId?: string | null
  selectedAssetRefs?: readonly DfcSendAssetRef[]
  updatedAt?: number
}>): Promise<DecodedDraftAttachment> {
  const raw = await requireDbBridge().invoke('conversationDraft.updateAttachmentSettings', input)
  return decodeUpdateDraftAttachmentSettingsResponse(raw)
}

export async function getConversationDraftAttachmentDfcOptions(input: Readonly<{
  conversationId: string
  assetId: string
}>): Promise<DecodedDfcDraftAttachmentOptions> {
  const raw = await requireDbBridge().invoke('conversationDraft.getDfcOptions', input)
  return decodeDfcDraftAttachmentOptionsResponse(raw)
}

export async function attachConversationDraftToMessage(input: Readonly<{
  conversationId: string
  messageId: string
  updatedAt?: number
  sentAssetIds?: string[]
  dfcAttachmentSendSnapshots?: readonly DfcAttachmentSendSnapshot[]
}>): Promise<DecodedAttachDraftToMessageResult> {
  const raw = await requireDbBridge().invoke('conversationDraft.attachToMessage', input)
  return decodeAttachDraftToMessageResponse(raw)
}

export async function cloneConversationDraftFromMessage(input: Readonly<{
  conversationId: string
  sourceMessageId: string
  updatedAt?: number
}>): Promise<DecodedConversationDraft> {
  const raw = await requireDbBridge().invoke('conversationDraft.cloneFromMessage', input)
  return decodeConversationDraftResponse(raw)
}

export async function removeConversationDraftAttachment(input: Readonly<{
  conversationId: string
  assetId: string
  updatedAt?: number
}>): Promise<Readonly<{ ok: true; removed: boolean; ownership: DecodedAssetAttachmentOwnership }>> {
  const raw = await requireDbBridge().invoke('conversationDraft.removeAttachment', input)
  return decodeRemoveDraftAttachmentResponse(raw)
}
