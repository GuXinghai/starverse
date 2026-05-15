import {
  decodeInstalledPluginsResponse,
  decodeInstallOfficialPluginResult,
  decodeInstallOperationStatusResult,
  decodeLifecycleInstalledResult,
  decodeListOfficialPluginsResponse,
  decodeDiagnosticsSummary,
  type DecodedInstalledPlugin,
  type DecodedInstallOfficialPluginResult,
  type DecodedInstallOperationStatusResult,
  type DecodedLifecycleInstalledResult,
  type DecodedLifecycleListOfficialResult,
  type DecodedDiagnosticsSummary,
  type GetInstallOperationStatusRequest,
  type LifecycleEngineRequest,
  type InstallOfficialPluginRequest,
  type ListOfficialPluginsRequest,
  type RegisterLocalOfficialPluginRequest,
  type RegisterLocalPackageRequest,
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

export async function installOfficialPlugin(
  params: InstallOfficialPluginRequest
): Promise<DecodedInstallOfficialPluginResult> {
  const raw = await requireDbBridge().invoke('enginePluginLifecycle.installOfficialPlugin', params)
  return decodeInstallOfficialPluginResult(raw)
}

export async function getInstallOperationStatus(
  params: GetInstallOperationStatusRequest = {}
): Promise<DecodedInstallOperationStatusResult> {
  const raw = await requireDbBridge().invoke('enginePluginLifecycle.getInstallOperationStatus', params)
  return decodeInstallOperationStatusResult(raw)
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

export async function registerLocalPackage(
  params: RegisterLocalPackageRequest
): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requireDbBridge().invoke('enginePluginLifecycle.registerLocalPackage', params)
  return decodeLifecycleInstalledResult(raw)
}

export async function getDiagnosticsSummary(): Promise<DecodedDiagnosticsSummary> {
  const raw = await requireDbBridge().invoke('enginePluginLifecycle.getDiagnosticsSummary')
  return decodeDiagnosticsSummary(raw)
}
