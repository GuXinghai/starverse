import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { createEpoch2ResetJournal } from './resetJournal'
import { writeEpoch2ResetJournalAtomic } from './resetJournalStore'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from './rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from './rootManifestStore'
import {
  acquireWin32EpochDatabaseFileAuthority,
  acquireWin32EpochRootLease,
  ensureEpoch2RootAuthority,
} from './win32EpochRootLease'

const safeStorageMock = vi.hoisted(() => ({
  available: true,
  appRoot: process.cwd(),
  cipherGeneration: 0,
  decryptMode: 'valid' as 'valid' | 'invalid' | 'rotate' | 'throw',
  isAsyncEncryptionAvailable: vi.fn(async () => safeStorageMock.available),
  encryptStringAsync: vi.fn(async (value: string) => {
    safeStorageMock.cipherGeneration += 1
    return Buffer.from(`scope-key:${safeStorageMock.cipherGeneration}:${value}`, 'utf8')
  }),
  decryptStringAsync: vi.fn(async (value: Buffer) => {
    if (safeStorageMock.decryptMode === 'throw') throw new Error('test decrypt failure')
    if (safeStorageMock.decryptMode === 'invalid') {
      return { shouldReEncrypt: false, result: 'invalid' }
    }
    const text = value.toString('utf8')
    const match = /^scope-key:\d+:(.*)$/u.exec(text)
    const shouldReEncrypt = safeStorageMock.decryptMode === 'rotate'
    if (shouldReEncrypt) safeStorageMock.decryptMode = 'valid'
    return {
      shouldReEncrypt,
      result: match?.[1] ?? 'invalid',
    }
  }),
}))

vi.mock('electron', () => ({
  app: { isPackaged: true, getAppPath: () => safeStorageMock.appRoot },
  safeStorage: safeStorageMock,
}))

import {
  initializeOrVerifyFreshEpoch2Database,
  verifyExistingFreshEpoch2Database,
} from './freshEpochDatabaseInitializer'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []
const repositoryRoot = path.resolve(process.cwd())

function fixture(name: string) {
  const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  roots.push(appDataRoot)
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot,
    homeRoot: os.homedir(),
    repositoryRoot,
  })
  fs.mkdirSync(layout.productRoot, { recursive: true })
  const lease = acquireWin32EpochRootLease(layout)
  writeEpoch2TransitionOwnershipManifestAtomic({
    layout,
    lease,
    manifest: createEpoch2RootManifest({ layout }),
  })
  writeEpoch2ResetJournalAtomic({
    layout,
    lease,
    journal: createEpoch2ResetJournal({
      layout,
      operationId: '123e4567-e89b-42d3-a456-426614174000',
    }),
  })
  const rootAuthority = ensureEpoch2RootAuthority({ layout, lease })
  return { layout, lease, rootAuthority }
}

function createBrokenSchemaRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-v2-broken-schema-'))
  roots.push(root)
  const target = path.join(root, 'infra', 'db', 'v2')
  fs.mkdirSync(target, { recursive: true })
  for (const file of [
    'coreConversationSchema.sql',
    'generationConfigSchema.sql',
    'attachmentAssetSchema.sql',
    'fileTypeDetectionSchema.sql',
    'openRouterImagesSchema.sql',
    'deepSeekStableModelEvidenceSchema.sql',
  ]) fs.copyFileSync(path.join(repositoryRoot, 'infra', 'db', 'v2', file), path.join(target, file))
  fs.writeFileSync(path.join(target, 'generationExecutionSchema.sql'), [
    '-- Generation Compiler V2 failing fresh initializer fixture.',
    'CREATE TABLE IF NOT EXISTS transaction_partial_probe_v2 (id TEXT PRIMARY KEY);',
    'THIS IS NOT SQL;',
  ].join('\n'))
  return root
}

function createDivergentSchemaRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-v2-divergent-schema-'))
  roots.push(root)
  const target = path.join(root, 'infra', 'db', 'v2')
  fs.mkdirSync(target, { recursive: true })
  for (const file of [
    'coreConversationSchema.sql',
    'generationConfigSchema.sql',
    'toolRegistrySchema.sql',
    'attachmentAssetSchema.sql',
    'fileTypeDetectionSchema.sql',
    'openRouterImagesSchema.sql',
    'localEndpointProfileSchema.sql',
    'reasoningProjectionSchema.sql',
    'composerDraftSchema.sql',
    'generationExecutionSchema.sql',
    'searchSchema.sql',
    'enginePluginRegistrySchema.sql',
    'openAIChatCompatibleSchema.sql',
    'modelPreferencesSchema.sql',
    'modelCatalogSchemaV2.sql',
    'dfcAttachmentSchema.sql',
    'conversationRoutePreferenceSchema.sql',
    'capabilityRuleSchema.sql',
    'canonicalModelFactSourceSchema.sql',
    'modelFactsSourcePrioritySchema.sql',
    'resolvedModelFactsSchema.sql',
  ]) fs.copyFileSync(path.join(repositoryRoot, 'infra', 'db', 'v2', file), path.join(target, file))
  fs.appendFileSync(path.join(target, 'generationConfigSchema.sql'), '\n-- build advanced fixture\n')
  return root
}

function createEditSessionSchemaRoot(predecessor:boolean,failUpgrade=false,lineEnding:'lf'|'crlf'='lf'):string {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'starverse-edit-schema-'))
  roots.push(root)
  const target=path.join(root,'infra','db','v2')
  fs.mkdirSync(target,{recursive:true})
  const files=fs.readdirSync(path.join(repositoryRoot,'infra','db','v2')).filter(file=>file.endsWith('.sql'))
  const committedBlobs=predecessor?execFileSync('git',['cat-file','--batch'],{cwd:repositoryRoot,
    input:files.map(file=>`4ac2de5796e2ef75f180c3efc4a67354d351a77a:infra/db/v2/${file}\n`).join('')}):null
  let blobOffset=0
  for(const file of files) {
    if(predecessor) {
      const headerEnd=committedBlobs!.indexOf(10,blobOffset)
      const header=committedBlobs!.subarray(blobOffset,headerEnd).toString('utf8')
      expect(header).toMatch(/^[0-9a-f]+ blob \d+$/u)
      const length=Number(header.split(' ')[2])
      const committed=committedBlobs!.subarray(headerEnd+1,headerEnd+1+length)
      blobOffset=headerEnd+1+length+1
      const sql=committed.toString('utf8').replace(/\r\n/gu,'\n')
      fs.writeFileSync(path.join(target,file),lineEnding==='lf'?sql:sql.replace(/\n/gu,'\r\n'))
    }else fs.copyFileSync(path.join(repositoryRoot,'infra','db','v2',file),path.join(target,file))
  }
  const composerPath=path.join(target,'composerDraftSchema.sql')
  if(failUpgrade) {
    fs.appendFileSync(composerPath,'\nTHIS IS NOT SQL;\n')
  }
  return root
}

