import type { DfcDraftAttachmentOptionsDto, DfcDraftAttachmentPreviewDto } from '../../../shared/files/documentFormatConversion'

type Result<T> = Readonly<{ok:true;value:T}>|Readonly<{ok:false;code:string}>
export type GenerationV2ComposerManagedFileAttachment=Readonly<{kind:'managed_file';assetId:string;assetRevisionId:string;assetSha256:string;include:boolean;
  sendAs:'provider_file'|'inline_text'|'image_reference'|'converted_document';conversion:'none'|'pdf'|'plain_text'|'images';
  attachmentOrder:number;filename:string;assetKind:'file'|'image';mime:string;sizeBytes:number;sourceKind:'user_import'|'url_import'|'generated'|'derived';originalUrl:string|null;
  fileTypeDetection:Readonly<{contractRevision:string;revision:number;status:'pending'|'ready'|'failed';formatId:string|null;kind:string|null;
    confidence:string|null;blocked:boolean;warning:boolean;blockingReasonCodes:readonly string[];warningReasonCodes:readonly string[];
    magikaState:string|null;magikaModelVersion:string|null;warnings:readonly Readonly<{code:string;detail:string|null}>[];
    errorCode:string|null;errorDetail:string|null}>|null;
  dfcSelection:Readonly<{optionId:string;targetKind:'original_file'|'plain_text'|'markdown'|'code'|'table_markdown'|'pdf_attachment';sendStrategy:'text_in_prompt'|'file_attachment';
    effectiveAssetId:string;effectiveAssetRevisionId:string;effectiveAssetSha256:string}>|null}>
export type GenerationV2ComposerUrlReferenceAttachment=Readonly<{kind:'url_reference';referenceId:string;referenceRevision:string;originalUrl:string;
  urlDigest:string;mediaKind:'image'|'document'|'audio'|'video'|'other';declaredMediaType:string|null;capturedAtMs:number;
  provenance:'user_supplied';include:boolean;sendAs:'url_reference';conversion:'none';attachmentOrder:number}>
export type GenerationV2ComposerAttachment=GenerationV2ComposerManagedFileAttachment|GenerationV2ComposerUrlReferenceAttachment
export type GenerationV2ComposerDraft=Readonly<{conversationId:string;draftText:string;draftMode:'compose'|'edit';
  editingSourceQuestionId:string|null;revision:number;updatedAtMs:number;attachments:readonly GenerationV2ComposerAttachment[]}>
function bridge(){const value=window.generationV2?.composer;if(!value)throw new Error('GENERATION_V2_COMPOSER_BRIDGE_UNAVAILABLE');return value}
function unwrap<T>(raw:unknown):T{const value=raw as Result<T>;if(!value||value.ok!==true)throw new Error(value&&'code'in value?value.code:'GENERATION_V2_COMPOSER_COMMAND_FAILED');return value.value}
export async function getGenerationV2ComposerDraft(conversationId:string){return unwrap<GenerationV2ComposerDraft>(await bridge().get(conversationId))}
export async function updateGenerationV2ComposerText(payload:Readonly<{conversationId:string;expectedRevision:number;draftText:string;
  draftMode:'compose'|'edit';editingSourceQuestionId:string|null}>){return unwrap<GenerationV2ComposerDraft>(await bridge().updateText(payload))}
export async function importGenerationV2ComposerLocalFile(payload:Readonly<{conversationId:string;expectedRevision:number;
  filePath:string;selectionGrantToken:string}>){return unwrap<GenerationV2ComposerDraft>(await bridge().importLocal(payload))}
