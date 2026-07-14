import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { decodeCanonicalOpenRouterImageDescriptorSetV2 } from './canonicalDescriptorV2'

function endpoint(tag: string, overrides: Record<string, unknown> = {}) {
  return {
    provider_name: tag,
    provider_tag: tag,
    provider_slug: tag.split('/')[0],
    supported_parameters: {
      resolution: { type: 'enum', values: ['2K', '512', '1K'] },
      output_compression: { type: 'range', min: 0, max: 100 },
      seed: { type: 'boolean' },
    },
    allowed_passthrough_parameters: ['cachedContent'],
    supports_streaming: true,
    ...overrides,
  }
}

describe('canonical OpenRouter Images descriptor V2', () => {
  it('decodes the redacted 2026-07-14 exact descriptor evidence', () => {
    const audit = JSON.parse(readFileSync(path.resolve(
      'docs/architecture/generation-compiler-v2/evidence/openrouter-images-provider-only-smoke-20260714.json',
    ), 'utf8')) as {
      discovery: {
        selectedModel: { id: string }
        endpointResponse: { descriptorsRedacted: unknown[] }
      }
    }
    const set = decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: audit.discovery.selectedModel.id,
      endpoints: audit.discovery.endpointResponse.descriptorsRedacted,
    })
    expect(set.modelId.value).toBe('google/gemini-3.1-flash-image')
    expect(set.descriptors.map((descriptor) => descriptor.providerTag.value))
      .toEqual(['google-ai-studio', 'google-vertex/global'])
    expect(set.descriptors.every((descriptor) => descriptor.descriptorDigest.value.length === 64)).toBe(true)
  })

  it('derives stable per-descriptor digests and set revision independent of input ordering', () => {
    const left = decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'google/model', endpoints: [endpoint('zeta'), endpoint('alpha')],
    })
    const right = decodeCanonicalOpenRouterImageDescriptorSetV2({
      endpoints: [
        endpoint('alpha', { supported_parameters: {
          seed: { type: 'boolean' },
          output_compression: { max: 100, type: 'range', min: -0 },
          resolution: { values: ['1K', '512', '2K'], type: 'enum' },
        } }),
        endpoint('zeta'),
      ],
      id: 'google/model',
    })
    expect(left.endpointSetRevision.value).toBe(right.endpointSetRevision.value)
    expect(left.descriptors.map((item) => item.providerTag.value)).toEqual(['alpha', 'zeta'])
    expect(left.descriptors[0].descriptorDigest.value).toBe(right.descriptors[0].descriptorDigest.value)
  })

  it('changes descriptor and set revisions when a capability field changes', () => {
    const left = decodeCanonicalOpenRouterImageDescriptorSetV2({ id: 'google/model', endpoints: [endpoint('alpha')] })
    const right = decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'google/model', endpoints: [endpoint('alpha', { supports_streaming: false })],
    })
    expect(left.descriptors[0].descriptorDigest.value).not.toBe(right.descriptors[0].descriptorDigest.value)
    expect(left.endpointSetRevision.value).not.toBe(right.endpointSetRevision.value)
  })

  it('allows documented diagnostic pricing without hashing it and rejects every unknown field or alternate envelope', () => {
    const left = decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'google/model', endpoints: [endpoint('alpha', { pricing: { image: '0.01' } })],
    })
    const right = decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'google/model', endpoints: [endpoint('alpha', { pricing: { image: '0.02' } })],
    })
    expect(left.endpointSetRevision.value).toBe(right.endpointSetRevision.value)
    expect(() => decodeCanonicalOpenRouterImageDescriptorSetV2({
      data: { id: 'google/model', endpoints: [endpoint('alpha')] },
    })).toThrow('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
    expect(() => decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'google/model', endpoints: [endpoint('alpha')], data: {},
    })).toThrow('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
    expect(() => decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'google/model', endpoints: [endpoint('alpha', { future_capability: true })],
    })).toThrow('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
  })

  it('rejects duplicate tags, malformed rules and duplicate allowlist values', () => {
    expect(() => decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'google/model', endpoints: [endpoint('same'), endpoint('same')],
    })).toThrow('GENERATION_V2_OPENROUTER_DESCRIPTOR_DUPLICATE_TAG')
    expect(() => decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'google/model', endpoints: [endpoint('a', { supported_parameters: { x: { type: 'unknown' } } })],
    })).toThrow('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE')
    expect(() => decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'google/model', endpoints: [endpoint('a', { allowed_passthrough_parameters: ['x', 'x'] })],
    })).toThrow('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_VALUE')
  })

  it('rejects sparse/accessor descriptor arrays without invoking getters', () => {
    const sparse = new Array(1)
    expect(() => decodeCanonicalOpenRouterImageDescriptorSetV2({ id: 'google/model', endpoints: sparse }))
      .toThrow('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
    let calls = 0
    const accessor: unknown[] = []
    Object.defineProperty(accessor, '0', { enumerable: true, get: () => { calls += 1; return endpoint('a') } })
    expect(() => decodeCanonicalOpenRouterImageDescriptorSetV2({ id: 'google/model', endpoints: accessor }))
      .toThrow('GENERATION_V2_OPENROUTER_DESCRIPTOR_INVALID_SHAPE')
    expect(calls).toBe(0)
  })
})
