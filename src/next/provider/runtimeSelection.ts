export type RuntimeProviderKey =
  | 'openrouter'
  | 'openai_responses'
  | 'google_ai_studio'
  | 'anthropic_messages'
  | 'deepseek'
  | 'lm_studio'
  | 'ollama_local'
  | 'local_endpoint'

export type RuntimeCredentialStatus = 'configured' | 'missing' | 'not_required' | 'unknown'

export type CurrentRuntimeSelection =
  | Readonly<{
      state: 'unset'
      source: 'unset'
    }>
  | Readonly<{
      state: 'selected'
      providerKey: RuntimeProviderKey
      endpointId: string
      profileId: string
      modelKey?: string | null
      nativeModelId?: string | null
      source: 'explicit_user_selection' | 'legacy_experimental_flag'
      mode: 'production' | 'experimental'
      credentialStatus?: RuntimeCredentialStatus
    }>

export type RuntimeCapabilitySummaryLite = Readonly<{
  textChat: boolean
  streamingText: boolean | 'probe_required'
  attachments: 'supported' | 'blocked' | 'unknown'
  webSearch: 'supported' | 'blocked' | 'unknown'
  tools: 'supported' | 'blocked' | 'unknown'
  reasoningArtifacts: 'supported' | 'filtered' | 'blocked' | 'unknown'
  imageGeneration: 'supported' | 'blocked' | 'unknown'
  structuredOutput: 'supported' | 'blocked' | 'unknown'
  usageFinal: 'supported' | 'not_guaranteed' | 'unknown'
  source:
    | 'openrouter_existing'
    | 'native_profile'
    | 'catalog_seed'
    | 'local_probe'
    | 'lm_studio_local'
    | 'ollama_local'
    | 'experimental_image_inline'
    | 'experimental_text_only'
    | 'unset'
  warnings: string[]
}>

export type RuntimeTextSendRoute =
  | Readonly<{ kind: 'none'; reason: string }>
  | Readonly<{ kind: 'openrouter_existing' }>
  | Readonly<{ kind: 'experimental_text'; providerKey: RuntimeProviderKey }>

type RuntimeSelectionProviderInput = Readonly<{
  selected?: boolean
  endpointId?: unknown
  profileId?: unknown
  modelKey?: unknown
  nativeModelId?: unknown
  credentialStatus?: RuntimeCredentialStatus
}>

export type RuntimeSelectionSourceInput = Readonly<{
  openrouter?: RuntimeSelectionProviderInput
  lmStudio?: RuntimeSelectionProviderInput
  ollama?: RuntimeSelectionProviderInput
  localEndpoint?: RuntimeSelectionProviderInput
  openAIResponses?: RuntimeSelectionProviderInput
  googleAIStudio?: RuntimeSelectionProviderInput
  anthropic?: RuntimeSelectionProviderInput
  deepSeek?: RuntimeSelectionProviderInput
}>

type RuntimeTextChatFeatureFlag = boolean | Readonly<{ enabled?: boolean }> | null | undefined

export type RuntimeTextChatSessionConfigLite = Readonly<{
  webSearch?: RuntimeTextChatFeatureFlag
  reasoning?: RuntimeTextChatFeatureFlag
  imageGeneration?: RuntimeTextChatFeatureFlag
  tools?: RuntimeTextChatFeatureFlag
  structuredOutput?: RuntimeTextChatFeatureFlag
}>

export type RuntimeTextChatBlockReasonInput = Readonly<{
  selection: CurrentRuntimeSelection
  capability: RuntimeCapabilitySummaryLite
  text: string
  hasDraftAttachments: boolean
  sessionConfig: RuntimeTextChatSessionConfigLite
  toolsRequested?: boolean
  structuredOutputRequested?: boolean
}>

export const RUNTIME_SELECTION_UNSET_SEND_BLOCK_REASON = '请选择运行供应商和模型后再发送。'

export const RUNTIME_PROVIDER_DISPLAY_NAMES: Record<RuntimeProviderKey, string> = {
  openrouter: 'OpenRouter',
  openai_responses: 'OpenAI Responses',
  google_ai_studio: 'Google AI Studio',
  anthropic_messages: 'Anthropic Messages',
  deepseek: 'DeepSeek official',
  lm_studio: 'LM Studio Local',
  ollama_local: 'Ollama Local',
  local_endpoint: 'LocalEndpoint',
}

const EXPERIMENTAL_SELECTION_PRIORITY: readonly RuntimeProviderKey[] = [
  'deepseek',
  'anthropic_messages',
  'google_ai_studio',
  'openai_responses',
  'ollama_local',
  'lm_studio',
  'local_endpoint',
]

