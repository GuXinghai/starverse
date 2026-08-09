import { describe, expect, it } from 'vitest'
import { decodeCanonicalOpenRouterImageDescriptorSetV2 } from './canonicalDescriptorV2'
import {
  OPENROUTER_IMAGE_NON_SEMANTIC_INTENT_KEYS_V2,
  OPENROUTER_IMAGE_SEMANTIC_INTENT_KEYS_V2,
  projectOpenRouterImageCandidatesV2,
  projectOpenRouterImageIntentCapabilityV2,
} from './imageIntentCapabilityProjectionV2'

function intent(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    generation: { seed: 7, candidateCount: 2 },
    image: {
      mode: 'generate', aspectRatio: '16:9', resolution: '1K', quality: 'high',
      format: 'webp', background: 'opaque', outputCompression: 80, stream: true,
    },
    providerExtension: { kind: 'none' },
    ...overrides,
  }
}

function descriptors(order: readonly string[] = ['z-provider', 'a-provider']) {
  return decodeCanonicalOpenRouterImageDescriptorSetV2({
    id: 'model/image',
    endpoints: order.map((tag) => ({
      provider_name: tag,
      provider_tag: tag,
      provider_slug: tag,
      supported_parameters: {
        aspect_ratio: { type: 'enum', values: ['16:9'] },
        resolution: { type: 'enum', values: ['1K'] },
        quality: { type: 'enum', values: ['high'] },
        output_format: { type: 'enum', values: ['webp'] },
        background: { type: 'enum', values: ['opaque'] },
        output_compression: { type: 'range', min: 0, max: 100 },
        seed: { type: 'boolean' },
        n: { type: 'range', min: 1, max: 4 },
      },
      allowed_passthrough_parameters: [],
      supports_streaming: true,
    })),
  })
}

