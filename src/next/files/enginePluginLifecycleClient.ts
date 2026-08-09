import {
  decodeInstalledPluginsResponse,
  decodeInstallOfficialPluginResult,
  decodeInstallOperationStatusResult,
  decodeCancelInstallOperationResult,
  decodeLifecycleInstalledResult,
  decodeListOfficialPluginsResponse,
  decodeDiagnosticsSummary,
  type DecodedInstalledPlugin,
  type DecodedInstallOfficialPluginResult,
  type DecodedInstallOperationStatusResult,
  type DecodedCancelInstallOperationResult,
  type DecodedLifecycleInstalledResult,
  type DecodedLifecycleListOfficialResult,
  type DecodedDiagnosticsSummary,
  type GetInstallOperationStatusRequest,
  type CancelInstallOperationRequest,
  type LifecycleEngineRequest,
  type InstallOfficialPluginRequest,
  type ListOfficialPluginsRequest,
  type RegisterLocalOfficialPluginRequest,
  type RegisterLocalPackageRequest,
} from '@/next/ipc/contracts/enginePluginLifecycleContracts'

function requirePluginBridge(): NonNullable<Window['generationV2']>['plugins'] {
  const bridge = (globalThis as unknown as { generationV2?: NonNullable<Window['generationV2']> }).generationV2?.plugins
  if (!bridge) throw new Error('Missing epoch-2 plugin lifecycle bridge')
  return bridge
}

export async function listOfficialPlugins(
  params: ListOfficialPluginsRequest = {}
): Promise<DecodedLifecycleListOfficialResult> {
  const raw = await requirePluginBridge().listOfficial(params)
  return decodeListOfficialPluginsResponse(raw)
}

export async function listInstalledPlugins(): Promise<DecodedInstalledPlugin[]> {
  const raw = await requirePluginBridge().listInstalled()
  return decodeInstalledPluginsResponse(raw)
}

export async function registerLocalOfficialPlugin(
  params: RegisterLocalOfficialPluginRequest
): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requirePluginBridge().registerLocalOfficial(params)
  return decodeLifecycleInstalledResult(raw)
}

export async function installOfficialPlugin(
  params: InstallOfficialPluginRequest
): Promise<DecodedInstallOfficialPluginResult> {
  const raw = await requirePluginBridge().installOfficial(params)
  return decodeInstallOfficialPluginResult(raw)
}

export async function getInstallOperationStatus(
  params: GetInstallOperationStatusRequest = {}
): Promise<DecodedInstallOperationStatusResult> {
  const raw = await requirePluginBridge().installStatus(params)
  return decodeInstallOperationStatusResult(raw)
}

export async function cancelInstallOperation(
  params: CancelInstallOperationRequest = {}
): Promise<DecodedCancelInstallOperationResult> {
  const raw = await requirePluginBridge().cancelInstall(params)
  return decodeCancelInstallOperationResult(raw)
}

export async function enablePlugin(params: LifecycleEngineRequest): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requirePluginBridge().enable(params)
  return decodeLifecycleInstalledResult(raw)
}

export async function disablePlugin(params: LifecycleEngineRequest): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requirePluginBridge().disable(params)
  return decodeLifecycleInstalledResult(raw)
}

export async function uninstallPlugin(params: LifecycleEngineRequest): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requirePluginBridge().uninstall(params)
  return decodeLifecycleInstalledResult(raw)
}

export async function runPluginHealthCheck(params: LifecycleEngineRequest): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requirePluginBridge().health(params)
  return decodeLifecycleInstalledResult(raw)
}

export async function registerLocalPackage(
  params: RegisterLocalPackageRequest
): Promise<DecodedLifecycleInstalledResult> {
  const raw = await requirePluginBridge().registerLocalPackage(params)
  return decodeLifecycleInstalledResult(raw)
}

export async function importLibreOfficeSvpkg(): Promise<DecodedLifecycleInstalledResult> {
  const api = (globalThis as any).electronAPI as { importLibreOfficeSvpkg?: () => Promise<unknown> } | undefined
  if (!api || typeof api.importLibreOfficeSvpkg !== 'function') throw new Error('LibreOffice package import is unavailable')
  return decodeLifecycleInstalledResult(await api.importLibreOfficeSvpkg())
}

export async function quarantineLibreOfficeRuntime(): Promise<DecodedLifecycleInstalledResult> {
  const api = (globalThis as any).electronAPI as { quarantineLibreOfficeRuntime?: () => Promise<unknown> } | undefined
  if (!api || typeof api.quarantineLibreOfficeRuntime !== 'function') throw new Error('LibreOffice runtime quarantine is unavailable')
  return decodeLifecycleInstalledResult(await api.quarantineLibreOfficeRuntime())
}

export async function getDiagnosticsSummary(): Promise<DecodedDiagnosticsSummary> {
  const raw = await requirePluginBridge().diagnostics()
  return decodeDiagnosticsSummary(raw)
}
