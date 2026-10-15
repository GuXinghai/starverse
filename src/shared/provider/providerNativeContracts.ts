export type ProviderNativeStatus = 'streaming' | 'final' | 'error' | 'cancelled'

export type AnthropicProviderNativeStatus = ProviderNativeStatus

export type AnthropicNativeContentBlock = Readonly<Record<string, unknown>>

export type AnthropicProviderNativeSnapshot = Readonly<{
  providerKey: 'anthropic'
  sourceApi: 'anthropic_messages'
  snapshotKey: 'assistant'
  role: 'assistant'
  status: AnthropicProviderNativeStatus
  content: ReadonlyArray<AnthropicNativeContentBlock>
  model?: string
  stopReason?: string
  stopSequence?: string | null
  usage?: unknown
  diagnostics?: ReadonlyArray<Readonly<Record<string, unknown>>>
}>

export type GeminiProviderNativeStatus = ProviderNativeStatus

export type GeminiProviderNativePart = Readonly<Record<string, unknown>>

export type GeminiProviderNativeContent = Readonly<{
  role: string
  parts: ReadonlyArray<GeminiProviderNativePart>
}>

export type GeminiProviderNativeSnapshot = Readonly<{
  providerKey: 'google_ai_studio'
  sourceApi: 'gemini_generate_content'
  snapshotKey: string
  candidateIndex: number
  status: GeminiProviderNativeStatus
  content: GeminiProviderNativeContent
  finishReason?: string
  usageMetadata?: Readonly<Record<string, unknown>>
  modelVersion?: string
}>

export type ProviderNativeSnapshot = GeminiProviderNativeSnapshot | AnthropicProviderNativeSnapshot
