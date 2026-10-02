import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import type { IpcInvokeHandler } from './types'
import { registerGenerationV2WorkspaceIpc } from './generationV2WorkspaceIpc'
import { SystemChatTemplateV2Repo } from '../../infra/db/repo/systemChatTemplateV2Repo'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { ConversationRoutePreferenceV2Repo } from '../../infra/db/repo/conversationRoutePreferenceV2Repo'
import { canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,decodeRuntimeCapabilitySnapshotV2 } from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../src/next/generation-v2/capability/modelCapabilitySchemaV2'
import { readReviewedDeepSeekStableChatDefinitionV2 } from '../../src/next/generation-v2/contracts/providerContractRegistryV2'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,decodeAssistantAnswerGenerationSnapshotV2 } from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { registerGenerationV2ComposerIpc } from './generationV2ComposerIpc'

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId:'project:inbox',name:'Older Inbox',createdAtMs:0 })
    new SystemChatTemplateV2Repo(db,()=>0).ensure(context,{projectId:'project:inbox',
      conversationId:'conversation:template',branchId:'branch:template',createdAtMs:0})
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, {
      projectId: 'project:1',
      conversationId: 'conversation:delete',
      branchId: 'branch:delete',
      title: 'Delete',
      branchName: null,
      createdAtMs: 2,
    })
    db.prepare(`INSERT INTO branch_v2(
      branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms,parent_branch_id
    ) VALUES('branch:keep','conversation:delete',NULL,NULL,3,3,NULL,'branch:delete')`).run()
  })
  return db
}

