import path from 'node:path'
import os from 'node:os'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { GenerationV2DfcService } from '../../electron/services/generationV2DfcService'
import { FileTypeDetectionV2Repo } from '../../infra/db/repo/fileTypeDetectionV2Repo'
import { detectBasicFileTypeV2 } from '../../infra/files/fileTypeRuntimeBoundary'
import * as docxAdapter from '../../infra/files/dfcLibreOfficePdfAdapter'
import * as docxRuntime from '../../infra/files/dfcManagedLibreOfficeRuntime'
import { Epoch2AttachmentBlobStoreV2 } from '../../electron/data-epoch/epoch2AttachmentBlobStoreV2'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from '../../electron/data-epoch/rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from '../../electron/data-epoch/rootManifestStore'
import { createEpoch2ResetJournal } from '../../electron/data-epoch/resetJournal'
import { writeEpoch2ResetJournalAtomic } from '../../electron/data-epoch/resetJournalStore'
import { acquireWin32EpochRootLease, ensureEpoch2RootAuthority } from '../../electron/data-epoch/win32EpochRootLease'
import type { DfcReadyOptionBindingV2 } from '../../src/shared/files/documentFormatConversion'
import { projectGenerationV2ComposerAttachments, type GenerationV2ComposerDraft } from '../../src/next/generation-v2/renderer/generationV2ComposerClient'
import { compileOpenAIResponsesPreparedRequestV2 } from '../../electron/services/openAIResponsesPreparedRequestCompilerV2'
import { OpenAIResponsesNativeHistoryV2Repo } from '../../infra/db/repo/openAIResponsesNativeHistoryV2Repo'
import { OpenAIResponsesFileDescriptorV2Repo } from '../../infra/db/repo/openAIResponsesFileDescriptorV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/core/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import { readReviewedOpenAIResponsesDefinitionV2 } from '../../src/core/generation-v2/contracts/providerContractRegistryV2'
import { resolveEncodingCoverageRegistryV2 } from '../../src/core/generation-v2/capability/encodingCoverageRegistryV2'
import * as preparedAuthority from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'
import { canonicalizeUnverifiedRuntimeCapabilitySnapshotV2, decodeRuntimeCapabilitySnapshotV2 } from '../../src/core/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../src/core/generation-v2/capability/modelCapabilitySchemaV2'
import { OPENAI_RESPONSES_ARTIFACT_KIND_V2 } from '../../src/core/generation-v2/providers/openai-responses/continuationArtifactV2'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '../../src/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { registerGenerationV2ComposerIpc } from '../../electron/ipc/generationV2ComposerIpc'
import type { IpcInvokeHandler } from '../../electron/ipc/types'
import type { ElectronConversionBridge } from '../../infra/files/electronConversionBridge'

afterEach(()=>vi.restoreAllMocks())