function seedLegacyEdit(db:BetterSqlite3.Database):void {
  db.pragma('foreign_keys = ON')
  db.prepare("INSERT INTO project_v2 VALUES('project:legacy','Legacy',1,1)").run()
  db.prepare("INSERT INTO conversation_v2 VALUES('conversation:legacy','project:legacy','History',1,1)").run()
  db.prepare("INSERT INTO branch_v2 VALUES('branch:legacy','conversation:legacy',NULL,NULL,1,1,NULL,NULL)").run()
  db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
    question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
    VALUES('question:legacy','conversation:legacy','branch:legacy','user','completed',NULL,NULL,NULL,1,2,2)`).run()
  db.prepare("UPDATE message_body_v2 SET body_text='preserved history' WHERE message_id='question:legacy'").run()
  db.prepare(`INSERT INTO composer_draft_v2 VALUES('conversation:legacy','preserved in-progress edit','edit','question:legacy',7,3)`).run()
  db.prepare(`INSERT INTO url_attachment_reference_v2 VALUES('url:legacy','url-revision:legacy',?,?,'document',NULL,3,'user_supplied',3)`)
    .run('https://example.test/legacy.pdf',createHash('sha256').update('https://example.test/legacy.pdf').digest('hex'))
  db.prepare(`INSERT INTO composer_draft_attachment_v2(conversation_id,attachment_kind,asset_id,asset_revision_id,asset_sha256,
    url_reference_id,url_reference_revision,attachment_order,include_in_next_request,send_as,conversion_kind,created_at_ms,updated_at_ms)
    VALUES('conversation:legacy','url_reference',NULL,NULL,NULL,'url:legacy','url-revision:legacy',0,1,'url_reference','none',3,3)`).run()
}

beforeEach(() => {
  safeStorageMock.available = true
  safeStorageMock.appRoot = repositoryRoot
  safeStorageMock.cipherGeneration = 0
  safeStorageMock.decryptMode = 'valid'
  safeStorageMock.isAsyncEncryptionAvailable.mockClear()
  safeStorageMock.encryptStringAsync.mockClear()
  safeStorageMock.decryptStringAsync.mockClear()
})

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('fresh epoch-2 database initializer', () => {
  windowsIt.each(['lf','crlf'] as const)('upgrades only the intact populated committed %s predecessor and preserves legacy edit content on reopen',async(lineEnding)=>{
    const value=fixture('starverse-edit-upgrade-success')
    try {
      safeStorageMock.appRoot=createEditSessionSchemaRoot(true,false,lineEnding)
      const predecessor=await initializeOrVerifyFreshEpoch2Database(value)
      expect(predecessor.schemaDigest).toBe(lineEnding==='lf'
        ? '95267d0affa2648b9ebb568b4ed76da2c8404104f78801dd3b228135b8ff4681'
        : 'dbc731ea21ed71aacd13963bcb0be554dc4a03fbdbe4d5fc18a2dfa1ae74595d')
      const db=new BetterSqlite3(value.layout.databasePath)
      seedLegacyEdit(db)
      const oldMeta=db.prepare('SELECT * FROM app_meta_v2').get() as Record<string,unknown>
      const oldEnvelope=db.prepare('SELECT * FROM epoch_scope_key_envelope_v2').get()
      db.close()
      safeStorageMock.appRoot=repositoryRoot
      const upgraded=await initializeOrVerifyFreshEpoch2Database(value)
      expect(upgraded.created).toBe(false)
      expect(upgraded.databaseFileId).toBe(predecessor.databaseFileId)
      expect(upgraded.schemaDigest).not.toBe(predecessor.schemaDigest)
      expect(await initializeOrVerifyFreshEpoch2Database(value)).toEqual(upgraded)
      expect(await verifyExistingFreshEpoch2Database(value)).toMatchObject({schemaDigest:upgraded.schemaDigest})
      const verified=new BetterSqlite3(value.layout.databasePath)
      try {
        expect(verified.prepare('SELECT * FROM app_meta_v2').get()).toEqual({...oldMeta,schema_digest:upgraded.schemaDigest})
        expect(verified.prepare('SELECT * FROM epoch_scope_key_envelope_v2').get()).toEqual(oldEnvelope)
        expect(verified.prepare('SELECT draft_text,draft_mode,editing_source_question_id,revision FROM composer_draft_v2').get())
          .toEqual({draft_text:'preserved in-progress edit',draft_mode:'compose',editing_source_question_id:null,revision:8})
        expect(verified.prepare("SELECT body_text FROM message_body_v2 WHERE message_id='question:legacy'").get())
          .toEqual({body_text:'preserved history'})
        expect(verified.prepare('SELECT * FROM composer_edit_session_v2').all()).toEqual([])
        expect(verified.prepare('SELECT url_reference_id,url_reference_revision,send_as FROM composer_draft_attachment_v2').get())
          .toEqual({url_reference_id:'url:legacy',url_reference_revision:'url-revision:legacy',send_as:'url_reference'})
        expect(()=>verified.prepare('UPDATE app_meta_v2 SET schema_digest=?').run('0'.repeat(64)))
          .toThrow('GENERATION_V2_APP_META_IMMUTABLE')
      }finally{verified.close()}
    }finally{value.lease.release()}
  })

  windowsIt('rejects a self-consistent tampered predecessor without adding objects or altering data',async()=>{
    const value=fixture('starverse-edit-upgrade-tampered')
    try {
      safeStorageMock.appRoot=createEditSessionSchemaRoot(true)
      const predecessor=await initializeOrVerifyFreshEpoch2Database(value)
      const db=new BetterSqlite3(value.layout.databasePath)
      seedLegacyEdit(db)
      db.exec('DROP TRIGGER trg_composer_draft_v2_validate_edit_source_update')
      // A self-reported manifest projection is insufficient upgrade authority.
      const ftsShadows=new Set(['generation_v2_search_fts_config','generation_v2_search_fts_content','generation_v2_search_fts_data','generation_v2_search_fts_docsize','generation_v2_search_fts_idx'])
      const projection=(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all() as Record<string,unknown>[])
        .filter(row=>row.name!=='generation_v2_schema_manifest'&&!ftsShadows.has(String(row.name)))
        .map(row=>({type:row.type,name:row.name,tableName:row.tbl_name,sql:row.sql}))
      db.prepare('UPDATE generation_v2_schema_manifest SET object_projection_digest=?')
        .run(createHash('sha256').update(JSON.stringify(projection)).digest('hex'))
      db.close()
      safeStorageMock.appRoot=repositoryRoot
      await expect(initializeOrVerifyFreshEpoch2Database(value)).rejects.toThrow('EPOCH2_DATABASE_TRANSACTION_FAILED')
      const retained=new BetterSqlite3(value.layout.databasePath,{readonly:true})
      try {
        expect(retained.prepare('SELECT schema_digest FROM app_meta_v2').get()).toEqual({schema_digest:predecessor.schemaDigest})
        expect(retained.prepare('SELECT draft_text,draft_mode,revision FROM composer_draft_v2').get())
          .toEqual({draft_text:'preserved in-progress edit',draft_mode:'edit',revision:7})
        expect(retained.prepare("SELECT 1 FROM sqlite_master WHERE name='composer_edit_session_v2'").get()).toBeUndefined()
      }finally{retained.close()}
    }finally{value.lease.release()}
  })

  windowsIt('rejects an unknown predecessor build without upgrading or discarding its populated draft',async()=>{
    const value=fixture('starverse-edit-upgrade-unknown')
    try {
      safeStorageMock.appRoot=createEditSessionSchemaRoot(true)
      fs.appendFileSync(path.join(safeStorageMock.appRoot,'infra','db','v2','generationConfigSchema.sql'),'\n-- unknown predecessor build\n')
      const predecessor=await initializeOrVerifyFreshEpoch2Database(value)
      const db=new BetterSqlite3(value.layout.databasePath)
      seedLegacyEdit(db)
      db.close()
      safeStorageMock.appRoot=repositoryRoot
      await expect(initializeOrVerifyFreshEpoch2Database(value)).rejects.toThrow('EPOCH2_DATABASE_SCHEMA_MISMATCH')
      const retained=new BetterSqlite3(value.layout.databasePath,{readonly:true})
      try {
        expect(retained.prepare('SELECT schema_digest FROM app_meta_v2').get()).toEqual({schema_digest:predecessor.schemaDigest})
        expect(retained.prepare('SELECT draft_text,draft_mode,revision FROM composer_draft_v2').get())
          .toEqual({draft_text:'preserved in-progress edit',draft_mode:'edit',revision:7})
        expect(retained.prepare("SELECT 1 FROM sqlite_master WHERE name='composer_edit_session_v2'").get()).toBeUndefined()
      }finally{retained.close()}
    }finally{value.lease.release()}
  })

  windowsIt('rejects wrong predecessor root identity before adding edit objects or changing draft state',async()=>{
    const value=fixture('starverse-edit-upgrade-wrong-root')
    try {
      safeStorageMock.appRoot=createEditSessionSchemaRoot(true)
      const predecessor=await initializeOrVerifyFreshEpoch2Database(value)
      const db=new BetterSqlite3(value.layout.databasePath)
      seedLegacyEdit(db)
      const trigger=db.prepare("SELECT sql FROM sqlite_master WHERE name='trg_app_meta_v2_immutable'").get() as {sql:string}
      db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
      db.prepare('UPDATE app_meta_v2 SET root_id=? WHERE singleton_id=1').run('0'.repeat(64))
      db.exec(trigger.sql)
      db.close()
      safeStorageMock.appRoot=repositoryRoot
      await expect(initializeOrVerifyFreshEpoch2Database(value)).rejects.toThrow('EPOCH2_DATABASE_STATE_INVALID')
      const retained=new BetterSqlite3(value.layout.databasePath,{readonly:true})
      try {
        expect(retained.prepare('SELECT schema_digest,root_id FROM app_meta_v2').get())
          .toEqual({schema_digest:predecessor.schemaDigest,root_id:'0'.repeat(64)})
        expect(retained.prepare('SELECT draft_text,draft_mode,revision FROM composer_draft_v2').get())
          .toEqual({draft_text:'preserved in-progress edit',draft_mode:'edit',revision:7})
        expect(retained.prepare("SELECT 1 FROM sqlite_master WHERE name='composer_edit_session_v2'").get()).toBeUndefined()
      }finally{retained.close()}
    }finally{value.lease.release()}
  })

  windowsIt('restores old metadata and its immutable trigger when trigger recreation fails after the digest updates',async()=>{
    const value=fixture('starverse-edit-upgrade-meta-rollback')
    try {
      safeStorageMock.appRoot=createEditSessionSchemaRoot(true)
      const predecessor=await initializeOrVerifyFreshEpoch2Database(value)
      const db=new BetterSqlite3(value.layout.databasePath)
      seedLegacyEdit(db)
      const metaBefore=db.prepare('SELECT * FROM app_meta_v2').get()
      const manifestBefore=db.prepare('SELECT * FROM generation_v2_schema_manifest').get()
      const trigger=db.prepare("SELECT sql FROM sqlite_master WHERE name='trg_app_meta_v2_immutable'").get() as {sql:string}
      db.close()
      safeStorageMock.appRoot=repositoryRoot
      const originalExec=BetterSqlite3.prototype.exec
      const fault=vi.spyOn(BetterSqlite3.prototype,'exec').mockImplementation(function(this:BetterSqlite3.Database,sql:string){
        if(sql===trigger.sql)throw new Error('TEST_METADATA_TRIGGER_RECREATE_FAILURE')
        return originalExec.call(this,sql)
      })
      try {
        await expect(initializeOrVerifyFreshEpoch2Database(value)).rejects.toThrow('EPOCH2_DATABASE_TRANSACTION_FAILED')
      }finally{fault.mockRestore()}
      const retained=new BetterSqlite3(value.layout.databasePath)
      try {
        expect(retained.prepare('SELECT * FROM app_meta_v2').get()).toEqual(metaBefore)
        expect(retained.prepare('SELECT * FROM generation_v2_schema_manifest').get()).toEqual(manifestBefore)
        expect(retained.prepare('SELECT schema_digest FROM app_meta_v2').get()).toEqual({schema_digest:predecessor.schemaDigest})
        expect(retained.prepare('SELECT draft_text,draft_mode,revision FROM composer_draft_v2').get())
          .toEqual({draft_text:'preserved in-progress edit',draft_mode:'edit',revision:7})
        expect(retained.prepare("SELECT 1 FROM sqlite_master WHERE name='composer_edit_session_v2'").get()).toBeUndefined()
        expect(()=>retained.prepare('UPDATE app_meta_v2 SET schema_digest=?').run('0'.repeat(64)))
          .toThrow('GENERATION_V2_APP_META_IMMUTABLE')
      }finally{retained.close()}
    }finally{value.lease.release()}
  })

  windowsIt('recognizes the pinned mixed digest over intact canonical predecessor SQL when target assets use LF',async()=>{
    const value=fixture('starverse-edit-upgrade-mixed-pin')
    try {
      safeStorageMock.appRoot=createEditSessionSchemaRoot(true)
      await initializeOrVerifyFreshEpoch2Database(value)
      const db=new BetterSqlite3(value.layout.databasePath)
      seedLegacyEdit(db)
      const trigger=db.prepare("SELECT sql FROM sqlite_master WHERE name='trg_app_meta_v2_immutable'").get() as {sql:string}
      const mixedDigest='f37bcbb510e7b7a20d61fa30601dd36fb8cbe2d58c8131b1c25e14e103aea51f'
      db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
      db.prepare('UPDATE app_meta_v2 SET schema_digest=?').run(mixedDigest)
      db.exec(trigger.sql)
      db.prepare('UPDATE generation_v2_schema_manifest SET schema_digest=?').run(mixedDigest)
      db.close()
      safeStorageMock.appRoot=createEditSessionSchemaRoot(false)
      for(const file of fs.readdirSync(path.join(safeStorageMock.appRoot,'infra','db','v2')).filter(file=>file.endsWith('.sql'))) {
        const filePath=path.join(safeStorageMock.appRoot,'infra','db','v2',file)
        fs.writeFileSync(filePath,fs.readFileSync(filePath,'utf8').replace(/\r\n/gu,'\n'))
      }
      const upgraded=await initializeOrVerifyFreshEpoch2Database(value)
      expect(upgraded.schemaDigest).not.toBe(mixedDigest)
      const retained=new BetterSqlite3(value.layout.databasePath,{readonly:true})
      try {
        expect(retained.prepare('SELECT draft_text,draft_mode,revision FROM composer_draft_v2').get())
          .toEqual({draft_text:'preserved in-progress edit',draft_mode:'compose',revision:8})
        expect(retained.prepare('SELECT schema_digest FROM app_meta_v2').get()).toEqual({schema_digest:upgraded.schemaDigest})
      }finally{retained.close()}
    }finally{value.lease.release()}
  })

  windowsIt('rolls back an additive upgrade failure without changing legacy rows or schema authority',async()=>{
    const value=fixture('starverse-edit-upgrade-rollback')
    try {
      safeStorageMock.appRoot=createEditSessionSchemaRoot(true)
      const predecessor=await initializeOrVerifyFreshEpoch2Database(value)
      const db=new BetterSqlite3(value.layout.databasePath)
      seedLegacyEdit(db)
      db.close()
      safeStorageMock.appRoot=createEditSessionSchemaRoot(false,true)
      await expect(initializeOrVerifyFreshEpoch2Database(value)).rejects.toThrow('EPOCH2_DATABASE_TRANSACTION_FAILED')
      const retained=new BetterSqlite3(value.layout.databasePath,{readonly:true})
      try {
        expect(retained.prepare('SELECT schema_digest FROM app_meta_v2').get()).toEqual({schema_digest:predecessor.schemaDigest})
        expect(retained.prepare('SELECT draft_text,draft_mode,revision FROM composer_draft_v2').get())
          .toEqual({draft_text:'preserved in-progress edit',draft_mode:'edit',revision:7})
        expect(retained.prepare("SELECT 1 FROM sqlite_master WHERE name='composer_edit_session_v2'").get()).toBeUndefined()
      }finally{retained.close()}
    }finally{value.lease.release()}
  })
  windowsIt('verify-existing rejects a missing database without creating a file', async () => {
    const value = fixture('starverse-fresh-db-verify-missing')
    try {
      expect(fs.existsSync(value.layout.databasePath)).toBe(false)
      await expect(verifyExistingFreshEpoch2Database(value)).rejects.toThrow()
      expect(fs.existsSync(value.layout.databasePath)).toBe(false)
    } finally { value.lease.release() }
  })

  windowsIt('atomically initializes one complete identity and verifies the same database on reopen', async () => {
    const value = fixture('starverse-fresh-db-success')
    try {
      const created = await initializeOrVerifyFreshEpoch2Database(value)
      expect(created).toMatchObject({
        classification: 'epoch_2_database_initialized',
        executionAuthority: 'none',
        created: true,
        schemaVersion: 1,
      })
      expect(created.databaseFileId).toMatch(/^[0-9a-f]{32}$/u)
      expect(created.schemaDigest).toMatch(/^[0-9a-f]{64}$/u)
      expect(created.objectProjectionDigest).toMatch(/^[0-9a-f]{64}$/u)
      expect(safeStorageMock.encryptStringAsync).not.toHaveBeenCalled()
      expect(safeStorageMock.decryptStringAsync).not.toHaveBeenCalled()

      const reopened = await initializeOrVerifyFreshEpoch2Database(value)
      expect(reopened).toEqual({ ...created, created: false })
      expect(safeStorageMock.encryptStringAsync).not.toHaveBeenCalled()
      expect(safeStorageMock.decryptStringAsync).not.toHaveBeenCalled()

      const db = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      try {
        expect(db.prepare('SELECT data_epoch, application_id, root_id, schema_digest FROM app_meta_v2').get())
          .toEqual({
            data_epoch: 2,
            application_id: 'io.github.guxinghai.starverse',
            root_id: created.rootId,
            schema_digest: created.schemaDigest,
          })
        expect(db.prepare('SELECT backend, key_version, typeof(ciphertext) AS storage_type FROM epoch_scope_key_envelope_v2').get())
          .toEqual({ backend: 'electron_safe_storage', key_version: 1, storage_type: 'blob' })
        expect(db.prepare(`SELECT state.source_kind, revision.subject_index_mode
          FROM canonical_model_fact_source_state_v1 state
          JOIN canonical_model_fact_source_revision_v1 revision
            ON revision.canonical_source_revision=state.canonical_source_revision
          WHERE state.source_kind='capability_rule'`).get())
          .toEqual({ source_kind: 'capability_rule', subject_index_mode: 'complete' })
      } finally { db.close() }
    } finally { value.lease.release() }
  })

  windowsIt('initializes without async safeStorage', async () => {
    const value = fixture('starverse-fresh-db-storage-unavailable')
    safeStorageMock.available = false
    try {
      await expect(initializeOrVerifyFreshEpoch2Database(value)).resolves.toMatchObject({ created: true })
      expect(fs.existsSync(value.layout.databasePath)).toBe(true)
      expect(safeStorageMock.encryptStringAsync).not.toHaveBeenCalled()
    } finally { value.lease.release() }
  })

  windowsIt('rolls back all logical state and later recovers regardless of the physical main-file size', async () => {
    const value = fixture('starverse-fresh-db-rollback')
    const brokenRoot = createBrokenSchemaRoot()
    try {
      safeStorageMock.appRoot = brokenRoot
      await expect(initializeOrVerifyFreshEpoch2Database(value))
        .rejects.toThrow('EPOCH2_DATABASE_TRANSACTION_FAILED')
      expect(fs.statSync(value.layout.databasePath).size).toBeGreaterThanOrEqual(0)
      const afterFailure = new BetterSqlite3(value.layout.databasePath)
      try {
        expect(afterFailure.prepare(`SELECT count(*) AS count FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'`).get()).toEqual({ count: 0 })
      } finally { afterFailure.close() }

      safeStorageMock.appRoot = repositoryRoot
      const recovered = await initializeOrVerifyFreshEpoch2Database(value)
      expect(recovered.created).toBe(true)
    } finally { value.lease.release() }
  })

  windowsIt('rejects schema-only state without patching missing identity rows', async () => {
    const value = fixture('starverse-fresh-db-schema-only')
    const authority = acquireWin32EpochDatabaseFileAuthority({ ...value, mode: 'create_or_open' })
    try {
      const db = new BetterSqlite3(value.layout.databasePath)
      try { applyGenerationV2SchemaForTest(db, repositoryRoot) } finally { db.close() }
    } finally { authority.release() }

    try {
      await expect(initializeOrVerifyFreshEpoch2Database(value))
        .rejects.toThrow('EPOCH2_DATABASE_STATE_INVALID')
      const db = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      try {
        expect(db.prepare('SELECT count(*) AS count FROM app_meta_v2').get()).toEqual({ count: 0 })
        expect(db.prepare('SELECT count(*) AS count FROM epoch_scope_key_envelope_v2').get())
          .toEqual({ count: 0 })
      } finally { db.close() }
      expect(safeStorageMock.encryptStringAsync).not.toHaveBeenCalled()
    } finally { value.lease.release() }
  })

  windowsIt('does not touch the retired scope-envelope marker when safeStorage requests rotation', async () => {
    const value = fixture('starverse-fresh-db-rewrap')
    try {
      await initializeOrVerifyFreshEpoch2Database(value)
      const before = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      const original = before.prepare(`SELECT envelope_revision, hex(ciphertext) AS ciphertext
        FROM epoch_scope_key_envelope_v2`).get() as { envelope_revision: number; ciphertext: string }
      before.close()
      safeStorageMock.decryptMode = 'rotate'
      const reopened = await initializeOrVerifyFreshEpoch2Database(value)
      expect(reopened.created).toBe(false)
      const after = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      try {
        const current = after.prepare(`SELECT envelope_revision, hex(ciphertext) AS ciphertext
          FROM epoch_scope_key_envelope_v2`).get() as { envelope_revision: number; ciphertext: string }
        expect(current).toEqual(original)
      } finally { after.close() }
    } finally { value.lease.release() }
  })

  windowsIt('keeps a complete database available when retired scope-envelope ciphertext cannot decrypt', async () => {
    const value = fixture('starverse-fresh-db-decrypt-invalid')
    try {
      await initializeOrVerifyFreshEpoch2Database(value)
      for (const mode of ['invalid', 'throw'] as const) {
        safeStorageMock.decryptMode = mode
        await expect(initializeOrVerifyFreshEpoch2Database(value)).resolves.toMatchObject({ created: false })
      }
      const db = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      try {
        expect(db.prepare('SELECT count(*) AS count FROM app_meta_v2').get()).toEqual({ count: 1 })
        expect(db.prepare('SELECT count(*) AS count FROM epoch_scope_key_envelope_v2').get())
          .toEqual({ count: 1 })
      } finally { db.close() }
    } finally { value.lease.release() }
  })

  windowsIt.each([
    ['table', 'CREATE TABLE unexpected_epoch2_object (id TEXT)'],
    ['trigger', `CREATE TRIGGER unexpected_epoch2_trigger AFTER INSERT ON app_meta_v2
      BEGIN SELECT 1; END`],
  ])('rejects an otherwise complete database containing an extra %s', async (_kind, sql) => {
    const value = fixture('starverse-fresh-db-extra-object')
    try {
      await initializeOrVerifyFreshEpoch2Database(value)
      const db = new BetterSqlite3(value.layout.databasePath)
      try { db.exec(sql) } finally { db.close() }
      await expect(initializeOrVerifyFreshEpoch2Database(value))
        .rejects.toThrow('EPOCH2_DATABASE_TRANSACTION_FAILED')
    } finally { value.lease.release() }
  })

  windowsIt('classifies a build-advanced schema digest mismatch instead of masking it as corruption', async () => {
    const value = fixture('starverse-fresh-db-schema-mismatch')
    try {
      await initializeOrVerifyFreshEpoch2Database(value)
      const divergentRoot = createDivergentSchemaRoot()
      safeStorageMock.appRoot = divergentRoot
      await expect(verifyExistingFreshEpoch2Database(value))
        .rejects.toThrow('EPOCH2_DATABASE_SCHEMA_MISMATCH')
      const db = new BetterSqlite3(value.layout.databasePath, { readonly: true })
      try {
        expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      } finally { db.close() }
    } finally { value.lease.release() }
  })

  windowsIt('classifies an app_meta schema digest divergence as a schema mismatch', async () => {
    const value = fixture('starverse-fresh-db-app-meta-mismatch')
    try {
      await initializeOrVerifyFreshEpoch2Database(value)
      const db = new BetterSqlite3(value.layout.databasePath)
      try {
        const triggers = db.prepare(`SELECT sql FROM sqlite_master
          WHERE type = 'trigger' AND name LIKE 'trg_app_meta_v2_%' ORDER BY name`).all() as
          Array<{ sql: string }>
        expect(triggers).toHaveLength(2)
        db.exec('DROP TRIGGER trg_app_meta_v2_immutable')
        db.exec('DROP TRIGGER trg_app_meta_v2_delete_forbidden')
        db.prepare(`UPDATE app_meta_v2 SET schema_digest = ?
          WHERE singleton_id = 1`).run('0'.repeat(64))
        for (const row of triggers) db.exec(row.sql)
      } finally { db.close() }
      await expect(verifyExistingFreshEpoch2Database(value))
        .rejects.toThrow('EPOCH2_DATABASE_SCHEMA_MISMATCH')
    } finally { value.lease.release() }
  })
})
