import { describe, expect, it } from 'vitest'
import {
  buildCompatibleRouteIntentKey,
  compatibleRouteIntentSchema,
  createCompatibleRouteIntent,
} from './compatibleRouteIntent'

describe('compatible route intent', () => {
  it('contains only durable current-intent identity', () => {
    const intent = createCompatibleRouteIntent({
      providerInstanceId: 'ocp_provider_12345678',
      modelId: 'same-model',
    })
    expect(intent).toEqual({
      schemaVersion: 2,
      kind: 'openai_chat_compatible',
      providerInstanceId: 'ocp_provider_12345678',
      modelId: 'same-model',
    })
    expect(buildCompatibleRouteIntentKey(intent)).toBe('ocp_provider_12345678::same-model')
  })

  it.each(['providerName', 'endpointRevisionId', 'credentialVersionRef', 'requestProfileId',
    'responseProfileId', 'reasoningMappingId', 'inlinePolicyId', 'extraBody'])(
    'rejects pinned configuration field %s',
    (field) => {
      expect(compatibleRouteIntentSchema.safeParse({
        schemaVersion: 2,
        kind: 'openai_chat_compatible',
        providerInstanceId: 'ocp_provider_12345678',
        modelId: 'same-model',
        [field]: field === 'extraBody' ? {} : 'legacy-value',
      }).success).toBe(false)
    },
  )

  it('does not decode the old configuration-shaped route', () => {
    expect(compatibleRouteIntentSchema.safeParse({
      schemaVersion: 1,
      kind: 'openai_chat_compatible',
      selection: { providerInstanceId: 'ocp_provider_12345678', modelId: 'same-model' },
    }).success).toBe(false)
  })
})