function seedPreservedData(db:BetterSqlite3.Database) {
  db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
    question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
    VALUES('question:preserve','conversation:delete','branch:delete','user','completed',NULL,NULL,NULL,1,4,4)`).run()
  db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,
    question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
    VALUES('answer:preserve','conversation:delete','branch:delete','assistant','streaming','question:preserve','question:preserve','answer:preserve',2,5,5)`).run()
  db.prepare("UPDATE branch_v2 SET head_message_id='answer:preserve' WHERE branch_id='branch:delete'").run()
  db.prepare("UPDATE message_body_v2 SET body_text='history preserved' WHERE message_id='question:preserve'").run()
  const contract=readReviewedDeepSeekStableChatDefinitionV2()
  const binding={credentialScopeId:'credential:synthetic',providerId:'deepseek',endpointProfileId:'profile:deepseek',
    endpointBinding:{kind:'provider_managed_set',endpointSetRevision:'endpoint-set:1',descriptors:[{endpointId:'endpoint:deepseek',descriptorRevision:'descriptor:1'}]},
    protocolContractId:contract.protocolContractId.value,contractRevision:contract.contractRevision.value,
    contractDefinitionDigest:contract.definitionDigest.value,registryRevision:contract.registryRevision.value,modelId:'deepseek-chat',operation:'text'}
  const capability=decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({schemaVersion:2,
    resolvedAt:'2026-07-17T12:00:00.000Z',binding,evidence:[{evidenceId:'test.preserve',kind:'official_documentation',effect:'supports',
      sourceRef:'https://api-docs.deepseek.com/api/create-chat-completion',verifiedAt:'2026-07-17T00:00:00.000Z',contentDigest:'a'.repeat(64)}],
    fields:MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path=>({path,state:'missing',constraints:[],evidenceIds:[]})),tools:[],
    continuation:{kind:'none',evidenceIds:['test.preserve']}}))
  db.prepare('INSERT INTO runtime_capability_snapshot_v2 VALUES(?,?,2,?,?,?,1)').run(capability.snapshotHash.value,
    capability.revision.value,capability.canonicalJson,capability.evidenceDigest.value,capability.semanticFieldsDigest.value)
  const snapshot=decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({schemaVersion:2,
    answerRootId:'answer:preserve',operationId:'operation:preserve',semanticIntent:{schemaVersion:2,generation:{},reasoning:{mode:'disabled'},
      web:{mode:'disabled'},image:{mode:'disabled'},tools:{mode:'disabled'},attachments:[],providerExtension:{kind:'none'}},
    resolvedConfigRevisions:[{ownerKind:'global',ownerId:'global',revision:'config:global:1'},
      {ownerKind:'project',ownerId:'project:1',revision:'config:project:1'},
      {ownerKind:'conversation',ownerId:'conversation:delete',revision:'config:conversation:1'}],providerBinding:binding,
    capabilityBinding:{capabilityRevision:capability.revision.value,evidenceDigest:capability.evidenceDigest.value,
      semanticFieldsDigest:capability.semanticFieldsDigest.value,snapshotHash:capability.snapshotHash.value},
    attachmentProviderFileBindings:[],toolAuthority:{kind:'none'}}))
  const execution=new GenerationExecutionV2Repo(db,()=>10)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db,context=>{
    const committed=execution.insertOperationAndSnapshot(context,{operationId:'operation:preserve',actionKind:'initial_send',
      branchId:'branch:delete',conversationId:'conversation:delete',questionId:'question:preserve',sourceAnswerId:null,
      targetAnswerId:'answer:preserve',snapshot:snapshot.canonicalJson,commandFingerprint:'a'.repeat(64),createdAtMs:10})
    execution.terminalizeOperation(context,committed.bundle,{state:'cancelled',errorCode:'GENERATION_V2_CANCELLED',
      errorMessage:'Synthetic operation cancelled before request'},11)
    new ConversationRoutePreferenceV2Repo(db,()=>12).upsert(context,{conversationId:'conversation:delete',expectedRevision:0,
      selection:{schemaVersion:1,kind:'provider_model',providerId:'deepseek',modelId:'deepseek-chat'}})
  })
  const config=new GenerationConfigV2Repo(db,()=>12)
  config.compareAndSetScope('conversation','conversation:delete',config.getScope('conversation','conversation:delete').configRevision.value,
    {schemaVersion:2,generation:{temperature:0.2}})
  const assets=new AttachmentAssetV2Repo(db,()=>12)
  const sourceBlob=assets.recordBlobFromBytes(new TextEncoder().encode('# raw source'),'text/markdown')
  assets.createAsset({assetId:'asset:preserve',assetKind:'file',filename:'preserve.md',sourceKind:'user_import'})
  const source=assets.appendSourceRevision({assetId:'asset:preserve',assetRevisionId:'revision:preserve',blob:sourceBlob})
  const derivedBlob=assets.recordBlobFromBytes(new TextEncoder().encode('raw source'),'text/plain')
  const derived=runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db,context=>{
    const result=assets.createDerivedAssetRevisionInAuthorityTransaction(context,{assetId:'asset:derived',assetRevisionId:'revision:derived',
      assetKind:'file',filename:'preserve.txt',parentAssetRevisionId:source.assetRevisionId.value,conversionKind:'plain_text',
      conversionContractId:'starverse-dfc-text-v1',conversionRevision:'1',blob:derivedBlob})
    db.prepare(`INSERT INTO dfc_conversion_output_v2 VALUES(?,?,'markdown','starverse-dfc-text-v1','1',?,'[]',12)`)
      .run(result.assetRevisionId.value,source.assetRevisionId.value,'0'.repeat(64))
    return result
  })
  const drafts=new ComposerDraftV2Repo(db,()=>12)
  const initial=drafts.getOrCreate('conversation:delete')
  const withText=drafts.updateText({conversationId:'conversation:delete',expectedRevision:initial.revision,
    draftText:'unsent compose preserved',draftMode:'compose',editingSourceQuestionId:null})
  const attached=drafts.addAttachment({conversationId:'conversation:delete',expectedRevision:withText.revision,
    attachment:{kind:'managed_file',assetId:source.assetId.value,assetRevisionId:source.assetRevisionId.value,assetSha256:source.blob.sha256.value,
      include:false,sendAs:'provider_file',conversion:'none'}})
  const selected=drafts.setDfcSelection({conversationId:'conversation:delete',expectedRevision:attached.revision,sourceAssetRevisionId:source.assetRevisionId.value,
    selectedOptionId:'dfc:markdown:revision:derived',targetKind:'markdown',sendStrategy:'text_in_prompt',effectiveAssetId:derived.assetId.value,
    effectiveAssetRevisionId:derived.assetRevisionId.value,effectiveAssetSha256:derived.blob.sha256.value})
  return {draft:selected,snapshot,config:config.getScope('conversation','conversation:delete'),
    route:new ConversationRoutePreferenceV2Repo(db).get('conversation:delete')}
}

