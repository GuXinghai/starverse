import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import type { FileSelectionGrantStore } from './fileSelectionGrants'
import { frameUrlFromIpcEvent, isMainFrameIpcEvent, senderIdFromIpcEvent } from './fileSelectionGrants'
import type { RegisterInvoke } from './types'
import { fetchPublicHttpUrl } from '../../infra/files/urlProbe'
import { sha256PreparedBytesV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  decodeAssistantAnswerGenerationSnapshotJsonV2,
  type DecodedAssistantAnswerGenerationSnapshotV2,
} from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import type { ProviderFetch } from '../net/providerHttpTransport'
import { GenerationV2DfcService } from '../services/generationV2DfcService'
import type { ElectronConversionBridge } from '../../infra/files/electronConversionBridge'

export const GENERATION_V2_COMPOSER_CHANNELS = Object.freeze([
  'generation-v2:composer:get',
  'generation-v2:composer:update-text',
  'generation-v2:composer:import-local',
  'generation-v2:composer:add-url-reference',
  'generation-v2:composer:import-url-file',
  'generation-v2:composer:remove-attachment',
  'generation-v2:composer:clear-committed',
  'generation-v2:composer:read-preview',
  'generation-v2:composer:replace',
  'generation-v2:composer:replace-from-answer-snapshot',
  'generation-v2:composer:dfc-options',
  'generation-v2:composer:dfc-select',
  'generation-v2:composer:dfc-preview',
] as const)

export function projectAnswerSnapshotAttachmentIntentsV2(
  snapshot: Pick<DecodedAssistantAnswerGenerationSnapshotV2, 'semanticIntent'>,
): readonly unknown[] {
  const attachments = projectGenerationIntentLayerV2({
    schemaVersion: 2,
    attachments: snapshot.semanticIntent.attachments,
  }).attachments
  if (!Array.isArray(attachments)) throw new Error('GENERATION_V2_ANSWER_SNAPSHOT_INVALID')
  return Object.freeze(attachments)
}

