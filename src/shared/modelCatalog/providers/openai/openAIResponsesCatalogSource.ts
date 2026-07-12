import type { CatalogModel, CatalogRawBucket, CatalogRawEnvelope } from '../../internalSchema'
import type {
  ProviderCatalogFetchInput,
  ProviderCatalogSnapshot,
  ProviderCatalogSource,
  ProviderCatalogSourceDescriptor,
} from '../../providerCatalogContracts'
import { requireProviderCatalogSourceDescriptor } from '../../providerCatalogRegistry'
import {
  listOpenAIProviderModelAvailability,
  OPENAI_MODELS_DEFAULT_BASE_URL,
  type OpenAIProviderModelAvailability,
} from '../../../../next/provider/openai-responses/openAIResponsesModelSource'

export const OPENAI_RESPONSES_PROVIDER_CATALOG_DESCRIPTOR: ProviderCatalogSourceDescriptor =
  requireProviderCatalogSourceDescriptor('openai_responses')

function normalizeBaseUrl(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim() || OPENAI_MODELS_DEFAULT_BASE_URL
  return value.replace(/\/+$/, '')
}

function requireApiKey(input: ProviderCatalogFetchInput): string {
  const apiKey = String(input.apiKey ?? '').trim()
  if (!apiKey) throw new Error('OpenAI Responses catalog source requires apiKey')
  return apiKey
}

function requireFetchImpl(input: ProviderCatalogFetchInput): typeof fetch {
  if (typeof input.fetchImpl !== 'function') throw new Error('OpenAI Responses catalog source requires fetchImpl')
  return input.fetchImpl
}

function rawEnvelopeForAvailability(
  model: OpenAIProviderModelAvailability,
  baseUrl: string,
  fetchedAtMs: number,
): CatalogRawEnvelope {
  const bucket: CatalogRawBucket = {
    source: 'models',
    fetchedAtMs,
    baseUrl,
    payload: {
      nativeModelId: model.nativeModelId,
      displayName: model.displayName ?? null,
      source: model.source,
      confidence: model.confidence,
      warnings: [...model.warnings],
      providerSpecific: model.providerSpecific ?? {},
      provenance: model.provenance ?? null,
      capabilitySeed: model.capabilitySeed ?? {},
    },
  }
  return { buckets: [bucket], schemaVersion: 1 }
}

function catalogModelFromAvailability(
  model: OpenAIProviderModelAvailability,
  baseUrl: string,
  fetchedAtMs: number,
): CatalogModel {
  const seed = model.capabilitySeed
  const contextLength = seed?.contextLength ?? seed?.maxInputTokens ?? null
  const maxOutputTokens = seed?.maxOutputTokens ?? null
  return {
    modelKey: `openai_responses::${model.nativeModelId}` as const,
    providerKey: 'openai_responses',
    modelId: model.nativeModelId,
    canonicalSlug: model.nativeModelId,
    displayName: model.displayName ?? model.nativeModelId,
    description: null,
    vendor: model.ownedBy ?? 'OpenAI',
    family: model.nativeModelId.startsWith('gpt-') ? 'gpt' : model.nativeModelId.split('-')[0] ?? null,
    status: 'active',
    visibility: 'visible',
    contextLength,
    maxOutputTokens,
    architectureModality: null,
    inputModalities: seed?.imageInput === true ? ['text', 'image'] : ['text'],
    outputModalities: seed?.audioInput === true ? ['text', 'audio'] : ['text'],
    tokenizer: null,
    instructType: null,
    supportedParameters: ['temperature', 'top_p', 'max_output_tokens'],
    capabilities: {
      reasoning: seed?.reasoning === 'supported',
      tools: seed?.functionCalling === true || seed?.hostedTools === true,
      structuredOutputs: seed?.structuredOutput === true,
      vision: seed?.imageInput === true,
      longContext: typeof contextLength === 'number' && contextLength >= 128_000,
    },
    pricing: null,
    perRequestLimits: null,
    defaultParameters: null,
    topProviderContextLength: contextLength,
    topProviderIsModerated: null,
    createdAtSec: model.createdAtSec ?? null,
    expirationDate: null,
    tags: [],
    firstSeenAtMs: fetchedAtMs,
    lastSeenAtMs: fetchedAtMs,
    syncedAtMs: fetchedAtMs,
    raw: rawEnvelopeForAvailability(model, baseUrl, fetchedAtMs),
  }
}

export function createOpenAIResponsesCatalogSource(): ProviderCatalogSource {
  return {
    descriptor: OPENAI_RESPONSES_PROVIDER_CATALOG_DESCRIPTOR,
    async fetchSnapshot(input): Promise<ProviderCatalogSnapshot> {
      const apiKey = requireApiKey(input)
      const fetchImpl = requireFetchImpl(input)
      const baseUrl = normalizeBaseUrl(input.baseUrl)
      const observedAtMs = Date.now()
      const result = await listOpenAIProviderModelAvailability({
        apiKey,
        baseUrl,
        fetchImpl,
        signal: input.signal ?? null,
        observedAtMs,
      })
      if (!result.ok) throw new Error(result.message)
      const models = result.models
        .map((model) => catalogModelFromAvailability(model, baseUrl, result.observedAtMs))
      return {
        providerKey: 'openai_responses',
        baseUrl,
        dataSource: 'models_user_primary',
        fetchedAtMs: result.observedAtMs,
        models,
      }
    },
  }
}

export const openAIResponsesCatalogSource = createOpenAIResponsesCatalogSource()