/** Real immutable asset/blob persistence under a disposable epoch root; no profile or runtime install. */
function productionFixture() {
  const root=mkdtempSync(path.join(os.tmpdir(),'sv-dfc-v2-'))
  const layout=resolveEpoch2WorkspaceLayout({appDataRoot:root,homeRoot:os.homedir(),repositoryRoot:process.cwd()})
  mkdirSync(layout.productRoot,{recursive:true})
  const lease=acquireWin32EpochRootLease(layout)
  writeEpoch2TransitionOwnershipManifestAtomic({layout,lease,manifest:createEpoch2RootManifest({layout})})
  writeEpoch2ResetJournalAtomic({layout,lease,journal:createEpoch2ResetJournal({layout,operationId:'123e4567-e89b-42d3-a456-426614174000'})})
  const blobs=new Epoch2AttachmentBlobStoreV2({layout,lease,rootAuthority:ensureEpoch2RootAuthority({layout,lease})})
  const db=database(),assets=new AttachmentAssetV2Repo(db,()=>10),drafts=new ComposerDraftV2Repo(db,()=>20)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db,context=>{
    const graph=new ConversationGraphV2Repo(db)
    graph.createProject(context,{projectId:'project:1',name:'Project',createdAtMs:1})
    graph.createConversationAndDefaultBranch(context,{projectId:'project:1',conversationId:'conversation:1',branchId:'branch:1',title:'Conversation',branchName:null,createdAtMs:2})
  })
  function addSource(name:string,mime:string,bytes:Uint8Array) {
    blobs.persist(bytes)
    const blob=assets.recordBlobFromBytes(bytes,mime)
    assets.createAsset({assetId:`asset:${name}`,assetKind:'file',filename:name,sourceKind:'user_import'})
    const source=assets.appendSourceRevision({assetId:`asset:${name}`,assetRevisionId:`revision:${name}`,blob})
    const current=drafts.getOrCreate('conversation:1')
    drafts.addAttachment({conversationId:'conversation:1',expectedRevision:current.revision,attachment:{kind:'managed_file',assetId:source.assetId.value,
      assetRevisionId:source.assetRevisionId.value,assetSha256:source.blob.sha256.value,include:true,sendAs:'provider_file',conversion:'none'}})
    const detections=new FileTypeDetectionV2Repo(db,()=>11),detected=detectBasicFileTypeV2({bytes,filename:name,declaredMime:mime,detectionTrigger:'upload'})
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db,context=>detections.createPendingInAuthorityTransaction(context,{assetRevisionId:source.assetRevisionId.value,assetSha256:source.blob.sha256.value,attemptId:`attempt:${name}`}))
    detections.completeReady({assetRevisionId:source.assetRevisionId.value,attemptId:`attempt:${name}`,revision:1,verdict:detected.verdict,staticPolicy:detected.staticPolicy})
    return source
  }
  function service(conversion:ElectronConversionBridge|null=null) {return new GenerationV2DfcService(db,blobs,()=>30,conversion,root,root)}
  function handlers(conversion:ElectronConversionBridge|null=null) {
    const registered=new Map<string,IpcInvokeHandler>()
    registerGenerationV2ComposerIpc({registerInvoke:(channel,handler)=>registered.set(channel,handler),db,attachmentBlobStore:blobs,
      fileSelectionGrants:{} as never,cloudFetch:vi.fn(async()=>{throw new Error('No transport authorized')}) as never,
      fileTypeDetectionService:{} as never,tempRoot:root,runtimesRoot:root,electronConversionBridge:conversion??undefined,nowMs:()=>30})
    return registered
  }
  return {root,db,assets,drafts,blobs,addSource,service,handlers,close(){db.close();lease.release();rmSync(root,{recursive:true,force:true})}}
}
type Fixture=ReturnType<typeof productionFixture>
const optionsInput=(assetId:string)=>({conversationId:'conversation:1',assetId,providerId:'openrouter',operation:'chat_completions' as const})
const docxMime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const pdfBytes=Buffer.from('%PDF-1.7\nsynthetic selected output A\n%%EOF')
function minimalDocxBytes(text='Synthetic DOCX input'):Buffer {
  const files=[
    ['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`],
  ]
  const localParts:Buffer[]=[],centralParts:Buffer[]=[]
  let offset=0
  for(const [filename,xml] of files) {
    const name=Buffer.from(filename),content=Buffer.from(xml),checksum=crc32(content),local=Buffer.alloc(30),central=Buffer.alloc(46)
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(checksum,14)
    local.writeUInt32LE(content.length,18);local.writeUInt32LE(content.length,22);local.writeUInt16LE(name.length,26)
    localParts.push(local,name,content)
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(checksum,16)
    central.writeUInt32LE(content.length,20);central.writeUInt32LE(content.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42)
    centralParts.push(central,name);offset+=local.length+name.length+content.length
  }
  const directory=Buffer.concat(centralParts),end=Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16)
  return Buffer.concat([...localParts,directory,end])
}
async function syntheticDocxProducer(fixture:Fixture) {
  const outputPath=path.join(fixture.root,'adapter-output.pdf')
  await writeFile(outputPath,pdfBytes)
  const runtime=vi.spyOn(docxRuntime,'resolveDfcLibreOfficePluginManagedRuntimeHandle').mockResolvedValue({ok:true,handle:{},summary:{},diagnostics:[]} as never)
  const adapter=vi.spyOn(docxAdapter,'runDfcLibreOfficeDocxToPdfAdapter').mockResolvedValue({ok:true,status:'succeeded',output:{outputPath},diagnostics:[],cleanupStatus:'not_requested'} as never)
  return {runtime,adapter}
}
function selectInput(fixture:Fixture,binding:DfcReadyOptionBindingV2) {
  return {...optionsInput(binding.sourceAssetId),expectedRevision:fixture.drafts.read('conversation:1').revision,optionId:`dfc:${binding.targetKind}:v1`,selectionBinding:binding}
}
function persistOtherOutput(fixture:Fixture,source:ReturnType<Fixture['addSource']>) {
  const bytes=Buffer.from('%PDF-1.7\nvalid later output B\n%%EOF')
  fixture.blobs.persist(bytes)
  return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(fixture.db,context=>{
    const blob=fixture.assets.recordBlobFromBytesInAuthorityTransaction(context,bytes,'application/pdf')
    const derived=fixture.assets.createDerivedAssetRevisionInAuthorityTransaction(context,{assetId:'asset:later',assetRevisionId:'revision:later',assetKind:'file',filename:'later.pdf',
      parentAssetRevisionId:source.assetRevisionId.value,conversionKind:'pdf',conversionContractId:'starverse-dfc-docx-pdf-v1',conversionRevision:'1',blob})
    fixture.db.prepare(`INSERT INTO dfc_conversion_output_v2 VALUES(?,?,'pdf_attachment','starverse-dfc-docx-pdf-v1','1',?,'[]',40)`)
      .run(derived.assetRevisionId.value,source.assetRevisionId.value,createHash('sha256').update('other valid settings').digest('hex'))
    return derived
  })
}

