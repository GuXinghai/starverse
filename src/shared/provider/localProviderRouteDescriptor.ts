import type { GenerationExecutionProviderId } from './generationExecutionProviderId'
import type { RuntimeProviderId } from './runtimeProviderId'

export type LocalRuntimeProviderId = Extract<
  RuntimeProviderId,
  'lm_studio' | 'ollama_local' | 'local_endpoint'
>

export type LocalEndpointExecutionProviderId = Extract<
  GenerationExecutionProviderId,
  'lmstudio' | 'ollama' | 'generic_local'
>

export type LocalProviderRouteKind =
  | 'lmstudio_openresponses'
  | 'ollama_chat'
  | 'generic_local_openai_chat'

export type LocalEndpointProtocolV2 =
  | 'lmstudio-openresponses'
  | 'lmstudio-openai-chat-completions'
  | 'ollama-chat-v1'
  | 'generic-local-openai-chat-completions'

export type LocalCurrentRouteProtocolV2 = Exclude<
  LocalEndpointProtocolV2,
  'lmstudio-openai-chat-completions'
>

export type LocalProviderRouteDescriptor = Readonly<{
  runtimeProviderId: LocalRuntimeProviderId
  routeKind: LocalProviderRouteKind
  executionProviderId: LocalEndpointExecutionProviderId
  protocolContractId: LocalCurrentRouteProtocolV2
}>

export const LOCAL_PROVIDER_ROUTE_DESCRIPTORS = Object.freeze([
  Object.freeze({
    runtimeProviderId: 'lm_studio',
    routeKind: 'lmstudio_openresponses',
    executionProviderId: 'lmstudio',
    protocolContractId: 'lmstudio-openresponses',
  }),
  Object.freeze({
    runtimeProviderId: 'ollama_local',
    routeKind: 'ollama_chat',
    executionProviderId: 'ollama',
    protocolContractId: 'ollama-chat-v1',
  }),
  Object.freeze({
    runtimeProviderId: 'local_endpoint',
    routeKind: 'generic_local_openai_chat',
    executionProviderId: 'generic_local',
    protocolContractId: 'generic-local-openai-chat-completions',
  }),
] as const satisfies readonly LocalProviderRouteDescriptor[])

const byRuntimeProviderId = new Map<LocalRuntimeProviderId, LocalProviderRouteDescriptor>(
  LOCAL_PROVIDER_ROUTE_DESCRIPTORS.map((descriptor) => [descriptor.runtimeProviderId, descriptor]),
)
const byRouteKind = new Map<LocalProviderRouteKind, LocalProviderRouteDescriptor>(
  LOCAL_PROVIDER_ROUTE_DESCRIPTORS.map((descriptor) => [descriptor.routeKind, descriptor]),
)

export class LocalProviderRouteDescriptorError extends Error {
  constructor(readonly code: 'GENERATION_V2_LOCAL_PROVIDER_ROUTE_DESCRIPTOR_INVALID') {
    super(code)
    this.name = 'LocalProviderRouteDescriptorError'
  }
}

export function isLocalRuntimeProviderId(value: RuntimeProviderId): value is LocalRuntimeProviderId {
  return byRuntimeProviderId.has(value as LocalRuntimeProviderId)
}

export function requireLocalProviderRouteDescriptorForRuntimeProvider(
  providerId: LocalRuntimeProviderId,
): LocalProviderRouteDescriptor {
  const descriptor = byRuntimeProviderId.get(providerId)
  if (!descriptor) throw new LocalProviderRouteDescriptorError('GENERATION_V2_LOCAL_PROVIDER_ROUTE_DESCRIPTOR_INVALID')
  return descriptor
}

export function requireLocalProviderRouteDescriptorForRouteKind(
  routeKind: LocalProviderRouteKind,
): LocalProviderRouteDescriptor {
  const descriptor = byRouteKind.get(routeKind)
  if (!descriptor) throw new LocalProviderRouteDescriptorError('GENERATION_V2_LOCAL_PROVIDER_ROUTE_DESCRIPTOR_INVALID')
  return descriptor
}

export function decodeLocalEndpointExecutionProviderId(value: unknown): LocalEndpointExecutionProviderId {
  if (value !== 'lmstudio' && value !== 'ollama' && value !== 'generic_local') {
    throw new LocalProviderRouteDescriptorError('GENERATION_V2_LOCAL_PROVIDER_ROUTE_DESCRIPTOR_INVALID')
  }
  return value
}

export function decodeLocalEndpointProtocolV2(value: unknown): LocalEndpointProtocolV2 {
  if (value !== 'lmstudio-openresponses' && value !== 'lmstudio-openai-chat-completions' &&
      value !== 'ollama-chat-v1' && value !== 'generic-local-openai-chat-completions') {
    throw new LocalProviderRouteDescriptorError('GENERATION_V2_LOCAL_PROVIDER_ROUTE_DESCRIPTOR_INVALID')
  }
  return value
}

export function isLocalEndpointProtocolCompatible(
  providerId: LocalEndpointExecutionProviderId,
  protocolContractId: LocalEndpointProtocolV2,
): boolean {
  return providerId === 'lmstudio'
    ? protocolContractId === 'lmstudio-openresponses' || protocolContractId === 'lmstudio-openai-chat-completions'
    : providerId === 'ollama'
      ? protocolContractId === 'ollama-chat-v1'
      : protocolContractId === 'generic-local-openai-chat-completions'
}