export async function addGenerationV2ComposerUrlReference(payload:Readonly<{conversationId:string;expectedRevision:number;url:string}>){
  return unwrap<GenerationV2ComposerDraft>(await bridge().addUrlReference(payload))
}
export async function importGenerationV2ComposerUrlFile(payload:Readonly<{conversationId:string;expectedRevision:number;url:string}>){
  return unwrap<GenerationV2ComposerDraft>(await bridge().importUrlFile(payload))
}
export async function removeGenerationV2ComposerAttachment(payload:Readonly<{conversationId:string;expectedRevision:number;assetRevisionId:string}>){
  return unwrap<GenerationV2ComposerDraft>(await bridge().removeAttachment(payload))
}
export async function clearCommittedGenerationV2ComposerDraft(payload:Readonly<{conversationId:string;expectedRevision:number}>){
  return unwrap<GenerationV2ComposerDraft>(await bridge().clearCommitted(payload))
}
export async function readGenerationV2ComposerPreview(payload:Readonly<{assetId:string;assetRevisionId:string}>){
  return unwrap<Readonly<{status:'ready'|'missing';dataUrl:string|null;mime:string;sizeBytes?:number}>>(await bridge().readPreview(payload))
}
export async function replaceGenerationV2ComposerDraft(payload:Readonly<{conversationId:string;expectedRevision:number;draftText:string;
  draftMode:'compose'|'edit';editingSourceQuestionId:string|null;attachments:readonly unknown[]}>){
  return unwrap<GenerationV2ComposerDraft>(await bridge().replace(payload))
}
export async function replaceGenerationV2ComposerDraftFromAnswerSnapshot(payload:Readonly<{conversationId:string;expectedRevision:number;
  questionId:string;answerRootId:string;draftText:string}>){return unwrap<GenerationV2ComposerDraft>(await bridge().replaceFromAnswerSnapshot(payload))}
export function projectGenerationV2ComposerAttachments(draft:GenerationV2ComposerDraft):readonly Readonly<Record<string,unknown>>[]{
  return Object.freeze(draft.attachments.map(item=>Object.freeze(item.kind==='managed_file'
    ? (()=>{const selection=item.dfcSelection
      const isText=selection?.sendStrategy==='text_in_prompt'
      const isPdf=selection?.targetKind==='pdf_attachment'
      return {kind:item.kind,assetId:selection?.effectiveAssetId??item.assetId,assetRevisionId:selection?.effectiveAssetRevisionId??item.assetRevisionId,
        assetSha256:selection?.effectiveAssetSha256??item.assetSha256,include:item.include,
        sendAs:isText?'inline_text':isPdf?'converted_document':item.sendAs,
        conversion:isText?'plain_text':isPdf?'pdf':item.conversion}
    })()
    : {kind:item.kind,referenceId:item.referenceId,referenceRevision:item.referenceRevision,originalUrl:item.originalUrl,
      urlDigest:item.urlDigest,mediaKind:item.mediaKind,...(item.declaredMediaType===null?{}:{declaredMediaType:item.declaredMediaType}),
      capturedAtMs:item.capturedAtMs,provenance:item.provenance,include:item.include,sendAs:item.sendAs,conversion:item.conversion})))
}
export async function getGenerationV2ComposerDfcOptions(payload:Readonly<{conversationId:string;assetId:string;providerId:string;operation:'chat_completions'|'images'|'responses'}>){return unwrap<DfcDraftAttachmentOptionsDto>(await bridge().dfcOptions(payload))}
export async function selectGenerationV2ComposerDfcOption(payload:Readonly<{conversationId:string;expectedRevision:number;assetId:string;optionId:string;providerId:string;operation:'chat_completions'|'images'|'responses'}>){return unwrap<GenerationV2ComposerDraft>(await bridge().dfcSelect(payload))}
export async function getGenerationV2ComposerDfcPreview(payload:Readonly<{conversationId:string;assetId:string;maxCharacters:number}>){return unwrap<DfcDraftAttachmentPreviewDto>(await bridge().dfcPreview(payload))}
export async function retryGenerationV2ComposerFileTypeDetection(payload:Readonly<{conversationId:string;assetRevisionId:string}>){
  return unwrap<GenerationV2ComposerDraft>(await bridge().retryFileTypeDetection(payload))
}
export function onGenerationV2ComposerFileTypeDetectionUpdated(listener:(event:Readonly<{conversationId:string|null;assetRevisionId:string;
  status:'ready'|'failed';revision:number}>)=>void):()=>void {
  return bridge().onFileTypeDetectionUpdated((raw:unknown)=>{
    if(!raw||typeof raw!=='object')return
    const value=raw as Record<string,unknown>
    if((value.conversationId!==null&&typeof value.conversationId!=='string')||typeof value.assetRevisionId!=='string'||
      (value.status!=='ready'&&value.status!=='failed')||!Number.isSafeInteger(value.revision))return
    listener(value as {conversationId:string|null;assetRevisionId:string;status:'ready'|'failed';revision:number})
  })
}
