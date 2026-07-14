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
  const [definition] = listReviewedProviderContractDefinitionsV2()
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
    expect(listReviewedProviderContractDefinitionsV2()).toHaveLength(1)
    expect(isReviewedProviderContractDefinitionV2({ ...definition })).toBe(false)
    expect(new Set(listReviewedProviderContractDefinitionsV2().map((item) =>
      `${item.protocolContractId.value}\0${item.contractRevision.value}`)).size).toBe(1)
  })
})
