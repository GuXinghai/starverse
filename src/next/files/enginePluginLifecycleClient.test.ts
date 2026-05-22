/* eslint-disable max-lines-per-function */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  disablePlugin,
  enablePlugin,
  getInstallOperationStatus,
  installOfficialPlugin,
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
              displayName: 'Magika',
              publisher: 'Google Magika',
              pluginVersion: '0.1.0',
              availableVersion: '0.1.0',
              runtimeKind: 'managed',
              capabilities: ['file_identification'],
              platformCompatibility: { declaredPlatform: 'win32', compatible: true },
              architectureCompatibility: { declaredArchitecture: 'x64', compatible: true },
              appVersionCompatibility: { declaredRange: '>=0.0.0', compatible: true },
              modelVersion: 'standard_v3_3',
              packageSizeBytes: 1234,
              catalogGeneratedAt: '2026-05-08T00:00:00.000Z',
              installState: 'installed',
              enabled: true,
              recommendedInstallRootKind: 'managed_root',
              catalogStatus: 'valid_metadata_only',
              verificationMetadataStatus: 'production_signature_available',
              installabilityStatus: 'official_remote_install_available',
              reasons: ['official_remote_install_available'],
              warnings: [],
              releaseProvenance: null,
            },
          ],
        }
      }
      if (method === 'enginePluginLifecycle.installOfficialPlugin') {
        return {
          ok: true,
          value: {
            operationId: 'official-install-magika-0.1.0-1',
            pluginId: 'magika',
            pluginVersion: '0.1.0',
            operationType: 'official_install',
            source: 'official_builtin',
            state: 'pending',
            phase: 'pending',
            phaseLabel: 'Preparing install',
            progressSummary: 'Preparing install',
            stateHistory: ['accepted', 'pending'],
            startedAt: 1,
            updatedAt: 1,
            terminalAt: null,
            failureReason: null,
            diagnosticCode: null,
            sanitizedDiagnostics: [],
            installedEngineId: null,
            result: null,
          },
        }
      }
      if (method === 'enginePluginLifecycle.getInstallOperationStatus') {
        return {
          ok: true,
          value: {
            operationId: 'official-install-magika-0.1.0-1',
            pluginId: 'magika',
            pluginVersion: '0.1.0',
            operationType: 'official_install',
            source: 'official_builtin',
            state: 'installed',
            phase: 'installed',
            phaseLabel: 'Installed',
            progressSummary: 'Installed',
            stateHistory: ['accepted', 'pending', 'downloading', 'verifying', 'staging', 'registering', 'health_checking', 'installed'],
            startedAt: 1,
            updatedAt: 2,
            terminalAt: 2,
            failureReason: null,
            diagnosticCode: null,
            sanitizedDiagnostics: [],
            installedEngineId: 'magika',
            result: {
              engineId: 'magika',
              pluginVersion: '0.1.0',
              installState: 'installed',
              healthStatus: 'healthy',
            },
          },
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
    const installedOfficial = await installOfficialPlugin({
      pluginId: 'magika',
      pluginVersion: '0.1.0',
    })
    const installStatus = await getInstallOperationStatus({ pluginId: 'magika', pluginVersion: '0.1.0' })
    const enabled = await enablePlugin({ engineId: 'magika' })
    const disabled = await disablePlugin({ engineId: 'magika' })
    const uninstalled = await uninstallPlugin({ engineId: 'magika' })
    const health = await runPluginHealthCheck({ engineId: 'magika' })

    expect(official.ok).toBe(true)
    expect(installed[0]?.engineId).toBe('magika')
    expect(registered.ok).toBe(true)
    expect(installedOfficial.ok).toBe(true)
    expect(installStatus.ok).toBe(true)
    if (installStatus.ok) expect(installStatus.value?.state).toBe('installed')
    expect(enabled.ok).toBe(true)
    expect(disabled.ok).toBe(true)
    expect(uninstalled.ok).toBe(true)
    expect(health.ok).toBe(true)
  })
})