function object(value:unknown,keys:readonly string[]):Readonly<Record<string,unknown>> {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error('GENERATION_V2_COMPOSER_INPUT_INVALID')
  const descriptors=Object.getOwnPropertyDescriptors(value)
  if(Reflect.ownKeys(value).some(key=>typeof key!=='string')||Object.keys(descriptors).sort().join('\0')!==[...keys].sort().join('\0')||
    Object.values(descriptors).some(entry=>!entry.enumerable||!('value'in entry)||entry.value===undefined))throw new Error('GENERATION_V2_COMPOSER_INPUT_INVALID')
  return Object.freeze(Object.fromEntries(keys.map(key=>[key,descriptors[key].value])))
}
function text(value:unknown,max=512):string {if(typeof value!=='string'||value.length<1||value.length>max||value.trim()!==value)throw new Error('GENERATION_V2_COMPOSER_INPUT_INVALID');return value}
function revision(value:unknown):number {if(!Number.isSafeInteger(value)||(value as number)<0)throw new Error('GENERATION_V2_COMPOSER_INPUT_INVALID');return value as number}
function mimeForFilename(filename:string):string {
  const value:Record<string,string>={'.txt':'text/plain','.md':'text/markdown','.json':'application/json','.csv':'text/csv',
    '.html':'text/html','.htm':'text/html','.pdf':'application/pdf','.doc':'application/msword',
    '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls':'application/vnd.ms-excel','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt':'application/vnd.ms-powerpoint','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.bmp':'image/bmp',
    '.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.mp4':'video/mp4','.zip':'application/zip'}
  return value[path.extname(filename).toLowerCase()]??'application/octet-stream'
}
function mediaKindForUrl(value:string):'image'|'document'|'audio'|'video'|'other' {
  const pathname = new URL(value).pathname.toLowerCase()
  if(/\.(png|jpe?g|gif|webp|bmp|svg)$/u.test(pathname)) return 'image'
  if(/\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|json|html?)$/u.test(pathname)) return 'document'
  if(/\.(mp3|wav|m4a|ogg|flac)$/u.test(pathname)) return 'audio'
  if(/\.(mp4|webm|mov|avi)$/u.test(pathname)) return 'video'
  return 'other'
}
function safeDeclaredMime(value:string|null,filename:string):string {
  const candidate=value?.split(';',1)[0]?.trim().toLowerCase()??''
  return /^[a-z0-9!#$&^_.+*/-]+\/[a-z0-9!#$&^_.+*/-]+$/u.test(candidate) ? candidate : mimeForFilename(filename)
}
function filenameForUrl(value:string):string {
  const name=path.basename(new URL(value).pathname)
  return name && name.length <= 4096 ? name : 'remote-file'
}
const MAX_URL_IMPORT_BYTES_V2 = 50 * 1024 * 1024

export function registerGenerationV2ComposerIpc(input:Readonly<{
  registerInvoke:RegisterInvoke
  db:BetterSqlite3.Database
  attachmentBlobStore:Epoch2AttachmentBlobStoreV2
  fileSelectionGrants:FileSelectionGrantStore
  cloudFetch:ProviderFetch
  electronConversionBridge?: ElectronConversionBridge
  tempRoot?: string
  runtimesRoot?: string
  nowMs?:()=>number
}>):readonly string[] {
  const nowMs=input.nowMs??Date.now
  const drafts=new ComposerDraftV2Repo(input.db,nowMs)
  const assets=new AttachmentAssetV2Repo(input.db,nowMs)
  const dfc=new GenerationV2DfcService(input.db,input.attachmentBlobStore,nowMs,input.electronConversionBridge??null,input.tempRoot??null,input.runtimesRoot??null)
  const safe=(fn:(event:unknown,payload:unknown)=>unknown|Promise<unknown>)=>async(event:unknown,payload?:unknown)=>{
    try{return Object.freeze({ok:true,value:await fn(event,payload)})}catch(error){return Object.freeze({ok:false,
      code:error instanceof Error?error.message:'GENERATION_V2_COMPOSER_COMMAND_FAILED'})}
  }
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[0],safe((_event,payload)=>{
    const raw=object(payload,['conversationId']);return drafts.getOrCreate(text(raw.conversationId))
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[1],safe((_event,payload)=>{
    const raw=object(payload,['conversationId','expectedRevision','draftText','draftMode','editingSourceQuestionId'])
    if(typeof raw.draftText!=='string'||(raw.draftMode!=='compose'&&raw.draftMode!=='edit')||
      raw.editingSourceQuestionId!==null&&typeof raw.editingSourceQuestionId!=='string')throw new Error('GENERATION_V2_COMPOSER_INPUT_INVALID')
    return drafts.updateText({conversationId:text(raw.conversationId),expectedRevision:revision(raw.expectedRevision),draftText:raw.draftText,
      draftMode:raw.draftMode,editingSourceQuestionId:raw.editingSourceQuestionId as string|null})
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[2],safe(async(event,payload)=>{
    const raw=object(payload,['conversationId','expectedRevision','filePath','selectionGrantToken'])
    const conversationId=text(raw.conversationId),expectedRevision=revision(raw.expectedRevision)
    const token=text(raw.selectionGrantToken,1024),senderId=senderIdFromIpcEvent(event)
    if(senderId===null)throw new Error('GENERATION_V2_FILE_SELECTION_GRANT_INVALID')
    const opaque = raw.filePath === null
    const filePath = opaque
      ? (() => {
        if (!isMainFrameIpcEvent(event)) throw new Error('GENERATION_V2_FILE_SELECTION_GRANT_INVALID')
        const frameUrl = frameUrlFromIpcEvent(event)
        if (frameUrl === null) throw new Error('GENERATION_V2_FILE_SELECTION_GRANT_INVALID')
        const consumed = input.fileSelectionGrants.consumeOpaque({ senderId, token, frameUrl })
        if (!consumed.ok || !('filePath' in consumed)) throw new Error('GENERATION_V2_FILE_SELECTION_GRANT_INVALID')
        return consumed.filePath
      })()
      : text(raw.filePath,32768)
    const consumed=opaque ? { ok: true } : input.fileSelectionGrants.consume({senderId,filePath,token})
    if(!consumed.ok)throw new Error('GENERATION_V2_FILE_SELECTION_GRANT_INVALID')
    const bytes=await readFile(filePath)
    try {
      const filename=path.basename(filePath),mime=mimeForFilename(filename),persisted=input.attachmentBlobStore.persist(bytes)
      if(persisted.sha256.length!==64||persisted.sizeBytes!==bytes.byteLength)throw new Error('GENERATION_V2_ATTACHMENT_BLOB_MISMATCH')
      const assetId=`asset:${randomUUID()}`,assetRevisionId=`asset-revision:${randomUUID()}`
      return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db,context=>{
        const blob=assets.recordBlobFromBytesInAuthorityTransaction(context,bytes,mime)
        const asset=assets.createImportedAssetRevisionInAuthorityTransaction(context,{assetId,assetRevisionId,
          assetKind:mime.startsWith('image/')?'image':'file',filename,blob})
        return drafts.addAttachmentInAuthorityTransaction(context,{conversationId,expectedRevision,attachment:{
          kind:'managed_file',assetId:asset.assetId.value,assetRevisionId:asset.assetRevisionId.value,assetSha256:asset.blob.sha256.value,
          include:true,sendAs:asset.assetKind==='image'?'image_reference':'provider_file',conversion:'none',
        }})
      })
    } finally { bytes.fill(0); if (opaque) await rm(path.dirname(filePath), { recursive: true, force: true }) }
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[3],safe((_event,payload)=>{
    const raw=object(payload,['conversationId','expectedRevision','url'])
    const originalUrl=text(raw.url,16384)
    let parsed:URL
    try{parsed=new URL(originalUrl)}catch{throw new Error('GENERATION_V2_URL_REFERENCE_INVALID')}
    if((parsed.protocol!=='http:'&&parsed.protocol!=='https:')||parsed.username||parsed.password)throw new Error('GENERATION_V2_URL_REFERENCE_INVALID')
    return drafts.addUrlReference({conversationId:text(raw.conversationId),expectedRevision:revision(raw.expectedRevision),
      referenceId:`url-reference:${randomUUID()}`,referenceRevision:`url-reference-revision:${randomUUID()}`,
      originalUrl,mediaKind:mediaKindForUrl(originalUrl),declaredMediaType:null})
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[4],safe(async (_event,payload)=>{
    const raw=object(payload,['conversationId','expectedRevision','url'])
    const conversationId=text(raw.conversationId),expectedRevision=revision(raw.expectedRevision),originalUrl=text(raw.url,16384)
    let parsed:URL
    try{parsed=new URL(originalUrl)}catch{throw new Error('GENERATION_V2_URL_IMPORT_INVALID')}
    if((parsed.protocol!=='http:'&&parsed.protocol!=='https:')||parsed.username||parsed.password)throw new Error('GENERATION_V2_URL_IMPORT_INVALID')
    const response=await fetchPublicHttpUrl(originalUrl,{method:'GET'},{
      fetch:(url,init)=>input.cloudFetch(url,init),
    })
    if(!response.ok)throw new Error(`GENERATION_V2_URL_IMPORT_HTTP_${response.status}`)
    const bytes=new Uint8Array(await response.arrayBuffer())
    try {
      if(bytes.byteLength>MAX_URL_IMPORT_BYTES_V2)throw new Error('GENERATION_V2_URL_IMPORT_TOO_LARGE')
      const filename=filenameForUrl(originalUrl),mime=safeDeclaredMime(response.headers.get('content-type'),filename)
      const persisted=input.attachmentBlobStore.persist(bytes)
      if(persisted.sha256.length!==64||persisted.sizeBytes!==bytes.byteLength)throw new Error('GENERATION_V2_ATTACHMENT_BLOB_MISMATCH')
      const assetId=`asset:${randomUUID()}`,assetRevisionId=`asset-revision:${randomUUID()}`
      const capturedAt=nowMs()
      return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db,context=>{
        const blob=assets.recordBlobFromBytesInAuthorityTransaction(context,bytes,mime)
        const asset=assets.createImportedAssetRevisionInAuthorityTransaction(context,{assetId,assetRevisionId,
          assetKind:mime.startsWith('image/')?'image':'file',filename,blob,sourceKind:'url_import'})
        input.db.prepare(`INSERT INTO managed_url_import_provenance_v2
          (asset_revision_id,original_url,url_digest,captured_at_ms,provenance,created_at_ms)
          VALUES (?,?,?,?, 'user_supplied',?)`).run(asset.assetRevisionId.value,originalUrl,
          sha256PreparedBytesV2(new TextEncoder().encode(originalUrl)),capturedAt,capturedAt)
        return drafts.addAttachmentInAuthorityTransaction(context,{conversationId,expectedRevision,attachment:{
          kind:'managed_file',assetId:asset.assetId.value,assetRevisionId:asset.assetRevisionId.value,assetSha256:asset.blob.sha256.value,
          include:true,sendAs:asset.assetKind==='image'?'image_reference':'provider_file',conversion:'none',
        }})
      })
    } finally { bytes.fill(0) }
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[5],safe((_event,payload)=>{
    const raw=object(payload,['conversationId','expectedRevision','assetRevisionId'])
    return drafts.removeAttachment({conversationId:text(raw.conversationId),expectedRevision:revision(raw.expectedRevision),
      attachmentRevisionId:text(raw.assetRevisionId)})
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[6],safe((_event,payload)=>{
    const raw=object(payload,['conversationId','expectedRevision'])
    return drafts.clearCommitted({conversationId:text(raw.conversationId),expectedRevision:revision(raw.expectedRevision)})
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[7],safe((_event,payload)=>{
    const raw=object(payload,['assetId','assetRevisionId'])
    const asset=assets.getRevision(text(raw.assetId),text(raw.assetRevisionId))
    if(asset.assetKind!=='image')return Object.freeze({status:'missing' as const,dataUrl:null,mime:asset.blob.mime})
    const bytes=input.attachmentBlobStore.readRevisionBytes(asset)
    try{return Object.freeze({status:'ready' as const,dataUrl:`data:${asset.blob.mime};base64,${Buffer.from(bytes).toString('base64')}`,
      mime:asset.blob.mime,sizeBytes:asset.blob.sizeBytes})}finally{bytes.fill(0)}
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[8],safe((_event,payload)=>{
    const raw=object(payload,['conversationId','expectedRevision','draftText','draftMode','editingSourceQuestionId','attachments'])
    if(typeof raw.draftText!=='string'||(raw.draftMode!=='compose'&&raw.draftMode!=='edit')||
      raw.editingSourceQuestionId!==null&&typeof raw.editingSourceQuestionId!=='string'||!Array.isArray(raw.attachments))
      throw new Error('GENERATION_V2_COMPOSER_INPUT_INVALID')
    return drafts.replace({conversationId:text(raw.conversationId),expectedRevision:revision(raw.expectedRevision),
      draftText:raw.draftText,draftMode:raw.draftMode,editingSourceQuestionId:raw.editingSourceQuestionId as string|null,
      attachments:raw.attachments})
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[9],safe((_event,payload)=>{
    const raw=object(payload,['conversationId','expectedRevision','questionId','answerRootId','draftText'])
    const conversationId=text(raw.conversationId),questionId=text(raw.questionId),answerRootId=text(raw.answerRootId)
    if(typeof raw.draftText!=='string')throw new Error('GENERATION_V2_COMPOSER_INPUT_INVALID')
    const row=input.db.prepare(`SELECT snapshot.canonical_json AS canonicalJson FROM assistant_generation_snapshot_v2 AS snapshot
      JOIN message_v2 AS answer ON answer.message_id=snapshot.answer_root_id
      WHERE snapshot.answer_root_id=? AND answer.conversation_id=? AND answer.question_id=? AND answer.role='assistant'
        AND answer.answer_root_id=answer.message_id`).get(answerRootId,conversationId,questionId) as {canonicalJson?:unknown}|undefined
    if(!row||typeof row.canonicalJson!=='string')throw new Error('GENERATION_V2_ANSWER_SNAPSHOT_NOT_FOUND')
    const snapshot=decodeAssistantAnswerGenerationSnapshotJsonV2(row.canonicalJson)
    const attachments=projectAnswerSnapshotAttachmentIntentsV2(snapshot)
    return drafts.replace({conversationId,expectedRevision:revision(raw.expectedRevision),draftText:raw.draftText,
      draftMode:'edit',editingSourceQuestionId:questionId,attachments})
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[10],safe((_event,payload)=>{
    const raw=object(payload,['conversationId','assetId','providerId','operation'])
    if(raw.operation!=='chat_completions'&&raw.operation!=='images'&&raw.operation!=='responses')throw new Error('GENERATION_V2_COMPOSER_INPUT_INVALID')
    return dfc.ensureOptions({conversationId:text(raw.conversationId),assetId:text(raw.assetId),providerId:text(raw.providerId),operation:raw.operation})
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[11],safe((_event,payload)=>{
    const raw=object(payload,['conversationId','expectedRevision','assetId','optionId','providerId','operation'])
    if(raw.operation!=='chat_completions'&&raw.operation!=='images'&&raw.operation!=='responses')throw new Error('GENERATION_V2_COMPOSER_INPUT_INVALID')
    return dfc.select({conversationId:text(raw.conversationId),expectedRevision:revision(raw.expectedRevision),assetId:text(raw.assetId),optionId:text(raw.optionId),providerId:text(raw.providerId),operation:raw.operation})
  }))
  input.registerInvoke(GENERATION_V2_COMPOSER_CHANNELS[12],safe((_event,payload)=>{
    const raw=object(payload,['conversationId','assetId','maxCharacters'])
    return dfc.preview({conversationId:text(raw.conversationId),assetId:text(raw.assetId),maxCharacters:revision(raw.maxCharacters)})
  }))
  return GENERATION_V2_COMPOSER_CHANNELS
}
