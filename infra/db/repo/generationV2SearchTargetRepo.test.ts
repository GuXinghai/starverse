import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { ConversationGraphV2Repo } from './conversationGraphV2Repo'
import { ConversationReadV2Repo } from './conversationReadV2Repo'
import { ConversationWorkspaceV2Repo } from './conversationWorkspaceV2Repo'
import { GenerationExecutionV2Repo } from './generationExecutionV2Repo'
import { GenerationV2SearchRepo } from './generationV2SearchRepo'
import { GenerationV2SearchTargetRepo, type GenerationV2SearchTargetResult } from './generationV2SearchTargetRepo'
import { SystemChatTemplateV2Repo } from './systemChatTemplateV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'
import { canonicalizeUnverifiedRuntimeCapabilitySnapshotV2, decodeRuntimeCapabilitySnapshotV2 } from '../../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../../src/next/generation-v2/capability/modelCapabilitySchemaV2'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { readReviewedDeepSeekStableChatDefinitionV2 } from '../../../src/next/generation-v2/contracts/providerContractRegistryV2'
import { registerGenerationV2WorkspaceIpc } from '../../../electron/ipc/generationV2WorkspaceIpc'
import type { IpcInvokeHandler } from '../../../electron/ipc/types'

const hash = 'a'.repeat(64), contract = readReviewedDeepSeekStableChatDefinitionV2()
const binding = { credentialScopeId:'credential:synthetic', providerId:'deepseek', endpointProfileId:'profile:deepseek',
  endpointBinding:{kind:'provider_managed_set',endpointSetRevision:'endpoint-set:1',descriptors:[{endpointId:'endpoint:deepseek',descriptorRevision:'descriptor:1'}]},
  protocolContractId:contract.protocolContractId.value,contractRevision:contract.contractRevision.value,
  contractDefinitionDigest:contract.definitionDigest.value,registryRevision:contract.registryRevision.value,modelId:'deepseek-chat',operation:'text' }
const capability = decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({schemaVersion:2,
  resolvedAt:'2026-10-03T00:00:00.000Z',binding,evidence:[{evidenceId:'test.search',kind:'official_documentation',effect:'supports',
    sourceRef:'https://api-docs.deepseek.com/api/create-chat-completion',verifiedAt:'2026-10-03T00:00:00.000Z',contentDigest:hash}],
  fields:MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path=>({path,state:'missing',constraints:[],evidenceIds:[]})),tools:[],
  continuation:{kind:'none',evidenceIds:['test.search']}}))

