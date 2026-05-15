import type { DbWorkerRuntime } from '../runtime'
import type { RegisterHandler } from './types'

export function registerEnginePluginLifecycleHandlers(
  register: RegisterHandler,
  runtime: DbWorkerRuntime
) {
  register('enginePluginLifecycle.listOfficialPlugins', async (raw) => {
    const input = asObject(raw)
    const result = await runtime.enginePluginLifecycleService.listOfficialPlugins({
      catalogPath: optionalString(input.catalogPath),
    })
    return result
  })

  register('enginePluginLifecycle.listInstalledPlugins', () => {
    return runtime.enginePluginLifecycleService.getInstalledPlugins()
  })

  register('enginePluginLifecycle.registerLocalOfficialPlugin', async (raw) => {
    const input = asObject(raw)
    const result = await runtime.enginePluginLifecycleService.registerLocalOfficialPlugin({
      catalogPath: optionalString(input.catalogPath),
      pluginId: requiredString(input.pluginId, 'pluginId'),
      pluginVersion: requiredString(input.pluginVersion, 'pluginVersion'),
      installRootKind: requiredInstallRootKind(input.installRootKind),
      installRef: requiredString(input.installRef, 'installRef'),
      enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    })
    return result
  })

  register('enginePluginLifecycle.installOfficialPlugin', async (raw) => {
    const input = asObject(raw)
    const result = await runtime.enginePluginLifecycleService.installOfficialPlugin({
      pluginId: requiredString(input.pluginId, 'pluginId'),
      pluginVersion: optionalString(input.pluginVersion),
      enabled: typeof input.enabled === 'boolean' ? input.enabled : false,
    })
    return result
  })

  register('enginePluginLifecycle.enablePlugin', async (raw) => {
    const input = asObject(raw)
    const result = await runtime.enginePluginLifecycleService.enablePlugin({
      engineId: requiredString(input.engineId, 'engineId'),
    })
    return result
  })

  register('enginePluginLifecycle.disablePlugin', (raw) => {
    const input = asObject(raw)
    return runtime.enginePluginLifecycleService.disablePlugin({
      engineId: requiredString(input.engineId, 'engineId'),
    })
  })

  register('enginePluginLifecycle.uninstallPlugin', (raw) => {
    const input = asObject(raw)
    return runtime.enginePluginLifecycleService.uninstallPlugin({
      engineId: requiredString(input.engineId, 'engineId'),
    })
  })

  register('enginePluginLifecycle.runHealthCheck', async (raw) => {
    const input = asObject(raw)
    const result = await runtime.enginePluginLifecycleService.runHealthCheck({
      engineId: requiredString(input.engineId, 'engineId'),
    })
    return result
  })

  register('enginePluginLifecycle.registerLocalPackage', async (raw) => {
    const input = asObject(raw)
    const result = await runtime.enginePluginLifecycleService.registerLocalPackage({
      packageDir: requiredString(input.packageDir, 'packageDir'),
      installRootKind: requiredInstallRootKind(input.installRootKind),
      installRef: requiredString(input.installRef, 'installRef'),
      enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    })
    return result
  })

  register('enginePluginLifecycle.getDiagnosticsSummary', () => {
    return runtime.enginePluginLifecycleService.getDiagnosticsSummary()
  })
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

function requiredString(value: unknown, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function optionalString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized : undefined
}

function requiredInstallRootKind(value: unknown): 'managed_root' | 'managed_cache' | 'test_root' {
  const normalized = String(value ?? '').trim()
  if (normalized === 'managed_root' || normalized === 'managed_cache' || normalized === 'test_root') {
    return normalized
  }
  throw new Error('installRootKind must be one of managed_root/managed_cache/test_root')
}
