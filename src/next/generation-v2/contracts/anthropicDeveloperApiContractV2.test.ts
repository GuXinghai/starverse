import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isAnthropicDeveloperApiContractV2,
  readAnthropicDeveloperApiContractV2,
  readAnthropicMessagesRegistrySurfaceV2,
  resolveAnthropicDeveloperApiEndpointV2,
} from './anthropicDeveloperApiContractV2'

describe('Generation V2 Anthropic Developer API provider-family contract', () => {
  it('owns one direct-API origin/version/auth policy and three independent surfaces', () => {
    const contract = readAnthropicDeveloperApiContractV2()
    expect(contract).toMatchObject({
      classification: 'reviewed_provider_family_definition',
      executionAuthority: 'none',
      implementationStatus: 'definition_only',
      providerId: 'anthropic',
      contractFamilyId: 'anthropic-developer-api-2023-06-01',
      apiOrigin: 'https://api.anthropic.com',
      auth: { kind: 'header', name: 'x-api-key' },
      apiVersionHeader: { name: 'anthropic-version', value: '2023-06-01' },
    })
    expect(contract.surfaces.map((surface) => [surface.surfaceId, surface.codecKind])).toEqual([
      ['anthropic-messages-2023-06-01', 'anthropic_messages_2023_06_01'],
      ['anthropic-models-2023-06-01', 'anthropic_models_2023_06_01'],
      ['anthropic-files-beta-2025-04-14', 'anthropic_files_beta_2025_04_14'],
    ])
    expect(Object.isFrozen(contract)).toBe(true)
    expect(Object.isFrozen(contract.surfaces)).toBe(true)
    expect(isAnthropicDeveloperApiContractV2({ ...contract })).toBe(false)
  })

  it('keeps the Messages streaming contract complete in its registry projection', () => {
    expect(readAnthropicMessagesRegistrySurfaceV2()).toEqual({
      kind: 'anthropic_messages',
      providerFamilyContractId: 'anthropic-developer-api-2023-06-01',
      apiOrigin: 'https://api.anthropic.com',
      auth: { kind: 'header', name: 'x-api-key' },
      apiVersionHeader: { name: 'anthropic-version', value: '2023-06-01' },
      surfaceId: 'anthropic-messages-2023-06-01',
      codecKind: 'anthropic_messages_2023_06_01',
      endpointOperation: 'create_message',
      method: 'POST',
      relativePathTemplate: '/v1/messages',
      requestContentType: 'application/json',
      streamRequestPolicy: {
        location: 'body',
        field: 'stream',
        requiredValue: true,
        responseProtocol: 'named_sse',
        doneSentinel: 'forbidden',
      },
      continuationFamily: 'ordered_native_content_blocks_with_signatures',
    })
  })

  it('resolves exact Messages, Models and Files endpoints without leaking the beta header', () => {
    const contract = readAnthropicDeveloperApiContractV2()
    expect(resolveAnthropicDeveloperApiEndpointV2(contract, {
      surfaceId: 'anthropic-messages-2023-06-01', operation: 'create_message',
    })).toMatchObject({ method: 'POST', url: 'https://api.anthropic.com/v1/messages' })
    expect(resolveAnthropicDeveloperApiEndpointV2(contract, {
      surfaceId: 'anthropic-models-2023-06-01', operation: 'get_model', resourceId: 'claude-opus-4-8',
    })).toMatchObject({ method: 'GET', url: 'https://api.anthropic.com/v1/models/claude-opus-4-8' })
    const file = resolveAnthropicDeveloperApiEndpointV2(contract, {
      surfaceId: 'anthropic-files-beta-2025-04-14', operation: 'download_file', resourceId: 'file_01:test',
    })
    expect(file).toMatchObject({
      method: 'GET',
      url: 'https://api.anthropic.com/v1/files/file_01%3Atest/content',
      requiredFeatureHeader: { name: 'anthropic-beta', value: 'files-api-2025-04-14' },
    })
    expect(resolveAnthropicDeveloperApiEndpointV2(contract, {
      surfaceId: 'anthropic-models-2023-06-01', operation: 'list_models',
    })).not.toHaveProperty('requiredFeatureHeader')
  })

  it('rejects forged contracts, mismatched operations, unsafe IDs, accessors and extra fields', () => {
    const contract = readAnthropicDeveloperApiContractV2()
    expect(() => resolveAnthropicDeveloperApiEndpointV2({ ...contract }, {
      surfaceId: 'anthropic-messages-2023-06-01', operation: 'create_message',
    })).toThrow('GENERATION_V2_ANTHROPIC_CONTRACT_INVALID')
    expect(() => resolveAnthropicDeveloperApiEndpointV2(contract, {
      surfaceId: 'anthropic-messages-2023-06-01', operation: 'upload_file',
    })).toThrow('GENERATION_V2_ANTHROPIC_ENDPOINT_UNKNOWN')
    for (const resourceId of ['../model', 'models/claude', ' model', 'model\n']) {
      expect(() => resolveAnthropicDeveloperApiEndpointV2(contract, {
        surfaceId: 'anthropic-models-2023-06-01', operation: 'get_model', resourceId,
      })).toThrow('GENERATION_V2_ANTHROPIC_ENDPOINT_INPUT_INVALID')
    }
    expect(() => resolveAnthropicDeveloperApiEndpointV2(contract, Object.defineProperty({
      operation: 'create_message',
    }, 'surfaceId', { enumerable: true, get: () => 'anthropic-messages-2023-06-01' })))
      .toThrow('GENERATION_V2_ANTHROPIC_ENDPOINT_INPUT_INVALID')
    expect(() => resolveAnthropicDeveloperApiEndpointV2(contract, {
      surfaceId: 'anthropic-models-2023-06-01', operation: 'list_models', extra: true,
    })).toThrow('GENERATION_V2_ANTHROPIC_ENDPOINT_INPUT_INVALID')
  })

  it('matches and hashes the committed official-evidence audit projection', () => {
    const contract = readAnthropicDeveloperApiContractV2()
    const artifactPath = path.resolve(
      'docs/architecture/generation-compiler-v2/evidence/anthropic-developer-api-contract-20260715.json',
    )
    const bytes = readFileSync(artifactPath)
    const audit = JSON.parse(bytes.toString('utf8'))
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe('9ff68f8cfd7a7a500ccac5f889f8f6cc5125577a0e550f9839e155ea5bdb5111')
    expect(audit.capturedAt).toBe(contract.evidence.verifiedAt)
    expect(audit.provider).toBe(contract.providerId)
    expect(audit.reviewedWireFacts).toMatchObject({
      origin: contract.apiOrigin,
      apiVersionHeader: contract.apiVersionHeader,
      apiKeyHeader: contract.auth.name,
    })
    expect(contract.evidence.provenanceUrls).toEqual(expect.arrayContaining([
      audit.officialEvidence.apiOverview,
      audit.officialEvidence.versioning,
      audit.officialEvidence.messagesCreate,
      audit.officialEvidence.streamingMessages,
      audit.officialEvidence.models,
      audit.officialEvidence.filesBeta,
      audit.officialEvidence.filesGuide,
    ]))
  })
})
