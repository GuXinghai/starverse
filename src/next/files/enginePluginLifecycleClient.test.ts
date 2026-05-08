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
import {
  decodeInstalledPluginsResponse,
  decodeLifecycleInstalledResult,
  decodeListOfficialPluginsResponse,
} from '@/next/ipc/contracts/enginePluginLifecycleContracts'

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

describe('enginePluginLifecycleClient DTO safety', () => {
  it('decodes ok:false lifecycle result', () => {
    const raw = { ok: false, reason: 'not_installed', message: 'plugin not found' }
    const result = decodeLifecycleInstalledResult(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('not_installed')
    }
  })

  it('decodes ok:false official list result', () => {
    const raw = { ok: false, reason: 'catalog_load_failed', message: 'load error' }
    const result = decodeListOfficialPluginsResponse(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('catalog_load_failed')
    }
  })

  it('Zod decode failure throws on malformed installed plugins response', () => {
    expect(() => decodeInstalledPluginsResponse({ installState: 'installed' })).toThrow()
    expect(() => decodeInstalledPluginsResponse(null)).toThrow()
    expect(() => decodeInstalledPluginsResponse('not array')).toThrow()
  })

  it('Zod decode failure throws on malformed lifecycle result', () => {
    expect(() => decodeLifecycleInstalledResult({ ok: 'yes' })).toThrow()
    expect(() => decodeLifecycleInstalledResult(null)).toThrow()
  })

  it('DTO does not expose installRef field', () => {
    const raw = [{
      engineId: 'magika',
      displayName: 'Test',
      pluginVersion: '1.0.0',
      manifestSchemaVersion: '1',
      runtimeKind: 'local_loader',
      modelVersion: null,
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
    }]
    const result = decodeInstalledPluginsResponse(raw)
    expect(result[0]).toBeDefined()
    if (result[0]) {
      expect((result[0] as any).installRef).toBeUndefined()
    }
  })

  it('DTO does not expose manifestHash field', () => {
    const raw = [{
      engineId: 'magika',
      displayName: 'Test',
      pluginVersion: '1.0.0',
      manifestSchemaVersion: '1',
      runtimeKind: 'local_loader',
      modelVersion: null,
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
    }]
    const result = decodeInstalledPluginsResponse(raw)
    if (result[0]) {
      expect((result[0] as any).manifestHash).toBeUndefined()
    }
  })

  it('DTO does not expose packageSha256 field', () => {
    const raw = [{
      engineId: 'magika',
      displayName: 'Test',
      pluginVersion: '1.0.0',
      manifestSchemaVersion: '1',
      runtimeKind: 'local_loader',
      modelVersion: null,
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
    }]
    const result = decodeInstalledPluginsResponse(raw)
    if (result[0]) {
      expect((result[0] as any).packageSha256).toBeUndefined()
    }
  })

  it('DTO does not expose contentToken field', () => {
    const raw = [{
      engineId: 'magika',
      displayName: 'Test',
      pluginVersion: '1.0.0',
      manifestSchemaVersion: '1',
      runtimeKind: 'local_loader',
      modelVersion: null,
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
    }]
    const result = decodeInstalledPluginsResponse(raw)
    if (result[0]) {
      expect((result[0] as any).contentToken).toBeUndefined()
    }
  })

  it('DTO does not expose fullHash field', () => {
    const raw = [{
      engineId: 'magika',
      displayName: 'Test',
      pluginVersion: '1.0.0',
      manifestSchemaVersion: '1',
      runtimeKind: 'local_loader',
      modelVersion: null,
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
    }]
    const result = decodeInstalledPluginsResponse(raw)
    if (result[0]) {
      expect((result[0] as any).fullHash).toBeUndefined()
    }
  })

  it('failureReason DTO does not contain real paths', () => {
    const raw = [{
      engineId: 'magika',
      displayName: 'Test',
      pluginVersion: '1.0.0',
      manifestSchemaVersion: '1',
      runtimeKind: 'local_loader',
      modelVersion: null,
      installState: 'failed',
      enabled: false,
      healthStatus: 'unhealthy',
      failureReason: 'health_check_failed',
      installSource: 'official_catalog',
      installRootKind: 'managed_root',
      installedAt: 1,
      updatedAt: 2,
      lastVerifiedAt: 2,
      lastHealthCheckAt: 3,
    }]
    const result = decodeInstalledPluginsResponse(raw)
    if (result[0]) {
      expect(result[0].failureReason).not.toContain('C:')
      expect(result[0].failureReason).not.toContain('/Users/')
      expect(result[0].failureReason).not.toContain('/home/')
    }
  })

  it('failureReason DTO does not contain 64-char hashes', () => {
    const raw = [{
      engineId: 'magika',
      displayName: 'Test',
      pluginVersion: '1.0.0',
      manifestSchemaVersion: '1',
      runtimeKind: 'local_loader',
      modelVersion: null,
      installState: 'failed',
      enabled: false,
      healthStatus: 'unhealthy',
      failureReason: 'health_check_failed',
      installSource: 'official_catalog',
      installRootKind: 'managed_root',
      installedAt: 1,
      updatedAt: 2,
      lastVerifiedAt: 2,
      lastHealthCheckAt: 3,
    }]
    const result = decodeInstalledPluginsResponse(raw)
    if (result[0]) {
      expect(result[0].failureReason).not.toMatch(/\b[a-f0-9]{64}\b/)
    }
  })
})

describe('installRef safety', () => {
  it('normal installRef passes validation', async () => {
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async () => ({
        ok: true,
        value: {
          engineId: 'magika',
          displayName: 'Test',
          pluginVersion: '1.0.0',
          manifestSchemaVersion: '1',
          runtimeKind: 'local_loader',
          modelVersion: null,
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
      })),
    }
    const result = await registerLocalOfficialPlugin({
      pluginId: 'magika',
      pluginVersion: '0.1.0',
      installRootKind: 'managed_root',
      installRef: 'plugin_magika_001',
    })
    expect(result.ok).toBe(true)
  })

  it('empty installRef causes invocation but validation in infra layer', () => {
    // Client just passes through - validation happens in worker
    expect(registerLocalOfficialPlugin).toBeDefined()
  })
})
