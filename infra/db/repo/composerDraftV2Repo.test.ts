import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { AttachmentAssetV2Repo } from './attachmentAssetV2Repo'
import { ComposerDraftV2Repo } from './composerDraftV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'
import { detectBasicFileTypeV2 } from '../../../src/next/file-type/basicFileTypeDetectionV2'
import { FileTypeDetectionV2Repo } from './fileTypeDetectionV2Repo'

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 1, 1)
  return db
}

function seedEditRoute(db:BetterSqlite3.Database) {
  db.prepare(`INSERT INTO branch_v2 VALUES('branch:1','conversation:1',NULL,NULL,1,1,NULL,NULL)`).run()
  db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
    question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
    VALUES('question:1','conversation:1','branch:1','user','completed',NULL,NULL,NULL,1,2,2)`).run()
  db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
    question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
    VALUES('answer:1','conversation:1','branch:1','assistant','completed','question:1','question:1','answer:1',2,3,3)`).run()
  db.prepare("UPDATE branch_v2 SET head_message_id='answer:1' WHERE branch_id='branch:1'").run()
}

describe('ComposerDraftV2Repo DFC selection', () => {
  it('uses the original detection authority when editing a frozen converted attachment', () => {
    const db = createDb()
    try {
      const assets = new AttachmentAssetV2Repo(db, () => 10)
      const drafts = new ComposerDraftV2Repo(db, () => 10)
      const bytes = new TextEncoder().encode('# source')
      const sourceBlob = assets.recordBlobFromBytes(bytes, 'text/markdown')
      assets.createAsset({ assetId: 'asset:source', assetKind: 'file', filename: 'source.md', sourceKind: 'user_import' })
      const source = assets.appendSourceRevision({ assetId: 'asset:source', assetRevisionId: 'revision:source', blob: sourceBlob })
      const detections = new FileTypeDetectionV2Repo(db, () => 11)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        detections.createPendingInAuthorityTransaction(context, { assetRevisionId: source.assetRevisionId.value,
          assetSha256: source.blob.sha256.value, attemptId: 'attempt:source' })
      })
      const detected = detectBasicFileTypeV2({ bytes, filename: 'source.md', declaredMime: 'text/markdown', detectionTrigger: 'upload' })
      expect(detections.completeReady({ assetRevisionId: source.assetRevisionId.value, attemptId: 'attempt:source',
        revision: 1, verdict: detected.verdict, staticPolicy: detected.staticPolicy })).toBe(true)
      const derivedBlob = assets.recordBlobFromBytes(new TextEncoder().encode('source'), 'text/plain')
      const derived = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context =>
        assets.createDerivedAssetRevisionInAuthorityTransaction(context, { assetId: 'asset:derived', assetRevisionId: 'revision:derived',
          assetKind: 'file', filename: 'source.txt', parentAssetRevisionId: source.assetRevisionId.value,
          conversionKind: 'plain_text', conversionContractId: 'starverse-dfc-text-v1', conversionRevision: '1', blob: derivedBlob }))
      seedEditRoute(db)
      const initial = drafts.getOrCreate('conversation:1')
      const editing = drafts.openEdit({ conversationId: 'conversation:1', branchId: 'branch:1', expectedRevision: initial.revision,
        questionId: 'question:1', answerRootId: 'answer:1', draftText: 'edited question', attachments: [{ kind: 'managed_file',
          assetId: derived.assetId.value, assetRevisionId: derived.assetRevisionId.value, assetSha256: derived.blob.sha256.value,
          include: true, sendAs: 'inline_text', conversion: 'plain_text' }] })
      expect(editing.attachments[0]).toMatchObject({ fileTypeDetection: { status: 'ready', revision: 2, blocked: false } })
      expect(db.prepare('SELECT 1 FROM file_type_detection_v2 WHERE asset_revision_id=?').get('revision:derived')).toBeUndefined()
    } finally { db.close() }
  })
  it('keeps the raw attachment as the draft anchor and clears its selection when removed', () => {
    const db = createDb()
    try {
      const assets = new AttachmentAssetV2Repo(db, () => 10)
      const drafts = new ComposerDraftV2Repo(db, () => 10)
      const sourceBlob = assets.recordBlobFromBytes(new TextEncoder().encode('# source'), 'text/markdown')
      assets.createAsset({ assetId: 'asset:source', assetKind: 'file', filename: 'source.md', sourceKind: 'user_import' })
      const source = assets.appendSourceRevision({
        assetId: 'asset:source', assetRevisionId: 'revision:source', blob: sourceBlob,
      })
      const derivedBlob = assets.recordBlobFromBytes(new TextEncoder().encode('source'), 'text/plain')
      const derived = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const created = assets.createDerivedAssetRevisionInAuthorityTransaction(context, {
          assetId: 'asset:derived', assetRevisionId: 'revision:derived', assetKind: 'file', filename: 'source.txt',
          parentAssetRevisionId: source.assetRevisionId.value, conversionKind: 'plain_text',
          conversionContractId: 'starverse-dfc-text-v1', conversionRevision: '1', blob: derivedBlob,
        })
        db.prepare(`INSERT INTO dfc_conversion_output_v2 (
          derived_asset_revision_id, source_asset_revision_id, target_kind, converter_contract_id,
          converter_revision, conversion_settings_digest, warnings_json, created_at_ms
        ) VALUES (?, ?, 'markdown', 'starverse-dfc-text-v1', '1', ?, '[]', 10)`).run(
          created.assetRevisionId.value, source.assetRevisionId.value, '0'.repeat(64),
        )
        return created
      })

      const initial = drafts.getOrCreate('conversation:1')
      const attached = drafts.addAttachment({
        conversationId: 'conversation:1', expectedRevision: initial.revision,
        attachment: {
          kind: 'managed_file', assetId: source.assetId.value, assetRevisionId: source.assetRevisionId.value,
          assetSha256: source.blob.sha256.value, include: true, sendAs: 'provider_file', conversion: 'none',
        },
      })
      const orphanDerived = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context =>
        assets.createDerivedAssetRevisionInAuthorityTransaction(context, {
          assetId: 'asset:orphan-derived', assetRevisionId: 'revision:orphan-derived', assetKind: 'file', filename: 'orphan.txt',
          parentAssetRevisionId: source.assetRevisionId.value, conversionKind: 'plain_text',
          conversionContractId: 'starverse-dfc-text-v1', conversionRevision: '1', blob: derivedBlob,
        }))
      expect(() => drafts.setDfcSelection({
        conversationId: 'conversation:1', expectedRevision: attached.revision,
        sourceAssetRevisionId: source.assetRevisionId.value, selectedOptionId: 'dfc:plain_text:orphan',
        targetKind: 'plain_text', sendStrategy: 'text_in_prompt', effectiveAssetId: orphanDerived.assetId.value,
        effectiveAssetRevisionId: orphanDerived.assetRevisionId.value, effectiveAssetSha256: orphanDerived.blob.sha256.value,
      })).toThrow('GENERATION_V2_DRAFT_DFC_PROVENANCE_INVALID')
      const selected = drafts.setDfcSelection({
        conversationId: 'conversation:1', expectedRevision: attached.revision,
        sourceAssetRevisionId: source.assetRevisionId.value, selectedOptionId: 'dfc:markdown:revision:derived',
        targetKind: 'markdown', sendStrategy: 'text_in_prompt', effectiveAssetId: derived.assetId.value,
        effectiveAssetRevisionId: derived.assetRevisionId.value, effectiveAssetSha256: derived.blob.sha256.value,
      })

      expect(selected.attachments).toHaveLength(1)
      expect(selected.attachments[0]).toMatchObject({
        kind: 'managed_file', assetId: source.assetId.value, assetRevisionId: source.assetRevisionId.value,
        dfcSelection: {
          targetKind: 'markdown', sendStrategy: 'text_in_prompt', effectiveAssetId: derived.assetId.value,
          effectiveAssetRevisionId: derived.assetRevisionId.value, effectiveAssetSha256: derived.blob.sha256.value,
        },
      })

      seedEditRoute(db)
      const withText=drafts.updateText({conversationId:'conversation:1',expectedRevision:selected.revision,
        draftText:'original unsent compose',draftMode:'compose',editingSourceQuestionId:null})
      const previous=drafts.addUrlReference({conversationId:'conversation:1',expectedRevision:withText.revision,
        referenceId:'url:previous',referenceRevision:'url-revision:previous',originalUrl:'https://example.test/previous.pdf',
        mediaKind:'document',declaredMediaType:'application/pdf'})
      const editing=drafts.openEdit({conversationId:'conversation:1',branchId:'branch:1',expectedRevision:previous.revision,
        questionId:'question:1',answerRootId:'answer:1',draftText:'edited historical question',attachments:[]})
      expect(editing.attachments).toEqual([])
      expect(editing.editSession?.previousDraft).toEqual({draftText:previous.draftText,attachments:previous.attachments})
      expect(()=>assets.retireAsset(source.assetId.value)).toThrow('GENERATION_V2_DRAFT_EDIT_SNAPSHOT_ASSET_RETAINED')
      expect(()=>assets.retireAsset(derived.assetId.value)).toThrow('GENERATION_V2_DRAFT_EDIT_SNAPSHOT_ASSET_RETAINED')
      expect(()=>db.prepare('DELETE FROM asset_revision_v2 WHERE asset_revision_id=?').run(source.assetRevisionId.value)).toThrow()
      const restarted=new ComposerDraftV2Repo(db,()=>11)
      expect(restarted.read('conversation:1').editSession).toEqual(editing.editSession)
      const restored=restarted.cancelEdit({conversationId:'conversation:1',branchId:'branch:1',expectedRevision:editing.revision,
        questionId:'question:1',answerRootId:'answer:1',openedDraftRevision:editing.editSession!.openedDraftRevision})
      expect(restored).toMatchObject({draftText:previous.draftText,draftMode:'compose',editingSourceQuestionId:null,editSession:null})
      expect(restored.attachments).toEqual(previous.attachments)
      expect(db.prepare('SELECT * FROM composer_edit_session_attachment_v2').all()).toEqual([])

      const cleared = drafts.removeAttachment({
        conversationId: 'conversation:1', expectedRevision: restored.revision,
        attachmentRevisionId: source.assetRevisionId.value,
      })
      expect(cleared.attachments).toHaveLength(1)
      expect(db.prepare('SELECT * FROM composer_draft_dfc_selection_v2').all()).toEqual([])
    } finally {
      db.close()
    }
  })
})

