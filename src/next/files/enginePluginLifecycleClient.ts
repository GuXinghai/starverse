import {
  decodeInstalledPluginsResponse,
  decodeLifecycleInstalledResult,
  decodeListOfficialPluginsResponse,
  type DecodedInstalledPlugin,
  type DecodedLifecycleInstalledResult,
  type DecodedLifecycleListOfficialResult,
  type LifecycleEngineRequest,
  type ListOfficialPluginsRequest,
  type RegisterLocalOfficialPluginRequest,
} from '@/next/ipc/contracts/enginePluginLifecycleContracts'

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

export async function listOfficialPlugins(
  params: ListOfficialPluginsRequest = {}
): Promise<DecodedLifecycleListOfficialResult> {
  const raw = await requireDbBridge().invoke('enginePluginLifecycle.listOfficialPlugins', params)
  return decodeListOfficialPluginsResponse(raw)
}

export async function listInstalledPlugins(): Promise<DecodedInstalledPlugin[]> {
  const raw = await requireDbBridge().invoke('enginePluginLifecycle.listInstalledPlugins')
  return decodeInstalledPluginsResponse(raw)
}

export async function registerLocalOfficialPlugin(
  params: RegisterLocalOfficialPluginRequest
): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requireDbBridge().invoke('enginePluginLifecycle.registerLocalOfficialPlugin', params)
  return decodeLifecycleInstalledResult(raw)
}

export async function enablePlugin(params: LifecycleEngineRequest): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requireDbBridge().invoke('enginePluginLifecycle.enablePlugin', params)
  return decodeLifecycleInstalledResult(raw)
}

export async function disablePlugin(params: LifecycleEngineRequest): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requireDbBridge().invoke('enginePluginLifecycle.disablePlugin', params)
  return decodeLifecycleInstalledResult(raw)
}

export async function uninstallPlugin(params: LifecycleEngineRequest): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requireDbBridge().invoke('enginePluginLifecycle.uninstallPlugin', params)
  return decodeLifecycleInstalledResult(raw)
}

export async function runPluginHealthCheck(params: LifecycleEngineRequest): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requireDbBridge().invoke('enginePluginLifecycle.runHealthCheck', params)
  return decodeLifecycleInstalledResult(raw)
}
