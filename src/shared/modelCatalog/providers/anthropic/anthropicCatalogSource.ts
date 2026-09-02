import type { CatalogModel, CatalogRawBucket, CatalogRawEnvelope } from '../../internalSchema'
import type {
  ProviderCatalogFetchInput,
  ProviderCatalogSnapshot,
  ProviderCatalogSource,
  ProviderCatalogSourceDescriptor,
} from '../../providerCatalogContracts'
import { ProviderCatalogPaginationIncompleteErrorV2 } from '../../providerCatalogContracts'
import { requireProviderCatalogSourceDescriptor } from '../../providerCatalogRegistry'
import {
  ANTHROPIC_MODELS_DEFAULT_BASE_URL,
  listAnthropicProviderModelAvailability,
  type AnthropicProviderModelAvailability,
} from '../../../../next/provider/anthropic/anthropicModelSource'
import { ProviderFailureErrorV2 } from '../../../provider/providerFailureV2'

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
      observation: model.observation ?? null,
    },
  }
  return { buckets: [bucket], schemaVersion: 1 }
}

function catalogModelFromAvailability(
  model: AnthropicProviderModelAvailability,
  baseUrl: string,
  fetchedAtMs: number,
): CatalogModel {
  const raw = model.observation?.rawProviderRecord
  const contextLength = typeof raw?.max_input_tokens === 'number' &&
    Number.isSafeInteger(raw.max_input_tokens) && raw.max_input_tokens > 0 ? raw.max_input_tokens : null
  const maxOutputTokens = typeof raw?.max_tokens === 'number' &&
    Number.isSafeInteger(raw.max_tokens) && raw.max_tokens > 0 ? raw.max_tokens : null
  const vision = model.observation?.facts.vision.presence === 'present' &&
    model.observation.facts.vision.value === true
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
    inputModalities: vision ? ['text', 'image'] : [],
    outputModalities: [],
    tokenizer: null,
    instructType: null,
    supportedParameters: [],
    capabilities: {
      reasoning: model.observation?.facts.reasoning.presence === 'present' && model.observation.facts.reasoning.value === true,
      tools: model.observation?.facts.tools.presence === 'present' && model.observation.facts.tools.value === true,
      structuredOutputs: model.observation?.facts.structuredOutputs.presence === 'present' && model.observation.facts.structuredOutputs.value === true,
      vision,
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
      if (!result.ok) {
        if (result.code === 'pagination_incomplete') {
          throw new ProviderCatalogPaginationIncompleteErrorV2(
            'anthropic_messages', result.pagesFetched ?? 0, result.nextPageCursor,
          )
        }
        if (result.providerFailure) throw new ProviderFailureErrorV2(result.providerFailure)
        throw new Error(result.message)
      }
      const models = result.models
        .map((model) => catalogModelFromAvailability(model, baseUrl, result.observedAtMs))
      return {
        providerKey: 'anthropic_messages',
        baseUrl,
        dataSource: 'models_user_primary',
        fetchedAtMs: result.observedAtMs,
        rawModelListPayloads: result.rawSourcePayloads,
        models,
      }
    },
  }
}

export const anthropicCatalogSource = createAnthropicCatalogSource()