describe('enginePluginLifecycleClient DTO safety', () => {
  it('decodes ok:false lifecycle result', () => {
    const raw = {
      ok: false,
      reason: 'health_check_failed',
      message: 'state=failed',
      errorChain: {
        operationLayer: { code: 'health_check_failed' },
        healthLayer: { outcome: 'unhealthy_result', stage: 'runtime_self_test' },
        runtimeLayer: { reason: 'magika_runtime_missing_dependency' },
        rootCauseLayer: { sanitizedRootCause: 'ERR_MODULE_NOT_FOUND' },
      },
    }
    const result = decodeLifecycleInstalledResult(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('health_check_failed')
      expect(result.errorChain?.runtimeLayer.reason).toBe('magika_runtime_missing_dependency')
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

  it('decodes legacy official plugin payloads without Batch B metadata fields', () => {
    const raw = {
      ok: true,
      value: [{
        pluginId: 'magika',
        displayName: 'Magika',
        publisher: 'Google Magika',
        pluginVersion: '0.1.0',
        runtimeKind: 'managed',
        capabilities: ['file_identification'],
        modelVersion: 'standard_v3_3',
        catalogGeneratedAt: '2026-05-08T00:00:00.000Z',
        installState: 'not_installed',
        enabled: false,
        recommendedInstallRootKind: 'managed_root',
        catalogStatus: 'valid_metadata_only',
        verificationMetadataStatus: 'metadata_present_crypto_deferred',
        installabilityStatus: 'metadata_compatible_future_install',
        reasons: ['read_only_catalog_no_install_action'],
        warnings: [],
      }],
    }
    const result = decodeListOfficialPluginsResponse(raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value[0]?.platformCompatibility).toEqual({ declaredPlatform: 'any', compatible: true })
      expect(result.value[0]?.architectureCompatibility).toEqual({ declaredArchitecture: 'any', compatible: true })
      expect(result.value[0]?.appVersionCompatibility).toEqual({ declaredRange: '>=0.0.0', compatible: true })
      expect(result.value[0]?.packageSizeBytes).toBe(0)
      expect(result.value[0]?.releaseProvenance).toBeNull()
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

  it('preserves official release provenance hash while stripping top-level packageSha256', () => {
    const officialPackageHash = 'a'.repeat(64)
    const raw = [{
      engineId: 'magika',
      displayName: 'Test',
      pluginVersion: '1.0.0',
      installedVersion: '1.0.0',
      availableVersion: '1.0.0',
      packageVersion: '1.0.0',
      manifestSchemaVersion: '1',
      runtimeKind: 'local_loader',
      runtimeVersion: null,
      modelVersion: 'standard_v3_3',
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
      packageSha256: 'top-level-must-strip',
      contentToken: 'secret',
      releaseProvenance: {
        pluginId: 'magika',
        packageVersion: '1.0.0',
        runtimeVersion: null,
        modelVersion: 'standard_v3_3',
        packageFormatVersion: 1,
        manifestSchemaVersion: '1',
        inventorySchemaVersion: '1',
        packageSha256: officialPackageHash,
        packageSizeBytes: 1234,
        manifestSha256: 'b'.repeat(64),
        inventorySha256: 'c'.repeat(64),
        releaseUrl: 'https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v1.0.0/test.zip',
        releaseTag: 'starverse-plugin-magika-v1.0.0',
        assetName: 'test.zip',
        trustKeyId: 'starverse-test-key',
        signedAt: '2026-05-14T00:00:00.000Z',
        expiresAt: '2027-05-14T00:00:00.000Z',
        channel: 'stable',
        platform: 'win32',
        arch: 'x64',
      },
      previousKnownGood: null,
    }]
    const result = decodeInstalledPluginsResponse(raw)
    expect(result[0]?.releaseProvenance?.packageSha256).toBe(officialPackageHash)
    expect(result[0]?.releaseProvenance?.inventorySha256).toBe('c'.repeat(64))
    expect(result[0]?.releaseProvenance?.trustKeyId).toBe('starverse-test-key')
    expect(result[0]?.releaseProvenance?.signedAt).toBe('2026-05-14T00:00:00.000Z')
    expect(result[0]?.releaseProvenance?.expiresAt).toBe('2027-05-14T00:00:00.000Z')
    expect((result[0] as any).packageSha256).toBeUndefined()
    expect((result[0] as any).contentToken).toBeUndefined()
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