const DEFAULT_ENDPOINT_ID: Record<RuntimeProviderKey, string> = {
  openrouter: 'openrouter-official',
  openai_responses: 'openai-responses-official',
  google_ai_studio: 'google-ai-studio-official',
  anthropic_messages: 'anthropic-messages-official',
  deepseek: 'deepseek-official',
  lm_studio: 'lm-studio-loopback-local-storage',
  ollama_local: 'ollama-loopback-local-storage',
  local_endpoint: 'local-endpoint-loopback-local-storage',
}

const DEFAULT_PROFILE_ID: Record<RuntimeProviderKey, string> = {
  openrouter: 'openrouter_v1_chat',
  openai_responses: 'openai_responses_v1',
  google_ai_studio: 'gemini_api_v1',
  anthropic_messages: 'anthropic_messages_v1',
  deepseek: 'deepseek_official_openai_compat',
  lm_studio: 'lm_studio_local_v1',
  ollama_local: 'ollama_native_rest_chat_v1',
  local_endpoint: 'local_endpoint_openai_compat_text_v1',
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = asTrimmedString(value)
  return normalized.length > 0 ? normalized : null
}

function selectRuntimeProvider(
  providerKey: RuntimeProviderKey,
  input: RuntimeSelectionProviderInput | undefined,
  source: CurrentRuntimeSelection extends infer Selection
    ? Selection extends { state: 'selected'; source: infer Source }
      ? Source
      : never
    : never,
  mode: 'production' | 'experimental',
): CurrentRuntimeSelection {
  return {
    state: 'selected',
    providerKey,
    endpointId: normalizeOptionalString(input?.endpointId) ?? DEFAULT_ENDPOINT_ID[providerKey],
    profileId: normalizeOptionalString(input?.profileId) ?? DEFAULT_PROFILE_ID[providerKey],
    modelKey: normalizeOptionalString(input?.modelKey),
    nativeModelId: normalizeOptionalString(input?.nativeModelId),
    source,
    mode,
    credentialStatus: input?.credentialStatus ?? 'unknown',
  }
}

function isSelected(input: RuntimeSelectionProviderInput | undefined): boolean {
  return input?.selected === true
}

function providerInputForKey(input: RuntimeSelectionSourceInput, providerKey: RuntimeProviderKey): RuntimeSelectionProviderInput | undefined {
  if (providerKey === 'deepseek') return input.deepSeek
  if (providerKey === 'anthropic_messages') return input.anthropic
  if (providerKey === 'google_ai_studio') return input.googleAIStudio
  if (providerKey === 'openai_responses') return input.openAIResponses
  if (providerKey === 'ollama_local') return input.ollama
  if (providerKey === 'lm_studio') return input.lmStudio
  if (providerKey === 'local_endpoint') return input.localEndpoint
  return input.openrouter
}

export function deriveCurrentRuntimeSelection(input: RuntimeSelectionSourceInput): CurrentRuntimeSelection {
  for (const providerKey of EXPERIMENTAL_SELECTION_PRIORITY) {
    const providerInput = providerInputForKey(input, providerKey)
    if (isSelected(providerInput)) {
      return selectRuntimeProvider(providerKey, providerInput, 'legacy_experimental_flag', 'experimental')
    }
  }

  if (isSelected(input.openrouter)) {
    return selectRuntimeProvider('openrouter', input.openrouter, 'explicit_user_selection', 'production')
  }

  return { state: 'unset', source: 'unset' }
}

