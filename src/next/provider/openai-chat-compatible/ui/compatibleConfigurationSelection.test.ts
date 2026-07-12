import { describe, expect, it } from 'vitest'
import { buildCompatibleConfigurationSelectionKey, compatibleConfigurationSelectionSchema } from './compatibleConfigurationSelection'

const selection = compatibleConfigurationSelectionSchema.parse({
  kind: 'openai_chat_compatible_configuration' as const,
  providerInstanceId: 'ocp_provider_12345678', providerName: 'First', modelId: 'same-model',
  endpointRevisionId: 'ocp_endpoint_12345678', credentialVersionRef: 'ocp_credential_12345678',
  requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1,
  responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1,
  reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1,
  inlinePolicyId: 'ocp_inline_policy_12345678', inlinePolicyVersion: 1,
})

describe('compatible configuration selection', () => {
  it('carries every immutable route identity without becoming a runtime provider key', () => {
    expect(compatibleConfigurationSelectionSchema.parse(selection)).toEqual(selection)
    expect(buildCompatibleConfigurationSelectionKey(selection)).toBe('ocp_provider_12345678::same-model::ocp_endpoint_12345678')
  })

  it('keeps identical model IDs isolated by provider instance and endpoint revision', () => {
    const other = compatibleConfigurationSelectionSchema.parse({ ...selection, providerInstanceId: 'ocp_provider_87654321', endpointRevisionId: 'ocp_endpoint_87654321' })
    expect(buildCompatibleConfigurationSelectionKey(other)).not.toBe(buildCompatibleConfigurationSelectionKey(selection))
  })
})
