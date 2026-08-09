import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isOpenAIResponsesApiContractV2,
  readOpenAIResponsesApiContractV2,
  resolveOpenAIResponsesApiEndpointV2,
} from './openAIResponsesApiContractV2'

describe('Generation V2 OpenAI Responses API provider-family contract', () => {
  it('owns the direct API origin, Bearer auth and three independent zero-authority surfaces', () => {
    const contract = readOpenAIResponsesApiContractV2()
    expect(contract).toMatchObject({
      classification: 'reviewed_provider_family_definition',
      executionAuthority: 'none',
      implementationStatus: 'definition_only',
      providerId: 'openai_responses',
      contractFamilyId: 'openai-api-v1',
      apiOrigin: 'https://api.openai.com',
      auth: { kind: 'bearer_header', name: 'Authorization', scheme: 'Bearer' },
    })
    expect(contract.surfaces.map((surface) => [surface.surfaceId, surface.codecKind])).toEqual([
      ['openai-responses-v1', 'openai_responses_v1'],
      ['openai-models-v1', 'openai_models_v1'],
      ['openai-files-v1', 'openai_files_v1'],
    ])
    expect(Object.isFrozen(contract)).toBe(true)
    expect(Object.isFrozen(contract.auth)).toBe(true)
    expect(Object.isFrozen(contract.surfaces)).toBe(true)
    expect(contract.surfaces.every(Object.isFrozen)).toBe(true)
    expect(isOpenAIResponsesApiContractV2({ ...contract })).toBe(false)
  })

  it('freezes the Owner-selected client-managed native-item continuation contract', () => {
    const responses = readOpenAIResponsesApiContractV2().surfaces[0]
    if (responses.surfaceId !== 'openai-responses-v1') throw new Error('unexpected Responses surface order')
    expect(responses).toEqual({
      surfaceId: 'openai-responses-v1',
      codecKind: 'openai_responses_v1',
      endpointOperation: 'create_response',
      method: 'POST',
      relativePathTemplate: '/v1/responses',
      requestContentType: 'application/json',
      streamRequestPolicy: {
        location: 'body',
        field: 'stream',
        requiredValue: true,
        responseProtocol: 'typed_sse',
        doneSentinel: 'forbidden',
        terminalAuthority: 'response_terminal_event',
      },
      approvedReasoningRequestFields: ['effort', 'summary', 'mode', 'context'],
      contextManagementStatus: 'approved',
      continuationPolicy: {
        mode: 'client_managed_native_items',
        store: false,
        requiredInclude: ['reasoning.encrypted_content'],
        legacyCompatibleInclude: ['reasoning.encrypted_content'],
        forbiddenRequestFields: ['previous_response_id', 'conversation'],
        replayPolicy: 'complete_ordered_output_items',
        assistantMessagePhasePolicy: 'preserve_when_present',
      },
    })
    expect(JSON.stringify(responses)).not.toMatch(/reasoning_context|reasoning_mode/u)
    expect(Object.isFrozen(responses.streamRequestPolicy)).toBe(true)
    expect(Object.isFrozen(responses.approvedReasoningRequestFields)).toBe(true)
    expect(Object.isFrozen(responses.continuationPolicy)).toBe(true)
    expect(Object.isFrozen(responses.continuationPolicy.requiredInclude)).toBe(true)
    expect(Object.isFrozen(responses.continuationPolicy.legacyCompatibleInclude)).toBe(true)
    expect(Object.isFrozen(responses.continuationPolicy.forbiddenRequestFields)).toBe(true)
  })

  it('resolves exact Responses, Models and Files endpoints', () => {
    const contract = readOpenAIResponsesApiContractV2()
    expect(resolveOpenAIResponsesApiEndpointV2(contract, {
      surfaceId: 'openai-responses-v1', operation: 'create_response',
    })).toMatchObject({ method: 'POST', url: 'https://api.openai.com/v1/responses' })
    expect(resolveOpenAIResponsesApiEndpointV2(contract, {
      surfaceId: 'openai-models-v1', operation: 'list_models',
    })).toMatchObject({ method: 'GET', url: 'https://api.openai.com/v1/models' })
    expect(resolveOpenAIResponsesApiEndpointV2(contract, {
      surfaceId: 'openai-models-v1', operation: 'get_model', resourceId: 'gpt-5.4:locked',
    })).toMatchObject({ method: 'GET', url: 'https://api.openai.com/v1/models/gpt-5.4%3Alocked' })
    expect(resolveOpenAIResponsesApiEndpointV2(contract, {
      surfaceId: 'openai-files-v1', operation: 'upload_file',
    })).toMatchObject({ method: 'POST', url: 'https://api.openai.com/v1/files' })
    expect(resolveOpenAIResponsesApiEndpointV2(contract, {
      surfaceId: 'openai-files-v1', operation: 'download_file', resourceId: 'file-abc_123',
    })).toMatchObject({ method: 'GET', url: 'https://api.openai.com/v1/files/file-abc_123/content' })
  })

  it('rejects forged contracts, mismatched operations, unsafe IDs, accessors, symbols and extras', () => {
    const contract = readOpenAIResponsesApiContractV2()
    expect(() => resolveOpenAIResponsesApiEndpointV2({ ...contract }, {
      surfaceId: 'openai-responses-v1', operation: 'create_response',
    })).toThrow('GENERATION_V2_OPENAI_CONTRACT_INVALID')
    expect(() => resolveOpenAIResponsesApiEndpointV2(contract, {
      surfaceId: 'openai-responses-v1', operation: 'upload_file',
    })).toThrow('GENERATION_V2_OPENAI_ENDPOINT_UNKNOWN')
    expect(() => resolveOpenAIResponsesApiEndpointV2(contract, {
      surfaceId: 'openai-files-v1', operation: 'download_file',
    })).toThrow('GENERATION_V2_OPENAI_ENDPOINT_INPUT_INVALID')
    for (const resourceId of ['../model', 'models/gpt-5', ' model', 'model\n']) {
      expect(() => resolveOpenAIResponsesApiEndpointV2(contract, {
        surfaceId: 'openai-models-v1', operation: 'get_model', resourceId,
      })).toThrow('GENERATION_V2_OPENAI_ENDPOINT_INPUT_INVALID')
    }
    expect(() => resolveOpenAIResponsesApiEndpointV2(contract, Object.defineProperty({
      operation: 'create_response',
    }, 'surfaceId', { enumerable: true, get: () => 'openai-responses-v1' })))
      .toThrow('GENERATION_V2_OPENAI_ENDPOINT_INPUT_INVALID')
    expect(() => resolveOpenAIResponsesApiEndpointV2(contract, {
      surfaceId: 'openai-models-v1', operation: 'list_models', extra: true,
    })).toThrow('GENERATION_V2_OPENAI_ENDPOINT_INPUT_INVALID')
    expect(() => resolveOpenAIResponsesApiEndpointV2(contract, {
      surfaceId: 'openai-models-v1', operation: 'list_models', [Symbol('extra')]: true,
    })).toThrow('GENERATION_V2_OPENAI_ENDPOINT_INPUT_INVALID')
  })

  it('matches the committed official-reference audit projection', () => {
    const contract = readOpenAIResponsesApiContractV2()
    const artifactPath = path.resolve(
      'docs/architecture/generation-compiler-v2/evidence/openai-responses-api-contract-20260715.json',
    )
    const bytes = readFileSync(artifactPath)
    const audit = JSON.parse(bytes.toString('utf8'))
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe('7b1573bccdba903ea8dd20f89550fdbbc0e08e231a887a1ee88e10fe634f9e25')
    expect(audit.capturedAt).toBe(contract.evidence.verifiedAt)
    expect(audit.provider).toBe(contract.providerId)
    expect(audit.reviewedWireFacts).toMatchObject({
      origin: contract.apiOrigin,
      authentication: { header: contract.auth.name, scheme: contract.auth.scheme },
      responses: {
        method: 'POST',
        path: '/v1/responses',
      approvedReasoningRequestFields: ['effort', 'summary', 'mode', 'context'],
      },
    })
    expect(contract.evidence.provenanceUrls).toEqual(expect.arrayContaining(
      Object.values(audit.officialEvidence),
    ))
  })

  it('enters only the reviewed V2 registry and no legacy execution path', () => {
    const contractSource = readFileSync(path.resolve(
      'src/next/generation-v2/contracts/openAIResponsesApiContractV2.ts',
    ), 'utf8')
    const registrySource = readFileSync(path.resolve(
      'src/next/generation-v2/contracts/providerContractRegistryV2.ts',
    ), 'utf8')
    const legacySources = [
      'electron/ipc/openAIResponsesTextChatIpc.ts',
      'src/next/provider/openai-responses/openaiResponsesAdapter.ts',
      'src/next/provider/openai-responses/openaiResponsesRequestBuilder.ts',
    ]

    expect(contractSource).not.toMatch(/\bfetch\s*\(|net\.request|ipcMain/u)
    expect(contractSource).not.toMatch(/conversationFamily/u)
    expect(registrySource).toContain('openAIResponsesApiContractV2')
    expect(legacySources.every((file) => !existsSync(path.resolve(file)))).toBe(true)
  })
})
