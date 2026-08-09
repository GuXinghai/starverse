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
import { ProviderFailureErrorV2 } from '../../../provider/providerFailureV2'

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

function providerDateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString().slice(0, 10) === value ? value : null
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
      observation: model.observation ?? null,
    },
  }
  return { buckets: [bucket], schemaVersion: 1 }
}

function catalogModelFromAvailability(
  model: OpenAIProviderModelAvailability,
  baseUrl: string,
  fetchedAtMs: number,
): CatalogModel {
  const raw = model.observation?.rawProviderRecord
  const providerDeprecationDate = providerDateOnly(raw?.deprecation_date)
  const contextLength = null
  const maxOutputTokens = null
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
    inputModalities: [],
    outputModalities: [],
    tokenizer: null,
    instructType: null,
    supportedParameters: [],
    capabilities: {
      reasoning: model.observation?.facts.reasoning.presence === 'present' && model.observation.facts.reasoning.value === true,
      tools: model.observation?.facts.tools.presence === 'present' && model.observation.facts.tools.value === true,
      structuredOutputs: model.observation?.facts.structuredOutputs.presence === 'present' && model.observation.facts.structuredOutputs.value === true,
      vision: model.observation?.facts.vision.presence === 'present' && model.observation.facts.vision.value === true,
      longContext: typeof contextLength === 'number' && contextLength >= 128_000,
    },
    pricing: null,
    perRequestLimits: null,
    defaultParameters: null,
    topProviderContextLength: contextLength,
    topProviderIsModerated: null,
    createdAtSec: model.createdAtSec ?? null,
    expirationDate: providerDeprecationDate,
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
      if (!result.ok) {
        if (result.providerFailure) throw new ProviderFailureErrorV2(result.providerFailure)
        throw new Error(result.message)
      }
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
