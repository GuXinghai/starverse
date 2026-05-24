import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

vi.mock('@/next/modelCatalog/modelDetailService', () => ({
  getModelCatalogModelDetail: vi.fn(async () => ({
    providerKey: 'openrouter',
    modelId: 'openai/gpt-4o',
    item: {
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
      modelKey: 'openrouter::openai/gpt-4o',
      canonicalSlug: 'openai/gpt-4o',
      displayName: 'GPT-4o',
      description: null,
      vendor: 'openai',
      family: null,
      status: 'active',
      visibility: 'visible',
      contextLength: 128000,
      maxOutputTokens: 16384,
      architectureModality: 'text->text',
      inputModalities: ['text'],
      outputModalities: ['text'],
      tokenizer: null,
      instructType: null,
      supportedParameters: [],
      capabilities: {
        reasoning: true,
        tools: true,
        structuredOutputs: true,
        vision: false,
        longContext: true,
      },
      pricing: {
        prompt: null,
        completion: null,
        request: null,
        image: null,
        webSearch: null,
        internalReasoning: null,
        inputCacheRead: null,
        inputCacheWrite: null,
      },
      createdAtSec: 1,
      expirationDate: null,
      expirationAtSec: null,
      unknownExpiration: false,
      hasPerRequestLimits: false,
      hasDefaultParameters: false,
      perRequestLimits: null,
      defaultParameters: null,
      topProviderContextLength: null,
      topProviderIsModerated: false,
      firstSeenAtMs: 1,
      lastSeenAtMs: 1,
      syncedAtMs: 1,
      raw: {
        inputModalitiesJson: '["text"]',
        outputModalitiesJson: '["text"]',
        supportedParametersJson: '[]',
        capabilitiesJson: '{"reasoning":true,"tools":true,"structuredOutputs":true,"vision":false,"longContext":true}',
        pricingJson: null,
        perRequestLimitsJson: null,
        defaultParametersJson: null,
        rawJson: null,
      },
    },
    error: null,
  })),
}))

