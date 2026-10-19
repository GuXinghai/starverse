import { describe, expect, it } from 'vitest'
import {
  listApiRequestBodyContractsV2,
  readApiRequestBodyContractV2,
  readLegacyAnthropicMessagesBodyRequestContractV2,
  validateApiRequestBodyV2,
  ApiRequestBodyContractV2Error,
} from '../../../core/generation-v2/contracts/apiRequestBodyContractV2'
import {
  readEndpointTransportDefinitionV2,
  listEndpointTransportDefinitionsV2,
  readEndpointTransportDefinitionByRevisionV2,
} from '../../../core/generation-v2/contracts/endpointTransportDefinitionV2'
import {
  getAnthropicLegacyThinkingEncoderRevisionV2,
  getAnthropicLegacyBodyEncoderRevisionV2,
  listEncodingCoverageRegistriesV2,
  resolveEncodingCoverageRegistryV2,
} from '../../../core/generation-v2/capability/encodingCoverageRegistryV2'

const bodyByProtocol: Readonly<Record<string, unknown>> = Object.freeze({
  'openrouter-images-v1': {
    model: 'test/image-model', prompt: 'draw a blue square',
    provider: { only: ['test-provider'], allow_fallbacks: false, options: {} },
  },
  'openrouter-chat-completions-v1': {
    model: 'test/chat-model', messages: [{ role: 'user', content: 'hello' }], stream: true,
    stream_options: { include_usage: true }, temperature: 25,
  },
  'gemini-generate-content-v1beta': {
    contents: [{ role: 'user', parts: [{ text: 'hello' }] }], generationConfig: { temperature: 25 },
  },
  'gemini-interactions-v1beta': {
    model: 'test-image-model', input: 'draw a blue square',
    response_format: { type: 'image', mime_type: 'image/jpeg' }, stream: true, store: false,
    generation_config: { temperature: 25 },
  },
  'anthropic-messages-2023-06-01': {
    model: 'test-model', messages: [{ role: 'user', content: 'hello' }], max_tokens: 2_000_000, stream: true,
    temperature: 25,
  },
  'deepseek-stable-chat-v1': {
    model: 'test-model', messages: [{ role: 'user', content: 'hello' }], stream: true,
    stream_options: { include_usage: true }, thinking: { type: 'disabled' }, temperature: 25,
  },
  'openai-responses-v1': {
    model: 'test-model', input: [{ role: 'user', content: [{ type: 'input_text', text: 'hello' }] }],
    stream: true, store: false, include: ['reasoning.encrypted_content'], temperature: 25,
  },
  'generic-local-openai-chat-completions': {
    model: 'test-model', messages: [{ role: 'user', content: 'hello' }], stream: true,
    stream_options: { include_usage: true }, temperature: 25,
  },
  'ollama-chat-v1': {
    model: 'test-model', messages: [{ role: 'user', content: 'hello' }], stream: true,
    options: { temperature: 25 },
  },
  'lmstudio-openresponses': {
    model: 'test-model', input: [{ role: 'user', content: 'hello' }], stream: true, store: false,
    temperature: 25,
  },
  'openai_chat_compatible': {
    model: 'test-model', messages: [{ role: 'user', content: 'hello' }], stream: true, temperature: 25,
  },
})

