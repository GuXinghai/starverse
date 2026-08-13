import { describe, expect, it } from 'vitest'
import {
  LOCAL_PROVIDER_ROUTE_DESCRIPTORS,
  decodeLocalEndpointExecutionProviderId,
  decodeLocalEndpointProtocolV2,
  requireLocalProviderRouteDescriptorForRouteKind,
  requireLocalProviderRouteDescriptorForRuntimeProvider,
} from './localProviderRouteDescriptor'

describe('LocalProviderRouteDescriptor', () => {
  it('is the exact three-row current-route inter-domain mapping', () => {
    expect(LOCAL_PROVIDER_ROUTE_DESCRIPTORS).toEqual([
      { runtimeProviderId: 'lm_studio', routeKind: 'lmstudio_openresponses', executionProviderId: 'lmstudio', protocolContractId: 'lmstudio-openresponses' },
      { runtimeProviderId: 'ollama_local', routeKind: 'ollama_chat', executionProviderId: 'ollama', protocolContractId: 'ollama-chat-v1' },
      { runtimeProviderId: 'local_endpoint', routeKind: 'generic_local_openai_chat', executionProviderId: 'generic_local', protocolContractId: 'generic-local-openai-chat-completions' },
    ])
    for (const descriptor of LOCAL_PROVIDER_ROUTE_DESCRIPTORS) {
      expect(requireLocalProviderRouteDescriptorForRuntimeProvider(descriptor.runtimeProviderId)).toBe(descriptor)
      expect(requireLocalProviderRouteDescriptorForRouteKind(descriptor.routeKind)).toBe(descriptor)
    }
  })

  it('rejects aliases, fallback spellings, and arbitrary strings', () => {
    for (const value of ['lm_studio', 'ollama_local', 'local_endpoint', 'lm-studio', 'generic-local', 'other']) {
      expect(() => decodeLocalEndpointExecutionProviderId(value)).toThrow('GENERATION_V2_LOCAL_PROVIDER_ROUTE_DESCRIPTOR_INVALID')
    }
    for (const value of ['lmstudio_openresponses', 'ollama_chat', 'generic_local_openai_chat', 'ollama-chat', 'other']) {
      expect(() => decodeLocalEndpointProtocolV2(value)).toThrow('GENERATION_V2_LOCAL_PROVIDER_ROUTE_DESCRIPTOR_INVALID')
    }
  })
})
