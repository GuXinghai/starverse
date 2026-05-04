import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import DraftAttachmentCard from './DraftAttachmentCard.vue'

describe('DraftAttachmentCard file type hints', () => {
  it('renders file type and route hints from app-layer view model', () => {
    render(DraftAttachmentCard, {
      props: {
        attachment: {
          draftAttachmentId: 'draft-a1',
          assetId: 'asset-a1',
          filename: 'report.docx',
          extension: 'docx',
          assetKind: 'document',
          aiPayloadKind: 'text',
          sourceKind: 'local_file',
          displayStatus: 'ready_with_warnings',
          borderTone: 'yellow',
          isParsing: false,
          warningReason: null,
          blockingReason: null,
          fileTypeInfo: {
            formatId: 'docx',
            kind: 'document',
            confidenceLevel: 'high',
            recommendedRoute: 'converted_markdown',
            recommendedRouteLabelCode: 'send.route.converted_markdown',
            compatibility: 'warning',
            blocked: false,
            requiresJob: true,
            engineUnavailable: false,
            hasConflicts: true,
            hasExtensionMimeConflict: true,
            warningLabelCodes: ['warning.low_confidence'],
            blockedLabelCodes: [],
            blockedBy: [],
          },
          previewDataUrl: null,
          canRemove: true,
        },
      },
    })

    expect(screen.getByText(/type: docx · high/i)).toBeTruthy()
    expect(screen.getByText(/route: converted_markdown · warning/i)).toBeTruthy()
    expect(screen.getByText(/type conflict detected/i)).toBeTruthy()
  })
})