function workspaceHandlers(db:BetterSqlite3.Database) {
  const handlers=new Map<string,IpcInvokeHandler>()
  registerGenerationV2WorkspaceIpc({registerInvoke:(channel,handler)=>handlers.set(channel,handler),db,nowMs:()=>100,
    runtimeRegistry:{runWithBranchQuiesced:async(_id,action)=>action(),runWithConversationQuiesced:async(_id,action)=>action(),
      runWithProjectQuiesced:async(_id,action)=>action()}})
  return handlers
}

describe('generation V2 workspace IPC conversation deletion', () => {
  it('opens and cancels a durable edit through the real IPC contract without mutating a destination conversation',async()=>{
    const db=createDb()
    try {
      const previous=seedPreservedData(db)
      const graph=new ConversationGraphV2Repo(db)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db,context=>graph.createConversationAndDefaultBranch(context,
        {projectId:'project:1',conversationId:'conversation:B',branchId:'branch:B',title:'B',branchName:null,createdAtMs:20}))
      const drafts=new ComposerDraftV2Repo(db,()=>100)
      const initialB=drafts.getOrCreate('conversation:B')
      const draftB=drafts.updateText({conversationId:'conversation:B',expectedRevision:initialB.revision,
        draftText:'independent B draft',draftMode:'compose',editingSourceQuestionId:null})
      const handlers=new Map<string,IpcInvokeHandler>()
      const unusedIO=<T,>():T=>new Proxy({}, {get(){throw new Error('UNEXPECTED_EXTERNAL_IO')}}) as T
      type ComposerInput=Parameters<typeof registerGenerationV2ComposerIpc>[0]
      registerGenerationV2ComposerIpc({registerInvoke:(channel,handler)=>handlers.set(channel,handler),db,nowMs:()=>100,
        attachmentBlobStore:unusedIO<ComposerInput['attachmentBlobStore']>(),fileSelectionGrants:unusedIO<ComposerInput['fileSelectionGrants']>(),
        cloudFetch:unusedIO<ComposerInput['cloudFetch']>(),fileTypeDetectionService:unusedIO<ComposerInput['fileTypeDetectionService']>()})
      const opened=await handlers.get('generation-v2:composer:replace-from-answer-snapshot')?.({},{
        conversationId:'conversation:delete',branchId:'branch:delete',expectedRevision:previous.draft.revision,
        questionId:'question:preserve',answerRootId:'answer:preserve',draftText:'edited question'}) as {ok:boolean;value:ReturnType<ComposerDraftV2Repo['read']>}
      expect(opened.ok).toBe(true)
      expect(opened.value.editSession).toMatchObject({conversationId:'conversation:delete',branchId:'branch:delete',
        questionId:'question:preserve',answerRootId:'answer:preserve',previousDraft:{draftText:previous.draft.draftText}})
      const identity={branchId:'branch:delete',questionId:'question:preserve',answerRootId:'answer:preserve',
        openedDraftRevision:opened.value.editSession!.openedDraftRevision}
      await expect(handlers.get('generation-v2:composer:update-text')?.({},{conversationId:'conversation:delete',
        expectedRevision:opened.value.revision,draftText:'anonymous edit',draftMode:'edit',editingSourceQuestionId:'question:preserve',
        editSessionIdentity:null})).resolves.toEqual({ok:false,code:'GENERATION_V2_DRAFT_STATE_INVALID'})
      const updated=await handlers.get('generation-v2:composer:update-text')?.({},{conversationId:'conversation:delete',
        expectedRevision:opened.value.revision,draftText:'owned edit text',draftMode:'edit',editingSourceQuestionId:'question:preserve',
        editSessionIdentity:identity}) as {ok:boolean;value:ReturnType<ComposerDraftV2Repo['read']>}
      expect(updated).toMatchObject({ok:true,value:{draftText:'owned edit text',editSession:{openedDraftRevision:identity.openedDraftRevision}}})
      await expect(handlers.get('generation-v2:composer:cancel-edit-session')?.({},{conversationId:'conversation:delete',branchId:'branch:B',
        expectedRevision:updated.value.revision,questionId:'question:preserve',answerRootId:'answer:preserve',openedDraftRevision:identity.openedDraftRevision}))
        .resolves.toEqual({ok:false,code:'GENERATION_V2_DRAFT_STATE_INVALID'})
      const cancelled=await handlers.get('generation-v2:composer:cancel-edit-session')?.({},{conversationId:'conversation:delete',branchId:'branch:delete',
        expectedRevision:updated.value.revision,questionId:'question:preserve',answerRootId:'answer:preserve',openedDraftRevision:identity.openedDraftRevision}) as {ok:boolean;value:ReturnType<ComposerDraftV2Repo['read']>}
      expect(cancelled).toMatchObject({ok:true,value:{draftText:previous.draft.draftText,draftMode:'compose',editSession:null}})
      expect(cancelled.value.attachments).toEqual(previous.draft.attachments)
      expect(drafts.read('conversation:B')).toEqual(draftB)
    }finally{db.close()}
  })
  it('uses the older template owner consistently and protects that exact Inbox project',async()=>{
    const db=createDb()
    try {
      const handlers=workspaceHandlers(db)
      await expect(handlers.get('generation-v2:workspace:ensure-default')?.({})).resolves.toMatchObject({ok:true,
        value:{projectId:'project:inbox',conversationId:'conversation:template',branchId:'branch:template',created:false}})
      expect(new SystemChatTemplateV2Repo(db).get().conversation.projectId).toBe('project:inbox')
      await expect(handlers.get('generation-v2:workspace:delete-project')?.({},{projectId:'project:inbox'}))
        .resolves.toEqual({ok:false,code:'GENERATION_V2_WORKSPACE_SYSTEM_TEMPLATE_MUTATION_FORBIDDEN'})
      expect(db.prepare('SELECT count(*) AS count FROM project_v2').get()).toEqual({count:2})
    }finally{db.close()}
  })

  it('deletes an edited conversation and its durable draft aggregate with FK enforcement enabled',async()=>{
    const db=createDb()
    try {
      const previous=seedPreservedData(db)
      new ComposerDraftV2Repo(db,()=>100).openEdit({conversationId:'conversation:delete',branchId:'branch:delete',
        expectedRevision:previous.draft.revision,questionId:'question:preserve',answerRootId:'answer:preserve',draftText:'edit before deletion',attachments:[]})
      const handlers=workspaceHandlers(db)
      await expect(handlers.get('generation-v2:workspace:delete-conversation')?.({},{conversationId:'conversation:delete'}))
        .resolves.toEqual({ok:true,value:true})
      expect(db.prepare("SELECT 1 FROM conversation_v2 WHERE conversation_id='conversation:delete'").get()).toBeUndefined()
      expect(db.prepare("SELECT 1 FROM composer_draft_v2 WHERE conversation_id='conversation:delete'").get()).toBeUndefined()
      expect(db.prepare('SELECT * FROM composer_edit_session_v2').all()).toEqual([])
      expect(db.prepare('SELECT * FROM composer_edit_session_attachment_v2').all()).toEqual([])
      expect(db.pragma('foreign_keys',{simple:true})).toBe(1)
      expect(db.pragma('foreign_key_check')).toEqual([])
    }finally{db.close()}
  })

  it('relocates the complete conversation aggregate and search ownership without rewriting history',async()=>{
    const db=createDb()
    try {
      const previous=seedPreservedData(db)
      const handlers=workspaceHandlers(db)
      const operationBefore=db.prepare("SELECT * FROM generation_operation_v2 WHERE operation_id='operation:preserve'").get()
      const contextBefore=db.prepare("SELECT * FROM generation_context_projection_v2 WHERE operation_id='operation:preserve'").get()
      await expect(handlers.get('generation-v2:workspace:delete-project')?.({},{projectId:'project:1'})).resolves.toEqual({ok:true,value:true})
      expect(db.prepare("SELECT project_id FROM conversation_v2 WHERE conversation_id='conversation:delete'").get()).toEqual({project_id:'project:inbox'})
      expect(db.prepare("SELECT body_text FROM message_body_v2 WHERE message_id='question:preserve'").get()).toEqual({body_text:'history preserved'})
      expect(new ComposerDraftV2Repo(db).read('conversation:delete')).toEqual(previous.draft)
      expect(new GenerationConfigV2Repo(db).getScope('conversation','conversation:delete')).toEqual(previous.config)
      expect(new ConversationRoutePreferenceV2Repo(db).get('conversation:delete')).toEqual(previous.route)
      expect(new GenerationExecutionV2Repo(db).getSnapshotByAnswerRootId('answer:preserve').canonicalJson).toBe(previous.snapshot.canonicalJson)
      expect(db.prepare("SELECT * FROM generation_operation_v2 WHERE operation_id='operation:preserve'").get()).toEqual(operationBefore)
      expect(db.prepare("SELECT * FROM generation_context_projection_v2 WHERE operation_id='operation:preserve'").get()).toEqual(contextBefore)
      expect(db.prepare("SELECT DISTINCT project_id FROM generation_v2_search_fts WHERE conversation_id='conversation:delete'").all())
        .toEqual([{project_id:'project:inbox'}])
      expect(db.prepare("SELECT 1 FROM project_v2 WHERE project_id='project:1'").get()).toBeUndefined()
      expect(db.pragma('foreign_key_check')).toEqual([])
    }finally{db.close()}
  })

  it('rolls back relocation, search triggers and project deletion when the final delete fails',async()=>{
    const db=createDb()
    try {
      const previous=seedPreservedData(db)
      const handlers=workspaceHandlers(db)
      db.exec(`CREATE TEMP TRIGGER reject_project_delete BEFORE DELETE ON project_v2
        WHEN OLD.project_id='project:1' BEGIN SELECT RAISE(ABORT,'TEST_PROJECT_DELETE_FAILURE'); END`)
      await expect(handlers.get('generation-v2:workspace:delete-project')?.({},{projectId:'project:1'}))
        .resolves.toEqual({ok:false,code:'TEST_PROJECT_DELETE_FAILURE'})
      expect(db.prepare("SELECT project_id FROM conversation_v2 WHERE conversation_id='conversation:delete'").get()).toEqual({project_id:'project:1'})
      expect(new ComposerDraftV2Repo(db).read('conversation:delete')).toEqual(previous.draft)
      expect(new GenerationExecutionV2Repo(db).getSnapshotByAnswerRootId('answer:preserve').canonicalJson).toBe(previous.snapshot.canonicalJson)
      expect(db.prepare("SELECT DISTINCT project_id FROM generation_v2_search_fts WHERE conversation_id='conversation:delete'").all())
        .toEqual([{project_id:'project:1'}])
      expect(db.prepare("SELECT 1 FROM project_v2 WHERE project_id='project:1'").get()).toEqual({1:1})
      expect(db.pragma('foreign_key_check')).toEqual([])
    }finally{db.close()}
  })

  it('requires a scoped edit to close before its owned branch can be deleted',async()=>{
    const db=createDb()
    try {
      const previous=seedPreservedData(db)
      const drafts=new ComposerDraftV2Repo(db,()=>100)
      const edit=drafts.openEdit({conversationId:'conversation:delete',branchId:'branch:delete',expectedRevision:previous.draft.revision,
        questionId:'question:preserve',answerRootId:'answer:preserve',draftText:'edited',attachments:[]})
      const handlers=workspaceHandlers(db)
      await expect(handlers.get('generation-v2:workspace:delete-branch')?.({},{branchId:'branch:delete'}))
        .resolves.toEqual({ok:false,code:'GENERATION_V2_WORKSPACE_BRANCH_HAS_ACTIVE_EDIT'})
      expect(drafts.read('conversation:delete')).toEqual(edit)
      drafts.cancelEdit({conversationId:'conversation:delete',branchId:'branch:delete',expectedRevision:edit.revision,
        questionId:'question:preserve',answerRootId:'answer:preserve',openedDraftRevision:edit.editSession!.openedDraftRevision})
      await expect(handlers.get('generation-v2:workspace:delete-branch')?.({},{branchId:'branch:delete'})).resolves.toEqual({ok:true,value:true})
    }finally{db.close()}
  })
  it('quiesces the conversation before deleting it', async () => {
    const db = createDb()
    try {
      const handlers = new Map<string, IpcInvokeHandler>()
      const order: string[] = []
      registerGenerationV2WorkspaceIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler),
        db,
        runtimeRegistry: {
          runWithBranchQuiesced: async (_branchId, action) => action(),
          runWithProjectQuiesced: async (_projectId, action) => action(),
          runWithConversationQuiesced: async (conversationId, action) => {
            expect(conversationId).toBe('conversation:delete')
            expect(db.prepare('SELECT 1 FROM conversation_v2 WHERE conversation_id=?')
              .get(conversationId)).toEqual({ 1: 1 })
            order.push('abort')
            const value = await action()
            order.push('delete')
            return value
          },
        },
      })

      await expect(handlers.get('generation-v2:workspace:delete-conversation')?.({}, {
        conversationId: 'conversation:delete',
      })).resolves.toEqual({ ok: true, value: true })
      expect(order).toEqual(['abort', 'delete'])
      expect(db.prepare('SELECT 1 FROM conversation_v2 WHERE conversation_id=?')
        .get('conversation:delete')).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('preserves the conversation when quiescing fails', async () => {
    const db = createDb()
    try {
      const handlers = new Map<string, IpcInvokeHandler>()
      const runWithConversationQuiesced = vi.fn(async () => {
        throw new Error('GENERATION_V2_RUNTIME_CONVERSATION_ABORT_TIMEOUT')
      })
      registerGenerationV2WorkspaceIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler),
        db,
        runtimeRegistry: {
          runWithBranchQuiesced: async (_branchId, action) => action(),
          runWithProjectQuiesced: async (_projectId, action) => action(),
          runWithConversationQuiesced,
        },
      })

      await expect(handlers.get('generation-v2:workspace:delete-conversation')?.({}, {
        conversationId: 'conversation:delete',
      })).resolves.toEqual({
        ok: false,
        code: 'GENERATION_V2_RUNTIME_CONVERSATION_ABORT_TIMEOUT',
      })
      expect(db.prepare('SELECT 1 FROM conversation_v2 WHERE conversation_id=?')
        .get('conversation:delete')).toEqual({ 1: 1 })
    } finally {
      db.close()
    }
  })

  it('quiesces every conversation in a project before deleting the project', async () => {
    const db = createDb()
    try {
      const handlers = new Map<string, IpcInvokeHandler>()
      const order: string[] = []
      registerGenerationV2WorkspaceIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler),
        db,
        runtimeRegistry: {
          runWithBranchQuiesced: async (_branchId, action) => action(),
          runWithConversationQuiesced: async (_conversationId, action) => action(),
          runWithProjectQuiesced: async (projectId, action) => {
            expect(projectId).toBe('project:1')
            expect(db.prepare('SELECT 1 FROM project_v2 WHERE project_id=?').get(projectId)).toEqual({ 1: 1 })
            order.push('abort')
            const value = await action()
            order.push('delete')
            return value
          },
        },
      })

      await expect(handlers.get('generation-v2:workspace:delete-project')?.({}, {
        projectId: 'project:1',
      })).resolves.toEqual({ ok: true, value: true })
      expect(order).toEqual(['abort', 'delete'])
      expect(db.prepare('SELECT 1 FROM project_v2 WHERE project_id=?').get('project:1')).toBeUndefined()
      expect(db.prepare('SELECT project_id FROM conversation_v2 WHERE conversation_id=?').get('conversation:delete'))
        .toEqual({project_id:'project:inbox'})
      expect(db.prepare('SELECT branch_id FROM branch_v2 WHERE conversation_id=? ORDER BY branch_id').all('conversation:delete'))
        .toEqual([{branch_id:'branch:delete'},{branch_id:'branch:keep'}])
    } finally {
      db.close()
    }
  })

  it('quiesces the target branch before deleting it', async () => {
    const db = createDb()
    try {
      const handlers = new Map<string, IpcInvokeHandler>()
      const order: string[] = []
      registerGenerationV2WorkspaceIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler),
        db,
        runtimeRegistry: {
          runWithProjectQuiesced: async (_projectId, action) => action(),
          runWithConversationQuiesced: async (_conversationId, action) => action(),
          runWithBranchQuiesced: async (branchId, action) => {
            expect(branchId).toBe('branch:delete')
            expect(db.prepare('SELECT deleted_at_ms AS deletedAtMs FROM branch_v2 WHERE branch_id=?')
              .get(branchId)).toEqual({ deletedAtMs: null })
            order.push('abort')
            const value = await action()
            order.push('delete')
            return value
          },
        },
        nowMs: () => 10,
      })

      await expect(handlers.get('generation-v2:workspace:delete-branch')?.({}, {
        branchId: 'branch:delete',
      })).resolves.toEqual({ ok: true, value: true })
      expect(order).toEqual(['abort', 'delete'])
      expect(db.prepare('SELECT deleted_at_ms AS deletedAtMs FROM branch_v2 WHERE branch_id=?')
        .get('branch:delete')).toEqual({ deletedAtMs: 10 })
    } finally {
      db.close()
    }
  })

  it('does not truncate a branch when branch quiescing fails', async () => {
    const db = createDb()
    try {
      const handlers = new Map<string, IpcInvokeHandler>()
      const runWithBranchQuiesced = vi.fn(async () => {
        throw new Error('GENERATION_V2_RUNTIME_BRANCH_ABORT_TIMEOUT')
      })
      registerGenerationV2WorkspaceIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler),
        db,
        runtimeRegistry: {
          runWithProjectQuiesced: async (_projectId, action) => action(),
          runWithConversationQuiesced: async (_conversationId, action) => action(),
          runWithBranchQuiesced,
        },
      })

      await expect(handlers.get('generation-v2:workspace:truncate-from-question')?.({}, {
        branchId: 'branch:delete', questionId: 'question:any', expectedHeadMessageId: 'answer:any',
      })).resolves.toEqual({ ok: false, code: 'GENERATION_V2_RUNTIME_BRANCH_ABORT_TIMEOUT' })
      expect(runWithBranchQuiesced).toHaveBeenCalledWith('branch:delete', expect.any(Function))
      expect(db.prepare('SELECT head_message_id AS headMessageId FROM branch_v2 WHERE branch_id=?')
        .get('branch:delete')).toEqual({ headMessageId: null })
    } finally {
      db.close()
    }
  })
})
