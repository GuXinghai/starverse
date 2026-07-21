import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { decodeAssistantAnswerGenerationSnapshotJsonV2 } from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { projectGenerationCommandAttachmentsV2 } from '../../../src/next/generation-v2/domain/commandAttachmentsV2'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  registerGenerationV2AuthorityTransactionParticipantV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'
import { ComposerDraftV2Repo, type ComposerDraftAttachmentV2 } from './composerDraftV2Repo'

const EMPTY_CONFIG_JSON = '{"schemaVersion":2}'
const EMPTY_CONFIG_HASH = 'bafebd36189ad3688b7b3915ea55d461e0bfcfbdde11e54b0a123999fb6be50f'

export type NewChatLifecycleSettingsV2 = Readonly<{
  startupNavigation: 'open_new' | 'restore_last_formal' | 'projects_only'
  startupTemplateReset: Readonly<{ modelConfig: boolean; draftAttachments: boolean }>
  postSendTemplateReset: 'reset_all' | 'preserve_model_config'
}>

export type SystemChatTemplateSnapshotV2 = Readonly<{
  conversation: Readonly<{
    id: string
    projectId: string
    branchId: string
    title: string
    createdAt: number
    updatedAt: number
    meta: Readonly<Record<string, unknown>> | null
    systemKey: 'new_template'
    templateRevision: number
  }>
  draft: ReturnType<ComposerDraftV2Repo['read']>
  settings: NewChatLifecycleSettingsV2
}>

type TemplateRow = Readonly<{
  conversation_id: unknown
  project_id: unknown
  branch_id: unknown
  title: unknown
  created_at_ms: unknown
  updated_at_ms: unknown
  template_revision: unknown
  meta_json: unknown
}>

export class SystemChatTemplateV2Repo {
  constructor(private readonly db: BetterSqlite3.Database, private readonly nowMs: () => number = Date.now) {}

