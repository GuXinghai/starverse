import { buildChatDraftConvoPrefix, buildChatDraftSettingsKey } from '../../../infra/db/repo/settingsKeys'
import {
  decodeBooleanAck,
  decodeChatDraftResponse,
  decodeDeletedCountResponse,
} from '@/next/ipc/contracts/dbBridgeContracts'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

function toDraftKey(convoId: string, branchId: string): string {
  return buildChatDraftSettingsKey(convoId, branchId)
}

export async function getChatDraft(convoId: string, branchId: string): Promise<string | null> {
  const bridge = getDbBridge()
  if (!bridge) return null
  const result = await bridge.invoke('settings.getChatDraft', { key: toDraftKey(convoId, branchId) })
  return decodeChatDraftResponse(result)
}

export async function setChatDraft(convoId: string, branchId: string, value: string): Promise<boolean> {
  const bridge = getDbBridge()
  if (!bridge) return false
  const result = await bridge.invoke('settings.setChatDraft', {
    key: toDraftKey(convoId, branchId),
    value: typeof value === 'string' ? value : String(value ?? ''),
  })
  return decodeBooleanAck('settings.setChatDraft', result)
}

export async function deleteChatDraft(convoId: string, branchId: string): Promise<number> {
  const bridge = getDbBridge()
  if (!bridge) return 0
  const result = await bridge.invoke('settings.deleteChatDraft', { key: toDraftKey(convoId, branchId) })
  return decodeDeletedCountResponse('settings.deleteChatDraft', result)
}

export async function deleteChatDraftsForConvo(convoId: string): Promise<number> {
  const bridge = getDbBridge()
  if (!bridge) return 0
  const result = await bridge.invoke('settings.deleteChatDraftsByPrefix', { prefix: buildChatDraftConvoPrefix(convoId) })
  return decodeDeletedCountResponse('settings.deleteChatDraftsByPrefix', result)
}