describe('OpenRouter Images V2 intent capability projection', () => {
  it('maps every supported explicit semantic field to its exact Images wire key', () => {
    const projection = projectOpenRouterImageIntentCapabilityV2(intent())
    expect(projection.issues).toEqual([])
    expect(projection.wireFields).toEqual([
      { semanticPath: 'image.aspectRatio', wireKey: 'aspect_ratio', value: '16:9' },
      { semanticPath: 'image.background', wireKey: 'background', value: 'opaque' },
      { semanticPath: 'generation.candidateCount', wireKey: 'n', value: 2 },
      { semanticPath: 'image.outputCompression', wireKey: 'output_compression', value: 80 },
      { semanticPath: 'image.format', wireKey: 'output_format', value: 'webp' },
      { semanticPath: 'image.quality', wireKey: 'quality', value: 'high' },
      { semanticPath: 'image.resolution', wireKey: 'resolution', value: '1K' },
      { semanticPath: 'generation.seed', wireKey: 'seed', value: 7 },
    ])
    expect(projection.dispositions).toContainEqual({
      semanticPath: 'image.stream', outcome: 'encoded', wireKey: 'stream', value: true,
    })
  })

  it('assigns exactly one disposition to every current explicit semantic path', () => {
    const projection = projectOpenRouterImageIntentCapabilityV2({
      schemaVersion: 2,
      generation: {
        maxOutputTokens: 10, temperature: 0, topP: 0.5, topK: 5, seed: 0,
        stop: ['stop'], candidateCount: 1, frequencyPenalty: 0,
        presencePenalty: 0, repetitionPenalty: 1,
      },
      reasoning: { mode: 'enabled', effort: 'high', summary: 'detailed' },
      web: { mode: 'provider_search', types: ['web', 'image'] },
      image: {
        mode: 'generate', aspectRatio: '1:1', resolution: '1K', quality: 'high',
        format: 'webp', background: 'transparent', outputCompression: 80, stream: false,
      },
      tools: {
        mode: 'enabled', allowedToolIds: ['tool-1'], toolChoice: { mode: 'omitted' }, sideEffectConfirmation: 'required_each_retry',
      },
      attachments: [
        {
          kind: 'managed_file',
          assetId: 'asset-1', assetRevisionId: 'revision-1', assetSha256: 'a'.repeat(64),
          include: true, sendAs: 'image_reference', conversion: 'none',
        },
        {
          kind: 'managed_file',
          assetId: 'asset-2', assetRevisionId: 'revision-2', assetSha256: 'b'.repeat(64),
          include: false, sendAs: 'provider_file', conversion: 'none',
        },
      ],
      providerExtension: { kind: 'none' },
    })
    const paths = projection.dispositions.map((item) => item.semanticPath)
    expect(paths).toEqual([
      'attachments',
      'attachments.asset-1@revision-1',
      'attachments.asset-2@revision-2',
      'generation.candidateCount',
      'generation.frequencyPenalty',
      'generation.maxOutputTokens',
      'generation.presencePenalty',
      'generation.repetitionPenalty',
      'generation.seed',
      'generation.stop',
      'generation.temperature',
      'generation.topK',
      'generation.topP',
      'image.aspectRatio',
      'image.background',
      'image.format',
      'image.mode',
      'image.outputCompression',
      'image.quality',
      'image.resolution',
      'image.stream',
      'providerExtension.kind',
      'reasoning',
      'tools',
      'web',
    ])
    expect(new Set(paths).size).toBe(paths.length)
    expect(OPENROUTER_IMAGE_NON_SEMANTIC_INTENT_KEYS_V2).toEqual(['schemaVersion'])
    expect(OPENROUTER_IMAGE_SEMANTIC_INTENT_KEYS_V2).toEqual([
      'generation', 'reasoning', 'web', 'image', 'tools', 'attachments', 'providerExtension',
    ])
    expect(new Set([
      ...OPENROUTER_IMAGE_NON_SEMANTIC_INTENT_KEYS_V2,
      ...OPENROUTER_IMAGE_SEMANTIC_INTENT_KEYS_V2,
    ]).size).toBe(8)
  })

  it('rejects image combinations that the API would otherwise ignore or conflict', () => {
    expect(projectOpenRouterImageIntentCapabilityV2({
      schemaVersion: 2,
      image: { mode: 'generate', format: 'png', outputCompression: 80 },
    }).issues).toContainEqual({
      semanticPath: 'image.outputCompression', code: 'IMAGE_FIELD_CONFLICT', wireKey: 'output_compression',
    })
    expect(projectOpenRouterImageIntentCapabilityV2({
      schemaVersion: 2,
      image: { mode: 'generate', format: 'jpeg', background: 'transparent' },
    }).issues).toContainEqual({
      semanticPath: 'image.background', code: 'IMAGE_FIELD_CONFLICT', wireKey: 'background',
    })
  })

  it('encodes explicit pixel size and blocks unresolved mixed size controls', () => {
    expect(projectOpenRouterImageIntentCapabilityV2({
      schemaVersion: 2,
      image: { mode: 'generate', size: { width: 2048, height: 1024 } },
    }).wireFields).toEqual([{ semanticPath: 'image.size', wireKey: 'size', value: '2048x1024' }])
    expect(projectOpenRouterImageIntentCapabilityV2(intent({
      image: { mode: 'generate', size: { width: 2048, height: 1024 }, resolution: '2K' },
    })).issues).toContainEqual({
      semanticPath: 'image.size', code: 'SIZE_COMBINATION_UNRESOLVED', wireKey: 'size',
    })
  })

  it('rejects every unsupported explicit surface instead of silently dropping it', () => {
    const projection = projectOpenRouterImageIntentCapabilityV2(intent({
      generation: { temperature: 0, candidateCount: 11 },
      reasoning: { mode: 'enabled', effort: 'high' },
      web: { mode: 'provider_search', types: ['web'] },
      tools: { mode: 'enabled', allowedToolIds: ['tool-1'], toolChoice: { mode: 'omitted' }, sideEffectConfirmation: 'required_each_retry' },
    }))
    expect(projection.issues.map((item) => item.semanticPath)).toEqual([
      'generation.candidateCount', 'generation.temperature', 'reasoning', 'tools', 'web',
    ])
  })

  it('evaluates descriptor enum/range/presence/stream evidence and keeps sorting display-only', () => {
    const projection = projectOpenRouterImageIntentCapabilityV2(intent())
    const first = projectOpenRouterImageCandidatesV2({
      descriptorSet: descriptors(), projection, boundProviderTag: null,
    })
    expect(first.map((candidate) => [candidate.providerTag, candidate.eligible])).toEqual([
      ['a-provider', true], ['z-provider', true],
    ])
    const bound = projectOpenRouterImageCandidatesV2({
      descriptorSet: descriptors(['a-provider', 'z-provider']), projection, boundProviderTag: 'z-provider',
    })
    expect(bound.map((candidate) => candidate.providerTag)).toEqual(['z-provider', 'a-provider'])
    expect(bound.filter((candidate) => candidate.eligible)).toHaveLength(2)
  })

  it('reports field-level descriptor failures without choosing another endpoint', () => {
    const set = decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'model/image',
      endpoints: [{
        provider_name: 'limited', provider_tag: 'limited', provider_slug: 'limited',
        supported_parameters: { n: { type: 'range', min: 1, max: 1 } },
        allowed_passthrough_parameters: [], supports_streaming: false,
      }],
    })
    const [candidate] = projectOpenRouterImageCandidatesV2({
      descriptorSet: set,
      projection: projectOpenRouterImageIntentCapabilityV2(intent()),
      boundProviderTag: 'limited',
    })
    expect(candidate.eligible).toBe(false)
    expect(candidate.issues).toContainEqual({
      semanticPath: 'image.stream', code: 'DESCRIPTOR_VALUE_UNSUPPORTED', wireKey: 'stream',
    })
    expect(candidate.issues).toContainEqual({
      semanticPath: 'generation.candidateCount', code: 'DESCRIPTOR_VALUE_UNSUPPORTED', wireKey: 'n',
    })
  })
})
