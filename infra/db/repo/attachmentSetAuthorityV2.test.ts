import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  decodeGenerationIntentLayerV2,
  type AttachmentIntentV2,
} from '../../../src/next/generation-v2/domain/generationIntentV2'
import {
  decodeResolvedGenerationIntentV2,
  type DecodedResolvedGenerationIntentV2,
} from '../../../src/next/generation-v2/domain/resolvedGenerationIntentV2'
import { applyGenerationV2SchemaForTest as applyGenerationV2Schema } from '../v2/testSchemaV2'
import {
  AttachmentAssetV2Repo,
  consumeVerifiedAttachmentSendBytesLeaseV2,
  isResolvedAttachmentAssetAuthorityV2,
  isResolvedAttachmentSetAuthorityV2,
  isVerifiedAttachmentSendBytesLeaseV2,
  type ResolvedAttachmentSetAuthorityV2,
  type VerifiedAttachmentSendBytesLeaseV2,
} from './attachmentAssetV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'

const root = path.resolve(process.cwd())

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, root)
  return db
}

function createAttachment(
  repo: AttachmentAssetV2Repo,
  value: Readonly<{
    assetId: string
    revisionId: string
    bytes: readonly number[]
    include: boolean
    sendAs: 'provider_file' | 'converted_document' | 'inline_text'
    conversion?: 'none' | 'pdf'
  }>,
  db?: BetterSqlite3.Database,
): Readonly<{ intent: AttachmentIntentV2; bytes: Uint8Array }> {
  const bytes = new Uint8Array(value.bytes)
  const blob = repo.recordBlobFromBytes(bytes, 'application/octet-stream')
  const isDerivedPdf = value.conversion === 'pdf'
  const sourceAssetId = isDerivedPdf ? `${value.assetId}:source` : value.assetId
  repo.createAsset({
    assetId: sourceAssetId,
    assetKind: 'file',
    filename: `${sourceAssetId}.bin`,
    sourceKind: 'user_import',
  })
  const sourceRevisionId = value.conversion === 'pdf' ? `${value.revisionId}:source` : value.revisionId
  repo.appendSourceRevision({ assetId: sourceAssetId, assetRevisionId: sourceRevisionId, blob })
  const effectiveBlob = value.conversion === 'pdf'
    ? repo.recordBlobFromBytes(new Uint8Array([...bytes, 0]), 'application/pdf')
    : blob
  if (value.conversion === 'pdf') {
    repo.createDerivedAssetRevision({
      assetId: value.assetId, assetRevisionId: value.revisionId, assetKind: 'file',
      filename: `${value.assetId}.pdf`, parentAssetRevisionId: sourceRevisionId,
      conversionKind: 'pdf', conversionContractId: 'test-pdf', conversionRevision: '1', blob: effectiveBlob,
    })
    db!.prepare(`INSERT INTO dfc_conversion_output_v2 (
      derived_asset_revision_id, source_asset_revision_id, target_kind, converter_contract_id,
      converter_revision, conversion_settings_digest, warnings_json, created_at_ms
    ) VALUES (?, ?, 'pdf_attachment', 'test-pdf', '1', ?, '[]', 10)`).run(
      value.revisionId, sourceRevisionId, '0'.repeat(64),
    )
  }
  const layer = decodeGenerationIntentLayerV2({
    schemaVersion: 2,
    attachments: [{
      kind: 'managed_file',
      assetId: value.assetId,
      assetRevisionId: value.revisionId,
      assetSha256: effectiveBlob.sha256.value,
      include: value.include,
      sendAs: value.sendAs,
      conversion: value.conversion ?? 'none',
    }],
  })
  return Object.freeze({ intent: layer.attachments![0], bytes })
}

