import { describe, expect, it } from 'vitest'
import {
  modelFactsSubjectForCatalogModelV1,
  modelFactsSubjectForCompatibleModelV1,
} from './modelFactsSubjectIdentityV1'

describe('model facts picker subject identity', () => {
  it('uses the explicit catalog and authority binding for native catalog models', () => {
    expect(modelFactsSubjectForCatalogModelV1('openai_responses', 'gpt-5')).toEqual({
      providerAuthorityId: 'openai',
      endpointProfileId: 'openai-api-v1',
      nativeModelId: 'gpt-5',
    })
  })

  it('uses the scoped provider-instance authority for compatible models', () => {
    expect(modelFactsSubjectForCompatibleModelV1('ocp_provider_12345678', 'model-x')).toEqual({
      providerAuthorityId: 'openai-compatible-provider-instance-v1:ocp_provider_12345678',
      endpointProfileId: 'ocp_provider_12345678',
      nativeModelId: 'model-x',
    })
  })

  it('does not create a subject for a provider without an explicit catalog binding', () => {
    expect(modelFactsSubjectForCatalogModelV1('local_endpoint', 'model-x')).toBeNull()
  })
})