describe('API request body and endpoint transport contract split', () => {
  it('validates positive wire shapes for every protocol operation without enforcing model numeric policy', () => {
    const contracts = listApiRequestBodyContractsV2()
    expect(contracts).toHaveLength(17)
    expect(new Set(contracts.map((contract) => contract.protocolContractId)).size).toBe(11)
    for (const contract of contracts) {
      const body = bodyByProtocol[contract.protocolContractId]
      expect(body, contract.protocolContractId).toBeDefined()
      expect(contract.validateBody(body), `${contract.protocolContractId}/${contract.operation}`).toEqual(body)
      expect(validateApiRequestBodyV2(contract.providerId, contract.operation, body, contract.bodySchemaRevision))
        .toEqual(body)
    }
  })

  it('rejects wrong protocol structure, closed-field drift, unsafe numbers, and stale body schema refs', () => {
    const contract = readApiRequestBodyContractV2('google_ai_studio', 'text')
    const valid = bodyByProtocol[contract.protocolContractId] as Record<string, unknown>
    expect(() => contract.validateBody({ ...valid, undocumentedField: true })).toThrow(ApiRequestBodyContractV2Error)
    expect(() => contract.validateBody({ ...valid, contents: [{ role: 'system', parts: [{ text: 'bad role' }] }] }))
      .toThrow(ApiRequestBodyContractV2Error)
    expect(() => contract.validateBody({ ...valid, generationConfig: { temperature: Number.POSITIVE_INFINITY } }))
      .toThrow(ApiRequestBodyContractV2Error)
    expect(() => validateApiRequestBodyV2('google_ai_studio', 'text', valid, 'api-body-v1:stale'))
      .toThrow(ApiRequestBodyContractV2Error)
    expect(validateApiRequestBodyV2('google_ai_studio', 'text', valid)).toBe(valid)
  })

  it('requires Anthropic budget_tokens structurally only when thinking.type is enabled', () => {
    const contract = readApiRequestBodyContractV2('anthropic', 'text')
    const legacy = readLegacyAnthropicMessagesBodyRequestContractV2('text')
    const base = bodyByProtocol['anthropic-messages-2023-06-01'] as Record<string, unknown>
    const enabledWithoutBudget = { ...base, thinking: { type: 'enabled' } }
    expect(() => contract.validateBody(enabledWithoutBudget)).toThrow(ApiRequestBodyContractV2Error)
    expect(legacy.bodySchemaRevision).not.toBe(contract.bodySchemaRevision)
    expect(readApiRequestBodyContractV2('anthropic', 'text', legacy.bodySchemaRevision)).toEqual(legacy)
    expect(legacy.validateBody(enabledWithoutBudget)).toMatchObject({ thinking: { type: 'enabled' } })
    expect(contract.validateBody({ ...base, thinking: { type: 'enabled', budget_tokens: 0 } }))
      .toMatchObject({ thinking: { type: 'enabled', budget_tokens: 0 } })
    expect(contract.validateBody({ ...base, thinking: { type: 'adaptive' } })).toMatchObject({ thinking: { type: 'adaptive' } })
    expect(contract.validateBody({ ...base, thinking: { type: 'disabled' } })).toMatchObject({ thinking: { type: 'disabled' } })
  })

  it('gives each operation independent body and transport refs and resolves transport refs exactly', () => {
    const bodyContracts = listApiRequestBodyContractsV2()
    const transports = listEndpointTransportDefinitionsV2()
    expect(transports).toHaveLength(bodyContracts.length)
    for (const bodyContract of bodyContracts) {
      const transport = transports.find((candidate) => candidate.providerId === bodyContract.providerId &&
        candidate.operation === bodyContract.operation)
      expect(transport).toBeDefined()
      expect(transport!.transportRevision).toMatch(/^endpoint-transport-v1:/u)
      expect(transport!.transportRevision).not.toBe(bodyContract.bodySchemaRevision)
      expect(readApiRequestBodyContractV2(bodyContract.providerId, bodyContract.operation, bodyContract.bodySchemaRevision))
        .toEqual(bodyContract)
      expect(readEndpointTransportDefinitionV2(transport!.providerId, transport!.operation, transport!.transportRevision))
        .toEqual(transport)
      expect(readEndpointTransportDefinitionByRevisionV2(bodyContract.providerId, transport!.transportRevision))
        .toEqual(transport)
    }
    for (const protocolId of new Set(bodyContracts.map((contract) => contract.protocolContractId))) {
      const revisions = bodyContracts.filter((contract) => contract.protocolContractId === protocolId)
      if (revisions.length > 1) expect(new Set(revisions.map((contract) => contract.bodySchemaRevision)).size).toBe(revisions.length)
    }
    const geminiContentTransport = transports.find((transport) => transport.protocolContractId === 'gemini-generate-content-v1beta')!
    expect(readEndpointTransportDefinitionByRevisionV2('google_ai_studio', geminiContentTransport.transportRevision).streamPolicy)
      .toMatchObject({ location: 'path', field: 'streamGenerateContent' })
    expect(transports.find((transport) => transport.protocolContractId === 'openrouter-images-v1')?.streamPolicy.requiredValue)
      .toBeUndefined()
  })

  it('selects the new independent encoder by default and keeps a frozen v2 revision explicitly readable', () => {
    const current = listEncodingCoverageRegistriesV2().find((registry) => registry.protocolContractId === 'anthropic-messages-2023-06-01' &&
      registry.operation === 'text')!
    expect(current.encoderRevision).toMatch(/^encoder-v3:/u)
    expect(current.bodySchemaRevision).toBe(readApiRequestBodyContractV2('anthropic', 'text').bodySchemaRevision)
    const legacyRevision = getAnthropicLegacyThinkingEncoderRevisionV2('text')
    const historical = resolveEncodingCoverageRegistryV2({ providerId: 'anthropic',
      protocolContractId: 'anthropic-messages-2023-06-01', operation: 'text', encoderRevision: legacyRevision })
    expect(historical.encoderRevision).toBe(legacyRevision)
    expect(historical.bodySchemaRevision).toBeUndefined()
    expect(historical.transportRevision).toBeUndefined()
  })

  it('keeps the pre-budget-required Anthropic body and encoder-v3 revisions readable per operation', () => {
    for (const operation of ['text', 'tool_continue'] as const) {
      const legacyBody = readLegacyAnthropicMessagesBodyRequestContractV2(operation)
      const legacyEncoderRevision = getAnthropicLegacyBodyEncoderRevisionV2(operation)
      const historical = resolveEncodingCoverageRegistryV2({ providerId: 'anthropic',
        protocolContractId: 'anthropic-messages-2023-06-01', operation, encoderRevision: legacyEncoderRevision })
      expect(legacyEncoderRevision).toMatch(/^encoder-v3:/u)
      expect(historical.bodySchemaRevision).toBe(legacyBody.bodySchemaRevision)
      expect(historical.transportRevision).toBe(readEndpointTransportDefinitionV2('anthropic', operation).transportRevision)
    }
  })
})
