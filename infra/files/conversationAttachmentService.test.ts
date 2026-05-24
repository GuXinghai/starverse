import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ConversationAttachmentService } from './conversationAttachmentService'
import { FileAssetRepo } from '../db/repo/fileAssetRepo'
import { MessageAttachmentRepo } from '../db/repo/messageAttachmentRepo'
import { MessageRepo } from '../db/repo/messageRepo'
import { BranchRepo } from '../db/repo/branchRepo'
import { ConversationDraftRepo } from '../db/repo/conversationDraftRepo'
import { canOpenBetterSqliteForSuite } from '../testUtils/betterSqliteGate'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('ConversationAttachmentService') ? describe : describe.skip

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function insertConvo(db: BetterSqlite3.Database, id: string) {
  db.prepare(`
    INSERT INTO convo(id, project_id, title, created_at, updated_at, meta)
    VALUES (@id, NULL, @title, 1, 1, NULL)
  `).run({ id, title: id })
}

function createHarness() {
  const db = new BetterSqlite3(':memory:')
  loadSchema(db)
  const fileAssetRepo = new FileAssetRepo(db)
  const messageRepo = new MessageRepo(db)
  const messageAttachmentRepo = new MessageAttachmentRepo(db)
  const branchRepo = new BranchRepo(db)
  const draftRepo = new ConversationDraftRepo(db)
  const service = new ConversationAttachmentService({
    db,
    fileAssetRepo,
    messageRepo,
    messageAttachmentRepo,
    branchRepo,
    draftRepo,
    now: () => 1000,
  })
  return { db, service, fileAssetRepo, messageRepo, messageAttachmentRepo, branchRepo }
}

function createAsset(repo: FileAssetRepo, id: string, overrides: Partial<Parameters<FileAssetRepo['create']>[0]> = {}) {
  return repo.create({
    id,
    sha256: `${id}-sha`,
    filename: `${id}.txt`,
    extension: 'txt',
    mime: 'text/plain',
    sizeBytes: 4,
    assetKind: 'text',
    sourceKind: 'local_upload',
    storageBackend: 'local_fs',
    storageUri: `assets/original/${id.slice(0, 2)}/${id}.txt`,
    ingestStatus: 'stored',
    ...overrides,
  })
}

describeIfBetterSqlite('ConversationAttachmentService drafts', () => {
  it('restores draft text and attachments as one input snapshot', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-1')

    h.service.updateDraftText({ conversationId: 'c1', draftText: 'draft body' })
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })
    const draft = h.service.restoreDraft({ conversationId: 'c1' })

    expect(draft).toMatchObject({
      conversationId: 'c1',
      draftText: 'draft body',
      draftMode: 'compose',
      editingSourceMessageId: null,
      attachedAssetIds: ['asset-1'],
    })
    expect(draft.attachments[0]).toMatchObject({
      assetId: 'asset-1',
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
    })
  })

  it('removes draft attachments without deleting the asset and marks detached ownership', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-1')
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })

    const result = h.service.removeDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })

    expect(result).toMatchObject({
      ok: true,
      removed: true,
      ownership: {
        ownerKind: 'detached',
        lifecycleStatus: 'detached',
      },
    })
    expect(h.fileAssetRepo.getById('asset-1')?.deletedAt).toBeNull()
    expect(h.service.restoreDraft({ conversationId: 'c1' }).attachedAssetIds).toEqual([])
  })

  it('keeps draft attachments when user message creation fails', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-1')
    h.service.updateDraftText({ conversationId: 'c1', draftText: 'will stay' })
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })
    const service = new ConversationAttachmentService({
      db: h.db,
      fileAssetRepo: h.fileAssetRepo,
      messageRepo: { append: () => { throw new Error('append failed') } } as unknown as MessageRepo,
      messageAttachmentRepo: h.messageAttachmentRepo,
      branchRepo: h.branchRepo,
      now: () => 1000,
    })

    expect(() => service.commitDraftToUserMessage({ conversationId: 'c1' })).toThrow('append failed')
    expect(h.service.restoreDraft({ conversationId: 'c1' })).toMatchObject({
      draftText: 'will stay',
      attachedAssetIds: ['asset-1'],
    })
  })
})

