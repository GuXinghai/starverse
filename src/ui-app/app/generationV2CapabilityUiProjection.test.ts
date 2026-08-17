import { describe, expect, it } from 'vitest'
import type { GenerationControlsProjectionV2 } from '@/next/generation-v2/capability/resolvedCapabilityV2'
import {
  projectImageAttachmentInputSupportV2,
  projectImageGenerationControlDomainsV2,
} from './generationV2CapabilityUiProjection'

function projection(
  controls: GenerationControlsProjectionV2['controls'],
): GenerationControlsProjectionV2 {
  return {
    schemaVersion: 1,
    binding: {},
    capabilityRevision: 'capability-v2:test',
    controls,
  }
}

describe('Generation V2 capability UI projection', () => {
  it('preserves resolved image domains without a renderer allowlist', () => {
    const value = projection({
      'image.resolution': { visibility: 'visible', state: 'supported', domain: { kind: 'enum', values: ['8K'] }, constraints: [], evidenceIds: [] },
      'image.aspectRatio': { visibility: 'visible', state: 'supported', domain: { kind: 'enum', values: ['21:9'] }, constraints: [], evidenceIds: [] },
      'image.outputMode': { visibility: 'visible', state: 'supported', domain: { kind: 'enum', values: ['provider_native'] }, constraints: [], evidenceIds: [] },
    } as unknown as GenerationControlsProjectionV2['controls'])

    expect(projectImageGenerationControlDomainsV2(value)).toEqual({
      resolutions: ['8K'],
      aspectRatios: ['21:9'],
      outputModes: ['provider_native'],
    })
  })

  it('derives image attachment acceptance only from resolved attachment fields', () => {
    const value = projection({
      'attachments[].include': { visibility: 'visible', state: 'supported', constraints: [], evidenceIds: [] },
      'attachments[].sendAs': { visibility: 'visible', state: 'supported', domain: { kind: 'enum', values: ['inline_text', 'image_reference'] }, constraints: [], evidenceIds: [] },
    } as unknown as GenerationControlsProjectionV2['controls'])

    expect(projectImageAttachmentInputSupportV2(value)).toBe(true)
    expect(projectImageAttachmentInputSupportV2(projection({} as GenerationControlsProjectionV2['controls']))).toBe(false)
    expect(projectImageAttachmentInputSupportV2(null)).toBeNull()
  })
})
