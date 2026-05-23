import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FileAssetRepo } from './fileAssetRepo'
import { FileDerivativeRepo } from './fileDerivativeRepo'
import { DerivativeJobRepo } from './derivativeJobRepo'
import { MessageAttachmentRepo } from './messageAttachmentRepo'
import { MessageRepo } from './messageRepo'
import { ConversationDraftRepo } from './conversationDraftRepo'
import { canOpenBetterSqliteForSuite } from '../../testUtils/betterSqliteGate'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('filePipelineRepo') ? describe : describe.skip

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function insertConvo(db: BetterSqlite3.Database, id: string) {
  const now = Date.now()
  db.prepare(`
    INSERT INTO convo(id, project_id, title, created_at, updated_at, meta)
    VALUES (@id, NULL, @title, @createdAt, @updatedAt, NULL)
  `).run({
    id,
    title: 'File Pipeline',
    createdAt: now,
    updatedAt: now,
  })
}

describeIfBetterSqlite('FileAssetRepo', () => {
  it('creates, reads, lists, and soft-deletes file assets without cross-session dedupe', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const repo = new FileAssetRepo(db)

    const first = repo.create({
      id: 'asset-1',
      sha256: 'same-sha',
      filename: 'report.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 12,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.pdf',
      ingestStatus: 'stored',
    })
    const second = repo.create({
      id: 'asset-2',
      sha256: 'same-sha',
      filename: 'report-copy.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 12,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-2.pdf',
      ingestStatus: 'stored',
    })

    expect(repo.getById(first.id)).toMatchObject({
      id: 'asset-1',
      sha256: 'same-sha',
      storageBackend: 'local_fs',
      previewStatus: 'not_requested',
      deletedAt: null,
    })
    expect(repo.listByIds({ ids: [first.id, second.id] })).toHaveLength(2)

    const result = repo.softDelete({ id: first.id, deletedAt: 1234 })
    expect(result).toEqual({ ok: true, softDeleted: true, physicalCleanupRequired: true })
    expect(repo.getById(first.id)).toMatchObject({
      ingestStatus: 'deleted',
      deletedAt: 1234,
      storageUri: 'assets/original/as/asset-1.pdf',
    })
    expect(repo.getById(second.id)?.deletedAt).toBeNull()
  })
})

describeIfBetterSqlite('FileDerivativeRepo', () => {
  it('creates derivatives, lists them by parent asset id, and resolves the latest ready derivative', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const assetRepo = new FileAssetRepo(db)
    const derivativeRepo = new FileDerivativeRepo(db)

    assetRepo.create({
      id: 'asset-1',
      sha256: 'sha',
      filename: 'report.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 12,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.pdf',
    })
    derivativeRepo.create({
      id: 'derivative-1',
      parentAssetId: 'asset-1',
      derivedKind: 'extracted_text',
      mime: 'text/plain',
      storageUri: 'assets/derived/asset-1/derivative-1.txt',
      generator: 'phase-2-test',
      status: 'ready',
      metaJson: { chars: 42 },
      createdAt: 1,
    })
    derivativeRepo.create({
      id: 'derivative-2',
      parentAssetId: 'asset-1',
      derivedKind: 'extracted_text',
      mime: 'text/plain',
      storageUri: 'assets/derived/asset-1/derivative-2.txt',
      generator: 'phase-7-test',
      status: 'ready',
      metaJson: { chars: 84 },
      createdAt: 2,
    })

    expect(derivativeRepo.listByParentAssetId({ parentAssetId: 'asset-1' })).toEqual([
      expect.objectContaining({
        id: 'derivative-1',
        parentAssetId: 'asset-1',
        derivedKind: 'extracted_text',
        status: 'ready',
        metaJson: { chars: 42 },
      }),
      expect.objectContaining({
        id: 'derivative-2',
        metaJson: { chars: 84 },
      }),
    ])
    expect(derivativeRepo.getLatestReady({ parentAssetId: 'asset-1', derivedKind: 'extracted_text' })).toEqual(
      expect.objectContaining({ id: 'derivative-2', metaJson: { chars: 84 } })
    )
  })
})

