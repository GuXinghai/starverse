/* eslint-disable max-lines-per-function */
import { afterEach, describe, expect, it } from 'vitest'
import {
  decodeAppendReasoningDetailSegmentsResponse,
  decodeBranchBeginTurnResponse,
  decodeBranchForkQuestionResponse,
  decodeBranchRegenerateFromQuestionResponse,
  decodeBranchRetryReplaceQuestionResponse,
  decodeBranchSetHeadResponse,
  decodeBranchSwitchCandidateResponse,
  decodeBranchSwitchQuestionCandidateResponse,
  decodeBranchTruncateFromQuestionResponse,
  decodeChatDraftResponse,
  decodeChatReasoningDisplayModeResponse,
  decodeConvoCreateResponse,
  decodeConvoDeleteManyResponse,
  decodeConvoListResponse,
  decodeConvoSetProjectManyResponse,
  decodeDeletedCountResponse,
  decodeFileAssetListResponse,
  decodeFileAssetPhysicalCleanupPlanResponse,
  decodeFileAssetResponse,
  decodeFileAssetSoftDeleteResponse,
  decodeFileDerivativeListResponse,
  decodeFileDerivativeResponse,
  decodeFileIngestionResultResponse,
  decodeAssetAttachmentOwnershipResponse,
  decodeAttachmentCandidateSnapshotResponse,
  decodeAttachDraftToMessageResponse,
  decodeCommitDraftToUserMessageResponse,
  decodeConversationDraftResponse,
  decodeDetachMessageAttachmentResponse,
  decodeDraftAttachmentResponse,
  decodeUpdateDraftAttachmentSettingsResponse,
  decodeMessageAssetListResponse,
  decodeMessageAssetPersistResponse,
  decodeMessageAttachmentListResponse,
  decodeMessageAttachmentResponse,
  decodeRemoveDraftAttachmentResponse,
  decodeMessageAppendResponse,
  decodeMessageFinalizeReasoningDetailsResponse,
  decodeMessageListResponse,
  decodeMessageSetStatusResponse,
  decodePreviewPayloadResponse,
  decodeBuildCurrentSendPlanResponse,
  decodeOpenRouterProviderRequireParametersResponse,
  decodeSamplingParamsDefaultsResponse,
  decodeImageGenerationDefaultResponse,
  decodeWebSearchDefaultsResponse,
  decodeUserMessageRenderDefaultResponse,
  decodeProjectCountConversationsBatchResponse,
  decodeProjectCountConversationsResponse,
  decodeProjectCreateResponse,
  decodeProjectFindByIdResponse,
  decodeProjectGetInboxResponse,
  decodeProjectListResponse,
  decodeSearchQueryResponse,
} from './dbBridgeContracts'
import { IpcContractDecodeError } from './decodeError'
import { switchQuestionCandidate, truncateBranchFromQuestion } from '@/next/branch/branchClient'
import { listMessages, setMessageStatus } from '@/next/message/messageClient'

function expectProtocolInvalidError(error: unknown): void {
  expect(error).toBeInstanceOf(IpcContractDecodeError)
  const e = error as IpcContractDecodeError
  expect(e.appError.phase).toBe('local_protocol_error')
  expect(e.appError.category).toBe('protocol_invalid')
  expect(e.appError.grade).toBe(3)
}

type ContractCase = Readonly<{
  name: string
  decode: (raw: unknown) => unknown
  valid: unknown
  missing: unknown
  wrongType: unknown
}>

