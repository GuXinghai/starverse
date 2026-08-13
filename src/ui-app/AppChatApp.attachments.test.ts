import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import { installGenerationV2TestBridge } from '../../tests/helpers/generationV2Bridge'
import AppChatApp from './AppChatApp.vue'

const ok = <T>(value: T) => ({ ok: true as const, value })
const model = {
  providerKey: 'openrouter', modelId: DEFAULT_OPENROUTER_TEST_MODEL,
  modelKey: `openrouter::${DEFAULT_OPENROUTER_TEST_MODEL}`,
  canonicalSlug: DEFAULT_OPENROUTER_TEST_MODEL, displayName: 'Attachment Test Model',
  status: 'active', visibility: 'visible', inputModalities: ['text', 'image'], outputModalities: ['text'],
}

type Draft = {
  conversationId: string
  draftText: string
  draftMode: 'compose'
  editingSourceQuestionId: null
  revision: number
  updatedAtMs: number
  attachments: any[]
}

describe('ui-app AppChatApp attachments (Generation V2 composer contract)', () => {
  const originalElectronApi = (globalThis as any).electronAPI
  const originalElectronStore = (globalThis as any).electronStore
  let draft: Draft
  let importLocal: ReturnType<typeof vi.fn>
  let removeAttachment: ReturnType<typeof vi.fn>
  let selectLocalFiles: ReturnType<typeof vi.fn>

  const readyDetection = () => ({
    contractRevision: 'file-type-detection-v2.1', revision: 2, status: 'ready' as const,
    formatId: 'txt', kind: 'text', confidence: 'high', blocked: false, warning: true,
    blockingReasonCodes: [], warningReasonCodes: [], magikaState: 'not_installed',
    magikaModelVersion: null, warnings: [{ code: 'MAGIKA_NOT_INSTALLED', detail: null }],
    errorCode: null, errorDetail: null,
  })

  function managedFile(assetId: string, overrides: Record<string, unknown> = {}) {
    const image = assetId.includes('image')
    return {
      kind: 'managed_file' as const,
      assetId,
      assetRevisionId: `revision:${assetId}`,
      assetSha256: `sha:${assetId}`,
      include: true,
      sendAs: image ? 'image_reference' as const : 'provider_file' as const,
      conversion: 'none' as const,
      attachmentOrder: draft.attachments.length,
      filename: image ? 'photo.png' : 'notes.txt',
      assetKind: image ? 'image' as const : 'file' as const,
      mime: image ? 'image/png' : 'text/plain',
      sizeBytes: 12,
      sourceKind: 'user_import' as const,
      originalUrl: null,
      fileTypeDetection: readyDetection(),
      dfcSelection: null,
      ...overrides,
    }
  }

  function nextDraft(patch: Partial<Draft> = {}) {
    draft = { ...draft, ...patch, revision: draft.revision + 1, updatedAtMs: draft.updatedAtMs + 1 }
    return draft
  }

  function catalogResponse(items: any[]) {
    return ok({ status: 'synced', responseDigest: 'a'.repeat(64), modelCount: items.length,
      visibleModelCount: items.length, hiddenModelCount: 0, items, nextCursor: null })
  }

  function mockAttachmentMenuLayout() {
    const rect = { x: 24, y: 24, top: 24, left: 24, right: 220, bottom: 64, width: 196, height: 40, toJSON: () => ({}) } as DOMRect
    return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => rect)
  }

  beforeEach(() => {
    const g: any = installGenerationV2TestBridge()
    draft = { conversationId: 'c1', draftText: '', draftMode: 'compose', editingSourceQuestionId: null,
      revision: 1, updatedAtMs: 1, attachments: [] }
    globalThis.localStorage?.setItem('starverse.openRouterTextChat.enabled', '1')
    ;(globalThis as any).electronStore = { get: vi.fn(async () => 'redacted-test-key') }
    selectLocalFiles = vi.fn(async () => ({
      filePaths: ['C:/fixtures/good.txt', 'C:/fixtures/bad.txt'],
      fileGrants: [
        { filePath: 'C:/fixtures/good.txt', token: 'grant-good', expiresAtMs: 9999 },
        { filePath: 'C:/fixtures/bad.txt', token: 'grant-bad', expiresAtMs: 9999 },
      ],
    }))
    ;(globalThis as any).electronAPI = { selectLocalFiles }

    g.models.listOpenRouter = vi.fn(async () => catalogResponse([model]))
    g.models.listOpenAIResponses = vi.fn(async () => catalogResponse([]))
    g.models.listAnthropic = vi.fn(async () => catalogResponse([]))
    g.models.listGoogleAIStudio = vi.fn(async () => catalogResponse([]))
    g.models.listDeepSeek = vi.fn(async () => catalogResponse([]))
    g.workspace.ensureDefault = vi.fn(async () => ok({ projectId: 'project:test', conversationId: 'c1', branchId: 'b1', created: false }))
    g.workspace.getSystemTemplate = vi.fn(async () => ok({
      conversation: { id: 'c1', projectId: 'project:test', branchId: 'b1', title: 'New Chat', createdAt: 1, updatedAt: 1,
        meta: { selectedProviderId: 'openrouter', selectedModelKey: DEFAULT_OPENROUTER_TEST_MODEL }, systemKey: 'new_template', templateRevision: 0 },
      draft,
      settings: { startupNavigation: 'open_new', startupTemplateReset: { modelConfig: false, draftAttachments: false }, postSendTemplateReset: 'reset_all' },
    }))
    g.workspace.listConversations = vi.fn(async () => ok({ items: [{ conversationId: 'c1', projectId: 'project:test', title: 'Chat 1', updatedAtMs: 1,
      meta: { selectedProviderId: 'openrouter', selectedModelKey: DEFAULT_OPENROUTER_TEST_MODEL }, branches: [{ branchId: 'b1', name: 'Main', headMessageId: null, updatedAtMs: 1 }], branchesHasMore: false }], nextCursor: null, totalCount: 1 }))
    g.workspace.getConversationRoutePreference = vi.fn(async () => ok({ conversationId: 'c1', revision: 1,
      selection: { schemaVersion: 1, kind: 'provider_model', providerId: 'openrouter', modelId: DEFAULT_OPENROUTER_TEST_MODEL } }))
    g.workspace.readBranch = vi.fn(async () => ok({ branchId: 'b1', conversationId: 'c1', projectId: 'project:test', title: 'Chat 1', branchName: 'Main',
      headMessageId: null, beforeMessageId: null, hasMoreTurns: false, turns: [] }))
    g.workspace.updateConfig = vi.fn(async (input: any) => ok({ ownerKind: input.ownerKind, ownerId: input.ownerId, configRevision: 'test-next', semanticLayer: input.semanticLayer }))
    g.runtime.subscribe = vi.fn(async () => ok([]))
    g.runtime.snapshot = vi.fn(async () => ok(null))
    g.runtime.onEvent = vi.fn(() => () => undefined)
    g.openRouter.chat.initial = vi.fn(async () => ok({ kind: 'created', operationId: 'operation:1', answerRootId: 'a1', actionKind: 'initial',
      branch: { branchId: 'b1', conversationId: 'c1', questionId: 'q1', headMessageId: 'a1', chosenAnswerRootId: 'a1', deletedAtMs: null } }))

    g.composer.get = vi.fn(async () => ok(draft))
    g.composer.updateText = vi.fn(async (input: any) => ok(nextDraft({ draftText: String(input.draftText ?? '') })))
    importLocal = vi.fn(async (input: any) => {
      if (String(input.filePath).includes('bad')) return { ok: false as const, code: 'LOCAL_READ_FAILED' }
      return ok(nextDraft({ attachments: [...draft.attachments, managedFile('asset-text')] }))
    })
    g.composer.importLocal = importLocal
    removeAttachment = vi.fn(async (input: any) => ok(nextDraft({
      attachments: draft.attachments.filter((item) => item.assetRevisionId !== input.assetRevisionId),
    })))
    g.composer.removeAttachment = removeAttachment
    g.composer.readPreview = vi.fn(async () => ok({ status: 'ready', dataUrl: 'data:image/png;base64,AA==', mime: 'image/png', sizeBytes: 8 }))
    g.composer.dfcOptions = vi.fn(async (input: any) => ok({
      attachmentId: `revision:${input.assetId}`, conversationId: 'c1', rawFileId: input.assetId, filename: 'notes.txt', sizeBytes: 12,
      dfcManaged: true, selectedOptionId: null, selectedAssetRefs: [],
      decision: { status: 'needs_user_selection', reasonCode: 'selected_option_missing', selectedOptionId: null, targetKind: null, sendStrategy: null, sendAssetRefs: [], needsUserAction: true },
      options: [{ optionId: `dfc:${input.assetId}:markdown`, targetKind: 'markdown', sendStrategy: 'text_in_prompt', status: 'ready', isAvailable: true,
        compatibilityStatus: 'compatible', sendAssetRefs: [{ kind: 'derived_asset', assetId: 'derived-markdown' }], warnings: [], diagnostics: [] }],
    }))
    g.composer.dfcPreview = vi.fn(async () => ok({ attachmentId: 'revision:asset-text', conversationId: 'c1', rawFileId: 'asset-text', filename: 'notes.txt',
      sizeBytes: 12, dfcManaged: true, selectedOptionId: 'dfc:asset-text:markdown', selectedAssetRefs: [{ kind: 'derived_asset', assetId: 'derived-markdown' }],
      targetKind: 'markdown', sendStrategy: 'text_in_prompt', decision: { status: 'ready', reasonCode: null, selectedOptionId: 'dfc:asset-text:markdown', targetKind: 'markdown', sendStrategy: 'text_in_prompt', sendAssetRefs: [], needsUserAction: false },
      preview: { kind: 'text', status: 'ready', text: 'Converted markdown preview', characterCount: 26, byteLength: 26, truncated: false, maxCharacters: 2048, diagnostics: [] } }))
    g.composer.dfcSelect = vi.fn(async (input: any) => ok(nextDraft({ attachments: draft.attachments.map((item) => item.assetId === input.assetId ? {
      ...item, dfcSelection: { optionId: input.optionId, targetKind: 'markdown', sendStrategy: 'text_in_prompt', effectiveAssetId: 'derived-markdown', effectiveAssetRevisionId: 'revision:derived-markdown', effectiveAssetSha256: 'sha:derived-markdown' },
    } : item) })))
  })

  afterEach(() => {
    cleanup()
    ;(globalThis as any).electronAPI = originalElectronApi
    ;(globalThis as any).electronStore = originalElectronStore
    globalThis.localStorage?.removeItem('starverse.openRouterTextChat.enabled')
    vi.restoreAllMocks()
  })

  it('keeps a failed local import local while rendering the successfully imported attachment', async () => {
    const layout = mockAttachmentMenuLayout()
    const user = userEvent.setup()
    render(AppChatApp)
    await user.click(await screen.findByTestId('composer-attach-toggle'))
    await waitFor(() => expect(screen.getByTestId('composer-attach-menu')).toHaveAttribute('aria-hidden', 'false'))
    await user.click(screen.getByTestId('composer-attach-file'))
    await waitFor(() => {
      expect(selectLocalFiles).toHaveBeenCalledWith({ context: 'file', allowMultiple: true })
      expect(importLocal).toHaveBeenCalledTimes(2)
      expect(screen.getByTestId('draft-attachment-card-asset-text')).toBeInTheDocument()
    })
    layout.mockRestore()
  })

  it('renders an image card with the Generation V2 preview result', async () => {
    draft = nextDraft({ attachments: [managedFile('asset-image')] })
    render(AppChatApp)
    await screen.findByTestId('draft-attachment-card-asset-image')
    expect(screen.getByTestId('draft-attachment-preview')).toBeInTheDocument()
  })

  it('selects one backend-owned DFC option from attachment details', async () => {
    const user = userEvent.setup()
    draft = nextDraft({ attachments: [managedFile('asset-text')] })
    render(AppChatApp)
    await user.click(await screen.findByTestId('draft-attachment-card-asset-text'))
    await user.click(await screen.findByTestId('draft-attachment-dfc-option-markdown'))
    await waitFor(() => expect((globalThis as any).generationV2.composer.dfcSelect).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'asset-text' })))
    expect(await screen.findByTestId('draft-attachment-dfc-preview-text')).toHaveTextContent('Converted markdown preview')
  })

  it('removes the draft attachment through the Generation V2 revision authority', async () => {
    const user = userEvent.setup()
    draft = nextDraft({ attachments: [managedFile('asset-text')] })
    render(AppChatApp)
    await user.click(await screen.findByTestId('draft-attachment-card-asset-text'))
    await user.click(await screen.findByTestId('draft-attachment-details-remove'))
    await waitFor(() => expect(removeAttachment).toHaveBeenCalledWith(expect.objectContaining({ assetRevisionId: 'revision:asset-text' })))
    expect(screen.queryByTestId('draft-attachment-card-asset-text')).toBeNull()
  })

  it('blocks send while detection is pending and refreshes immediately after the completion event', async () => {
    const listeners: Array<(event: unknown) => void> = []
    const g: any = (globalThis as any).generationV2
    g.composer.onFileTypeDetectionUpdated = vi.fn((value: (event: unknown) => void) => {
      listeners.push(value)
      return () => undefined
    })
    draft = nextDraft({
      draftText: 'send this',
      attachments: [managedFile('asset-text', { fileTypeDetection: { ...readyDetection(), status: 'pending', revision: 1 } })],
    })
    render(AppChatApp)
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeDisabled())
    draft = nextDraft({ attachments: [managedFile('asset-text')] })
    listeners[0]?.({ conversationId: 'c1', assetRevisionId: 'revision:asset-text', status: 'ready', revision: 2 })
    await waitFor(() => expect(screen.getByTestId('composer-send')).not.toBeDisabled())
  })
})
