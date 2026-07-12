import { describe, expect, it } from 'vitest'
import {
  compatibleHistoricalRouteLookupSchema,
  compatibleRouteAdditionalChoiceSchema,
  compatibleRoutePrepareIdentitySchema,
  compatibleRouteTransitionSchema,
} from './routeSchemas'

describe('compatible route command schemas', () => {
  it('requires explicit provider/model selection and main-owned route identity', () => {
    const command = {
      routeProvenanceId: 'ocp_route_12345678',
      requestId: 'request-1',
      providerInstanceId: 'ocp_provider_12345678',
      modelId: 'model-a',
      createdAtMs: 1,
    }
    expect(compatibleRoutePrepareIdentitySchema.parse(command)).toEqual(command)
    expect(() => compatibleRoutePrepareIdentitySchema.parse({ ...command, modelId: '' })).toThrow()
    expect(() => compatibleRoutePrepareIdentitySchema.parse({ ...command, endpointRevisionId: 'caller-owned' })).toThrow()
  })

  it('strictly decodes lifecycle, choice and historical lookup commands', () => {
    expect(compatibleRouteTransitionSchema.parse({
      routeProvenanceId: 'ocp_route_12345678',
      targetState: 'streaming',
      atMs: 2,
    })).toBeTruthy()
    expect(() => compatibleRouteAdditionalChoiceSchema.parse({
      routeProvenanceId: 'ocp_route_12345678',
      choiceIndex: 0,
      createdAtMs: 2,
    })).toThrow(/greater than zero/i)
    expect(compatibleHistoricalRouteLookupSchema.parse({
      kind: 'choice_message',
      messageId: 'assistant-1',
    })).toBeTruthy()
    expect(() => compatibleHistoricalRouteLookupSchema.parse({
      kind: 'choice_message',
      messageId: 'assistant-1',
      providerInstanceId: 'ocp_provider_12345678',
    })).toThrow()
  })
})
