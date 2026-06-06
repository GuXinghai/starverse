import { randomUUID } from 'node:crypto'
import { PROVIDERS } from '../../constants/providers'
import type { CatalogModel, CatalogModelTag, CatalogProvider } from './internalSchema'
import { OpenRouterCatalogClient, mapOpenRouterModelToCatalogModel } from './openRouterCatalogClient'

export type OpenRouterModelObject = Record<string, unknown>

export type CatalogSyncWriterInput = Readonly<{
  snapshotId: string
  routerSource: string
  models: Array<
    Readonly<{
      modelId: string
      routerSource: string
      vendor: string
      name: string
      description?: string | null
      contextLength?: number | null
      supportedParametersJson?: string | null
      rawJson?: string | null
    }>
  >
}>

export type CatalogCoreProviderUpsertInput = Readonly<{
  providerKey: string
  displayName: string
  slug?: string | null
  privacyPolicyUrl?: string | null
  termsOfServiceUrl?: string | null
  statusPageUrl?: string | null
  updatedAtMs: number
  rawJson?: string | null
}>

export type CatalogCoreModelUpsertInput = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
  canonicalSlug?: string | null
  displayName: string
  description?: string | null
  vendor?: string | null
  family?: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength?: number | null
  maxOutputTokens?: number | null
  architectureModality?: string | null
  inputModalitiesJson: string
  outputModalitiesJson: string
  tokenizer?: string | null
  instructType?: string | null
  supportedParametersJson: string
  capabilitiesJson: string
  capReasoning: 0 | 1
  capTools: 0 | 1
  capStructuredOutputs: 0 | 1
  capVision: 0 | 1
  capLongContext: 0 | 1
  pricingJson?: string | null
  pricePrompt?: string | null
  priceCompletion?: string | null
  priceRequest?: string | null
  priceImage?: string | null
  priceWebSearch?: string | null
  priceInternalReasoning?: string | null
  priceInputCacheRead?: string | null
  priceInputCacheWrite?: string | null
  createdAtSec?: number | null
  expirationDate?: string | null
  expirationAtSec?: number | null
  unknownExpiration?: 0 | 1
  perRequestLimitsJson?: string | null
  defaultParametersJson?: string | null
  hasPerRequestLimits?: 0 | 1
  hasDefaultParameters?: 0 | 1
  hasTools?: 0 | 1
  hasStructuredOutputs?: 0 | 1
  hasReasoning?: 0 | 1
  hasSeed?: 0 | 1
  inModalityImage?: 0 | 1
  topProviderContextLength?: number | null
  topProviderIsModerated?: 0 | 1 | null
  firstSeenAtMs: number
  lastSeenAtMs: number
  syncedAtMs: number
  rawJson?: string | null
}>

export type CatalogCoreTagUpsertInput = Readonly<{
  providerKey: string
  modelId: string
  tagKey: string
  tagLabel: string
  tagType: 'capability' | 'category' | 'vendor' | 'status' | 'custom'
  confidence: number
  source: 'derived' | 'provider' | 'manual'
  updatedAtMs: number
}>

export type CatalogCoreMetaUpsertInput = Readonly<{
  providerKey: string
  schemaVersion: number
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  baseUrl: string
  snapshotId: string
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  providerCount?: number | null
  lastCountProbe?: number | null
  lastCountProbeAtMs?: number | null
  lastSyncAtMs: number
  ttlSeconds: number
  syncState: 'idle' | 'syncing' | 'ok' | 'error'
  lastErrorCode?: string | null
  lastErrorMessage?: string | null
  rawRetentionPolicyJson: string
}>

export type CatalogCoreSyncWriterInput = Readonly<{
  providerKey: string
  snapshotId: string
  providers: CatalogCoreProviderUpsertInput[]
  models: CatalogCoreModelUpsertInput[]
  tags: CatalogCoreTagUpsertInput[]
  meta: CatalogCoreMetaUpsertInput
}>

export type CatalogScopedModelUpsertInput = Readonly<{
  modelId: string
  modelKey: string
  canonicalSlug?: string | null
  displayName: string
  description?: string | null
  vendor?: string | null
  family?: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength?: number | null
  maxOutputTokens?: number | null
  inputModalitiesJson?: string
  outputModalitiesJson?: string
  supportedParametersJson?: string
  capabilitiesJson?: string
  pricingJson?: string | null
  rawJson?: string | null
  createdAtSec?: number | null
  firstSeenAtMs: number
  lastSeenAtMs: number
  syncedAtMs: number
}>

