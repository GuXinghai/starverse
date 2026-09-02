import type { CatalogModel, CatalogRawBucket, CatalogRawEnvelope } from '../../internalSchema'
import type {
  ProviderCatalogFetchInput,
  ProviderCatalogSnapshot,
  ProviderCatalogSource,
  ProviderCatalogSourceDescriptor,
} from '../../providerCatalogContracts'
import { requireProviderCatalogSourceDescriptor } from '../../providerCatalogRegistry'
import {
  DEEPSEEK_MODELS_DEFAULT_BASE_URL,
  listDeepSeekProviderModelAvailability,
  type ProviderModelAvailability,
} from '../../../../next/provider/deepseek/deepSeekModelSource'
import { ProviderFailureErrorV2 } from '../../../provider/providerFailureV2'

export const DEEPSEEK_PROVIDER_CATALOG_DESCRIPTOR: ProviderCatalogSourceDescriptor =
  requireProviderCatalogSourceDescriptor('deepseek')

function normalizeBaseUrl(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim() || DEEPSEEK_MODELS_DEFAULT_BASE_URL
  return value.replace(/\/+$/, '')
}

function requireApiKey(input: ProviderCatalogFetchInput): string {
  const apiKey = String(input.apiKey ?? '').trim()
  if (!apiKey) throw new Error('DeepSeek catalog source requires apiKey')
  return apiKey
}

function requireFetchImpl(input: ProviderCatalogFetchInput): typeof fetch {
  if (typeof input.fetchImpl !== 'function') throw new Error('DeepSeek catalog source requires fetchImpl')
  return input.fetchImpl
}

function rawEnvelopeForAvailability(
  model: ProviderModelAvailability,
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
  model: ProviderModelAvailability,
  baseUrl: string,
  fetchedAtMs: number,
): CatalogModel {
  const contextLength = null
  const maxOutputTokens = null
  const alias = model.providerSpecific?.alias
  return {
    modelKey: `deepseek::${model.nativeModelId}` as const,
    providerKey: 'deepseek',
    modelId: model.nativeModelId,
    canonicalSlug: model.nativeModelId,
    displayName: model.displayName ?? model.nativeModelId,
    description: alias?.deprecated ? `Deprecated alias for ${alias.replacementModelId}.` : null,
    vendor: model.ownedBy ?? 'deepseek',
    family: 'deepseek',
    status: alias?.deprecated ? 'deprecated' : 'active',
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
    createdAtSec: null,
    expirationDate: alias?.deprecated ? alias.deprecationAtIso : null,
    tags: [],
    firstSeenAtMs: fetchedAtMs,
    lastSeenAtMs: fetchedAtMs,
    syncedAtMs: fetchedAtMs,
    raw: rawEnvelopeForAvailability(model, baseUrl, fetchedAtMs),
  }
}

export function createDeepSeekCatalogSource(): ProviderCatalogSource {
  return {
    descriptor: DEEPSEEK_PROVIDER_CATALOG_DESCRIPTOR,
    async fetchSnapshot(input): Promise<ProviderCatalogSnapshot> {
      const apiKey = requireApiKey(input)
      const fetchImpl = requireFetchImpl(input)
      const baseUrl = normalizeBaseUrl(input.baseUrl)
      const observedAtMs = Date.now()
      const result = await listDeepSeekProviderModelAvailability({
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
        providerKey: 'deepseek',
        baseUrl,
        dataSource: 'models_user_primary',
        fetchedAtMs: result.observedAtMs,
        rawModelListPayloads: result.rawSourcePayloads,
        models,
      }
    },
  }
}

export const deepSeekCatalogSource = createDeepSeekCatalogSource()
