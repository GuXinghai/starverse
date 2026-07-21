import { EnginePluginLifecycleService } from '../../infra/files/enginePluginLifecycleService'

type RegisterInvoke = (channel: string, handler: (...args: any[]) => unknown) => void

/** Fixed epoch-2 plugin lifecycle IPC. No dbBridge or worker RPC is involved. */
export function registerEnginePluginLifecycleV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  lifecycle: EnginePluginLifecycleService
}>): void {
  const { registerInvoke, lifecycle } = input
  registerInvoke('generation-v2:plugins:list-official', async (_event, raw) => lifecycle.listOfficialPlugins({ catalogPath: optionalString(object(raw, ['catalogPath']).catalogPath) }))
  registerInvoke('generation-v2:plugins:list-installed', () => lifecycle.getInstalledPlugins())
  registerInvoke('generation-v2:plugins:register-local-official', async (_event, raw) => {
    const value = object(raw, ['catalogPath', 'pluginId', 'pluginVersion', 'installRootKind', 'installRef', 'enabled'])
    return lifecycle.registerLocalOfficialPlugin({ catalogPath: optionalString(value.catalogPath), pluginId: required(value.pluginId, 'pluginId'),
      pluginVersion: required(value.pluginVersion, 'pluginVersion'), installRootKind: rootKind(value.installRootKind), installRef: required(value.installRef, 'installRef'), enabled: typeof value.enabled === 'boolean' ? value.enabled : true })
  })
  registerInvoke('generation-v2:plugins:install-official', async (_event, raw) => {
    const value = object(raw, ['pluginId', 'pluginVersion', 'enabled'])
    return lifecycle.installOfficialPlugin({ pluginId: required(value.pluginId, 'pluginId'), pluginVersion: optionalString(value.pluginVersion), enabled: typeof value.enabled === 'boolean' ? value.enabled : false })
  })
  registerInvoke('generation-v2:plugins:install-status', (_event, raw) => {
    const value = object(raw, ['operationId', 'pluginId', 'pluginVersion'])
    return lifecycle.getInstallOperationStatus({ operationId: optionalString(value.operationId), pluginId: optionalString(value.pluginId), pluginVersion: optionalString(value.pluginVersion) })
  })
  registerInvoke('generation-v2:plugins:cancel-install', async (_event, raw) => {
    const value = object(raw, ['operationId', 'pluginId', 'pluginVersion'])
    return lifecycle.cancelInstallOperation({ operationId: optionalString(value.operationId), pluginId: optionalString(value.pluginId), pluginVersion: optionalString(value.pluginVersion) })
  })
  registerInvoke('generation-v2:plugins:enable', async (_event, raw) => lifecycle.enablePlugin({ engineId: required(object(raw, ['engineId']).engineId, 'engineId') }))
  registerInvoke('generation-v2:plugins:disable', (_event, raw) => lifecycle.disablePlugin({ engineId: required(object(raw, ['engineId']).engineId, 'engineId') }))
  registerInvoke('generation-v2:plugins:uninstall', (_event, raw) => lifecycle.uninstallPlugin({ engineId: required(object(raw, ['engineId']).engineId, 'engineId') }))
  registerInvoke('generation-v2:plugins:health', async (_event, raw) => lifecycle.runHealthCheck({ engineId: required(object(raw, ['engineId']).engineId, 'engineId') }))
  registerInvoke('generation-v2:plugins:register-local-package', async (_event, raw) => {
    const value = object(raw, ['packageDir', 'installRootKind', 'installRef', 'enabled'])
    return lifecycle.registerLocalPackage({ packageDir: required(value.packageDir, 'packageDir'), installRootKind: rootKind(value.installRootKind), installRef: required(value.installRef, 'installRef'), enabled: typeof value.enabled === 'boolean' ? value.enabled : true })
  })
  registerInvoke('generation-v2:plugins:quarantine-libreoffice', async () => lifecycle.quarantineDfcLibreOfficeRuntime())
  registerInvoke('generation-v2:plugins:diagnostics', () => lifecycle.getDiagnosticsSummary())
  registerInvoke('generation-v2:plugins:probe-libreoffice-download', () => lifecycle.probeLibreOfficeOfficialDownloadNetwork())
}

function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('GENERATION_V2_PLUGIN_IPC_INVALID_PAYLOAD')
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new Error('GENERATION_V2_PLUGIN_IPC_INVALID_PAYLOAD')
  return record
}
function required(value: unknown, field: string): string { const text = String(value ?? '').trim(); if (!text) throw new Error(`${field} is required`); return text }
function optionalString(value: unknown): string | undefined { const text = String(value ?? '').trim(); return text || undefined }
function rootKind(value: unknown): 'managed_root' | 'managed_cache' | 'test_root' {
  const normalized = String(value ?? '').trim()
  if (normalized === 'managed_root' || normalized === 'managed_cache' || normalized === 'test_root') return normalized
  throw new Error('installRootKind must be one of managed_root/managed_cache/test_root')
}
