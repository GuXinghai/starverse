import type { RuntimeProviderKey } from '@/next/provider/runtimeSelection'
import { buildProviderModelKey } from '@/next/provider/modelSelection'

export type ProviderModelPickerStatusKind =
  | 'ready'
  | 'loading'
  | 'not_loaded'
  | 'credential_missing'
  | 'unavailable'
  | 'manual_required'
  | 'manual_configured'

export type ProviderModelPickerItem = Readonly<{
  providerId: RuntimeProviderKey
  providerName: string
  modelId: string
  modelKey: string
  displayName: string
  description: string | null
  vendor: string | null
  capabilitySummary: string
  statusKind: ProviderModelPickerStatusKind
  statusLabel: string
  sourceLabel: string
  selectable: boolean
  inputModalities: string[]
  outputModalities: string[]
}>

export type ProviderModelPickerSource = Readonly<{
  providerId: RuntimeProviderKey
  providerName: string
  statusKind: ProviderModelPickerStatusKind
  statusLabel: string
  loading: boolean
  items: readonly ProviderModelPickerItem[]
}>

export type ProviderModelPickerAvailabilityStatus = Readonly<{
  loading: boolean
  result: unknown | null
}>

export type LocalProviderModelPickerInput = Readonly<{
  providerId: RuntimeProviderKey
  providerName: string
  modelId?: string | null
  enabled?: boolean
  modeLabel?: string | null
  endpointLabel?: string | null
}>

type AvailabilityModel = Readonly<{
  nativeModelId?: unknown
  displayName?: unknown
  description?: unknown
  source?: unknown
  confidence?: unknown
  warnings?: unknown
  capabilitySeed?: unknown
  providerSpecific?: unknown
}>

type AvailabilityResult = Readonly<{
  ok?: unknown
  code?: unknown
  message?: unknown
  models?: unknown
}>

function trimString(value: unknown): string {
  return String(value ?? '').trim()
}