export type CatalogScopedSnapshotWriterInput = Readonly<{
  providerKey: string
  catalogScopeKey?: string
  baseUrl: string
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  snapshotId: string
  snapshotChecksum?: string | null
  models: CatalogScopedModelUpsertInput[]
  syncedAtMs: number
  schemaVersion: number
}>

export type CatalogSyncWriter = Readonly<{
  syncSnapshot: (input: CatalogSyncWriterInput) => Promise<void> | void
  syncCoreSnapshot?: (input: CatalogCoreSyncWriterInput) => Promise<void> | void
  writeScopedSnapshot?: (input: CatalogScopedSnapshotWriterInput) => Promise<void> | void
}>

export type CatalogSyncJobResult =
  | Readonly<{ ok: true; snapshotId: string; modelCount: number; dataSource: CatalogCoreMetaUpsertInput['dataSource']; baseUrl: string }>
  | Readonly<{ ok: false; skipped: true; reason: 'missing_api_key' }>

type CatalogSyncLogger = Pick<Console, 'info' | 'warn' | 'error'>
const CATALOG_SYNC_STAGE = {
  FETCH_MODELS: 'fetch_models',
  FETCH_PROVIDERS: 'fetch_providers',
  PROBE_COUNT: 'probe_count',
  WRITE_SCOPED: 'write_scoped',
  WRITE_LEGACY: 'write_legacy',
  WRITE_CORE: 'write_core',
  VALIDATE_META: 'validate_meta',
  UNKNOWN: 'unknown',
} as const

type CatalogSyncFailureStage = (typeof CATALOG_SYNC_STAGE)[keyof typeof CATALOG_SYNC_STAGE]

class CatalogSyncStageError extends Error {
  readonly stage: CatalogSyncFailureStage

  constructor(stage: CatalogSyncFailureStage, message: string) {
    super(message)
    this.name = 'CatalogSyncStageError'
    this.stage = stage
  }
}

const CATALOG_META_SCHEMA_VERSION = 1
const CATALOG_TTL_SECONDS = 3600
const CATALOG_FTS_BUILD_STATUS = 'trigger_managed' as const
const CATALOG_FTS_NOT_APPLICABLE = 'not_applicable' as const

const RAW_RETENTION_POLICY = {
  retainRawPayload: true,
  retainModelSnapshot: true,
  maxRawBytesUnit: 'utf8_bytes',
  maxRawBytesPerEntity: 512_000,
  overflowStrategy: 'drop_raw',
  persistEncoding: 'json_string',
} as const

function normalizeBaseUrl(baseUrl?: string | null): string {
  const raw = (baseUrl || 'https://openrouter.ai/api/v1').trim()
  return raw.replace(/\/+$/, '')
}

function generateSnapshotId(): string {
  return `snap_${Date.now()}_${randomUUID()}`
}