function resolvedIntent(
  attachments: readonly AttachmentIntentV2[],
): DecodedResolvedGenerationIntentV2 {
  return decodeResolvedGenerationIntentV2({
    schemaVersion: 2,
    generation: {},
    reasoning: { mode: 'disabled' },
    web: { mode: 'disabled' },
    image: { mode: 'disabled' },
    tools: { mode: 'disabled' },
    attachments: attachments.map((attachment) => attachment.kind === 'managed_file'
      ? {
          kind: attachment.kind,
          assetId: attachment.assetId.value,
          assetRevisionId: attachment.assetRevisionId.value,
          assetSha256: attachment.assetSha256.value,
          include: attachment.include,
          sendAs: attachment.sendAs,
          conversion: attachment.conversion,
        }
      : {
          kind: attachment.kind,
          referenceId: attachment.referenceId.value,
          referenceRevision: attachment.referenceRevision.value,
          originalUrl: attachment.originalUrl,
          urlDigest: attachment.urlDigest.value,
          mediaKind: attachment.mediaKind,
          ...(attachment.declaredMediaType === undefined ? {} : { declaredMediaType: attachment.declaredMediaType }),
          capturedAtMs: attachment.capturedAtMs,
          provenance: attachment.provenance,
          include: attachment.include,
          sendAs: attachment.sendAs,
          conversion: attachment.conversion,
        }),
    providerExtension: { kind: 'none' },
  })
}

