import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { AttachmentAssetV2Repo } from './attachmentAssetV2Repo'
import { ComposerDraftV2Repo } from './composerDraftV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 1, 1)
  return db
}

describe('ComposerDraftV2Repo DFC selection', () => {
  it('keeps the raw attachment as the draft anchor and clears its selection when removed', () => {
    const db = createDb()
    try {
      const assets = new AttachmentAssetV2Repo(db, () => 10)
      const drafts = new ComposerDraftV2Repo(db, () => 10)
      const sourceBlob = assets.recordBlobFromBytes(new TextEncoder().encode('# source'), 'text/markdown')
      assets.createAsset({ assetId: 'asset:source', assetKind: 'file', filename: 'source.md', sourceKind: 'user_import' })
      const source = assets.appendSourceRevision({
        assetId: 'asset:source', assetRevisionId: 'revision:source', blob: sourceBlob,
      })
      const derivedBlob = assets.recordBlobFromBytes(new TextEncoder().encode('source'), 'text/plain')
      const derived = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
        const created = assets.createDerivedAssetRevisionInAuthorityTransaction(context, {
          assetId: 'asset:derived', assetRevisionId: 'revision:derived', assetKind: 'file', filename: 'source.txt',
          parentAssetRevisionId: source.assetRevisionId.value, conversionKind: 'plain_text',
          conversionContractId: 'starverse-dfc-text-v1', conversionRevision: '1', blob: derivedBlob,
        })
        db.prepare(`INSERT INTO dfc_conversion_output_v2 (
          derived_asset_revision_id, source_asset_revision_id, target_kind, converter_contract_id,
          converter_revision, conversion_settings_digest, warnings_json, created_at_ms
        ) VALUES (?, ?, 'markdown', 'starverse-dfc-text-v1', '1', ?, '[]', 10)`).run(
          created.assetRevisionId.value, source.assetRevisionId.value, '0'.repeat(64),
        )
        return created
      })

      const initial = drafts.getOrCreate('conversation:1')
      const attached = drafts.addAttachment({
        conversationId: 'conversation:1', expectedRevision: initial.revision,
        attachment: {
          kind: 'managed_file', assetId: source.assetId.value, assetRevisionId: source.assetRevisionId.value,
          assetSha256: source.blob.sha256.value, include: true, sendAs: 'provider_file', conversion: 'none',
        },
      })
      const selected = drafts.setDfcSelection({
        conversationId: 'conversation:1', expectedRevision: attached.revision,
        sourceAssetRevisionId: source.assetRevisionId.value, selectedOptionId: 'dfc:markdown:revision:derived',
        targetKind: 'markdown', sendStrategy: 'text_in_prompt', effectiveAssetId: derived.assetId.value,
        effectiveAssetRevisionId: derived.assetRevisionId.value, effectiveAssetSha256: derived.blob.sha256.value,
      })

      expect(selected.attachments).toHaveLength(1)
      expect(selected.attachments[0]).toMatchObject({
        kind: 'managed_file', assetId: source.assetId.value, assetRevisionId: source.assetRevisionId.value,
        dfcSelection: {
          targetKind: 'markdown', sendStrategy: 'text_in_prompt', effectiveAssetId: derived.assetId.value,
          effectiveAssetRevisionId: derived.assetRevisionId.value, effectiveAssetSha256: derived.blob.sha256.value,
        },
      })

      const cleared = drafts.removeAttachment({
        conversationId: 'conversation:1', expectedRevision: selected.revision,
        attachmentRevisionId: source.assetRevisionId.value,
      })
      expect(cleared.attachments).toEqual([])
      expect(db.prepare('SELECT * FROM composer_draft_dfc_selection_v2').all()).toEqual([])
    } finally {
      db.close()
    }
  })
})