describeIfBetterSqlite('ConversationAttachmentService message ownership', () => {
  it('atomically migrates draft attachments to a user message and clears draft ownership', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-1')
    h.service.updateDraftText({ conversationId: 'c1', draftText: 'send me' })
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })

    const result = h.service.commitDraftToUserMessage({ conversationId: 'c1', createdAt: 10 })

    expect(result.message).toMatchObject({ role: 'user', body: 'send me' })
    expect(result.attachments).toHaveLength(1)
    expect(result.draft).toMatchObject({ draftText: '', attachedAssetIds: [] })
    expect(h.service.restoreDraft({ conversationId: 'c1' }).attachedAssetIds).toEqual([])
    expect(h.service.listMessageAttachments(result.message.id)).toEqual([
      expect.objectContaining({ assetId: 'asset-1', messageId: result.message.id }),
    ])
    expect(h.service.getAssetOwnership({ assetId: 'asset-1' })).toMatchObject({
      ownerKind: 'message',
      lifecycleStatus: 'active',
      draftConversationIds: [],
      messageIds: [result.message.id],
    })
  })

  it('clones edit drafts from a frozen user message without mutating original attachments', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-1')
    h.service.updateDraftText({ conversationId: 'c1', draftText: 'original' })
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })
    const committed = h.service.commitDraftToUserMessage({ conversationId: 'c1' })

    const draft = h.service.cloneMessageToDraft({ conversationId: 'c1', sourceMessageId: committed.message.id })
    h.service.updateDraftText({ conversationId: 'c1', draftText: 'edited text', draftMode: 'edit', editingSourceMessageId: committed.message.id })
    h.service.removeDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })

    expect(draft).toMatchObject({
      draftMode: 'edit',
      editingSourceMessageId: committed.message.id,
      draftText: 'original',
      attachedAssetIds: ['asset-1'],
    })
    expect(h.service.listMessageAttachments(committed.message.id)).toEqual([
      expect.objectContaining({ assetId: 'asset-1' }),
    ])
    expect(h.service.restoreDraft({ conversationId: 'c1' })).toMatchObject({
      draftText: 'edited text',
      attachedAssetIds: [],
    })
  })

  it('resend defaults inherit user attachments while assistant regeneration leaves them unchanged', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-1')
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })
    const user = h.service.commitDraftToUserMessage({ conversationId: 'c1' }).message
    h.messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'answer', parentId: user.id })

    expect(h.service.getResendAttachmentDefaults(user.id)).toEqual([
      expect.objectContaining({ assetId: 'asset-1' }),
    ])
    expect(h.service.listMessageAttachments(user.id)).toHaveLength(1)
  })

  it('commits only sentAssetIds into message attachments when provided', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-1')
    createAsset(h.fileAssetRepo, 'asset-2')
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-2' })

    const committed = h.service.commitDraftToUserMessage({
      conversationId: 'c1',
      sentAssetIds: ['asset-2'],
    })

    expect(committed.attachments.map((row) => row.assetId)).toEqual(['asset-2'])
    expect(h.service.listMessageAttachments(committed.message.id).map((row) => row.assetId)).toEqual(['asset-2'])
  })

  it('detaches message attachments without deleting assets and can mark abandoned explicitly', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-1')
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })
    const message = h.service.commitDraftToUserMessage({ conversationId: 'c1' }).message

    const detached = h.service.detachMessageAttachment({ messageId: message.id, assetId: 'asset-1' })
    const abandoned = h.service.markAssetAbandoned({ assetId: 'asset-1', reason: 'user_discarded' })

    expect(detached).toMatchObject({
      detached: true,
      ownership: { ownerKind: 'detached', lifecycleStatus: 'detached' },
    })
    expect(abandoned).toMatchObject({
      ownerKind: 'abandoned',
      lifecycleStatus: 'abandoned',
      reason: 'user_discarded',
    })
    expect(h.fileAssetRepo.getById('asset-1')?.ingestStatus).toBe('stored')
  })

  it('binds only actually sent assets when attaching draft to message and skips preview-only derivatives', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-send')
    createAsset(h.fileAssetRepo, 'asset-preview-only', {
      filename: 'preview.png',
      extension: 'png',
      mime: 'image/png',
      assetKind: 'image',
      sourceKind: 'derived',
      storageUri: 'assets/derived/as/asset-preview-only.png',
      sourceMetaJson: {
        previewOnly: true,
      },
    })
    const targetMessage = h.messageRepo.append({ convoId: 'c1', role: 'user', body: 'existing' })
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-send' })
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-preview-only' })

    const result = h.service.attachDraftToMessage({
      conversationId: 'c1',
      messageId: targetMessage.id,
      sentAssetIds: ['asset-send'],
    })

    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0]).toMatchObject({ assetId: 'asset-send', messageId: targetMessage.id })
    expect(result.attachments.find((row) => row.assetId === 'asset-preview-only')).toBeUndefined()
    expect(h.service.listMessageAttachments(targetMessage.id).map((row) => row.assetId)).toEqual(['asset-send'])
  })

  it('snapshots DFC draft bindings and send plan semantics into message rows without copying legacy send mode fields', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-dfc')
    const selectedAssetRefs = [{ kind: 'derived_asset' as const, assetId: 'derivative-plain-text' }]
    h.db.prepare(`
      INSERT INTO file_derivatives(
        id, parent_asset_id, derived_kind, mime, storage_uri, generator, status, meta_json, created_at, updated_at, deleted_at
      )
      VALUES (
        'derivative-plain-text',
        'asset-dfc',
        'extracted_text',
        'text/plain',
        'assets/derivatives/asset-dfc/plain.txt',
        'test-dfc-converter',
        'ready',
        @metaJson,
        1,
        1,
        NULL
      )
    `).run({
      metaJson: JSON.stringify({
        targetKind: 'plain_text',
        usage: 'preview_and_send',
        storageClass: 'message_bound',
        sourceHash: 'asset-dfc-sha',
        contentHash: 'derivative-plain-text-content',
        conversionSettingsHash: 'derivative-plain-text-settings',
        converterName: 'test-dfc-converter',
        converterVersion: '1',
      }),
    })

    h.service.addDraftAttachment({
      conversationId: 'c1',
      assetId: 'asset-dfc',
      preferredSendMode: 'inline_base64',
      dfcManaged: true,
      selectedOptionId: 'option-plain-text',
      selectedAssetRefs,
    })

    const draft = h.service.restoreDraft({ conversationId: 'c1' })
    expect(draft.attachments[0]).toMatchObject({
      dfcManaged: true,
      selectedOptionId: 'option-plain-text',
      selectedAssetRefs,
      preferredSendMode: null,
    })

    const committed = h.service.commitDraftToUserMessage({
      conversationId: 'c1',
      dfcAttachmentSendSnapshots: [{
        attachmentId: draft.attachments[0]!.id,
        assetId: 'asset-dfc',
        targetKind: 'plain_text',
        sendStrategy: 'text_in_prompt',
        sendAssetRefs: selectedAssetRefs,
      }],
    })
    expect(committed.attachments).toEqual([
      expect.objectContaining({
        assetId: 'asset-dfc',
        dfcManaged: true,
        usedOptionId: 'option-plain-text',
        usedAssetRefs: selectedAssetRefs,
        targetKind: 'plain_text',
        sendStrategy: 'text_in_prompt',
      }),
    ])
    const storedDraftRow = h.db.prepare(`
      SELECT COUNT(*) AS count
      FROM draft_attachments
      WHERE preferred_send_mode IS NOT NULL
    `).get() as { count: number }
    const storedMessageRow = h.db.prepare(`
      SELECT dfc_managed AS dfcManaged,
             used_option_id AS usedOptionId,
             used_asset_refs_json AS usedAssetRefsJson,
             target_kind AS targetKind,
             send_strategy AS sendStrategy
      FROM message_attachments
      WHERE asset_id = 'asset-dfc'
      LIMIT 1
    `).get() as {
      dfcManaged: number
      usedOptionId: string | null
      usedAssetRefsJson: string | null
      targetKind: string | null
      sendStrategy: string | null
    }
    expect(storedDraftRow).toEqual({ count: 0 })
    expect(storedMessageRow).toEqual({
      dfcManaged: 1,
      usedOptionId: 'option-plain-text',
      usedAssetRefsJson: JSON.stringify(selectedAssetRefs),
      targetKind: 'plain_text',
      sendStrategy: 'text_in_prompt',
    })
  })

  it('rejects DFC send snapshots that do not match the selected asset refs', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-dfc')
    const selectedAssetRefs = [{ kind: 'derived_asset' as const, assetId: 'derivative-plain-text' }]

    h.service.addDraftAttachment({
      conversationId: 'c1',
      assetId: 'asset-dfc',
      dfcManaged: true,
      selectedOptionId: 'option-plain-text',
      selectedAssetRefs,
    })
    const draft = h.service.restoreDraft({ conversationId: 'c1' })

    expect(() => h.service.commitDraftToUserMessage({
      conversationId: 'c1',
      dfcAttachmentSendSnapshots: [{
        attachmentId: draft.attachments[0]!.id,
        assetId: 'asset-dfc',
        targetKind: 'plain_text',
        sendStrategy: 'text_in_prompt',
        sendAssetRefs: [{ kind: 'derived_asset', assetId: 'derivative-other' }],
      }],
    })).toThrow('DFC send snapshot refs do not match selectedAssetRefs')
  })
})

