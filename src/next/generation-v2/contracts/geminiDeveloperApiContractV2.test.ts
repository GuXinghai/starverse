import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isGeminiDeveloperApiContractV2,
  readGeminiDeveloperApiContractV2,
  resolveGeminiDeveloperApiEndpointV2,
} from './geminiDeveloperApiContractV2'

describe('Generation V2 Gemini Developer API provider-family contract', () => {
  it('owns one v1beta-only origin/auth policy and three independent typed surfaces', () => {
    const contract = readGeminiDeveloperApiContractV2()
    expect(contract).toMatchObject({
      classification: 'reviewed_provider_family_definition',
      executionAuthority: 'none',
      implementationStatus: 'definition_only',
      providerId: 'google_ai_studio',
      contractFamilyId: 'gemini-developer-api-v1beta',
      apiOrigin: 'https://generativelanguage.googleapis.com',
      apiVersion: 'v1beta',
      auth: { kind: 'header', name: 'x-goog-api-key' },
    })
    expect(contract.surfaces).toEqual([
      expect.objectContaining({
        surfaceId: 'gemini-generate-content-v1beta',
        codecKind: 'gemini_generate_content_v1beta',
        continuationFamily: 'candidate_parts_thought_signatures_tool_calls',
      }),
      expect.objectContaining({
        surfaceId: 'gemini-interactions-v1beta',
        codecKind: 'gemini_interactions_v1beta',
        streamRequestPolicy: {
          location: 'body',
          field: 'stream',
          requiredValue: true,
          responseProtocol: 'sse',
          doneSentinel: '[DONE]',
        },
        statePolicy: {
          store: false,
          previousInteractionId: 'forbidden',
          continuation: 'client_managed_full_native_steps',
        },
        continuationFamily: 'interaction_id_and_native_steps',
      }),
      expect.objectContaining({
        surfaceId: 'gemini-models-v1beta',
        codecKind: 'gemini_models_v1beta',
        method: 'GET',
      }),
    ])
    expect(new Set(contract.surfaces.map((surface) => surface.codecKind)).size).toBe(3)
    expect(Object.isFrozen(contract)).toBe(true)
    expect(Object.isFrozen(contract.surfaces)).toBe(true)
    expect(isGeminiDeveloperApiContractV2({ ...contract })).toBe(false)
  })

  it('matches the committed official-evidence audit projection', () => {
    const contract = readGeminiDeveloperApiContractV2()
    const artifactPath = path.resolve(
      'docs/architecture/generation-compiler-v2/evidence/gemini-developer-api-contract-20260718.json',
    )
    const bytes = readFileSync(artifactPath)
    const audit = JSON.parse(bytes.toString('utf8'))
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe('446bcbd2c00cfaa40190d4ea99bd02b0e6ec211ec525498eb9ed47b3901e765c')
    expect(audit.capturedAt).toBe(contract.evidence.verifiedAt)
    expect(audit.provider).toBe(contract.providerId)
    expect(audit.ownerPolicy).toMatchObject({
      apiVersion: contract.apiVersion,
      automaticVersionFallback: false,
      independentTypedCodecs: contract.surfaces.filter((surface) => surface.method === 'POST')
        .map((surface) => surface.codecKind),
      futureAgentsCodecRequired: true,
    })
    expect(audit.officialEvidence.interactionsOpenApi.sha256)
      .toBe(contract.evidence.interactionsOpenApiSha256)
    expect(contract.evidence.provenanceUrls).toEqual(expect.arrayContaining([
      audit.officialEvidence.generateContentReference,
      audit.officialEvidence.interactionsReference,
      audit.officialEvidence.apiVersionsReference,
      audit.officialEvidence.interactionsOpenApi.url,
    ]))
  })

  it('resolves exact v1beta endpoints without a version table or fallback', () => {
    const contract = readGeminiDeveloperApiContractV2()
    expect(resolveGeminiDeveloperApiEndpointV2(contract, {
      surfaceId: 'gemini-generate-content-v1beta',
      modelId: 'gemini-3.1-flash-lite-preview',
    }).url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:streamGenerateContent?alt=sse',
    )
    expect(resolveGeminiDeveloperApiEndpointV2(contract, {
      surfaceId: 'gemini-interactions-v1beta',
    }).url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
  })

  it('rejects forged contracts, unknown surfaces, model paths, accessors and extra fields', () => {
    const contract = readGeminiDeveloperApiContractV2()
    expect(() => resolveGeminiDeveloperApiEndpointV2({ ...contract }, {
      surfaceId: 'gemini-interactions-v1beta',
    })).toThrow('GENERATION_V2_GEMINI_CONTRACT_INVALID')
    expect(() => resolveGeminiDeveloperApiEndpointV2(contract, { surfaceId: 'gemini-agents-v1beta' }))
      .toThrow('GENERATION_V2_GEMINI_SURFACE_UNKNOWN')
    for (const modelId of ['models/gemini-3.1', '../gemini', ' gemini', 'gemini\n']) {
      expect(() => resolveGeminiDeveloperApiEndpointV2(contract, {
        surfaceId: 'gemini-generate-content-v1beta',
        modelId,
      })).toThrow('GENERATION_V2_GEMINI_ENDPOINT_INPUT_INVALID')
    }
    expect(() => resolveGeminiDeveloperApiEndpointV2(contract, Object.defineProperty({}, 'surfaceId', {
      enumerable: true,
      get: () => 'gemini-interactions-v1beta',
    }))).toThrow('GENERATION_V2_GEMINI_ENDPOINT_INPUT_INVALID')
    expect(() => resolveGeminiDeveloperApiEndpointV2(contract, {
      surfaceId: 'gemini-interactions-v1beta',
      apiVersion: 'v1',
    })).toThrow('GENERATION_V2_GEMINI_ENDPOINT_INPUT_INVALID')
  })
})
