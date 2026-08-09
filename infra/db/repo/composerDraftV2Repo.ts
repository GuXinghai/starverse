import type BetterSqlite3 from 'better-sqlite3'
import { decodeGenerationCommandAttachmentsV2 } from '../../../src/next/generation-v2/domain/commandAttachmentsV2'
import type { AttachmentIntentV2 } from '../../../src/next/generation-v2/domain/generationIntentV2'
import { readGenerationV2Digest, readGenerationV2Identity } from '../../../src/next/generation-v2/domain/identityV2'
import { sha256PreparedBytesV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { assertGenerationV2AuthorityTransactionContextV2, type GenerationV2AuthorityTransactionContextV2 } from './generationV2AuthorityTransactionInternal'

export type ComposerDraftManagedFileAttachmentV2 = Readonly<{
  kind: 'managed_file'
  assetId: string
  assetRevisionId: string
  assetSha256: string
  include: boolean
  sendAs: AttachmentIntentV2['sendAs']
  conversion: AttachmentIntentV2['conversion']
  attachmentOrder: number
  filename: string
  assetKind: 'file' | 'image'
  mime: string
  sizeBytes: number
  sourceKind: 'user_import' | 'url_import' | 'generated' | 'derived'
  originalUrl: string | null
  dfcSelection: Readonly<{
    optionId: string
    targetKind: 'original_file'|'plain_text'|'markdown'|'code'|'table_markdown'|'pdf_attachment'
    sendStrategy: 'text_in_prompt'|'file_attachment'
    effectiveAssetId: string
    effectiveAssetRevisionId: string
    effectiveAssetSha256: string
  }> | null
}>
export type ComposerDraftUrlReferenceAttachmentV2 = Readonly<{
  kind: 'url_reference'
  referenceId: string
  referenceRevision: string
  originalUrl: string
  urlDigest: string
  mediaKind: 'image' | 'document' | 'audio' | 'video' | 'other'
  declaredMediaType: string | null
  capturedAtMs: number
  provenance: 'user_supplied'
  include: boolean
  sendAs: 'url_reference'
  conversion: 'none'
  attachmentOrder: number
}>
export type ComposerDraftAttachmentV2 = ComposerDraftManagedFileAttachmentV2 | ComposerDraftUrlReferenceAttachmentV2

export type ComposerDraftV2 = Readonly<{
  conversationId: string
  draftText: string
  draftMode: 'compose' | 'edit'
  editingSourceQuestionId: string | null
  revision: number
  updatedAtMs: number
  attachments: readonly ComposerDraftAttachmentV2[]
}>

export class ComposerDraftV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DRAFT_INPUT_INVALID'
    | 'GENERATION_V2_DRAFT_NOT_FOUND'
    | 'GENERATION_V2_DRAFT_CONFLICT'
    | 'GENERATION_V2_DRAFT_STATE_INVALID'
    | 'GENERATION_V2_DRAFT_DFC_PROVENANCE_INVALID'
    | 'GENERATION_V2_DRAFT_LOCK_CONFLICT') {
    super(code)
    this.name = 'ComposerDraftV2RepoError'
  }
}

type DraftRow = { conversation_id:unknown;draft_text:unknown;draft_mode:unknown;
  editing_source_question_id:unknown;revision:unknown;updated_at_ms:unknown }
type AttachmentRow = { attachment_kind:unknown;asset_id:unknown;asset_revision_id:unknown;asset_sha256:unknown;
  url_reference_id:unknown;url_reference_revision:unknown;original_url:unknown;url_digest:unknown;media_kind:unknown;
  declared_media_type:unknown;captured_at_ms:unknown;provenance:unknown;managed_original_url:unknown;
  include_in_next_request:unknown;send_as:unknown;conversion_kind:unknown;attachment_order:unknown;
  filename:unknown;asset_kind:unknown;mime:unknown;size_bytes:unknown;source_kind:unknown;
  dfc_option_id:unknown;dfc_target_kind:unknown;dfc_send_strategy:unknown;dfc_effective_asset_id:unknown;
  dfc_effective_asset_revision_id:unknown;dfc_effective_asset_sha256:unknown }

