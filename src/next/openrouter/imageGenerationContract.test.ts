import { describe, expect, it } from 'vitest'
import {
  evaluateImageGenerationModel,
  evaluateModelCountBaseline,
  resolveImageGenerationRequestModalities,
  selectImageGenerationReferenceModels,
} from './imageGenerationContract'

describe('imageGenerationContract', () => {
  it('classifies text+image output model as eligible text_and_image', () => {
    const result = evaluateImageGenerationModel(
      {
        modelId: 'vendor/dual',
        inputModalities: ['text'],
        outputModalities: ['text', 'image'],
        status: 'active',
        visibility: 'visible',
      },
      { nowSec: 1_700_000_000 }
    )

    expect(result).toEqual({
      eligible: true,
      capabilityClass: 'text_and_image',
      reasons: [],
    })
  })

  it('classifies image-only output model as eligible image_only', () => {
    const result = evaluateImageGenerationModel({
      modelId: 'vendor/image-only',
      inputModalities: ['text'],
      outputModalities: ['image'],
      status: 'active',
      visibility: 'visible',
    })

    expect(result).toEqual({
      eligible: true,
      capabilityClass: 'image_only',
      reasons: [],
    })
  })

  it('rejects models missing image output', () => {
    const result = evaluateImageGenerationModel({
      modelId: 'vendor/text-only',
      inputModalities: ['text'],
      outputModalities: ['text'],
      status: 'active',
      visibility: 'visible',
    })

    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain('missing_image_output')
  })

  it('gracefully degrades when architecture modalities are missing', () => {
    const result = evaluateImageGenerationModel({
      modelId: 'vendor/missing-architecture',
      inputModalities: undefined,
      outputModalities: undefined,
      status: 'active',
      visibility: 'visible',
    })

    expect(result.eligible).toBe(false)
    expect(result.reasons).toEqual(expect.arrayContaining(['missing_image_output', 'missing_text_input']))
  })

  it('rejects models without text input for text-to-image scope', () => {
    const result = evaluateImageGenerationModel({
      modelId: 'vendor/image-input-only',
      inputModalities: ['image'],
      outputModalities: ['image'],
      status: 'active',
      visibility: 'visible',
    })

    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain('missing_text_input')
  })

  it('rejects inactive/hidden/expired models', () => {
    const result = evaluateImageGenerationModel(
      {
        modelId: 'vendor/old',
        inputModalities: ['text'],
        outputModalities: ['image'],
        status: 'deprecated',
        visibility: 'hidden',
        expirationAtSec: 1000,
      },
      { nowSec: 2000 }
    )

    expect(result.eligible).toBe(false)
    expect(result.reasons).toEqual(
      expect.arrayContaining(['inactive_status', 'hidden_visibility', 'expired_model'])
    )
  })

  it('distinguishes endpoint unavailable from model capability mismatch', () => {
    const unsupported = evaluateImageGenerationModel({
      modelId: 'vendor/text-only',
      inputModalities: ['text'],
      outputModalities: ['text'],
      endpointAvailable: true,
      status: 'active',
      visibility: 'visible',
    })
    expect(unsupported.reasons).toContain('missing_image_output')
    expect(unsupported.reasons).not.toContain('endpoint_unavailable')

    const endpointDown = evaluateImageGenerationModel(
      {
        modelId: 'vendor/image-ready-but-endpoint-down',
        inputModalities: ['text'],
        outputModalities: ['image', 'text'],
        endpointAvailable: false,
        status: 'active',
        visibility: 'visible',
      },
      { requireEndpointAvailable: true }
    )
    expect(endpointDown.reasons).toContain('endpoint_unavailable')
    expect(endpointDown.reasons).not.toContain('missing_image_output')
  })

  it('maps capability class to request modalities', () => {
    expect(resolveImageGenerationRequestModalities('text_and_image')).toEqual(['image', 'text'])
    expect(resolveImageGenerationRequestModalities('image_only')).toEqual(['image'])
  })

  it('selects reference models for both capability classes', () => {
    const selected = selectImageGenerationReferenceModels(
      [
        {
          modelId: 'vendor/text-only',
          inputModalities: ['text'],
          outputModalities: ['text'],
          status: 'active',
          visibility: 'visible',
        },
        {
          modelId: 'vendor/dual',
          inputModalities: ['text'],
          outputModalities: ['image', 'text'],
          status: 'active',
          visibility: 'visible',
        },
        {
          modelId: 'vendor/image-only',
          inputModalities: ['text'],
          outputModalities: ['image'],
          status: 'active',
          visibility: 'visible',
        },
      ],
      { nowSec: 1_700_000_000 }
    )

    expect(selected.textAndImageModelId).toBe('vendor/dual')
    expect(selected.imageOnlyModelId).toBe('vendor/image-only')
    expect(selected.eligibleModelIds).toEqual(['vendor/dual', 'vendor/image-only'])
  })

  it('flags possible subset when listed model count is below /models/count baseline', () => {
    const check = evaluateModelCountBaseline(42, 128)
    expect(check).toEqual({
      status: 'possible_subset',
      listedModelCount: 42,
      countProbe: 128,
      delta: 86,
    })
  })

  it('returns probe_missing when /models/count is unavailable', () => {
    const check = evaluateModelCountBaseline(42, null)
    expect(check).toEqual({
      status: 'probe_missing',
      listedModelCount: 42,
      countProbe: null,
      delta: null,
    })
  })

  it('returns ok when listed model count meets baseline', () => {
    const check = evaluateModelCountBaseline(128, 128)
    expect(check).toEqual({
      status: 'ok',
      listedModelCount: 128,
      countProbe: 128,
      delta: 0,
    })
  })
})
