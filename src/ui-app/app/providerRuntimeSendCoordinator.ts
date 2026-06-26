import { streamLocalEndpointTextChatAsDomainEvents } from '@/next/live/localEndpointTextChat'
import { streamOpenAIResponsesTextChatAsDomainEvents } from '@/next/live/openAIResponsesTextChat'
import { streamGoogleAIStudioTextChatAsDomainEvents } from '@/next/live/googleAIStudioTextChat'
import { streamAnthropicTextChatAsDomainEvents } from '@/next/live/anthropicTextChat'
import { streamDeepSeekTextChatAsDomainEvents } from '@/next/live/deepSeekTextChat'
import {
  getRuntimeTextChatBlockReason,
  resolveRuntimeTextSendRoute,
  type CurrentRuntimeSelection,
  type RuntimeCapabilitySummaryLite,
  type RuntimeProviderKey,
  type RuntimeTextChatSessionConfigLite,
  type RuntimeTextSendRoute,
} from '@/next/provider/runtimeSelection'
import type { ReasoningArtifactProvider } from '@/next/provider/reasoningArtifact'
import type { DomainEvent } from '@/next/state/types'

export type ExperimentalRuntimeTextProviderKey = Exclude<RuntimeProviderKey, 'openrouter'>

export type ProviderRuntimeTextSendPreflightInput = Readonly<{
  selection: CurrentRuntimeSelection
  capability: RuntimeCapabilitySummaryLite
  text: string
  hasDraftAttachments: boolean
  sessionConfig: RuntimeTextChatSessionConfigLite
}>

export type ProviderRuntimeTextSendPreflightResult =
  | Readonly<{ ok: true; route: Exclude<RuntimeTextSendRoute, { kind: 'none' }> }>
  | Readonly<{ ok: false; reason: string }>

export type ExperimentalRuntimeTextModelIds = Readonly<{
  localEndpoint: string
  openAIResponses: string
  googleAIStudio: string
  anthropic: string
  deepSeek: string
}>

export type ExperimentalRuntimeTextEventInput = Readonly<{
  providerKey: ExperimentalRuntimeTextProviderKey
  requestId: string
  assistantMessageId: string
  modelId: string
  userText: string
  contextMessages: any[]
  signal: AbortSignal
  localEndpointUrl?: string
}>

export function resolveProviderRuntimeTextSendPreflight(
  input: ProviderRuntimeTextSendPreflightInput
): ProviderRuntimeTextSendPreflightResult {
  const runtimeBlockReason = getRuntimeTextChatBlockReason({
    selection: input.selection,
    capability: input.capability,
    text: input.text,
    hasDraftAttachments: input.hasDraftAttachments,
    sessionConfig: input.sessionConfig,
  })
  if (runtimeBlockReason) return { ok: false, reason: runtimeBlockReason }

  const route = resolveRuntimeTextSendRoute(input.selection)
  if (route.kind === 'none') return { ok: false, reason: route.reason }
  return { ok: true, route }
}

export function isExperimentalRuntimeTextProviderKey(
  providerKey: RuntimeProviderKey
): providerKey is ExperimentalRuntimeTextProviderKey {
  return providerKey !== 'openrouter'
}

export function getExperimentalRuntimeTextRequestPrefix(providerKey: ExperimentalRuntimeTextProviderKey): string {
  switch (providerKey) {
    case 'local_endpoint':
      return 'local_req'
    case 'openai_responses':
      return 'openai_responses_req'
    case 'google_ai_studio':
      return 'google_ai_studio_req'
    case 'anthropic_messages':
      return 'anthropic_req'
    case 'deepseek':
      return 'deepseek_req'
  }
}

export function getExperimentalRuntimeTextModelId(
  providerKey: ExperimentalRuntimeTextProviderKey,
  modelIds: ExperimentalRuntimeTextModelIds
): string {
  switch (providerKey) {
    case 'local_endpoint':
      return modelIds.localEndpoint.trim()
    case 'openai_responses':
      return modelIds.openAIResponses.trim()
    case 'google_ai_studio':
      return modelIds.googleAIStudio.trim()
    case 'anthropic_messages':
      return modelIds.anthropic.trim()
    case 'deepseek':
      return modelIds.deepSeek.trim()
  }
}

export function getExperimentalRuntimeTextReasoningArtifactProvider(
  providerKey: ExperimentalRuntimeTextProviderKey
): ReasoningArtifactProvider | undefined {
  switch (providerKey) {
    case 'local_endpoint':
      return undefined
    case 'openai_responses':
      return 'openai_responses'
    case 'google_ai_studio':
      return 'google_ai_studio'
    case 'anthropic_messages':
      return 'anthropic_messages'
    case 'deepseek':
      return 'deepseek'
  }
}

export function createExperimentalRuntimeTextEvents(
  input: ExperimentalRuntimeTextEventInput
): AsyncIterable<DomainEvent> {
  switch (input.providerKey) {
    case 'local_endpoint':
      return streamLocalEndpointTextChatAsDomainEvents({
        requestId: input.requestId,
        assistantMessageId: input.assistantMessageId,
        endpointUrl: String(input.localEndpointUrl ?? '').trim(),
        model: input.modelId,
        userText: input.userText,
        contextMessages: input.contextMessages,
        signal: input.signal,
      })
    case 'openai_responses':
      return streamOpenAIResponsesTextChatAsDomainEvents({
        requestId: input.requestId,
        assistantMessageId: input.assistantMessageId,
        model: input.modelId,
        userText: input.userText,
        contextMessages: input.contextMessages,
        signal: input.signal,
      })
    case 'google_ai_studio':
      return streamGoogleAIStudioTextChatAsDomainEvents({
        requestId: input.requestId,
        assistantMessageId: input.assistantMessageId,
        model: input.modelId,
        userText: input.userText,
        contextMessages: input.contextMessages,
        signal: input.signal,
      })
    case 'anthropic_messages':
      return streamAnthropicTextChatAsDomainEvents({
        requestId: input.requestId,
        assistantMessageId: input.assistantMessageId,
        model: input.modelId,
        userText: input.userText,
        contextMessages: input.contextMessages,
        signal: input.signal,
      })
    case 'deepseek':
      return streamDeepSeekTextChatAsDomainEvents({
        requestId: input.requestId,
        assistantMessageId: input.assistantMessageId,
        model: input.modelId,
        userText: input.userText,
        contextMessages: input.contextMessages,
        signal: input.signal,
      })
  }
}
