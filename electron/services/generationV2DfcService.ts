import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ComposerDraftV2Repo, type ComposerDraftManagedFileAttachmentV2 } from '../../infra/db/repo/composerDraftV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import { requestElectronConversion, type ElectronConversionBridge } from '../../infra/files/electronConversionBridge'
import { runDfcLibreOfficeDocxToPdfAdapter } from '../../infra/files/dfcLibreOfficePdfAdapter'
import { getDfcLibreOfficeManagedRuntimeRoot, resolveDfcLibreOfficePluginManagedRuntimeHandle } from '../../infra/files/dfcManagedLibreOfficeRuntime'
import { runExternalProcess } from '../../infra/files/fileTypeRuntimeBoundary'

type TargetKind = 'original_file'|'plain_text'|'markdown'|'code'|'table_markdown'|'pdf_attachment'
type SendStrategy = 'text_in_prompt'|'file_attachment'
type DfcSendAssetRef = Readonly<{kind:'raw_file'|'derived_asset';assetId:string}>
type DfcDiagnostic = Readonly<{code:string;message:string;severity:'info'|'warning'|'error'}>
type DfcOption = Readonly<{optionId:string;rawFileId:string;targetKind:TargetKind;sendStrategy:SendStrategy;
  status:'ready'|'blocked';isAvailable:boolean;compatibilityStatus:'compatible'|'blocked';sendAssetRefs:ReadonlyArray<DfcSendAssetRef>;
  warnings:readonly string[];diagnostics:ReadonlyArray<DfcDiagnostic>}>

export class GenerationV2DfcServiceError extends Error {
  constructor(readonly code: 'GENERATION_V2_DFC_INPUT_INVALID'|'GENERATION_V2_DFC_ATTACHMENT_NOT_FOUND'|'GENERATION_V2_DFC_OPTION_UNAVAILABLE'|'GENERATION_V2_DFC_TEXT_DECODE_FAILED'|
    'GENERATION_V2_FILE_DETECTION_REQUIRED'|'GENERATION_V2_FILE_DETECTION_PENDING'|'GENERATION_V2_FILE_DETECTION_FAILED'|'GENERATION_V2_FILE_DETECTION_BLOCKED',readonly detail:string|null=null) {
    super(detail?`${code}:${detail}`:code); this.name='GenerationV2DfcServiceError'
  }
}

const TEXT_TARGETS: readonly Exclude<TargetKind,'original_file'|'pdf_attachment'>[] = Object.freeze(['plain_text','markdown','code','table_markdown'])
const CONVERTER_CONTRACT = 'starverse-dfc-text-v1'
const CONVERTER_REVISION = '1'
const HTML_PDF_CONVERTER_CONTRACT = 'starverse-dfc-html-pdf-v1'

function optionId(target:TargetKind):string { return `dfc:${target}:v1` }
function settingsDigest(target:TargetKind):string { return createHash('sha256').update(`dfc-text-v1:${target}`,'utf8').digest('hex') }
function textual(mime:string):boolean { return mime.startsWith('text/') || ['application/json','application/xml','application/javascript'].includes(mime) }
function outputFilename(filename:string,target:Exclude<TargetKind,'original_file'>):string {
  const stem=filename.replace(/\.[^./\\]+$/u,'') || filename
  return `${stem}.${target==='pdf_attachment'?'pdf':target==='code'?'txt':'md'}`
}
function contentFor(target:Exclude<TargetKind,'original_file'|'pdf_attachment'>, source:string):string {
  if(target==='code') return `\`\`\`\n${source}\n\`\`\``
  return source
}