const cases: ContractCase[] = [
  {
    name: 'project.list',
    decode: decodeProjectListResponse,
    valid: [{ id: 'p1', name: 'Inbox', createdAt: 1, updatedAt: 2, meta: null }],
    missing: [{ id: 'p1', createdAt: 1 }],
    wrongType: [{ id: 'p1', name: 'Inbox', createdAt: '1' }],
  },
  {
    name: 'project.create',
    decode: decodeProjectCreateResponse,
    valid: { id: 'p1', name: 'Inbox', createdAt: 1, updatedAt: 2, alreadyExists: false, isSystemProject: true },
    missing: { id: 'p1', createdAt: 1 },
    wrongType: { id: 'p1', name: 'Inbox', createdAt: '1' },
  },
  {
    name: 'project.findById',
    decode: decodeProjectFindByIdResponse,
    valid: { id: 'p1', name: 'Inbox', createdAt: 1, updatedAt: 2, meta: null },
    missing: { id: 'p1', createdAt: 1 },
    wrongType: { id: 'p1', name: 'Inbox', createdAt: '1' },
  },
  {
    name: 'project.getInbox',
    decode: decodeProjectGetInboxResponse,
    valid: { id: 'p1', name: 'Inbox', createdAt: 1, updatedAt: 2, meta: null },
    missing: { id: 'p1', createdAt: 1 },
    wrongType: { id: 'p1', name: 'Inbox', createdAt: '1' },
  },
  {
    name: 'project.countConversations',
    decode: decodeProjectCountConversationsResponse,
    valid: { count: 7 },
    missing: {},
    wrongType: { count: '7' },
  },
  {
    name: 'project.countConversationsBatch',
    decode: decodeProjectCountConversationsBatchResponse,
    valid: { counts: { p1: 2, p2: 0 } },
    missing: {},
    wrongType: { counts: { p1: '2' } },
  },
  {
    name: 'convo.list',
    decode: decodeConvoListResponse,
    valid: [{ id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 2, projectId: null }],
    missing: [{ id: 'c1', createdAt: 1 }],
    wrongType: [{ id: 'c1', title: 'Chat 1', createdAt: '1' }],
  },
  {
    name: 'convo.create',
    decode: decodeConvoCreateResponse,
    valid: { id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 2, projectId: null },
    missing: { id: 'c1', createdAt: 1 },
    wrongType: { id: 'c1', title: 'Chat 1', createdAt: '1' },
  },
  {
    name: 'convo.setProjectMany',
    decode: decodeConvoSetProjectManyResponse,
    valid: { moved: 3, failed: ['c4'] },
    missing: { moved: 3 },
    wrongType: { moved: '3', failed: [] },
  },
  {
    name: 'convo.deleteMany',
    decode: decodeConvoDeleteManyResponse,
    valid: { deleted: 4 },
    missing: {},
    wrongType: { deleted: '4' },
  },
  {
    name: 'message.list',
    decode: decodeMessageListResponse,
    valid: [{ id: 'm1', convoId: 'c1', role: 'assistant', seq: 1, createdAt: 1, body: 'hi', meta: null }],
    missing: [{ convoId: 'c1', role: 'assistant', seq: 1 }],
    wrongType: [{ id: 'm1', convoId: 'c1', role: 'assistant', seq: '1', createdAt: 1, body: 'hi' }],
  },
  {
    name: 'message.append',
    decode: decodeMessageAppendResponse,
    valid: { id: 'm1', convoId: 'c1', role: 'assistant', seq: 1, createdAt: 1, body: 'hi', meta: null },
    missing: { convoId: 'c1', role: 'assistant', seq: 1 },
    wrongType: { id: 'm1', convoId: 'c1', role: 'assistant', seq: '1', createdAt: 1, body: 'hi' },
  },
  {
    name: 'messageAsset.persistFromDataUrls',
    decode: decodeMessageAssetPersistResponse,
    valid: {
      ok: true,
      assets: [
        {
          messageId: 'm1',
          assetId: 'a1',
          ordinal: 0,
          mime: 'image/png',
          width: 1,
          height: 1,
          assetUrl: 'asset://a1',
        },
      ],
    },
    missing: { ok: true, assets: [{ messageId: 'm1', assetId: 'a1' }] },
    wrongType: { ok: true, assets: [{ messageId: 'm1', assetId: 'a1', ordinal: '0' }] },
  },
  {
    name: 'messageAsset.listByMessageIds',
    decode: decodeMessageAssetListResponse,
    valid: [
      {
        messageId: 'm1',
        assetId: 'a1',
        ordinal: 0,
        mime: 'image/png',
        width: 1,
        height: 1,
        assetUrl: 'asset://a1',
      },
    ],
    missing: [{ messageId: 'm1', assetId: 'a1' }],
    wrongType: [{ messageId: 'm1', assetId: 'a1', ordinal: '0' }],
  },
  {
    name: 'fileAsset.create',
    decode: decodeFileAssetResponse,
    valid: {
      id: 'asset-1',
      sha256: 'sha',
      filename: 'report.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 12,
      assetKind: 'document',
      sourceKind: 'local_upload',
      storageBackend: 'local_fs',
      storageUri: 'assets/original/as/asset-1.pdf',
      ingestStatus: 'stored',
      previewStatus: 'not_requested',
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    },
    missing: { id: 'asset-1', sha256: 'sha' },
    wrongType: { id: 'asset-1', sha256: 'sha', filename: 'report.pdf', sizeBytes: '12' },
  },
  {
    name: 'fileAsset.listByIds',
    decode: decodeFileAssetListResponse,
    valid: [
      {
        id: 'asset-1',
        sha256: 'sha',
        filename: 'report.pdf',
        extension: 'pdf',
        mime: 'application/pdf',
        sizeBytes: 12,
        assetKind: 'document',
        sourceKind: 'local_upload',
        storageBackend: 'local_fs',
        storageUri: 'assets/original/as/asset-1.pdf',
        ingestStatus: 'stored',
        previewStatus: 'not_requested',
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ],
    missing: [{ id: 'asset-1', sha256: 'sha' }],
    wrongType: [{ id: 'asset-1', sha256: 'sha', filename: 'report.pdf', sizeBytes: '12' }],
  },
  {
    name: 'fileAsset.softDelete',
    decode: decodeFileAssetSoftDeleteResponse,
    valid: { ok: true, softDeleted: true, physicalCleanupRequired: true },
    missing: { ok: true, softDeleted: true },
    wrongType: { ok: true, softDeleted: 'true', physicalCleanupRequired: true },
  },
  {
    name: 'fileAsset.planPhysicalCleanup',
    decode: decodeFileAssetPhysicalCleanupPlanResponse,
    valid: {
      ok: true,
      assetId: 'asset-1',
      storageUris: ['assets/original/as/asset-1.pdf'],
      physicalDeletePerformed: false,
    },
    missing: { ok: true, assetId: 'asset-1' },
    wrongType: { ok: true, assetId: 'asset-1', storageUris: [7], physicalDeletePerformed: false },
  },
  {
    name: 'fileDerivative.create',
    decode: decodeFileDerivativeResponse,
    valid: {
      id: 'derivative-1',
      parentAssetId: 'asset-1',
      derivedKind: 'thumbnail',
      mime: 'image/png',
      storageUri: 'assets/derived/asset-1/derivative-1.png',
      generator: 'test',
      status: 'ready',
      metaJson: { width: 64 },
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    },
    missing: { id: 'derivative-1', parentAssetId: 'asset-1' },
    wrongType: { id: 'derivative-1', parentAssetId: 'asset-1', createdAt: '1' },
  },
  {
    name: 'fileDerivative.listByParentAssetId',
    decode: decodeFileDerivativeListResponse,
    valid: [
      {
        id: 'derivative-1',
        parentAssetId: 'asset-1',
        derivedKind: 'thumbnail',
        mime: 'image/png',
        storageUri: 'assets/derived/asset-1/derivative-1.png',
        generator: 'test',
        status: 'ready',
        metaJson: { width: 64 },
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ],
    missing: [{ id: 'derivative-1', parentAssetId: 'asset-1' }],
    wrongType: [{ id: 'derivative-1', parentAssetId: 'asset-1', createdAt: '1' }],
  },
  {
    name: 'messageAttachment.create',
    decode: decodeMessageAttachmentResponse,
    valid: {
      id: 'attachment-1',
      messageId: 'm1',
      assetId: 'asset-1',
      aiPayloadKind: 'pdf',
      processingStatus: 'native_supported',
      includeInNextRequest: true,
      excludedReason: null,
      createdAt: 1,
      updatedAt: 1,
    },
    missing: { id: 'attachment-1', messageId: 'm1' },
    wrongType: { id: 'attachment-1', messageId: 'm1', includeInNextRequest: 'true' },
  },
  {
    name: 'messageAttachment.listByMessageId',
    decode: decodeMessageAttachmentListResponse,
    valid: [
      {
        id: 'attachment-1',
        messageId: 'm1',
        assetId: 'asset-1',
        aiPayloadKind: 'pdf',
        processingStatus: 'native_supported',
        includeInNextRequest: true,
        excludedReason: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    missing: [{ id: 'attachment-1', messageId: 'm1' }],
    wrongType: [{ id: 'attachment-1', messageId: 'm1', includeInNextRequest: 'true' }],
  },
  {
    name: 'conversationDraft.restore',
    decode: decodeConversationDraftResponse,
    valid: {
      conversationId: 'c1',
      draftText: 'hello',
      draftMode: 'compose',
      editingSourceMessageId: null,
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
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      updatedAt: 1,
    },
    missing: { conversationId: 'c1', draftText: 'hello' },
    wrongType: { conversationId: 'c1', draftText: 'hello', draftMode: 'compose', attachedAssetIds: 'asset-1' },
  },
  {
    name: 'conversationDraft.addAttachment',
    decode: decodeDraftAttachmentResponse,
    valid: {
      id: 'draft-attachment-1',
      conversationId: 'c1',
      assetId: 'asset-1',
      attachmentOrder: 0,
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
      includeInNextRequest: true,
      excludedReason: null,
      createdAt: 1,
      updatedAt: 1,
    },
    missing: { id: 'draft-attachment-1', conversationId: 'c1' },
    wrongType: { id: 'draft-attachment-1', conversationId: 'c1', attachmentOrder: '0' },
  },
  {
    name: 'conversationDraft.removeAttachment',
    decode: decodeRemoveDraftAttachmentResponse,
    valid: {
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
    },
    missing: { ok: true, removed: true },
    wrongType: { ok: true, removed: 'true', ownership: {} },
  },
  {
    name: 'conversationDraft.attachToMessage',
    decode: decodeAttachDraftToMessageResponse,
    valid: {
      messageId: 'm1',
      attachments: [
        {
          id: 'attachment-1',
          messageId: 'm1',
          assetId: 'asset-1',
          aiPayloadKind: 'text',
          processingStatus: 'native_supported',
          includeInNextRequest: true,
          excludedReason: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      draft: {
        conversationId: 'c1',
        draftText: '',
        draftMode: 'compose',
        editingSourceMessageId: null,
        attachedAssetIds: [],
        attachments: [],
        updatedAt: 2,
      },
    },
    missing: { attachments: [], draft: {} },
    wrongType: { messageId: 'm1', attachments: 'bad', draft: {} },
  },
  {
    name: 'conversationDraft.commitToUserMessage',
    decode: decodeCommitDraftToUserMessageResponse,
    valid: {
      message: { id: 'm1', convoId: 'c1', role: 'user', seq: 1, createdAt: 1, body: 'hello', meta: null },
      attachments: [
        {
          id: 'attachment-1',
          messageId: 'm1',
          assetId: 'asset-1',
          aiPayloadKind: 'text',
          processingStatus: 'native_supported',
          includeInNextRequest: true,
          excludedReason: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      draft: {
        conversationId: 'c1',
        draftText: '',
        draftMode: 'compose',
        editingSourceMessageId: null,
        attachedAssetIds: [],
        attachments: [],
        updatedAt: 2,
      },
    },
    missing: { attachments: [], draft: {} },
    wrongType: { message: { id: 'm1' }, attachments: 'bad', draft: {} },
  },
  {
    name: 'messageAttachment.detach',
    decode: decodeDetachMessageAttachmentResponse,
    valid: {
      ok: true,
      detached: true,
      ownership: {
        assetId: 'asset-1',
        ownerKind: 'detached',
        lifecycleStatus: 'detached',
        draftConversationIds: [],
        messageIds: [],
        reason: null,
        updatedAt: 1,
      },
    },
    missing: { ok: true, detached: true },
    wrongType: { ok: true, detached: 'true', ownership: {} },
  },
  {
    name: 'messageAttachment.getAssetOwnership',
    decode: decodeAssetAttachmentOwnershipResponse,
    valid: {
      assetId: 'asset-1',
      ownerKind: 'message',
      lifecycleStatus: 'active',
      draftConversationIds: [],
      messageIds: ['m1'],
      reason: null,
      updatedAt: null,
    },
    missing: { assetId: 'asset-1' },
    wrongType: { assetId: 'asset-1', messageIds: 'm1' },
  },
  {
    name: 'messageAttachment.getCandidateSnapshot',
    decode: decodeAttachmentCandidateSnapshotResponse,
    valid: {
      scope: 'messages',
      messageIds: ['m1'],
      included: [
        {
          attachmentId: 'attachment-1',
          messageId: 'm1',
          assetId: 'asset-1',
          aiPayloadKind: 'text',
          processingStatus: 'native_supported',
          included: true,
          excludedReason: null,
          sourceKind: 'local_upload',
          storageBackend: 'local_fs',
        },
      ],
      excluded: [],
      items: [
        {
          attachmentId: 'attachment-1',
          messageId: 'm1',
          assetId: 'asset-1',
          aiPayloadKind: 'text',
          processingStatus: 'native_supported',
          included: true,
          excludedReason: null,
          sourceKind: 'local_upload',
          storageBackend: 'local_fs',
        },
      ],
    },
    missing: { scope: 'messages', messageIds: ['m1'] },
    wrongType: { scope: 'messages', messageIds: ['m1'], included: 'bad', excluded: [], items: [] },
  },
  {
    name: 'fileIngestion.ingestLocalFile',
    decode: (raw) => decodeFileIngestionResultResponse('fileIngestion.ingestLocalFile', raw),
    valid: {
      success: true,
      sourceKind: 'local_upload',
      assetId: 'asset-1',
      normalizedExtension: 'png',
      assetKind: 'image',
      aiPayloadKind: 'image',
      processingStatus: 'native_supported',
      isNativeSupportedForMvp: true,
      isConvertibleCandidate: false,
      importStatus: 'ready',
      sendEligibilityHints: {
        canUseUrlRef: false,
        canUseLocalFile: true,
        canUseInlinePayload: true,
        urlReferenceMayStillBeUsable: false,
        notes: [],
      },
      warnings: [],
      failureReasonCode: null,
    },
    missing: { success: true, sourceKind: 'local_upload' },
    wrongType: { success: true, sourceKind: 'local_upload', sendEligibilityHints: { canUseUrlRef: 'no' } },
  },
  {
    name: 'preview.getLatestReady',
    decode: (raw) => decodePreviewPayloadResponse('preview.getLatestReady', raw),
    valid: {
      assetId: 'asset-1',
      status: 'ready',
      derivativeId: 'der-1',
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,AA==',
      width: 128,
      height: 128,
      bytes: 512,
      reused: false,
      errorCode: null,
      errorMessage: null,
    },
    missing: { assetId: 'asset-1', status: 'ready' },
    wrongType: { assetId: 'asset-1', status: 'ready', reused: 'false' },
  },
  {
    name: 'sendPlan.buildCurrent',
    decode: decodeBuildCurrentSendPlanResponse,
    valid: {
      sendPlan: {
        status: 'sendable',
        warnings: [],
        blockingReasons: [],
        includedAttachments: [],
        excludedAttachments: [],
        attachmentPlans: [
          {
            assetId: 'asset-1',
            attachmentId: 'draft-attachment-1',
            source: 'draft',
            messageId: null,
            aiPayloadKind: 'image',
            selectedSendMode: 'url_ref',
            fallbackSendModes: ['inline_base64'],
            eligibility: 'included',
            exclusionReason: null,
            displayStatus: 'ready',
            needsUserAttention: false,
            notes: [],
          },
        ],
        requiresModelChange: false,
        canProceedAfterDroppingExcluded: false,
        requiresUserConfirmation: false,
        plannerVersion: 'phase-5/v1',
      },
      draftText: 'hello',
      assets: [{
        id: 'asset-1',
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
      }],
      storageRootDir: 'C:/tmp',
    },
    missing: {
      sendPlan: {
        status: 'sendable',
        warnings: [],
        blockingReasons: [],
        includedAttachments: [],
        excludedAttachments: [],
        attachmentPlans: [],
        requiresModelChange: false,
        canProceedAfterDroppingExcluded: false,
        requiresUserConfirmation: false,
        plannerVersion: 'phase-5/v1',
      },
      draftText: 'hello',
      assets: [],
    },
    wrongType: {
      sendPlan: {
        status: 'sendable',
        warnings: [],
        blockingReasons: [],
        includedAttachments: [],
        excludedAttachments: [],
        attachmentPlans: [],
        requiresModelChange: false,
        canProceedAfterDroppingExcluded: false,
        requiresUserConfirmation: false,
        plannerVersion: 'phase-5/v1',
      },
      draftText: 123,
      assets: [],
      storageRootDir: 'C:/tmp',
    },
  },
  {
    name: 'message.appendReasoningDetailSegments',
    decode: decodeAppendReasoningDetailSegmentsResponse,
    valid: { ok: true, received: 2, inserted: 2, skipped: 0, ignored: 0, sumDeltaLenInserted: 42 },
    missing: { ok: true, received: 2, inserted: 2, skipped: 0, ignored: 0 },
    wrongType: { ok: true, received: '2', inserted: 2, skipped: 0, ignored: 0, sumDeltaLenInserted: 42 },
  },
  {
    name: 'message.setStatus',
    decode: decodeMessageSetStatusResponse,
    valid: { ok: true },
    missing: {},
    wrongType: { ok: 'true' },
  },
  {
    name: 'message.finalizeReasoningDetails',
    decode: decodeMessageFinalizeReasoningDetailsResponse,
    valid: { ok: true },
    missing: {},
    wrongType: { ok: 'true' },
  },
  {
    name: 'branch.beginTurn',
    decode: decodeBranchBeginTurnResponse,
    valid: { ok: true, convoId: 'c1', questionId: 'u1', questionSeq: 1, assistantId: 'a1', assistantSeq: 2 },
    missing: { ok: true, convoId: 'c1', questionSeq: 1, assistantId: 'a1', assistantSeq: 2 },
    wrongType: { ok: true, convoId: 'c1', questionId: 'u1', questionSeq: '1', assistantId: 'a1', assistantSeq: 2 },
  },
  {
    name: 'branch.switchCandidate',
    decode: decodeBranchSwitchCandidateResponse,
    valid: { headMessageId: 'a1' },
    missing: {},
    wrongType: { headMessageId: 123 },
  },
  {
    name: 'branch.switchQuestionCandidate',
    decode: decodeBranchSwitchQuestionCandidateResponse,
    valid: { ok: true, headMessageId: 'a1' },
    missing: { ok: true },
    wrongType: { ok: true, headMessageId: 123 },
  },
  {
    name: 'branch.regenerateFromQuestion',
    decode: decodeBranchRegenerateFromQuestionResponse,
    valid: { ok: true, newAnswerRootId: 'a2', newAssistantSeq: 3 },
    missing: { ok: true, newAssistantSeq: 3 },
    wrongType: { ok: true, newAnswerRootId: 'a2', newAssistantSeq: '3' },
  },
  {
    name: 'branch.forkQuestion',
    decode: decodeBranchForkQuestionResponse,
    valid: { ok: true, baseMessageId: null, newQuestionId: 'u2', newQuestionSeq: 4, assistantId: 'a2', assistantSeq: 5 },
    missing: { ok: true, baseMessageId: null, newQuestionSeq: 4, assistantId: 'a2', assistantSeq: 5 },
    wrongType: { ok: true, baseMessageId: null, newQuestionId: 'u2', newQuestionSeq: '4', assistantId: 'a2', assistantSeq: 5 },
  },
  {
    name: 'branch.retryReplaceQuestion',
    decode: decodeBranchRetryReplaceQuestionResponse,
    valid: { ok: true, baseMessageId: null, newQuestionId: 'u2', newQuestionSeq: 4, assistantId: 'a2', assistantSeq: 5 },
    missing: { ok: true, baseMessageId: null, newQuestionSeq: 4, assistantId: 'a2', assistantSeq: 5 },
    wrongType: { ok: true, baseMessageId: null, newQuestionId: 'u2', newQuestionSeq: '4', assistantId: 'a2', assistantSeq: 5 },
  },
  {
    name: 'branch.setHead',
    decode: decodeBranchSetHeadResponse,
    valid: { ok: true },
    missing: {},
    wrongType: { ok: 'true' },
  },
  {
    name: 'branch.truncateFromQuestion',
    decode: decodeBranchTruncateFromQuestionResponse,
    valid: { ok: true, headMessageId: 'a1', fallbackQuestionId: 'q2' },
    missing: { ok: true },
    wrongType: { ok: true, headMessageId: 123, fallbackQuestionId: null },
  },
  {
    name: 'search.query',
    decode: decodeSearchQueryResponse,
    valid: [{ entityType: 'message', entityId: 'm1', projectId: 'p1', convoId: 'c1', createdAtSec: 1, snippet: 'x', score: 0.2 }],
    missing: [{ entityType: 'message', projectId: 'p1', convoId: 'c1', createdAtSec: 1, snippet: 'x', score: 0.2 }],
    wrongType: [{ entityType: 'message', entityId: 'm1', projectId: 'p1', convoId: 'c1', createdAtSec: '1', snippet: 'x', score: 0.2 }],
  },
  {
    name: 'settings.getOpenRouterProviderRequireParameters',
    decode: decodeOpenRouterProviderRequireParametersResponse,
    valid: { value: true },
    missing: {},
    wrongType: { value: 'true' },
  },
  {
    name: 'settings.getImageGenerationDefault',
    decode: decodeImageGenerationDefaultResponse,
    valid: { value: { enabled: true, outputMode: 'image_only' } },
    missing: {},
    wrongType: [],
  },
  {
    name: 'settings.getWebSearchDefaults',
    decode: decodeWebSearchDefaultsResponse,
    valid: { value: { searchMode: 'enable' } },
    missing: {},
    wrongType: [],
  },
  {
    name: 'settings.getSamplingParamsDefaults',
    decode: decodeSamplingParamsDefaultsResponse,
    valid: { value: { temperature: { mode: 'custom', value: 0.8 } } },
    missing: {},
    wrongType: [],
  },
  {
    name: 'settings.getUserMessageRenderDefault',
    decode: decodeUserMessageRenderDefaultResponse,
    valid: { value: true },
    missing: {},
    wrongType: { value: 'true' },
  },
  {
    name: 'settings.getChatReasoningDisplayMode',
    decode: decodeChatReasoningDisplayModeResponse,
    valid: { value: 'rail' },
    missing: {},
    wrongType: { value: 'nope' },
  },
  {
    name: 'settings.getChatDraft',
    decode: decodeChatDraftResponse,
    valid: { value: 'draft text' },
    missing: {},
    wrongType: { value: 7 },
  },
  {
    name: 'settings.deleteChatDraft',
    decode: (raw: unknown) => decodeDeletedCountResponse('settings.deleteChatDraft', raw),
    valid: { deleted: 1 },
    missing: {},
    wrongType: { deleted: '1' },
  },
]

describe('db bridge contract decoders', () => {
  for (const c of cases) {
    it(`${c.name}: missing required field rejects with protocol_invalid`, () => {
      expect(() => c.decode(c.missing)).toThrowError(IpcContractDecodeError)
      try {
        c.decode(c.missing)
      } catch (error) {
        expectProtocolInvalidError(error)
      }
    })

    it(`${c.name}: wrong field type rejects with protocol_invalid`, () => {
      expect(() => c.decode(c.wrongType)).toThrowError(IpcContractDecodeError)
      try {
        c.decode(c.wrongType)
      } catch (error) {
        expectProtocolInvalidError(error)
      }
    })

    it(`${c.name}: unknown extra field is tolerated`, () => {
      const withExtra =
        Array.isArray(c.valid)
          ? c.valid.map((row) => ({ ...(row as Record<string, unknown>), __extra: 'ignore' }))
          : { ...(c.valid as Record<string, unknown>), __extra: 'ignore' }
      const decoded = c.decode(withExtra)
      if (Array.isArray(decoded)) {
        expect(decoded[0]).toBeDefined()
        if (decoded[0] && typeof decoded[0] === 'object') {
          expect(Object.prototype.hasOwnProperty.call(decoded[0], '__extra')).toBe(false)
        }
      } else if (decoded && typeof decoded === 'object') {
        expect(Object.prototype.hasOwnProperty.call(decoded, '__extra')).toBe(false)
      }
    })
  }
})

describe('draft attachment settings decoder', () => {
  it('decodes conversationDraft.updateAttachmentSettings responses', () => {
    const decoded = decodeUpdateDraftAttachmentSettingsResponse({
      id: 'draft-attachment-1',
      conversationId: 'c1',
      assetId: 'asset-1',
      attachmentOrder: 0,
      aiPayloadKind: 'text',
      processingStatus: 'native_supported',
      includeInNextRequest: true,
      excludedReason: null,
      preferredSendMode: 'url_ref',
      urlRetentionMode: 'link_only',
      createdAt: 1,
      updatedAt: 2,
    })

    expect(decoded.preferredSendMode).toBe('url_ref')
    expect(decoded.urlRetentionMode).toBe('link_only')
  })
})

describe('client decode integration', () => {
  const originalBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalBridge
  })

  it('messageClient.listMessages keeps signature and surfaces decode errors', async () => {
    ;(globalThis as any).dbBridge = {
      invoke: async () => [{ id: 'm1', convoId: 'c1', role: 'assistant', seq: 1, createdAt: 1, body: 'ok', meta: null }],
    }
    const ok = await listMessages('c1')
    expect(ok).toHaveLength(1)
    expect(ok[0].id).toBe('m1')

    ;(globalThis as any).dbBridge = {
      invoke: async () => [{ convoId: 'c1', role: 'assistant', seq: 1, createdAt: 1, body: 'bad', meta: null }],
    }
    await expect(listMessages('c1')).rejects.toBeInstanceOf(IpcContractDecodeError)
    try {
      await listMessages('c1')
    } catch (error) {
      expectProtocolInvalidError(error)
    }
  })

  it('branchClient.switchQuestionCandidate keeps signature and surfaces decode errors', async () => {
    ;(globalThis as any).dbBridge = {
      invoke: async () => ({ ok: true, headMessageId: 'm2' }),
    }
    const ok = await switchQuestionCandidate('b1', null, 'q1')
    expect(ok.headMessageId).toBe('m2')

    ;(globalThis as any).dbBridge = {
      invoke: async () => ({ ok: true }),
    }
    await expect(switchQuestionCandidate('b1', null, 'q1')).rejects.toBeInstanceOf(IpcContractDecodeError)
    try {
      await switchQuestionCandidate('b1', null, 'q1')
    } catch (error) {
      expectProtocolInvalidError(error)
    }
  })

  it('branchClient.truncateBranchFromQuestion keeps signature and surfaces decode errors', async () => {
    ;(globalThis as any).dbBridge = {
      invoke: async () => ({ ok: true, headMessageId: 'm2', fallbackQuestionId: null }),
    }
    const ok = await truncateBranchFromQuestion('b1', 'q1')
    expect(ok.headMessageId).toBe('m2')
    expect(ok.fallbackQuestionId).toBeNull()

    ;(globalThis as any).dbBridge = {
      invoke: async () => ({ ok: true }),
    }
    await expect(truncateBranchFromQuestion('b1', 'q1')).rejects.toBeInstanceOf(IpcContractDecodeError)
    try {
      await truncateBranchFromQuestion('b1', 'q1')
    } catch (error) {
      expectProtocolInvalidError(error)
    }
  })

  it('messageClient.setMessageStatus accepts with/without metaPatch and decodes ack without protocol_invalid', async () => {
    const calls: Array<{ method: string; params: any }> = []
    const invoke = async (method: string, params?: unknown) => {
      calls.push({ method, params: params ?? null })
      return { ok: true }
    }
    ;(globalThis as any).dbBridge = { invoke }

    await expect(setMessageStatus({ messageId: 'm1', status: 'final' })).resolves.toBe(true)
    await expect(
      setMessageStatus({
        messageId: 'm1',
        status: 'final',
        metaPatch: { completionOutcome: 'truncated' },
      })
    ).resolves.toBe(true)

    expect(calls[0]?.method).toBe('message.setStatus')
    expect(calls[0]?.params?.metaPatch).toBeUndefined()
    expect(calls[1]?.method).toBe('message.setStatus')
    expect(calls[1]?.params?.metaPatch).toEqual({ completionOutcome: 'truncated' })
  })
})

describe('BL-07 messageAsset renderer IPC sanitization', () => {
  it('decodeMessageAssetPersistResponse strips path from output', () => {
    const result = decodeMessageAssetPersistResponse({
      ok: true,
      assets: [{
        messageId: 'm1',
        assetId: 'a1',
        ordinal: 0,
        mime: 'image/png',
        width: 100,
        height: 200,
        assetUrl: 'asset://a1',
        path: 'C:/Users/test/file.png',
        fileUrl: 'file:///C:/Users/test/file.png',
        hash: 'abc123def',
        bytes: 1024,
      }],
    })
    expect(result).toHaveLength(1)
    const asset = result[0]!
    expect(asset).not.toHaveProperty('path')
    expect(asset).not.toHaveProperty('fileUrl')
    expect(asset).not.toHaveProperty('hash')
    expect(asset).not.toHaveProperty('bytes')
    expect(asset.assetUrl).toBe('asset://a1')
    expect(asset.mime).toBe('image/png')
  })

  it('decodeMessageAssetListResponse strips path from output', () => {
    const result = decodeMessageAssetListResponse([{
      messageId: 'm1',
      assetId: 'a1',
      ordinal: 0,
      mime: 'image/png',
      width: 100,
      height: 200,
      assetUrl: 'asset://a1',
      path: '/home/user/file.png',
      fileUrl: 'file:///home/user/file.png',
      hash: 'def456abc',
      bytes: 2048,
    }])
    expect(result).toHaveLength(1)
    const asset = result[0]!
    expect(asset).not.toHaveProperty('path')
    expect(asset).not.toHaveProperty('fileUrl')
    expect(asset).not.toHaveProperty('hash')
    expect(asset).not.toHaveProperty('bytes')
  })

  it('decodeMessageAssetPersistResponse returns empty array for empty assets', () => {
    const result = decodeMessageAssetPersistResponse({ ok: true, assets: [] })
    expect(result).toEqual([])
  })

  it('decodeMessageAssetListResponse returns empty array for empty list', () => {
    const result = decodeMessageAssetListResponse([])
    expect(result).toEqual([])
  })
})
