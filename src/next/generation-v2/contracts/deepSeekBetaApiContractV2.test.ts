import { describe, expect, it } from 'vitest'
import {
  isDeepSeekBetaApiContractV2,
  readDeepSeekBetaApiContractV2,
  resolveDeepSeekBetaApiEndpointV2,
} from './deepSeekBetaApiContractV2'

describe('Generation V2 DeepSeek Beta provider-family contract', () => {
  it('is a separate explicitly selected non-executable contract', () => {
    const contract = readDeepSeekBetaApiContractV2()
    expect(contract).toMatchObject({
      executionAuthority: 'none', implementationStatus: 'definition_only',
      contractFamilyId: 'deepseek-beta-api-v1', apiOrigin: 'https://api.deepseek.com/beta',
      selectionPolicy: {
        explicitSelectionRequired: true, stableMaySwitchToBeta: false, runtimeFallback: 'forbidden',
      },
    })
    expect(isDeepSeekBetaApiContractV2({ ...contract })).toBe(false)
  })

  it('resolves only its two beta surfaces and never exposes stable Models', () => {
    const contract = readDeepSeekBetaApiContractV2()
    expect(resolveDeepSeekBetaApiEndpointV2(contract, { surfaceId: 'deepseek-beta-chat-prefix-v1' }).url)
      .toBe('https://api.deepseek.com/beta/chat/completions')
    expect(resolveDeepSeekBetaApiEndpointV2(contract, { surfaceId: 'deepseek-beta-fim-v1' }).url)
      .toBe('https://api.deepseek.com/beta/completions')
    expect(() => resolveDeepSeekBetaApiEndpointV2(contract, { surfaceId: 'deepseek-stable-models-v1' }))
      .toThrow('GENERATION_V2_DEEPSEEK_BETA_ENDPOINT_UNKNOWN')
  })

  it('rejects stable contracts, accessors and caller path overrides', () => {
    const contract = readDeepSeekBetaApiContractV2()
    expect(() => resolveDeepSeekBetaApiEndpointV2({ ...contract }, { surfaceId: 'deepseek-beta-fim-v1' }))
      .toThrow('GENERATION_V2_DEEPSEEK_BETA_CONTRACT_INVALID')
    expect(() => resolveDeepSeekBetaApiEndpointV2(contract, { surfaceId: 'deepseek-beta-fim-v1', path: '/v1' }))
      .toThrow('GENERATION_V2_DEEPSEEK_BETA_ENDPOINT_INPUT_INVALID')
    expect(() => resolveDeepSeekBetaApiEndpointV2(contract, Object.defineProperty({}, 'surfaceId', {
      enumerable: true, get: () => 'deepseek-beta-fim-v1',
    }))).toThrow('GENERATION_V2_DEEPSEEK_BETA_ENDPOINT_INPUT_INVALID')
  })
})
