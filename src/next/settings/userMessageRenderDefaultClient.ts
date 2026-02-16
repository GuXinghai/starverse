import { decodeBooleanAck, decodeUserMessageRenderDefaultResponse } from '@/next/ipc/contracts/dbBridgeContracts'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export async function getUserMessageRenderDefault(): Promise<boolean | null> {
  const bridge = getDbBridge()
  if (!bridge) return null
  try {
    const result = await bridge.invoke('settings.getUserMessageRenderDefault')
    return decodeUserMessageRenderDefaultResponse(result)
  } catch {
    return null
  }
}

export async function setUserMessageRenderDefault(value: boolean): Promise<boolean> {
  const bridge = getDbBridge()
  if (!bridge) return false
  try {
    const result = await bridge.invoke('settings.setUserMessageRenderDefault', { value })
    return decodeBooleanAck('settings.setUserMessageRenderDefault', result)
  } catch {
    return false
  }
}