function extractVendorFromId(id: string): string {
  const slash = id.indexOf('/')
  return slash > 0 ? id.slice(0, slash) : 'unknown'
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function toExpirationAtSec(expirationDate: string | null | undefined): number | null {
  const raw = String(expirationDate ?? '').trim()
  if (!raw) return null
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return null
  return Math.floor(ms / 1000)
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function toStageError(stage: CatalogSyncFailureStage, error: unknown): CatalogSyncStageError {
  return new CatalogSyncStageError(stage, `[${stage}] ${toErrorMessage(error)}`)
}

function toLegacyCatalogRow(model: CatalogModel): CatalogSyncWriterInput['models'][number] {
  const supportedParameters = Array.isArray(model.supportedParameters) ? model.supportedParameters : []
  const rawPayload = model.raw?.buckets?.[0]?.payload ?? model.raw ?? null
  return {
    modelId: model.modelId,
    routerSource: PROVIDERS.OPENROUTER,
    vendor: model.vendor ?? extractVendorFromId(model.modelId),
    name: model.displayName,
    description: model.description ?? null,
    contextLength: typeof model.contextLength === 'number' ? model.contextLength : -1,
    supportedParametersJson: safeStringify(supportedParameters) ?? '[]',
    rawJson: safeStringify(rawPayload) ?? null,
  }
}

function toCoreProviderRow(provider: CatalogProvider): CatalogCoreProviderUpsertInput {
  const rawPayload = provider.raw?.buckets?.[0]?.payload ?? provider.raw ?? null
  return {
    providerKey: String(provider.providerKey),
    displayName: provider.displayName,
    slug: provider.slug ?? null,
    privacyPolicyUrl: provider.privacyPolicyUrl ?? null,
    termsOfServiceUrl: provider.termsOfServiceUrl ?? null,
    statusPageUrl: provider.statusPageUrl ?? null,
    updatedAtMs: provider.updatedAtMs,
    rawJson: safeStringify(rawPayload),
  }
}

function toCoreModelRow(model: CatalogModel): CatalogCoreModelUpsertInput {
  const pricing = model.pricing ?? null
  const perRequestLimits = model.perRequestLimits ?? null
  const defaultParameters = model.defaultParameters ?? null
  const rawPayload = model.raw?.buckets?.[0]?.payload ?? model.raw ?? null
  const supportedParamSet = new Set(
    Array.isArray(model.supportedParameters)
      ? model.supportedParameters.map((item) => String(item).trim().toLowerCase()).filter((item) => item.length > 0)
      : []
  )
  const expirationAtSec = toExpirationAtSec(model.expirationDate)
  const hasRawExpiration = String(model.expirationDate ?? '').trim().length > 0
  const hasImageInput = Array.isArray(model.inputModalities) && model.inputModalities.includes('image')
  const architectureModality = String(model.architectureModality ?? '').trim().toLowerCase() || null
  const tokenizer = String(model.tokenizer ?? '').trim().toLowerCase() || null
  const instructType = String(model.instructType ?? '').trim().toLowerCase() || null

  return {
    providerKey: String(model.providerKey),
    modelId: model.modelId,
    modelKey: model.modelKey,
    canonicalSlug: model.canonicalSlug ?? null,
    displayName: model.displayName,
    description: model.description ?? null,
    vendor: model.vendor ?? null,
    family: model.family ?? null,
    status: model.status,
    visibility: model.visibility,
    contextLength: model.contextLength ?? null,
    maxOutputTokens: model.maxOutputTokens ?? null,
    architectureModality,
    inputModalitiesJson: safeStringify(model.inputModalities) ?? '[]',
    outputModalitiesJson: safeStringify(model.outputModalities) ?? '[]',
    tokenizer,
    instructType,
    supportedParametersJson: safeStringify(model.supportedParameters) ?? '[]',
    capabilitiesJson: safeStringify(model.capabilities) ?? '{}',
    capReasoning: model.capabilities.reasoning ? 1 : 0,
    capTools: model.capabilities.tools ? 1 : 0,
    capStructuredOutputs: model.capabilities.structuredOutputs ? 1 : 0,
    capVision: model.capabilities.vision ? 1 : 0,
    capLongContext: model.capabilities.longContext ? 1 : 0,
    pricingJson: pricing ? safeStringify(pricing) : null,
    pricePrompt: pricing?.prompt ?? null,
    priceCompletion: pricing?.completion ?? null,
    priceRequest: pricing?.request ?? null,
    priceImage: pricing?.image ?? null,
    priceWebSearch: pricing?.webSearch ?? null,
    priceInternalReasoning: pricing?.internalReasoning ?? null,
    priceInputCacheRead: pricing?.inputCacheRead ?? null,
    priceInputCacheWrite: pricing?.inputCacheWrite ?? null,
    createdAtSec: model.createdAtSec ?? null,
    expirationDate: model.expirationDate ?? null,
    expirationAtSec,
    unknownExpiration: hasRawExpiration && expirationAtSec == null ? 1 : 0,
    perRequestLimitsJson: perRequestLimits != null ? safeStringify(perRequestLimits) : null,
    defaultParametersJson: defaultParameters != null ? safeStringify(defaultParameters) : null,
    hasPerRequestLimits: perRequestLimits != null ? 1 : 0,
    hasDefaultParameters: defaultParameters != null ? 1 : 0,
    hasTools: model.capabilities.tools ? 1 : 0,
    hasStructuredOutputs: model.capabilities.structuredOutputs ? 1 : 0,
    hasReasoning: model.capabilities.reasoning ? 1 : 0,
    hasSeed: supportedParamSet.has('seed') ? 1 : 0,
    inModalityImage: hasImageInput ? 1 : 0,
    topProviderContextLength: model.topProviderContextLength ?? null,
    topProviderIsModerated:
      typeof model.topProviderIsModerated === 'boolean'
        ? model.topProviderIsModerated ? 1 : 0
        : null,
    firstSeenAtMs: model.firstSeenAtMs,
    lastSeenAtMs: model.lastSeenAtMs,
    syncedAtMs: model.syncedAtMs,
    rawJson: safeStringify(rawPayload),
  }
}

function toScopedModelRow(model: CatalogModel): CatalogScopedModelUpsertInput {
  const core = toCoreModelRow(model)
  return {
    modelId: core.modelId,
    modelKey: core.modelKey,
    canonicalSlug: core.canonicalSlug,
    displayName: core.displayName,
    description: core.description,
    vendor: core.vendor,
    family: core.family,
    status: core.status,
    visibility: core.visibility,
    contextLength: core.contextLength,
    maxOutputTokens: core.maxOutputTokens,
    inputModalitiesJson: core.inputModalitiesJson,
    outputModalitiesJson: core.outputModalitiesJson,
    supportedParametersJson: core.supportedParametersJson,
    capabilitiesJson: core.capabilitiesJson,
    pricingJson: core.pricingJson,
    rawJson: core.rawJson,
    createdAtSec: core.createdAtSec,
    firstSeenAtMs: core.firstSeenAtMs,
    lastSeenAtMs: core.lastSeenAtMs,
    syncedAtMs: core.syncedAtMs,
  }
}

function toCoreTagRows(providerKey: string, modelId: string, tags: ReadonlyArray<CatalogModelTag>): CatalogCoreTagUpsertInput[] {
  return tags.map((tag) => ({
    providerKey,
    modelId,
    tagKey: tag.key,
    tagLabel: tag.label,
    tagType: tag.type,
    confidence: tag.confidence,
    source: tag.source,
    updatedAtMs: tag.updatedAtMs,
  }))
}

function resolveDataSource(
  meta: Readonly<{
    primarySource: 'models_user' | 'models'
    usedFallback: boolean
  }>
): CatalogCoreMetaUpsertInput['dataSource'] {
  if (meta.usedFallback) return 'mixed'
  if (meta.primarySource === 'models_user') return 'models_user_primary'
  return 'models_fallback'
}

function normalizeOpenRouterModelToInternal(raw: OpenRouterModelObject): CatalogModel | null {
  return mapOpenRouterModelToCatalogModel(raw, {
    providerKey: PROVIDERS.OPENROUTER,
    source: 'models',
    fetchedAtMs: Date.now(),
    baseUrl: 'https://openrouter.ai/api/v1',
  })
}

export function normalizeOpenRouterModelToCatalogRow(
  raw: OpenRouterModelObject
): CatalogSyncWriterInput['models'][number] | null {
  const normalized = normalizeOpenRouterModelToInternal(raw)
  if (!normalized) return null
  return toLegacyCatalogRow(normalized)
}

function mergeProviderRows(
  nowMs: number,
  providers: ReadonlyArray<CatalogProvider>
): CatalogCoreProviderUpsertInput[] {
  const merged = new Map<string, CatalogCoreProviderUpsertInput>()

  merged.set(PROVIDERS.OPENROUTER, {
    providerKey: PROVIDERS.OPENROUTER,
    displayName: 'OpenRouter',
    slug: PROVIDERS.OPENROUTER,
    updatedAtMs: nowMs,
    rawJson: null,
  })

  for (const provider of providers) {
    merged.set(String(provider.providerKey), toCoreProviderRow(provider))
  }

  return Array.from(merged.values())
}

/**
 * CatalogSyncJob (phase 6):
 * - Uses OpenRouterCatalogClient to fetch /models/user (fallback /models) and /providers.
 * - Writes backward-compatible rows into model_catalog (legacy).
 * - Optionally writes internal catalog-core tables (providers/models/model_tags/catalog_meta).
 */
export async function syncOpenRouterModelCatalog(options: Readonly<{
  writer: CatalogSyncWriter
  apiKey: string
  baseUrl?: string | null
  fetchImpl?: typeof fetch
  snapshotId?: string
  preferUserScopedModels?: boolean
  enableCountProbe?: boolean
  logger?: CatalogSyncLogger
}>): Promise<CatalogSyncJobResult> {
  const logger = options.logger ?? console
  const startedAtMs = Date.now()
  const apiKey = options.apiKey?.trim() || ''
  if (!apiKey) {
    logger.warn('[CatalogSyncJob] sync skipped', {
      reason: 'missing_api_key',
      providerKey: PROVIDERS.OPENROUTER,
    })
    return { ok: false, skipped: true, reason: 'missing_api_key' }
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const snapshotId = options.snapshotId || generateSnapshotId()
  logger.info('[CatalogSyncJob] sync start', {
    providerKey: PROVIDERS.OPENROUTER,
    baseUrl,
    snapshotId,
    preferUserScopedModels: options.preferUserScopedModels !== false,
    enableCountProbe: options.enableCountProbe === true,
  })

  const client = new OpenRouterCatalogClient({ fetchImpl: options.fetchImpl })
  try {
    const modelsStageStart = Date.now()
    const modelResult = await client.listModels({
      apiKey,
      baseUrl,
      preferUserScopedModels: options.preferUserScopedModels !== false,
    })
    logger.info('[CatalogSyncJob] stage end', {
      stage: CATALOG_SYNC_STAGE.FETCH_MODELS,
      durationMs: Date.now() - modelsStageStart,
      modelCount: modelResult.models.length,
      primarySource: modelResult.meta.primarySource,
      usedFallback: modelResult.meta.usedFallback,
    })

    let providers: ReadonlyArray<CatalogProvider> = []
    let providerFetchOk = false
    const providerStageStart = Date.now()
    try {
      providers = await client.listProviders({
        apiKey,
        baseUrl,
      })
      providerFetchOk = true
      logger.info('[CatalogSyncJob] stage end', {
        stage: CATALOG_SYNC_STAGE.FETCH_PROVIDERS,
        durationMs: Date.now() - providerStageStart,
        providerCount: providers.length,
      })
    } catch (error) {
      providers = []
      providerFetchOk = false
      logger.warn('[CatalogSyncJob] stage degraded', {
        stage: CATALOG_SYNC_STAGE.FETCH_PROVIDERS,
        durationMs: Date.now() - providerStageStart,
        reason: toErrorMessage(error),
      })
    }

    let countProbe: { count: number; fetchedAtMs: number } | null = null
    try {
      if (options.enableCountProbe === true) {
        const countStageStart = Date.now()
        countProbe = await client.listModelsCount({
          apiKey,
          baseUrl,
        })
        logger.info('[CatalogSyncJob] stage end', {
          stage: CATALOG_SYNC_STAGE.PROBE_COUNT,
          durationMs: Date.now() - countStageStart,
          count: countProbe.count,
        })
      }
    } catch (error) {
      countProbe = null
      logger.warn('[CatalogSyncJob] stage degraded', {
        stage: CATALOG_SYNC_STAGE.PROBE_COUNT,
        reason: toErrorMessage(error),
      })
    }

    const nowMs = Date.now()
    const dataSource = resolveDataSource(modelResult.meta)
    if (options.writer.writeScopedSnapshot) {
      const scopedStageStart = Date.now()
      const scopedRows = modelResult.models.map(toScopedModelRow)
      try {
        await options.writer.writeScopedSnapshot({
          providerKey: PROVIDERS.OPENROUTER,
          baseUrl,
          dataSource,
          snapshotId,
          snapshotChecksum: snapshotId,
          models: scopedRows,
          syncedAtMs: nowMs,
          schemaVersion: CATALOG_META_SCHEMA_VERSION,
        })
        logger.info('[CatalogSyncJob] stage end', {
          stage: CATALOG_SYNC_STAGE.WRITE_SCOPED,
          durationMs: Date.now() - scopedStageStart,
          scopedModelRows: scopedRows.length,
          dataSource,
        })
      } catch (error) {
        throw toStageError(CATALOG_SYNC_STAGE.WRITE_SCOPED, error)
      }
    }

    const legacyRows = modelResult.models.map(toLegacyCatalogRow)
    const legacyStageStart = Date.now()
    try {
      await options.writer.syncSnapshot({
        snapshotId,
        routerSource: PROVIDERS.OPENROUTER,
        models: legacyRows,
      })
      logger.info('[CatalogSyncJob] stage end', {
        stage: CATALOG_SYNC_STAGE.WRITE_LEGACY,
        durationMs: Date.now() - legacyStageStart,
        legacyModelRows: legacyRows.length,
      })
    } catch (error) {
      throw toStageError(CATALOG_SYNC_STAGE.WRITE_LEGACY, error)
    }

    let coreStats: Readonly<{
      coreProviderRows: number
      coreModelRows: number
      coreTagRows: number
      providerSyncSkipped: boolean
      ftsBuildStatus: typeof CATALOG_FTS_BUILD_STATUS
    }> | null = null

    if (options.writer.syncCoreSnapshot) {
      const providerKey = PROVIDERS.OPENROUTER
      const coreModels = modelResult.models.map(toCoreModelRow)
      const tags = modelResult.models.flatMap((model) =>
        toCoreTagRows(providerKey, model.modelId, model.tags)
      )
      // If /providers fails, skip provider dictionary refresh to avoid
      // accidental dictionary regression from transient network errors.
      const providerRows = providerFetchOk ? mergeProviderRows(nowMs, providers) : []
      const visibleModelCount = coreModels.filter((row) => row.visibility === 'visible').length
      const hiddenModelCount = coreModels.length - visibleModelCount

      const coreStageStart = Date.now()
      try {
        await options.writer.syncCoreSnapshot({
          providerKey,
          snapshotId,
          providers: providerRows,
          models: coreModels,
          tags,
          meta: {
            providerKey,
            schemaVersion: CATALOG_META_SCHEMA_VERSION,
            dataSource,
            baseUrl,
            snapshotId,
            modelCount: coreModels.length,
            visibleModelCount,
            hiddenModelCount,
            providerCount: providerFetchOk ? providerRows.length : null,
            lastCountProbe: countProbe?.count ?? null,
            lastCountProbeAtMs: countProbe?.fetchedAtMs ?? null,
            lastSyncAtMs: nowMs,
            ttlSeconds: CATALOG_TTL_SECONDS,
            syncState: 'ok',
            lastErrorCode: null,
            lastErrorMessage: null,
            rawRetentionPolicyJson: safeStringify(RAW_RETENTION_POLICY) ?? '{}',
          },
        })
      } catch (error) {
        throw toStageError(CATALOG_SYNC_STAGE.WRITE_CORE, error)
      }

      if (visibleModelCount + hiddenModelCount !== coreModels.length) {
        throw new CatalogSyncStageError(CATALOG_SYNC_STAGE.VALIDATE_META, 'Catalog core meta count mismatch')
      }

      coreStats = {
        coreProviderRows: providerRows.length,
        coreModelRows: coreModels.length,
        coreTagRows: tags.length,
        providerSyncSkipped: !providerFetchOk,
        ftsBuildStatus: CATALOG_FTS_BUILD_STATUS,
      }
      logger.info('[CatalogSyncJob] stage end', {
        stage: CATALOG_SYNC_STAGE.WRITE_CORE,
        durationMs: Date.now() - coreStageStart,
        ...coreStats,
      })
    }

    logger.info('[CatalogSyncJob] sync end', {
      status: 'ok',
      durationMs: Date.now() - startedAtMs,
      snapshotId,
      providerKey: PROVIDERS.OPENROUTER,
      dataSource,
      modelCount: modelResult.models.length,
      legacyModelRows: legacyRows.length,
      coreProviderRows: coreStats?.coreProviderRows ?? 0,
      coreModelRows: coreStats?.coreModelRows ?? 0,
      coreTagRows: coreStats?.coreTagRows ?? 0,
      providerSyncSkipped: coreStats?.providerSyncSkipped ?? false,
      ftsBuildStatus: coreStats?.ftsBuildStatus ?? CATALOG_FTS_NOT_APPLICABLE,
    })

    return { ok: true, snapshotId, modelCount: modelResult.models.length, dataSource, baseUrl }
  } catch (error) {
    const stage = error instanceof CatalogSyncStageError ? error.stage : CATALOG_SYNC_STAGE.UNKNOWN
    logger.error('[CatalogSyncJob] sync end', {
      status: 'failed',
      durationMs: Date.now() - startedAtMs,
      snapshotId,
      providerKey: PROVIDERS.OPENROUTER,
      failureStage: stage,
      reason: toErrorMessage(error),
    })
    throw error
  }
}
