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

    // ========== Scoped Model Catalog ==========
  register('modelCatalog.getScopedMeta', (raw) => {
        const providerKey = String(raw?.providerKey ?? '').trim()
        const catalogScopeKey = String(raw?.catalogScopeKey ?? '').trim()
        if (!providerKey || !catalogScopeKey) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.getScopedMeta requires providerKey/catalogScopeKey')
        }
        return rt.modelCatalogRepo.getScopedMeta(providerKey, catalogScopeKey)
    })

  register('modelCatalog.writeScopedSnapshot', (raw) => {
        if (raw && typeof raw === 'object' && 'apiKey' in raw) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.writeScopedSnapshot must not receive apiKey')
        }
        const providerKey = String(raw?.providerKey ?? '').trim()
        const catalogScopeKey = String(raw?.catalogScopeKey ?? '').trim()
        const baseUrl = String(raw?.baseUrl ?? '').trim()
        const dataSource = String(raw?.dataSource ?? '').trim()
        const snapshotId = String(raw?.snapshotId ?? '').trim()
        const syncedAtMs = Number(raw?.syncedAtMs)
        const schemaVersion = Number(raw?.schemaVersion)
        const models = Array.isArray(raw?.models) ? raw.models : null
        if (!providerKey || !catalogScopeKey || !baseUrl || !snapshotId) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.writeScopedSnapshot requires providerKey/catalogScopeKey/baseUrl/snapshotId')
        }
        if (dataSource !== 'models_user_primary' && dataSource !== 'models_fallback' && dataSource !== 'mixed') {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.writeScopedSnapshot requires valid dataSource')
        }
        if (!Number.isFinite(syncedAtMs) || !Number.isFinite(schemaVersion) || !models) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.writeScopedSnapshot requires syncedAtMs/schemaVersion/models')
        }
        return rt.modelCatalogRepo.writeScopedSnapshot({
          providerKey,
          catalogScopeKey,
          baseUrl,
          dataSource,
          snapshotId,
          snapshotChecksum: typeof raw?.snapshotChecksum === 'string' ? raw.snapshotChecksum : null,
          models,
          syncedAtMs,
          schemaVersion,
          pruneOldSnapshots: raw?.pruneOldSnapshots === true,
        })
    })

  register('modelCatalog.validateActiveScopedSnapshot', (raw) => {
        const providerKey = String(raw?.providerKey ?? '').trim()
        const catalogScopeKey = String(raw?.catalogScopeKey ?? '').trim()
        if (!providerKey || !catalogScopeKey) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.validateActiveScopedSnapshot requires providerKey/catalogScopeKey')
        }
        return rt.modelCatalogRepo.validateActiveScopedSnapshot(providerKey, catalogScopeKey)
    })

  register('modelCatalog.updateScopedMetaSyncError', (raw) => {
        if (raw && typeof raw === 'object' && 'apiKey' in raw) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.updateScopedMetaSyncError must not receive apiKey')
        }
        const providerKey = String(raw?.providerKey ?? '').trim()
        const catalogScopeKey = String(raw?.catalogScopeKey ?? '').trim()
        const baseUrl = String(raw?.baseUrl ?? '').trim()
        const dataSource = String(raw?.dataSource ?? '').trim()
        const lastErrorCode = String(raw?.lastErrorCode ?? '').trim()
        const lastErrorMessage = String(raw?.lastErrorMessage ?? '').trim()
        const atMs = Number(raw?.atMs)
        const schemaVersion = Number(raw?.schemaVersion)
        if (!providerKey || !catalogScopeKey || !baseUrl || !lastErrorCode) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.updateScopedMetaSyncError requires providerKey/catalogScopeKey/baseUrl/lastErrorCode')
        }
        if (dataSource !== 'models_user_primary' && dataSource !== 'models_fallback' && dataSource !== 'mixed') {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.updateScopedMetaSyncError requires valid dataSource')
        }
        if (!Number.isFinite(atMs) || !Number.isFinite(schemaVersion)) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.updateScopedMetaSyncError requires atMs/schemaVersion')
        }
        rt.modelCatalogRepo.updateScopedMetaSyncError({
          providerKey,
          catalogScopeKey,
          baseUrl,
          dataSource,
          lastErrorCode,
          lastErrorMessage,
          atMs,
          schemaVersion,
        })
        return { ok: true }
    })

  register('modelCatalog.queryScopedActive', (raw) => {
        if (raw && typeof raw === 'object' && 'apiKey' in raw) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.queryScopedActive must not receive apiKey')
        }
        const providerKey = String(raw?.providerKey ?? '').trim()
        const catalogScopeKey = String(raw?.catalogScopeKey ?? '').trim()
        if (!providerKey || !catalogScopeKey) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.queryScopedActive requires providerKey/catalogScopeKey')
        }
        return rt.modelCatalogRepo.queryScopedActiveModels({
          providerKey,
          catalogScopeKey,
          searchText: typeof raw?.searchText === 'string' ? raw.searchText : undefined,
          includeDescriptionInSearch: raw?.includeDescriptionInSearch === true,
          category: typeof raw?.category === 'string' ? raw.category : undefined,
          vendors: Array.isArray(raw?.vendors) ? raw.vendors.map((item: unknown) => String(item)) : undefined,
          providers: Array.isArray(raw?.providers) ? raw.providers.map((item: unknown) => String(item)) : undefined,
          modelIds: Array.isArray(raw?.modelIds) ? raw.modelIds.map((item: unknown) => String(item)) : undefined,
          capabilities: raw?.capabilities && typeof raw.capabilities === 'object'
            ? {
                ...(typeof raw.capabilities.reasoning === 'boolean' ? { reasoning: raw.capabilities.reasoning } : {}),
                ...(typeof raw.capabilities.tools === 'boolean' ? { tools: raw.capabilities.tools } : {}),
                ...(typeof raw.capabilities.structuredOutputs === 'boolean' ? { structuredOutputs: raw.capabilities.structuredOutputs } : {}),
                ...(typeof raw.capabilities.vision === 'boolean' ? { vision: raw.capabilities.vision } : {}),
                ...(typeof raw.capabilities.longContext === 'boolean' ? { longContext: raw.capabilities.longContext } : {}),
              }
            : undefined,
          contextLength: raw?.contextLength && typeof raw.contextLength === 'object' ? raw.contextLength : undefined,
          maxOutputTokens: raw?.maxOutputTokens && typeof raw.maxOutputTokens === 'object' ? raw.maxOutputTokens : undefined,
          modalities: Array.isArray(raw?.modalities) ? raw.modalities.map((item: unknown) => String(item)) : undefined,
          inputModalities: Array.isArray(raw?.inputModalities) ? raw.inputModalities.map((item: unknown) => String(item)) : undefined,
          outputModalities: Array.isArray(raw?.outputModalities) ? raw.outputModalities.map((item: unknown) => String(item)) : undefined,
          supportedParameters: Array.isArray(raw?.supportedParameters) ? raw.supportedParameters.map((item: unknown) => String(item)) : undefined,
          sortBy: raw?.sortBy,
          sortOrder: raw?.sortOrder,
          limit: Number(raw?.limit),
          cursor: raw?.cursor ?? null,
        })
    })

  register('modelCatalog.clearScopedCatalog', (raw) => {
        if (raw && typeof raw === 'object' && 'apiKey' in raw) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.clearScopedCatalog must not receive apiKey')
        }
        const providerKey = String(raw?.providerKey ?? '').trim()
        const catalogScopeKey = String(raw?.catalogScopeKey ?? '').trim()
        if (!providerKey || !catalogScopeKey) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.clearScopedCatalog requires providerKey/catalogScopeKey')
        }
        return rt.modelCatalogRepo.clearScopedCatalog(providerKey, catalogScopeKey)
    })

  register('modelCatalog.clearAllProviderScopedCatalog', (raw) => {
        if (raw && typeof raw === 'object' && 'apiKey' in raw) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.clearAllProviderScopedCatalog must not receive apiKey')
        }
        const providerKey = String(raw?.providerKey ?? '').trim()
        if (!providerKey) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.clearAllProviderScopedCatalog requires providerKey')
        }
        return rt.modelCatalogRepo.clearAllProviderScopedCatalog(providerKey)
    })

  register('modelCatalog.cleanupExpiredScopedCatalogCaches', (raw) => {
        if (raw && typeof raw === 'object' && 'apiKey' in raw) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.cleanupExpiredScopedCatalogCaches must not receive apiKey')
        }
        const providerKey = String(raw?.providerKey ?? '').trim()
        const nowMs = Number(raw?.nowMs)
        const retentionMs = Number(raw?.retentionMs)
        if (!providerKey || !Number.isFinite(nowMs) || !Number.isFinite(retentionMs)) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.cleanupExpiredScopedCatalogCaches requires providerKey/nowMs/retentionMs')
        }
        return rt.modelCatalogRepo.cleanupExpiredScopedCatalogCaches(providerKey, nowMs, retentionMs)
    })

  register('modelCatalog.clearDeprecatedOpenRouterCatalogCache', (raw) => {
        if (raw && typeof raw === 'object' && 'apiKey' in raw) {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.clearDeprecatedOpenRouterCatalogCache must not receive apiKey')
        }
        return rt.modelCatalogRepo.clearDeprecatedOpenRouterCatalogCache()
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

  register('settings.getDfcAttachmentDefaults', () => {
        return { value: rt.settingsRepo.getDfcAttachmentDefaults() }
    })

  register('settings.setDfcAttachmentDefaults', (raw) => {
        if (!raw || typeof raw !== 'object' || !('value' in raw)) {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setDfcAttachmentDefaults requires value')
        }
        rt.settingsRepo.setDfcAttachmentDefaults((raw as any).value ?? null)
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

  register('settings.getNetworkProxySettings', () => {
        return { value: rt.settingsRepo.getNetworkProxySettings() }
    })

  register('settings.setNetworkProxySettings', (raw) => {
        if (!raw || typeof raw !== 'object' || !('value' in raw)) {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setNetworkProxySettings requires value')
        }
        rt.settingsRepo.setNetworkProxySettings((raw as any).value)
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