export function getRuntimeCapabilitySummaryLite(selection: CurrentRuntimeSelection): RuntimeCapabilitySummaryLite {
  if (selection.state === 'unset') {
    return {
      textChat: false,
      streamingText: false,
      attachments: 'blocked',
      webSearch: 'blocked',
      tools: 'blocked',
      reasoningArtifacts: 'blocked',
      imageGeneration: 'blocked',
      structuredOutput: 'blocked',
      usageFinal: 'unknown',
      source: 'unset',
      warnings: ['No runtime provider is selected.'],
    }
  }

  if (selection.providerKey === 'openrouter') {
    return {
      textChat: true,
      streamingText: true,
      attachments: 'supported',
      webSearch: 'supported',
      tools: 'supported',
      reasoningArtifacts: 'supported',
      imageGeneration: 'supported',
      structuredOutput: 'unknown',
      usageFinal: 'not_guaranteed',
      source: 'openrouter_existing',
      warnings: ['OpenRouter uses the existing first-class send path and legacy-store credential source.'],
    }
  }

  if (selection.providerKey === 'local_endpoint') {
    return {
      textChat: true,
      streamingText: 'probe_required',
      attachments: 'blocked',
      webSearch: 'blocked',
      tools: 'blocked',
      reasoningArtifacts: 'blocked',
      imageGeneration: 'blocked',
      structuredOutput: 'blocked',
      usageFinal: 'not_guaranteed',
      source: 'local_probe',
      warnings: [
        'LocalEndpoint R1 remains experimental, text-only, and loopback-only.',
        'Files, tools, web search, reasoning controls, image generation, and structured output are blocked.',
      ],
    }
  }

  if (selection.providerKey === 'lm_studio') {
    return {
      textChat: true,
      streamingText: 'probe_required',
      attachments: 'supported',
      webSearch: 'blocked',
      tools: 'blocked',
      reasoningArtifacts: 'blocked',
      imageGeneration: 'blocked',
      structuredOutput: 'blocked',
      usageFinal: 'not_guaranteed',
      source: 'lm_studio_local',
      warnings: [
        'LM Studio Local image input supports PNG/JPEG through OpenAI-compatible chat completions when the selected model is confirmed vision-capable.',
        'Native REST load/unload controls are separate from OpenAI-compatible chat mode.',
        'PDF, files, tools, web search, reasoning controls, image generation, and structured output are blocked.',
      ],
    }
  }

  if (selection.providerKey === 'ollama_local') {
    return {
      textChat: true,
      streamingText: 'probe_required',
      attachments: 'supported',
      webSearch: 'blocked',
      tools: 'blocked',
      reasoningArtifacts: 'filtered',
      imageGeneration: 'blocked',
      structuredOutput: 'blocked',
      usageFinal: 'not_guaranteed',
      source: 'ollama_local',
      warnings: [
        'Ollama Local image input supports PNG/JPEG when /api/show confirms the selected model is vision-capable.',
        'Native REST load/unload controls are separate from OpenAI-compatible chat mode.',
        'Provider thinking metadata is filtered from visible text in the native REST stream.',
        'PDF, files, tools, web search, reasoning controls, image generation, and structured output are blocked.',
      ],
    }
  }

  if (
    selection.providerKey === 'openai_responses' ||
    selection.providerKey === 'google_ai_studio' ||
    selection.providerKey === 'anthropic_messages'
  ) {
    return {
      textChat: true,
      streamingText: true,
      attachments: 'supported',
      webSearch: 'blocked',
      tools: 'blocked',
      reasoningArtifacts: 'filtered',
      imageGeneration: 'blocked',
      structuredOutput: 'blocked',
      usageFinal: 'not_guaranteed',
      source: 'experimental_image_inline',
      warnings: [
        `${RUNTIME_PROVIDER_DISPLAY_NAMES[selection.providerKey]} R1 supports small PNG/JPEG image and small PDF inline attachments.`,
        'Non-PDF documents, audio, video, tools, web search, image generation, and structured output are blocked in this runtime slice.',
      ],
    }
  }

  if (selection.providerKey === 'deepseek') {
    return {
      textChat: true,
      streamingText: true,
      attachments: 'blocked',
      webSearch: 'blocked',
      tools: 'blocked',
      reasoningArtifacts: 'filtered',
      imageGeneration: 'blocked',
      structuredOutput: 'blocked',
      usageFinal: 'not_guaranteed',
      source: 'experimental_text_only',
      warnings: [
        'DeepSeek official runtime is text-only in Starverse.',
        'File and image attachments are blocked and are not converted into prompt text.',
      ],
    }
  }

  return {
    textChat: true,
    streamingText: true,
    attachments: 'blocked',
    webSearch: 'blocked',
    tools: 'blocked',
    reasoningArtifacts: 'filtered',
    imageGeneration: 'blocked',
    structuredOutput: 'blocked',
    usageFinal: 'not_guaranteed',
    source: 'experimental_text_only',
    warnings: [
      `${RUNTIME_PROVIDER_DISPLAY_NAMES[selection.providerKey]} R1 remains experimental text-only.`,
      'Provider-specific reasoning artifacts are not surfaced or persisted by this text-only slice.',
      'Files, tools, web search, image generation, and structured output are blocked.',
    ],
  }
}

function featureEnabled(value: RuntimeTextChatFeatureFlag): boolean {
  if (typeof value === 'boolean') return value
  return value?.enabled === true
}

function selectedModelId(selection: Extract<CurrentRuntimeSelection, { state: 'selected' }>): string {
  return normalizeOptionalString(selection.modelKey) ?? normalizeOptionalString(selection.nativeModelId) ?? ''
}