function id(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 || value.trim() !== value) {
    throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_INPUT_INVALID')
  }
  return value
}
function time(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_INPUT_INVALID')
  return value as number
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) >= Number.MAX_SAFE_INTEGER) {
    throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_INPUT_INVALID')
  }
  return value as number
}
function text(value: unknown): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 20 * 1024 * 1024) {
    throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_INPUT_INVALID')
  }
  return value
}
function url(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 16384 || value.trim() !== value) {
    throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_INPUT_INVALID')
  }
  try {
    const parsed = new URL(value)
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) {
      throw new Error('invalid')
    }
  } catch { throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_INPUT_INVALID') }
  return value
}
function mediaType(value: string): boolean {
  return value.length >= 3 && value.length <= 255 && value === value.toLowerCase() && /^[a-z0-9!#$&^_.+*/-]+\/[a-z0-9!#$&^_.+*/-]+$/u.test(value)
}

export class ComposerDraftV2Repo {
  constructor(private readonly db: BetterSqlite3.Database, private readonly nowMs:()=>number=Date.now) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_STATE_INVALID')
  }

  getOrCreate(conversationIdValue:string):ComposerDraftV2 {
    const conversationId=id(conversationIdValue);const now=time(this.nowMs())
    this.immediate(this.db.transaction(()=>{
      const conversation=this.db.prepare('SELECT 1 FROM conversation_v2 WHERE conversation_id=?').get(conversationId)
      if(!conversation)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_NOT_FOUND')
      this.db.prepare(`INSERT INTO composer_draft_v2
        (conversation_id,draft_text,draft_mode,editing_source_question_id,revision,updated_at_ms)
        VALUES (?,'','compose',NULL,0,?) ON CONFLICT(conversation_id) DO NOTHING`).run(conversationId,now)
    }))
    return this.read(conversationId)
  }

  read(conversationIdValue:string):ComposerDraftV2 {
    const conversationId=id(conversationIdValue)
    const row=this.db.prepare(`SELECT conversation_id,draft_text,draft_mode,editing_source_question_id,revision,updated_at_ms
      FROM composer_draft_v2 WHERE conversation_id=?`).get(conversationId) as DraftRow|undefined
    if(!row)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_NOT_FOUND')
    if(row.conversation_id!==conversationId||typeof row.draft_text!=='string'||
      (row.draft_mode!=='compose'&&row.draft_mode!=='edit')||
      (row.editing_source_question_id!==null&&typeof row.editing_source_question_id!=='string')||
      !Number.isSafeInteger(row.revision)||!Number.isSafeInteger(row.updated_at_ms)) {
      throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_STATE_INVALID')
    }
    const attachments=this.db.prepare(`SELECT draft.attachment_kind,draft.asset_id,draft.asset_revision_id,draft.asset_sha256,
      draft.url_reference_id,draft.url_reference_revision,reference.original_url,reference.url_digest,reference.media_kind,
      reference.declared_media_type,reference.captured_at_ms,reference.provenance,
      managed_provenance.original_url AS managed_original_url,
      draft.include_in_next_request,draft.send_as,draft.conversion_kind,draft.attachment_order,
      asset.filename,asset.asset_kind,blob.mime,blob.size_bytes,asset.source_kind,
      selection.selected_option_id AS dfc_option_id,selection.target_kind AS dfc_target_kind,
      selection.send_strategy AS dfc_send_strategy,selection.effective_asset_id AS dfc_effective_asset_id,
      selection.effective_asset_revision_id AS dfc_effective_asset_revision_id,
      selection.effective_asset_sha256 AS dfc_effective_asset_sha256
      FROM composer_draft_attachment_v2 AS draft
      LEFT JOIN asset_revision_v2 AS asset_revision ON asset_revision.asset_revision_id=draft.asset_revision_id
      LEFT JOIN file_asset_v2 AS asset ON asset.asset_id=asset_revision.asset_id
      LEFT JOIN file_blob_v2 AS blob ON blob.blob_id=asset_revision.blob_id
      LEFT JOIN url_attachment_reference_v2 AS reference
        ON reference.reference_id=draft.url_reference_id AND reference.reference_revision=draft.url_reference_revision
      LEFT JOIN managed_url_import_provenance_v2 AS managed_provenance
        ON managed_provenance.asset_revision_id=draft.asset_revision_id
      LEFT JOIN composer_draft_dfc_selection_v2 AS selection
        ON selection.conversation_id=draft.conversation_id AND selection.source_asset_revision_id=draft.asset_revision_id
      WHERE draft.conversation_id=? ORDER BY draft.attachment_order,draft.asset_revision_id,draft.url_reference_revision`).all(conversationId) as AttachmentRow[]
    return Object.freeze({conversationId,draftText:row.draft_text,draftMode:row.draft_mode,
      editingSourceQuestionId:row.editing_source_question_id as string|null,revision:row.revision as number,
      updatedAtMs:row.updated_at_ms as number,attachments:Object.freeze(attachments.map((entry,index)=>this.decodeAttachment(entry,index)))})
  }

  updateText(value:Readonly<{conversationId:string;expectedRevision:number;draftText:string;
    draftMode:'compose'|'edit';editingSourceQuestionId:string|null}>):ComposerDraftV2 {
    const conversationId=id(value.conversationId),expectedRevision=revision(value.expectedRevision),draftText=text(value.draftText)
    if(value.draftMode!=='compose'&&value.draftMode!=='edit'||
      (value.draftMode==='compose'&&value.editingSourceQuestionId!==null)||
      (value.draftMode==='edit'&&value.editingSourceQuestionId===null)) {
      throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_INPUT_INVALID')
    }
    const editing=value.editingSourceQuestionId===null?null:id(value.editingSourceQuestionId),now=time(this.nowMs())
    this.immediate(this.db.transaction(()=>{
      const result=this.db.prepare(`UPDATE composer_draft_v2 SET draft_text=?,draft_mode=?,editing_source_question_id=?,
        revision=revision+1,updated_at_ms=? WHERE conversation_id=? AND revision=?`).run(
        draftText,value.draftMode,editing,now,conversationId,expectedRevision)
      if(result.changes!==1)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_CONFLICT')
    }))
    return this.read(conversationId)
  }

  addAttachment(value:Readonly<{conversationId:string;expectedRevision:number;attachment:unknown}>):ComposerDraftV2 {
    return this.immediate(this.db.transaction(() => this.addAttachmentInCurrentTransaction(value)))
  }

  addAttachmentInAuthorityTransaction(
    context: GenerationV2AuthorityTransactionContextV2,
    value: Readonly<{conversationId:string;expectedRevision:number;attachment:unknown}>,
  ):ComposerDraftV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    return this.addAttachmentInCurrentTransaction(value)
  }

  private addAttachmentInCurrentTransaction(value:Readonly<{conversationId:string;expectedRevision:number;attachment:unknown}>):ComposerDraftV2 {
    const conversationId=id(value.conversationId),expectedRevision=revision(value.expectedRevision)
    const attachment=decodeGenerationCommandAttachmentsV2([value.attachment])[0]
    const now=time(this.nowMs())
    const draft=this.db.prepare('SELECT revision FROM composer_draft_v2 WHERE conversation_id=?').get(conversationId) as {revision:unknown}|undefined
    if(draft?.revision!==expectedRevision)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_CONFLICT')
    const next=this.db.prepare(`SELECT COALESCE(MAX(attachment_order),-1)+1 AS value
      FROM composer_draft_attachment_v2 WHERE conversation_id=?`).get(conversationId) as {value:unknown}
    if(!Number.isSafeInteger(next.value)||(next.value as number)>65535)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_STATE_INVALID')
    this.insertAttachment(conversationId, attachment, next.value as number, now)
    this.bump(conversationId,expectedRevision,now)
    return this.read(conversationId)
  }

  addUrlReference(value: Readonly<{conversationId:string;expectedRevision:number;referenceId:string;referenceRevision:string;
    originalUrl:string;mediaKind:'image'|'document'|'audio'|'video'|'other';declaredMediaType:string|null}>): ComposerDraftV2 {
    const conversationId=id(value.conversationId),expectedRevision=revision(value.expectedRevision),referenceId=id(value.referenceId),
      referenceRevision=id(value.referenceRevision),originalUrl=url(value.originalUrl),now=time(this.nowMs())
    if (!['image','document','audio','video','other'].includes(value.mediaKind) ||
        (value.declaredMediaType !== null && !mediaType(value.declaredMediaType))) throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_INPUT_INVALID')
    return this.immediate(this.db.transaction(() => {
      const current=this.db.prepare('SELECT revision FROM composer_draft_v2 WHERE conversation_id=?').get(conversationId) as {revision:unknown}|undefined
      if(current?.revision!==expectedRevision)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_CONFLICT')
      const digest=sha256PreparedBytesV2(new TextEncoder().encode(originalUrl))
      this.db.prepare(`INSERT INTO url_attachment_reference_v2
        (reference_id,reference_revision,original_url,url_digest,media_kind,declared_media_type,captured_at_ms,provenance,created_at_ms)
        VALUES (?,?,?,?,?,?,?,'user_supplied',?)`).run(referenceId,referenceRevision,originalUrl,digest,value.mediaKind,value.declaredMediaType,now,now)
      const attachment=decodeGenerationCommandAttachmentsV2([{
        kind:'url_reference',referenceId,referenceRevision,originalUrl,urlDigest:digest,mediaKind:value.mediaKind,
        ...(value.declaredMediaType===null?{}:{declaredMediaType:value.declaredMediaType}),capturedAtMs:now,provenance:'user_supplied',
        include:true,sendAs:'url_reference',conversion:'none',
      }])[0]
      const next=this.db.prepare(`SELECT COALESCE(MAX(attachment_order),-1)+1 AS value FROM composer_draft_attachment_v2 WHERE conversation_id=?`).get(conversationId) as {value:unknown}
      if(!Number.isSafeInteger(next.value)||(next.value as number)>65535)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_STATE_INVALID')
      this.insertAttachment(conversationId,attachment,next.value as number,now)
      this.bump(conversationId,expectedRevision,now)
      return this.read(conversationId)
    }))
  }

  removeAttachment(value:Readonly<{conversationId:string;expectedRevision:number;attachmentRevisionId:string}>):ComposerDraftV2 {
    const conversationId=id(value.conversationId),expectedRevision=revision(value.expectedRevision),attachmentRevisionId=id(value.attachmentRevisionId)
    const now=time(this.nowMs())
    this.immediate(this.db.transaction(()=>{
      const current=this.db.prepare('SELECT revision FROM composer_draft_v2 WHERE conversation_id=?').get(conversationId) as {revision:unknown}|undefined
      if(current?.revision!==expectedRevision)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_CONFLICT')
      this.db.prepare(`DELETE FROM composer_draft_dfc_selection_v2 WHERE conversation_id=? AND source_asset_revision_id=?`).run(conversationId,attachmentRevisionId)
      this.db.prepare(`DELETE FROM composer_draft_attachment_v2 WHERE conversation_id=? AND (asset_revision_id=? OR url_reference_revision=?)`).run(conversationId,attachmentRevisionId,attachmentRevisionId)
      this.bump(conversationId,expectedRevision,now)
    }))
    return this.read(conversationId)
  }

  clearCommitted(value:Readonly<{conversationId:string;expectedRevision:number}>):ComposerDraftV2 {
    const conversationId=id(value.conversationId),expectedRevision=revision(value.expectedRevision),now=time(this.nowMs())
    this.immediate(this.db.transaction(()=>{
      const current=this.db.prepare('SELECT revision FROM composer_draft_v2 WHERE conversation_id=?').get(conversationId) as {revision:unknown}|undefined
      if(current?.revision!==expectedRevision)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_CONFLICT')
      this.db.prepare('DELETE FROM composer_draft_dfc_selection_v2 WHERE conversation_id=?').run(conversationId)
      this.db.prepare('DELETE FROM composer_draft_attachment_v2 WHERE conversation_id=?').run(conversationId)
      const result=this.db.prepare(`UPDATE composer_draft_v2 SET draft_text='',draft_mode='compose',editing_source_question_id=NULL,
        revision=revision+1,updated_at_ms=? WHERE conversation_id=? AND revision=?`).run(now,conversationId,expectedRevision)
      if(result.changes!==1)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_CONFLICT')
    }))
    return this.read(conversationId)
  }

  replace(value:Readonly<{conversationId:string;expectedRevision:number;draftText:string;draftMode:'compose'|'edit';
    editingSourceQuestionId:string|null;attachments:unknown}>):ComposerDraftV2 {
    const conversationId=id(value.conversationId),expectedRevision=revision(value.expectedRevision),draftText=text(value.draftText)
    if(value.draftMode!=='compose'&&value.draftMode!=='edit'||value.draftMode==='compose'&&value.editingSourceQuestionId!==null||
      value.draftMode==='edit'&&value.editingSourceQuestionId===null)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_INPUT_INVALID')
    const editing=value.editingSourceQuestionId===null?null:id(value.editingSourceQuestionId)
    const attachments=decodeGenerationCommandAttachmentsV2(value.attachments),now=time(this.nowMs())
    this.immediate(this.db.transaction(()=>{
      const current=this.db.prepare('SELECT revision FROM composer_draft_v2 WHERE conversation_id=?').get(conversationId) as {revision:unknown}|undefined
      if(current?.revision!==expectedRevision)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_CONFLICT')
      this.db.prepare('DELETE FROM composer_draft_dfc_selection_v2 WHERE conversation_id=?').run(conversationId)
      this.db.prepare('DELETE FROM composer_draft_attachment_v2 WHERE conversation_id=?').run(conversationId)
      attachments.forEach((attachment,index)=>this.insertAttachment(conversationId,attachment,index,now))
      const result=this.db.prepare(`UPDATE composer_draft_v2 SET draft_text=?,draft_mode=?,editing_source_question_id=?,
        revision=revision+1,updated_at_ms=? WHERE conversation_id=? AND revision=?`).run(
        draftText,value.draftMode,editing,now,conversationId,expectedRevision)
      if(result.changes!==1)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_CONFLICT')
    }))
    return this.read(conversationId)
  }

  setDfcSelection(value: Readonly<{
    conversationId:string; expectedRevision:number; sourceAssetRevisionId:string; selectedOptionId:string
    targetKind:'original_file'|'plain_text'|'markdown'|'code'|'table_markdown'|'pdf_attachment'
    sendStrategy:'text_in_prompt'|'file_attachment'; effectiveAssetId:string; effectiveAssetRevisionId:string; effectiveAssetSha256:string
  }>): ComposerDraftV2 {
    const conversationId=id(value.conversationId), expectedRevision=revision(value.expectedRevision), sourceAssetRevisionId=id(value.sourceAssetRevisionId),
      selectedOptionId=id(value.selectedOptionId), effectiveAssetId=id(value.effectiveAssetId), effectiveAssetRevisionId=id(value.effectiveAssetRevisionId)
    if (!['original_file','plain_text','markdown','code','table_markdown','pdf_attachment'].includes(value.targetKind) ||
        (value.sendStrategy!=='text_in_prompt'&&value.sendStrategy!=='file_attachment') ||
        typeof value.effectiveAssetSha256!=='string'||!/^[0-9a-f]{64}$/u.test(value.effectiveAssetSha256)) {
      throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_INPUT_INVALID')
    }
    this.verifyDfcSelection({
      sourceAssetRevisionId, targetKind: value.targetKind, sendStrategy: value.sendStrategy,
      effectiveAssetId, effectiveAssetRevisionId, effectiveAssetSha256: value.effectiveAssetSha256,
    })
    const now=time(this.nowMs())
    this.immediate(this.db.transaction(()=>{
      const current=this.db.prepare('SELECT revision FROM composer_draft_v2 WHERE conversation_id=?').get(conversationId) as {revision:unknown}|undefined
      if(current?.revision!==expectedRevision)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_CONFLICT')
      this.db.prepare(`INSERT INTO composer_draft_dfc_selection_v2
        (conversation_id,source_asset_revision_id,selected_option_id,target_kind,send_strategy,effective_asset_id,effective_asset_revision_id,effective_asset_sha256,selected_at_ms)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(conversation_id,source_asset_revision_id) DO UPDATE SET
          selected_option_id=excluded.selected_option_id,target_kind=excluded.target_kind,send_strategy=excluded.send_strategy,
          effective_asset_id=excluded.effective_asset_id,effective_asset_revision_id=excluded.effective_asset_revision_id,
          effective_asset_sha256=excluded.effective_asset_sha256,selected_at_ms=excluded.selected_at_ms`).run(
        conversationId,sourceAssetRevisionId,selectedOptionId,value.targetKind,value.sendStrategy,effectiveAssetId,effectiveAssetRevisionId,value.effectiveAssetSha256,now)
      this.bump(conversationId,expectedRevision,now)
    }))
    return this.read(conversationId)
  }

  private bump(conversationId:string,expectedRevision:number,now:number):void {
    const result=this.db.prepare(`UPDATE composer_draft_v2 SET revision=revision+1,updated_at_ms=?
      WHERE conversation_id=? AND revision=?`).run(now,conversationId,expectedRevision)
    if(result.changes!==1)throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_CONFLICT')
  }
  private verifyDfcSelection(value: Readonly<{
    sourceAssetRevisionId: string; targetKind: 'original_file'|'plain_text'|'markdown'|'code'|'table_markdown'|'pdf_attachment'
    sendStrategy: 'text_in_prompt'|'file_attachment'; effectiveAssetId:string; effectiveAssetRevisionId:string; effectiveAssetSha256:string
  }>): void {
    const source = this.db.prepare(`SELECT asset_id, revision_kind, retired_at_ms FROM asset_revision_v2
      JOIN file_asset_v2 USING (asset_id) WHERE asset_revision_id=?`).get(value.sourceAssetRevisionId) as Record<string, unknown> | undefined
    const effective = this.db.prepare(`SELECT r.asset_id, r.revision_kind, r.parent_asset_revision_id,
      r.conversion_kind, r.conversion_contract_id, r.conversion_revision, a.retired_at_ms, b.sha256
      FROM asset_revision_v2 r JOIN file_asset_v2 a ON a.asset_id=r.asset_id
      JOIN file_blob_v2 b ON b.blob_id=r.blob_id WHERE r.asset_id=? AND r.asset_revision_id=?`).get(
      value.effectiveAssetId, value.effectiveAssetRevisionId,
    ) as Record<string, unknown> | undefined
    if (!source || source.revision_kind !== 'source' || source.retired_at_ms !== null || !effective ||
        effective.retired_at_ms !== null || effective.sha256 !== value.effectiveAssetSha256 ||
        (value.targetKind === 'original_file' && (value.sendStrategy !== 'file_attachment' ||
          effective.asset_id !== source.asset_id || value.effectiveAssetRevisionId !== value.sourceAssetRevisionId)) ||
        (value.targetKind !== 'original_file' && value.sendStrategy !== (value.targetKind === 'pdf_attachment' ? 'file_attachment' : 'text_in_prompt')) ||
        (value.targetKind !== 'original_file' && (effective.revision_kind !== 'derived' ||
          effective.parent_asset_revision_id !== value.sourceAssetRevisionId ||
          effective.conversion_kind !== (value.targetKind === 'pdf_attachment' ? 'pdf' : 'plain_text') ||
          typeof effective.conversion_contract_id !== 'string' || typeof effective.conversion_revision !== 'string'))) {
      throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_DFC_PROVENANCE_INVALID')
    }
    if (value.targetKind !== 'original_file') {
      const output = this.db.prepare(`SELECT source_asset_revision_id, target_kind,
        converter_contract_id, converter_revision, conversion_settings_digest, json_valid(warnings_json) AS warnings_valid
        FROM dfc_conversion_output_v2 WHERE derived_asset_revision_id=?`).get(value.effectiveAssetRevisionId) as Record<string, unknown> | undefined
      if (!output || output.source_asset_revision_id !== value.sourceAssetRevisionId || output.target_kind !== value.targetKind ||
          output.converter_contract_id !== effective.conversion_contract_id || output.converter_revision !== effective.conversion_revision ||
          typeof output.conversion_settings_digest !== 'string' || !/^[0-9a-f]{64}$/u.test(output.conversion_settings_digest) ||
          output.warnings_valid !== 1) {
        throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_DFC_PROVENANCE_INVALID')
      }
    }
  }
  private insertAttachment(conversationId:string,attachment:AttachmentIntentV2,order:number,now:number):void {
    this.db.prepare(`INSERT INTO composer_draft_attachment_v2
      (conversation_id,attachment_kind,asset_id,asset_revision_id,asset_sha256,url_reference_id,url_reference_revision,
        attachment_order,include_in_next_request,send_as,conversion_kind,created_at_ms,updated_at_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(conversationId,attachment.kind,
      ...(attachment.kind==='managed_file' ? [readGenerationV2Identity(attachment.assetId,'asset_id'),
        readGenerationV2Identity(attachment.assetRevisionId,'asset_revision_id'),readGenerationV2Digest(attachment.assetSha256,'asset_sha256'),null,null]
        : [null,null,null,readGenerationV2Identity(attachment.referenceId,'url_reference_id'),readGenerationV2Identity(attachment.referenceRevision,'url_reference_revision')]),
      order,attachment.include?1:0,attachment.sendAs,attachment.conversion,now,now)
  }
  private decodeAttachment(row:AttachmentRow,_index:number):ComposerDraftAttachmentV2 {
    if(row.attachment_kind==='url_reference') {
      if(typeof row.url_reference_id!=='string'||typeof row.url_reference_revision!=='string'||typeof row.original_url!=='string'||
        typeof row.url_digest!=='string'||!['image','document','audio','video','other'].includes(String(row.media_kind))||
        row.declared_media_type!==null&&typeof row.declared_media_type!=='string'||!Number.isSafeInteger(row.captured_at_ms)||
        row.provenance!=='user_supplied'||row.include_in_next_request!==0&&row.include_in_next_request!==1||row.send_as!=='url_reference'||
        row.conversion_kind!=='none'||!Number.isSafeInteger(row.attachment_order)||(row.attachment_order as number)<0) {
        throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_STATE_INVALID')
      }
      if (sha256PreparedBytesV2(new TextEncoder().encode(row.original_url)) !== row.url_digest) {
        throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_STATE_INVALID')
      }
      return Object.freeze({kind:'url_reference' as const,referenceId:row.url_reference_id,referenceRevision:row.url_reference_revision,
        originalUrl:row.original_url,urlDigest:row.url_digest,mediaKind:row.media_kind as ComposerDraftUrlReferenceAttachmentV2['mediaKind'],
        declaredMediaType:row.declared_media_type as string|null,capturedAtMs:row.captured_at_ms as number,provenance:'user_supplied' as const,
        include:row.include_in_next_request===1,sendAs:'url_reference' as const,conversion:'none' as const,attachmentOrder:row.attachment_order as number})
    }
    if(row.attachment_kind!=='managed_file') throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_STATE_INVALID')
    if(typeof row.asset_id!=='string'||typeof row.asset_revision_id!=='string'||typeof row.asset_sha256!=='string'||
      row.include_in_next_request!==0&&row.include_in_next_request!==1||
      !['provider_file','inline_text','image_reference','converted_document'].includes(String(row.send_as))||
      !['none','pdf','plain_text','images'].includes(String(row.conversion_kind))||
      !Number.isSafeInteger(row.attachment_order)||(row.attachment_order as number)<0||
      typeof row.filename!=='string'||(row.asset_kind!=='file'&&row.asset_kind!=='image')||typeof row.mime!=='string'||
      !Number.isSafeInteger(row.size_bytes)||!['user_import','url_import','generated','derived'].includes(String(row.source_kind))) {
      throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_STATE_INVALID')
    }
    const dfcSelection = row.dfc_option_id===null&&row.dfc_target_kind===null&&row.dfc_send_strategy===null&&
      row.dfc_effective_asset_id===null&&row.dfc_effective_asset_revision_id===null&&row.dfc_effective_asset_sha256===null
      ? null : this.decodeDfcSelection(row)
    return Object.freeze({kind:'managed_file' as const,assetId:row.asset_id,assetRevisionId:row.asset_revision_id,assetSha256:row.asset_sha256,
      include:row.include_in_next_request===1,sendAs:row.send_as as AttachmentIntentV2['sendAs'],
      conversion:row.conversion_kind as AttachmentIntentV2['conversion'],attachmentOrder:row.attachment_order as number,filename:row.filename,
      assetKind:row.asset_kind,mime:row.mime,sizeBytes:row.size_bytes as number,
      sourceKind:row.source_kind as ComposerDraftManagedFileAttachmentV2['sourceKind'],
      originalUrl:row.managed_original_url===null?null:typeof row.managed_original_url==='string'?row.managed_original_url:
        (()=>{throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_STATE_INVALID')})(),dfcSelection})
  }
  private decodeDfcSelection(row:AttachmentRow):NonNullable<ComposerDraftManagedFileAttachmentV2['dfcSelection']> {
    if(typeof row.dfc_option_id!=='string'||!['original_file','plain_text','markdown','code','table_markdown','pdf_attachment'].includes(String(row.dfc_target_kind))||
      (row.dfc_send_strategy!=='text_in_prompt'&&row.dfc_send_strategy!=='file_attachment')||typeof row.dfc_effective_asset_id!=='string'||
      typeof row.dfc_effective_asset_revision_id!=='string'||typeof row.dfc_effective_asset_sha256!=='string'||
      !/^[0-9a-f]{64}$/u.test(row.dfc_effective_asset_sha256)) throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_STATE_INVALID')
    return Object.freeze({optionId:row.dfc_option_id,targetKind:row.dfc_target_kind as NonNullable<ComposerDraftManagedFileAttachmentV2['dfcSelection']>['targetKind'],
      sendStrategy:row.dfc_send_strategy,effectiveAssetId:row.dfc_effective_asset_id,effectiveAssetRevisionId:row.dfc_effective_asset_revision_id,
      effectiveAssetSha256:row.dfc_effective_asset_sha256})
  }
  private immediate<T>(transaction:{immediate():T}):T {
    try{return transaction.immediate()}catch(error){if(error instanceof ComposerDraftV2RepoError)throw error
      const code=(error as {code?:unknown})?.code;if(code==='SQLITE_BUSY'||code==='SQLITE_BUSY_SNAPSHOT'||code==='SQLITE_LOCKED')
        throw new ComposerDraftV2RepoError('GENERATION_V2_DRAFT_LOCK_CONFLICT');throw error}
  }
}
