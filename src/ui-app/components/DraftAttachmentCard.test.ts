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
          detectionInfo: {
            routeEligibility: 'verdict_ready',
            detectionLevel: 'advanced',
            engineMode: 'core_plus_magika',
            usedMagika: true,
            magikaState: 'available',
            evidenceSources: ['magic', 'magika'],
            decisiveEvidenceSource: 'magika',
            detectionTrigger: 'upload',
            magikaModelVersion: 'magika-v1',
            advancedAttempted: true,
            advancedFailureReason: null,
          },
          previewDataUrl: null,
          canRemove: true,
        },
      },
    })

    const card = screen.getByTestId('draft-attachment-card-asset-a1')
    expect(card.textContent).toContain('TXT / docx')
    expect(card.textContent).not.toContain('asset-a1')
    expect(card.getAttribute('title')).toContain('report.docx')
    expect(card.getAttribute('title')).toContain('Recommended route: converted_markdown')
    expect(card.getAttribute('title')).toContain('Compatibility: warning')
    expect(card.getAttribute('title')).toContain('Detection: 高级检测 · Magika')
  })

  it('renders detection state from the app-layer view model', async () => {
    const base = {
      draftAttachmentId: 'draft-a1',
      assetId: 'asset-a1',
      filename: 'report.bin',
      extension: 'bin',
      assetKind: 'unknown',
      aiPayloadKind: 'binary',
      sourceKind: 'local_file',
      displayStatus: 'detection_pending' as const,
      borderTone: 'yellow' as const,
      isParsing: false,
      warningReason: null,
      blockingReason: null,
      fileTypeInfo: null,
      detectionInfo: null,
      previewDataUrl: null,
      canRemove: true,
    }

    const { rerender } = render(DraftAttachmentCard, {
      props: {
        attachment: {
          ...base,
          detectionInfo: {
            routeEligibility: 'detection_pending',
            detectionLevel: null,
            engineMode: null,
            usedMagika: false,
            magikaState: 'not_requested',
            evidenceSources: [],
            decisiveEvidenceSource: null,
            detectionTrigger: 'send_plan_build',
            magikaModelVersion: null,
            advancedAttempted: false,
            advancedFailureReason: null,
          },
        },
      },
    })
    expect(screen.getAllByText('待检测').length).toBeGreaterThan(0)
    expect(screen.getByTestId('draft-attachment-card-asset-a1').getAttribute('title')).toContain('Detection: 待检测')

    await rerender({
      attachment: {
        ...base,
        displayStatus: 'ready' as const,
        detectionInfo: {
          routeEligibility: 'verdict_ready',
          detectionLevel: 'basic',
          engineMode: 'core_only',
          usedMagika: false,
          magikaState: 'disabled',
          evidenceSources: ['magic'],
          decisiveEvidenceSource: 'magic',
          detectionTrigger: 'upload',
          magikaModelVersion: null,
          advancedAttempted: false,
          advancedFailureReason: null,
        },
      },
    })
    expect(screen.getByTestId('draft-attachment-card-asset-a1').getAttribute('title')).toContain('Detection: 基础检测')

    await rerender({
      attachment: {
        ...base,
        displayStatus: 'detection_failed' as const,
        detectionInfo: {
          routeEligibility: 'detection_failed',
          detectionLevel: 'advanced',
          engineMode: 'core_plus_magika',
          usedMagika: false,
          magikaState: 'failed',
          evidenceSources: [],
          decisiveEvidenceSource: null,
          detectionTrigger: 'send_plan_build',
          magikaModelVersion: null,
          advancedAttempted: true,
          advancedFailureReason: 'runtime_error',
        },
      },
    })
    expect(screen.getByTestId('draft-attachment-card-asset-a1').getAttribute('title')).toContain('Detection: 高级检测失败 / Magika 检测失败')
  })
})
