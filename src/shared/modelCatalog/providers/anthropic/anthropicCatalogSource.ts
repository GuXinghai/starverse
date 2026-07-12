import type { CatalogModel, CatalogRawBucket, CatalogRawEnvelope } from '../../internalSchema'
import type {
  ProviderCatalogFetchInput,
  ProviderCatalogSnapshot,
  ProviderCatalogSource,
  ProviderCatalogSourceDescriptor,
} from '../../providerCatalogContracts'
import { requireProviderCatalogSourceDescriptor } from '../../providerCatalogRegistry'
import {
  ANTHROPIC_MODELS_DEFAULT_BASE_URL,
  listAnthropicProviderModelAvailability,
  type AnthropicProviderModelAvailability,
} from '../../../../next/provider/anthropic/anthropicModelSource'

export const ANTHROPIC_PROVIDER_CATALOG_DESCRIPTOR: ProviderCatalogSourceDescriptor =
  requireProviderCatalogSourceDescriptor('anthropic_messages')

function normalizeBaseUrl(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim() || ANTHROPIC_MODELS_DEFAULT_BASE_URL
  return value.replace(/\/+$/, '')
}

function requireApiKey(input: ProviderCatalogFetchInput): string {
  const apiKey = String(input.apiKey ?? '').trim()
  if (!apiKey) throw new Error('Anthropic catalog source requires apiKey')
  return apiKey
}

function requireFetchImpl(input: ProviderCatalogFetchInput): typeof fetch {
  if (typeof input.fetchImpl !== 'function') throw new Error('Anthropic catalog source requires fetchImpl')
  return input.fetchImpl
}

function rawEnvelopeForAvailability(
  model: AnthropicProviderModelAvailability,
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
  model: AnthropicProviderModelAvailability,
  baseUrl: string,
  fetchedAtMs: number,
): CatalogModel | null {
  if (model.capabilitySeed?.textChat !== true) return null
  const contextLength = model.capabilitySeed.maxInputTokens ?? model.capabilitySeed.contextLength ?? null
  const maxOutputTokens = model.capabilitySeed.maxOutputTokens ?? null
  return {
    modelKey: `anthropic_messages::${model.nativeModelId}` as const,
    providerKey: 'anthropic_messages',
    modelId: model.nativeModelId,
    canonicalSlug: model.nativeModelId,
    displayName: model.displayName ?? model.nativeModelId,
    description: null,
    vendor: 'Anthropic',
    family: model.nativeModelId.startsWith('claude-') ? 'claude' : null,
    status: 'active',
    visibility: 'visible',
    contextLength,
    maxOutputTokens,
    architectureModality: null,
    inputModalities: model.capabilitySeed.imageInput === true ? ['text', 'image'] : ['text'],
    outputModalities: ['text'],
    tokenizer: null,
    instructType: null,
    supportedParameters: ['max_tokens', 'temperature', 'top_p', 'top_k'],
    capabilities: {
      reasoning: model.capabilitySeed.thinking === 'supported',
      tools: model.capabilitySeed.toolUse === true,
      structuredOutputs: model.capabilitySeed.structuredOutput === true,
      vision: model.capabilitySeed.imageInput === true,
      longContext: typeof contextLength === 'number' && contextLength >= 128_000,
    },
    pricing: null,
    perRequestLimits: null,
    defaultParameters: null,
    topProviderContextLength: contextLength,
    topProviderIsModerated: null,
    createdAtSec: model.createdAt ? Math.floor(Date.parse(model.createdAt) / 1000) : null,
    expirationDate: null,
    tags: [],
    firstSeenAtMs: fetchedAtMs,
    lastSeenAtMs: fetchedAtMs,
    syncedAtMs: fetchedAtMs,
    raw: rawEnvelopeForAvailability(model, baseUrl, fetchedAtMs),
  }
}

export function createAnthropicCatalogSource(): ProviderCatalogSource {
  return {
    descriptor: ANTHROPIC_PROVIDER_CATALOG_DESCRIPTOR,
    async fetchSnapshot(input): Promise<ProviderCatalogSnapshot> {
      const apiKey = requireApiKey(input)
      const fetchImpl = requireFetchImpl(input)
      const baseUrl = normalizeBaseUrl(input.baseUrl)
      const observedAtMs = Date.now()
      const result = await listAnthropicProviderModelAvailability({
        apiKey,
        baseUrl,
        fetchImpl,
        signal: input.signal ?? null,
        observedAtMs,
      })
      if (!result.ok) throw new Error(result.message)
      const models = result.models
        .map((model) => catalogModelFromAvailability(model, baseUrl, result.observedAtMs))
        .filter((model): model is CatalogModel => !!model)
      return {
        providerKey: 'anthropic_messages',
        baseUrl,
        dataSource: 'models_user_primary',
        fetchedAtMs: result.observedAtMs,
        models,
      }
    },
  }
}

export const anthropicCatalogSource = createAnthropicCatalogSource()
