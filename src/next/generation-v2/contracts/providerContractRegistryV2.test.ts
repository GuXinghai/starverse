import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isReviewedProviderContractDefinitionV2,
  listReviewedProviderContractDefinitionsV2,
  lookupReviewedProviderContractDefinitionV2,
  readProviderContractRegistryRevisionV2,
} from './providerContractRegistryV2'

function currentLookup() {
  const definition = listReviewedProviderContractDefinitionsV2()
    .find((item) => item.protocolContractId.value === 'openrouter-images-v1')!
  return Object.freeze({
    protocolContractId: definition.protocolContractId.value,
    contractRevision: definition.contractRevision.value,
  })
}

describe('Generation V2 reviewed provider contract registry', () => {
  it('returns the exact reviewed OpenRouter Images definition without making it executable', () => {
    const definition = lookupReviewedProviderContractDefinitionV2(currentLookup())
    expect(isReviewedProviderContractDefinitionV2(definition)).toBe(true)
    expect(definition).toMatchObject({
      classification: 'reviewed_definition',
      executionAuthority: 'none',
      registrySchemaVersion: 1,
      implementationStatus: 'definition_only',
      modelBindingPolicy: 'descriptor_model_id',
      endpointBindingPolicy: 'exact_descriptor_pin',
      continuationPolicy: 'none',
      operations: ['image_generate'],
      apiSurface: { kind: 'openrouter_images', apiVersion: 'v1', requestPath: '/api/v1/images' },
      evidence: {
        verifiedAt: '2026-07-14',
        openApiSha256: 'abaf90acc89dc3a2b4cd8824afcbf87734c8d0a5f4429ea85dca0d9eb02e353b',
      },
    })
    expect(definition.providerId.value).toBe('openrouter')
    expect(definition.definitionDigest.value).toMatch(/^[0-9a-f]{64}$/u)
    expect(definition.contractRevision.value)
      .toBe(`${definition.protocolContractId.value}:${definition.definitionDigest.value}`)
    expect(definition.registryRevision).toBe(readProviderContractRegistryRevisionV2())
    expect(Object.isFrozen(definition)).toBe(true)
    expect(Object.isFrozen(definition.evidence.provenanceUrls)).toBe(true)
    expect(Object.isFrozen(definition.evidence.localArtifacts)).toBe(true)
    for (const artifact of definition.evidence.localArtifacts) {
      const actual = createHash('sha256').update(readFileSync(path.resolve(artifact.path))).digest('hex')
      expect(actual, artifact.id).toBe(artifact.sha256)
      expect(Object.isFrozen(artifact)).toBe(true)
    }
  })

  it('rejects unknown, stale, accessor-bearing and extra-field lookups', () => {
    const lookup = currentLookup()
    expect(() => lookupReviewedProviderContractDefinitionV2({ ...lookup, contractRevision: 'stale' }))
      .toThrow('GENERATION_V2_CONTRACT_UNKNOWN')
    expect(() => lookupReviewedProviderContractDefinitionV2({ ...lookup, extra: true }))
      .toThrow('GENERATION_V2_CONTRACT_LOOKUP_INVALID')
    expect(() => lookupReviewedProviderContractDefinitionV2(Object.defineProperty({
      contractRevision: lookup.contractRevision,
    }, 'protocolContractId', { enumerable: true, get: () => lookup.protocolContractId })))
      .toThrow('GENERATION_V2_CONTRACT_LOOKUP_INVALID')
  })

  it('does not trust structural clones and exposes no duplicate contract revision', () => {
    const [definition] = listReviewedProviderContractDefinitionsV2()
    expect(listReviewedProviderContractDefinitionsV2()).toHaveLength(5)
    expect(isReviewedProviderContractDefinitionV2({ ...definition })).toBe(false)
    expect(new Set(listReviewedProviderContractDefinitionsV2().map((item) =>
      `${item.protocolContractId.value}\0${item.contractRevision.value}`)).size).toBe(5)
  })

  it('registers GenerateContent and Interactions as separate non-executable v1beta contracts', () => {
    const definitions = listReviewedProviderContractDefinitionsV2()
      .filter((definition) => definition.providerId.value === 'google_ai_studio')
    expect(definitions).toHaveLength(2)
    expect(definitions.map((definition) => definition.apiSurface)).toEqual([
      {
        kind: 'gemini_generate_content',
        providerFamilyContractId: 'gemini-developer-api-v1beta',
        surfaceId: 'gemini-generate-content-v1beta',
        apiOrigin: 'https://generativelanguage.googleapis.com',
        apiVersion: 'v1beta',
        auth: { kind: 'header', name: 'x-goog-api-key' },
        method: 'POST',
        responseProtocol: 'sse',
        relativePathTemplate: '/models/{model}:streamGenerateContent',
        fixedQuery: { alt: 'sse' },
        codecKind: 'gemini_generate_content_v1beta',
        continuationFamily: 'candidate_parts_thought_signatures_tool_calls',
      },
      {
        kind: 'gemini_interactions',
        providerFamilyContractId: 'gemini-developer-api-v1beta',
        surfaceId: 'gemini-interactions-v1beta',
        apiOrigin: 'https://generativelanguage.googleapis.com',
        apiVersion: 'v1beta',
        auth: { kind: 'header', name: 'x-goog-api-key' },
        method: 'POST',
        relativePathTemplate: '/interactions',
        fixedQuery: {},
        codecKind: 'gemini_interactions_v1beta',
        streamRequestPolicy: {
          location: 'body',
          field: 'stream',
          requiredValue: true,
          responseProtocol: 'sse',
        },
        continuationFamily: 'interaction_id_and_native_steps',
      },
    ])
    expect(definitions.map((definition) => definition.continuationPolicy)).toEqual([
      'candidate_parts_thought_signatures_tool_calls',
      'interaction_id_and_native_steps',
    ])
    expect(definitions.every((definition) => definition.executionAuthority === 'none')).toBe(true)
    expect(definitions.every((definition) => definition.implementationStatus === 'definition_only')).toBe(true)
    expect(definitions[0].evidence.openApiSha256).toBeNull()
    expect(definitions[1].evidence.openApiSha256)
      .toBe('5d62de8f9fe06bc7a4e595bef257c8909502922f1691eee179051b7a2ed84690')
    expect(new Set(definitions.map((definition) => definition.contractRevision.value)).size).toBe(2)
  })

  it('binds every registered local evidence artifact to its committed bytes', () => {
    for (const definition of listReviewedProviderContractDefinitionsV2()) {
      for (const artifact of definition.evidence.localArtifacts) {
        const actual = createHash('sha256').update(readFileSync(path.resolve(artifact.path))).digest('hex')
        expect(actual, `${definition.protocolContractId.value}:${artifact.id}`).toBe(artifact.sha256)
      }
    }
  })

  it('registers Anthropic Messages without promoting its blocked capability matrix', () => {
    const definition = listReviewedProviderContractDefinitionsV2()
      .find((item) => item.protocolContractId.value === 'anthropic-messages-2023-06-01')!
    expect(definition).toMatchObject({
      executionAuthority: 'none',
      implementationStatus: 'definition_only',
      operations: ['text', 'tool_continue'],
      modelBindingPolicy: 'runtime_capability_resolver',
      endpointBindingPolicy: 'first_party_profile_authority_required',
      continuationPolicy: 'ordered_native_content_blocks_with_signatures',
      apiSurface: {
        kind: 'anthropic_messages',
        apiOrigin: 'https://api.anthropic.com',
        auth: { kind: 'header', name: 'x-api-key' },
        apiVersionHeader: { name: 'anthropic-version', value: '2023-06-01' },
        relativePathTemplate: '/v1/messages',
        streamRequestPolicy: {
          location: 'body',
          field: 'stream',
          requiredValue: true,
          responseProtocol: 'named_sse',
          doneSentinel: 'forbidden',
        },
      },
      evidence: { openApiSha256: null, verifiedAt: '2026-07-15' },
    })
  })

  it('registers only DeepSeek stable Chat as a non-executable native-history contract', () => {
    const definitions = listReviewedProviderContractDefinitionsV2()
      .filter((item) => item.providerId.value === 'deepseek')
    expect(definitions).toHaveLength(1)
    expect(definitions[0]).toMatchObject({
      executionAuthority: 'none',
      implementationStatus: 'definition_only',
      operations: ['text', 'tool_continue'],
      modelBindingPolicy: 'runtime_capability_resolver',
      endpointBindingPolicy: 'first_party_profile_authority_required',
      continuationPolicy: 'ordered_native_chat_messages_with_reasoning_and_tools',
      apiSurface: {
        kind: 'deepseek_stable_chat',
        apiOrigin: 'https://api.deepseek.com',
        auth: { kind: 'header', name: 'Authorization', scheme: 'Bearer' },
        relativePathTemplate: '/chat/completions',
        streamRequestPolicy: {
          responseProtocol: 'data_only_sse', doneSentinel: 'required',
        },
      },
      evidence: { openApiSha256: null, verifiedAt: '2026-07-15' },
    })
    expect(JSON.stringify(definitions[0])).not.toContain('/v1')
    expect(JSON.stringify(definitions[0])).not.toContain('/beta')
  })
})
