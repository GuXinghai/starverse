import {
  decodeBooleanAck,
  decodeGenerationParamsDefaultsResponse,
} from '@/next/ipc/contracts/dbBridgeContracts'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export async function getGenerationParamsDefaults(): Promise<unknown | null> {
  const bridge = getDbBridge()
  if (!bridge) return null
  const result = await bridge.invoke('settings.getGenerationParamsDefaults')
  return decodeGenerationParamsDefaultsResponse(result)
}

export async function setGenerationParamsDefaults(value: unknown): Promise<boolean> {
  const bridge = getDbBridge()
  if (!bridge) return false
  const result = await bridge.invoke('settings.setGenerationParamsDefaults', { value })
  return decodeBooleanAck('settings.setGenerationParamsDefaults', result)
}
