import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  collectActiveMagikaRuntimePluginDirs,
  createRegistryGatedMagikaRuntimeLoader,
  type MagikaRuntimeRegistryRecord,
} from './worker/runtime'
import type { MagikaRuntimeLoadResult } from '../../src/next/file-type/magikaRuntimeLoader'

const storageRootDir = path.join('D:', 'StarverseProfile')

function registryRecord(overrides: Partial<MagikaRuntimeRegistryRecord> = {}): MagikaRuntimeRegistryRecord {
  return {
    engineId: 'magika',
    enabled: true,
    installState: 'installed',
    installRootKind: 'managed_root',
    installRef: 'magika',
    ...overrides,
  }
}

describe('collectActiveMagikaRuntimePluginDirs', () => {
  it('returns no candidate when no magika registry record exists', () => {
    expect(collectActiveMagikaRuntimePluginDirs({ storageRootDir, registryRecords: [] })).toEqual([])
    expect(
      collectActiveMagikaRuntimePluginDirs({
        storageRootDir,
        registryRecords: [registryRecord({ engineId: 'pandoc' })],
      })
    ).toEqual([])
  })

  it('returns the registered root only for enabled installed magika', () => {
    const dirs = collectActiveMagikaRuntimePluginDirs({
      storageRootDir,
      registryRecords: [
        registryRecord({
          installRootKind: 'managed_cache',
          installRef: 'magika-1.0.0',
        }),
      ],
    })

    expect(dirs).toEqual([path.join(storageRootDir, 'engine-plugins', 'managed_cache', 'magika-1.0.0')])
  })

  it('allows managed_root only when it is the active registry root', () => {
    expect(
      collectActiveMagikaRuntimePluginDirs({
        storageRootDir,
        registryRecords: [registryRecord()],
      })
    ).toEqual([path.join(storageRootDir, 'engine-plugins', 'managed_root', 'magika')])
  })

  it('does not let disabled magika fall back to managed_root', () => {
    expect(
      collectActiveMagikaRuntimePluginDirs({
        storageRootDir,
        registryRecords: [registryRecord({ enabled: false })],
      })
    ).toEqual([])
  })

  it('rejects non-installed magika states even when enabled is true', () => {
    for (const installState of ['failed', 'uninstalled', 'update_available'] as const) {
      expect(
        collectActiveMagikaRuntimePluginDirs({
          storageRootDir,
          registryRecords: [registryRecord({ enabled: true, installState })],
        })
      ).toEqual([])
    }
  })

  it('sanitizes install refs before resolving plugin roots', () => {
    expect(
      collectActiveMagikaRuntimePluginDirs({
        storageRootDir,
        registryRecords: [
          registryRecord({
            installRootKind: 'managed_cache',
            installRef: '../magika package/v1',
          }),
        ],
      })
    ).toEqual([path.join(storageRootDir, 'engine-plugins', 'managed_cache', '.._magika_package_v1')])
  })
})

describe('createRegistryGatedMagikaRuntimeLoader', () => {
  it('re-reads registry on every load so disabled state takes effect without worker restart', async () => {
    let registryRecords: readonly MagikaRuntimeRegistryRecord[] = [registryRecord()]
    const observedPluginDirs: string[][] = []
    const loader = createRegistryGatedMagikaRuntimeLoader({
      storageRootDir,
      listRegistryRecords: () => registryRecords,
      classify: () => ({ label: 'txt', score: 0.99 }),
      createManagedLoader: ({ pluginDirs }) => ({
        load: (): MagikaRuntimeLoadResult => {
          observedPluginDirs.push([...pluginDirs])
          if (pluginDirs.length === 0) {
            return {
              available: false,
              runtimeKind: 'unavailable',
              modelVersion: null,
              reason: 'runtime_unavailable',
              detail: 'no active magika registry record',
            }
          }
          return {
            available: true,
            runtime: {
              kind: 'local_loader',
              modelVersion: 'magika-v1',
              classify: () => ({ label: 'txt', score: 0.99 }),
            },
          }
        },
      }),
    })

    expect(await loader.load()).toMatchObject({ available: true })
    registryRecords = [registryRecord({ enabled: false })]
    expect(await loader.load()).toMatchObject({ available: false })

    expect(observedPluginDirs).toEqual([
      [path.join(storageRootDir, 'engine-plugins', 'managed_root', 'magika')],
      [],
    ])
  })
})
