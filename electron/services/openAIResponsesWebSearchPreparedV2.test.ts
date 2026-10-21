import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { OpenAIResponsesNativeHistoryV2Repo } from '../../infra/db/repo/openAIResponsesNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { canonicalizeUnverifiedRuntimeCapabilitySnapshotV2, decodeRuntimeCapabilitySnapshotV2 } from '../../src/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../src/core/generation-v2/capability/modelCapabilitySchemaV2'
import { getOpenAILegacyReasoningEncoderRevisionV2, isOpenAILegacyReasoningEncoderRevisionV2, resolveEncodingCoverageRegistryV2 } from '../../src/core/generation-v2/capability/encodingCoverageRegistryV2'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '../../src/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { readReviewedOpenAIResponsesDefinitionV2 } from '../../src/core/generation-v2/contracts/providerContractRegistryV2'
import { readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/core/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import { OPENAI_RESPONSES_ARTIFACT_KIND_V2 } from '../../src/core/generation-v2/providers/openai-responses/continuationArtifactV2'
import { compileOpenAIResponsesPreparedRequestV2 } from './openAIResponsesPreparedRequestCompilerV2'
import { createOpenAIResponsesPlainTextRetryCoordinatorV2 } from './openAIResponsesPlainTextRetryCoordinatorV2'
import { compileOpenAIResponsesRequestV1 } from '../../src/core/generation-v2/providers/openai-responses/responsesRequestV1'
import { ImmutablePreparedBodyV2 } from '../../src/core/generation-v2/compiler/stableSerialize'
import { issuePreparedProviderRequestV2 } from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'

const credentialScopeId=`credential-scope-v2:${'b'.repeat(64)}`
function fixture(searchContextSize:string,allowedDomains:readonly string[]|null=['example.invalid'],generation:Readonly<{temperature?:number;topP?:number}>={},persistPrepared=true,
  reasoning:Readonly<{mode:'disabled';effort?:string}>={mode:'disabled'},encoderRevision?:string) {
  const db=new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db,process.cwd())
  const profile=readVerifiedOpenAIResponsesEndpointProfileV2(),contract=readReviewedOpenAIResponsesDefinitionV2()
  const binding={credentialScopeId,providerId:'openai_responses',endpointProfileId:profile.endpointProfileId.value,
    endpointBinding:{kind:'provider_managed_set',endpointSetRevision:profile.endpointSetRevision.value,descriptors:[{endpointId:profile.descriptor.endpointId.value,descriptorRevision:profile.descriptor.descriptorRevision.value}]},
    protocolContractId:contract.protocolContractId.value,contractRevision:contract.contractRevision.value,contractDefinitionDigest:contract.definitionDigest.value,
    registryRevision:contract.registryRevision.value,modelId:'synthetic-search-model',operation:'text'}
  const covered=new Set(resolveEncodingCoverageRegistryV2({providerId:binding.providerId,protocolContractId:binding.protocolContractId,operation:'text',encoderRevision}).semanticPaths)
  const capability=decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({schemaVersion:2,resolvedAt:'2026-10-03T00:00:00.000Z',binding,
    evidence:[{evidenceId:'synthetic.supports',kind:'contract_invariant',effect:'supports',sourceRef:'test.search',verifiedAt:'2026-10-03T00:00:00.000Z',contentDigest:'a'.repeat(64)},
      {evidenceId:'synthetic.unknown',kind:'contract_invariant',effect:'unknown',sourceRef:'test.search',verifiedAt:'2026-10-03T00:00:00.000Z',contentDigest:'c'.repeat(64)}],
    fields:MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path=>({path,state:path==='web.mode'||path==='web.types'?'supported':covered.has(path)?'unknown':'missing',
      constraints:[],evidenceIds:path==='web.mode'||path==='web.types'?['synthetic.supports']:covered.has(path)?['synthetic.unknown']:[]})),tools:[],
    continuation:{kind:'client_managed_native_replay',artifactKind:OPENAI_RESPONSES_ARTIFACT_KIND_V2,supportsBranchReplay:true,supportsRestartReplay:true,evidenceIds:['synthetic.supports']}},encoderRevision))
  db.prepare('INSERT INTO runtime_capability_snapshot_v2 VALUES(?,?,2,?,?,?,1)').run(capability.snapshotHash.value,capability.revision.value,
    capability.canonicalJson,capability.evidenceDigest.value,capability.semanticFieldsDigest.value)
  const graph=new ConversationGraphV2Repo(db),execution=new GenerationExecutionV2Repo(db,()=>10),requests=new GenerationRequestV2Repo(db,()=>10)
  const snapshot=decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({schemaVersion:2,operationId:'operation:1',answerRootId:'answer:1',
    semanticIntent:{schemaVersion:2,generation,reasoning,web:{mode:'provider_search',types:['web'],searchContextSize,...(allowedDomains===null?{}:{allowedDomains})},
      image:{mode:'disabled'},tools:{mode:'disabled'},attachments:[],providerExtension:{kind:'none'}},
    resolvedConfigRevisions:[{ownerKind:'global',ownerId:'global',revision:'config:global:1'},{ownerKind:'project',ownerId:'project:1',revision:'config:project:1'},
      {ownerKind:'conversation',ownerId:'conversation:1',revision:'config:conversation:1'}],providerBinding:binding,
    capabilityBinding:{capabilityRevision:capability.revision.value,evidenceDigest:capability.evidenceDigest.value,semanticFieldsDigest:capability.semanticFieldsDigest.value,snapshotHash:capability.snapshotHash.value},
    attachmentProviderFileBindings:[],toolAuthority:{kind:'none'}}))
  const prepared=runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db,context=>{
    graph.createProject(context,{projectId:'project:1',name:'Synthetic',createdAtMs:1})
    graph.createConversationAndDefaultBranch(context,{projectId:'project:1',conversationId:'conversation:1',branchId:'branch:1',title:'Synthetic',branchName:null,createdAtMs:2})
    const pending=graph.beginInitialTurn(context,{operationId:'operation:1',branchId:'branch:1',expectedHeadMessageId:null,questionId:'question:1',answerRootId:'answer:1',userBody:'Synthetic web request',createdAtMs:10})
    const inserted=execution.insertOperationAndSnapshot(context,{operationId:'operation:1',actionKind:'initial_send',branchId:'branch:1',conversationId:'conversation:1',questionId:'question:1',sourceAnswerId:null,
      targetAnswerId:'answer:1',snapshot:snapshot.canonicalJson,commandFingerprint:'a'.repeat(64),createdAtMs:10})
    graph.commitInitialTurnProjection(context,pending)
    const history=new OpenAIResponsesNativeHistoryV2Repo(db).loadRequestHistory(context,'operation:1')
    const result=compileOpenAIResponsesPreparedRequestV2({context,execution:inserted.bundle,history,toolRegistry:null})
    if (persistPrepared) requests.createPrepared(context,inserted.bundle,result)
    return result
  })
  function cancel() {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db,context=>{
      const stored=execution.findOperationInTransaction(context,'operation:1')!
      requests.terminalize(context,requests.loadExistingForOperation(context,stored,1),'cancelled',20)
      graph.terminalizeAssistantMessage(context,'answer:1','cancelled',null,20)
      execution.terminalizeOperation(context,stored,{state:'cancelled',errorCode:'GENERATION_V2_CANCELLED',errorMessage:'Synthetic cancellation'},20)
    })
  }
  return {db,prepared,capability,cancel,close:()=>db.close()}
}

