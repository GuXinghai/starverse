import {
  decodeBooleanAck,
  decodeDfcAttachmentDefaultsResponse,
} from '@/next/ipc/contracts/dbBridgeContracts'
import { normalizeDfcAttachmentDefaults, type DfcAttachmentDefaults } from '@/shared/files/dfcAttachmentDefaults'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export async function getDfcAttachmentDefaults(): Promise<DfcAttachmentDefaults> {
  const bridge = getDbBridge()
  if (!bridge) return normalizeDfcAttachmentDefaults(null)
  const result = await bridge.invoke('settings.getDfcAttachmentDefaults')
  return decodeDfcAttachmentDefaultsResponse(result)
}

export async function setDfcAttachmentDefaults(value: unknown): Promise<boolean> {
  const bridge = getDbBridge()
  if (!bridge) return false
  const result = await bridge.invoke('settings.setDfcAttachmentDefaults', {
    value: normalizeDfcAttachmentDefaults(value),
  })
  return decodeBooleanAck('settings.setDfcAttachmentDefaults', result)
}