/** Actual graph/execution/snapshot/read/search repositories; bounded synthetic request facts, no transport. */
function fixture(count=2) {
  const db=new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db,path.resolve(process.cwd()))
  const graph=new ConversationGraphV2Repo(db),workspace=new ConversationWorkspaceV2Repo(db),execution=new GenerationExecutionV2Repo(db)
  const authority=<T>(fn:Parameters<typeof runGenerationV2AuthorityTransactionOnOwnedConnectionV2<T>>[1])=>runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db,fn)
  db.prepare('INSERT INTO runtime_capability_snapshot_v2 VALUES(?,?,2,?,?,?,1)').run(capability.snapshotHash.value,
    capability.revision.value,capability.canonicalJson,capability.evidenceDigest.value,capability.semanticFieldsDigest.value)
  authority(context=>{
    graph.createProject(context,{projectId:'project:1',name:'Project',createdAtMs:1})
    graph.createConversationAndDefaultBranch(context,{projectId:'project:1',conversationId:'conversation:1',branchId:'branch:root',title:'Search conversation',branchName:null,createdAtMs:2})
  })
  let serial=0,clock=2
  function turn(branchId='branch:root') {
    const index=++serial,at=clock+=10,questionId=`question:${index}`,answerRootId=`answer:${index}`,operationId=`operation:${index}`
    const head=db.prepare('SELECT head_message_id AS head FROM branch_v2 WHERE branch_id=?').get(branchId) as {head:string|null}
    const snapshot=decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({schemaVersion:2,answerRootId,operationId,
      semanticIntent:{schemaVersion:2,generation:{},reasoning:{mode:'disabled'},web:{mode:'disabled'},image:{mode:'disabled'},tools:{mode:'disabled'},attachments:[],providerExtension:{kind:'none'}},
      resolvedConfigRevisions:[{ownerKind:'global',ownerId:'global',revision:'config:global:1'},{ownerKind:'project',ownerId:'project:1',revision:'config:project:1'},
        {ownerKind:'conversation',ownerId:'conversation:1',revision:'config:conversation:1'}],providerBinding:binding,
      capabilityBinding:{capabilityRevision:capability.revision.value,evidenceDigest:capability.evidenceDigest.value,
        semanticFieldsDigest:capability.semanticFieldsDigest.value,snapshotHash:capability.snapshotHash.value},attachmentProviderFileBindings:[],toolAuthority:{kind:'none'}}))
    authority(context=>{
      const pending=graph.beginInitialTurn(context,{operationId,branchId,expectedHeadMessageId:head.head,questionId,answerRootId,userBody:`needle${index} question`,createdAtMs:at})
      const committed=execution.insertOperationAndSnapshot(context,{operationId,actionKind:'initial_send',branchId,conversationId:'conversation:1',questionId,
        sourceAnswerId:null,targetAnswerId:answerRootId,snapshot:snapshot.canonicalJson,commandFingerprint:hash,createdAtMs:at})
      graph.commitInitialTurnProjection(context,pending)
      db.prepare(`INSERT INTO generation_request_v2(operation_id,request_sequence,answer_root_id,snapshot_hash,provider_id,endpoint_profile_id,
        credential_scope_id,contract_id,model_id,effective_endpoint_id,capability_revision,compiler_ledger_json,compiler_ledger_hash,
        prepared_body_sha256,prepared_body_byte_length,state,created_at_ms,updated_at_ms)
        VALUES(?,1,?,?,'deepseek','profile:deepseek','credential:synthetic','deepseek-stable-chat-v1','deepseek-chat','endpoint:deepseek',?,'[]',?,?,2,'prepared',?,?)`)
        .run(operationId,answerRootId,snapshot.snapshotHash.value,capability.revision.value,hash,hash,at,at)
      graph.terminalizeAssistantMessage(context,answerRootId,'completed',`answerneedle${index}`,at+1)
      db.prepare(`UPDATE generation_request_v2 SET state='cancelled',updated_at_ms=?,terminal_at_ms=? WHERE operation_id=?`).run(at+1,at+1,operationId)
      execution.terminalizeOperation(context,committed.bundle,{state:'cancelled',errorCode:'GENERATION_V2_CANCELLED',errorMessage:'Synthetic transport absent'},at+1)
    })
    return {questionId,answerRootId,operationId}
  }
  for(let index=0;index<count;index++) turn()
  function fork(branchId:string,headMessageId=`answer:${serial}`,sourceBranchId='branch:root') {
    authority(context=>workspace.forkBranch(context,{sourceBranchId,branchId,headMessageId,name:null,createdAtMs:clock+=2}))
  }
  const repo=new GenerationV2SearchTargetRepo(db)
  function target(messageId:string,preferredBranchId:string|null=null,limit=50) {return repo.read({messageId,preferredBranchId,limit})}
  function hit(query:string,id:string) {
    const result=new GenerationV2SearchRepo(db).query({q:query,scope:{projectName:false,convoName:false,convoContent:true}}).find(hit=>hit.entityId===id)
    expect(result).toBeDefined(); return result!
  }
  return {db,graph,workspace,authority,turn,fork,target,hit,close:()=>db.close()}
}
function ready(result:GenerationV2SearchTargetResult) {
  expect(result.status).toBe('ready')
  if(result.status!=='ready') throw new Error('Expected exact ready target')
  return result
}