function preparedSend(fixture:Fixture) {
  const profile=readVerifiedOpenAIResponsesEndpointProfileV2(),contract=readReviewedOpenAIResponsesDefinitionV2()
  const binding={credentialScopeId:'credential:synthetic',providerId:'openai_responses',endpointProfileId:profile.endpointProfileId.value,
    endpointBinding:{kind:'provider_managed_set',endpointSetRevision:profile.endpointSetRevision.value,descriptors:[{endpointId:profile.descriptor.endpointId.value,descriptorRevision:profile.descriptor.descriptorRevision.value}]},
    protocolContractId:contract.protocolContractId.value,contractRevision:contract.contractRevision.value,contractDefinitionDigest:contract.definitionDigest.value,registryRevision:contract.registryRevision.value,modelId:'synthetic/docx',operation:'text'}
  const covered=new Set(resolveEncodingCoverageRegistryV2({providerId:binding.providerId,protocolContractId:binding.protocolContractId,operation:'text'}).semanticPaths)
  const capability=decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({schemaVersion:2,resolvedAt:'2026-10-03T00:00:00.000Z',binding,
    evidence:[{evidenceId:'test.dfc',kind:'official_documentation',effect:'supports',sourceRef:'https://openrouter.ai/docs',verifiedAt:'2026-10-03T00:00:00.000Z',contentDigest:'a'.repeat(64)}],
    fields:MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path=>({path,state:covered.has(path)?'supported':'missing',constraints:[],evidenceIds:covered.has(path)?['test.dfc']:[]})),tools:[],
    continuation:{kind:'client_managed_native_replay',artifactKind:OPENAI_RESPONSES_ARTIFACT_KIND_V2,supportsBranchReplay:true,supportsRestartReplay:true,evidenceIds:['test.dfc']}}))
  fixture.db.prepare('INSERT INTO runtime_capability_snapshot_v2 VALUES(?,?,2,?,?,?,1)').run(capability.snapshotHash.value,capability.revision.value,capability.canonicalJson,capability.evidenceDigest.value,capability.semanticFieldsDigest.value)
  const attachments=projectGenerationV2ComposerAttachments(fixture.drafts.read('conversation:1') as unknown as GenerationV2ComposerDraft)
  const fileDescriptors=attachments.map(attachment=>new OpenAIResponsesFileDescriptorV2Repo(fixture.db,()=>50).insertOrGet({credentialScopeId:binding.credentialScopeId,
    assetRevisionId:attachment.assetRevisionId as string,assetSha256:attachment.assetSha256 as string,fileId:'file_synthetic_pdf_A'}))
  const snapshot=decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({schemaVersion:2,answerRootId:'answer:send',operationId:'operation:send',
    semanticIntent:{schemaVersion:2,generation:{},reasoning:{mode:'disabled'},web:{mode:'disabled'},image:{mode:'disabled'},tools:{mode:'disabled'},attachments,providerExtension:{kind:'none'}},
    resolvedConfigRevisions:[{ownerKind:'global',ownerId:'global',revision:'config:global:1'},{ownerKind:'project',ownerId:'project:1',revision:'config:project:1'},{ownerKind:'conversation',ownerId:'conversation:1',revision:'config:conversation:1'}],providerBinding:binding,
    capabilityBinding:{capabilityRevision:capability.revision.value,evidenceDigest:capability.evidenceDigest.value,semanticFieldsDigest:capability.semanticFieldsDigest.value,snapshotHash:capability.snapshotHash.value},
    attachmentProviderFileBindings:fileDescriptors.map(descriptor=>({assetRevisionId:descriptor.assetRevisionId.value,providerFileDescriptor:{descriptorId:descriptor.descriptorId.value,descriptorRevision:descriptor.descriptorRevision.value,descriptorHash:descriptor.descriptorHash.value}})),toolAuthority:{kind:'none'}}))
  return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(fixture.db,context=>{
    const graph=new ConversationGraphV2Repo(fixture.db),pending=graph.beginInitialTurn(context,{operationId:'operation:send',branchId:'branch:1',expectedHeadMessageId:null,questionId:'question:send',answerRootId:'answer:send',userBody:'send selected DOCX as PDF',createdAtMs:50})
    const execution=new GenerationExecutionV2Repo(fixture.db,()=>50).insertOperationAndSnapshot(context,{operationId:'operation:send',actionKind:'initial_send',branchId:'branch:1',conversationId:'conversation:1',questionId:'question:send',sourceAnswerId:null,targetAnswerId:'answer:send',snapshot:snapshot.canonicalJson,commandFingerprint:'a'.repeat(64),createdAtMs:50})
    graph.commitInitialTurnProjection(context,pending)
    const history=new OpenAIResponsesNativeHistoryV2Repo(fixture.db).loadRequestHistory(context,'operation:send')
    const prepared=compileOpenAIResponsesPreparedRequestV2({context,execution:execution.bundle,history,toolRegistry:null})
    new GenerationRequestV2Repo(fixture.db,()=>50).createPrepared(context,execution.bundle,prepared)
    return prepared
  })
}

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function setupTextDraft(db: BetterSqlite3.Database) {
  const bytes = new TextEncoder().encode('# source document')
  const assets = new AttachmentAssetV2Repo(db, () => 10)
  const blob = assets.recordBlobFromBytes(bytes, 'text/markdown')
  assets.createAsset({ assetId: 'asset:source', assetKind: 'file', filename: 'source.md', sourceKind: 'user_import' })
  const revision = assets.appendSourceRevision({ assetId: 'asset:source', assetRevisionId: 'asset-revision:source', blob })
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    const graph = new ConversationGraphV2Repo(db)
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, {
      projectId: 'project:1', conversationId: 'conversation:1', branchId: 'branch:1',
      title: 'Conversation', branchName: 'Main', createdAtMs: 2,
    })
  })
  const drafts = new ComposerDraftV2Repo(db, () => 10)
  const draft = drafts.getOrCreate('conversation:1')
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    drafts.addAttachmentInAuthorityTransaction(context, {
      conversationId: 'conversation:1', expectedRevision: draft.revision,
      attachment: {
        kind: 'managed_file', assetId: revision.assetId.value, assetRevisionId: revision.assetRevisionId.value,
        assetSha256: revision.blob.sha256.value, include: true, sendAs: 'provider_file', conversion: 'none',
      },
    })
    const detections=new FileTypeDetectionV2Repo(db,()=>10)
    detections.createPendingInAuthorityTransaction(context,{assetRevisionId:revision.assetRevisionId.value,
      assetSha256:revision.blob.sha256.value,attemptId:'attempt:source'})
  })
  const detected=detectBasicFileTypeV2({bytes,filename:'source.md',declaredMime:'text/markdown',detectionTrigger:'upload'})
  new FileTypeDetectionV2Repo(db,()=>11).completeReady({assetRevisionId:revision.assetRevisionId.value,
    attemptId:'attempt:source',revision:1,verdict:detected.verdict,staticPolicy:detected.staticPolicy})
  return bytes
}

