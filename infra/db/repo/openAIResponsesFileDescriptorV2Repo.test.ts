import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'
import { OpenAIResponsesFileDescriptorV2Repo } from './openAIResponsesFileDescriptorV2Repo'

const root = path.resolve(process.cwd())
const scope = 'credential-scope:openai:test'
const revision = 'asset-revision:test'
const sha256 = 'a'.repeat(64)

function createRepo() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, root)
  // The descriptor only needs a valid revision foreign-key target. Blob and
  // asset data are intentionally immutable and are not faked by the repo.
  db.prepare(`INSERT INTO file_blob_v2 (
    blob_id, sha256, size_bytes, mime, storage_ref, created_at_ms
  ) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(`blob-v2:${sha256}`, sha256, 1, 'text/plain', `sha256/aa/${sha256}`, 1)
  db.prepare(`INSERT INTO file_asset_v2 (
    asset_id, asset_kind, filename, source_kind, created_at_ms, retired_at_ms
  ) VALUES (?, ?, ?, ?, ?, NULL)`).run('asset:test', 'file', 'test.txt', 'user_import', 1)
  db.prepare(`INSERT INTO asset_revision_v2 (
    asset_revision_id, asset_id, blob_id, parent_asset_revision_id, revision_kind,
    conversion_kind, conversion_contract_id, conversion_revision, created_at_ms
  ) VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, ?)`)
    .run(revision, 'asset:test', `blob-v2:${sha256}`, 'source', 'none', 1)
  return { db, repo: new OpenAIResponsesFileDescriptorV2Repo(db, () => 2) }
}

describe('OpenAI Responses V2 immutable file descriptor repository', () => {
  it('binds one exact user_data file id to credential scope and asset revision', () => {
    const { db, repo } = createRepo()
    try {
      const descriptor = repo.insertOrGet({
        credentialScopeId: scope, assetRevisionId: revision, assetSha256: sha256, fileId: 'file_abc123',
      })
      expect(descriptor).toMatchObject({
        endpointProfileId: { value: 'openai-api-v1' }, fileId: 'file_abc123', purpose: 'user_data',
      })
      expect(repo.insertOrGet({
        credentialScopeId: scope, assetRevisionId: revision, assetSha256: sha256, fileId: 'file_abc123',
      }).descriptorHash.value).toBe(descriptor.descriptorHash.value)
      expect(repo.findByAttachment({
        credentialScopeId: scope, assetRevisionId: revision, assetSha256: sha256,
      })?.descriptorId.value).toBe(descriptor.descriptorId.value)
      expect(() => repo.findByAttachment({
        credentialScopeId: scope, assetRevisionId: revision, assetSha256: 'b'.repeat(64),
      })).toThrow('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_STATE_INVALID')
      expect(() => repo.insertOrGet({
        credentialScopeId: scope, assetRevisionId: revision, assetSha256: sha256, fileId: 'file_other',
      })).toThrow('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_CONFLICT')
      const loaded = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.loadForSnapshot(context, {
          descriptorId: descriptor.descriptorId.value,
          descriptorRevision: descriptor.descriptorRevision.value,
          descriptorHash: descriptor.descriptorHash.value,
          credentialScopeId: scope, assetRevisionId: revision, assetSha256: sha256,
        }),
      )
      expect(loaded.fileId).toBe('file_abc123')
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.loadForSnapshot(context, {
          descriptorId: descriptor.descriptorId.value,
          descriptorRevision: descriptor.descriptorRevision.value,
          descriptorHash: descriptor.descriptorHash.value,
          credentialScopeId: scope, assetRevisionId: revision, assetSha256: 'b'.repeat(64),
        }),
      )).toThrow('GENERATION_V2_OPENAI_FILE_DESCRIPTOR_NOT_FOUND')
    } finally { db.close() }
  })
})
