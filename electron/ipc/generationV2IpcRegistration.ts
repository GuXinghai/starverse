import type { RegisterInvoke } from './types'
import type { Epoch2CommittedRuntime } from '../data-epoch/epoch2CommittedBootstrap'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { createAnthropicGenerationV2Runtime } from '../services/anthropicGenerationV2Runtime'
import { createDeepSeekGenerationV2Runtime } from '../services/deepSeekGenerationV2Runtime'
import { createGeminiGenerateContentGenerationV2Runtime } from '../services/geminiGenerateContentGenerationV2Runtime'
import { createGeminiInteractionsImageGenerationV2Runtime } from '../services/geminiInteractionsImageGenerationV2Runtime'
import { createOpenAIResponsesGenerationV2Runtime } from '../services/openAIResponsesGenerationV2Runtime'
import { createOpenRouterFirstPartyGenerationV2Runtime } from '../services/openRouterFirstPartyGenerationV2Runtime'
import { registerAnthropicGenerationV2Ipc } from './anthropicGenerationV2Ipc'
import { registerDeepSeekGenerationV2Ipc } from './deepSeekGenerationV2Ipc'
import { registerGeminiGenerationV2Ipc } from './geminiGenerationV2Ipc'
import { registerOpenAIResponsesGenerationV2Ipc } from './openAIResponsesGenerationV2Ipc'
import { registerOpenRouterGenerationV2Ipc } from './openRouterGenerationV2Ipc'
import { registerGenerationV2WorkspaceIpc } from './generationV2WorkspaceIpc'
import { registerLocalEndpointProfileV2Ipc } from './localEndpointProfileV2Ipc'
import { registerLmStudioGenerationV2Ipc } from './lmStudioGenerationV2Ipc'
import { createLmStudioOpenResponsesGenerationV2Runtime } from '../services/lmStudioOpenResponsesGenerationV2Runtime'
import { createGenericLocalOpenAIChatGenerationV2Runtime } from '../services/genericLocalOpenAIChatGenerationV2Runtime'
import { registerGenericLocalGenerationV2Ipc } from './genericLocalGenerationV2Ipc'
import { createOllamaChatGenerationV2Runtime } from '../services/ollamaChatGenerationV2Runtime'
import { registerOllamaGenerationV2Ipc } from './ollamaGenerationV2Ipc'
import { registerGenerationV2ModelAvailabilityIpc } from './generationV2ModelAvailabilityIpc'
import { registerGenerationV2CredentialSettingsIpc } from './generationV2CredentialSettingsIpc'
import { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'
import { registerOpenAICompatibleV2Ipc } from './openAICompatibleV2Ipc'
import { createOpenAIChatCompatibleGenerationV2Runtime } from '../services/openAIChatCompatibleGenerationV2Runtime'
import { registerOpenAICompatibleGenerationV2Ipc } from './openAICompatibleGenerationV2Ipc'
import type { ProviderFetch } from '../net/providerHttpTransport'
import { registerLocalEndpointDiagnosticsV2Ipc } from './localEndpointDiagnosticsIpc'
import { registerLMStudioRuntimeManagementV2Ipc } from './lmStudioLocalProviderIpc'
import { registerOllamaRuntimeManagementV2Ipc } from './ollamaLocalProviderIpc'
import { registerGenerationV2ModelPreferencesIpc } from './generationV2ModelPreferencesIpc'
import { registerGenerationOperationRuntimeV2Ipc } from './generationOperationRuntimeV2Ipc'

/**
 * Epoch-2 registration boundary for every reviewed generation runtime.
 * Each provider/operation keeps explicit IPC channels and an independent typed runtime.
 */
export function registerGenerationV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  epoch2: Epoch2CommittedRuntime
  rawGenerationRequestStore?: RawGenerationRequestStore
  cloudFetch: ProviderFetch
  localDirectFetch: ProviderFetch
  proxyMode: () => 'environment' | 'manual' | 'direct' | 'system'
}>): readonly string[] {
  input.epoch2.assertCurrent()
  const common = Object.freeze({ db: input.epoch2.database,
    credentialService: input.epoch2.credentialService,
    rawGenerationRequestStore: input.rawGenerationRequestStore,
    fetchImpl: input.cloudFetch })
  const runtimeRegistry = new GenerationOperationRuntimeRegistryV2(input.epoch2.database)
  return Object.freeze([
    ...registerGenerationOperationRuntimeV2Ipc({ registerInvoke: input.registerInvoke, runtimeRegistry }),
    ...registerGenerationV2WorkspaceIpc({ registerInvoke: input.registerInvoke, db: input.epoch2.database,
      runtimeRegistry }),
    ...registerGenerationV2ModelPreferencesIpc({ registerInvoke: input.registerInvoke, db: input.epoch2.database }),
    ...registerGenerationV2CredentialSettingsIpc({ registerInvoke: input.registerInvoke,
      credentialService: input.epoch2.credentialService }),
    ...registerGenerationV2ModelAvailabilityIpc({ registerInvoke: input.registerInvoke,
      credentialService: input.epoch2.credentialService, db: input.epoch2.database, fetchImpl: input.cloudFetch }),
    ...registerLocalEndpointDiagnosticsV2Ipc({ registerInvoke: input.registerInvoke,
      fetchImpl: input.localDirectFetch }),
    ...registerLMStudioRuntimeManagementV2Ipc({ registerInvoke: input.registerInvoke,
      fetchImpl: input.localDirectFetch }),
    ...registerOllamaRuntimeManagementV2Ipc({ registerInvoke: input.registerInvoke,
      fetchImpl: input.localDirectFetch }),
    ...registerLocalEndpointProfileV2Ipc({ registerInvoke: input.registerInvoke, db: input.epoch2.database }),
    ...registerOpenAICompatibleV2Ipc({ registerInvoke: input.registerInvoke, db: input.epoch2.database,
      credentialService: input.epoch2.openAICompatibleCredentialService, fetchImpl: input.cloudFetch,
      proxyMode: input.proxyMode }),
    ...registerOpenAICompatibleGenerationV2Ipc({ registerInvoke: input.registerInvoke,
      runtimeRegistry,
      createRuntime: (streamProjectionSink) => createOpenAIChatCompatibleGenerationV2Runtime({ db: input.epoch2.database,
        credentialService: input.epoch2.openAICompatibleCredentialService, rawGenerationRequestStore: input.rawGenerationRequestStore,
        streamProjectionSink, fetchImpl: input.cloudFetch }) }),
    ...registerLmStudioGenerationV2Ipc({ registerInvoke: input.registerInvoke,
      runtimeRegistry,
      createRuntime: (streamProjectionSink) => createLmStudioOpenResponsesGenerationV2Runtime({
        db: input.epoch2.database, rawGenerationRequestStore: input.rawGenerationRequestStore,
        streamProjectionSink, fetchImpl: input.localDirectFetch }) }),
    ...registerGenericLocalGenerationV2Ipc({ registerInvoke: input.registerInvoke,
      runtimeRegistry,
      createRuntime: (streamProjectionSink) => createGenericLocalOpenAIChatGenerationV2Runtime({
        db: input.epoch2.database, rawGenerationRequestStore: input.rawGenerationRequestStore,
        streamProjectionSink, fetchImpl: input.localDirectFetch }) }),
    ...registerOllamaGenerationV2Ipc({ registerInvoke: input.registerInvoke,
      runtimeRegistry,
      createRuntime: (streamProjectionSink) => createOllamaChatGenerationV2Runtime({
        db: input.epoch2.database, rawGenerationRequestStore: input.rawGenerationRequestStore,
        streamProjectionSink, fetchImpl: input.localDirectFetch }) }),
    ...registerOpenRouterGenerationV2Ipc({ registerInvoke: input.registerInvoke,
      runtimeRegistry,
      createRuntime: (streamProjectionSink) => createOpenRouterFirstPartyGenerationV2Runtime({ ...common,
        attachmentBlobStore: input.epoch2.attachmentBlobStore, streamProjectionSink }) }),
    ...registerOpenAIResponsesGenerationV2Ipc({ registerInvoke: input.registerInvoke,
      runtimeRegistry,
      createRuntime: (streamProjectionSink) => createOpenAIResponsesGenerationV2Runtime({ ...common,
        attachmentBlobStore: input.epoch2.attachmentBlobStore, streamProjectionSink }) }),
    ...registerAnthropicGenerationV2Ipc({ registerInvoke: input.registerInvoke,
      runtimeRegistry,
      createRuntime: (streamProjectionSink) => createAnthropicGenerationV2Runtime({ ...common,
        attachmentBlobStore: input.epoch2.attachmentBlobStore,
        streamProjectionSink }) }),
    ...registerDeepSeekGenerationV2Ipc({ registerInvoke: input.registerInvoke,
      runtimeRegistry,
      createRuntime: (streamProjectionSink) => createDeepSeekGenerationV2Runtime({ ...common,
        streamProjectionSink }) }),
    ...registerGeminiGenerationV2Ipc({ registerInvoke: input.registerInvoke,
      runtimeRegistry,
      createRuntime: (streamProjectionSink) => createGeminiGenerateContentGenerationV2Runtime({ ...common,
        attachmentBlobStore: input.epoch2.attachmentBlobStore,
        streamProjectionSink }),
      createInteractionsImageRuntime: (streamProjectionSink) => createGeminiInteractionsImageGenerationV2Runtime({
        ...common, attachmentBlobStore: input.epoch2.attachmentBlobStore,
        streamProjectionSink }) }),
  ])
}
