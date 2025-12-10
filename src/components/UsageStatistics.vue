<template>
  <div class="usage-statistics-view h-full overflow-y-auto bg-gray-50">
    <div class="max-w-7xl mx-auto p-6">
      <!-- 头部 -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold mb-2 text-gray-900">
          使用量统计
        </h1>
        <p class="text-sm text-gray-600">
          AI 对话使用量分析与成本统计
        </p>
      </div>

      <!-- 时间范围选择器 -->
      <div class="mb-6 flex gap-2">
        <button v-for="range in timeRanges" 
                :key="range.days"
                @click="selectTimeRange(range.days)"
                class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                :class="[
                  timeRange === range.days
                    ? 'bg-blue-500 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                ]">
          {{ range.label }}
        </button>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-500"></div>
      </div>

      <!-- 错误提示 -->
      <div v-else-if="error" 
           class="rounded-lg p-4 mb-6 bg-red-50 border border-red-200">
        <p class="text-sm text-red-600">
          {{ error }}
        </p>
      </div>

      <!-- 统计卡片网格 -->
      <template v-else-if="totalStats">
        <!-- 总览卡片 -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <UsageStatsCard
            title="总 Tokens"
            :value="totalStats.totalTokens"
            icon="🔢"
            subtitle="输入 + 输出"
            format-type="number"
          />
          
          <UsageStatsCard
            title="总费用"
            :value="totalStats.totalCost"
            icon="💰"
            subtitle="所有对话累计"
            format-type="currency"
          />
          
          <UsageStatsCard
            title="请求次数"
            :value="totalStats.totalRequests"
            icon="📊"
            subtitle="API 调用总数"
            format-type="number"
          />
          
          <UsageStatsCard
            title="平均耗时"
            :value="totalStats.avgDuration"
            icon="⏱️"
            subtitle="每次请求平均"
            format-type="duration"
          />
        </div>

        <!-- Token 分布 -->
        <div v-if="tokenDistribution" 
             class="rounded-lg border p-6 mb-6 bg-white border-gray-200">
          <h2 class="text-lg font-semibold mb-4 text-gray-900">
            Token 分布
          </h2>
          
          <div class="space-y-3">
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-700">
                  输入 Tokens
                </span>
                <span class="text-gray-600">
                  {{ tokenDistribution.input.toFixed(1) }}%
                </span>
              </div>
              <div class="w-full h-2 rounded-full overflow-hidden bg-gray-200">
                <div class="h-full bg-blue-500 transition-all"
                     :style="{ width: `${tokenDistribution.input}%` }"></div>
              </div>
            </div>

            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-700">
                  输出 Tokens
                </span>
                <span class="text-gray-600">
                  {{ tokenDistribution.output.toFixed(1) }}%
                </span>
              </div>
              <div class="w-full h-2 rounded-full overflow-hidden bg-gray-200">
                <div class="h-full bg-green-500 transition-all"
                     :style="{ width: `${tokenDistribution.output}%` }"></div>
              </div>
            </div>

            <div v-if="tokenDistribution.cached > 0">
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-700">
                  缓存 Tokens
                </span>
                <span class="text-gray-600">
                  {{ tokenDistribution.cached.toFixed(1) }}%
                </span>
              </div>
              <div class="w-full h-2 rounded-full overflow-hidden bg-gray-200">
                <div class="h-full bg-purple-500 transition-all"
                     :style="{ width: `${tokenDistribution.cached}%` }"></div>
              </div>
            </div>

            <div v-if="tokenDistribution.reasoning > 0">
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-700">
                  推理 Tokens
                </span>
                <span class="text-gray-600">
                  {{ tokenDistribution.reasoning.toFixed(1) }}%
                </span>
              </div>
              <div class="w-full h-2 rounded-full overflow-hidden bg-gray-200">
                <div class="h-full bg-orange-500 transition-all"
                     :style="{ width: `${tokenDistribution.reasoning}%` }"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 详细统计 -->
        <div v-if="projectStats" 
             class="rounded-lg border p-6 bg-white border-gray-200">
          <h2 class="text-lg font-semibold mb-4 text-gray-900">
            详细统计
          </h2>
          
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div class="mb-1 text-gray-600">
                输入 Tokens
              </div>
              <div class="font-semibold text-gray-900">
                {{ projectStats.total.total_input.toLocaleString() }}
              </div>
            </div>

            <div>
              <div class="mb-1 text-gray-600">
                输出 Tokens
              </div>
              <div class="font-semibold text-gray-900">
                {{ projectStats.total.total_output.toLocaleString() }}
              </div>
            </div>

            <div v-if="projectStats.total.total_cached > 0">
              <div class="mb-1 text-gray-600">
                缓存 Tokens
              </div>
              <div class="font-semibold text-gray-900">
                {{ projectStats.total.total_cached.toLocaleString() }}
              </div>
            </div>

            <div v-if="projectStats.total.total_reasoning > 0">
              <div class="mb-1 text-gray-600">
                推理 Tokens
              </div>
              <div class="font-semibold text-gray-900">
                {{ projectStats.total.total_reasoning.toLocaleString() }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-else 
           class="flex flex-col items-center justify-center py-12">
        <div class="text-6xl mb-4">📊</div>
        <p class="text-lg font-medium mb-2 text-gray-700">
          暂无使用数据
        </p>
        <p class="text-sm text-gray-500">
          开始使用 AI 对话功能后，这里将显示统计信息
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useUsageStore } from '../stores/usageStore'
import { useProjectWorkspaceStore } from '../stores/projectWorkspaceStore'
import UsageStatsCard from './atoms/UsageStatsCard.vue'

const usageStore = useUsageStore()
const projectWorkspaceStore = useProjectWorkspaceStore()

const timeRange = computed(() => usageStore.timeRange)
const loading = computed(() => usageStore.loading)
const error = computed(() => usageStore.error)
const projectStats = computed(() => usageStore.projectStats)
const totalStats = computed(() => usageStore.totalStats)
const tokenDistribution = computed(() => usageStore.tokenDistribution)

const timeRanges = [
  { label: '7天', days: 7 },
  { label: '30天', days: 30 },
  { label: '90天', days: 90 },
  { label: '全部', days: 365 }
]

function selectTimeRange(days: number) {
  usageStore.setTimeRange(days)
  loadStats()
}

async function loadStats() {
  const currentWorkspace = projectWorkspaceStore.currentWorkspace
  if (!currentWorkspace) {
    console.warn('No current project selected')
    return
  }

  await usageStore.loadProjectStats(currentWorkspace.id, timeRange.value)
}

onMounted(() => {
  loadStats()
})

// 监听项目切换
watch(
  () => projectWorkspaceStore.activeProjectId,
  (newProjectId) => {
    if (newProjectId) {
      loadStats()
    }
  }
)
</script>

<style scoped>
.usage-statistics-view {
  /* 确保滚动条样式与主题一致 */
}
</style>
