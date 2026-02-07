import {
  decodeBooleanAck,
  decodeOpenRouterProviderRequireParametersResponse,
} from '@/next/ipc/contracts/dbBridgeContracts'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export async function getOpenRouterProviderRequireParameters(): Promise<boolean> {
  const bridge = getDbBridge()
  if (!bridge) return false
  const result = await bridge.invoke('settings.getOpenRouterProviderRequireParameters')
  return decodeOpenRouterProviderRequireParametersResponse(result)
}

export async function setOpenRouterProviderRequireParameters(value: boolean): Promise<void> {
  const bridge = getDbBridge()
  if (!bridge) return
  const result = await bridge.invoke('settings.setOpenRouterProviderRequireParameters', { value })
  decodeBooleanAck('settings.setOpenRouterProviderRequireParameters', result)
}