/** Epoch-2 DFC source/output authority. It never reads legacy draft or derivative tables. */
export class GenerationV2DfcService {
  private readonly assets:AttachmentAssetV2Repo
  private readonly drafts:ComposerDraftV2Repo
  private readonly htmlPdfInFlight=new Map<string,Promise<ReturnType<AttachmentAssetV2Repo['getRevision']>>>()
  constructor(private readonly db:BetterSqlite3.Database,private readonly blobs:Epoch2AttachmentBlobStoreV2,private readonly nowMs:()=>number=Date.now,
    private readonly conversion:ElectronConversionBridge|null=null,private readonly tempRoot:string|null=null,private readonly runtimesRoot:string|null=null) {
    this.assets=new AttachmentAssetV2Repo(db,nowMs);this.drafts=new ComposerDraftV2Repo(db,nowMs)
  }
  async ensureOptions(input:Readonly<{conversationId:string;assetId:string;providerId:string;operation:'chat_completions'|'images'|'responses'}>):Promise<Readonly<{attachmentId:string;conversationId:string;rawFileId:string;filename:string;sizeBytes:number;dfcManaged:true;selectedOptionId:string|null;selectedAssetRefs:ReadonlyArray<DfcSendAssetRef>;recommendedOptionId:string|null;recommendedReasonCode:string|null;decision:Readonly<Record<string,unknown>>;options:readonly DfcOption[]}>> {
    const attachment=this.attachment(input.conversationId,input.assetId)
    const selected=attachment.dfcSelection
    const options: DfcOption[]=[this.originalOption(attachment)]
    for(const target of TEXT_TARGETS) options.push(this.textOption(attachment,target,input.providerId,input.operation))
    options.push(await this.pdfOption(attachment,input.providerId,input.operation))
    const selectedOption=selected===null?null:options.find(item=>item.optionId===selected.optionId)??null
    const selectedAssetRefs: DfcSendAssetRef[] = selected===null?[]:[{kind:selected.targetKind==='original_file'?'raw_file':'derived_asset',assetId:selected.effectiveAssetId}]
    let decision: Readonly<Record<string, unknown>>
    if (selected === null || selectedOption === null) {
      decision=Object.freeze({status:'needs_user_selection',reasonCode:'selected_option_missing',selectedOptionId:null,targetKind:null,sendStrategy:null,sendAssetRefs:[],needsUserAction:true})
    } else if (selectedOption.isAvailable) {
      decision=Object.freeze({status:'ready',reasonCode:null,selectedOptionId:selected.optionId,targetKind:selected.targetKind,sendStrategy:selected.sendStrategy,sendAssetRefs:selectedAssetRefs,needsUserAction:false})
    } else {
      decision=Object.freeze({status:'blocked',reasonCode:'selected_option_unavailable',selectedOptionId:selected.optionId,targetKind:selected.targetKind,sendStrategy:selected.sendStrategy,sendAssetRefs:[],needsUserAction:true})
    }
    return Object.freeze({attachmentId:attachment.assetId,conversationId:input.conversationId,rawFileId:attachment.assetId,filename:attachment.filename,sizeBytes:attachment.sizeBytes,
      dfcManaged:true,selectedOptionId:selected?.optionId??null,selectedAssetRefs:Object.freeze(selectedAssetRefs),recommendedOptionId:optionId('original_file'),recommendedReasonCode:'original_file_preserves_bytes',decision,options:Object.freeze(options)})
  }
  async select(input:Readonly<{conversationId:string;expectedRevision:number;assetId:string;optionId:string;providerId:string;operation:'chat_completions'|'images'|'responses'}>):Promise<ReturnType<ComposerDraftV2Repo['setDfcSelection']>> {
    const attachment=this.attachment(input.conversationId,input.assetId)
    const dto=await this.ensureOptions({conversationId:input.conversationId,assetId:input.assetId,providerId:input.providerId,operation:input.operation})
    const option=dto.options.find(entry=>entry.optionId===input.optionId)
    if(!option||!option.isAvailable) throw new GenerationV2DfcServiceError('GENERATION_V2_DFC_OPTION_UNAVAILABLE')
    const effective=option.targetKind==='original_file'?this.assets.getRevision(attachment.assetId,attachment.assetRevisionId)
      : option.targetKind==='pdf_attachment'?this.derivedForWithContract(attachment.assetRevisionId,option.targetKind,HTML_PDF_CONVERTER_CONTRACT)
        : this.derivedFor(attachment.assetRevisionId,option.targetKind)
    if(!effective) throw new GenerationV2DfcServiceError('GENERATION_V2_DFC_OPTION_UNAVAILABLE')
    return this.drafts.setDfcSelection({conversationId:input.conversationId,expectedRevision:input.expectedRevision,sourceAssetRevisionId:attachment.assetRevisionId,
      selectedOptionId:option.optionId,targetKind:option.targetKind,sendStrategy:option.sendStrategy,effectiveAssetId:effective.assetId.value,
      effectiveAssetRevisionId:effective.assetRevisionId.value,effectiveAssetSha256:effective.blob.sha256.value})
  }
  preview(input:Readonly<{conversationId:string;assetId:string;maxCharacters:number}>) {
    const attachment=this.attachment(input.conversationId,input.assetId)
    const selected=attachment.dfcSelection
    if(!selected) return this.previewDto(input.conversationId,attachment,null,'needs_user_selection',null,input.maxCharacters)
    if(selected.targetKind==='original_file'||selected.targetKind==='pdf_attachment') return this.previewDto(input.conversationId,attachment,selected,'ready',null,input.maxCharacters)
    const output=this.assets.getRevision(selected.effectiveAssetId,selected.effectiveAssetRevisionId)
    const bytes=this.blobs.readRevisionBytes(output)
    try { const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);return this.previewDto(input.conversationId,attachment,selected,'ready',source,input.maxCharacters) }
    catch { throw new GenerationV2DfcServiceError('GENERATION_V2_DFC_TEXT_DECODE_FAILED') } finally { bytes.fill(0) }
  }
  private attachment(conversationId:string,assetId:string):ComposerDraftManagedFileAttachmentV2 {
    const draft=this.drafts.getOrCreate(conversationId)
    const attachment=draft.attachments.find((entry):entry is ComposerDraftManagedFileAttachmentV2=>entry.kind==='managed_file'&&entry.assetId===assetId)
    if(!attachment) throw new GenerationV2DfcServiceError('GENERATION_V2_DFC_ATTACHMENT_NOT_FOUND')
    const detection=attachment.fileTypeDetection
    if(!detection)throw new GenerationV2DfcServiceError('GENERATION_V2_FILE_DETECTION_REQUIRED')
    if(detection.status==='pending')throw new GenerationV2DfcServiceError('GENERATION_V2_FILE_DETECTION_PENDING')
    if(detection.status==='failed')throw new GenerationV2DfcServiceError('GENERATION_V2_FILE_DETECTION_FAILED',
      [detection.errorCode,detection.errorDetail].filter(Boolean).join(':')||null)
    if(detection.blocked)throw new GenerationV2DfcServiceError('GENERATION_V2_FILE_DETECTION_BLOCKED',detection.blockingReasonCodes.join(',')||null)
    return attachment
  }
  private originalOption(attachment:ComposerDraftManagedFileAttachmentV2):DfcOption {return Object.freeze({optionId:optionId('original_file'),rawFileId:attachment.assetId,targetKind:'original_file',sendStrategy:'file_attachment',status:'ready',isAvailable:true,compatibilityStatus:'compatible',sendAssetRefs:Object.freeze([{kind:'raw_file' as const,assetId:attachment.assetId}]),warnings:Object.freeze([]),diagnostics:Object.freeze([])})}
  private textOption(attachment:ComposerDraftManagedFileAttachmentV2,target:Exclude<TargetKind,'original_file'|'pdf_attachment'>,providerId:string,operation:'chat_completions'|'images'|'responses'):DfcOption {
    if(providerId!=='openrouter'||operation!=='chat_completions') return this.blocked(attachment,target,'GENERATION_V2_DFC_PROVIDER_CONTRACT_UNSUPPORTED','The selected provider operation contract does not encode this derived attachment.')
    if(!this.detectedTextual(attachment)) return this.blocked(attachment,target,'GENERATION_V2_DFC_TEXT_SOURCE_UNSUPPORTED','This source cannot be converted to text without a reviewed converter.')
    const output=this.ensureTextOutput(attachment,target)
    return Object.freeze({optionId:optionId(target),rawFileId:attachment.assetId,targetKind:target,sendStrategy:'text_in_prompt',status:'ready',isAvailable:true,compatibilityStatus:'compatible',sendAssetRefs:Object.freeze([{kind:'derived_asset' as const,assetId:output.assetId.value}]),warnings:Object.freeze([]),diagnostics:Object.freeze([])})
  }
  private async pdfOption(attachment:ComposerDraftManagedFileAttachmentV2,providerId:string,operation:'chat_completions'|'images'|'responses'):Promise<DfcOption> {
    if (!((providerId==='openrouter'&&operation==='chat_completions') || (providerId==='openai_responses'&&operation==='responses'))) return this.blocked(attachment,'pdf_attachment','GENERATION_V2_DFC_PROVIDER_CONTRACT_UNSUPPORTED','The selected provider operation contract does not encode this derived attachment.')
    const detectedFormatId=attachment.fileTypeDetection?.formatId
    if ((detectedFormatId==='html'||attachment.mime === 'text/html') && this.conversion && this.tempRoot) {
      const output=await this.ensureHtmlPdfOutput(attachment)
      return Object.freeze({optionId:optionId('pdf_attachment'),rawFileId:attachment.assetId,targetKind:'pdf_attachment',sendStrategy:'file_attachment',status:'ready',isAvailable:true,compatibilityStatus:'compatible',sendAssetRefs:Object.freeze([{kind:'derived_asset' as const,assetId:output.assetId.value}]),warnings:Object.freeze([]),diagnostics:Object.freeze([])})
    }
    if ((detectedFormatId==='docx'||attachment.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') && this.runtimesRoot && this.tempRoot) {
      const output=await this.ensureDocxPdfOutput(attachment)
      if (output) return Object.freeze({optionId:optionId('pdf_attachment'),rawFileId:attachment.assetId,targetKind:'pdf_attachment',sendStrategy:'file_attachment',status:'ready',isAvailable:true,compatibilityStatus:'compatible',sendAssetRefs:Object.freeze([{kind:'derived_asset' as const,assetId:output.assetId.value}]),warnings:Object.freeze([]),diagnostics:Object.freeze([])})
    }
    return this.blocked(attachment,'pdf_attachment','GENERATION_V2_DFC_PDF_CONVERTER_NOT_YET_BOUND','PDF conversion requires the reviewed browser or managed LibreOffice converter contract.')
  }
  private blocked(attachment:ComposerDraftManagedFileAttachmentV2,target:TargetKind,code:string,message:string):DfcOption {return Object.freeze({optionId:optionId(target),rawFileId:attachment.assetId,targetKind:target,sendStrategy:target==='pdf_attachment'||target==='original_file'?'file_attachment':'text_in_prompt',status:'blocked',isAvailable:false,compatibilityStatus:'blocked',sendAssetRefs:Object.freeze([]),warnings:Object.freeze([]),diagnostics:Object.freeze([{code,message,severity:'warning' as const}])})}
  private detectedTextual(attachment:ComposerDraftManagedFileAttachmentV2):boolean {
    const kind=attachment.fileTypeDetection?.kind
    return kind==='text'||kind==='code'||textual(attachment.mime)
  }
  private ensureTextOutput(attachment:ComposerDraftManagedFileAttachmentV2,target:Exclude<TargetKind,'original_file'|'pdf_attachment'>) {
    const existing=this.derivedFor(attachment.assetRevisionId,target);if(existing)return existing
    const source=this.assets.getRevision(attachment.assetId,attachment.assetRevisionId),bytes=this.blobs.readRevisionBytes(source)
    let output:Uint8Array
    try { output=new TextEncoder().encode(contentFor(target,new TextDecoder('utf-8',{fatal:true}).decode(bytes))) }
    catch { throw new GenerationV2DfcServiceError('GENERATION_V2_DFC_TEXT_DECODE_FAILED') } finally { bytes.fill(0) }
    try {
      return this.persistDerivedOutput(attachment, target, 'text/markdown', outputFilename(attachment.filename,target),
        'plain_text', CONVERTER_CONTRACT, CONVERTER_REVISION, output)
    } finally { output.fill(0) }
  }
  private async ensureHtmlPdfOutput(attachment:ComposerDraftManagedFileAttachmentV2) {
    const existing=this.derivedForWithContract(attachment.assetRevisionId,'pdf_attachment',HTML_PDF_CONVERTER_CONTRACT);if(existing)return existing
    const key=attachment.assetRevisionId
    const pending=this.htmlPdfInFlight.get(key);if(pending)return await pending
    const work=this.createHtmlPdfOutput(attachment)
    this.htmlPdfInFlight.set(key,work)
    try{return await work}finally{this.htmlPdfInFlight.delete(key)}
  }
  private async ensureDocxPdfOutput(attachment:ComposerDraftManagedFileAttachmentV2):Promise<ReturnType<AttachmentAssetV2Repo['getRevision']>|null> {
    const existing=this.derivedForWithContract(attachment.assetRevisionId,'pdf_attachment','starverse-dfc-docx-pdf-v1');if(existing)return existing
    const runtime=await resolveDfcLibreOfficePluginManagedRuntimeHandle({managedRuntimeRootDir:getDfcLibreOfficeManagedRuntimeRoot(this.runtimesRoot!),capabilityId:'docx_to_pdf',productionOnly:true})
    if(!runtime.ok)return null
    const source=this.assets.getRevision(attachment.assetId,attachment.assetRevisionId),bytes=this.blobs.readRevisionBytes(source)
    const sandboxRoot=path.join(this.tempRoot!,'dfc-docx-pdf',randomUUID())
    try {
      const result=await runDfcLibreOfficeDocxToPdfAdapter({assetId:attachment.assetId,sourceBytes:bytes,sourceExtension:'docx',sandboxRootDir:sandboxRoot,runtime:runtime.handle,processRunner:runExternalProcess,cleanupSandbox:false})
      if(!result.ok||!result.output)return null
      const output=new Uint8Array(await readFile(result.output.outputPath))
      try {
        return this.persistDerivedOutput(attachment, 'pdf_attachment', 'application/pdf', outputFilename(attachment.filename,'pdf_attachment'),
          'pdf', 'starverse-dfc-docx-pdf-v1', '1', output)
      } finally {output.fill(0)}
    } catch { return null } finally {bytes.fill(0);await rm(sandboxRoot,{recursive:true,force:true}).catch(()=>undefined)}
  }
  private async createHtmlPdfOutput(attachment:ComposerDraftManagedFileAttachmentV2):Promise<ReturnType<AttachmentAssetV2Repo['getRevision']>> {
    const source=this.assets.getRevision(attachment.assetId,attachment.assetRevisionId),bytes=this.blobs.readRevisionBytes(source)
    const root=path.join(this.tempRoot!,'dfc-html-pdf',randomUUID())
    const inputPath=path.join(root,'input','source.html'),outputPath=path.join(root,'output','converted.pdf')
    try {
      await mkdir(path.dirname(inputPath),{recursive:true});await mkdir(path.dirname(outputPath),{recursive:true});await writeFile(inputPath,bytes)
      const response=await requestElectronConversion(this.conversion,{requestId:`dfc:${randomUUID()}`,conversionKind:'html_to_pdf',
        source:{kind:'sandbox_input',rootDir:root,relativePath:path.join('input','source.html'),mime:'text/html'},
        output:{kind:'sandbox_output',rootDir:root,relativePath:path.join('output','converted.pdf'),mime:'application/pdf',extension:'pdf'},timeoutMs:15_000,
        policy:{javascriptEnabled:false,networkEnabled:false,localFileAccessEnabled:false}})
      if(response.status!=='success'||!response.output?.outputPath) throw new GenerationV2DfcServiceError('GENERATION_V2_DFC_OPTION_UNAVAILABLE')
      const output=new Uint8Array(await readFile(response.output.outputPath))
      try {
        if(output.byteLength<5||Buffer.from(output).subarray(0,5).toString('ascii')!=='%PDF-') throw new GenerationV2DfcServiceError('GENERATION_V2_DFC_OPTION_UNAVAILABLE')
        return this.persistDerivedOutput(attachment, 'pdf_attachment', 'application/pdf', outputFilename(attachment.filename,'pdf_attachment'),
          'pdf', HTML_PDF_CONVERTER_CONTRACT, '1', output)
      } finally { output.fill(0) }
    } finally { bytes.fill(0);await rm(root,{recursive:true,force:true}).catch(()=>undefined) }
  }
  private derivedFor(sourceAssetRevisionId:string,target:Exclude<TargetKind,'original_file'>) {
    return this.derivedForWithContract(sourceAssetRevisionId,target,CONVERTER_CONTRACT)
  }
  private persistDerivedOutput(
    attachment: ComposerDraftManagedFileAttachmentV2,
    target: Exclude<TargetKind,'original_file'>,
    mime: string,
    filename: string,
    conversionKind: 'plain_text'|'pdf',
    conversionContractId: string,
    conversionRevision: string,
    bytes: Uint8Array,
  ) {
    this.blobs.persist(bytes)
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(this.db, context => {
      const blob = this.assets.recordBlobFromBytesInAuthorityTransaction(context, bytes, mime)
      const derived = this.assets.createDerivedAssetRevisionInAuthorityTransaction(context, {
        assetId: `asset:${randomUUID()}`, assetRevisionId: `asset-revision:${randomUUID()}`, assetKind: 'file', filename,
        parentAssetRevisionId: attachment.assetRevisionId, conversionKind, conversionContractId, conversionRevision, blob,
      })
      this.db.prepare(`INSERT INTO dfc_conversion_output_v2 (
        derived_asset_revision_id, source_asset_revision_id, target_kind, converter_contract_id,
        converter_revision, conversion_settings_digest, warnings_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, '[]', ?)`).run(
        derived.assetRevisionId.value, attachment.assetRevisionId, target, conversionContractId,
        conversionRevision, settingsDigest(target), this.nowMs(),
      )
      return derived
    })
  }
  private derivedForWithContract(sourceAssetRevisionId:string,target:Exclude<TargetKind,'original_file'>,contract:string) {
    const row=this.db.prepare(`SELECT output.derived_asset_revision_id AS revision_id,revision.asset_id AS asset_id FROM dfc_conversion_output_v2 AS output JOIN asset_revision_v2 AS revision ON revision.asset_revision_id=output.derived_asset_revision_id WHERE output.source_asset_revision_id=? AND output.target_kind=? AND output.converter_contract_id=? AND output.converter_revision=? AND output.conversion_settings_digest=? ORDER BY output.created_at_ms DESC LIMIT 1`).get(sourceAssetRevisionId,target,contract,'1',settingsDigest(target)) as {revision_id?:unknown;asset_id?:unknown}|undefined
    return row&&typeof row.revision_id==='string'&&typeof row.asset_id==='string'?this.assets.getRevision(row.asset_id,row.revision_id):null
  }
  private previewDto(conversationId:string,attachment:ComposerDraftManagedFileAttachmentV2,selected:ComposerDraftManagedFileAttachmentV2['dfcSelection'],status:'ready'|'needs_user_selection',text:string|null,max:number) {
    const limit=Number.isSafeInteger(max)&&max>0&&max<=65536?max:2048,visible=text===null?null:text.slice(0,limit)
    const selectedAssetRefs: readonly DfcSendAssetRef[] = selected===null ? Object.freeze([]) : Object.freeze([{kind:selected.targetKind==='original_file'?'raw_file' as const:'derived_asset' as const,assetId:selected.effectiveAssetId}])
    return Object.freeze({attachmentId:attachment.assetId,conversationId,rawFileId:attachment.assetId,filename:attachment.filename,sizeBytes:attachment.sizeBytes,dfcManaged:true,selectedOptionId:selected?.optionId??null,selectedAssetRefs,targetKind:selected?.targetKind??null,sendStrategy:selected?.sendStrategy??null,decision:Object.freeze({status,reasonCode:status==='ready'?null:'selected_option_missing',selectedOptionId:selected?.optionId??null,targetKind:selected?.targetKind??null,sendStrategy:selected?.sendStrategy??null,sendAssetRefs:[],needsUserAction:status!=='ready'}),preview:Object.freeze({kind:text===null?'none' as const:'text' as const,status,text:visible,characterCount:text===null?null:text.length,byteLength:text===null?null:Buffer.byteLength(text,'utf8'),truncated:text!==null&&text.length>limit,maxCharacters:limit,diagnostics:Object.freeze([])})})
  }
}