describe('ComposerDraftV2Repo scoped edit aggregate',()=>{
  it('assigns distinct server-owned draft revisions when the same edit target is cancelled and reopened',()=>{
    const db=createDb()
    try {
      seedEditRoute(db)
      const drafts=new ComposerDraftV2Repo(db,()=>10)
      const initial=drafts.getOrCreate('conversation:1')
      const target={conversationId:'conversation:1',branchId:'branch:1',questionId:'question:1',answerRootId:'answer:1'}
      const first=drafts.openEdit({...target,expectedRevision:initial.revision,draftText:'first edit',attachments:[]})
      expect(first.editSession?.openedDraftRevision).toBe(initial.revision+1)
      const oldIdentity={branchId:target.branchId,questionId:target.questionId,answerRootId:target.answerRootId,
        openedDraftRevision:first.editSession!.openedDraftRevision}
      const cancelled=drafts.cancelEdit({...target,expectedRevision:first.revision,openedDraftRevision:oldIdentity.openedDraftRevision})
      const reopened=drafts.openEdit({...target,expectedRevision:cancelled.revision,draftText:'second edit',attachments:[]})
      expect(reopened.editSession?.openedDraftRevision).toBe(cancelled.revision+1)
      expect(reopened.editSession?.openedDraftRevision).not.toBe(first.editSession?.openedDraftRevision)
      expect(new ComposerDraftV2Repo(db).read('conversation:1').editSession?.openedDraftRevision)
        .toBe(reopened.editSession?.openedDraftRevision)
      expect(()=>drafts.updateText({conversationId:'conversation:1',expectedRevision:reopened.revision,draftText:'late first edit',
        draftMode:'edit',editingSourceQuestionId:'question:1',editSessionIdentity:oldIdentity}))
        .toThrow('GENERATION_V2_DRAFT_STATE_INVALID')
      expect(()=>drafts.cancelEdit({...target,expectedRevision:reopened.revision,openedDraftRevision:oldIdentity.openedDraftRevision}))
        .toThrow('GENERATION_V2_DRAFT_STATE_INVALID')
      expect(drafts.read('conversation:1')).toEqual(reopened)
      const currentIdentity={...oldIdentity,openedDraftRevision:reopened.editSession!.openedDraftRevision}
      expect(()=>drafts.updateText({conversationId:'conversation:1',expectedRevision:reopened.revision,draftText:'wrong answer',
        draftMode:'edit',editingSourceQuestionId:'question:1',editSessionIdentity:{...currentIdentity,answerRootId:'answer:other'}}))
        .toThrow('GENERATION_V2_DRAFT_STATE_INVALID')
      const updated=drafts.updateText({conversationId:'conversation:1',expectedRevision:reopened.revision,draftText:'current edit update',
        draftMode:'edit',editingSourceQuestionId:'question:1',editSessionIdentity:currentIdentity})
      expect(updated.editSession?.openedDraftRevision).toBe(reopened.editSession?.openedDraftRevision)
    }finally{db.close()}
  })

  it('keeps a previous-only asset FK alive until the edit aggregate is explicitly cleared',()=>{
    const db=createDb()
    try {
      seedEditRoute(db)
      const assets=new AttachmentAssetV2Repo(db,()=>10)
      assets.createAsset({assetId:'asset:previous-only',assetKind:'file',filename:'previous.txt',sourceKind:'user_import'})
      const source=assets.appendSourceRevision({assetId:'asset:previous-only',assetRevisionId:'revision:previous-only',
        blob:assets.recordBlobFromBytes(new TextEncoder().encode('previous-only'),'text/plain')})
      const drafts=new ComposerDraftV2Repo(db,()=>10)
      const initial=drafts.getOrCreate('conversation:1')
      const previous=drafts.addAttachment({conversationId:'conversation:1',expectedRevision:initial.revision,
        attachment:{kind:'managed_file',assetId:source.assetId.value,assetRevisionId:source.assetRevisionId.value,
          assetSha256:source.blob.sha256.value,include:true,sendAs:'provider_file',conversion:'none'}})
      const editing=drafts.openEdit({conversationId:'conversation:1',branchId:'branch:1',expectedRevision:previous.revision,
        questionId:'question:1',answerRootId:'answer:1',draftText:'edit',attachments:[]})
      expect(editing.attachments).toEqual([])
      expect(()=>assets.retireAsset(source.assetId.value)).toThrow('GENERATION_V2_DRAFT_EDIT_SNAPSHOT_ASSET_RETAINED')
      // Isolate the new FK from the pre-existing global immutability guard.
      // FK enforcement stays enabled throughout this isolated database test.
      const guard=db.prepare("SELECT sql FROM sqlite_master WHERE name='trg_asset_revision_v2_delete_guard'").get() as {sql:string}
      db.exec('DROP TRIGGER trg_asset_revision_v2_delete_guard')
      expect(()=>db.prepare('DELETE FROM asset_revision_v2 WHERE asset_revision_id=?').run(source.assetRevisionId.value))
        .toThrow('FOREIGN KEY constraint failed')
      drafts.clearCommitted({conversationId:'conversation:1',expectedRevision:editing.revision})
      expect(db.prepare('DELETE FROM asset_revision_v2 WHERE asset_revision_id=?').run(source.assetRevisionId.value).changes).toBe(1)
      db.exec(guard.sql)
      expect(db.pragma('foreign_keys',{simple:true})).toBe(1)
      expect(db.pragma('foreign_key_check')).toEqual([])
    }finally{db.close()}
  })

  it('persists the selected inherited branch and rejects another scope or nested edit',()=>{
    const db=createDb()
    try {
      seedEditRoute(db)
      db.prepare(`INSERT INTO branch_v2 VALUES('branch:inherited','conversation:1','answer:1',NULL,4,4,NULL,'branch:1')`).run()
      db.prepare(`INSERT INTO branch_v2 VALUES('branch:empty','conversation:1',NULL,NULL,4,4,NULL,NULL)`).run()
      const drafts=new ComposerDraftV2Repo(db,()=>10)
      const initial=drafts.getOrCreate('conversation:1')
      expect(()=>drafts.openEdit({conversationId:'conversation:1',branchId:'branch:empty',expectedRevision:initial.revision,
        questionId:'question:1',answerRootId:'answer:1',draftText:'edit',attachments:[]})).toThrow('GENERATION_V2_DRAFT_INPUT_INVALID')
      const editing=drafts.openEdit({conversationId:'conversation:1',branchId:'branch:inherited',expectedRevision:initial.revision,
        questionId:'question:1',answerRootId:'answer:1',draftText:'edit',attachments:[]})
      expect(editing.editSession?.branchId).toBe('branch:inherited')
      expect(()=>drafts.openEdit({conversationId:'conversation:1',branchId:'branch:inherited',expectedRevision:editing.revision,
        questionId:'question:1',answerRootId:'answer:1',draftText:'nested',attachments:[]})).toThrow('GENERATION_V2_DRAFT_STATE_INVALID')
      expect(()=>drafts.cancelEdit({conversationId:'conversation:1',branchId:'branch:1',expectedRevision:editing.revision,
        questionId:'question:1',answerRootId:'answer:1',openedDraftRevision:editing.editSession!.openedDraftRevision})).toThrow('GENERATION_V2_DRAFT_STATE_INVALID')
      expect(()=>drafts.updateText({conversationId:'conversation:1',expectedRevision:editing.revision,
        draftText:'late compose',draftMode:'compose',editingSourceQuestionId:null})).toThrow('GENERATION_V2_DRAFT_STATE_INVALID')
      expect(()=>drafts.replace({conversationId:'conversation:1',expectedRevision:editing.revision,
        draftText:'generic compose replacement',draftMode:'compose',editingSourceQuestionId:null,attachments:[]}))
        .toThrow('GENERATION_V2_DRAFT_STATE_INVALID')
      expect(drafts.read('conversation:1')).toEqual(editing)
      const cleared=drafts.clearCommitted({conversationId:'conversation:1',expectedRevision:editing.revision})
      expect(cleared).toMatchObject({draftText:'',draftMode:'compose',editSession:null})
    }finally{db.close()}
  })

  it('rolls back session capture/replacement and failed cancellation without losing compose or edit state',()=>{
    const db=createDb()
    try {
      seedEditRoute(db)
      const drafts=new ComposerDraftV2Repo(db,()=>10)
      const initial=drafts.getOrCreate('conversation:1')
      const previous=drafts.updateText({conversationId:'conversation:1',expectedRevision:initial.revision,
        draftText:'compose retained',draftMode:'compose',editingSourceQuestionId:null})
      db.exec(`CREATE TEMP TRIGGER edit_open_failure BEFORE UPDATE OF draft_mode ON composer_draft_v2
        WHEN NEW.draft_mode='edit' BEGIN SELECT RAISE(ABORT,'TEST_EDIT_OPEN_FAILURE'); END`)
      expect(()=>drafts.openEdit({conversationId:'conversation:1',branchId:'branch:1',expectedRevision:previous.revision,
        questionId:'question:1',answerRootId:'answer:1',draftText:'edit',attachments:[]})).toThrow('TEST_EDIT_OPEN_FAILURE')
      expect(drafts.read('conversation:1')).toEqual(previous)
      expect(db.prepare('SELECT * FROM composer_edit_session_v2').all()).toEqual([])
      db.exec('DROP TRIGGER edit_open_failure')
      const editing=drafts.openEdit({conversationId:'conversation:1',branchId:'branch:1',expectedRevision:previous.revision,
        questionId:'question:1',answerRootId:'answer:1',draftText:'edit',attachments:[]})
      db.exec(`CREATE TEMP TRIGGER edit_cancel_failure BEFORE UPDATE OF draft_mode ON composer_draft_v2
        WHEN NEW.draft_mode='compose' BEGIN SELECT RAISE(ABORT,'TEST_EDIT_CANCEL_FAILURE'); END`)
      expect(()=>drafts.cancelEdit({conversationId:'conversation:1',branchId:'branch:1',expectedRevision:editing.revision,
        questionId:'question:1',answerRootId:'answer:1',openedDraftRevision:editing.editSession!.openedDraftRevision})).toThrow('TEST_EDIT_CANCEL_FAILURE')
      expect(drafts.read('conversation:1')).toEqual(editing)
      expect(()=>drafts.cancelEdit({conversationId:'conversation:1',branchId:'branch:1',expectedRevision:previous.revision,
        questionId:'question:1',answerRootId:'answer:1',openedDraftRevision:editing.editSession!.openedDraftRevision})).toThrow('GENERATION_V2_DRAFT_CONFLICT')
    }finally{db.close()}
  })
})

