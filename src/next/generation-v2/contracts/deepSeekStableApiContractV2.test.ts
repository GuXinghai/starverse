import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isDeepSeekStableApiContractV2,
  readDeepSeekStableApiContractV2,
  readDeepSeekStableChatRegistrySurfaceV2,
  resolveDeepSeekStableApiEndpointV2,
} from './deepSeekStableApiContractV2'

describe('Generation V2 DeepSeek stable provider-family contract', () => {
  it('owns exact stable origin, auth, Chat and Models without v1 or beta fallback', () => {
    const contract = readDeepSeekStableApiContractV2()
    expect(contract).toMatchObject({
      classification: 'reviewed_provider_family_definition',
      executionAuthority: 'none',
      implementationStatus: 'definition_only',
      providerId: 'deepseek',
      contractFamilyId: 'deepseek-stable-api-v1',
      apiOrigin: 'https://api.deepseek.com',
      auth: { kind: 'header', name: 'Authorization', scheme: 'Bearer' },
      betaPolicy: { stableMayUseBetaOrigin: false, automaticSwitch: 'forbidden' },
    })
    expect(contract.surfaces.map((surface) => [surface.surfaceId, surface.relativePathTemplate])).toEqual([
      ['deepseek-stable-chat-v1', '/chat/completions'],
      ['deepseek-stable-models-v1', '/models'],
    ])
    expect(JSON.stringify(contract)).not.toContain('/v1')
    expect(JSON.stringify(contract)).not.toContain('/beta')
    expect(Object.isFrozen(contract)).toBe(true)
    expect(isDeepSeekStableApiContractV2({ ...contract })).toBe(false)
  })

  it('resolves only the exact stable surfaces and preserves the Chat stream contract', () => {
    const contract = readDeepSeekStableApiContractV2()
    expect(resolveDeepSeekStableApiEndpointV2(contract, { surfaceId: 'deepseek-stable-chat-v1' })).toEqual({
      surface: contract.surfaces[0], method: 'POST', url: 'https://api.deepseek.com/chat/completions',
    })
    expect(resolveDeepSeekStableApiEndpointV2(contract, { surfaceId: 'deepseek-stable-models-v1' })).toEqual({
      surface: contract.surfaces[1], method: 'GET', url: 'https://api.deepseek.com/models',
    })
    expect(readDeepSeekStableChatRegistrySurfaceV2()).toMatchObject({
      kind: 'deepseek_stable_chat',
      streamRequestPolicy: {
        location: 'body', field: 'stream', requiredValue: true,
        responseProtocol: 'data_only_sse', doneSentinel: 'required',
      },
      continuationFamily: 'ordered_native_chat_messages_with_reasoning_and_tools',
    })
  })

  it('rejects forged contracts, unknown surfaces, accessors and extra input', () => {
    const contract = readDeepSeekStableApiContractV2()
    expect(() => resolveDeepSeekStableApiEndpointV2({ ...contract }, { surfaceId: 'deepseek-stable-chat-v1' }))
      .toThrow('GENERATION_V2_DEEPSEEK_CONTRACT_INVALID')
    expect(() => resolveDeepSeekStableApiEndpointV2(contract, { surfaceId: 'deepseek-stable-chat-v1', path: '/v1' }))
      .toThrow('GENERATION_V2_DEEPSEEK_ENDPOINT_INPUT_INVALID')
    expect(() => resolveDeepSeekStableApiEndpointV2(contract, { surfaceId: 'deepseek-beta-chat-v1' }))
      .toThrow('GENERATION_V2_DEEPSEEK_ENDPOINT_UNKNOWN')
    expect(() => resolveDeepSeekStableApiEndpointV2(contract, Object.defineProperty({}, 'surfaceId', {
      enumerable: true, get: () => 'deepseek-stable-chat-v1',
    }))).toThrow('GENERATION_V2_DEEPSEEK_ENDPOINT_INPUT_INVALID')
  })

  it('binds the committed official-evidence projection', () => {
    const contract = readDeepSeekStableApiContractV2()
    const bytes = readFileSync(path.resolve(
      'docs/architecture/generation-compiler-v2/evidence/deepseek-stable-api-contract-20260715.json',
    ))
    const audit = JSON.parse(bytes.toString('utf8'))
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe('0022edabf76e51ce88fc6d45310ad889b8a84fd037c72c287944449ba8a42cc7')
    expect(audit.capturedAt).toBe(contract.evidence.verifiedAt)
    expect(audit.provider).toBe(contract.providerId)
    expect(audit.reviewedWireFacts.origin).toBe(contract.apiOrigin)
    expect(contract.evidence.provenanceUrls).toEqual(expect.arrayContaining(Object.values(audit.officialEvidence)))
    expect(audit.openApiSha256).toBeNull()
  })
})
