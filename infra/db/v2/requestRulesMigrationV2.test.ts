import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from './testSchemaV2'
import { inspectPreRequestRulesSchemaBundleV2, inspectGenerationV2SchemaBundle,
  upgradeRequestRulesSchemaInActiveTransaction, verifyInstalledGenerationV2SchemaInActiveTransaction } from './schemaComposerV2'
import { SourcePriorityConfigV1Repo } from '../repo/sourcePriorityConfigV1Repo'
import { UserCapabilityRuleDraftV1Repo } from '../repo/userCapabilityRuleDraftV1Repo'

const root = path.resolve(process.cwd())
const addedTables = ['generation_request_rule_current_v2', 'generation_request_rule_subject_v2', 'generation_request_rule_publication_v2',
  'user_capability_rule_note_v2', 'user_capability_rule_note_state_v2', 'user_capability_rule_editing_session_v2', 'capability_rule_owner_snapshot_v2']
function predecessor() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, root)
  for (const name of addedTables) db.exec(`DROP TABLE ${name}`)
  const bundle = inspectPreRequestRulesSchemaBundleV2(root)
  const rows = db.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`).all() as
    Array<{ type: string; name: string; tbl_name: string; sql: string }>
  const projection = rows.filter(row => row.name !== 'generation_v2_schema_manifest' && !row.name.startsWith('generation_v2_search_fts_'))
    .map(row => ({ type: row.type, name: row.name, tableName: row.tbl_name, sql: row.sql }))
  const hash = (value: unknown) => import('node:crypto').then(({ createHash }) => createHash('sha256').update(JSON.stringify(value)).digest('hex'))
  return { db, bundle, projection, hash }
}

describe('Request Rule V2 additive epoch migration', () => {
  it('preserves existing priority choices and an unsaved V1 draft, and is idempotent', async () => {
    const { db, bundle, projection, hash } = predecessor()
    try {
      db.prepare('UPDATE generation_v2_schema_manifest SET schema_digest=?,object_projection_digest=?').run(bundle.schemaDigest, await hash(projection))
      db.prepare("INSERT INTO app_meta_v2 VALUES (1,2,'test.starverse',?,?,1)").run('8'.repeat(64), bundle.schemaDigest)
      db.prepare('INSERT INTO project_v2 VALUES (?,?,?,?)').run('project:migration', 'Preserved project', 1, 1)
      const priority = new SourcePriorityConfigV1Repo(db, () => 10)
      const initial = priority.get()
      priority.compareAndSet(initial.config.sourcePriorityConfigRevision, { provider_native: 3, models_dev: 2, capability_rule: 1 })
      const draft = new UserCapabilityRuleDraftV1Repo(db, () => 10).openOrCreate({ sessionId: 'session:unsaved' })
      const beforePriority = priority.get()
      const rawDraft = db.prepare('SELECT * FROM user_capability_rule_editing_session_v1').all()
      let checked = false
      db.transaction(() => upgradeRequestRulesSchemaInActiveTransaction(db, root, value => {
        expect(value.schemaDigest).toBe(bundle.schemaDigest); checked = true
      })).immediate()
      expect(checked).toBe(true)
      expect(priority.get()).toEqual(beforePriority)
      expect(db.prepare('SELECT * FROM user_capability_rule_editing_session_v1').all()).toEqual(rawDraft)
      expect(new UserCapabilityRuleDraftV1Repo(db).readDraft()).toEqual(draft)
      expect(db.prepare('SELECT name FROM project_v2').get()).toEqual({ name: 'Preserved project' })
      expect(db.prepare('SELECT schema_digest FROM app_meta_v2').get()).toEqual({ schema_digest: inspectGenerationV2SchemaBundle(root).schemaDigest })
      db.transaction(() => {
        upgradeRequestRulesSchemaInActiveTransaction(db, root, () => { throw new Error('must not re-migrate') })
        verifyInstalledGenerationV2SchemaInActiveTransaction(db, root)
      }).immediate()
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally { db.close() }
  })
  it('rolls back the entire upgrade when predecessor identity is rejected', async () => {
    const { db, bundle, projection, hash } = predecessor()
    try {
      db.prepare('UPDATE generation_v2_schema_manifest SET schema_digest=?,object_projection_digest=?').run(bundle.schemaDigest, await hash(projection))
      expect(() => db.transaction(() => upgradeRequestRulesSchemaInActiveTransaction(db, root, () => { throw new Error('identity rejected') })).immediate())
        .toThrow('identity rejected')
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='capability_rule_owner_snapshot_v2'").get()).toBeUndefined()
      expect(db.prepare('SELECT schema_digest FROM generation_v2_schema_manifest').get()).toEqual({ schema_digest: bundle.schemaDigest })
    } finally { db.close() }
  })
})
