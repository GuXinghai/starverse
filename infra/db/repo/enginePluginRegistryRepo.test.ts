import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canOpenBetterSqliteForSuite } from '../../testUtils/betterSqliteGate'
import { ensureEnginePluginRegistrySchema } from '../migrations/ensureEnginePluginRegistrySchema'
import { EnginePluginRegistryRepo } from './enginePluginRegistryRepo'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('enginePluginRegistryRepo') ? describe : describe.skip

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function createBaseInput(engineId: string) {
  return {
    engineId,
    displayName: 'Magika',
    pluginVersion: '1.0.0',
    manifestSchemaVersion: '1',
    manifestHash: 'ab12',
    runtimeKind: 'node',
    installRootKind: 'managed_root' as const,
    installRef: `registry:${engineId}`,
  }
}

// eslint-disable-next-line max-lines-per-function
describeIfBetterSqlite('EnginePluginRegistryRepo', () => {
  it('supports insert/read/list and install state filtering', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureEnginePluginRegistrySchema(db)
    const repo = new EnginePluginRegistryRepo(db)

    const inserted = repo.insert({
      ...createBaseInput('engine.magika'),
      metadataJson: { channel: 'stable' },
      updatedAt: 10,
    })

    expect(inserted).toMatchObject({
      engineId: 'engine.magika',
      installState: 'installed',
      enabled: true,
      healthStatus: 'unknown',
      installSource: 'official_catalog',
      installRootKind: 'managed_root',
      installRef: 'registry:engine.magika',
      metadataJson: { channel: 'stable' },
    })

    const read = repo.getByEngineId('engine.magika')
    expect(read?.engineId).toBe('engine.magika')

    repo.insert({
      ...createBaseInput('engine.tika'),
      pluginVersion: '1.0.1',
      installState: 'uninstalled',
      enabled: false,
      updatedAt: 20,
    })

    expect(repo.list().map((row) => row.engineId)).toEqual(['engine.tika', 'engine.magika'])
    expect(repo.list({ includeUninstalled: false }).map((row) => row.engineId)).toEqual(['engine.magika'])
  })

  it('supports upsert updates and enabled switch', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureEnginePluginRegistrySchema(db)
    const repo = new EnginePluginRegistryRepo(db)

    repo.insert({
      ...createBaseInput('engine.magika'),
      pluginVersion: '1.0.0',
      updatedAt: 100,
    })

    const updated = repo.upsert({
      ...createBaseInput('engine.magika'),
      pluginVersion: '1.1.0',
      installState: 'update_available',
      enabled: false,
      updatedAt: 200,
    })
    expect(updated.pluginVersion).toBe('1.1.0')
    expect(updated.installState).toBe('update_available')
    expect(updated.enabled).toBe(false)

    expect(repo.enable('engine.magika', 210)).toEqual({ ok: true, updated: 1 })
    expect(repo.getByEngineId('engine.magika')).toMatchObject({
      enabled: true,
      installState: 'installed',
    })

    expect(repo.disable('engine.magika', 220)).toEqual({ ok: true, updated: 1 })
    expect(repo.getByEngineId('engine.magika')?.enabled).toBe(false)
  })

  it('supports failed, health, and uninstall state transitions', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureEnginePluginRegistrySchema(db)
    const repo = new EnginePluginRegistryRepo(db)

    repo.insert({
      ...createBaseInput('engine.magika'),
      updatedAt: 300,
    })

    expect(repo.updateHealth({
      engineId: 'engine.magika',
      healthStatus: 'healthy',
      updatedAt: 310,
      lastHealthCheckAt: 311,
    })).toEqual({ ok: true, updated: 1 })
    expect(repo.getByEngineId('engine.magika')).toMatchObject({
      healthStatus: 'healthy',
      lastHealthCheckAt: 311,
    })

    expect(repo.markFailed({
      engineId: 'engine.magika',
      failureReason: 'health_check_failed',
      updatedAt: 320,
      lastHealthCheckAt: 321,
    })).toEqual({ ok: true, updated: 1 })
    expect(repo.getByEngineId('engine.magika')).toMatchObject({
      installState: 'failed',
      enabled: false,
      healthStatus: 'unhealthy',
      failureReason: 'health_check_failed',
    })

    expect(repo.markUninstalled({
      engineId: 'engine.magika',
      updatedAt: 330,
    })).toEqual({ ok: true, updated: 1 })
    expect(repo.getByEngineId('engine.magika')).toMatchObject({
      installState: 'uninstalled',
      enabled: false,
      healthStatus: 'unknown',
      failureReason: null,
    })
  })

  it('rejects absolute paths in installRef', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureEnginePluginRegistrySchema(db)
    const repo = new EnginePluginRegistryRepo(db)

    expect(() => repo.insert({
      ...createBaseInput('engine.magika'),
      installRef: 'C:\\plugins\\magika',
      updatedAt: 400,
    })).toThrow(/installRef must be an abstract reference/i)
  })
})
