import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import MessageAttachmentCard from './MessageAttachmentCard.vue'

describe('MessageAttachmentCard file type hints', () => {
  it('renders compatibility and route hints from send-plan mapped file type info', () => {
    render(MessageAttachmentCard, {
      props: {
        attachment: {
          messageId: 'm1',
          attachmentId: 'a1',
          assetId: 'asset-1',
          filename: 'archive.zip',
          extension: 'zip',
          mime: 'application/zip',
          assetKind: 'archive',
          aiPayloadKind: 'binary',
          sourceKind: 'local_file',
          displayStatus: 'ready_with_warnings',
          borderTone: 'yellow',
          isHistoryIncompatible: false,
          incompatibilityReason: null,
          isActiveLocatedAttachment: false,
          previewDataUrl: null,
          iconKind: 'file',
          fileTypeInfo: {
            formatId: 'zip',
            kind: 'archive',
            confidenceLevel: 'high',
            recommendedRoute: 'ask_user',
            recommendedRouteLabelCode: 'send.route.ask_user',
            compatibility: 'compatible',
            blocked: false,
            requiresJob: false,
            engineUnavailable: false,
            hasConflicts: false,
            hasExtensionMimeConflict: false,
            warningLabelCodes: [],
            blockedLabelCodes: [],
            blockedBy: [],
          },
          createdAt: 1,
        },
      },
    })

    expect(screen.getByText(/type: zip · high/i)).toBeTruthy()
    expect(screen.getByText(/route: ask_user · compatible/i)).toBeTruthy()
  })
})