describe('ui-app AppChatApp attachment entry flow', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronApi = (globalThis as any).electronAPI
  const originalElectronStore = (globalThis as any).electronStore
  let invoke: ReturnType<typeof vi.fn>
  let selectLocalFiles: ReturnType<typeof vi.fn>
  let draftResponse: ReturnType<typeof baseDraft>
  let lastSendPlanModelInputModalities: string[] = ['text']
  let sendPlanBuildCallCount = 0
  let forceBlockedOnSecondSendPlanBuild = false
  let contextMessages: Array<Record<string, unknown>> = []
  let convoRows: Array<Record<string, unknown>> = []
  let historyIncompatibleMessageIds: string[] = []
  let historyAttachmentRowsByMessageId: Record<string, Array<Record<string, unknown>>> = {}

  function mockAttachmentMenuLayout() {
    const rect = {
      x: 24,
      y: 24,
      top: 24,
      left: 24,
      right: 220,
      bottom: 64,
      width: 196,
      height: 40,
      toJSON: () => ({}),
    } as DOMRect
    return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => rect)
  }

  type DraftAttachment = Readonly<{
    id: string
    conversationId: string
    assetId: string
    attachmentOrder: number
    aiPayloadKind: string
    processingStatus: string
    includeInNextRequest: boolean
    excludedReason: string | null
    preferredSendMode: string | null
    urlRetentionMode: string | null
    dfcManaged: boolean
    selectedOptionId: string | null
    selectedAssetRefs: Array<{ kind: 'raw_file' | 'derived_asset'; assetId: string }>
    createdAt: number
    updatedAt: number
  }>

  type DraftResponse = Readonly<{
    conversationId: string
    draftText: string
    draftMode: 'compose'
    editingSourceMessageId: string | null
    attachedAssetIds: string[]
    attachments: DraftAttachment[]
    updatedAt: number
  }>

  function makeDraftAttachment(assetId: string, overrides?: Partial<Record<string, unknown>>): DraftAttachment {
    const normalized = String(assetId ?? '').toLowerCase()
    const aiPayloadKind =
      normalized.includes('image')
        ? 'image'
        : normalized.includes('pdf') || normalized.includes('url')
          ? 'pdf'
          : normalized.includes('audio')
            ? 'audio'
            : normalized.includes('video')
              ? 'video'
              : normalized.includes('binary')
                ? 'binary'
                : 'text'
    const processingStatus =
      typeof overrides?.processingStatus === 'string'
        ? String(overrides.processingStatus)
        : normalized.includes('pending')
          ? 'pending'
          : normalized.includes('convertible')
            ? 'convertible'
            : 'native_supported'
    return {
      id: `draft-attachment-${assetId}`,
      conversationId: 'c1',
      assetId,
      attachmentOrder: typeof overrides?.attachmentOrder === 'number' ? overrides.attachmentOrder : 0,
      aiPayloadKind,
      processingStatus,
      includeInNextRequest: true,
      excludedReason: null,
      preferredSendMode: null,
      urlRetentionMode: null,
      dfcManaged: false,
      selectedOptionId: null,
      selectedAssetRefs: [],
      createdAt: 1,
      updatedAt: 1,
      ...overrides,
    } as DraftAttachment
  }

  function makeFileAsset(assetId: string) {
    const normalized = String(assetId ?? '').toLowerCase()
    if (normalized.includes('image')) {
      return {
        id: assetId,
        sha256: null,
        filename: 'photo.png',
        extension: 'png',
        mime: 'image/png',
        sizeBytes: 1,
        assetKind: 'image',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri: 'file:///tmp/photo.png',
        ingestStatus: 'ready',
        previewStatus: 'ready',
        sourceMetaJson: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      }
    }
    if (normalized.includes('link') || normalized.includes('urlonly')) {
      if (normalized.includes('missing-url')) {
        return {
          id: assetId,
          sha256: null,
          filename: 'example.com',
          extension: null,
          mime: null,
          sizeBytes: 1,
          assetKind: 'document',
          sourceKind: 'url_import',
          storageBackend: 'remote_url',
          storageUri: 'https://example.com/file.pdf',
          ingestStatus: 'ready',
          previewStatus: 'unsupported',
          sourceMetaJson: {
            originalUrl: null,
            resolvedUrl: null,
            retentionMode: 'link_only',
            probeStatus: 'probe_failed',
            materializationStatus: 'not_requested',
            lastProbeAt: 1,
            probeWarning: 'probe_failed',
            contentTypeFromProbe: null,
            contentLengthFromProbe: null,
          },
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
        }
      }
      if (normalized.includes('remote-no-copy')) {
        return {
          id: assetId,
          sha256: null,
          filename: 'remote.pdf',
          extension: 'pdf',
          mime: 'application/pdf',
          sizeBytes: 1,
          assetKind: 'document',
          sourceKind: 'url_import',
          storageBackend: 'remote_url',
          storageUri: 'https://example.com/remote.pdf',
          ingestStatus: 'ready',
          previewStatus: 'unsupported',
          sourceMetaJson: {
            originalUrl: 'https://example.com/remote.pdf',
            resolvedUrl: 'https://example.com/remote.pdf',
            retentionMode: 'link_only',
            probeStatus: 'accessible',
            materializationStatus: 'not_requested',
            lastProbeAt: 1,
            probeWarning: null,
            contentTypeFromProbe: 'application/pdf',
            contentLengthFromProbe: '1234',
          },
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
        }
      }
      return {
        id: assetId,
        sha256: null,
        filename: 'example.com',
        extension: null,
        mime: null,
        sizeBytes: 1,
        assetKind: 'document',
        sourceKind: 'url_import',
        storageBackend: 'local_fs',
        storageUri: 'file:///tmp/link',
        ingestStatus: 'ready',
        previewStatus: 'ready',
        sourceMetaJson: {
          originalUrl: 'https://example.com/file.pdf',
          resolvedUrl: 'https://example.com/file.pdf',
          retentionMode: 'link_only',
          probeStatus: 'accessible',
          materializationStatus: 'not_requested',
          lastProbeAt: 1,
          probeWarning: null,
          contentTypeFromProbe: 'application/pdf',
          contentLengthFromProbe: '1234',
        },
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      }
    }
    if (normalized.includes('pdf')) {
      return {
        id: assetId,
        sha256: null,
        filename: 'document.pdf',
        extension: 'pdf',
        mime: 'application/pdf',
        sizeBytes: 1,
        assetKind: 'document',
        sourceKind: normalized.includes('local') ? 'local_upload' : 'url_import',
        storageBackend: 'local_fs',
        storageUri: 'file:///tmp/document.pdf',
        ingestStatus: 'ready',
        previewStatus: 'ready',
        sourceMetaJson: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      }
    }
    if (normalized.includes('binary')) {
      return {
        id: assetId,
        sha256: null,
        filename: 'archive.bin',
        extension: 'bin',
        mime: 'application/octet-stream',
        sizeBytes: 1,
        assetKind: 'binary',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri: 'file:///tmp/archive.bin',
        ingestStatus: 'ready',
        previewStatus: 'unsupported',
        sourceMetaJson: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      }
    }
    if (normalized.includes('audio')) {
      return {
        id: assetId,
        sha256: null,
        filename: 'clip.mp3',
        extension: 'mp3',
        mime: 'audio/mpeg',
        sizeBytes: 1,
        assetKind: 'audio',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri: 'file:///tmp/clip.mp3',
        ingestStatus: 'stored',
        previewStatus: 'unsupported',
        sourceMetaJson: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      }
    }
    if (normalized.includes('failed')) {
      return {
        id: assetId,
        sha256: null,
        filename: 'missing.bin',
        extension: 'bin',
        mime: 'application/octet-stream',
        sizeBytes: 1,
        assetKind: 'binary',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri: 'file:///tmp/missing.bin',
        ingestStatus: 'failed',
        previewStatus: 'unsupported',
        sourceMetaJson: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      }
    }
    return {
      id: assetId,
      sha256: null,
      filename: 'notes.txt',
      extension: 'txt',
      mime: 'text/plain',
      sizeBytes: 1,
      assetKind: 'text',
      sourceKind: 'local_upload',
      storageBackend: 'local_fs',
      storageUri: 'file:///tmp/notes.txt',
      ingestStatus: 'ready',
      previewStatus: 'ready',
      sourceMetaJson: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    }
  }

  function makeHistoryAttachment(messageId: string, attachmentId: string, assetId: string, overrides?: Partial<Record<string, unknown>>) {
    return {
      id: attachmentId,
      messageId,
      assetId,
      aiPayloadKind: overrides?.aiPayloadKind ?? (assetId.toLowerCase().includes('image') ? 'image' : assetId.toLowerCase().includes('pdf') ? 'pdf' : assetId.toLowerCase().includes('audio') ? 'audio' : assetId.toLowerCase().includes('video') ? 'video' : assetId.toLowerCase().includes('binary') ? 'binary' : 'text'),
      processingStatus: overrides?.processingStatus ?? 'native_supported',
      includeInNextRequest: overrides?.includeInNextRequest ?? true,
      excludedReason: overrides?.excludedReason ?? null,
      createdAt: overrides?.createdAt ?? 1,
      updatedAt: overrides?.updatedAt ?? 1,
      ...overrides,
    }
  }

  function buildSendPlanResponse(callCount: number, params?: any) {
    const assets = draftResponse.attachments.map((attachment: any) => makeFileAsset(String(attachment.assetId ?? 'unknown')))
    for (const rows of Object.values(historyAttachmentRowsByMessageId)) {
      for (const row of rows) {
        const assetId = String(row?.assetId ?? '').trim()
        if (!assetId) continue
        if (!assets.some((asset: any) => asset.id === assetId)) {
          assets.push(makeFileAsset(assetId))
        }
      }
    }
    const attachmentPlans = draftResponse.attachments.map((attachment: any, index: number) => {
      const assetId = String(attachment.assetId ?? '')
      const normalizedAssetId = assetId.toLowerCase()
      const asset = assets[index]
      const isImage = String(attachment.aiPayloadKind ?? '') === 'image' || String(asset.assetKind ?? '') === 'image'
      const isAudio = String(attachment.aiPayloadKind ?? '') === 'audio' || String(asset.assetKind ?? '') === 'audio'
      const modelSupportsImage = lastSendPlanModelInputModalities.includes('image')
      const isBinary = String(attachment.aiPayloadKind ?? '') === 'binary' || String(asset.assetKind ?? '') === 'binary'
      const isParsing =
        ['pending', 'probing', 'materializing'].includes(String(attachment.processingStatus ?? '')) ||
        String(asset.ingestStatus ?? '') === 'pending'
      const forcedWarning = normalizedAssetId.includes('warning') || normalizedAssetId.includes('warn')
      const forceExcluded = normalizedAssetId.includes('excluded')
      const forceHistorySource = normalizedAssetId.includes('history')
      const source = forceHistorySource ? 'history' as const : 'draft' as const
      const messageId = source === 'history'
        ? (normalizedAssetId.includes('history-2') ? 'm-history-2' : 'm-history-1')
        : null
      const preferredSendMode = String(attachment.preferredSendMode ?? 'default')
      const sourceMeta = (asset.sourceMetaJson && typeof asset.sourceMetaJson === 'object')
        ? (asset.sourceMetaJson as Record<string, unknown>)
        : null
      const resolvedUrl = String(sourceMeta?.resolvedUrl ?? sourceMeta?.originalUrl ?? '').trim()
      const hasUrlReference = resolvedUrl.length > 0
      const hasLocalCopy = typeof asset.storageUri === 'string' && asset.storageUri.startsWith('file://')
      let sendModeBlockingReason: string | null = null
      if (preferredSendMode === 'url_ref') {
        if (isAudio) {
          sendModeBlockingReason = 'Audio attachments cannot be sent as links.'
        } else if (!hasUrlReference) {
          sendModeBlockingReason = 'Link send mode requires an available URL.'
        }
      } else if (preferredSendMode === 'inline_base64') {
        if (!hasLocalCopy) {
          sendModeBlockingReason = 'File-copy send mode requires a local file copy.'
        }
      }
      if (normalizedAssetId.includes('blocked-leak')) {
        sendModeBlockingReason = 'C:/sensitive/local/path/secret.pdf data:image/png;base64,AAAA'
      }
      const displayStatus =
        isParsing
          ? 'parsing'
          : isImage && !modelSupportsImage
            ? 'incompatible_with_current_model'
            : sendModeBlockingReason
              ? 'failed'
              : forceExcluded
                ? 'ready_with_warnings'
                : forcedWarning
                  ? 'ready_with_warnings'
                  : isBinary || String(attachment.processingStatus ?? '') === 'unsupported'
                    ? 'unsupported'
                    : 'ready'
      let eligibility: 'included' | 'warning' | 'excluded' | 'blocked' = 'included'
      if (displayStatus === 'parsing' || displayStatus === 'incompatible_with_current_model' || displayStatus === 'unsupported' || sendModeBlockingReason !== null) {
        eligibility = 'blocked'
      } else if (forceExcluded) {
        eligibility = 'excluded'
      } else if (displayStatus === 'ready_with_warnings') {
        eligibility = 'warning'
      }
      const notes =
        sendModeBlockingReason
          ? [sendModeBlockingReason]
          : displayStatus === 'parsing'
            ? ['Attachment is still parsing.']
            : displayStatus === 'incompatible_with_current_model'
              ? ['Current model does not support image inputs.']
              : normalizedAssetId.includes('warning-leak')
                ? ['C:/sensitive/local/path/warn.txt data:image/png;base64,BBBB']
                : displayStatus === 'ready_with_warnings'
                  ? ['Attachment can be sent with warnings.']
                  : []
      return {
        assetId,
        attachmentId: String(attachment.id ?? ''),
        source,
        messageId,
        aiPayloadKind: String(attachment.aiPayloadKind ?? 'text'),
        selectedSendMode:
          displayStatus === 'incompatible_with_current_model' || displayStatus === 'unsupported'
            ? null
            : preferredSendMode === 'url_ref' || preferredSendMode === 'inline_base64'
              ? (preferredSendMode as 'url_ref' | 'inline_base64')
              : isAudio
                ? 'inline_base64'
                : isImage
                  ? 'inline_base64'
                  : 'url_ref',
        fallbackSendModes: isAudio ? ['inline_base64'] : (isImage ? ['url_ref'] : ['inline_base64']),
        eligibility,
        exclusionReason: eligibility === 'blocked' || eligibility === 'excluded' ? displayStatus : null,
        displayStatus,
        needsUserAttention: eligibility !== 'included',
        notes,
      }
    })

    const scopedHistoryMessageIds = Array.isArray(params?.historyScope?.messageIds)
      ? (params.historyScope.messageIds as unknown[]).map((value) => String(value ?? '').trim()).filter(Boolean)
      : []
    for (const messageId of historyIncompatibleMessageIds) {
      if (!scopedHistoryMessageIds.includes(messageId)) continue
      const rows = historyAttachmentRowsByMessageId[messageId] ?? []
      if (rows.length > 0) {
        for (const row of rows) {
          const assetId = String(row.assetId ?? '')
          attachmentPlans.push({
            assetId,
            attachmentId: String(row.id ?? ''),
            source: 'history',
            messageId,
            aiPayloadKind: String(row.aiPayloadKind ?? 'text'),
            selectedSendMode: null,
            fallbackSendModes: ['url_ref'],
            eligibility: 'excluded',
            exclusionReason: 'incompatible_with_current_model',
            displayStatus: 'incompatible_with_current_model',
            needsUserAttention: true,
            notes: ['Current model does not support image inputs.'],
          })
        }
        continue
      }
      const assetId = `asset-history-synthetic-${messageId}`
      if (!assets.some((asset: any) => asset.id === assetId)) {
        assets.push({
          id: assetId,
          sha256: null,
          filename: `history-${messageId}.png`,
          extension: 'png',
          mime: 'image/png',
          sizeBytes: 1,
          assetKind: 'image',
          sourceKind: 'local_upload',
          storageBackend: 'local_fs',
          storageUri: `file:///tmp/${assetId}.png`,
          ingestStatus: 'ready',
          previewStatus: 'ready',
          sourceMetaJson: null,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
        })
      }
      attachmentPlans.push({
        assetId,
        attachmentId: `history-att-${messageId}`,
        source: 'history',
        messageId,
        aiPayloadKind: 'image',
        selectedSendMode: null,
        fallbackSendModes: ['url_ref'],
        eligibility: 'excluded',
        exclusionReason: 'incompatible_with_current_model',
        displayStatus: 'incompatible_with_current_model',
        needsUserAttention: true,
        notes: ['Current model does not support image inputs.'],
      })
    }

    if (forceBlockedOnSecondSendPlanBuild && callCount >= 2 && attachmentPlans.length > 0) {
      attachmentPlans[0] = {
        ...attachmentPlans[0],
        eligibility: 'blocked',
        displayStatus: 'failed',
        exclusionReason: 'failed',
        needsUserAttention: true,
        notes: ['Attachment became blocked right before send.'],
      }
    }

    const hasBlocked = attachmentPlans.some((plan: any) => plan.eligibility === 'blocked')
    const hasExcluded = attachmentPlans.some((plan: any) => plan.eligibility === 'excluded')
    const hasWarnings = attachmentPlans.some((plan: any) => plan.eligibility === 'warning')
    const hasExcludedDraft = attachmentPlans.some((plan: any) => plan.eligibility === 'excluded' && plan.source === 'draft')
    const hasEffectiveCurrentInput =
      String(params?.draftText ?? draftResponse.draftText ?? '').trim().length > 0 ||
      attachmentPlans.some((plan: any) =>
        plan.source === 'draft' && (plan.eligibility === 'included' || plan.eligibility === 'warning')
      )

    const status = hasBlocked
      ? 'blocked'
      : hasExcluded
        ? 'partially_sendable'
        : hasWarnings
          ? 'sendable_with_warnings'
          : hasEffectiveCurrentInput
            ? 'sendable'
            : 'blocked'

    const canProceedAfterDroppingExcluded = hasExcluded && !hasExcludedDraft

    return {
      sendPlan: {
        status,
        warnings: attachmentPlans
          .filter((plan: any) => plan.eligibility === 'warning')
          .map((plan: any) => ({ code: 'warning', message: plan.notes?.[0] ?? 'warning', assetId: plan.assetId, source: plan.source })),
        blockingReasons: attachmentPlans
          .filter((plan: any) => plan.eligibility === 'blocked')
          .map((plan: any) => ({ code: 'blocked', message: plan.notes?.[0] ?? 'blocked', assetId: plan.assetId, source: plan.source })),
        includedAttachments: attachmentPlans
          .filter((plan: any) => plan.eligibility === 'included' || plan.eligibility === 'warning')
          .map((plan: any) => ({
            assetId: plan.assetId,
            source: plan.source,
            attachmentId: plan.attachmentId,
            messageId: plan.messageId,
          })),
        excludedAttachments: attachmentPlans
          .filter((plan: any) => plan.eligibility === 'excluded')
          .map((plan: any) => ({
            assetId: plan.assetId,
            source: plan.source,
            attachmentId: plan.attachmentId,
            messageId: plan.messageId,
            exclusionReason: plan.notes?.[0] ?? 'excluded',
          })),
        attachmentPlans,
        requiresModelChange: attachmentPlans.some((plan: any) => plan.displayStatus === 'incompatible_with_current_model'),
        canProceedAfterDroppingExcluded,
        requiresUserConfirmation: attachmentPlans.some((plan: any) => plan.eligibility !== 'included'),
        plannerVersion: 'phase-5/v1',
      },
      draftText: draftResponse.draftText,
      assets,
      storageRootDir: 'C:/tmp',
    }
  }

  function baseDraft(): DraftResponse {
    return {
      conversationId: 'c1',
      draftText: 'restored from conversation draft',
      draftMode: 'compose' as const,
      editingSourceMessageId: null,
      attachedAssetIds: [],
      attachments: [],
      updatedAt: 1,
    }
  }

  function makeContextMessage(id: string, seq: number, role: 'user' | 'assistant' = 'user') {
    return {
      id,
      convoId: 'c1',
      role,
      seq,
      createdAt: seq,
      parentId: null,
      status: 'final',
      answerRootId: null,
      questionId: null,
      body: role === 'assistant' ? `assistant-${id}` : `user-${id}`,
      meta: null,
    }
  }

  beforeEach(() => {
    draftResponse = baseDraft()
    sendPlanBuildCallCount = 0
    forceBlockedOnSecondSendPlanBuild = false
    contextMessages = []
    convoRows = [{ id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 2, meta: { selectedModelKey: 'openai/gpt-4o' } }]
    historyIncompatibleMessageIds = []
    historyAttachmentRowsByMessageId = {}
    selectLocalFiles = vi.fn(async (options?: { context?: 'file' | 'image' }) => {
      if (options?.context === 'image') {
        return { filePaths: ['C:/tmp/photo.png'] }
      }
      return { filePaths: ['C:/tmp/doc.txt'] }
    })

    invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'project.getInbox') return null
      if (method === 'project.list') return []
      if (method === 'project.countConversationsBatch') return { counts: {} }
      if (method === 'settings.getReasoningPrefs') return { value: null }
      if (method === 'settings.getWebSearchDefaults') return { value: null }
      if (method === 'settings.getSamplingParamsDefaults') return { value: null }
      if (method === 'settings.getUserMessageRenderDefault') return { value: null }
      if (method === 'settings.getImageGenerationDefault') return { value: null }
      if (method === 'settings.getChatReasoningDisplayMode') return { value: 'inline' }
      if (method === 'settings.setChatReasoningDisplayMode') return { ok: true }

      if (method === 'convo.list') {
        return convoRows
      }
      if (method === 'branch.ensureDefault') {
        const convoId = String(params?.convoId ?? 'c1')
        const branchId = convoId === 'c2' ? 'b2' : 'b1'
        return { id: branchId, convoId, headMessageId: null, name: 'Main', createdAt: 1, updatedAt: 2, deletedAt: null }
      }
      if (method === 'branch.list') {
        const convoId = String(params?.convoId ?? 'c1')
        const branchId = convoId === 'c2' ? 'b2' : 'b1'
        return [{ id: branchId, convoId, headMessageId: null, name: 'Main', createdAt: 1, updatedAt: 2, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        const branchId = String(params?.branchId ?? 'b1')
        return {
          messages: contextMessages,
          turns: [],
          debug: {
            branchId,
            excludedQuestionIds: [],
            includedMessageIds: contextMessages.map((message) => String(message.id ?? '')),
            chosenAnswerRootByQuestionId: {},
          },
        }
      }
      if (method === 'context.buildForBranch') {
        const branchId = String(params?.branchId ?? 'b1')
        return {
          messages: contextMessages,
          debug: {
            branchId,
            excludedQuestionIds: [],
            includedMessageIds: contextMessages.map((message) => String(message.id ?? '')),
            chosenAnswerRootByQuestionId: {},
          },
        }
      }

      if (method === 'branch.beginTurn') {
        return {
          ok: true,
          convoId: 'c1',
          branchId: 'b1',
          questionId: 'u-send',
          questionSeq: 3,
          assistantId: 'a-send',
          assistantSeq: 4,
        }
      }

      if (method === 'modelCatalog.list') {
        return [
          {
            modelId: 'openai/gpt-4o',
            name: 'GPT-4o',
            vendor: 'openai',
            lastSeenSnapshotId: 's1',
            isHidden: 0,
            supportedParametersJson: '[]',
          },
        ]
      }
      if (method === 'modelCatalog.queryCore') {
        return {
          items: [
            {
              providerKey: 'openrouter',
              modelId: 'openai/gpt-4o',
              modelKey: 'openrouter::openai/gpt-4o',
              canonicalSlug: 'openai/gpt-4o',
              displayName: 'GPT-4o',
              description: 'text only',
              vendor: 'openai',
              contextLength: 128000,
              maxOutputTokens: 16384,
              createdAtSec: 1,
              pricePrompt: null,
              priceCompletion: null,
              priceRequest: null,
              priceImage: null,
              capReasoning: 1,
              capTools: 1,
              capStructuredOutputs: 1,
              capVision: 0,
              capLongContext: 1,
            },
          ],
          nextCursor: null,
          notice: null,
        }
      }
      if (method === 'reasoningIndex.list') return []
      if (method === 'modelCatalog.getModelDetail') {
        return {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
          item: {
            providerKey: 'openrouter',
            modelId: 'openai/gpt-4o',
            modelKey: 'openrouter::openai/gpt-4o',
            canonicalSlug: 'openai/gpt-4o',
            displayName: 'GPT-4o',
            description: null,
            vendor: 'openai',
            family: null,
            status: 'active',
            visibility: 'visible',
            contextLength: 128000,
            maxOutputTokens: 16384,
            architectureModality: 'text->text',
            inputModalities: ['text'],
            outputModalities: ['text'],
            tokenizer: null,
            instructType: null,
            supportedParameters: [],
            capabilities: {
              reasoning: true,
              tools: true,
              structuredOutputs: true,
              vision: false,
              longContext: true,
            },
            pricing: {
              prompt: null,
              completion: null,
              request: null,
              image: null,
              webSearch: null,
              internalReasoning: null,
              inputCacheRead: null,
              inputCacheWrite: null,
            },
            createdAtSec: 1,
            expirationDate: null,
            expirationAtSec: null,
            unknownExpiration: false,
            hasPerRequestLimits: false,
            hasDefaultParameters: false,
            perRequestLimits: null,
            defaultParameters: null,
            topProviderContextLength: null,
            topProviderIsModerated: false,
            firstSeenAtMs: 1,
            lastSeenAtMs: 1,
            syncedAtMs: 1,
            raw: {
              inputModalitiesJson: '["text"]',
              outputModalitiesJson: '["text"]',
              supportedParametersJson: '[]',
              capabilitiesJson: '{"reasoning":true,"tools":true,"structuredOutputs":true,"vision":false,"longContext":true}',
              pricingJson: null,
              perRequestLimitsJson: null,
              defaultParametersJson: null,
              rawJson: null,
            },
          },
          error: null,
        }
      }

      if (method === 'conversationDraft.restore') {
        const convoId = String(params?.conversationId ?? 'c1')
        if (convoId !== 'c1') {
          return {
            ...baseDraft(),
            conversationId: convoId,
            draftText: '',
          }
        }
        return draftResponse
      }
      if (method === 'conversationDraft.updateText') {
        draftResponse = {
          ...draftResponse,
          draftText: String(params?.draftText ?? ''),
        }
        return draftResponse
      }
      if (method === 'conversationDraft.addAttachment') {
        const attachment = makeDraftAttachment(String(params?.assetId ?? 'unknown'), {
          attachmentOrder: draftResponse.attachments.length,
        })
        draftResponse = {
          ...draftResponse,
          attachedAssetIds: Array.from(new Set([...draftResponse.attachedAssetIds, attachment.assetId])),
          attachments: [...draftResponse.attachments, attachment],
          updatedAt: 1,
        }
        return attachment
      }
      if (method === 'conversationDraft.removeAttachment') {
        const assetId = String(params?.assetId ?? '')
        const removed = draftResponse.attachments.some((attachment: any) => attachment.assetId === assetId)
        const nextAttachments = draftResponse.attachments.filter((attachment: any) => attachment.assetId !== assetId)
        draftResponse = {
          ...draftResponse,
          attachedAssetIds: nextAttachments.map((attachment: any) => attachment.assetId),
          attachments: nextAttachments,
          updatedAt: 1,
        }
        return {
          ok: true,
          removed,
          ownership: {
            assetId,
            ownerKind: removed ? 'detached' : 'detached',
            lifecycleStatus: removed ? 'detached' : 'detached',
            draftConversationIds: [],
            messageIds: [],
            reason: 'removed_from_draft',
            updatedAt: 1,
          },
        }
      }

      if (method === 'conversationDraft.updateAttachmentSettings') {
        const assetId = String(params?.assetId ?? '')
        draftResponse = {
          ...draftResponse,
          attachments: draftResponse.attachments.map((attachment: any) => (
            attachment.assetId === assetId
              ? {
                  ...attachment,
                  ...(params?.preferredSendMode !== undefined ? { preferredSendMode: params.preferredSendMode } : {}),
                  ...(params?.urlRetentionMode !== undefined ? { urlRetentionMode: params.urlRetentionMode } : {}),
                  ...(params?.dfcManaged !== undefined ? { dfcManaged: params.dfcManaged } : {}),
                  ...(params?.selectedOptionId !== undefined ? { selectedOptionId: params.selectedOptionId } : {}),
                  ...(params?.selectedAssetRefs !== undefined ? { selectedAssetRefs: params.selectedAssetRefs } : {}),
                  updatedAt: 1,
                }
              : attachment
          )),
          updatedAt: 1,
        }
        return draftResponse.attachments.find((attachment: any) => attachment.assetId === assetId) ?? null
      }

      if (method === 'conversationDraft.getDfcOptions') {
        const assetId = String(params?.assetId ?? '')
        const attachment = draftResponse.attachments.find((item: any) => item.assetId === assetId) ?? makeDraftAttachment(assetId)
        const asset = makeFileAsset(assetId)
        const rawOption = {
          optionId: `dfc:${assetId}:original_file:raw_file:${assetId}`,
          targetKind: 'original_file',
          sendStrategy: 'file_attachment',
          status: 'ready',
          isAvailable: true,
          compatibilityStatus: 'compatible',
          sendAssetRefs: [{ kind: 'raw_file', assetId }],
          warnings: [],
          diagnostics: [],
        }
        const markdownOption = {
          optionId: `dfc:${assetId}:markdown:derived_asset:derivative-markdown`,
          targetKind: 'markdown',
          sendStrategy: 'text_in_prompt',
          status: 'ready',
          isAvailable: true,
          compatibilityStatus: 'compatible',
          sendAssetRefs: [{ kind: 'derived_asset', assetId: 'derivative-markdown' }],
          warnings: [],
          diagnostics: [],
        }
        const options = assetId.includes('dfc') ? [rawOption, markdownOption] : [rawOption]
        const selectedOptionId = String(attachment.selectedOptionId ?? '').trim() || null
        const selectedOption = selectedOptionId ? options.find((option) => option.optionId === selectedOptionId) ?? null : null
        return {
          attachmentId: attachment.id,
          conversationId: 'c1',
          rawFileId: assetId,
          filename: asset.filename,
          sizeBytes: asset.sizeBytes,
          dfcManaged: attachment.dfcManaged === true,
          selectedOptionId,
          selectedAssetRefs: attachment.selectedAssetRefs ?? [],
          decision: selectedOption
            ? {
                status: 'ready',
                reasonCode: null,
                selectedOptionId,
                targetKind: selectedOption.targetKind,
                sendStrategy: selectedOption.sendStrategy,
                sendAssetRefs: selectedOption.sendAssetRefs,
                needsUserAction: false,
              }
            : {
                status: 'needs_user_selection',
                reasonCode: selectedOptionId ? 'selected_option_not_found' : 'selected_option_missing',
                selectedOptionId,
                targetKind: null,
                sendStrategy: null,
                sendAssetRefs: [],
                needsUserAction: true,
              },
          options,
        }
      }

      if (method === 'conversationDraft.getDfcPreview') {
        const assetId = String(params?.assetId ?? '')
        const attachment = draftResponse.attachments.find((item: any) => item.assetId === assetId) ?? makeDraftAttachment(assetId)
        const asset = makeFileAsset(assetId)
        const selectedOptionId = String(attachment.selectedOptionId ?? '').trim() || null
        const isMarkdown = selectedOptionId === `dfc:${assetId}:markdown:derived_asset:derivative-markdown`
        const isOriginal = selectedOptionId === `dfc:${assetId}:original_file:raw_file:${assetId}`
        return {
          attachmentId: attachment.id,
          conversationId: 'c1',
          rawFileId: assetId,
          filename: asset.filename,
          sizeBytes: asset.sizeBytes,
          dfcManaged: attachment.dfcManaged === true,
          selectedOptionId,
          selectedAssetRefs: attachment.selectedAssetRefs ?? [],
          targetKind: isMarkdown ? 'markdown' : isOriginal ? 'original_file' : null,
          sendStrategy: isMarkdown ? 'text_in_prompt' : isOriginal ? 'file_attachment' : null,
          decision: {
            status: selectedOptionId ? 'ready' : 'needs_user_selection',
            reasonCode: selectedOptionId ? null : 'selected_option_missing',
            selectedOptionId,
            targetKind: isMarkdown ? 'markdown' : isOriginal ? 'original_file' : null,
            sendStrategy: isMarkdown ? 'text_in_prompt' : isOriginal ? 'file_attachment' : null,
            sendAssetRefs: attachment.selectedAssetRefs ?? [],
            needsUserAction: !selectedOptionId,
          },
          preview: isMarkdown
            ? {
                kind: 'text',
                status: 'ready',
                text: 'Markdown preview from selected option',
                characterCount: 37,
                byteLength: 37,
                truncated: false,
                maxCharacters: Number(params?.maxCharacters ?? 2048),
                diagnostics: [],
              }
            : isOriginal
              ? {
                  kind: 'raw_file',
                  status: 'ready',
                  text: null,
                  characterCount: null,
                  byteLength: null,
                  truncated: false,
                  maxCharacters: Number(params?.maxCharacters ?? 2048),
                  diagnostics: [{ code: 'dfc_preview_raw_file_metadata_only', message: 'metadata only' }],
                }
              : {
                  kind: 'none',
                  status: 'needs_user_selection',
                  text: null,
                  characterCount: null,
                  byteLength: null,
                  truncated: false,
                  maxCharacters: Number(params?.maxCharacters ?? 2048),
                  diagnostics: [{ code: 'selected_option_missing', message: 'missing' }],
                },
        }
      }

      if (method === 'messageAttachment.listByMessageId') {
        const messageId = String(params?.messageId ?? '')
        return historyAttachmentRowsByMessageId[messageId] ?? []
      }

      if (method === 'fileAsset.listByIds') {
        const rawIds = Array.isArray((params as any)?.ids)
          ? ((params as any).ids as unknown[])
          : Array.isArray((params as any)?.assetIds)
            ? ((params as any).assetIds as unknown[])
            : []
        const assetIds = rawIds.map((value) => String(value ?? '').trim()).filter(Boolean)
        return assetIds.map((assetId) => makeFileAsset(assetId))
      }

      if (method === 'fileIngestion.ingestLocalFile') {
        const filePath = String(params?.filePath ?? '')
        if (filePath.includes('bad')) {
          return {
            success: false,
            sourceKind: 'local_upload',
            assetId: null,
            normalizedExtension: 'txt',
            assetKind: 'text',
            aiPayloadKind: 'text',
            processingStatus: 'native_supported',
            isNativeSupportedForMvp: true,
            isConvertibleCandidate: false,
            importStatus: 'failed',
            sendEligibilityHints: {
              canUseUrlRef: true,
              canUseLocalFile: true,
              canUseInlinePayload: true,
              urlReferenceMayStillBeUsable: true,
              notes: ['failed'],
            },
            warnings: [],
            failureReasonCode: 'local_read_failed',
          }
        }
        return {
          success: true,
          sourceKind: 'local_upload',
          assetId: filePath.includes('photo') ? 'asset-image' : 'asset-text',
          normalizedExtension: filePath.includes('photo') ? 'png' : 'txt',
          assetKind: filePath.includes('photo') ? 'image' : 'text',
          aiPayloadKind: filePath.includes('photo') ? 'image' : 'text',
          processingStatus: 'native_supported',
          isNativeSupportedForMvp: true,
          isConvertibleCandidate: false,
          importStatus: 'ready',
          sendEligibilityHints: {
            canUseUrlRef: true,
            canUseLocalFile: true,
            canUseInlinePayload: true,
            urlReferenceMayStillBeUsable: true,
            notes: [],
          },
          warnings: [],
          failureReasonCode: null,
        }
      }

      if (method === 'fileIngestion.ingestUrl') {
        return {
          success: true,
          sourceKind: 'url_import',
          assetId: 'asset-url',
          normalizedExtension: 'pdf',
          assetKind: 'document',
          aiPayloadKind: 'pdf',
          processingStatus: 'native_supported',
          isNativeSupportedForMvp: true,
          isConvertibleCandidate: false,
          importStatus: 'ready',
          sendEligibilityHints: {
            canUseUrlRef: true,
            canUseLocalFile: false,
            canUseInlinePayload: false,
            urlReferenceMayStillBeUsable: true,
            notes: [],
          },
          warnings: [],
          failureReasonCode: null,
          retentionMode: String(params?.retentionMode ?? 'link_only'),
          probeStatus: 'accessible',
          materializationStatus: 'not_requested',
          originalUrl: String(params?.url ?? ''),
          resolvedUrl: String(params?.url ?? ''),
        }
      }

      if (method === 'preview.getLatestReady') {
        const assetId = String(params?.assetId ?? '')
        if (assetId.includes('missing')) {
          return {
            assetId,
            status: 'missing',
            derivativeId: null,
            mime: null,
            dataUrl: null,
            width: null,
            height: null,
            bytes: null,
            reused: false,
            errorCode: null,
            errorMessage: null,
          }
        }
        if (assetId.includes('failed')) {
          return {
            assetId,
            status: 'failed',
            derivativeId: null,
            mime: null,
            dataUrl: null,
            width: null,
            height: null,
            bytes: null,
            reused: false,
            errorCode: 'preview_read_failed',
            errorMessage: 'failed',
          }
        }
        return {
          assetId,
          status: 'ready',
          derivativeId: `derivative-${assetId}`,
          mime: 'image/png',
          dataUrl: 'data:image/png;base64,AA==',
          width: 64,
          height: 64,
          bytes: 8,
          reused: false,
          errorCode: null,
          errorMessage: null,
        }
      }

      if (method === 'preview.ensure') {
        const assetId = String(params?.assetId ?? '')
        if (assetId.includes('failed')) {
          return {
            assetId,
            status: 'failed',
            derivativeId: null,
            mime: null,
            dataUrl: null,
            width: null,
            height: null,
            bytes: null,
            reused: false,
            errorCode: 'preview_ensure_failed',
            errorMessage: 'failed to build preview',
          }
        }
        return {
          assetId,
          status: 'ready',
          derivativeId: `derivative-${assetId}`,
          mime: 'image/png',
          dataUrl: 'data:image/png;base64,BB==',
          width: 64,
          height: 64,
          bytes: 8,
          reused: true,
          errorCode: null,
          errorMessage: null,
        }
      }

      if (method === 'sendPlan.buildCurrent') {
        lastSendPlanModelInputModalities = Array.isArray(params?.model?.inputModalities)
          ? (params.model.inputModalities as string[])
          : ['text']
        sendPlanBuildCallCount += 1
        return buildSendPlanResponse(sendPlanBuildCallCount, params)
      }

      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }
    ;(globalThis as any).electronAPI = {
      selectLocalFiles,
    }
    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'sk-test'
        if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
        return undefined
      }),
    }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronAPI = originalElectronApi
    ;(globalThis as any).electronStore = originalElectronStore
    vi.restoreAllMocks()
  })

  it('routes file uploads into file ingestion and conversation draft attachments', async () => {
    const layoutMock = mockAttachmentMenuLayout()
    const user = userEvent.setup()
    render(AppChatApp)

    await user.click(await screen.findByTestId('composer-attach-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('composer-attach-menu')).toHaveAttribute('aria-hidden', 'false')
    })
    await user.click(screen.getByTestId('composer-attach-file'))

    await waitFor(() => {
      expect(selectLocalFiles).toHaveBeenCalledWith({ context: 'file', allowMultiple: true })
      expect(invoke).toHaveBeenCalledWith('fileIngestion.ingestLocalFile', expect.objectContaining({ filePath: 'C:/tmp/doc.txt' }))
      expect(invoke).toHaveBeenCalledWith('conversationDraft.addAttachment', expect.objectContaining({ assetId: 'asset-text', conversationId: 'c1' }))
      expect(screen.getByTestId('draft-attachment-strip')).toBeTruthy()
      expect(sendPlanBuildCallCount).toBeGreaterThan(1)
    })
    layoutMock.mockRestore()
  })

  it('opens the URL prompt and routes URL uploads through file ingestion', async () => {
    const layoutMock = mockAttachmentMenuLayout()
    const user = userEvent.setup()
    render(AppChatApp)

    await user.click(await screen.findByTestId('composer-attach-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('composer-attach-menu')).toHaveAttribute('aria-hidden', 'false')
    })
    await user.click(screen.getByTestId('composer-attach-url'))

    const dialog = await screen.findByTestId('attachment-url-dialog')
    expect(dialog).toBeTruthy()

    const urlInput = screen.getByPlaceholderText('https://example.com/file.pdf') as HTMLInputElement
    await user.clear(urlInput)
    await user.type(urlInput, 'https://example.com/file.pdf')
    await user.click(screen.getByTestId('attachment-url-confirm'))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('fileIngestion.ingestUrl', expect.objectContaining({
        url: 'https://example.com/file.pdf',
        retentionMode: 'link_only',
      }))
      expect(invoke).toHaveBeenCalledWith('conversationDraft.addAttachment', expect.objectContaining({ assetId: 'asset-url', conversationId: 'c1' }))
      expect(screen.getByTestId('draft-attachment-strip')).toBeTruthy()
    })
    layoutMock.mockRestore()
  })

  it('keeps single-file failures local and continues later files', async () => {
    const layoutMock = mockAttachmentMenuLayout()
    const user = userEvent.setup()
    selectLocalFiles.mockResolvedValueOnce({ filePaths: ['C:/tmp/bad.txt', 'C:/tmp/good.txt'] })
    render(AppChatApp)

    await user.click(await screen.findByTestId('composer-attach-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('composer-attach-menu')).toHaveAttribute('aria-hidden', 'false')
    })
    await user.click(screen.getByTestId('composer-attach-file'))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('fileIngestion.ingestLocalFile', expect.objectContaining({ filePath: 'C:/tmp/bad.txt' }))
      expect(invoke).toHaveBeenCalledWith('fileIngestion.ingestLocalFile', expect.objectContaining({ filePath: 'C:/tmp/good.txt' }))
      expect(invoke).toHaveBeenCalledWith('conversationDraft.addAttachment', expect.objectContaining({ assetId: 'asset-text', conversationId: 'c1' }))
    })
    layoutMock.mockRestore()
  })

  it('renders a draft attachment strip with non-image file cards from the restored conversation draft', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [
        makeDraftAttachment('asset-link-only', { attachmentOrder: 0 }),
        makeDraftAttachment('asset-pdf-local', { attachmentOrder: 1 }),
        makeDraftAttachment('asset-text', { attachmentOrder: 2 }),
      ],
      attachedAssetIds: ['asset-link-only', 'asset-pdf-local', 'asset-text'],
    }

    render(AppChatApp)

    await screen.findByTestId('draft-attachment-strip')
    expect(screen.getByTestId('draft-attachment-card-asset-link-only').textContent).toContain('URL')
    expect(screen.getByTestId('draft-attachment-card-asset-pdf-local').textContent).toContain('PDF')
    expect(screen.getByTestId('draft-attachment-card-asset-text').textContent).toContain('TXT')
  })

  it('shows preview thumbnails for image attachments and triggers ensurePreview when a ready preview is missing', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [
        makeDraftAttachment('asset-image-missing', { attachmentOrder: 0 }),
      ],
      attachedAssetIds: ['asset-image-missing'],
    }

    render(AppChatApp)

    await waitFor(
      () => {
        expect(invoke.mock.calls.some((call) => call[0] === 'preview.getLatestReady' && (call[1] as any)?.assetId === 'asset-image-missing')).toBe(true)
        expect(invoke.mock.calls.some((call) => call[0] === 'preview.ensure' && (call[1] as any)?.assetId === 'asset-image-missing')).toBe(true)
      },
      { timeout: 5000 },
    )
    expect((await screen.findByTestId('draft-attachment-card-asset-image-missing')).textContent).toContain('photo.png')
    expect(screen.getByTestId('draft-attachment-preview')).toBeTruthy()
  })

  it('renders historical user-message attachments below the message bubble', async () => {
    const user = userEvent.setup()
    contextMessages = [makeContextMessage('m-history-1', 1, 'user')]
    historyAttachmentRowsByMessageId = {
      'm-history-1': [
        makeHistoryAttachment('m-history-1', 'att-image-1', 'asset-image-missing'),
      ],
    }
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('history-attachment-list')).toBeTruthy()
      expect(screen.getByTestId('history-attachment-card-att-image-1').textContent).toContain('photo.png')
    })
    await user.click(screen.getByTestId('history-attachment-card-att-image-1'))
    expect(screen.queryByTestId('draft-attachment-details-dialog')).toBeNull()
    expect(invoke.mock.calls.some((call) => call[0] === 'preview.ensure' && String((call[1] as any)?.assetId ?? '') === 'asset-image-missing')).toBe(true)
  })

  it('does not render historical attachment cards when a user message has no attachments', async () => {
    contextMessages = [makeContextMessage('m-history-1', 1, 'user')]
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.queryByTestId('history-attachment-list')).toBeNull()
    })
  })

  it('keeps non-image historical attachments on a simple card and does not retry preview', async () => {
    contextMessages = [makeContextMessage('m-history-1', 1, 'user')]
    historyAttachmentRowsByMessageId = {
      'm-history-1': [
        makeHistoryAttachment('m-history-1', 'att-text-1', 'asset-text', { aiPayloadKind: 'text' }),
      ],
    }
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('history-attachment-card-att-text-1').textContent).toContain('TXT')
      expect(screen.getByTestId('history-attachment-placeholder-att-text-1')).toBeTruthy()
    })
    expect(invoke.mock.calls.some((call) => call[0] === 'preview.ensure' && String((call[1] as any)?.assetId ?? '') === 'asset-text')).toBe(false)
  })

  it('marks unsupported historical attachments red and highlights the active incompatible attachment', async () => {
    contextMessages = [makeContextMessage('m-history-1', 1, 'user')]
    historyAttachmentRowsByMessageId = {
      'm-history-1': [
        makeHistoryAttachment('m-history-1', 'att-binary-1', 'asset-binary', { aiPayloadKind: 'binary', processingStatus: 'unsupported' }),
      ],
    }
    historyIncompatibleMessageIds = ['m-history-1']
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await waitFor(() => {
      const card = screen.getByTestId('history-attachment-card-att-binary-1')
      expect(card.className).toContain('border-red-300')
      expect(card.className).toContain('ring-amber-400')
    })
  })

  it('falls back to message-level highlighting when the active incompatible attachment cannot be rendered', async () => {
    const user = userEvent.setup()
    contextMessages = [makeContextMessage('m-history-1', 1, 'user')]
    historyIncompatibleMessageIds = ['m-history-1']
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await user.click(await screen.findByTestId('composer-history-incompatible-review'))
    await waitFor(() => {
      const wrapper = screen.getByTestId('msg-wrap-m-history-1')
      expect(wrapper.className).toContain('ring-amber-200')
      expect(screen.queryByTestId('history-attachment-list')).toBeNull()
    })
  })

  it('maps send-plan statuses to border tones and parsing to grayscale', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [
        makeDraftAttachment('asset-text', { attachmentOrder: 0 }),
        makeDraftAttachment('asset-warning', { attachmentOrder: 1 }),
        makeDraftAttachment('asset-image', { attachmentOrder: 2 }),
        makeDraftAttachment('asset-pending', { attachmentOrder: 3, processingStatus: 'pending' }),
        makeDraftAttachment('asset-binary', { attachmentOrder: 4 }),
      ],
      attachedAssetIds: ['asset-text', 'asset-warning', 'asset-image', 'asset-pending', 'asset-binary'],
    }

    render(AppChatApp)

    await waitFor(
      () => {
        expect(screen.getByTestId('draft-attachment-card-asset-text').className).toContain('border-green-300')
        expect(screen.getByTestId('draft-attachment-card-asset-warning').className).toContain('border-amber-300')
        expect(screen.getByTestId('draft-attachment-card-asset-image').className).toContain('border-red-300')
        expect(screen.getByTestId('draft-attachment-card-asset-pending').className).toContain('grayscale')
        expect(screen.getByTestId('draft-attachment-card-asset-binary').className).toContain('border-red-300')
      },
      { timeout: 5000 },
    )
  })

  it('does not apply attachment blocking gate when draft has no attachments', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [],
      attachedAssetIds: [],
    }

    render(AppChatApp)

    await screen.findByTestId('composer-send')
    expect(screen.queryByTestId('composer-send-gate-block')).toBeNull()
  })

  it('keeps an empty draft idle: send disabled, no banner, and no send-plan fallback', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    draftResponse = {
      ...baseDraft(),
      draftText: '',
      attachments: [],
      attachedAssetIds: [],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(invoke.mock.calls.some((call) => call[0] === 'sendPlan.buildCurrent')).toBe(true)
    })
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    expect(screen.queryByTestId('composer-send-gate-block')).toBeNull()
    expect(screen.queryByTestId('composer-send-gate-warning')).toBeNull()
    expect(
      warnSpy.mock.calls.some((call) =>
        String(call[0] ?? '').includes('refreshDraftAttachmentViewModels send-plan fallback')
      ),
    ).toBe(false)
  })

  it('opens confirmation flow when attachment send plan has a blocking reason', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [
        makeDraftAttachment('asset-link-missing-url', {
          attachmentOrder: 0,
          preferredSendMode: 'url_ref',
          urlRetentionMode: 'link_only',
        }),
      ],
      attachedAssetIds: ['asset-link-missing-url'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeEnabled()
      expect(screen.getByTestId('composer-send-gate-warning').textContent).toContain('发送前需要确认处理方式')
    })
  })

  it('does not block send when send plan only has warnings', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-warning', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-warning'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeEnabled()
      expect(screen.getByTestId('composer-send-gate-warning').textContent).toContain('Attachment can be sent with warnings.')
    })
  })

  it('allows send for conservatively safe partially_sendable plans', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [
        makeDraftAttachment('asset-main', { attachmentOrder: 0 }),
        makeDraftAttachment('asset-history-excluded', { attachmentOrder: 1 }),
      ],
      attachedAssetIds: ['asset-main', 'asset-history-excluded'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeEnabled()
      expect(screen.getByTestId('composer-send-gate-warning').textContent).toContain('发送前需要确认处理方式')
    })
  })

  it('requires confirmation for uncertain partially_sendable plans', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [
        makeDraftAttachment('asset-main', { attachmentOrder: 0 }),
        makeDraftAttachment('asset-draft-excluded', { attachmentOrder: 1 }),
      ],
      attachedAssetIds: ['asset-main', 'asset-draft-excluded'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeEnabled()
      expect(screen.getByTestId('composer-send-gate-warning').textContent).toContain('发送前需要确认处理方式')
    })
  })

  it('requires confirmation when file-copy mode is selected but no local copy exists', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [
        makeDraftAttachment('asset-link-remote-no-copy', {
          attachmentOrder: 0,
          preferredSendMode: 'inline_base64',
          urlRetentionMode: 'link_only',
        }),
      ],
      attachedAssetIds: ['asset-link-remote-no-copy'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeEnabled()
      expect(screen.getByTestId('composer-send-gate-warning').textContent).toContain('发送前需要确认处理方式')
    })
  })

  it('does not treat preview availability as sendability', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-image-pending', { attachmentOrder: 0, processingStatus: 'pending' })],
      attachedAssetIds: ['asset-image-pending'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('draft-attachment-preview')).toBeTruthy()
      expect(screen.getByTestId('composer-send')).toBeDisabled()
      expect(screen.getByTestId('composer-send-gate-block').textContent).toContain('附件仍在解析')
    })
  })

  it('opens attachment confirmation panel and keeps draft interactions locked while panel exists', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-draft-excluded', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-draft-excluded'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeEnabled()
    })
    await user.click(screen.getByTestId('composer-send'))

    await screen.findByTestId('attachment-confirm-panel')
    expect(screen.getByTestId('composer-draft')).toBeDisabled()
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    expect(screen.getByTestId('current-model-pill')).toBeDisabled()
  })

  it('enforces unresolved decisions and exclude/remove mutual exclusion in current attachment confirmation', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-draft-excluded', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-draft-excluded'],
    }

    render(AppChatApp)
    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeEnabled()
    })
    await user.click(screen.getByTestId('composer-send'))

    await screen.findByTestId('attachment-confirm-panel')
    await user.click(screen.getByTestId('attachment-confirm-confirm'))
    await waitFor(() => {
      expect(screen.getByTestId('attachment-confirm-validation').textContent).toContain('请为每个当前不受支持附件选择 exclude 或 remove')
      expect(screen.getByTestId('attachment-confirm-current-row-draft-attachment-asset-draft-excluded').className).toContain('ring-2')
    })

    await user.click(screen.getByTestId('attachment-confirm-current-exclude-draft-attachment-asset-draft-excluded'))
    expect((screen.getByTestId('attachment-confirm-current-exclude-draft-attachment-asset-draft-excluded') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('attachment-confirm-current-remove-draft-attachment-asset-draft-excluded') as HTMLInputElement).checked).toBe(false)

    await user.click(screen.getByTestId('attachment-confirm-current-remove-draft-attachment-asset-draft-excluded'))
    expect((screen.getByTestId('attachment-confirm-current-exclude-draft-attachment-asset-draft-excluded') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByTestId('attachment-confirm-current-remove-draft-attachment-asset-draft-excluded') as HTMLInputElement).checked).toBe(true)
  })

  it('cancels confirmation session and restores unlocked draft state', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-draft-excluded', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-draft-excluded'],
    }

    render(AppChatApp)
    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeEnabled()
    })
    await user.click(screen.getByTestId('composer-send'))
    await screen.findByTestId('attachment-confirm-panel')

    await user.click(screen.getByTestId('attachment-confirm-collapse'))
    await screen.findByTestId('attachment-confirm-collapsed-banner')
    await user.click(screen.getByTestId('attachment-confirm-banner-cancel'))

    await waitFor(() => {
      expect(screen.queryByTestId('attachment-confirm-panel')).toBeNull()
      expect(screen.queryByTestId('attachment-confirm-collapsed-banner')).toBeNull()
      expect(screen.getByTestId('composer-draft')).not.toBeDisabled()
      expect(screen.getByTestId('composer-send')).toBeEnabled()
    })
    expect(invoke.mock.calls.some((call) => call[0] === 'branch.beginTurn')).toBe(false)
  })

  it('defers draft persistence while attachment confirmation is active and flushes after cancel', async () => {
    vi.useFakeTimers()
    try {
      draftResponse = {
        ...baseDraft(),
        attachments: [makeDraftAttachment('asset-draft-excluded', { attachmentOrder: 0 })],
        attachedAssetIds: ['asset-draft-excluded'],
      }

      render(AppChatApp)

      await waitFor(() => {
        expect(screen.getByTestId('composer-send')).toBeEnabled()
      })

      fireEvent.input(screen.getByTestId('composer-draft'), { target: { value: 'draft body updated' } })
      fireEvent.click(screen.getByTestId('composer-send'))

      await screen.findByTestId('attachment-confirm-panel')
      await vi.advanceTimersByTimeAsync(300)

      const updateCallsWhileActive = invoke.mock.calls.filter((call) => call[0] === 'conversationDraft.updateText')
      expect(updateCallsWhileActive).toHaveLength(0)

      fireEvent.click(screen.getByTestId('attachment-confirm-cancel'))

      await waitFor(() => {
        expect(screen.queryByTestId('attachment-confirm-panel')).toBeNull()
      })
      await waitFor(() => {
        expect(invoke.mock.calls.filter((call) => call[0] === 'conversationDraft.updateText')).toHaveLength(1)
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps current attachment remove decisions staged until confirmation is accepted', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-draft-excluded', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-draft-excluded'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeEnabled()
    })

    await user.click(screen.getByTestId('composer-send'))
    await screen.findByTestId('attachment-confirm-panel')

    const removeCallsBefore = invoke.mock.calls.filter((call) => call[0] === 'conversationDraft.removeAttachment').length
    await user.click(screen.getByTestId('attachment-confirm-current-remove-draft-attachment-asset-draft-excluded'))
    expect(invoke.mock.calls.filter((call) => call[0] === 'conversationDraft.removeAttachment')).toHaveLength(removeCallsBefore)

    await user.click(screen.getByTestId('attachment-confirm-confirm'))
    await waitFor(() => {
      expect(invoke.mock.calls.filter((call) => call[0] === 'conversationDraft.removeAttachment').length).toBeGreaterThan(removeCallsBefore)
    })
  })

  it('recomputes send plan before send and blocks stale plans', async () => {
    const user = userEvent.setup()
    forceBlockedOnSecondSendPlanBuild = true
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeEnabled()
    })

    const initialSendPlanCalls = sendPlanBuildCallCount
    await user.click(screen.getByTestId('composer-send'))

    await waitFor(() => {
      expect(sendPlanBuildCallCount).toBeGreaterThan(initialSendPlanCalls)
      expect(invoke.mock.calls.some((call) => call[0] === 'branch.beginTurn')).toBe(false)
      expect(screen.getByTestId('attachment-confirm-panel')).toBeTruthy()
    })
  })

  it('marks draft text changes by triggering send plan refresh', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(sendPlanBuildCallCount).toBeGreaterThan(0)
    })
    const callsBeforeTyping = sendPlanBuildCallCount
    const draftBox = screen.getByTestId('composer-draft')
    await user.type(draftBox, ' updated')

    await waitFor(() => {
      expect(sendPlanBuildCallCount).toBeGreaterThan(callsBeforeTyping)
    })
  })

  it('triggers send plan refresh when model changes', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(sendPlanBuildCallCount).toBeGreaterThan(0)
    })
    const callsBeforeModelSwitch = sendPlanBuildCallCount

    await user.click(await screen.findByTestId('current-model-pill'))
    await user.click(await screen.findByTestId('model-picker-item-openai/gpt-4o'))

    await waitFor(() => {
      expect(sendPlanBuildCallCount).toBeGreaterThan(callsBeforeModelSwitch)
    })
  })

  it('shows history incompatible warning above composer when current model excludes history attachments', async () => {
    contextMessages = [makeContextMessage('m-history-1', 1, 'user')]
    historyIncompatibleMessageIds = ['m-history-1']
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await waitFor(() => {
      const warning = screen.getByTestId('composer-history-incompatible-warning')
      expect(warning.textContent).toContain('1 个历史附件不会纳入当前模型上下文')
    }, { timeout: 5000 })
  })

  it('does not show history incompatible warning when there are no excluded history attachments', async () => {
    contextMessages = [makeContextMessage('m-normal-1', 1, 'user')]
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.queryByTestId('composer-history-incompatible-warning')).toBeNull()
    })
  })

  it('navigates incompatible history targets with cyclic < and > controls', async () => {
    const user = userEvent.setup()
    contextMessages = [
      makeContextMessage('m-history-1', 1, 'user'),
      makeContextMessage('m-history-2', 2, 'assistant'),
    ]
    historyIncompatibleMessageIds = ['m-history-1', 'm-history-2']
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    const firstMessage = await screen.findByTestId('msg-wrap-m-history-1')
    const secondMessage = await screen.findByTestId('msg-wrap-m-history-2')
    const firstScroll = vi.fn()
    const secondScroll = vi.fn()
    ;(firstMessage as any).scrollIntoView = firstScroll
    ;(secondMessage as any).scrollIntoView = secondScroll

    await user.click(await screen.findByTestId('composer-history-incompatible-review'))
    await waitFor(() => {
      expect(screen.getByTestId('composer-history-incompatible-index').textContent).toContain('1/2')
      expect(firstScroll).toHaveBeenCalled()
    })

    await user.click(screen.getByTestId('composer-history-incompatible-prev'))
    await waitFor(() => {
      expect(screen.getByTestId('composer-history-incompatible-index').textContent).toContain('2/2')
      expect(secondScroll).toHaveBeenCalled()
    })

    await user.click(screen.getByTestId('composer-history-incompatible-next'))
    await waitFor(() => {
      expect(screen.getByTestId('composer-history-incompatible-index').textContent).toContain('1/2')
      expect(firstScroll.mock.calls.length).toBeGreaterThan(1)
    })
  })

  it('recomputes and clears history incompatible warning when switching conversations', async () => {
    const user = userEvent.setup()
    convoRows = [
      { id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 2, meta: { selectedModelKey: 'openai/gpt-4o' } },
      { id: 'c2', title: 'Chat 2', createdAt: 1, updatedAt: 2, meta: { selectedModelKey: 'openai/gpt-4o' } },
    ]
    contextMessages = [makeContextMessage('m-history-1', 1, 'user')]
    historyIncompatibleMessageIds = ['m-history-1']
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await screen.findByTestId('composer-history-incompatible-warning')
    contextMessages = []
    const convoRow = screen.getByTestId('convo-row-c2')
    const convoSelectButton = convoRow.querySelector('button')
    expect(convoSelectButton).toBeTruthy()
    await user.click(convoSelectButton as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.queryByTestId('composer-history-incompatible-warning')).toBeNull()
    }, { timeout: 5000 })
  })

  it('recomputes history incompatible summary when model changes', async () => {
    const user = userEvent.setup()
    contextMessages = [makeContextMessage('m-history-1', 1, 'user')]
    historyIncompatibleMessageIds = ['m-history-1']
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await screen.findByTestId('composer-history-incompatible-warning')
    const callsBeforeModelSwitch = sendPlanBuildCallCount

    await user.click(await screen.findByTestId('current-model-pill'))
    await user.click(await screen.findByTestId('model-picker-item-openai/gpt-4o'))

    await waitFor(() => {
      expect(sendPlanBuildCallCount).toBeGreaterThan(callsBeforeModelSwitch)
      expect(screen.getByTestId('composer-history-incompatible-warning').textContent).toContain('1 个历史附件')
    })
  })

  it('sanitizes warning and blocking summaries to avoid path/base64 leaks', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [
        makeDraftAttachment('asset-warning-leak', { attachmentOrder: 0 }),
      ],
      attachedAssetIds: ['asset-warning-leak'],
    }

    const first = render(AppChatApp)

    await waitFor(() => {
      const warning = screen.getByTestId('composer-send-gate-warning').textContent ?? ''
      expect(warning).toMatch(/检测到附件内容风险|发送前需要确认处理方式/)
      expect(warning).not.toContain('C:/sensitive/local/path')
      expect(warning.toLowerCase()).not.toContain('base64')
    })

    first.unmount()

    draftResponse = {
      ...baseDraft(),
      attachments: [
        makeDraftAttachment('asset-blocked-leak', { attachmentOrder: 0, preferredSendMode: 'url_ref' }),
      ],
      attachedAssetIds: ['asset-blocked-leak'],
    }

    render(AppChatApp)

    await waitFor(() => {
      const warning = screen.getByTestId('composer-send-gate-warning').textContent ?? ''
      expect(warning).toMatch(/检测到附件内容风险|发送前需要确认处理方式/)
      expect(warning).not.toContain('C:/sensitive/local/path')
      expect(warning.toLowerCase()).not.toContain('base64')
    })
  })

  it('removes a draft attachment without deleting the underlying asset', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await screen.findByTestId('draft-attachment-strip')
    await user.click(screen.getByTestId('draft-attachment-remove-asset-text'))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('conversationDraft.removeAttachment', expect.objectContaining({
        conversationId: 'c1',
        assetId: 'asset-text',
      }))
    })
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('fileAsset.softDelete')
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('fileAsset.planPhysicalCleanup')
    await waitFor(() => {
      expect(screen.queryByTestId('draft-attachment-strip')).toBeNull()
    })
  })

  it('restores send gate after removing a blocking attachment', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [
        makeDraftAttachment('asset-link-missing-url', {
          attachmentOrder: 0,
          preferredSendMode: 'url_ref',
          urlRetentionMode: 'link_only',
        }),
      ],
      attachedAssetIds: ['asset-link-missing-url'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeDisabled()
    })
    await user.click(await screen.findByTestId('draft-attachment-remove-asset-link-missing-url'))
    await waitFor(() => {
      expect(screen.getByTestId('composer-send')).toBeEnabled()
    })
  })

  it('does not pass preview payloads into send plan computation', async () => {
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-image-missing', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-image-missing'],
    }

    render(AppChatApp)

    await waitFor(() => {
      expect(invoke.mock.calls.some((call) => call[0] === 'sendPlan.buildCurrent')).toBe(true)
    })
    const sendPlanCalls = invoke.mock.calls.filter((call) => call[0] === 'sendPlan.buildCurrent')
    expect(sendPlanCalls.length).toBeGreaterThan(0)
    for (const call of sendPlanCalls) {
      expect(call?.[1]).not.toHaveProperty('previewDataUrl')
      expect(call?.[1]).not.toHaveProperty('dataUrl')
      expect(call?.[1]).not.toHaveProperty('messages')
      expect(call?.[1]).not.toHaveProperty('currentUserContentBlocks')
      expect(call?.[1]).not.toHaveProperty('openRouterAdditionalPlugins')
    }
  })

  it('disables image upload and rejects pasted image files for a text-only model', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await user.click(await screen.findByTestId('current-model-pill'))
    await user.click(await screen.findByTestId('model-picker-item-openai/gpt-4o'))

    await user.click(await screen.findByTestId('composer-attach-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('composer-attach-image')).toBeDisabled()
    })

    const imageFile = new File(['image-bytes'], 'photo.png', { type: 'image/png' })
    Object.defineProperty(imageFile, 'path', { value: 'C:/tmp/photo.png' })
    const draft = screen.getByTestId('composer-draft')

    await fireEvent.drop(draft, { dataTransfer: { files: [imageFile] } } as any)
    await fireEvent.paste(draft, {
      clipboardData: {
        files: [imageFile],
        getData: vi.fn(() => ''),
      },
    } as any)

    await waitFor(() => {
      expect(screen.getAllByTestId('composer-attachment-feedback').at(-1)?.textContent).toContain('Current model does not support image inputs.')
    })
    expect(
      invoke.mock.calls.some(
        (call) => call[0] === 'fileIngestion.ingestLocalFile' && String((call[1] as any)?.filePath ?? '').includes('photo.png'),
      ),
    ).toBe(false)
  })

  it('opens the draft attachment details dialog and shows URL metadata', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-link-only', { attachmentOrder: 0, preferredSendMode: 'default', urlRetentionMode: 'link_only' })],
      attachedAssetIds: ['asset-link-only'],
    }

    render(AppChatApp)

    await user.click(await screen.findByTestId('draft-attachment-card-asset-link-only'))
    await screen.findByTestId('draft-attachment-details-dialog')

    expect(screen.getAllByText('https://example.com/file.pdf').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('draft-attachment-url-retention-link_only')).toBeTruthy()
    expect(screen.getByTestId('draft-attachment-send-mode-inline_base64')).toBeTruthy()
  })

  it('shows all URL retention mode options in attachment details', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-link-only', { attachmentOrder: 0, preferredSendMode: 'default', urlRetentionMode: 'link_only' })],
      attachedAssetIds: ['asset-link-only'],
    }

    render(AppChatApp)

    await user.click(await screen.findByTestId('draft-attachment-card-asset-link-only'))
    await screen.findByTestId('draft-attachment-details-dialog')

    expect(screen.getByTestId('draft-attachment-url-retention-default')).toBeTruthy()
    expect(screen.getByTestId('draft-attachment-url-retention-link_only')).toBeTruthy()
    expect(screen.getByTestId('draft-attachment-url-retention-link_and_file')).toBeTruthy()
  })

  it('updates attachment settings from the details dialog without triggering URL ingestion', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-link-only', { attachmentOrder: 0, preferredSendMode: 'default', urlRetentionMode: 'link_only' })],
      attachedAssetIds: ['asset-link-only'],
    }

    render(AppChatApp)

    await user.click(await screen.findByTestId('draft-attachment-card-asset-link-only'))
    await screen.findByTestId('draft-attachment-details-dialog')
    await user.click(screen.getByTestId('draft-attachment-send-mode-auto'))
    await user.click(screen.getByTestId('draft-attachment-url-retention-link_and_file'))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('conversationDraft.updateAttachmentSettings', expect.objectContaining({
        conversationId: 'c1',
        assetId: 'asset-link-only',
        preferredSendMode: 'auto',
      }))
      expect(invoke).toHaveBeenCalledWith('conversationDraft.updateAttachmentSettings', expect.objectContaining({
        conversationId: 'c1',
        assetId: 'asset-link-only',
        urlRetentionMode: 'link_and_file',
      }))
    })
    expect(invoke.mock.calls.some((call) => call[0] === 'fileIngestion.ingestUrl' && String((call[1] as any)?.retentionMode ?? '') === 'link_and_file')).toBe(false)
    const sendPlanCalls = invoke.mock.calls.filter((call) => call[0] === 'sendPlan.buildCurrent')
    expect(sendPlanCalls.length).toBeGreaterThan(1)
  })

  it('loads backend DFC options and updates the selected option from attachment details', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-dfc', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-dfc'],
    }

    render(AppChatApp)

    await user.click(await screen.findByTestId('draft-attachment-card-asset-dfc'))
    await screen.findByTestId('draft-attachment-details-dialog')
    await screen.findByTestId('draft-attachment-dfc-option-markdown')

    expect(invoke).toHaveBeenCalledWith('conversationDraft.getDfcOptions', {
      conversationId: 'c1',
      assetId: 'asset-dfc',
    })

    await user.click(screen.getByTestId('draft-attachment-dfc-option-markdown'))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('conversationDraft.updateAttachmentSettings', expect.objectContaining({
        conversationId: 'c1',
        assetId: 'asset-dfc',
        dfcManaged: true,
        selectedOptionId: 'dfc:asset-dfc:markdown:derived_asset:derivative-markdown',
        selectedAssetRefs: [{ kind: 'derived_asset', assetId: 'derivative-markdown' }],
      }))
    })
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('conversationDraft.getDfcPreview', {
        conversationId: 'c1',
        assetId: 'asset-dfc',
        maxCharacters: 2048,
      })
    })
    expect(await screen.findByTestId('draft-attachment-dfc-preview-text')).toHaveTextContent('Markdown preview from selected option')
  })

  it('keeps URL retention hidden for non-URL attachments and disables audio link sending', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [
        makeDraftAttachment('asset-text', { attachmentOrder: 0 }),
        makeDraftAttachment('asset-audio', { attachmentOrder: 1 }),
      ],
      attachedAssetIds: ['asset-text', 'asset-audio'],
    }

    render(AppChatApp)

    await user.click(await screen.findByTestId('draft-attachment-card-asset-text'))
    await screen.findByTestId('draft-attachment-details-dialog')
    expect(screen.queryByTestId('draft-attachment-url-retention-link_only')).toBeNull()

    await user.click(screen.getByTestId('draft-attachment-details-close'))
    await user.click(await screen.findByTestId('draft-attachment-card-asset-audio'))
    await screen.findByTestId('draft-attachment-details-dialog')
    expect(screen.getByTestId('draft-attachment-send-mode-url_ref')).toBeDisabled()
  })

  it('retries image preview only when the preview is missing or failed', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-image-failed', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-image-failed'],
    }

    render(AppChatApp)

    await user.click(await screen.findByTestId('draft-attachment-card-asset-image-failed'))
    await screen.findByTestId('draft-attachment-details-dialog')
    expect(screen.getByTestId('draft-attachment-details-retry')).toBeEnabled()
    await user.click(screen.getByTestId('draft-attachment-details-retry'))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('preview.ensure', expect.objectContaining({ assetId: 'asset-image-failed' }))
    })
  })

  it('removes attachments from the details dialog without deleting the asset', async () => {
    const user = userEvent.setup()
    draftResponse = {
      ...baseDraft(),
      attachments: [makeDraftAttachment('asset-text', { attachmentOrder: 0 })],
      attachedAssetIds: ['asset-text'],
    }

    render(AppChatApp)

    await user.click(await screen.findByTestId('draft-attachment-card-asset-text'))
    await screen.findByTestId('draft-attachment-details-dialog')
    await user.click(screen.getByTestId('draft-attachment-details-remove'))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('conversationDraft.removeAttachment', expect.objectContaining({
        conversationId: 'c1',
        assetId: 'asset-text',
      }))
    })
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('fileAsset.softDelete')
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('fileAsset.planPhysicalCleanup')
  })
})
