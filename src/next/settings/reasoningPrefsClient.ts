type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export async function getReasoningPrefs(): Promise<unknown | null> {
  const bridge = getDbBridge()
  if (!bridge) return null
  const result = await bridge.invoke('settings.getReasoningPrefs')
  if (!result || typeof result !== 'object') return null
  return (result as any).value ?? null
}

export async function setReasoningPrefs(value: unknown): Promise<boolean> {
  const bridge = getDbBridge()
  if (!bridge) return false
  const result = await bridge.invoke('settings.setReasoningPrefs', { value })
  return !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
}
