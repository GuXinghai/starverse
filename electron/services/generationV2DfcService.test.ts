import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { GenerationV2DfcService } from './generationV2DfcService'
import { FileTypeDetectionV2Repo } from '../../infra/db/repo/fileTypeDetectionV2Repo'
import { detectBasicFileTypeV2 } from '../../infra/files/fileTypeRuntimeBoundary'

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
})
