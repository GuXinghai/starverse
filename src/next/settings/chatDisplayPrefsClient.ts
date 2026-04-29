import {
  decodeBooleanAck,
  decodeChatReasoningDisplayModeResponse,
} from '@/next/ipc/contracts/dbBridgeContracts'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export async function getChatReasoningDisplayMode(): Promise<'inline' | 'rail'> {
  const bridge = getDbBridge()
  if (!bridge) return 'inline'
  const result = await bridge.invoke('settings.getChatReasoningDisplayMode')
  return decodeChatReasoningDisplayModeResponse(result)
}

export async function setChatReasoningDisplayMode(value: 'inline' | 'rail'): Promise<boolean> {
  const bridge = getDbBridge()
  if (!bridge) return false
  const result = await bridge.invoke('settings.setChatReasoningDisplayMode', { value })
  return decodeBooleanAck('settings.setChatReasoningDisplayMode', result)
}