describe('GenerationV2DfcService', () => {
  it('preserves the observed DOCX output through persistence, preview and prepared send beside a valid alternate output',async()=>{
    const fixture=productionFixture()
    try {
      const source=fixture.addSource('source.docx',docxMime,minimalDocxBytes())
      const producer=await syntheticDocxProducer(fixture),optionLoad=vi.spyOn(GenerationV2DfcService.prototype,'ensureOptions'),handlers=fixture.handlers()
      const dto=await handlers.get('generation-v2:composer:dfc-options')!({},{...optionsInput(source.assetId.value),providerId:'openai_responses',operation:'responses'}) as {ok:true;value:Awaited<ReturnType<GenerationV2DfcService['ensureOptions']>>}
      expect(dto.ok).toBe(true)
      const option=dto.value.options.find(item=>item.targetKind==='pdf_attachment')!
      expect(option).toMatchObject({status:'ready',isAvailable:true,selectionBinding:{sourceAssetId:source.assetId.value,sourceAssetRevisionId:source.assetRevisionId.value,
        sourceAssetSha256:source.blob.sha256.value,targetKind:'pdf_attachment',producer:{contractId:'starverse-dfc-docx-pdf-v1',revision:'1'}}})
      expect(producer.runtime).toHaveBeenCalledWith(expect.objectContaining({productionOnly:true,capabilityId:'docx_to_pdf'}))
      expect(producer.adapter).toHaveBeenCalledTimes(1)
      expect(optionLoad).toHaveBeenCalledTimes(1)
      const observed=option.selectionBinding!,later=persistOtherOutput(fixture,source)
      const selected=await handlers.get('generation-v2:composer:dfc-select')!({},{...selectInput(fixture,observed),providerId:'openai_responses',operation:'responses'}) as {ok:true;value:ReturnType<ComposerDraftV2Repo['read']>}
      expect(selected.ok).toBe(true)
      expect(selected.value.attachments[0]).toMatchObject({assetId:source.assetId.value,assetRevisionId:source.assetRevisionId.value,
        dfcSelection:{effectiveAssetId:observed.effectiveAssetId,effectiveAssetRevisionId:observed.effectiveAssetRevisionId,effectiveAssetSha256:observed.effectiveAssetSha256}})
      expect(observed.effectiveAssetRevisionId).not.toBe(later.assetRevisionId.value)
      expect(producer.adapter).toHaveBeenCalledTimes(1)
      expect(optionLoad).toHaveBeenCalledTimes(1)
      const rehydrated=await handlers.get('generation-v2:composer:get')!({},{conversationId:'conversation:1'}) as {ok:true;value:ReturnType<ComposerDraftV2Repo['read']>}
      expect(rehydrated.value).toEqual(selected.value)
      const preview=await handlers.get('generation-v2:composer:dfc-preview')!({},{conversationId:'conversation:1',assetId:source.assetId.value,maxCharacters:2048}) as {ok:true;value:ReturnType<GenerationV2DfcService['preview']>}
      expect(preview).toMatchObject({ok:true,value:{selectedAssetRefs:[{kind:'derived_asset',assetId:observed.effectiveAssetId}],targetKind:'pdf_attachment',preview:{status:'ready',kind:'none'}}})
      const requirements=vi.spyOn(preparedAuthority,'createPreparedAttachmentRequirementsV2'),prepared=preparedSend(fixture)
      expect(requirements).toHaveBeenCalledTimes(1)
      expect(requirements.mock.results[0].value).toEqual([{semanticPath:'attachments[0]',kind:'managed_file',assetRevisionId:observed.effectiveAssetRevisionId,assetSha256:observed.effectiveAssetSha256}])
      const snapshot=fixture.db.prepare('SELECT canonical_json,snapshot_hash FROM assistant_generation_snapshot_v2').get() as {canonical_json:string;snapshot_hash:string}
      expect(JSON.parse(snapshot.canonical_json).semanticIntent.attachments[0]).toMatchObject({assetId:observed.effectiveAssetId,assetRevisionId:observed.effectiveAssetRevisionId,assetSha256:observed.effectiveAssetSha256})
      expect(prepared.snapshotHash).toBe(snapshot.snapshot_hash)
      const body=JSON.parse(prepared.body.copyUtf8Text())
      expect(body.input.at(-1).content).toContainEqual({type:'input_file',file_id:'file_synthetic_pdf_A'})
      const selectedRevision=fixture.assets.getRevision(observed.effectiveAssetId,observed.effectiveAssetRevisionId)
      expect(Buffer.from(fixture.blobs.readRevisionBytes(selectedRevision))).toEqual(pdfBytes)
      expect(fixture.db.prepare('SELECT count(*) AS n FROM generation_operation_v2').get()).toEqual({n:1})
    } finally {fixture.close()}
  })

  it('retains HTML PDF and original/text selection with their own observed bindings',async()=>{
    const fixture=productionFixture()
    try {
      const source=fixture.addSource('source.html','text/html',Buffer.from('<p>HTML source</p>'))
      const bridge:ElectronConversionBridge={convert:vi.fn<ElectronConversionBridge['convert']>(async request=>{
        const outputPath=path.join(request.output.rootDir,request.output.relativePath)
        await writeFile(outputPath,pdfBytes)
        return {requestId:request.requestId,conversionKind:request.conversionKind,status:'success',output:{kind:'controlled_output',outputPath,mime:'application/pdf',extension:'pdf'},diagnostics:[],cleanupStatus:'not_requested'}
      })}
      const service=fixture.service(bridge),dto=await service.ensureOptions({...optionsInput(source.assetId.value),providerId:'openai_responses',operation:'responses'})
      const pdf=dto.options.find(item=>item.targetKind==='pdf_attachment')!.selectionBinding!
      expect(pdf.producer?.contractId).toBe('starverse-dfc-html-pdf-v1')
      await service.select(selectInput(fixture,pdf))
      expect(fixture.drafts.read('conversation:1').attachments[0]).toMatchObject({dfcSelection:{effectiveAssetRevisionId:pdf.effectiveAssetRevisionId}})
      expect(bridge.convert).toHaveBeenCalledTimes(1)
      const original=dto.options.find(item=>item.targetKind==='original_file')!.selectionBinding!
      expect(original.producer).toBeNull()
      await service.select(selectInput(fixture,original))
      expect(fixture.drafts.read('conversation:1').attachments[0]).toMatchObject({dfcSelection:{targetKind:'original_file',effectiveAssetRevisionId:source.assetRevisionId.value}})
      const text=fixture.addSource('text.md','text/markdown',Buffer.from('# text source'))
      const textOptions=await service.ensureOptions(optionsInput(text.assetId.value))
      const markdown=textOptions.options.find(item=>item.targetKind==='markdown')!.selectionBinding!
      expect(markdown.producer?.contractId).toBe('starverse-dfc-text-v1')
      await service.select(selectInput(fixture,markdown))
      expect(service.preview({conversationId:'conversation:1',assetId:text.assetId.value,maxCharacters:100})).toMatchObject({preview:{status:'ready',kind:'text',text:'# text source'}})
      expect(bridge.convert).toHaveBeenCalledTimes(1)
    } finally {fixture.close()}
  })

  it('leaves missing-runtime DOCX PDF blocked without a binding or selection-time conversion',async()=>{
    const fixture=productionFixture()
    try {
      const source=fixture.addSource('source.docx',docxMime,minimalDocxBytes()),service=fixture.service()
      const dto=await service.ensureOptions(optionsInput(source.assetId.value))
      const option=dto.options.find(item=>item.targetKind==='pdf_attachment')!
      expect(option).toMatchObject({status:'blocked',isAvailable:false,selectionBinding:null,sendAssetRefs:[]})
      const before=fixture.drafts.read('conversation:1'),handlers=fixture.handlers()
      const result=await handlers.get('generation-v2:composer:dfc-select')!({},{...optionsInput(source.assetId.value),expectedRevision:before.revision,optionId:option.optionId,selectionBinding:null})
      expect(result).toEqual({ok:false,code:'GENERATION_V2_DFC_INPUT_INVALID'})
      expect(fixture.drafts.read('conversation:1')).toEqual(before)
      expect(fixture.db.prepare('SELECT count(*) AS n FROM dfc_conversion_output_v2').get()).toEqual({n:0})
    } finally {fixture.close()}
  })

  it('rejects each tampered observed provenance field without draft or generation mutation',async()=>{
    const fixture=productionFixture()
    try {
      const source=fixture.addSource('source.docx',docxMime,minimalDocxBytes())
      const producer=await syntheticDocxProducer(fixture),service=fixture.service(),dto=await service.ensureOptions(optionsInput(source.assetId.value))
      const binding=dto.options.find(item=>item.targetKind==='pdf_attachment')!.selectionBinding!,before=fixture.drafts.read('conversation:1')
      const packets=[...['sourceAssetId','sourceAssetRevisionId','effectiveAssetId','effectiveAssetRevisionId'].map(key=>({...binding,[key]:'missing:revision'})),
        ...['sourceAssetSha256','effectiveAssetSha256'].map(key=>({...binding,[key]:'0'.repeat(64)})),
        {...binding,targetKind:'markdown'}, {...binding,producer:{...binding.producer!,contractId:'another-contract'}},
        {...binding,producer:{...binding.producer!,revision:'2'}},{...binding,producer:{...binding.producer!,settingsDigest:'0'.repeat(64)}},
        {...binding,producer:null},{...binding,targetKind:'original_file'},
      ]
      for(const packet of packets) {
        await expect(service.select({...selectInput(fixture,binding),selectionBinding:packet as DfcReadyOptionBindingV2})).rejects.toThrow(/GENERATION_V2_DFC_(?:INPUT_INVALID|OPTION_UNAVAILABLE)$/u)
        expect(fixture.drafts.read('conversation:1')).toEqual(before)
      }
      expect(producer.adapter).toHaveBeenCalledTimes(1)
      expect(fixture.db.prepare('SELECT count(*) AS n FROM generation_operation_v2').get()).toEqual({n:0})
    } finally {fixture.close()}
  })

  it('rejects strict IPC binding omissions, extra/accessor fields and wrong option/target relationships',async()=>{
    const fixture=productionFixture()
    try {
      const source=fixture.addSource('source.docx',docxMime,minimalDocxBytes())
      await syntheticDocxProducer(fixture)
      const dto=await fixture.service().ensureOptions(optionsInput(source.assetId.value)),binding=dto.options.find(item=>item.targetKind==='pdf_attachment')!.selectionBinding!
      const handler=fixture.handlers().get('generation-v2:composer:dfc-select')!,before=fixture.drafts.read('conversation:1'),valid=selectInput(fixture,binding)
      const missing={...valid};delete (missing as Partial<typeof missing>).selectionBinding
      const accessor={...binding};Object.defineProperty(accessor,'effectiveAssetId',{enumerable:true,get(){throw new Error('getter must not run')}})
      const packets=[missing,{...valid,selectionBinding:null},{...valid,selectionBinding:{...binding,extra:true}},
        {...valid,selectionBinding:{...binding,producer:{...binding.producer,extra:true}}},{...valid,selectionBinding:accessor},
        {...valid,selectionBinding:{...binding,effectiveAssetSha256:'not-a-digest'}},{...valid,optionId:'dfc:markdown:v1'}]
      for(const packet of packets) {
        expect(await handler({},packet)).toMatchObject({ok:false,code:expect.stringMatching(/^GENERATION_V2_(?:COMPOSER_INPUT_INVALID|DFC_INPUT_INVALID|DFC_OPTION_UNAVAILABLE)$/u)})
        expect(fixture.drafts.read('conversation:1')).toEqual(before)
      }
      expect(fixture.db.prepare('SELECT count(*) AS n FROM generation_operation_v2').get()).toEqual({n:0})
    } finally {fixture.close()}
  })

  it.each(['removed','excluded','source-retired','output-retired','new-source','revision-conflict','provider-mismatch','operation-mismatch'] as const)(
    'rejects %s after readiness without changing the aggregate or producing generation',async scenario=>{
      const fixture=productionFixture()
      try {
        const source=fixture.addSource('source.docx',docxMime,minimalDocxBytes())
        const producer=await syntheticDocxProducer(fixture),service=fixture.service(),dto=await service.ensureOptions(optionsInput(source.assetId.value)),binding=dto.options.find(item=>item.targetKind==='pdf_attachment')!.selectionBinding!
        let packet=selectInput(fixture,binding)
        if(scenario==='removed'||scenario==='new-source')fixture.drafts.removeAttachment({conversationId:'conversation:1',expectedRevision:packet.expectedRevision,attachmentRevisionId:source.assetRevisionId.value})
        if(scenario==='new-source') {
          const newBytes=minimalDocxBytes('New source revision'),blob=fixture.assets.recordBlobFromBytes(newBytes,docxMime)
          fixture.blobs.persist(newBytes)
          const next=fixture.assets.appendSourceRevision({assetId:source.assetId.value,assetRevisionId:'revision:new-source',blob})
          fixture.drafts.addAttachment({conversationId:'conversation:1',expectedRevision:fixture.drafts.read('conversation:1').revision,attachment:{kind:'managed_file',assetId:next.assetId.value,
            assetRevisionId:next.assetRevisionId.value,assetSha256:next.blob.sha256.value,include:true,sendAs:'provider_file',conversion:'none'}})
          const detections=new FileTypeDetectionV2Repo(fixture.db,()=>11),detected=detectBasicFileTypeV2({bytes:newBytes,filename:'source.docx',declaredMime:docxMime,detectionTrigger:'upload'})
          runGenerationV2AuthorityTransactionOnOwnedConnectionV2(fixture.db,context=>detections.createPendingInAuthorityTransaction(context,{assetRevisionId:next.assetRevisionId.value,assetSha256:next.blob.sha256.value,attemptId:'attempt:new'}))
          detections.completeReady({assetRevisionId:next.assetRevisionId.value,attemptId:'attempt:new',revision:1,verdict:detected.verdict,staticPolicy:detected.staticPolicy})
        }
        if(scenario==='excluded')fixture.drafts.replace({conversationId:'conversation:1',expectedRevision:packet.expectedRevision,draftText:'unchanged',draftMode:'compose',editingSourceQuestionId:null,
          attachments:[{kind:'managed_file',assetId:source.assetId.value,assetRevisionId:source.assetRevisionId.value,assetSha256:source.blob.sha256.value,include:false,sendAs:'provider_file',conversion:'none'}]})
        if(scenario==='source-retired')new AttachmentAssetV2Repo(fixture.db,()=>60).retireAsset(source.assetId.value)
        if(scenario==='output-retired')new AttachmentAssetV2Repo(fixture.db,()=>60).retireAsset(binding.effectiveAssetId)
        if(scenario==='revision-conflict')fixture.drafts.updateText({conversationId:'conversation:1',expectedRevision:packet.expectedRevision,draftText:'new input survives',draftMode:'compose',editingSourceQuestionId:null})
        if(scenario==='provider-mismatch')packet={...packet,providerId:'anthropic'}
        if(scenario==='operation-mismatch')packet={...packet,operation:'images' as never}
        if(scenario!=='revision-conflict')packet={...packet,expectedRevision:fixture.drafts.read('conversation:1').revision}
        const before=fixture.drafts.read('conversation:1')
        await expect(service.select(packet)).rejects.toThrow(/^GENERATION_V2_/u)
        expect(fixture.drafts.read('conversation:1')).toEqual(before)
        expect(producer.adapter).toHaveBeenCalledTimes(1)
        expect(fixture.db.prepare('SELECT count(*) AS n FROM generation_operation_v2').get()).toEqual({n:0})
      } finally {fixture.close()}
    })

  it.each(['retirement','corrupt-output-producer','corrupt-option-id'] as const)('fails get/preview closed after selected %s',async scenario=>{
    const fixture=productionFixture()
    try {
      const source=fixture.addSource('source.docx',docxMime,minimalDocxBytes())
      await syntheticDocxProducer(fixture)
      const service=fixture.service(),dto=await service.ensureOptions(optionsInput(source.assetId.value)),binding=dto.options.find(item=>item.targetKind==='pdf_attachment')!.selectionBinding!
      await service.select(selectInput(fixture,binding))
      const before=fixture.db.prepare('SELECT * FROM composer_draft_v2').get(),selectionBefore=fixture.db.prepare('SELECT * FROM composer_draft_dfc_selection_v2').get()
      if(scenario==='retirement')new AttachmentAssetV2Repo(fixture.db,()=>60).retireAsset(binding.effectiveAssetId)
      if(scenario==='corrupt-output-producer') {
        // Deliberate isolated corruption: bypass only the immutable output trigger to exercise readers.
        fixture.db.exec('DROP TRIGGER trg_dfc_conversion_output_v2_immutable_update')
        fixture.db.prepare("UPDATE dfc_conversion_output_v2 SET converter_contract_id='tampered' WHERE derived_asset_revision_id=?").run(binding.effectiveAssetRevisionId)
      }
      if(scenario==='corrupt-option-id')fixture.db.prepare("UPDATE composer_draft_dfc_selection_v2 SET selected_option_id='dfc:markdown:v1'").run()
      const handlers=fixture.handlers()
      if(scenario!=='corrupt-option-id')expect(await handlers.get('generation-v2:composer:get')!({},{conversationId:'conversation:1'})).toEqual({ok:false,code:'GENERATION_V2_DRAFT_DFC_PROVENANCE_INVALID'})
      expect(await handlers.get('generation-v2:composer:dfc-preview')!({},{conversationId:'conversation:1',assetId:source.assetId.value,maxCharacters:100})).toMatchObject({ok:false,code:expect.stringMatching(/^GENERATION_V2_(?:DRAFT_DFC_PROVENANCE_INVALID|DFC_OPTION_UNAVAILABLE)$/u)})
      expect(fixture.db.prepare('SELECT * FROM composer_draft_v2').get()).toEqual(before)
      if(scenario!=='corrupt-option-id')expect(fixture.db.prepare('SELECT * FROM composer_draft_dfc_selection_v2').get()).toEqual(selectionBefore)
    } finally {fixture.close()}
  })

  it('opens text-derived options only for the reviewed OpenRouter chat operation', async () => {
    const db = database()
    try {
      const sourceBytes = setupTextDraft(db)
      const service = new GenerationV2DfcService(db, {
        persist: () => undefined,
        readRevisionBytes: () => new Uint8Array(sourceBytes),
      } as never, () => 20)

      const openRouter = await service.ensureOptions({
        conversationId: 'conversation:1', assetId: 'asset:source', providerId: 'openrouter', operation: 'chat_completions',
      })
      expect(openRouter.options.find((option) => option.targetKind === 'markdown')).toMatchObject({
        isAvailable: true, sendStrategy: 'text_in_prompt', compatibilityStatus: 'compatible',
      })

      const openAIResponses = await service.ensureOptions({
        conversationId: 'conversation:1', assetId: 'asset:source', providerId: 'openai_responses', operation: 'responses',
      })
      expect(openAIResponses.options.find((option) => option.targetKind === 'markdown')).toMatchObject({
        isAvailable: false, status: 'blocked', compatibilityStatus: 'blocked',
        diagnostics: [{ code: 'GENERATION_V2_DFC_PROVIDER_CONTRACT_UNSUPPORTED' }],
      })
    } finally { db.close() }
  })
  // R5-02 (P5b-01, P5b-02): non-markdown text sources convert, and one failed option never hides the others.
  it.each([['notes.txt','text/plain','plain notes'],['data.json','application/json','{"a":1}'],['table.csv','text/csv','a,b;1,2']])(
    'offers every text option for the non-markdown source %s',async(name,mime,text)=>{
      const fixture=productionFixture()
      try {
        const source=fixture.addSource(name,mime,Buffer.from(text))
        const dto=await fixture.service().ensureOptions(optionsInput(source.assetId.value))
        for(const target of ['original_file','plain_text','markdown','code','table_markdown'])
          expect(dto.options.find(item=>item.targetKind===target)).toMatchObject({status:'ready',isAvailable:true})
      } finally {fixture.close()}
    })

  it('keeps the other options when the HTML PDF converter fails, and does not retry it straight away',async()=>{
    const fixture=productionFixture()
    try {
      const source=fixture.addSource('page.html','text/html',Buffer.from('<p>page</p>'))
      const bridge:ElectronConversionBridge={convert:vi.fn<ElectronConversionBridge['convert']>(async request=>({requestId:request.requestId,
        conversionKind:request.conversionKind,status:'failed',diagnostics:[],cleanupStatus:'not_requested'}) as never)}
      const service=fixture.service(bridge)
      const dto=await service.ensureOptions(optionsInput(source.assetId.value))
      expect(dto.options.find(item=>item.targetKind==='pdf_attachment')).toMatchObject({status:'blocked',diagnostics:[{code:'GENERATION_V2_DFC_CONVERSION_FAILED'}]})
      expect(dto.options.find(item=>item.targetKind==='original_file')).toMatchObject({status:'ready'})
      expect(dto.options.find(item=>item.targetKind==='plain_text')).toMatchObject({status:'ready'})
      await service.ensureOptions(optionsInput(source.assetId.value))
      expect(bridge.convert).toHaveBeenCalledTimes(1)
    } finally {fixture.close()}
  })

  it('blocks only the text option whose source is not valid UTF-8',async()=>{
    const fixture=productionFixture()
    try {
      const source=fixture.addSource('latin.txt','text/plain',Buffer.from([0x63,0x61,0x66,0xe9]))
      const dto=await fixture.service().ensureOptions(optionsInput(source.assetId.value))
      expect(dto.options.find(item=>item.targetKind==='original_file')).toMatchObject({status:'ready'})
      expect(dto.options.find(item=>item.targetKind==='plain_text')).toMatchObject({status:'blocked',diagnostics:[{code:'GENERATION_V2_DFC_CONVERSION_FAILED'}]})
    } finally {fixture.close()}
  })

})
