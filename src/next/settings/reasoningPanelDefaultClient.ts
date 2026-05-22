import {
  decodeBooleanAck,
  decodeChatReasoningPanelDefaultExpandedResponse,
} from '@/next/ipc/contracts/dbBridgeContracts'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export async function getChatReasoningPanelDefaultExpanded(): Promise<boolean> {
  const bridge = getDbBridge()
  if (!bridge) return true
  try {
    const result = await bridge.invoke('settings.getChatReasoningPanelDefaultExpanded')
    return decodeChatReasoningPanelDefaultExpandedResponse(result)
  } catch {
    return true
  }
}

export async function setChatReasoningPanelDefaultExpanded(value: boolean): Promise<boolean> {
  const bridge = getDbBridge()
  if (!bridge) return false
  try {
    const result = await bridge.invoke('settings.setChatReasoningPanelDefaultExpanded', { value })
    return decodeBooleanAck('settings.setChatReasoningPanelDefaultExpanded', result)
  } catch {
    return false
  }
}