  ensure(
    context: GenerationV2AuthorityTransactionContextV2,
    input: Readonly<{ projectId: string; conversationId: string; branchId: string; createdAtMs: number }>,
  ): SystemChatTemplateSnapshotV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const existing = this.templateRowOrNull()
    if (existing) return this.decodeSnapshot(existing)
    if (!this.db.prepare('SELECT 1 FROM project_v2 WHERE project_id=?').get(input.projectId)) {
      throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_PROJECT_NOT_FOUND')
    }
    this.insertTemplate({ ...input, revision: 0, metaJson: null })
    return this.get()
  }

  get(): SystemChatTemplateSnapshotV2 {
    const row = this.templateRowOrNull()
    if (!row) throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_NOT_FOUND')
    return this.decodeSnapshot(row)
  }

  updateConfig(
    context: GenerationV2AuthorityTransactionContextV2,
    input: Readonly<{ templateConversationId: string; expectedTemplateRevision: number; meta: unknown }>,
  ): SystemChatTemplateSnapshotV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const metaJson = encodeMeta(input.meta)
    const at = this.safeTime(this.nowMs())
    const result = this.db.prepare(`UPDATE system_chat_template_v2
      SET meta_json=?,template_revision=template_revision+1,updated_at_ms=?
      WHERE system_key='new_template' AND conversation_id=? AND template_revision=?`).run(
      metaJson, at, input.templateConversationId, this.safeRevision(input.expectedTemplateRevision),
    )
    if (result.changes !== 1) throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_REVISION_CONFLICT')
    return this.get()
  }

  reset(
    context: GenerationV2AuthorityTransactionContextV2,
    input: Readonly<{ templateConversationId: string; expectedTemplateRevision: number;
      resetModelConfig: boolean; resetDraftAttachments: boolean }>,
  ): SystemChatTemplateSnapshotV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const row = this.templateRowOrNull()
    if (!row || row.conversation_id !== input.templateConversationId ||
        row.template_revision !== this.safeRevision(input.expectedTemplateRevision)) {
      throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_REVISION_CONFLICT')
    }
    const at = this.safeTime(this.nowMs())
    if (input.resetDraftAttachments) {
      this.db.prepare('DELETE FROM composer_draft_attachment_v2 WHERE conversation_id=?').run(input.templateConversationId)
      const draft = this.db.prepare('SELECT revision FROM composer_draft_v2 WHERE conversation_id=?')
        .get(input.templateConversationId) as { revision?: unknown } | undefined
      if (!draft || !Number.isSafeInteger(draft.revision)) throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
      const cleared = this.db.prepare(`UPDATE composer_draft_v2 SET draft_text='',draft_mode='compose',editing_source_question_id=NULL,
        revision=revision+1,updated_at_ms=? WHERE conversation_id=? AND revision=?`).run(
        at, input.templateConversationId, draft.revision,
      )
      if (cleared.changes !== 1) throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_REVISION_CONFLICT')
    }
    if (input.resetModelConfig) this.resetConversationConfig(input.templateConversationId, at)
    const result = this.db.prepare(`UPDATE system_chat_template_v2
      SET meta_json=CASE WHEN ?=1 THEN NULL ELSE meta_json END,
        template_revision=template_revision+1,updated_at_ms=?
      WHERE conversation_id=? AND template_revision=?`).run(
      input.resetModelConfig ? 1 : 0, at, input.templateConversationId, input.expectedTemplateRevision,
    )
    if (result.changes !== 1) throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_REVISION_CONFLICT')
    return this.get()
  }

  getLifecycleSettings(): NewChatLifecycleSettingsV2 {
    const row = this.db.prepare(`SELECT startup_navigation,startup_reset_model_config,
      startup_reset_draft_attachments,post_send_template_reset FROM new_chat_lifecycle_v2 WHERE singleton_id=1`)
      .get() as Record<string, unknown> | undefined
    if (!row || (row.startup_navigation !== 'open_new' && row.startup_navigation !== 'restore_last_formal' && row.startup_navigation !== 'projects_only') ||
        (row.startup_reset_model_config !== 0 && row.startup_reset_model_config !== 1) ||
        (row.startup_reset_draft_attachments !== 0 && row.startup_reset_draft_attachments !== 1) ||
        (row.post_send_template_reset !== 'reset_all' && row.post_send_template_reset !== 'preserve_model_config')) {
      throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
    }
    return Object.freeze({
      startupNavigation: row.startup_navigation,
      startupTemplateReset: Object.freeze({ modelConfig: row.startup_reset_model_config === 1,
        draftAttachments: row.startup_reset_draft_attachments === 1 }),
      postSendTemplateReset: row.post_send_template_reset,
    })
  }

  setLifecycleSettings(
    context: GenerationV2AuthorityTransactionContextV2,
    value: unknown,
  ): NewChatLifecycleSettingsV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const settings = decodeLifecycle(value)
    const result = this.db.prepare(`UPDATE new_chat_lifecycle_v2 SET startup_navigation=?,
      startup_reset_model_config=?,startup_reset_draft_attachments=?,post_send_template_reset=?,updated_at_ms=?
      WHERE singleton_id=1`).run(settings.startupNavigation, settings.startupTemplateReset.modelConfig ? 1 : 0,
      settings.startupTemplateReset.draftAttachments ? 1 : 0, settings.postSendTemplateReset, this.safeTime(this.nowMs()))
    if (result.changes !== 1) throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
    return this.getLifecycleSettings()
  }

  getLastFormalConversationId(): string | null {
    const row = this.db.prepare('SELECT last_formal_conversation_id AS value FROM new_chat_lifecycle_v2 WHERE singleton_id=1')
      .get() as { value?: unknown } | undefined
    if (!row || (row.value !== null && typeof row.value !== 'string')) throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
    return row.value as string | null
  }

  setLastFormalConversationId(
    context: GenerationV2AuthorityTransactionContextV2,
    conversationId: string | null,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (conversationId !== null && !this.db.prepare(`SELECT 1 FROM conversation_v2 AS conversation
      WHERE conversation.conversation_id=? AND NOT EXISTS (
        SELECT 1 FROM system_chat_template_v2 AS template WHERE template.conversation_id=conversation.conversation_id
      )`).get(conversationId)) throw new Error('GENERATION_V2_FORMAL_CONVERSATION_NOT_FOUND')
    this.db.prepare('UPDATE new_chat_lifecycle_v2 SET last_formal_conversation_id=?,updated_at_ms=? WHERE singleton_id=1')
      .run(conversationId, this.safeTime(this.nowMs()))
  }

  /**
   * Called from beginInitialTurn inside the provider command's one authority
   * transaction. The current template becomes the formal conversation and a
   * fresh hidden template is created before that same transaction commits.
   */
  promoteIfTemplate(
    context: GenerationV2AuthorityTransactionContextV2,
    input: Readonly<{ operationId: string; conversationId: string; branchId: string; userBody: string; createdAtMs: number }>,
  ): boolean {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const row = this.db.prepare(`SELECT template.*,conversation.project_id,conversation.title,
      conversation.created_at_ms FROM system_chat_template_v2 AS template
      JOIN conversation_v2 AS conversation ON conversation.conversation_id=template.conversation_id
      WHERE template.conversation_id=? AND template.branch_id=?`).get(input.conversationId, input.branchId) as TemplateRow | undefined
    if (!row) return false
    const draft = new ComposerDraftV2Repo(this.db, this.nowMs).read(input.conversationId)
    if (draft.draftMode !== 'compose' || draft.editingSourceQuestionId !== null || draft.draftText !== input.userBody) {
      throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_DRAFT_STALE')
    }
    if (typeof row.project_id !== 'string' || !Number.isSafeInteger(row.template_revision)) {
      throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
    }
    if ((row.template_revision as number) >= Number.MAX_SAFE_INTEGER) {
      throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
    }
    const lifecycle = this.getLifecycleSettings()
    const preserve = lifecycle.postSendTemplateReset === 'preserve_model_config'
    const nextConversationId = `conversation:new-template:${randomUUID()}`
    const nextBranchId = `branch:new-template:${randomUUID()}`
    const at = this.safeTime(input.createdAtMs)
    const metaJson = preserve && typeof row.meta_json === 'string' ? row.meta_json : null

    if (this.db.prepare(`DELETE FROM system_chat_template_v2
      WHERE conversation_id=? AND branch_id=? AND template_revision=?`).run(
      input.conversationId, input.branchId, row.template_revision,
    ).changes !== 1) throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_REVISION_CONFLICT')
    this.insertTemplate({ projectId: row.project_id, conversationId: nextConversationId,
      branchId: nextBranchId, createdAtMs: at, revision: (row.template_revision as number) + 1, metaJson })
    if (preserve) this.copyConversationConfig(input.conversationId, nextConversationId, at)
    this.db.prepare(`UPDATE new_chat_lifecycle_v2 SET last_formal_conversation_id=?,updated_at_ms=? WHERE singleton_id=1`)
      .run(input.conversationId, at)

    registerGenerationV2AuthorityTransactionParticipantV2(context, this.db, {
      preCommit: () => {
        const state = this.db.prepare(`SELECT
          (SELECT conversation_id FROM system_chat_template_v2 WHERE system_key='new_template') AS templateConversationId,
          (SELECT last_formal_conversation_id FROM new_chat_lifecycle_v2 WHERE singleton_id=1) AS lastFormalConversationId,
          (SELECT canonical_json FROM assistant_generation_snapshot_v2 WHERE operation_id=?) AS snapshotJson`)
          .get(input.operationId) as Record<string, unknown> | undefined
        if (!state || state.templateConversationId !== nextConversationId ||
            state.lastFormalConversationId !== input.conversationId || typeof state.snapshotJson !== 'string') {
          throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
        }
        const snapshot = decodeAssistantAnswerGenerationSnapshotJsonV2(state.snapshotJson)
        const snapshotAttachments = stableSerializeProviderRequestV2(
          projectGenerationCommandAttachmentsV2(snapshot.semanticIntent.attachments),
        )
        const draftAttachments = stableSerializeProviderRequestV2(projectDraftAttachments(draft.attachments))
        if (snapshotAttachments !== draftAttachments) throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_DRAFT_STALE')
      },
      committed: () => undefined,
      rolledBack: () => undefined,
    })
    return true
  }

  private insertTemplate(input: Readonly<{ projectId: string; conversationId: string; branchId: string;
    createdAtMs: number; revision: number; metaJson: string | null }>): void {
    this.db.prepare(`INSERT INTO conversation_v2(conversation_id,project_id,title,created_at_ms,updated_at_ms)
      VALUES(?,?,'',?,?)`).run(input.conversationId, input.projectId, input.createdAtMs, input.createdAtMs)
    this.db.prepare(`INSERT INTO branch_v2(branch_id,conversation_id,head_message_id,name,created_at_ms,updated_at_ms,deleted_at_ms)
      VALUES(?,?,NULL,NULL,?,?,NULL)`).run(input.branchId, input.conversationId, input.createdAtMs, input.createdAtMs)
    this.db.prepare(`INSERT INTO composer_draft_v2(conversation_id,draft_text,draft_mode,editing_source_question_id,revision,updated_at_ms)
      VALUES(?,'','compose',NULL,0,?)`).run(input.conversationId, input.createdAtMs)
    this.db.prepare(`INSERT INTO system_chat_template_v2(system_key,conversation_id,branch_id,template_revision,meta_json,created_at_ms,updated_at_ms)
      VALUES('new_template',?,?,?,?,?,?)`).run(input.conversationId, input.branchId, input.revision,
      input.metaJson, input.createdAtMs, input.createdAtMs)
  }

  private copyConversationConfig(sourceConversationId: string, targetConversationId: string, at: number): void {
    const source = this.db.prepare(`SELECT semantic_json,semantic_hash FROM generation_config_v2
      WHERE owner_kind='conversation' AND owner_id=?`).get(sourceConversationId) as Record<string, unknown> | undefined
    if (!source || typeof source.semantic_json !== 'string' || typeof source.semantic_hash !== 'string') {
      throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
    }
    if (source.semantic_json === EMPTY_CONFIG_JSON && source.semantic_hash === EMPTY_CONFIG_HASH) return
    this.db.prepare(`UPDATE generation_config_v2 SET revision_generation=2,
      config_revision='config-v2:2:'||?,semantic_json=?,semantic_hash=?,updated_at_ms=?
      WHERE owner_kind='conversation' AND owner_id=?`).run(
      source.semantic_hash, source.semantic_json, source.semantic_hash, at, targetConversationId,
    )
  }

  private resetConversationConfig(conversationId: string, at: number): void {
    const current = this.db.prepare(`SELECT revision_generation,semantic_json,semantic_hash FROM generation_config_v2
      WHERE owner_kind='conversation' AND owner_id=?`).get(conversationId) as Record<string, unknown> | undefined
    if (!current || !Number.isSafeInteger(current.revision_generation) ||
        typeof current.semantic_json !== 'string' || typeof current.semantic_hash !== 'string') {
      throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
    }
    if (current.semantic_json === EMPTY_CONFIG_JSON && current.semantic_hash === EMPTY_CONFIG_HASH) return
    const next = (current.revision_generation as number) + 1
    this.db.prepare(`UPDATE generation_config_v2 SET revision_generation=?,config_revision=?,semantic_json=?,semantic_hash=?,updated_at_ms=?
      WHERE owner_kind='conversation' AND owner_id=?`).run(
      next, `config-v2:${next}:${EMPTY_CONFIG_HASH}`, EMPTY_CONFIG_JSON, EMPTY_CONFIG_HASH, at, conversationId,
    )
  }

  private templateRowOrNull(): TemplateRow | null {
    return (this.db.prepare(`SELECT template.conversation_id,conversation.project_id,template.branch_id,conversation.title,
      conversation.created_at_ms,template.updated_at_ms,template.template_revision,template.meta_json
      FROM system_chat_template_v2 AS template JOIN conversation_v2 AS conversation
        ON conversation.conversation_id=template.conversation_id WHERE template.system_key='new_template'`)
      .get() as TemplateRow | undefined) ?? null
  }

  private decodeSnapshot(row: TemplateRow): SystemChatTemplateSnapshotV2 {
    if (typeof row.conversation_id !== 'string' || typeof row.project_id !== 'string' || typeof row.branch_id !== 'string' ||
        typeof row.title !== 'string' || !Number.isSafeInteger(row.created_at_ms) || !Number.isSafeInteger(row.updated_at_ms) ||
        !Number.isSafeInteger(row.template_revision) || (row.meta_json !== null && typeof row.meta_json !== 'string')) {
      throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
    }
    return Object.freeze({
      conversation: Object.freeze({ id: row.conversation_id, projectId: row.project_id, branchId: row.branch_id,
        title: row.title, createdAt: row.created_at_ms as number, updatedAt: row.updated_at_ms as number,
        meta: decodeMeta(row.meta_json as string | null), systemKey: 'new_template' as const,
        templateRevision: row.template_revision as number }),
      draft: new ComposerDraftV2Repo(this.db, this.nowMs).read(row.conversation_id),
      settings: this.getLifecycleSettings(),
    })
  }

  private safeRevision(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) >= Number.MAX_SAFE_INTEGER) {
      throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_INPUT_INVALID')
    }
    return value as number
  }
  private safeTime(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_INPUT_INVALID')
    return value as number
  }
}