function providerRequiresTextOnlyGates(selection: CurrentRuntimeSelection): selection is Extract<CurrentRuntimeSelection, { state: 'selected' }> {
  return selection.state === 'selected' && selection.providerKey !== 'openrouter'
}

export function getRuntimeTextChatBlockReason(input: RuntimeTextChatBlockReasonInput): string | null {
  if (input.selection.state === 'unset') return RUNTIME_SELECTION_UNSET_SEND_BLOCK_REASON

  const text = input.text.trim()
  if (!text && !input.hasDraftAttachments) return '请输入消息内容后再发送。'

  const providerName = RUNTIME_PROVIDER_DISPLAY_NAMES[input.selection.providerKey]
  if (!input.selection.endpointId.trim()) {
    return input.selection.providerKey === 'local_endpoint' || input.selection.providerKey === 'lm_studio' || input.selection.providerKey === 'ollama_local'
      ? `${providerName} text chat requires a localhost endpoint URL.`
      : `${providerName} requires an endpoint before sending.`
  }
  if (!selectedModelId(input.selection)) return `请选择 ${providerName} 模型后再发送。`
  if (!input.capability.textChat) return `${providerName} does not support text chat in the current runtime selection.`

  if (!providerRequiresTextOnlyGates(input.selection)) return null

  if (input.hasDraftAttachments && input.capability.attachments !== 'supported') {
    return `${providerName} experimental text chat is text-only. Remove attachments before sending.`
  }
  if (featureEnabled(input.sessionConfig.webSearch) && input.capability.webSearch === 'blocked') {
    return `${providerName} experimental text chat does not support web search. Disable web search before sending.`
  }
  if ((featureEnabled(input.sessionConfig.tools) || input.toolsRequested === true) && input.capability.tools === 'blocked') {
    return `${providerName} experimental text chat does not support tools. Disable tools before sending.`
  }
  if (featureEnabled(input.sessionConfig.reasoning) && input.capability.reasoningArtifacts !== 'supported') {
    return `${providerName} experimental text chat does not support reasoning controls. Disable reasoning before sending.`
  }
  if (featureEnabled(input.sessionConfig.imageGeneration) && input.capability.imageGeneration === 'blocked') {
    return `${providerName} experimental text chat does not support image generation. Disable image generation before sending.`
  }
  if (
    (featureEnabled(input.sessionConfig.structuredOutput) || input.structuredOutputRequested === true) &&
    input.capability.structuredOutput === 'blocked'
  ) {
    return `${providerName} experimental text chat does not support structured output. Disable structured output before sending.`
  }

  return null
}

export function resolveRuntimeTextSendRoute(selection: CurrentRuntimeSelection): RuntimeTextSendRoute {
  if (selection.state === 'unset') {
    return { kind: 'none', reason: RUNTIME_SELECTION_UNSET_SEND_BLOCK_REASON }
  }

  if (selection.providerKey === 'openrouter') return { kind: 'openrouter_existing' }

  if (
    selection.providerKey === 'openai_responses' ||
    selection.providerKey === 'google_ai_studio' ||
    selection.providerKey === 'anthropic_messages' ||
    selection.providerKey === 'deepseek' ||
    selection.providerKey === 'lm_studio' ||
    selection.providerKey === 'ollama_local' ||
    selection.providerKey === 'local_endpoint'
  ) {
    return { kind: 'experimental_text', providerKey: selection.providerKey }
  }

  return { kind: 'none', reason: 'Generic OpenAI-compatible live routing is deferred.' }
}

export function formatRuntimeSelectionLabel(selection: CurrentRuntimeSelection): string {
  if (selection.state === 'unset') return 'No runtime provider selected'
  const providerName = RUNTIME_PROVIDER_DISPLAY_NAMES[selection.providerKey]
  const modelId = selectedModelId(selection)
  return modelId ? `${providerName} · ${modelId}` : providerName
}

export function formatRuntimeCapabilitySummaryLite(capability: RuntimeCapabilitySummaryLite): string {
  const streaming = capability.streamingText === 'probe_required'
    ? 'streaming probe required'
    : capability.streamingText
      ? 'streaming supported'
      : 'streaming blocked'
  return [
    capability.textChat ? 'text chat supported' : 'text chat blocked',
    streaming,
    `attachments ${capability.attachments}`,
    `web ${capability.webSearch}`,
    `tools ${capability.tools}`,
    `reasoning ${capability.reasoningArtifacts}`,
    `image ${capability.imageGeneration}`,
    `structured output ${capability.structuredOutput}`,
    `usage final ${capability.usageFinal}`,
  ].join(' · ')
}
