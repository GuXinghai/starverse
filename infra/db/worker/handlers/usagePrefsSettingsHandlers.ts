/* eslint-disable max-lines-per-function, max-statements, complexity, max-depth */
import type { DbWorkerRuntime } from '../runtime'
import type { RegisterHandler } from './types'
import { DbWorkerError } from '../../errors'
import {
  LogUsageSchema,
  GetProjectUsageStatsSchema,
  GetConvoUsageStatsSchema,
  GetModelUsageStatsSchema,
  GetDateRangeUsageStatsSchema,
  UsageAggregateSchema,
  UsageDrillDownSchema,
  SaveDashboardPrefSchema,
  DeleteDashboardPrefSchema,
  GetDashboardPrefsSchema,
  ModelPrefsListFavoritesSchema,
  ModelPrefsAddFavoriteSchema,
  ModelPrefsRemoveFavoriteSchema,
  ModelPrefsReorderFavoritesSchema,
  ModelPrefsListRecentsSchema,
  ModelPrefsRecordRecentSchema,
} from '../../validation'
export function registerUsagePrefsSettingsHandlers(register: RegisterHandler, runtime: DbWorkerRuntime) {
  const rt = runtime as any

  register('usage.log', (raw) => {
        const input = LogUsageSchema.parse(raw)
        rt.usageRepo.logUsage(input)
        return { ok: true }
    })

  register('usage.getProjectStats', (raw) => {
        const input = GetProjectUsageStatsSchema.parse(raw)
        return rt.usageRepo.getProjectStats(input.projectId, input.days)
    })

  register('usage.getConvoStats', (raw) => {
        const input = GetConvoUsageStatsSchema.parse(raw)
        return rt.usageRepo.getConvoStats(input.convoId, input.days)
    })

  register('usage.getModelStats', (raw) => {
        const input = GetModelUsageStatsSchema.parse(raw)
        return rt.usageRepo.getModelStats(input.model, input.days)
    })

  register('usage.getDateRangeStats', (raw) => {
        const input = GetDateRangeUsageStatsSchema.parse(raw)
        return rt.usageRepo.getDateRangeStats(input.startTime, input.endTime)
    })

  register('usage.aggregate', (raw) => {
        const input = UsageAggregateSchema.parse(raw ?? {})
        return rt.usageRepo.aggregateUsage(input)
    })

  register('usage.drillDown', (raw) => {
        const input = UsageDrillDownSchema.parse(raw ?? {})
        return rt.usageRepo.drillDown(input)
    })

  register('usage.reasoningTrend', (raw) => {
        const input = UsageAggregateSchema.parse(raw ?? {})
        return rt.usageRepo.getReasoningTrend(input)
    })

  register('usage.reasoningModelComparison', (raw) => {
        const input = UsageAggregateSchema.parse(raw ?? {})
        return rt.usageRepo.getReasoningModelComparison(input)
    })

    // ========== Dashboard Prefs ==========
  register('prefs.save', (raw) => {
        const input = SaveDashboardPrefSchema.parse(raw ?? {})
        return rt.dashboardPrefRepo.save(input)
    })

  register('prefs.list', (raw) => {
        const input = GetDashboardPrefsSchema.parse(raw ?? {})
        const items = rt.dashboardPrefRepo.list(input.userId)
        return { items }
    })

  register('prefs.delete', (raw) => {
        const input = DeleteDashboardPrefSchema.parse(raw ?? {})
        return rt.dashboardPrefRepo.delete(input)
    })

  register('prefs.default', (raw) => {
        const input = GetDashboardPrefsSchema.parse(raw ?? {})
        return rt.dashboardPrefRepo.getDefault(input.userId)
    })

    // ========== Model Preferences ==========
  register('modelPrefs.listFavorites', (raw) => {
        const input = ModelPrefsListFavoritesSchema.parse(raw ?? {})
        return rt.modelPreferencesRepo.listFavorites(input)
    })

  register('modelPrefs.addFavorite', (raw) => {
        const input = ModelPrefsAddFavoriteSchema.parse(raw ?? {})
        return rt.modelPreferencesRepo.addFavorite(input)
    })

  register('modelPrefs.removeFavorite', (raw) => {
        const input = ModelPrefsRemoveFavoriteSchema.parse(raw ?? {})
        return rt.modelPreferencesRepo.removeFavorite(input)
    })

  register('modelPrefs.reorderFavorites', (raw) => {
        const input = ModelPrefsReorderFavoritesSchema.parse(raw ?? {})
        return { items: rt.modelPreferencesRepo.reorderFavorites(input) }
    })

  register('modelPrefs.listRecents', (raw) => {
        const input = ModelPrefsListRecentsSchema.parse(raw ?? {})
        return rt.modelPreferencesRepo.listRecents(input)
    })

  register('modelPrefs.recordRecent', (raw) => {
        const input = ModelPrefsRecordRecentSchema.parse(raw ?? {})
        return rt.modelPreferencesRepo.recordRecent(input)
    })

    // ========== Model Catalog (Snapshot Sync) ==========
  register('modelCatalog.syncSnapshot', (raw) => {
        // Intentionally keep this as a single-writer DB entrypoint.
        // Validation is performed in the caller/job layer for this stage.
        rt.modelCatalogRepo.syncSnapshot(raw)
        return { ok: true }
    })

  register('modelCatalog.syncCoreSnapshot', (raw) => {
        rt.modelCatalogRepo.syncCoreSnapshot(raw)
        return { ok: true }
    })

  register('modelCatalog.list', (raw) => {
        const routerSource = raw?.routerSource
        if (!routerSource || typeof routerSource !== 'string') {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.list requires routerSource')
        }
        return rt.modelCatalogRepo.listByRouterSource(routerSource)
    })

  register('modelCatalog.getCoreMeta', (raw) => {
        const providerKey = raw?.providerKey
        if (!providerKey || typeof providerKey !== 'string') {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.getCoreMeta requires providerKey')
        }
        return rt.modelCatalogRepo.getCoreMeta(providerKey)
    })

  register('modelCatalog.getModelDetail', (raw) => {
        const providerKey = String(raw?.providerKey ?? '').trim()
        const modelId = String(raw?.modelId ?? '').trim()
        if (!providerKey || !modelId) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.getModelDetail requires providerKey/modelId')
        }
        return rt.modelCatalogRepo.getCoreModelDetail(providerKey, modelId)
    })

  register('modelCatalog.replaceEndpointMeta', (raw) => {
        const providerKey = String(raw?.providerKey ?? '').trim()
        const baseUrl = String(raw?.baseUrl ?? '').trim()
        const modelId = String(raw?.modelId ?? '').trim()
        const fetchedAtMs = Number(raw?.fetchedAtMs)
        const endpoints = Array.isArray(raw?.endpoints) ? raw.endpoints : null
        if (!providerKey || !baseUrl || !modelId) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.replaceEndpointMeta requires providerKey/baseUrl/modelId')
        }
        if (!Number.isFinite(fetchedAtMs)) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.replaceEndpointMeta requires fetchedAtMs')
        }
        if (!endpoints) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.replaceEndpointMeta requires endpoints[]')
        }
        const normalizedEndpoints = endpoints
          .map((row: any) => ({
            providerKey,
            baseUrl,
            modelId,
            endpointKey: String(row?.endpointKey ?? '').trim(),
            providerName: typeof row?.providerName === 'string' ? row.providerName : null,
            tag: typeof row?.tag === 'string' ? row.tag : null,
            quantization: typeof row?.quantization === 'string' ? row.quantization : null,
            contextLength:
              Number.isFinite(row?.contextLength) ? Number(row.contextLength) : null,
            maxCompletionTokens:
              Number.isFinite(row?.maxCompletionTokens) ? Number(row.maxCompletionTokens) : null,
            maxPromptTokens:
              Number.isFinite(row?.maxPromptTokens) ? Number(row.maxPromptTokens) : null,
            supportedParametersJson:
              typeof row?.supportedParametersJson === 'string' ? row.supportedParametersJson : null,
            supportsImplicitCaching:
              row?.supportsImplicitCaching === 0 || row?.supportsImplicitCaching === 1
                ? row.supportsImplicitCaching
                : null,
            status: null,
            rawJson: typeof row?.rawJson === 'string' ? row.rawJson : null,
          }))
          .filter((row: { endpointKey: string }) => row.endpointKey.length > 0)

        rt.modelCatalogRepo.replaceEndpointMetaByModel({
          providerKey,
          baseUrl,
          modelId,
          fetchedAtMs,
          endpoints: normalizedEndpoints,
        })
        return { ok: true }
    })

  register('modelCatalog.listEndpointMeta', (raw) => {
        const providerKey = String(raw?.providerKey ?? '').trim()
        const baseUrl = String(raw?.baseUrl ?? '').trim()
        const modelId = String(raw?.modelId ?? '').trim()
        if (!providerKey || !baseUrl || !modelId) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.listEndpointMeta requires providerKey/baseUrl/modelId')
        }
        return rt.modelCatalogRepo.listEndpointMetaByModel(providerKey, baseUrl, modelId)
    })

  register('modelCatalog.queryCore', (raw) => {
        const providerKey = raw?.sourceProviderKey ?? raw?.providerKey
        if (!providerKey || typeof providerKey !== 'string') {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.queryCore requires providerKey/sourceProviderKey')
        }
        const parseNumberRange = (
          value: unknown
        ): Readonly<{ min?: number; max?: number }> | undefined => {
          if (!value || typeof value !== 'object') return undefined
          const rawRange = value as { min?: unknown; max?: unknown }
          const min =
            typeof rawRange.min === 'number' && Number.isFinite(rawRange.min)
              ? rawRange.min
              : undefined
          const max =
            typeof rawRange.max === 'number' && Number.isFinite(rawRange.max)
              ? rawRange.max
              : undefined
          if (min === undefined && max === undefined) return undefined
          return { min, max }
        }
        const vendors = Array.isArray(raw?.vendors)
          ? raw.vendors.map((v: unknown) => String(v ?? '')).filter((v: string) => v.trim().length > 0)
          : []
        const providersAlias = Array.isArray(raw?.providers)
          ? raw.providers.map((v: unknown) => String(v ?? '')).filter((v: string) => v.trim().length > 0)
          : []
        const mergedVendors = Array.from(new Set([...vendors, ...providersAlias]))
        const allowedModalities = ['text', 'image', 'audio', 'video', 'file']

        const normalized = {
          providerKey: providerKey.trim(),
          searchText: typeof raw?.searchText === 'string' ? raw.searchText : undefined,
          includeDescriptionInSearch: raw?.includeDescriptionInSearch === true,
          vendors: mergedVendors.length > 0 ? mergedVendors : undefined,
          modelIds: Array.isArray(raw?.modelIds)
            ? Array.from(
                new Set(
                  raw.modelIds
                    .map((v: unknown) => String(v ?? '').trim())
                    .filter((v: string) => v.length > 0)
                )
              )
            : undefined,
          tags: Array.isArray(raw?.tags)
            ? raw.tags.map((v: unknown) => String(v ?? '')).filter((v: string) => v.trim().length > 0)
            : undefined,
          contextBuckets: Array.isArray(raw?.contextBuckets)
            ? raw.contextBuckets
                .map((v: unknown) => String(v ?? ''))
                .filter((v: string) => ['small', 'medium', 'large', 'xlarge', 'unknown'].includes(v))
            : undefined,
          contextLength: parseNumberRange(raw?.contextLength),
          maxOutputTokens: parseNumberRange(raw?.maxOutputTokens),
          expiringWithinDays:
            typeof raw?.expiringWithinDays === 'number' && Number.isFinite(raw.expiringWithinDays)
              ? Math.max(0, Math.floor(raw.expiringWithinDays))
              : undefined,
          priceBuckets: Array.isArray(raw?.priceBuckets)
            ? raw.priceBuckets
                .map((v: unknown) => String(v ?? ''))
                .filter((v: string) => ['cheap', 'standard', 'expensive', 'unknown'].includes(v))
            : undefined,
          hasPerRequestLimits:
            typeof raw?.hasPerRequestLimits === 'boolean'
              ? raw.hasPerRequestLimits
              : undefined,
          hasDefaultParameters:
            typeof raw?.hasDefaultParameters === 'boolean'
              ? raw.hasDefaultParameters
              : undefined,
          topProviderIsModerated:
            typeof raw?.topProviderIsModerated === 'boolean'
              ? raw.topProviderIsModerated
              : undefined,
          architectureModalities: Array.isArray(raw?.architectureModalities)
            ? raw.architectureModalities
                .map((v: unknown) => String(v ?? '').trim().toLowerCase())
                .filter((v: string) => v.length > 0)
            : undefined,
          tokenizers: Array.isArray(raw?.tokenizers)
            ? raw.tokenizers.map((v: unknown) => String(v ?? '')).filter((v: string) => v.trim().length > 0)
            : undefined,
          instructTypes: Array.isArray(raw?.instructTypes)
            ? raw.instructTypes.map((v: unknown) => String(v ?? '')).filter((v: string) => v.trim().length > 0)
            : undefined,
          modalities: Array.isArray(raw?.modalities)
            ? raw.modalities
                .map((v: unknown) => String(v ?? '').toLowerCase())
                .filter((v: string) => allowedModalities.includes(v))
            : undefined,
          inputModalities: Array.isArray(raw?.inputModalities)
            ? raw.inputModalities
                .map((v: unknown) => String(v ?? '').toLowerCase())
                .filter((v: string) => allowedModalities.includes(v))
            : undefined,
          outputModalities: Array.isArray(raw?.outputModalities)
            ? raw.outputModalities
                .map((v: unknown) => String(v ?? '').toLowerCase())
                .filter((v: string) => allowedModalities.includes(v))
            : undefined,
          supportedParameters: Array.isArray(raw?.supportedParameters)
            ? raw.supportedParameters
                .map((v: unknown) => String(v ?? '').trim())
                .filter((v: string) => v.length > 0)
            : undefined,
          sortBy:
            raw?.sortBy === 'created_at' ||
            raw?.sortBy === 'context_length' ||
            raw?.sortBy === 'max_output_tokens'
              ? raw.sortBy
              : 'name',
          sortOrder: raw?.sortOrder === 'desc' ? 'desc' : 'asc',
          limit: Number.isFinite(raw?.limit) ? Number(raw.limit) : undefined,
          cursor: raw?.cursor && typeof raw.cursor === 'object'
            ? {
                sortBy:
                  raw.cursor.sortBy === 'created_at' ||
                  raw.cursor.sortBy === 'context_length' ||
                  raw.cursor.sortBy === 'max_output_tokens'
                    ? raw.cursor.sortBy
                    : 'name',
                sortOrder: raw.cursor.sortOrder === 'desc' ? 'desc' : 'asc',
                name: typeof raw.cursor.name === 'string' ? raw.cursor.name : undefined,
                createdAtSec: Number.isFinite(raw.cursor.createdAtSec) ? Number(raw.cursor.createdAtSec) : undefined,
                contextLength: Number.isFinite(raw.cursor.contextLength) ? Number(raw.cursor.contextLength) : undefined,
                maxOutputTokens: Number.isFinite(raw.cursor.maxOutputTokens) ? Number(raw.cursor.maxOutputTokens) : undefined,
                modelKey: String(raw.cursor.modelKey ?? ''),
                providerKey: String(raw.cursor.providerKey ?? ''),
                modelId: String(raw.cursor.modelId ?? ''),
              }
            : undefined,
        }
        if (normalized.providerKey.length === 0) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.queryCore requires non-empty providerKey/sourceProviderKey')
        }
        return rt.modelCatalogRepo.queryCore(normalized)
    })

    // ========== Reasoning Model Index ==========
  register('reasoningIndex.syncFromCatalog', (raw) => {
        const routerSource = raw?.routerSource
        if (!routerSource || typeof routerSource !== 'string') {
          throw new DbWorkerError('ERR_VALIDATION', 'reasoningIndex.syncFromCatalog requires routerSource')
        }
        return rt.reasoningModelIndexRepo.syncFromCatalog(routerSource)
    })

  register('reasoningIndex.list', () => {
        return rt.reasoningModelIndexRepo.listAll()
    })

    // ========== Settings ==========
  register('settings.getOpenRouterProviderRequireParameters', () => {
        return { value: rt.settingsRepo.getOpenRouterProviderRequireParameters() }
    })

  register('settings.setOpenRouterProviderRequireParameters', (raw) => {
        const value = raw?.value
        if (typeof value !== 'boolean') {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setOpenRouterProviderRequireParameters requires boolean value')
        }
        rt.settingsRepo.setOpenRouterProviderRequireParameters(value)
        return { ok: true }
    })

  register('settings.getReasoningPrefs', () => {
        return { value: rt.settingsRepo.getReasoningPrefs() }
    })

  register('settings.setReasoningPrefs', (raw) => {
        const value = raw?.value
        if (value === undefined) {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setReasoningPrefs requires value')
        }
        rt.settingsRepo.setReasoningPrefs(value)
        return { ok: true }
    })

  register('settings.getWebSearchDefaults', () => {
        return { value: rt.settingsRepo.getWebSearchDefaults() }
    })

  register('settings.setWebSearchDefaults', (raw) => {
        if (!raw || typeof raw !== 'object' || !('value' in raw)) {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setWebSearchDefaults requires value')
        }
        rt.settingsRepo.setWebSearchDefaults((raw as any).value ?? null)
        return { ok: true }
    })

  register('settings.getSamplingParamsDefaults', () => {
        return { value: rt.settingsRepo.getSamplingParamsDefaults() }
    })

  register('settings.setSamplingParamsDefaults', (raw) => {
        if (!raw || typeof raw !== 'object' || !('value' in raw)) {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setSamplingParamsDefaults requires value')
        }
        rt.settingsRepo.setSamplingParamsDefaults((raw as any).value ?? null)
        return { ok: true }
    })

  register('settings.getImageGenerationDefault', () => {
        return { value: rt.settingsRepo.getImageGenerationDefault() }
    })

  register('settings.setImageGenerationDefault', (raw) => {
        if (!raw || typeof raw !== 'object' || !('value' in raw)) {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setImageGenerationDefault requires value')
        }
        rt.settingsRepo.setImageGenerationDefault((raw as any).value ?? null)
        return { ok: true }
    })

  register('settings.getUserMessageRenderDefault', () => {
        return { value: rt.settingsRepo.getUserMessageRenderDefault() }
    })

  register('settings.setUserMessageRenderDefault', (raw) => {
        const value = raw?.value
        if (typeof value !== 'boolean') {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setUserMessageRenderDefault requires boolean value')
        }
        rt.settingsRepo.setUserMessageRenderDefault(value)
        return { ok: true }
    })

  register('settings.getChatReasoningDisplayMode', () => {
        return { value: rt.settingsRepo.getChatReasoningDisplayMode() }
    })

  register('settings.setChatReasoningDisplayMode', (raw) => {
        const value = raw?.value
        if (value !== 'inline' && value !== 'rail') {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setChatReasoningDisplayMode requires inline|rail value')
        }
        rt.settingsRepo.setChatReasoningDisplayMode(value)
        return { ok: true }
    })

  register('settings.getChatReasoningPanelDefaultExpanded', () => {
        return { value: rt.settingsRepo.getChatReasoningPanelDefaultExpanded() }
    })

  register('settings.setChatReasoningPanelDefaultExpanded', (raw) => {
        const value = raw?.value
        if (typeof value !== 'boolean') {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setChatReasoningPanelDefaultExpanded requires boolean value')
        }
        rt.settingsRepo.setChatReasoningPanelDefaultExpanded(value)
        return { ok: true }
    })

  register('settings.getChatDraft', (raw) => {
        const key = String(raw?.key ?? '').trim()
        if (!key) {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.getChatDraft requires key')
        }
        return { value: rt.settingsRepo.getChatDraft(key) }
    })

  register('settings.setChatDraft', (raw) => {
        const key = String(raw?.key ?? '').trim()
        if (!key) {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setChatDraft requires key')
        }
        const value = typeof raw?.value === 'string' ? raw.value : String(raw?.value ?? '')
        rt.settingsRepo.setChatDraft(key, value)
        return { ok: true }
    })

  register('settings.deleteChatDraft', (raw) => {
        const key = String(raw?.key ?? '').trim()
        if (!key) {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.deleteChatDraft requires key')
        }
        return { deleted: rt.settingsRepo.deleteChatDraft(key) }
    })

  register('settings.deleteChatDraftsByPrefix', (raw) => {
        const prefix = String(raw?.prefix ?? '').trim()
        if (!prefix) {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.deleteChatDraftsByPrefix requires prefix')
        }
        return { deleted: rt.settingsRepo.deleteChatDraftsByPrefix(prefix) }
    })


}