describe('ResolvedAttachmentSetAuthorityV2', () => {
  it('requires every URL reference in the command snapshot to equal its immutable database record', () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db)
      const originalUrl = 'https://example.test/asset.png'
      const digest = '0d43c3d906ca6f47ce052ed1865b91a8771dc1463a71ae8523e70053dcdd495c'
      db.prepare(`INSERT INTO url_attachment_reference_v2
        (reference_id, reference_revision, original_url, url_digest, media_kind, declared_media_type,
         captured_at_ms, provenance, created_at_ms)
        VALUES (?, ?, ?, ?, 'image', 'image/png', 10, 'user_supplied', 10)`)
        .run('reference:1', 'reference-revision:1', originalUrl,
          digest)
      const urlIntent = decodeGenerationIntentLayerV2({
        schemaVersion: 2,
        attachments: [{
          kind: 'url_reference', referenceId: 'reference:1', referenceRevision: 'reference-revision:1',
          originalUrl, urlDigest: digest,
          mediaKind: 'image', declaredMediaType: 'image/png', capturedAtMs: 10, provenance: 'user_supplied',
          include: true, sendAs: 'url_reference', conversion: 'none',
        }],
      }).attachments![0]
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.withSynchronousResolvedIntentAttachmentSetAuthority(context, resolvedIntent([urlIntent]), (authority) => {
          expect(authority.attachments).toEqual([])
          expect(authority.urlReferenceIntents).toHaveLength(1)
          expect(authority.urlReferenceIntents[0].originalUrl).toBe(originalUrl)
        }),
      )
      const forged = decodeGenerationIntentLayerV2({
        schemaVersion: 2,
        attachments: [{
          kind: 'url_reference', referenceId: 'reference:1', referenceRevision: 'reference-revision:1',
          originalUrl: 'https://example.test/other.png', urlDigest: digest, mediaKind: 'image',
          declaredMediaType: 'image/png', capturedAtMs: 10, provenance: 'user_supplied', include: true,
          sendAs: 'url_reference', conversion: 'none',
        }],
      }).attachments![0]
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.withSynchronousResolvedIntentAttachmentSetAuthority(context, resolvedIntent([forged]), () => undefined),
      )).toThrow('GENERATION_V2_URL_REFERENCE_INTENT_MISMATCH')
    } finally { db.close() }
  })

  it('proves an empty complete set and therefore an empty provider-file requirement set', () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db)
      let escaped: ResolvedAttachmentSetAuthorityV2 | undefined
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.withSynchronousResolvedIntentAttachmentSetAuthority(context, resolvedIntent([]), (authority) => {
          escaped = authority
          expect(isResolvedAttachmentSetAuthorityV2(authority)).toBe(true)
          expect(authority).toMatchObject({
            trust: 'resolved_attachment_set_authority',
            usage: 'resolved_intent_attachment_set_verified',
            attachments: [],
            providerFileRequirements: [],
            requiresProviderFileAuthority: false,
          })
          expect(Object.isFrozen(authority)).toBe(true)
          expect(Object.isFrozen(authority.attachments)).toBe(true)
          expect(Object.isFrozen(authority.providerFileRequirements)).toBe(true)
        }),
      )
      expect(isResolvedAttachmentSetAuthorityV2(escaped)).toBe(false)
    } finally { db.close() }
  })

  it('resolves the whole ordered set and derives every included provider-file handle requirement', async () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db)
      const first = createAttachment(repo, {
        assetId: 'asset:b', revisionId: 'revision:b', bytes: [2], include: true, sendAs: 'provider_file',
      })
      const second = createAttachment(repo, {
        assetId: 'asset:a', revisionId: 'revision:a', bytes: [1], include: true, sendAs: 'inline_text',
      })
      const third = createAttachment(repo, {
        assetId: 'asset:c', revisionId: 'revision:c', bytes: [3], include: false, sendAs: 'provider_file',
      })
      const convertedPdf = createAttachment(repo, {
        assetId: 'asset:d', revisionId: 'revision:d', bytes: [4], include: true,
        sendAs: 'converted_document', conversion: 'pdf',
      }, db)
      let escaped: ResolvedAttachmentSetAuthorityV2 | undefined
      let escapedItem: unknown
      const lease = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.withSynchronousResolvedIntentAttachmentSetAuthority(
          context, resolvedIntent([first.intent, second.intent, third.intent, convertedPdf.intent]), (authority) => {
            escaped = authority
            escapedItem = authority.attachments[0]
            expect(authority.attachments.map((item) => {
              if (item.intent.kind !== 'managed_file') throw new Error('test fixture must be managed_file')
              return item.intent.assetId.value
            }))
              .toEqual(['asset:b', 'asset:a', 'asset:c', 'asset:d'])
            expect(authority.providerFileRequirements.map((item) => item.assetRevisionId.value))
              .toEqual(['revision:b', 'revision:d'])
            expect(authority.requiresProviderFileAuthority).toBe(true)
            expect(authority.providerFileRequirements[0]).not.toHaveProperty('descriptorId')
            return repo.verifyAttachmentSendBytes(authority.attachments[0], first.bytes)
          },
        ),
      )
      expect(isResolvedAttachmentSetAuthorityV2(escaped)).toBe(false)
      expect(isResolvedAttachmentAssetAuthorityV2(escapedItem)).toBe(false)
      expect(isVerifiedAttachmentSendBytesLeaseV2(lease)).toBe(true)
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(lease, (bytes) => [...bytes]))
        .resolves.toEqual([2])
    } finally { db.close() }
  })

  it('derives from one branded resolved intent and rejects forged or hostile replacements', () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db)
      const attachment = createAttachment(repo, {
        assetId: 'asset:1', revisionId: 'revision:1', bytes: [1], include: true, sendAs: 'inline_text',
      })
      const duplicateRevision = decodeGenerationIntentLayerV2({
        schemaVersion: 2,
        attachments: [{
          kind: 'managed_file',
          assetId: 'asset:other', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64),
          include: true, sendAs: 'inline_text', conversion: 'none',
        }],
      }).attachments![0]
      const run = (value: DecodedResolvedGenerationIntentV2) =>
        runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
          repo.withSynchronousResolvedIntentAttachmentSetAuthority(context, value, () => undefined),
        )
      expect(() => run([] as never))
        .toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
      expect(() => run({ ...resolvedIntent([attachment.intent]) } as never))
        .toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
      expect(() => run(resolvedIntent([attachment.intent, duplicateRevision])))
        .toThrow('GENERATION_V2_ASSET_DUPLICATE_REFERENCE')
      let reads = 0
      const accessor = Object.defineProperty({}, 'value', {
        enumerable: true,
        get: () => { reads += 1; return resolvedIntent([attachment.intent]).value },
      })
      expect(() => run(accessor as DecodedResolvedGenerationIntentV2))
        .toThrow('GENERATION_V2_ASSET_INPUT_INVALID')
      expect(reads).toBe(0)
    } finally { db.close() }
  })

  it('fails the whole set before callback when any reference is missing, retired or mismatched', () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db, () => 20)
      const valid = createAttachment(repo, {
        assetId: 'asset:valid', revisionId: 'revision:valid', bytes: [1], include: true, sendAs: 'inline_text',
      })
      const other = createAttachment(repo, {
        assetId: 'asset:other', revisionId: 'revision:other', bytes: [3], include: true, sendAs: 'inline_text',
      })
      const retired = createAttachment(repo, {
        assetId: 'asset:retired', revisionId: 'revision:retired', bytes: [2], include: true, sendAs: 'inline_text',
      })
      repo.retireAsset('asset:retired')
      const missing = decodeGenerationIntentLayerV2({
        schemaVersion: 2,
        attachments: [{
          kind: 'managed_file',
          assetId: 'asset:missing', assetRevisionId: 'revision:missing', assetSha256: 'a'.repeat(64),
          include: true, sendAs: 'inline_text', conversion: 'none',
        }],
      }).attachments![0]
      const mismatch = decodeGenerationIntentLayerV2({
        schemaVersion: 2,
        attachments: [{
          kind: 'managed_file',
          assetId: 'asset:valid', assetRevisionId: 'revision:valid', assetSha256: 'b'.repeat(64),
          include: true, sendAs: 'inline_text', conversion: 'none',
        }],
      }).attachments![0]
      let calls = 0
      const attempt = (intents: readonly AttachmentIntentV2[]) =>
        runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
          repo.withSynchronousResolvedIntentAttachmentSetAuthority(
            context, resolvedIntent(intents), () => { calls += 1 },
          ),
        )
      expect(() => attempt([valid.intent, missing])).toThrow('GENERATION_V2_ASSET_NOT_FOUND')
      expect(() => attempt([valid.intent, retired.intent])).toThrow('GENERATION_V2_ASSET_RETIRED')
      expect(() => attempt([other.intent, mismatch])).toThrow('GENERATION_V2_ASSET_INTENT_MISMATCH')
      expect(calls).toBe(0)
    } finally { db.close() }
  })

  it('revalidates the complete set before commit and revokes pending bytes on rollback', async () => {
    const db = createDb()
    try {
      let now = 10
      const repo = new AttachmentAssetV2Repo(db, () => now)
      const attachment = createAttachment(repo, {
        assetId: 'asset:1', revisionId: 'revision:1', bytes: [1], include: true, sendAs: 'inline_text',
      })
      let lease: VerifiedAttachmentSendBytesLeaseV2 | undefined
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.withSynchronousResolvedIntentAttachmentSetAuthority(
          context, resolvedIntent([attachment.intent]), (authority) => {
          lease = repo.verifyAttachmentSendBytes(authority.attachments[0], attachment.bytes)
          now = 30
          repo.retireAsset('asset:1')
          },
        ),
      )).toThrow('GENERATION_V2_ASSET_RETIRED')
      expect(db.prepare('SELECT retired_at_ms FROM file_asset_v2 WHERE asset_id = ?').get('asset:1'))
        .toEqual({ retired_at_ms: null })
      expect(isVerifiedAttachmentSendBytesLeaseV2(lease)).toBe(false)
      await expect(consumeVerifiedAttachmentSendBytesLeaseV2(lease!, () => undefined))
        .rejects.toThrow('GENERATION_V2_ASSET_BYTES_DISPOSED')
    } finally { db.close() }
  })

  it('taints the transaction when a set callback fails even if its error is caught', () => {
    const db = createDb()
    try {
      const repo = new AttachmentAssetV2Repo(db)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        try {
          repo.withSynchronousResolvedIntentAttachmentSetAuthority(context, resolvedIntent([]), () => {
            throw new Error('caught locally')
          })
        } catch { /* a failed complete-set participant cannot be ignored */ }
      })).toThrow('GENERATION_V2_ASSET_STATE_INVALID')
    } finally { db.close() }
  })
})
