import type { GenerationExecutionProviderId } from './generationExecutionProviderId'
import {
  requireLocalProviderRouteDescriptorForExecutionProvider,
  type LocalEndpointExecutionProviderId,
} from './localProviderRouteDescriptor'
import type { RuntimeProviderId } from './runtimeProviderId'

const localRuntimeProvider = (providerId: LocalEndpointExecutionProviderId): RuntimeProviderId =>
  requireLocalProviderRouteDescriptorForExecutionProvider(providerId).runtimeProviderId

const GENERATION_EXECUTION_TO_RUNTIME_PROVIDER = Object.freeze({
  openrouter: 'openrouter',
  google_ai_studio: 'google_ai_studio',
  anthropic: 'anthropic_messages',
  deepseek: 'deepseek',
  openai_responses: 'openai_responses',
  generic_local: localRuntimeProvider('generic_local'),
  ollama: localRuntimeProvider('ollama'),
  lmstudio: localRuntimeProvider('lmstudio'),
  openai_compatible: null,
} as const satisfies Readonly<Record<GenerationExecutionProviderId, RuntimeProviderId | null>>)

/** Explicit projection for ordinary provider-model preferences only. */
export function runtimeProviderIdForGenerationExecutionProvider(
  providerId: GenerationExecutionProviderId,
): RuntimeProviderId | null {
  return GENERATION_EXECUTION_TO_RUNTIME_PROVIDER[providerId]
}