describe('ComposerDraftV2Repo corrupt attachment rows',()=>{
  it('keeps the draft readable when one attachment row cannot be decoded, and reports it',()=>{
    const db=createDb()
    try {
      const drafts=new ComposerDraftV2Repo(db,()=>10)
      const initial=drafts.getOrCreate('conversation:1')
      const first=drafts.addUrlReference({conversationId:'conversation:1',expectedRevision:initial.revision,
        referenceId:'url:good',referenceRevision:'url-revision:good',originalUrl:'https://example.test/good.pdf',
        mediaKind:'document',declaredMediaType:'application/pdf'})
      const second=drafts.addUrlReference({conversationId:'conversation:1',expectedRevision:first.revision,
        referenceId:'url:bad',referenceRevision:'url-revision:bad',originalUrl:'https://example.test/bad.pdf',
        mediaKind:'document',declaredMediaType:'application/pdf'})
      expect(second.attachments).toHaveLength(2)
      // The stored digest no longer matches the stored URL: this row fails its integrity check on decode.
      db.pragma('ignore_check_constraints = ON')
      db.exec('DROP TRIGGER IF EXISTS url_attachment_reference_v2_no_update')
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='url_attachment_reference_v2'").all() as {name:string}[]) db.exec('DROP TRIGGER "'+name+'"')
      db.prepare("UPDATE url_attachment_reference_v2 SET url_digest=? WHERE reference_id='url:bad'").run('0'.repeat(64))
      const read=drafts.read('conversation:1')
      expect(read.attachments.map(entry=>entry.kind==='url_reference'?entry.referenceId:'')).toEqual(['url:good'])
      expect(read.unreadableAttachmentCount).toBe(1)
      expect(db.prepare('SELECT COUNT(*) AS n FROM composer_draft_attachment_v2').get()).toEqual({n:2})
    } finally { db.close() }
  })
})