describeIfBetterSqlite('DerivativeJobRepo', () => {
  it('creates, reads, lists, and updates derivative job lifecycle state', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const assetRepo = new FileAssetRepo(db)
    const repo = new DerivativeJobRepo(db)

    assetRepo.create({
      id: 'asset-1',
      sha256: 'sha',
      filename: 'note.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 4,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.txt',
      ingestStatus: 'stored',
    })

    const created = repo.create({
      id: 'job-1',
      assetId: 'asset-1',
      derivativeKind: 'embedding_vector',
      taskFamily: 'embeddings',
      generator: 'phase-7-test',
      modelId: 'openai/text-embedding-3-small',
      configJson: { modelId: 'openai/text-embedding-3-small' },
    })
    expect(created.status).toBe('pending')

    const running = repo.markRunning(created.id, 1, 10)
    expect(running).toMatchObject({ status: 'running', attemptCount: 1, startedAt: 10 })

    const failed = repo.markFailed(created.id, 'embedding_request_failed', 'boom', 20)
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'embedding_request_failed', finishedAt: 20 })

    const retried = repo.resetForRetry(created.id, 30)
    expect(retried).toMatchObject({ status: 'pending', errorCode: null, finishedAt: null, updatedAt: 30 })

    const cancelled = repo.markCancelled({ jobId: created.id, reason: 'stop' })
    expect(cancelled).toMatchObject({ status: 'cancelled', errorCode: 'derivative_task_cancelled' })

    expect(repo.getById(created.id)).toMatchObject({ id: 'job-1' })
    expect(repo.listByAssetId({ assetId: 'asset-1' })).toHaveLength(1)
  })
})

describeIfBetterSqlite('MessageAttachmentRepo', () => {
  it('creates message attachments and lists by message id or asset id', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')
    const message = new MessageRepo(db).append({ convoId: 'c1', role: 'user', body: 'see attachment' })
    const assetRepo = new FileAssetRepo(db)
    const attachmentRepo = new MessageAttachmentRepo(db)

    const asset = assetRepo.create({
      id: 'asset-1',
      sha256: 'sha',
      filename: 'image.png',
      extension: 'png',
      mime: 'image/png',
      sizeBytes: 8,
      assetKind: 'image',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.png',
      ingestStatus: 'stored',
    })
    const attachment = attachmentRepo.create({
      id: 'attachment-1',
      messageId: message.id,
      assetId: asset.id,
      aiPayloadKind: 'image',
      processingStatus: 'native_supported',
      includeInNextRequest: true,
    })

    expect(attachment).toMatchObject({
      id: 'attachment-1',
      messageId: message.id,
      assetId: asset.id,
      includeInNextRequest: true,
      excludedReason: null,
    })
    expect(attachmentRepo.listByMessageId({ messageId: message.id })).toHaveLength(1)
    expect(attachmentRepo.listByAssetId({ assetId: asset.id })).toHaveLength(1)
  })

  it('roundtrips explicit DFC message bindings without reading legacy fields', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')
    const message = new MessageRepo(db).append({ convoId: 'c1', role: 'user', body: 'see attachment' })
    const assetRepo = new FileAssetRepo(db)
    const attachmentRepo = new MessageAttachmentRepo(db)

    const asset = assetRepo.create({
      id: 'asset-dfc',
      sha256: 'sha-dfc',
      filename: 'note.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 8,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-dfc.txt',
      ingestStatus: 'stored',
    })
    const usedAssetRefs = [{ kind: 'derived_asset' as const, assetId: 'derivative-markdown' }]

    const attachment = attachmentRepo.create({
      id: 'attachment-dfc',
      messageId: message.id,
      assetId: asset.id,
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
      includeInNextRequest: true,
      dfcManaged: true,
      usedOptionId: 'option-markdown',
      usedAssetRefs,
      targetKind: 'markdown',
      sendStrategy: 'text_in_prompt',
    })

    expect(attachment).toMatchObject({
      id: 'attachment-dfc',
      dfcManaged: true,
      usedOptionId: 'option-markdown',
      usedAssetRefs,
      targetKind: 'markdown',
      sendStrategy: 'text_in_prompt',
    })
    expect(attachmentRepo.listByMessageId({ messageId: message.id })).toEqual([
      expect.objectContaining({
        dfcManaged: true,
        usedOptionId: 'option-markdown',
        usedAssetRefs,
        targetKind: 'markdown',
        sendStrategy: 'text_in_prompt',
      }),
    ])
  })

  it('rejects message DFC binding fields unless the row is explicitly DFC-managed', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')
    const message = new MessageRepo(db).append({ convoId: 'c1', role: 'user', body: 'legacy' })
    const assetRepo = new FileAssetRepo(db)
    const attachmentRepo = new MessageAttachmentRepo(db)
    const asset = assetRepo.create({
      id: 'asset-legacy',
      sha256: 'sha-legacy',
      filename: 'legacy.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 8,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-legacy.txt',
      ingestStatus: 'stored',
    })

    expect(() => attachmentRepo.create({
      id: 'attachment-legacy',
      messageId: message.id,
      assetId: asset.id,
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
      usedOptionId: 'legacy-selected-send-mode',
    })).toThrow('DFC message binding fields require dfcManaged true')
  })

  it('rejects DFC-managed message rows with empty or missing used asset refs', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')
    const message = new MessageRepo(db).append({ convoId: 'c1', role: 'user', body: 'dfc empty' })
    const assetRepo = new FileAssetRepo(db)
    const attachmentRepo = new MessageAttachmentRepo(db)
    assetRepo.create({
      id: 'asset-message-empty',
      sha256: 'sha-message-empty',
      filename: 'empty.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 8,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-message-empty.txt',
      ingestStatus: 'stored',
    })

    expect(() => attachmentRepo.create({
      id: 'attachment-message-empty',
      messageId: message.id,
      assetId: 'asset-message-empty',
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
      dfcManaged: true,
      usedOptionId: 'option-empty',
      usedAssetRefs: [],
      targetKind: 'plain_text',
      sendStrategy: 'text_in_prompt',
    })).toThrow('DFC-managed attachment requires at least one SendAssetRef')

    db.prepare(`
      INSERT INTO message_attachments(
        id,
        message_id,
        asset_id,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        dfc_managed,
        used_option_id,
        used_asset_refs_json,
        target_kind,
        send_strategy,
        created_at,
        updated_at
      ) VALUES (
        'attachment-message-null',
        @messageId,
        'asset-message-empty',
        'text',
        'native_supported',
        1,
        NULL,
        1,
        'option-null',
        NULL,
        'plain_text',
        'text_in_prompt',
        1,
        1
      )
    `).run({ messageId: message.id })

    expect(() => attachmentRepo.listByMessageId({ messageId: message.id })).toThrow(
      'DFC-managed attachment requires at least one SendAssetRef'
    )
  })

  it('does not silently coerce malformed DFC message asset refs to an empty binding', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')
    const message = new MessageRepo(db).append({ convoId: 'c1', role: 'user', body: 'dfc malformed' })
    const assetRepo = new FileAssetRepo(db)
    const attachmentRepo = new MessageAttachmentRepo(db)
    assetRepo.create({
      id: 'asset-message-malformed',
      sha256: 'sha-message-malformed',
      filename: 'malformed.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 8,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-message-malformed.txt',
      ingestStatus: 'stored',
    })
    attachmentRepo.create({
      id: 'attachment-message-malformed',
      messageId: message.id,
      assetId: 'asset-message-malformed',
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
      dfcManaged: true,
      usedOptionId: 'option-malformed',
      usedAssetRefs: [{ kind: 'derived_asset', assetId: 'derivative-malformed' }],
      targetKind: 'plain_text',
      sendStrategy: 'text_in_prompt',
    })
    db.prepare(`
      UPDATE message_attachments
      SET used_asset_refs_json = @value
      WHERE id = 'attachment-message-malformed'
    `).run({ value: 'not-json' })

    expect(() => attachmentRepo.listByMessageId({ messageId: message.id })).toThrow()
  })
})

