import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dbService } from '../services/db'
import type {
  ProjectUsageStats,
  ConvoUsageStats,
  ModelUsageStats,
  DateRangeStats
} from '../services/db'

export const useUsageStore = defineStore('usage', () => {
  // ========== State ==========
  const projectStats = ref<ProjectUsageStats | null>(null)
  const convoStats = ref<ConvoUsageStats | null>(null)
  const modelStats = ref<Record<string, ModelUsageStats>>({})
  const dateRangeStats = ref<DateRangeStats | null>(null)
  
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // 时间范围配置
  const timeRange = ref<number>(30) // 默认30天

  // ========== Getters ==========
  
  /**
   * 总使用量统计
   */
  const totalStats = computed(() => {
    if (!projectStats.value) return null
    
    const { total } = projectStats.value
    return {
      totalTokens: total.total_input + total.total_output,
      totalCost: total.total_cost,
      totalRequests: total.request_count,
      avgDuration: total.request_count > 0 
        ? total.total_duration / total.request_count 
        : 0
    }
  })

  /**
   * Token 分布
   */
  const tokenDistribution = computed(() => {
    if (!projectStats.value) return null
    
    const { total } = projectStats.value
    const totalTokens = total.total_input + total.total_output + total.total_cached + total.total_reasoning
    
    if (totalTokens === 0) return null
    
    return {
      input: (total.total_input / totalTokens) * 100,
      output: (total.total_output / totalTokens) * 100,
      cached: (total.total_cached / totalTokens) * 100,
      reasoning: (total.total_reasoning / totalTokens) * 100
    }
  })

  /**
   * 模型使用排名
   */
  const topModels = computed(() => {
    const models = Object.entries(modelStats.value)
      .map(([model, stats]) => ({
        model,
        totalTokens: stats.total.total_input + stats.total.total_output,
        cost: stats.total.total_cost,
        requests: stats.total.request_count
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 5)
    
    return models
  })

  // ========== Actions ==========

  /**
   * 加载项目统计
   */
  async function loadProjectStats(projectId: string, days: number = timeRange.value) {
    loading.value = true
    error.value = null
    
    try {
      projectStats.value = await dbService.getProjectUsageStats({
        projectId,
        days
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载项目统计失败'
      console.error('Failed to load project stats:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载对话统计
   */
  async function loadConvoStats(convoId: string, days: number = timeRange.value) {
    loading.value = true
    error.value = null
    
    try {
      convoStats.value = await dbService.getConvoUsageStats({
        convoId,
        days
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载对话统计失败'
      console.error('Failed to load convo stats:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载模型统计
   */
  async function loadModelStats(model: string, days: number = timeRange.value) {
    loading.value = true
    error.value = null
    
    try {
      const stats = await dbService.getModelUsageStats({
        model,
        days
      })
      modelStats.value[model] = stats
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载模型统计失败'
      console.error('Failed to load model stats:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载日期范围统计
   */
  async function loadDateRangeStats(startTime: number, endTime: number) {
    loading.value = true
    error.value = null
    
    try {
      dateRangeStats.value = await dbService.getDateRangeUsageStats({
        startTime,
        endTime
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载日期范围统计失败'
      console.error('Failed to load date range stats:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载常用模型的统计
   */
  async function loadTopModelsStats(models: string[], days: number = timeRange.value) {
    loading.value = true
    error.value = null
    
    try {
      await Promise.all(
        models.map(model => loadModelStats(model, days))
      )
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载模型统计失败'
      console.error('Failed to load top models stats:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新时间范围
   */
  function setTimeRange(days: number) {
    timeRange.value = days
  }

  /**
   * 重置状态
   */
  function reset() {
    projectStats.value = null
    convoStats.value = null
    modelStats.value = {}
    dateRangeStats.value = null
    error.value = null
    loading.value = false
  }

  return {
    // State
    projectStats,
    convoStats,
    modelStats,
    dateRangeStats,
    loading,
    error,
    timeRange,
    
    // Getters
    totalStats,
    tokenDistribution,
    topModels,
    
    // Actions
    loadProjectStats,
    loadConvoStats,
    loadModelStats,
    loadDateRangeStats,
    loadTopModelsStats,
    setTimeRange,
    reset
  }
})