describe('GenerationV2SearchTargetRepo exact visible search projection',()=>{
  it('opens actual indexed old question and answer hits beyond the newest 50 turns without writes',()=>{
    const f=fixture(55)
    try {
      expect(new ConversationReadV2Repo(f.db).readBranch('branch:root').turns.some(turn=>turn.questionId==='question:1')).toBe(false)
      const before=f.db.prepare('SELECT total_changes() AS n').get()
      for(const [query,id] of [['needle1','question:1'],['answerneedle1','answer:1']]) {
        const resolved=ready(f.target(f.hit(query,id).entityId))
        expect(resolved).toMatchObject({messageId:id,branchId:'branch:root',projectId:'project:1'})
        expect(resolved.view.turns).toHaveLength(1)
        expect(resolved.view.turns[0]).toMatchObject({questionId:'question:1',chosenAnswerRootId:'answer:1'})
      }
      expect(f.db.prepare('SELECT total_changes() AS n').get()).toEqual(before)
      expect(f.db.pragma('foreign_key_check')).toEqual([])
    } finally {f.close()}
  })
  it('uses a successor cursor at limit 1, including a hidden successor, and null for the final turn',()=>{
    const f=fixture(3)
    try {
      f.db.prepare(`INSERT INTO branch_question_hide_v2 VALUES('branch:root','conversation:1','question:2',100)`).run()
      expect(ready(f.target('question:1',null,1)).view.turns.map(turn=>turn.questionId)).toEqual(['question:1'])
      expect(ready(f.target('answer:3',null,1)).view.turns.map(turn=>turn.questionId)).toEqual(['question:3'])
      expect(f.target('question:2')).toEqual({status:'unavailable',reason:'no_visible_route'})
    } finally {f.close()}
  })
  it('prefers an eligible inherited branch and otherwise chooses ascending IDs independent of branch-page caps',()=>{
    const f=fixture()
    try {
      f.fork('branch:zz-visible')
      for(let i=0;i<52;i++) f.fork(`branch:empty:${String(i).padStart(2,'0')}`,'answer:1')
      expect(new ConversationReadV2Repo(f.db).listBranchPage('conversation:1').items.map(item=>item.branchId)).not.toContain('branch:zz-visible')
      expect(ready(f.target('question:2','branch:zz-visible')).branchId).toBe('branch:zz-visible')
      expect(ready(f.target('question:2','branch:empty:00')).branchId).toBe('branch:root')
      f.fork('branch:a-visible')
      expect(ready(f.target('answer:2','branch:missing')).branchId).toBe('branch:a-visible')
    } finally {f.close()}
  })
  it('finds an alternate question branch without substituting the preferred route target',()=>{
    const f=fixture()
    try {
      f.fork('branch:alternate','answer:1')
      const alternate=f.turn('branch:alternate')
      const hit=f.hit('needle3',alternate.questionId)
      const resolved=ready(f.target(hit.entityId,'branch:root',1))
      expect(resolved.branchId).toBe('branch:alternate')
      expect(resolved.view.turns.map(turn=>turn.questionId)).toEqual([alternate.questionId])
    } finally {f.close()}
  })
  it('keeps a sibling eligible when the target is hidden only on the preferred route',()=>{
    const f=fixture()
    try {
      f.fork('branch:a-hidden'); f.fork('branch:b-visible')
      f.db.prepare(`INSERT INTO branch_question_hide_v2 VALUES('branch:a-hidden','conversation:1','question:1',2000)`).run()
      expect(ready(f.target('answer:1','branch:a-hidden')).branchId).toBe('branch:b-visible')
      f.db.prepare(`INSERT INTO branch_question_hide_v2 VALUES('branch:root','conversation:1','question:1',2001)`).run()
      expect(f.target('answer:1')).toEqual({status:'unavailable',reason:'no_visible_route'})
    } finally {f.close()}
  })
  it('resolves a live descendant through a soft-deleted introduction branch',()=>{
    const f=fixture()
    try {
      f.fork('branch:child','answer:1')
      f.authority(context=>f.workspace.deleteBranch(context,{branchId:'branch:root',deletedAtMs:2000}))
      expect(ready(f.target('answer:1','branch:root')).branchId).toBe('branch:child')
      expect(f.target('answer:2')).toEqual({status:'unavailable',reason:'no_visible_route'})
    } finally {f.close()}
  })
  it('rechecks current project after relocation of a previously indexed hit',()=>{
    const f=fixture()
    try {
      const old=f.hit('needle1','question:1')
      f.authority(context=>{
        f.graph.createProject(context,{projectId:'project:2',name:'Destination',createdAtMs:2000})
        f.workspace.moveConversation(context,{conversationId:'conversation:1',projectId:'project:2',updatedAtMs:2001})
      })
      expect(old.projectId).toBe('project:1')
      expect(ready(f.target(old.entityId))).toMatchObject({projectId:'project:2',view:{projectId:'project:2'}})
    } finally {f.close()}
  })
  it('excludes the persisted hidden system-template conversation even with an indexed target',()=>{
    const f=fixture()
    try {
      f.authority(context=>new SystemChatTemplateV2Repo(f.db,()=>100).ensure(context,{projectId:'project:1',conversationId:'conversation:template',branchId:'branch:template',createdAtMs:100}))
      f.db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
        VALUES('question:template','conversation:template','branch:template','user','completed',NULL,NULL,NULL,1,101,101)`).run()
      f.db.prepare(`UPDATE message_body_v2 SET body_text='hiddenneedle' WHERE message_id='question:template'`).run()
      expect(f.target(f.hit('hiddenneedle','question:template').entityId)).toEqual({status:'unavailable',reason:'conversation_hidden'})
    } finally {f.close()}
  })
  it('returns explicit unavailable for missing, nonroot assistant and system rows',()=>{
    const f=fixture()
    try {
      const insert=f.db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
        VALUES(?,'conversation:1','branch:root',?,'completed',?,?,?, ?,100,100)`)
      insert.run('answer:nonroot','assistant','answer:1','question:1','answer:1',5)
      insert.run('system:1','system',null,null,null,6)
      insert.run('answer:unchosen','assistant','question:1','question:1','answer:unchosen',7)
      f.db.prepare(`UPDATE message_body_v2 SET body_text='unchosenneedle' WHERE message_id='answer:unchosen'`).run()
      expect(f.target(f.hit('unchosenneedle','answer:unchosen').entityId)).toEqual({status:'unavailable',reason:'no_visible_route'})
      for(const id of ['answer:nonroot','system:1']) expect(f.target(id)).toEqual({status:'unavailable',reason:'message_unsupported'})
      expect(f.target('message:missing')).toEqual({status:'unavailable',reason:'message_missing'})
    } finally {f.close()}
  })
  it('fails closed for an invalid route and for route membership without required request projection',()=>{
    const f=fixture(0)
    try {
      // Valid graph rows deliberately lack operation/snapshot/request projection: membership is insufficient.
      f.db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
        VALUES('question:raw','conversation:1','branch:root','user','completed',NULL,NULL,NULL,1,10,10),
          ('answer:raw','conversation:1','branch:root','assistant','completed','question:raw','question:raw','answer:raw',2,11,11)`).run()
      f.db.prepare(`UPDATE branch_v2 SET head_message_id='answer:raw' WHERE branch_id='branch:root'`).run()
      expect(f.target('question:raw')).toEqual({status:'unavailable',reason:'projection_unavailable'})
      f.db.prepare(`UPDATE branch_v2 SET head_message_id='question:raw' WHERE branch_id='branch:root'`).run()
      expect(f.target('answer:raw')).toEqual({status:'unavailable',reason:'no_visible_route'})
      // Injected inconsistent choice fixture: the resolver must reject it rather than infer a substitute answer.
      f.db.prepare(`INSERT INTO message_v2(message_id,conversation_id,introduced_in_branch_id,role,status,parent_message_id,question_id,answer_root_id,ordinal,created_at_ms,updated_at_ms)
        VALUES('answer:other','conversation:1','branch:root','assistant','completed','question:raw','question:raw','answer:other',3,12,12)`).run()
      f.db.prepare(`INSERT INTO branch_choice_v2 VALUES('branch:root','conversation:1','question:raw','answer:other',12)`).run()
      f.db.prepare(`UPDATE branch_v2 SET head_message_id='answer:raw' WHERE branch_id='branch:root'`).run()
      expect(f.target('answer:raw')).toEqual({status:'unavailable',reason:'no_visible_route'})
    } finally {f.close()}
  })
  it('rejects a formerly ready target after authoritative truncation or conversation deletion',()=>{
    const f=fixture()
    try {
      ready(f.target('question:1'))
      f.authority(context=>f.workspace.truncateBranchFromQuestion(context,{branchId:'branch:root',questionId:'question:1',expectedHeadMessageId:'answer:2',updatedAtMs:2000}))
      expect(f.target('question:1')).toEqual({status:'unavailable',reason:'no_visible_route'})
      f.authority(context=>f.workspace.deleteConversation(context,{conversationId:'conversation:1'}))
      expect(f.target('question:1')).toEqual({status:'unavailable',reason:'message_missing'})
    } finally {f.close()}
  })
  it('uses actual closed IPC validation and bounded ready/unavailable envelopes without mutations',async()=>{
    const f=fixture(),handlers=new Map<string,IpcInvokeHandler>(),quiesce=vi.fn()
    try {
      registerGenerationV2WorkspaceIpc({db:f.db,registerInvoke:(channel,handler)=>handlers.set(channel,handler),
        runtimeRegistry:{runWithBranchQuiesced:quiesce,runWithConversationQuiesced:quiesce,runWithProjectQuiesced:quiesce}})
      const handler=handlers.get('generation-v2:workspace:read-search-target')!
      const input={messageId:'question:1',preferredBranchId:null,limit:1},before=f.db.prepare('SELECT total_changes() AS n').get()
      expect(await handler({},input)).toMatchObject({ok:true,value:{status:'ready',messageId:'question:1',view:{turns:[{questionId:'question:1'}]}}})
      const accessor={...input}; Object.defineProperty(accessor,'messageId',{enumerable:true,get(){throw new Error('Must not invoke accessor')}})
      for(const bad of [{...input,extra:true},{messageId:'question:1',limit:1},{...input,limit:0},{...input,limit:51},{...input,preferredBranchId:undefined},accessor]) {
        expect(await handler({},bad)).toEqual({ok:false,code:'invalid'})
      }
      expect(await handler({},{...input,messageId:'missing'})).toEqual({ok:true,value:{status:'unavailable',reason:'message_missing'}})
      expect(f.db.prepare('SELECT total_changes() AS n').get()).toEqual(before)
      expect(quiesce).not.toHaveBeenCalled()
    } finally {f.close()}
  })
})