function safeString(value: unknown): string | null {
  const text = trimString(value)
  return text.length > 0 ? text : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asBooleanCapability(value: unknown): boolean | 'unknown' {
  if (typeof value === 'boolean') return value
  return value === 'supported' ? true : value === 'unsupported' ? false : 'unknown'
}

function pushKnownCapability(labels: string[], label: string, value: unknown): void {
  if (asBooleanCapability(value) === true) labels.push(label)
}

function capabilitySummaryFromSeed(seedInput: unknown): string {
  const seed = asRecord(seedInput)
  if (!seed) return 'capability unknown'

  const labels: string[] = []
  pushKnownCapability(labels, 'text', seed.textChat)
  pushKnownCapability(labels, 'image input', seed.imageInput ?? seed.vision)
  pushKnownCapability(labels, 'file input', seed.fileInput ?? seed.files)
  pushKnownCapability(labels, 'tools', seed.toolUse ?? seed.functionCalling ?? seed.tools)
  pushKnownCapability(labels, 'structured output', seed.structuredOutput)
  const reasoning = seed.reasoning ?? seed.thinking ?? seed.thinkingMode
  if (reasoning === 'supported' || reasoning === true) labels.push('reasoning')

  const contextLength = Number(seed.contextLength ?? seed.maxInputTokens)
  if (Number.isFinite(contextLength) && contextLength > 0) {
    labels.push(`ctx ${Math.trunc(contextLength).toLocaleString()}`)
  }

  return labels.length > 0 ? labels.join(' · ') : 'capability unknown'
}

function modalitiesFromSeed(seedInput: unknown): { input: string[]; output: string[] } {
  const seed = asRecord(seedInput)
  const input = new Set<string>(['text'])
  const output = new Set<string>(['text'])
  if (seed) {
    if (asBooleanCapability(seed.imageInput ?? seed.vision) === true) input.add('image')
    if (asBooleanCapability(seed.fileInput ?? seed.files) === true) input.add('file')
    if (asBooleanCapability(seed.audioInput) === true) input.add('audio')
  }
  return { input: Array.from(input), output: Array.from(output) }
}

function sourceLabelFromModel(model: AvailabilityModel): string {
  const source = safeString(model.source)
  const confidence = safeString(model.confidence)
  if (source && confidence) return `${source} · ${confidence}`
  return source ?? confidence ?? 'provider source'
}

function firstWarning(model: AvailabilityModel): string | null {
  return Array.isArray(model.warnings)
    ? safeString(model.warnings[0])
    : null
}

function itemFromAvailabilityModel(
  providerId: RuntimeProviderKey,
  providerName: string,
  modelInput: AvailabilityModel,
): ProviderModelPickerItem | null {
  const modelId = safeString(modelInput.nativeModelId)
  if (!modelId) return null
  const displayName = safeString(modelInput.displayName) ?? modelId
  const description = safeString(modelInput.description) ?? firstWarning(modelInput)
  const capabilitySummary = capabilitySummaryFromSeed(modelInput.capabilitySeed)
  const modalities = modalitiesFromSeed(modelInput.capabilitySeed)
  return {
    providerId,
    providerName,
    modelId,
    modelKey: buildProviderModelKey({ providerId, modelId }),
    displayName,
    description,
    vendor: providerName,
    capabilitySummary,
    statusKind: 'ready',
    statusLabel: 'available',
    sourceLabel: sourceLabelFromModel(modelInput),
    selectable: true,
    inputModalities: modalities.input,
    outputModalities: modalities.output,
  }
}

function statusFromFailure(result: AvailabilityResult | null): Pick<ProviderModelPickerSource, 'statusKind' | 'statusLabel'> {
  if (!result) {
    return { statusKind: 'not_loaded', statusLabel: 'not loaded' }
  }
  const code = safeString(result.code)
  const message = safeString(result.message)
  if (code === 'credential_missing') {
    return { statusKind: 'credential_missing', statusLabel: message ?? 'credential missing' }
  }
  return { statusKind: 'unavailable', statusLabel: message ?? 'model source unavailable' }
}

export function buildProviderAvailabilityModelSource(input: Readonly<{
  providerId: RuntimeProviderKey
  providerName: string
  status: ProviderModelPickerAvailabilityStatus
}>): ProviderModelPickerSource {
  const result = asRecord(input.status.result) as AvailabilityResult | null
  const models = result?.ok === true && Array.isArray(result.models)
    ? result.models
        .map((model) => itemFromAvailabilityModel(input.providerId, input.providerName, asRecord(model) ?? {}))
        .filter((item): item is ProviderModelPickerItem => item !== null)
    : []

  if (input.status.loading && models.length === 0) {
    return {
      providerId: input.providerId,
      providerName: input.providerName,
      statusKind: 'loading',
      statusLabel: 'loading models',
      loading: true,
      items: [],
    }
  }

  if (result?.ok === true) {
    return {
      providerId: input.providerId,
      providerName: input.providerName,
      statusKind: models.length > 0 ? 'ready' : 'unavailable',
      statusLabel: models.length > 0 ? `${models.length} model${models.length === 1 ? '' : 's'}` : 'no models reported',
      loading: input.status.loading,
      items: models,
    }
  }

  const failure = statusFromFailure(result)
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    ...failure,
    loading: input.status.loading,
    items: [],
  }
}

export function buildLocalProviderModelSource(input: LocalProviderModelPickerInput): ProviderModelPickerSource {
  const modelId = safeString(input.modelId)
  if (!modelId) {
    return {
      providerId: input.providerId,
      providerName: input.providerName,
      statusKind: 'manual_required',
      statusLabel: 'manual model required',
      loading: false,
      items: [],
    }
  }

  const detailParts = [
    input.modeLabel ? safeString(input.modeLabel) : null,
    input.endpointLabel ? safeString(input.endpointLabel) : null,
  ].filter((part): part is string => !!part)
  const statusLabel = input.enabled === true ? 'selected local runtime' : 'configured'
  const item: ProviderModelPickerItem = {
    providerId: input.providerId,
    providerName: input.providerName,
    modelId,
    modelKey: buildProviderModelKey({ providerId: input.providerId, modelId }),
    displayName: modelId,
    description: detailParts.length > 0 ? detailParts.join(' · ') : null,
    vendor: input.providerName,
    capabilitySummary: 'text · local capability unknown',
    statusKind: 'manual_configured',
    statusLabel,
    sourceLabel: 'manual local setting',
    selectable: true,
    inputModalities: ['text'],
    outputModalities: ['text'],
  }

  return {
    providerId: input.providerId,
    providerName: input.providerName,
    statusKind: 'manual_configured',
    statusLabel,
    loading: false,
    items: [item],
  }
}