describeIfBetterSqlite('ConversationDraftRepo DFC bindings', () => {
  it('roundtrips DFC draft selection and quarantines legacy send mode fields', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')
    const assetRepo = new FileAssetRepo(db)
    const draftRepo = new ConversationDraftRepo(db)
    const asset = assetRepo.create({
      id: 'asset-draft-dfc',
      sha256: 'sha-draft-dfc',
      filename: 'note.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 8,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-draft-dfc.txt',
      ingestStatus: 'stored',
    })
    const selectedAssetRefs = [{ kind: 'derived_asset' as const, assetId: 'derivative-plain-text' }]

    const attachment = draftRepo.addAttachment({
      conversationId: 'c1',
      assetId: asset.id,
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
      preferredSendMode: 'inline_base64',
      dfcManaged: true,
      selectedOptionId: 'option-plain-text',
      selectedAssetRefs,
    })

    expect(attachment).toMatchObject({
      dfcManaged: true,
      selectedOptionId: 'option-plain-text',
      selectedAssetRefs,
      preferredSendMode: null,
      urlRetentionMode: null,
    })
    expect(draftRepo.listAttachments('c1')).toEqual([
      expect.objectContaining({
        dfcManaged: true,
        selectedOptionId: 'option-plain-text',
        selectedAssetRefs,
        preferredSendMode: null,
      }),
    ])
  })

  it('keeps legacy draft rows non-DFC and does not accept DFC fields as fallback data', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')
    const assetRepo = new FileAssetRepo(db)
    const draftRepo = new ConversationDraftRepo(db)
    assetRepo.create({
      id: 'asset-draft-legacy',
      sha256: 'sha-draft-legacy',
      filename: 'legacy.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 8,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-draft-legacy.txt',
      ingestStatus: 'stored',
    })

    const legacy = draftRepo.addAttachment({
      conversationId: 'c1',
      assetId: 'asset-draft-legacy',
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
      preferredSendMode: 'inline_base64',
    })

    expect(legacy).toMatchObject({
      dfcManaged: false,
      selectedOptionId: null,
      selectedAssetRefs: [],
      preferredSendMode: 'inline_base64',
    })
    expect(() => draftRepo.updateAttachmentSettings({
      conversationId: 'c1',
      assetId: 'asset-draft-legacy',
      selectedOptionId: 'option-from-legacy',
    })).toThrow('DFC draft binding fields require dfcManaged true')
  })

  it('rejects DFC-managed draft rows with empty or missing selected asset refs', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')
    const assetRepo = new FileAssetRepo(db)
    const draftRepo = new ConversationDraftRepo(db)
    assetRepo.create({
      id: 'asset-draft-empty',
      sha256: 'sha-draft-empty',
      filename: 'empty.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 8,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-draft-empty.txt',
      ingestStatus: 'stored',
    })

    expect(() => draftRepo.addAttachment({
      conversationId: 'c1',
      assetId: 'asset-draft-empty',
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
      dfcManaged: true,
      selectedOptionId: 'option-empty',
      selectedAssetRefs: [],
    })).toThrow('DFC-managed attachment requires at least one SendAssetRef')

    draftRepo.getOrCreate('c1')
    db.prepare(`
      INSERT INTO draft_attachments(
        id,
        conversation_id,
        asset_id,
        attachment_order,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        preferred_send_mode,
        url_retention_mode,
        dfc_managed,
        selected_option_id,
        selected_asset_refs_json,
        created_at,
        updated_at
      ) VALUES (
        'draft-null-refs',
        'c1',
        'asset-draft-empty',
        0,
        'text',
        'native_supported',
        1,
        NULL,
        NULL,
        NULL,
        1,
        'option-null',
        NULL,
        1,
        1
      )
    `).run()

    expect(() => draftRepo.listAttachments('c1')).toThrow(
      'DFC-managed attachment requires at least one SendAssetRef'
    )
  })

  it('does not silently coerce malformed DFC draft asset refs to an empty binding', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    insertConvo(db, 'c1')
    const assetRepo = new FileAssetRepo(db)
    const draftRepo = new ConversationDraftRepo(db)
    assetRepo.create({
      id: 'asset-draft-malformed',
      sha256: 'sha-draft-malformed',
      filename: 'malformed.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 8,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-draft-malformed.txt',
      ingestStatus: 'stored',
    })
    draftRepo.addAttachment({
      conversationId: 'c1',
      assetId: 'asset-draft-malformed',
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
      dfcManaged: true,
      selectedOptionId: 'option-malformed',
      selectedAssetRefs: [{ kind: 'derived_asset', assetId: 'derivative-malformed' }],
    })
    db.prepare(`
      UPDATE draft_attachments
      SET selected_asset_refs_json = @value
      WHERE asset_id = 'asset-draft-malformed'
    `).run({ value: '[{"kind":"derived_asset"}]' })

    expect(() => draftRepo.listAttachments('c1')).toThrow('requires assetId')
  })
})

describeIfBetterSqlite('file pipeline cleanup planning', () => {
  it('plans physical cleanup without deleting files or records', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    const assetRepo = new FileAssetRepo(db)
    const derivativeRepo = new FileDerivativeRepo(db)

    assetRepo.create({
      id: 'asset-1',
      sha256: 'sha',
      filename: 'report.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 12,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageUri: 'assets/original/as/asset-1.pdf',
    })
    derivativeRepo.create({
      id: 'derivative-1',
      parentAssetId: 'asset-1',
      derivedKind: 'thumbnail',
      mime: 'image/png',
      storageUri: 'assets/derived/asset-1/derivative-1.png',
      generator: 'phase-2-test',
    })

    expect(assetRepo.planPhysicalCleanup({ id: 'asset-1' })).toEqual({
      ok: true,
      assetId: 'asset-1',
      storageUris: ['assets/original/as/asset-1.pdf', 'assets/derived/asset-1/derivative-1.png'],
      physicalDeletePerformed: false,
    })
  })
})