function encodeMeta(value: unknown): string | null {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_INPUT_INVALID')
  }
  let json: string
  try { json = JSON.stringify(value) } catch { throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_INPUT_INVALID') }
  if (Buffer.byteLength(json, 'utf8') > 1024 * 1024) throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_INPUT_INVALID')
  return json
}

function decodeMeta(value: string | null): Readonly<Record<string, unknown>> | null {
  if (value === null) return null
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) throw new Error('invalid')
    return Object.freeze(parsed as Record<string, unknown>)
  } catch { throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID') }
}

function decodeLifecycle(value: unknown): NewChatLifecycleSettingsV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_INPUT_INVALID')
  }
  const raw = value as Record<string, unknown>
  const reset = raw.startupTemplateReset
  if (Object.keys(raw).sort().join('\0') !== ['postSendTemplateReset','startupNavigation','startupTemplateReset'].sort().join('\0') ||
      (raw.startupNavigation !== 'open_new' && raw.startupNavigation !== 'restore_last_formal' && raw.startupNavigation !== 'projects_only') ||
      (raw.postSendTemplateReset !== 'reset_all' && raw.postSendTemplateReset !== 'preserve_model_config') ||
      !reset || typeof reset !== 'object' || Array.isArray(reset) || Object.getPrototypeOf(reset) !== Object.prototype ||
      Object.keys(reset).sort().join('\0') !== ['draftAttachments','modelConfig'].sort().join('\0') ||
      typeof (reset as Record<string, unknown>).modelConfig !== 'boolean' ||
      typeof (reset as Record<string, unknown>).draftAttachments !== 'boolean') {
    throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_INPUT_INVALID')
  }
  return Object.freeze({ startupNavigation: raw.startupNavigation,
    startupTemplateReset: Object.freeze({ modelConfig: (reset as Record<string, unknown>).modelConfig as boolean,
      draftAttachments: (reset as Record<string, unknown>).draftAttachments as boolean }),
    postSendTemplateReset: raw.postSendTemplateReset })
}

function projectDraftAttachments(attachments: readonly ComposerDraftAttachmentV2[]): unknown {
  return attachments.map((attachment) => attachment.kind === 'managed_file'
    ? { kind: 'managed_file', assetId: attachment.assetId, assetRevisionId: attachment.assetRevisionId,
        assetSha256: attachment.assetSha256, include: attachment.include, sendAs: attachment.sendAs,
        conversion: attachment.conversion }
    : { kind: 'url_reference', referenceId: attachment.referenceId, referenceRevision: attachment.referenceRevision,
        originalUrl: attachment.originalUrl, urlDigest: attachment.urlDigest, mediaKind: attachment.mediaKind,
        ...(attachment.declaredMediaType === null ? {} : { declaredMediaType: attachment.declaredMediaType }),
        capturedAtMs: attachment.capturedAtMs, provenance: attachment.provenance, include: attachment.include,
        sendAs: attachment.sendAs, conversion: attachment.conversion })
}
