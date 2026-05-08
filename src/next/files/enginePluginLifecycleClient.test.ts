/* eslint-disable max-lines-per-function */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  disablePlugin,
  enablePlugin,
  listInstalledPlugins,
  listOfficialPlugins,
  registerLocalOfficialPlugin,
  runPluginHealthCheck,
  uninstallPlugin,
} from './enginePluginLifecycleClient'

// eslint-disable-next-line max-lines-per-function
describe('enginePluginLifecycleClient', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('invokes lifecycle methods through dbBridge and decodes responses', async () => {
    // eslint-disable-next-line max-lines-per-function
    const invoke = vi.fn(async (method: string) => {
      if (method === 'enginePluginLifecycle.listInstalledPlugins') {
        return [
          {
            engineId: 'magika',
            displayName: 'Magika managed plugin',
            pluginVersion: '0.1.0',
            manifestSchemaVersion: '1',
            runtimeKind: 'local_loader',
            modelVersion: 'magika-v3',
            installState: 'installed',
            enabled: true,
            healthStatus: 'healthy',
            failureReason: null,
            installSource: 'official_catalog',
            installRootKind: 'managed_root',
            installedAt: 1,
            updatedAt: 2,
            lastVerifiedAt: 2,
            lastHealthCheckAt: 3,
          },
        ]
      }
      if (method === 'enginePluginLifecycle.listOfficialPlugins') {
        return {
          ok: true,
          value: [
            {
              pluginId: 'magika',
              pluginVersion: '0.1.0',
              catalogGeneratedAt: '2026-05-08T00:00:00.000Z',
              installState: 'installed',
              enabled: true,
            },
          ],
        }
      }
      return {
        ok: true,
        value: {
          engineId: 'magika',
          displayName: 'Magika managed plugin',
          pluginVersion: '0.1.0',
          manifestSchemaVersion: '1',
          runtimeKind: 'local_loader',
          modelVersion: 'magika-v3',
          installState: 'installed',
          enabled: true,
          healthStatus: 'healthy',
          failureReason: null,
          installSource: 'official_catalog',
          installRootKind: 'managed_root',
          installedAt: 1,
          updatedAt: 2,
          lastVerifiedAt: 2,
          lastHealthCheckAt: 3,
        },
      }
    })
    ;(globalThis as any).dbBridge = { invoke }

    const official = await listOfficialPlugins({ catalogPath: '/ignored/catalog.json' })
    const installed = await listInstalledPlugins()
    const registered = await registerLocalOfficialPlugin({
      catalogPath: '/ignored/catalog.json',
      pluginId: 'magika',
      pluginVersion: '0.1.0',
      installRootKind: 'managed_root',
      installRef: 'plugin_magika_001',
    })
    const enabled = await enablePlugin({ engineId: 'magika' })
    const disabled = await disablePlugin({ engineId: 'magika' })
    const uninstalled = await uninstallPlugin({ engineId: 'magika' })
    const health = await runPluginHealthCheck({ engineId: 'magika' })

    expect(official.ok).toBe(true)
    expect(installed[0]?.engineId).toBe('magika')
    expect(registered.ok).toBe(true)
    expect(enabled.ok).toBe(true)
    expect(disabled.ok).toBe(true)
    expect(uninstalled.ok).toBe(true)
    expect(health.ok).toBe(true)
  })
})
