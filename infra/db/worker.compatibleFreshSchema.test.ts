import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DB_RENDERER_METHOD_SET } from './dbMethodsRegistry'
import { DbWorkerRuntime } from './worker'

function compatibleObjects(db: BetterSqlite3.Database) {
  return db.prepare(`
    SELECT type, name FROM sqlite_master
    WHERE name LIKE 'compatible_%' OR name LIKE 'trg_compatible_%' OR name LIKE 'idx_compatible_%'
    ORDER BY type, name
  `).all() as Array<{ type: string; name: string }>
}

describe('DbWorkerRuntime compatible fresh-schema bootstrap', () => {
  it('uses schema.sql as the only compatible object source and wires worker-only repositories', async () => {
    const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
    const fresh = new BetterSqlite3(':memory:')
    fresh.exec(readFileSync(schemaPath, 'utf8'))
    const expectedObjects = compatibleObjects(fresh)
    fresh.close()

    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath })
    try {
      expect(compatibleObjects(runtime.db)).toEqual(expectedObjects)
      expect(runtime.compatibleProviderRepo).toBeDefined()
      expect(runtime.compatibleProfileRepo).toBeDefined()
      expect(runtime.compatibleCatalogRepo).toBeDefined()
      expect(runtime.compatibleRouteRepo).toBeDefined()
      expect(runtime.compatibleDiagnosticsRepo).toBeDefined()
      expect(runtime.compatibleTurnProjectionRepo).toBeDefined()
      await expect(runtime.handleMessage({ id: 'compatible-projection-load-1', method: 'compatibleProjection.loadRoute', params: { routeProvenanceId: 'ocp_route_12345678' } })).resolves.toEqual({ id: 'compatible-projection-load-1', ok: true, result: [] })
      expect(DB_RENDERER_METHOD_SET.has('compatibleProvider.create')).toBe(false)

      const created = await runtime.handleMessage({
        id: 'compatible-create-1',
        method: 'compatibleProvider.create',
        params: {
          providerInstanceId: 'ocp_provider_12345678',
          displayName: 'Runtime provider',
          createdAtMs: 1,
        },
      })
      expect(created).toMatchObject({ ok: true, result: { protocolKey: 'openai_chat_compatible' } })

      const rejected = await runtime.handleMessage({
        id: 'compatible-secret-reject-1',
        method: 'compatibleCredential.createDescriptor',
        params: {
          credentialVersionRef: 'ocp_credential_12345678',
          providerInstanceId: 'ocp_provider_12345678',
          version: 1,
          authMode: 'bearer',
          backend: 'electron_safe_storage',
          maskedSummary: { schemaVersion: 1, authMode: 'bearer', configured: true, maskState: 'configured_masked', sensitiveHeaderNames: [] },
          createdAtMs: 1,
          apiKey: 'forbidden-secret',
        },
      })
      expect(rejected.ok).toBe(false)
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM compatible_credential_descriptors`).get()).toEqual({ count: 0 })
    } finally {
      runtime.shutdown()
    }
  })
})