describeIfBetterSqlite('ConversationAttachmentService candidate snapshots', () => {
  it('computes included and excluded attachment snapshot items without provider serialization', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-1')
    createAsset(h.fileAssetRepo, 'asset-2', { filename: 'archive.7z', extension: '7z', mime: null, assetKind: 'archive' })
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-2' })
    const message = h.service.commitDraftToUserMessage({ conversationId: 'c1' }).message

    const snapshot = h.service.getCandidateAttachmentSnapshot({ messageIds: [message.id] })

    expect(snapshot).toMatchObject({ scope: 'messages', messageIds: [message.id] })
    expect(snapshot.included).toEqual([expect.objectContaining({ assetId: 'asset-1', included: true })])
    expect(snapshot.excluded).toEqual([
      expect.objectContaining({ assetId: 'asset-2', excludedReason: 'unsupported_processing_status' }),
    ])
    expect(snapshot.items).toHaveLength(2)
  })

  it('surfaces persisted DFC message semantics in candidate snapshots', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-dfc')
    const selectedAssetRefs = [{ kind: 'raw_file' as const, assetId: 'asset-dfc' }]
    const draftAttachment = h.service.addDraftAttachment({
      conversationId: 'c1',
      assetId: 'asset-dfc',
      dfcManaged: true,
      selectedOptionId: 'option-original',
      selectedAssetRefs,
    })
    const message = h.service.commitDraftToUserMessage({
      conversationId: 'c1',
      dfcAttachmentSendSnapshots: [{
        attachmentId: draftAttachment.id,
        assetId: 'asset-dfc',
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
        sendAssetRefs: selectedAssetRefs,
      }],
    }).message

    const snapshot = h.service.getCandidateAttachmentSnapshot({ messageIds: [message.id] })

    expect(snapshot.items).toEqual([
      expect.objectContaining({
        assetId: 'asset-dfc',
        dfcManaged: true,
        usedOptionId: 'option-original',
        usedAssetRefs: selectedAssetRefs,
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
      }),
    ])
  })

  it('branch snapshots naturally follow user messages present on the branch path', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'asset-1')
    createAsset(h.fileAssetRepo, 'asset-2')
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-1' })
    const firstUser = h.service.commitDraftToUserMessage({ conversationId: 'c1', body: 'u1' }).message
    const assistant = h.messageRepo.append({ convoId: 'c1', role: 'assistant', body: 'a1', parentId: firstUser.id })
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'asset-2' })
    h.service.commitDraftToUserMessage({ conversationId: 'c1', body: 'u2' })
    const fullBranch = h.branchRepo.ensureDefault('c1')
    const fork = h.branchRepo.createFromMessage({
      sourceBranchId: fullBranch.id,
      baseMessageId: assistant.id,
      requireOnSourcePath: false,
    })

    const fullSnapshot = h.service.getCandidateAttachmentSnapshot({ branchId: fullBranch.id })
    const forkSnapshot = h.service.getCandidateAttachmentSnapshot({ branchId: fork.id })

    expect(fullSnapshot.included.map((item) => item.assetId).sort()).toEqual(['asset-1', 'asset-2'])
    expect(forkSnapshot.included.map((item) => item.assetId)).toEqual(['asset-1'])
  })

  it('mounts URL assets as unified file assets and does not auto-refresh local copies', () => {
    const h = createHarness()
    insertConvo(h.db, 'c1')
    createAsset(h.fileAssetRepo, 'url-asset', {
      sha256: null,
      filename: 'remote.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      assetKind: 'document',
      sourceKind: 'url_import',
      storageBackend: 'remote_url',
      storageUri: 'https://example.test/remote.pdf',
      sourceMetaJson: {
        originalUrl: 'https://example.test/remote.pdf',
        retentionMode: 'link_only',
        materializationStatus: 'not_requested',
      },
    })
    h.service.addDraftAttachment({ conversationId: 'c1', assetId: 'url-asset' })
    const message = h.service.commitDraftToUserMessage({ conversationId: 'c1' }).message

    const snapshot = h.service.getCandidateAttachmentSnapshot({ messageIds: [message.id] })
    const asset = h.fileAssetRepo.getById('url-asset')

    expect(snapshot.included).toEqual([
      expect.objectContaining({
        assetId: 'url-asset',
        sourceKind: 'url_import',
        storageBackend: 'remote_url',
      }),
    ])
    expect(asset?.sourceMetaJson).toMatchObject({
      retentionMode: 'link_only',
      materializationStatus: 'not_requested',
    })
  })
})
