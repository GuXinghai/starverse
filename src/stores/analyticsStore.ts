import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dbService } from '../services/db'
import { analyticsRequestGuard } from '../utils/requestGuard'
import type {
  UsageAggregateParams,
  UsageAggregateResult,
  UsageDrillDownParams,
  UsageDrillDownResult
} from '../services/db'

type FilterState = {
  days: number
  provider?: string | null
  model?: string | null
  status?: 'success' | 'error' | 'canceled' | null
  projectId?: string | null
}

type SeriesPoint = { x: number; y: number }

export const useAnalyticsStore = defineStore('analytics', () => {
  const overview = ref<UsageAggregateResult | null>(null)
  const overviewStatus = ref<UsageAggregateResult | null>(null)
  const projectSeries = ref<Record<string, UsageAggregateResult>>({})
  const comparison = ref<UsageAggregateResult | null>(null)
  const reliability = ref<UsageAggregateResult | null>(null)
  const drilldown = ref<UsageDrillDownResult | null>(null)
  const reasoningTrend = ref<UsageAggregateResult | null>(null)
  const reasoningModelComparison = ref<UsageAggregateResult | null>(null)

  const loading = ref(false)
  const error = ref<string | null>(null)
  const cache = new Map<string, UsageAggregateResult | UsageDrillDownResult>()

  const tzOffsetMinutes = -new Date().getTimezoneOffset()

  const makeCacheKey = (type: string, params: unknown) => `${type}:${JSON.stringify(params)}`

  const toAggregateParams = (filters: FilterState, bucket: 'day' | 'hour' | 'week' = 'day'): UsageAggregateParams => {
    const startTime = Date.now() - filters.days * 24 * 60 * 60 * 1000
    return {
      bucket,
      filters: {
        startTime,
        endTime: Date.now(),
        provider: filters.provider ?? undefined,
        model: filters.model ?? undefined,
        status: filters.status ?? undefined,
        projectId: filters.projectId ?? undefined
      },
      timezoneOffsetMinutes: tzOffsetMinutes,
      limit: 500
    }
  }

  const loadAggregate = async (key: string, params: UsageAggregateParams) => {
    const cached = cache.get(key)
    if (cached && 'data' in cached) {
      return cached as UsageAggregateResult
    }
    const result = await dbService.aggregateUsage(params)
    cache.set(key, result)
    return result
  }

  const loadDrill = async (params: UsageDrillDownParams) => {
    const key = makeCacheKey('drill', params)
    const cached = cache.get(key)
    if (cached && 'data' in cached) {
      return cached as UsageDrillDownResult
    }
    const result = await dbService.drillDownUsage(params)
    cache.set(key, result)
    return result
  }

  const refreshOverview = async (filters: FilterState) => {
    loading.value = true
    error.value = null
    
    try {
      const result = await analyticsRequestGuard.run('overview', async () => {
        const baseParams = toAggregateParams(filters, 'day')
        const overviewKey = makeCacheKey('overview', { ...baseParams })
        const statusKey = makeCacheKey('overviewStatus', { ...baseParams, groupBy: ['status'] })

        const [series, statusSeries] = await Promise.all([
          loadAggregate(overviewKey, baseParams),
          loadAggregate(statusKey, { ...baseParams, groupBy: ['status'] })
        ])

        console.log('📊 [Store] refreshOverview loaded:', {
          overviewRows: series.data.length,
          statusRows: statusSeries.data.length
        })

        return { series, statusSeries }
      })

      // 如果 result 是 undefined，说明请求被取消或过期
      if (!result) return

      overview.value = result.series
      overviewStatus.value = result.statusSeries
    } catch (err: any) {
      error.value = err?.message || '加载概览失败'
    } finally {
      loading.value = false
    }
  }

  const refreshProject = async (projectId: string, filters: Omit<FilterState, 'projectId'>) => {
    try {
      const result = await analyticsRequestGuard.run('project', async () => {
        const params = toAggregateParams({ ...filters, projectId }, 'day')
        const key = makeCacheKey('project', params)
        return await loadAggregate(key, params)
      })

      if (!result) return
      projectSeries.value[projectId] = result
    } catch (err: any) {
      error.value = err?.message || '加载项目概览失败'
    }
  }

  const refreshComparison = async (filters: FilterState) => {
    loading.value = true
    error.value = null
    
    try {
      const result = await analyticsRequestGuard.run('comparison', async () => {
        const params = {
          ...toAggregateParams(filters, 'day'),
          groupBy: ['provider', 'model']
        }
        const key = makeCacheKey('comparison', params)
        return await loadAggregate(key, params as any)
      })

      if (!result) return
      comparison.value = result
    } catch (err: any) {
      error.value = err?.message || '加载对比数据失败'
    } finally {
      loading.value = false
    }
  }

  const refreshReliability = async (filters: FilterState) => {
    loading.value = true
    error.value = null
    
    try {
      const result = await analyticsRequestGuard.run('reliability', async () => {
        const baseParams = toAggregateParams(filters, 'day')
        const params = {
          ...baseParams,
          groupBy: ['error_code' as const, 'provider' as const, 'model' as const],
          filters: {
            ...baseParams.filters,
            status: 'error' as const
          }
        }
        const key = makeCacheKey('reliability', params)
        return await loadAggregate(key, params)
      })

      if (!result) return
      reliability.value = result
    } catch (err: any) {
      error.value = err?.message || '加载可靠性数据失败'
    } finally {
      loading.value = false
    }
  }

  const refreshDrilldown = async (filters: FilterState, limit = 50) => {
    loading.value = true
    error.value = null
    
    try {
      const result = await analyticsRequestGuard.run('drilldown', async () => {
        const startTime = Date.now() - filters.days * 24 * 60 * 60 * 1000
        const params: UsageDrillDownParams = {
          filters: {
            startTime,
            endTime: Date.now(),
            provider: filters.provider ?? undefined,
            model: filters.model ?? undefined,
            status: filters.status ?? undefined,
            projectId: filters.projectId ?? undefined
          },
          limit,
          sort: 'timestamp',
          order: 'desc'
        }
        return await loadDrill(params)
      })

      if (!result) return
      drilldown.value = result
    } catch (err: any) {
      error.value = err?.message || '加载明细失败'
    } finally {
      loading.value = false
    }
  }

  const clearCache = () => cache.clear()

  const refreshReasoningTrend = async (filters: FilterState) => {
    loading.value = true
    error.value = null
    
    try {
      const result = await analyticsRequestGuard.run('reasoningTrend', async () => {
        const params = toAggregateParams(filters, 'day')
        const key = makeCacheKey('reasoningTrend', params)
        const cached = cache.get(key)
        if (cached && 'data' in cached) {
          return cached as UsageAggregateResult
        }
        const data = await dbService.getReasoningTrend(params)
        cache.set(key, data)
        return data
      })

      if (!result) return
      reasoningTrend.value = result
    } catch (err: any) {
      error.value = err?.message || '加载推理趋势失败'
    } finally {
      loading.value = false
    }
  }

  const refreshReasoningModelComparison = async (filters: FilterState) => {
    loading.value = true
    error.value = null
    
    try {
      const result = await analyticsRequestGuard.run('reasoningModelComparison', async () => {
        const params = toAggregateParams(filters, 'day')
        const key = makeCacheKey('reasoningModelComparison', params)
        const cached = cache.get(key)
        if (cached && 'data' in cached) {
          return cached as UsageAggregateResult
        }
        const data = await dbService.getReasoningModelComparison(params)
        cache.set(key, data)
        return data
      })

      if (!result) return
      reasoningModelComparison.value = result
    } catch (err: any) {
      error.value = err?.message || '加载推理模型对比失败'
    } finally {
      loading.value = false
    }
  }

  const toSeries = (rows: UsageAggregateResult | null, field: keyof UsageAggregateResult['data'][number]): SeriesPoint[] => {
    if (!rows) {
      // console.log(`📊 [Store] toSeries(${String(field)}): rows is null`)
      return []
    }
    const result = rows.data
      .filter((r) => typeof r.bucket_start === 'number')
      .map((r) => ({ x: r.bucket_start as number, y: Number((r as any)[field] ?? 0) }))
    
    if (field === 'cost') {
      console.log(`📊 [Store] toSeries(${String(field)}):`, {
        inputRows: rows.data.length,
        outputPoints: result.length,
        sample: result.slice(0, 2)
      })
    }
    return result
  }

  return {
    overview,
    overviewStatus,
    projectSeries,
    comparison,
    reliability,
    drilldown,
    reasoningTrend,
    reasoningModelComparison,
    loading,
    error,
    refreshOverview,
    refreshProject,
    refreshComparison,
    refreshReliability,
    refreshDrilldown,
    refreshReasoningTrend,
    refreshReasoningModelComparison,
    toSeries,
    clearCache
  }
})
