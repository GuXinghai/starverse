import type { CatalogModel, CatalogRawEnvelope, CatalogRawBucket } from '../../internalSchema'
import type {
  ProviderCatalogFetchInput,
  ProviderCatalogSnapshot,
  ProviderCatalogSource,
  ProviderCatalogSourceDescriptor,
} from '../../providerCatalogContracts'
import { requireProviderCatalogSourceDescriptor } from '../../providerCatalogRegistry'
import {
  GEMINI_MODELS_DEFAULT_BASE_URL,
  listGeminiProviderModelAvailability,
  type GeminiProviderModelAvailability,
} from '../../../../next/provider/gemini/geminiModelSource'

export const GOOGLE_AI_STUDIO_PROVIDER_CATALOG_DESCRIPTOR: ProviderCatalogSourceDescriptor =
  requireProviderCatalogSourceDescriptor('google_ai_studio')

function normalizeBaseUrl(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim() || GEMINI_MODELS_DEFAULT_BASE_URL
  return value.replace(/\/+$/, '')
}

function requireApiKey(input: ProviderCatalogFetchInput): string {
  const apiKey = String(input.apiKey ?? '').trim()
  if (!apiKey) {
    throw new Error('Google AI Studio catalog source requires apiKey')
  }
  return apiKey
}

function requireFetchImpl(input: ProviderCatalogFetchInput): typeof fetch {
  if (typeof input.fetchImpl !== 'function') {
    throw new Error('Google AI Studio catalog source requires fetchImpl')
  }
  return input.fetchImpl
}

function rawEnvelopeForAvailability(
  model: GeminiProviderModelAvailability,
  baseUrl: string,
  fetchedAtMs: number,
): CatalogRawEnvelope {
  const payload = {
    nativeModelId: model.nativeModelId,
    displayName: model.displayName ?? null,
    description: model.description ?? null,
    source: model.source,
    confidence: model.confidence,
    warnings: [...model.warnings],
    providerSpecific: model.providerSpecific ?? {},
    provenance: model.provenance ?? null,
    capabilitySeed: model.capabilitySeed ?? {},
  }
  const bucket: CatalogRawBucket = {
    source: 'models',
    fetchedAtMs,
    baseUrl,
    payload,
  }
  return {
    buckets: [bucket],
    schemaVersion: 1,
  }
}

function catalogModelFromAvailability(
  model: GeminiProviderModelAvailability,
  baseUrl: string,
  fetchedAtMs: number,
): CatalogModel | null {
  if (model.capabilitySeed?.textChat !== true) return null
  const contextLength = model.capabilitySeed.inputTokenLimit ?? model.capabilitySeed.contextLength ?? null
  const maxOutputTokens = model.capabilitySeed.outputTokenLimit ?? model.capabilitySeed.maxOutputTokens ?? null
  const supportedMethods = model.capabilitySeed.supportedGenerationMethods ?? model.providerSpecific?.supportedGenerationMethods ?? []
  const supportedParameters = [
    'temperature',
    'topP',
    'topK',
    'maxOutputTokens',
    ...supportedMethods.map((method) => `method:${method}`),
  ]

  return {
    modelKey: `google_ai_studio::${model.nativeModelId}` as const,
    providerKey: 'google_ai_studio',
    modelId: model.nativeModelId,
    canonicalSlug: model.nativeModelId,
    displayName: model.displayName ?? model.nativeModelId,
    description: model.description ?? null,
    vendor: 'Google',
    family: model.nativeModelId.startsWith('gemini-') ? 'gemini' : null,
    status: 'active',
    visibility: 'visible',
    contextLength,
    maxOutputTokens,
    architectureModality: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: null,
    instructType: null,
    supportedParameters: Array.from(new Set(supportedParameters)),
    capabilities: {
      reasoning: model.capabilitySeed.thinking === 'supported' || model.capabilitySeed.reasoning === 'supported',
      tools: model.capabilitySeed.functionCalling === true || model.capabilitySeed.toolUse === true,
      structuredOutputs: model.capabilitySeed.structuredOutput === true,
      vision: model.capabilitySeed.vision === true || model.capabilitySeed.imageInput === true,
      longContext: typeof contextLength === 'number' && contextLength >= 128_000,
    },
    pricing: null,
    perRequestLimits: null,
    defaultParameters: null,
    topProviderContextLength: contextLength,
    topProviderIsModerated: null,
    createdAtSec: null,
    expirationDate: null,
    tags: [],
    firstSeenAtMs: fetchedAtMs,
    lastSeenAtMs: fetchedAtMs,
    syncedAtMs: fetchedAtMs,
    raw: rawEnvelopeForAvailability(model, baseUrl, fetchedAtMs),
  }
}

export function createGoogleAIStudioCatalogSource(): ProviderCatalogSource {
  return {
    descriptor: GOOGLE_AI_STUDIO_PROVIDER_CATALOG_DESCRIPTOR,
    async fetchSnapshot(input): Promise<ProviderCatalogSnapshot> {
      const apiKey = requireApiKey(input)
      const fetchImpl = requireFetchImpl(input)
      const baseUrl = normalizeBaseUrl(input.baseUrl)
      const observedAtMs = Date.now()
      const result = await listGeminiProviderModelAvailability({
        apiKey,
        baseUrl,
        fetchImpl,
        signal: input.signal ?? null,
        observedAtMs,
      })
      if (!result.ok) {
        throw new Error(result.message)
      }
      const models = result.models
        .map((model) => catalogModelFromAvailability(model, baseUrl, result.observedAtMs))
        .filter((model): model is CatalogModel => !!model)
      return {
        providerKey: 'google_ai_studio',
        baseUrl,
        dataSource: 'models_user_primary',
        fetchedAtMs: result.observedAtMs,
        models,
      }
    },
  }
}

export const googleAIStudioCatalogSource = createGoogleAIStudioCatalogSource()
