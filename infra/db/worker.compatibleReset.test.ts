import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DbWorkerRuntime } from './worker'

async function call(runtime: DbWorkerRuntime, method: string, params: unknown = {}) {
  const result = await runtime.handleMessage({ id: `${method}-${Math.random()}`, method: method as never, params })
  if (!result.ok) throw new Error(result.error?.message ?? 'worker failure')
  return result.result as any
}

describe('compatible targeted reset worker', () => {
  it('deletes only exact legacy aliases and is deterministic and idempotent', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra/db/schema.sql') })
    try {
      const legacy = 'generic_openai_compatible'
      await call(runtime, 'compatibleProvider.create', { providerInstanceId: 'ocp_provider_resetkeep1', displayName: 'Canonical keep', createdAtMs: 1 })
      runtime.db.prepare(`INSERT INTO project(id,name,created_at,updated_at) VALUES ('project-keep','Keep',1,1)`).run()
      runtime.db.prepare(`INSERT INTO asset(id,hash,mime,bytes,path,created_at,updated_at) VALUES ('asset-keep','hash-keep','image/png',1,'keep.png',1,1)`).run()
      runtime.db.prepare(`INSERT INTO providers(provider_key, display_name, updated_at_ms) VALUES (?, 'Legacy', 1), ('openrouter', 'OpenRouter', 1), ('local_endpoint', 'Local', 1)`).run(legacy)
      runtime.db.prepare(`INSERT INTO catalog_scope_meta(provider_key,catalog_scope_key,base_url,data_source,sync_state,last_sync_at_ms,last_used_at_ms,schema_version) VALUES (?, 'scope', 'https://legacy.invalid', 'mixed', 'idle', 0, 0, 1), ('local_endpoint','scope','http://127.0.0.1:1234','mixed','idle',0,0,1)`).run(legacy)
      runtime.db.prepare(`INSERT INTO catalog_models(provider_key,catalog_scope_key,snapshot_id,model_id,model_key,display_name,input_modalities_json,output_modalities_json,supported_parameters_json,capabilities_json,first_seen_at_ms,last_seen_at_ms,synced_at_ms) VALUES (?,'scope','snap','m',? || '::m','Legacy','[]','[]','[]','{}',1,1,1)`).run(legacy, legacy)
      runtime.db.prepare(`INSERT INTO model_favorites(scope_type,scope_id,provider_key,model_id,model_key,created_at_ms,updated_at_ms) VALUES ('global','',?,'same-model',? || '::same-model',1,1),('global','','local_endpoint','same-model','local_endpoint::same-model',1,1)`).run(legacy, legacy)
      runtime.db.prepare(`INSERT INTO model_data(id,router_source,name,created_at,updated_at) VALUES ('legacy-model',?,'Legacy',1,1),('native-model','openrouter','Native',1,1)`).run(legacy)
      runtime.db.prepare(`INSERT INTO model_catalog(model_id,router_source,vendor,name,created_at_ms,updated_at_ms) VALUES ('legacy-catalog',?,'x','Legacy',1,1),('native-catalog','openrouter','x','Native',1,1)`).run(legacy)
      const legacyConvo = await call(runtime, 'convo.create', { title: 'Legacy' })
      const keptConvo = await call(runtime, 'convo.create', { title: 'Keep' })
      runtime.db.prepare(`UPDATE convo SET meta = ? WHERE id = ?`).run(JSON.stringify({ selectedProviderId: legacy, selectedModelKey: `${legacy}::m` }), legacyConvo.id)
      runtime.db.prepare(`UPDATE convo SET meta = ? WHERE id = ?`).run(JSON.stringify({ selectedProviderId: 'local_endpoint', selectedModelKey: 'local_endpoint::m' }), keptConvo.id)
      runtime.db.prepare(`INSERT INTO message(id,convo_id,role,created_at,seq,status,meta) VALUES ('mixed-legacy',?,'assistant',1,1,'final',?),('mixed-native',?,'assistant',2,2,'final',?)`).run(keptConvo.id, JSON.stringify({ providerId: legacy }), keptConvo.id, JSON.stringify({ providerId: 'openrouter' }))
      runtime.db.prepare(`INSERT INTO message_body(message_id,body) VALUES ('mixed-legacy','legacy turn'),('mixed-native','native turn')`).run()

      const preview = await call(runtime, 'compatibleReset.census')
      const compatibleObjectsBefore = runtime.db.prepare(`SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'compatible_%' OR name LIKE 'idx_compatible_%' OR name LIKE 'trg_compatible_%' ORDER BY type,name`).all()
      expect(preview).toMatchObject({ legacyProviderKeys: [legacy], counts: { providers: 1, catalog_scope_meta: 1, catalog_models: 1, model_favorites: 1, model_data: 1, model_catalog: 1 }, ambiguous: { conversationSelections: 1, messageConversations: 1 } })
      const result = await call(runtime, 'compatibleReset.execute', { confirm: 'delete_incompatible_compatible_state' })
      expect(result.before).toEqual(preview)
      expect(Object.values(result.after.counts).every((count) => count === 0)).toBe(true)
      expect(runtime.db.prepare(`SELECT provider_key FROM providers ORDER BY provider_key`).all()).toEqual([{ provider_key: 'local_endpoint' }, { provider_key: 'openrouter' }])
      expect(runtime.db.prepare(`SELECT id FROM convo WHERE id = ?`).get(keptConvo.id)).toEqual({ id: keptConvo.id })
      expect(runtime.db.prepare(`SELECT id FROM convo WHERE id = ?`).get(legacyConvo.id)).toEqual({ id: legacyConvo.id })
      expect(runtime.db.prepare(`SELECT id FROM message WHERE convo_id = ? ORDER BY seq`).all(keptConvo.id)).toEqual([{ id: 'mixed-legacy' }, { id: 'mixed-native' }])
      expect(runtime.db.prepare(`SELECT provider_key FROM model_favorites`).all()).toEqual([{ provider_key: 'local_endpoint' }])
      expect(await call(runtime, 'compatibleProvider.get', { providerInstanceId: 'ocp_provider_resetkeep1' })).toMatchObject({ protocolKey: 'openai_chat_compatible', displayName: 'Canonical keep' })
      expect(runtime.db.prepare(`SELECT id FROM project WHERE id = 'project-keep'`).get()).toEqual({ id: 'project-keep' })
      expect(runtime.db.prepare(`SELECT id FROM asset WHERE id = 'asset-keep'`).get()).toEqual({ id: 'asset-keep' })
      expect(runtime.db.prepare(`SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'compatible_%' OR name LIKE 'idx_compatible_%' OR name LIKE 'trg_compatible_%' ORDER BY type,name`).all()).toEqual(compatibleObjectsBefore)
      expect((await call(runtime, 'compatibleReset.execute', { confirm: 'delete_incompatible_compatible_state' })).before).toEqual(result.after)
    } finally { runtime.shutdown() }
  })

  it('rejects near-match aliases and missing destructive confirmation', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra/db/schema.sql') })
    try {
      runtime.db.prepare(`INSERT INTO providers(provider_key, display_name, updated_at_ms) VALUES ('generic_openai_compatible_v2', 'Keep', 1)`).run()
      await expect(call(runtime, 'compatibleReset.execute', { confirm: 'yes' })).rejects.toThrow()
      expect((await call(runtime, 'compatibleReset.census')).counts.providers).toBe(0)
      expect(runtime.db.prepare(`SELECT provider_key FROM providers`).all()).toEqual([{ provider_key: 'generic_openai_compatible_v2' }])
    } finally { runtime.shutdown() }
  })

  it('rolls back every table when a late reset deletion fails', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra/db/schema.sql') })
    try {
      const legacy = 'generic_openai_compatible'
      runtime.db.prepare(`INSERT INTO providers(provider_key, display_name, updated_at_ms) VALUES (?, 'Legacy', 1)`).run(legacy)
      runtime.db.prepare(`INSERT INTO model_favorites(scope_type,scope_id,provider_key,model_id,model_key,created_at_ms,updated_at_ms) VALUES ('global','',?,'m',? || '::m',1,1)`).run(legacy, legacy)
      runtime.db.exec(`CREATE TRIGGER fail_legacy_provider_delete BEFORE DELETE ON providers WHEN OLD.provider_key = 'generic_openai_compatible' BEGIN SELECT RAISE(ABORT, 'injected reset failure'); END;`)
      await expect(call(runtime, 'compatibleReset.execute', { confirm: 'delete_incompatible_compatible_state' })).rejects.toThrow(/injected reset failure/i)
      expect(runtime.db.prepare(`SELECT provider_key FROM providers`).all()).toEqual([{ provider_key: legacy }])
      expect(runtime.db.prepare(`SELECT provider_key FROM model_favorites`).all()).toEqual([{ provider_key: legacy }])
    } finally { runtime.shutdown() }
  })
})
