import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addConversationDraftAttachment,
  attachConversationDraftToMessage,
  cloneConversationDraftFromMessage,
  ensureConversationDraftAttachmentDfcOptions,
  getConversationDraftAttachmentDfcOptions,
  getConversationDraftAttachmentDfcPreview,
  removeConversationDraftAttachment,
  restoreConversationDraft,
  updateConversationDraftAttachmentSettings,
  updateConversationDraftText,
} from './conversationDraftClient'

describe('conversationDraftClient', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('calls conversationDraft.addAttachment through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
      id: 'draft-attachment-1',
      conversationId: 'c1',
      assetId: 'asset-1',
      attachmentOrder: 0,
      aiPayloadKind: 'image',
      processingStatus: 'native_supported',
      includeInNextRequest: true,
      excludedReason: null,
      createdAt: 1,
      updatedAt: 1,
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await addConversationDraftAttachment({
      conversationId: 'c1',
      assetId: 'asset-1',
    })

    expect(invoke).toHaveBeenCalledWith('conversationDraft.addAttachment', {
      conversationId: 'c1',
      assetId: 'asset-1',
    })
    expect(result.assetId).toBe('asset-1')
  })

  it('calls conversationDraft.removeAttachment through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      removed: true,
      ownership: {
        assetId: 'asset-1',
        ownerKind: 'detached',
        lifecycleStatus: 'detached',
        draftConversationIds: [],
        messageIds: [],
        reason: 'removed_from_draft',
        updatedAt: 1,
      },
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await removeConversationDraftAttachment({
      conversationId: 'c1',
      assetId: 'asset-1',
    })

    expect(invoke).toHaveBeenCalledWith('conversationDraft.removeAttachment', {
      conversationId: 'c1',
      assetId: 'asset-1',
    })
    expect(result.removed).toBe(true)
  })

  it('calls conversationDraft.updateAttachmentSettings through dbBridge', async () => {
    const selectedAssetRefs = [{ kind: 'raw_file' as const, assetId: 'asset-1' }]
    const invoke = vi.fn(async () => ({
      id: 'draft-attachment-1',
      conversationId: 'c1',
      assetId: 'asset-1',
      attachmentOrder: 0,
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
      includeInNextRequest: true,
      excludedReason: null,
      preferredSendMode: null,
      urlRetentionMode: null,
      dfcManaged: true,
      selectedOptionId: 'dfc:asset-1:original_file:raw_file:asset-1',
      selectedAssetRefs,
      createdAt: 1,
      updatedAt: 2,
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await updateConversationDraftAttachmentSettings({
      conversationId: 'c1',
      assetId: 'asset-1',
      dfcManaged: true,
      selectedOptionId: 'dfc:asset-1:original_file:raw_file:asset-1',
      selectedAssetRefs,
    })

    expect(invoke).toHaveBeenCalledWith('conversationDraft.updateAttachmentSettings', {
      conversationId: 'c1',
      assetId: 'asset-1',
      dfcManaged: true,
      selectedOptionId: 'dfc:asset-1:original_file:raw_file:asset-1',
      selectedAssetRefs,
    })
    expect(result.dfcManaged).toBe(true)
    expect(result.selectedOptionId).toBe('dfc:asset-1:original_file:raw_file:asset-1')
    expect(result.selectedAssetRefs).toEqual(selectedAssetRefs)
  })

  it('calls conversationDraft.getDfcOptions through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
      attachmentId: 'draft-attachment-1',
      conversationId: 'c1',
      rawFileId: 'asset-1',
      filename: 'asset-1.txt',
      sizeBytes: 4,
      dfcManaged: false,
      selectedOptionId: null,
      selectedAssetRefs: [],
      decision: {
        status: 'needs_user_selection',
        reasonCode: 'selected_option_missing',
        selectedOptionId: null,
        targetKind: null,
        sendStrategy: null,
        sendAssetRefs: [],
        needsUserAction: true,
      },
      options: [{
        optionId: 'dfc:asset-1:original_file:raw_file:asset-1',
        targetKind: 'original_file',
        sendStrategy: 'file_attachment',
        status: 'ready',
        isAvailable: true,
        compatibilityStatus: 'compatible',
        sendAssetRefs: [{ kind: 'raw_file', assetId: 'asset-1' }],
        warnings: [],
        diagnostics: [],
      }],
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await getConversationDraftAttachmentDfcOptions({
      conversationId: 'c1',
      assetId: 'asset-1',
    })

    expect(invoke).toHaveBeenCalledWith('conversationDraft.getDfcOptions', {
      conversationId: 'c1',
      assetId: 'asset-1',
    })
    expect(result.options[0]?.targetKind).toBe('original_file')
  })

  it('calls conversationDraft.ensureDfcOptions through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
      attachmentId: 'draft-attachment-1',
      conversationId: 'c1',
      rawFileId: 'asset-1',
      filename: 'asset-1.csv',
      sizeBytes: 18,
      dfcManaged: false,
      selectedOptionId: null,
      selectedAssetRefs: [],
      decision: {
        status: 'needs_user_selection',
        reasonCode: 'selected_option_missing',
        selectedOptionId: null,
        targetKind: null,
        sendStrategy: null,
        sendAssetRefs: [],
        needsUserAction: true,
      },
      options: [{
        optionId: 'dfc:asset-1:table_markdown:derived_asset:derivative-1',
        targetKind: 'table_markdown',
        sendStrategy: 'text_in_prompt',
        status: 'ready',
        isAvailable: true,
        compatibilityStatus: 'compatible',
        sendAssetRefs: [{ kind: 'derived_asset', assetId: 'derivative-1' }],
        warnings: [],
        diagnostics: [],
      }],
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await ensureConversationDraftAttachmentDfcOptions({
      conversationId: 'c1',
      assetId: 'asset-1',
    })

    expect(invoke).toHaveBeenCalledWith('conversationDraft.ensureDfcOptions', {
      conversationId: 'c1',
      assetId: 'asset-1',
    })
    expect(result.options[0]).toMatchObject({
      optionId: 'dfc:asset-1:table_markdown:derived_asset:derivative-1',
      targetKind: 'table_markdown',
      sendAssetRefs: [{ kind: 'derived_asset', assetId: 'derivative-1' }],
    })
  })

  it('calls conversationDraft.getDfcPreview through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
      attachmentId: 'draft-attachment-1',
      conversationId: 'c1',
      rawFileId: 'asset-1',
      filename: 'asset-1.md',
      sizeBytes: 16,
      dfcManaged: true,
      selectedOptionId: 'dfc:asset-1:markdown:derived_asset:derivative-1',
      selectedAssetRefs: [{ kind: 'derived_asset', assetId: 'derivative-1' }],
      targetKind: 'markdown',
      sendStrategy: 'text_in_prompt',
      decision: {
        status: 'ready',
        reasonCode: null,
        selectedOptionId: 'dfc:asset-1:markdown:derived_asset:derivative-1',
        targetKind: 'markdown',
        sendStrategy: 'text_in_prompt',
        sendAssetRefs: [{ kind: 'derived_asset', assetId: 'derivative-1' }],
        needsUserAction: false,
      },
      preview: {
        kind: 'text',
        status: 'ready',
        text: 'preview',
        characterCount: 7,
        byteLength: 7,
        truncated: false,
        maxCharacters: 128,
        diagnostics: [],
      },
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await getConversationDraftAttachmentDfcPreview({
      conversationId: 'c1',
      assetId: 'asset-1',
      maxCharacters: 128,
    })

    expect(invoke).toHaveBeenCalledWith('conversationDraft.getDfcPreview', {
      conversationId: 'c1',
      assetId: 'asset-1',
      maxCharacters: 128,
    })
    expect(result.preview.text).toBe('preview')
    expect(result.selectedAssetRefs).toEqual([{ kind: 'derived_asset', assetId: 'derivative-1' }])
  })

  it('still restores conversation drafts through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
      conversationId: 'c1',
      draftText: 'hello',
      draftMode: 'compose',
      editingSourceMessageId: null,
      attachedAssetIds: [],
      attachments: [],
      updatedAt: 1,
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await restoreConversationDraft('c1')

    expect(invoke).toHaveBeenCalledWith('conversationDraft.restore', { conversationId: 'c1' })
    expect(result.draftText).toBe('hello')
  })

  it('still updates conversation draft text through dbBridge', async () => {
    const invoke = vi.fn(async (_method: string, params?: any) => ({
      conversationId: String(params?.conversationId ?? 'c1'),
      draftText: String(params?.draftText ?? ''),
      draftMode: 'compose',
      editingSourceMessageId: null,
      attachedAssetIds: [],
      attachments: [],
      updatedAt: 2,
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await updateConversationDraftText({
      conversationId: 'c1',
      draftText: 'new text',
    })

    expect(invoke).toHaveBeenCalledWith('conversationDraft.updateText', {
      conversationId: 'c1',
      draftText: 'new text',
    })
    expect(result.draftText).toBe('new text')
  })

  it('clones conversation draft from a source message through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
      conversationId: 'c1',
      draftText: 'from message',
      draftMode: 'edit',
      editingSourceMessageId: 'm1',
      attachedAssetIds: ['asset-1'],
      attachments: [
        {
          id: 'draft-attachment-1',
          conversationId: 'c1',
          assetId: 'asset-1',
          attachmentOrder: 0,
          aiPayloadKind: 'text',
          processingStatus: 'native_supported',
          includeInNextRequest: true,
          excludedReason: null,
          preferredSendMode: null,
          urlRetentionMode: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      updatedAt: 2,
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await cloneConversationDraftFromMessage({
      conversationId: 'c1',
      sourceMessageId: 'm1',
    })

    expect(invoke).toHaveBeenCalledWith('conversationDraft.cloneFromMessage', {
      conversationId: 'c1',
      sourceMessageId: 'm1',
    })
    expect(result.draftMode).toBe('edit')
    expect(result.editingSourceMessageId).toBe('m1')
    expect(result.attachedAssetIds).toEqual(['asset-1'])
  })

  it('attaches conversation draft relations to a created user message through dbBridge', async () => {
    const invoke = vi.fn(async () => ({
      messageId: 'm2',
      attachments: [
        {
          id: 'attachment-1',
          messageId: 'm2',
          assetId: 'asset-1',
          aiPayloadKind: 'text',
          processingStatus: 'native_supported',
          includeInNextRequest: true,
          excludedReason: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      draft: {
        conversationId: 'c1',
        draftText: '',
        draftMode: 'compose',
        editingSourceMessageId: null,
        attachedAssetIds: [],
        attachments: [],
        updatedAt: 3,
      },
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await attachConversationDraftToMessage({
      conversationId: 'c1',
      messageId: 'm2',
    })

    expect(invoke).toHaveBeenCalledWith('conversationDraft.attachToMessage', {
      conversationId: 'c1',
      messageId: 'm2',
    })
    expect(result.messageId).toBe('m2')
    expect(result.attachments[0]?.assetId).toBe('asset-1')
    expect(result.draft.attachedAssetIds).toEqual([])
  })
})
