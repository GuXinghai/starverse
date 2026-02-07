/* eslint-disable max-lines-per-function, max-statements, complexity, max-depth */
import type { DbWorkerRuntime } from '../../worker'
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

    // ========== Model Catalog (Snapshot Sync) ==========
  register('modelCatalog.syncSnapshot', (raw) => {
        // Intentionally keep this as a single-writer DB entrypoint.
        // Validation is performed in the caller/job layer for this stage.
        rt.modelCatalogRepo.syncSnapshot(raw)
        return { ok: true }
    })

  register('modelCatalog.list', (raw) => {
        const routerSource = raw?.routerSource
        if (!routerSource || typeof routerSource !== 'string') {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.list requires routerSource')
        }
        return rt.modelCatalogRepo.listByRouterSource(routerSource)
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


}