describe('actual Responses prepared web-search wire and frozen retry',()=>{
  it('lets createPrepared persist a 20–28 MiB Responses body but rejects bytes beyond 28 MiB',()=>{
    const f=fixture('medium',null,{},false)
    try {
      const withInput = (body: ImmutablePreparedBodyV2) => issuePreparedProviderRequestV2({
        operationId:f.prepared.operationId,answerRootId:f.prepared.answerRootId,requestSequence:f.prepared.requestSequence,
        providerId:f.prepared.providerId,endpointProfileId:f.prepared.endpointProfileId,credentialScopeId:f.prepared.credentialScopeId,
        contractId:f.prepared.contractId,modelId:f.prepared.modelId,effectiveEndpointId:f.prepared.effectiveEndpointId,
        endpoint:f.prepared.endpoint,headersPlan:f.prepared.headersPlan,body,ledger:f.prepared.ledger,
        capabilityRevision:f.prepared.capabilityRevision,encoderRevision:f.prepared.encoderRevision,snapshotHash:f.prepared.snapshotHash,
      })
      const large = withInput(ImmutablePreparedBodyV2.fromNativeRequest({model:'synthetic-search-model',input:'x'.repeat(21*1024*1024)}))
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(f.db,context=>{
        const execution=new GenerationExecutionV2Repo(f.db).findOperationInTransaction(context,'operation:1')!
        expect(new GenerationRequestV2Repo(f.db,()=>11).createPrepared(context,execution,large).preparedBodyByteLength)
          .toBeGreaterThan(20*1024*1024)
      })

      const tooLarge = withInput(ImmutablePreparedBodyV2.fromNativeRequest({model:'synthetic-search-model',input:'x'.repeat(29*1024*1024)}))
      expect(()=>runGenerationV2AuthorityTransactionOnOwnedConnectionV2(f.db,context=>{
        const execution=new GenerationExecutionV2Repo(f.db).findOperationInTransaction(context,'operation:1')!
        new GenerationRequestV2Repo(f.db,()=>12).createPrepared(context,execution,tooLarge)
      })).toThrow('GENERATION_V2_REQUEST_INPUT_INVALID')
      expect(f.db.prepare('SELECT count(*) AS n FROM generation_request_v2').get()).toEqual({n:1})
    } finally {f.close()}
  },30_000)
  it('encodes temperature and top-p through the V2 compiler and records their wire consumption',()=>{
    const f=fixture('medium',null,{temperature:0.4,topP:0.8})
    try {
      expect(JSON.parse(f.prepared.body.copyUtf8Text())).toMatchObject({temperature:0.4,top_p:0.8})
      const stored=f.db.prepare('SELECT compiler_ledger_json FROM generation_request_v2').get() as {compiler_ledger_json:string}
      expect(JSON.parse(stored.compiler_ledger_json)).toEqual(expect.arrayContaining([
        expect.objectContaining({path:'generation.temperature',disposition:'encoded',nativeField:'temperature'}),
        expect.objectContaining({path:'generation.topP',disposition:'encoded',nativeField:'top_p'}),
      ]))
    } finally {f.close()}
  })
  it('emits explicit none in the current compiler but preserves frozen disabled omission for revision 3',()=>{
    const current=fixture('medium',null,{},true,{mode:'disabled',effort:'none'})
    const legacyRevision=getOpenAILegacyReasoningEncoderRevisionV2('text',3)
    const legacy=fixture('medium',null,{},true,{mode:'disabled',effort:'none'},legacyRevision)
    try {
      expect(isOpenAILegacyReasoningEncoderRevisionV2(legacyRevision)).toBe(true)
      expect(legacy.prepared.encoderRevision).toBe(legacyRevision)
      expect(JSON.parse(current.prepared.body.copyUtf8Text()).reasoning).toEqual({effort:'none'})
      expect(JSON.parse(legacy.prepared.body.copyUtf8Text())).not.toHaveProperty('reasoning')
      expect(current.prepared.encoderRevision).not.toBe(legacy.prepared.encoderRevision)
    } finally {current.close();legacy.close()}
  })
  it('still rejects duplicate and malformed domains when the optional list is present',()=>{
    for(const allowedDomains of [['example.invalid','example.invalid'],['https://example.invalid/path'],['invalid domain']]) {
      expect(()=>compileOpenAIResponsesRequestV1({model:'synthetic-search-model',priorArtifact:null,
        clientItems:[{role:'user',content:[{type:'input_text',text:'Synthetic question'}]}],
        tools:[{type:'web_search',searchContextSize:'medium',allowedDomains}]})).toThrow('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    }
  })
  it('compiles the declared optional-domain omission without emitting filters',()=>{
    const f=fixture('medium',null)
    try {expect(JSON.parse(f.prepared.body.copyUtf8Text()).tools).toEqual([{type:'web_search',search_context_size:'medium'}])}
    finally {f.close()}
  })
  it.each(['low','future-context-preset'])('compiles supported domain-less types and unknown covered optional parameters (%s)',searchContextSize=>{
    const f=fixture(searchContextSize)
    try {
      const body=JSON.parse(f.prepared.body.copyUtf8Text())
      expect(body.tools).toEqual([{type:'web_search',search_context_size:searchContextSize,filters:{allowed_domains:['example.invalid']}}])
      expect(body.tools[0]).not.toHaveProperty('searchContextSize')
      expect(body.tools[0]).not.toHaveProperty('allowedDomains')
      expect(f.capability.fields.find(field=>field.path==='web.types')?.domain).toBeUndefined()
      expect(f.capability.fields.find(field=>field.path==='web.searchContextSize')?.state).toBe('unknown')
      expect(f.db.prepare('SELECT count(*) AS n FROM generation_request_v2').get()).toEqual({n:1})
    } finally {f.close()}
  })
  it('uses the actual retry coordinator and frozen source semantics after current config changes',async()=>{
    const f=fixture('low')
    try {
      f.cancel()
      const configs=new GenerationConfigV2Repo(f.db,()=>21),current=configs.getScope('conversation','conversation:1')
      configs.compareAndSetScope('conversation','conversation:1',current.configRevision.value,{schemaVersion:2,web:{mode:'provider_search',types:['web'],searchContextSize:'high',allowedDomains:['changed.invalid']}})
      const retry=createOpenAIResponsesPlainTextRetryCoordinatorV2({db:f.db,nowMs:()=>30,createAnswerId:()=> 'answer:retry',
        credentialService:{getStatus:async()=>({configured:true,revision:1,credentialScopeId})} as never})
      const result=await retry.submit({actionKind:'retry_as_new',operationId:'operation:retry',clientActionId:'operation:retry',sourceBranchId:'branch:1',
        questionId:'question:1',sourceAnswerId:'answer:1',expectedHeadMessageId:'answer:1'})
      expect(JSON.parse(result.preparedRequest.body.copyUtf8Text()).tools).toEqual(JSON.parse(f.prepared.body.copyUtf8Text()).tools)
      expect(result.preparedRequest.encoderRevision).toBe(f.prepared.encoderRevision)
      expect(result.preparedRequest.capabilityRevision).toBe(f.prepared.capabilityRevision)
      const frozen=f.db.prepare('SELECT canonical_json AS json FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?').get('answer:retry') as {json:string}
      expect(JSON.parse(frozen.json).semanticIntent.web).toEqual({mode:'provider_search',types:['web'],searchContextSize:'low',allowedDomains:['example.invalid']})
      expect(f.db.prepare('SELECT count(*) AS n FROM generation_request_v2').get()).toEqual({n:2})
      expect(f.db.pragma('foreign_key_check')).toEqual([])
    } finally {f.close()}
  })
})
