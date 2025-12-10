<template>
  <div class="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 text-gray-900 dark:text-white">
    <div class="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-8">
      <!-- 增强的头部区域 -->
      <header class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-6 md:p-8 shadow-2xl">
        <div class="absolute inset-0 bg-black/10"></div>
        <div class="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <div class="h-8 w-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <span class="text-xl">📊</span>
              </div>
              <p class="text-xs uppercase tracking-wider text-white/90 font-bold">Analytics Dashboard</p>
            </div>
            <h1 class="text-3xl md:text-4xl font-black text-white drop-shadow-lg">Starverse 数据中心</h1>
            <p class="text-sm text-white/80 max-w-md">成本分析 · 性能监控 · 错误追踪 · 模型对比</p>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <select v-model="filters.provider" class="header-input-chip">
              <option :value="null">🌐 全部 Provider</option>
              <option value="OpenRouter">OpenRouter</option>
              <option value="Gemini">Gemini</option>
            </select>
            <input v-model="filters.model" class="header-input-chip" placeholder="🔍 模型过滤..." />
            <select v-model="filters.status" class="header-input-chip">
              <option :value="null">📊 全部状态</option>
              <option value="success">✅ 成功</option>
              <option value="error">❌ 错误</option>
              <option value="canceled">⏹️ 已取消</option>
            </select>
            <select v-model.number="filters.days" class="header-input-chip">
              <option :value="7">📅 最近7天</option>
              <option :value="30">📅 最近30天</option>
              <option :value="90">📅 最近90天</option>
            </select>
            <select v-model="selectedViewId" class="header-input-chip">
              <option value="">👁️ 默认视图</option>
              <option v-for="view in prefsStore.views" :key="view.viewId" :value="view.viewId">
                {{ view.name }} {{ view.isDefault ? '⭐' : '' }}
              </option>
            </select>
            <button 
              class="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-sm font-medium rounded-lg transition-all duration-200 border border-white/30 hover:border-white/50 hover:scale-105 active:scale-95"
              @click="toggleEditMode"
            >
              {{ editMode.enabled ? '✅ 完成编辑' : '✏️ 编辑视图' }}
            </button>
          </div>
        </div>
      </header>

      <KpiGrid :kpis="kpis" />

      <!-- 全局概览区块 -->
      <section class="space-y-4 animate-fade-in">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <span class="text-xl">📈</span>
            </div>
            <div>
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white">全局概览</h2>
              <p class="text-xs text-gray-500 dark:text-slate-400">总体趋势与核心指标</p>
            </div>
          </div>
          <button 
            class="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
            @click="openDrilldown()"
          >
            🔍 查看明细
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <ChartCard
            title="总成本走势"
            subtitle="Cost over time"
            :value="formatCurrency(totalCost)"
            :points="seriesCost"
          />
          <ChartCard
            title="Tokens 走势"
            subtitle="输入/输出/缓存"
            :value="formatNumber(totalTokens)"
            :points="seriesTokens"
          />
          <ChartCard
            title="请求量"
            subtitle="Request volume"
            :value="formatNumber(totalRequests)"
            :points="seriesVolume"
          />
          <ChartCard
            title="平均耗时"
            subtitle="Latency (ms)"
            :value="formatNumber(avgLatency)"
            :points="seriesLatency"
          />
          <ChartCard
            title="P50 / P90"
            subtitle="Latency percentiles"
            :value="`${formatNumber(p50Latency)} / ${formatNumber(p90Latency)}`"
            :points="seriesLatency"
          />
          <ChartCard
            title="成功率"
            subtitle="Success vs Error"
            :value="`${Math.round(successRate * 100)}%`"
            :points="seriesSuccess"
          />
        </div>
      </section>

      <!-- 模型对比区块 -->
      <section class="space-y-4 animate-fade-in">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
            <span class="text-xl">⚖️</span>
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">模型与 Provider 对比</h2>
            <p class="text-xs text-gray-500 dark:text-slate-400">性能、成本与可靠性横向对比</p>
          </div>
        </div>
        <div v-if="comparisonRows.length === 0" class="rounded-2xl border-2 border-dashed border-gray-300 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/30 p-12 text-center">
          <div class="text-6xl mb-4">📊</div>
          <p class="text-lg font-medium text-gray-600 dark:text-slate-300 mb-2">暂无对比数据</p>
          <p class="text-sm text-gray-500 dark:text-slate-400">调整筛选条件以查看模型对比信息</p>
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div 
            v-for="row in comparisonRows" 
            :key="row.key" 
            class="group relative rounded-2xl border border-gray-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm hover:shadow-xl transition-all duration-300 p-5 overflow-hidden hover:scale-105 cursor-pointer"
          >
            <!-- 渐变背景装饰 -->
            <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            
            <div class="relative z-10 space-y-3">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <p class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">{{ row.provider }}</p>
                  <p class="text-lg font-bold text-gray-900 dark:text-white truncate" :title="row.model">{{ row.model }}</p>
                </div>
                <span class="text-xs px-2.5 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow-sm">对比</span>
              </div>
              
              <div class="grid grid-cols-2 gap-2">
                <div class="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-2">
                  <p class="text-xs text-gray-500 dark:text-slate-400 mb-0.5">成本/1k</p>
                  <p class="text-sm font-bold text-gray-900 dark:text-white">{{ formatCurrency(row.costPer1k) }}</p>
                </div>
                <div class="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-2">
                  <p class="text-xs text-gray-500 dark:text-slate-400 mb-0.5">成功率</p>
                  <p class="text-sm font-bold" :class="row.successRate > 0.95 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'">{{ Math.round(row.successRate * 100) }}%</p>
                </div>
              </div>
              
              <div class="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-2">
                <p class="text-xs text-gray-500 dark:text-slate-400 mb-0.5">平均耗时</p>
                <p class="text-sm font-bold text-gray-900 dark:text-white">{{ formatNumber(row.avgLatency) }} ms</p>
              </div>
              
              <div class="h-16 rounded-lg overflow-hidden bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-slate-800/30 dark:to-slate-800/30 p-2">
                <ChartCard
                  :title="''"
                  subtitle=""
                  :points="row.spark"
                  :value="''"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 可靠性分析区块 -->
      <section class="space-y-4 animate-fade-in">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg">
            <span class="text-xl">🛡️</span>
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">可靠性与错误分析</h2>
            <p class="text-xs text-gray-500 dark:text-slate-400">系统稳定性监控与异常追踪</p>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCard
            title="错误率趋势"
            subtitle="Error rate over time"
            :value="`${Math.round(errorRate * 100)}%`"
            :points="seriesErrors"
          />
          <div class="rounded-2xl border border-gray-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-gray-900 dark:text-white">Top 错误码</h3>
              <span class="text-xs px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold">{{ topErrorCodes.length }} 种</span>
            </div>
            <ul v-if="topErrorCodes.length > 0" class="space-y-2">
              <li v-for="(code, idx) in topErrorCodes" :key="code.code" class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                <div class="flex items-center gap-3">
                  <span class="text-lg font-bold text-gray-400 dark:text-slate-500">#{{ idx + 1 }}</span>
                  <span class="text-sm font-medium text-gray-900 dark:text-white">{{ code.code || '无错误码' }}</span>
                </div>
                <span class="text-sm font-bold text-red-600 dark:text-red-400">{{ code.count }} 次</span>
              </li>
            </ul>
            <div v-else class="text-center py-8 text-gray-500 dark:text-slate-400">
              <div class="text-4xl mb-2">✅</div>
              <p class="text-sm">暂无错误记录</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 推理 Token 分析区块 -->
      <section class="space-y-4 animate-fade-in">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center shadow-lg">
            <span class="text-xl">🧠</span>
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">推理 Token 分析</h2>
            <p class="text-xs text-gray-500 dark:text-slate-400">推理模型使用趋势与成本分析</p>
          </div>
        </div>
        <div v-if="hasReasoningData" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartCard
              title="推理 Token 走势"
              subtitle="Reasoning tokens over time"
              :value="formatNumber(totalReasoningTokens)"
              :points="seriesReasoningTokens"
            />
            <ChartCard
              title="推理 Token 占比"
              subtitle="Reasoning ratio"
              :value="`${Math.round(avgReasoningRatio * 100)}%`"
              :points="seriesReasoningRatio"
            />
          </div>
          <div class="rounded-2xl border border-gray-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-gray-900 dark:text-white">模型推理能力对比</h3>
              <span class="text-xs px-2.5 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 font-semibold">{{ reasoningModelRows.length }} 个模型</span>
            </div>
            <div class="space-y-2">
              <div v-for="model in reasoningModelRows" :key="`${model.provider}-${model.model}`" class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase">{{ model.provider }}</span>
                    <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ model.model }}</span>
                  </div>
                  <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
                    <span>推理 Token: <strong class="text-gray-900 dark:text-white">{{ formatNumber(model.reasoning_tokens) }}</strong></span>
                    <span>占比: <strong class="text-gray-900 dark:text-white">{{ Math.round(model.reasoning_ratio * 100) }}%</strong></span>
                    <span>使用率: <strong class="text-gray-900 dark:text-white">{{ Math.round(model.reasoning_usage_rate * 100) }}%</strong></span>
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-sm font-bold text-gray-900 dark:text-white">{{ formatCurrency(model.cost_per_1k_reasoning) }}</div>
                  <div class="text-xs text-gray-500 dark:text-slate-400">/1k 推理</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="rounded-2xl border-2 border-dashed border-gray-300 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/30 p-12 text-center">
          <div class="text-6xl mb-4">🧠</div>
          <p class="text-lg font-medium text-gray-600 dark:text-slate-300 mb-2">暂无推理数据</p>
          <p class="text-sm text-gray-500 dark:text-slate-400">当前筛选条件下没有使用推理功能的请求</p>
        </div>
      </section>

      <!-- 请求明细区块 -->
      <section class="space-y-4 animate-fade-in">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center shadow-lg">
            <span class="text-xl">📋</span>
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">请求明细</h2>
            <p class="text-xs text-gray-500 dark:text-slate-400">全部请求记录与详细信息</p>
          </div>
        </div>
        <DrillDownTable :rows="drillRows" />
      </section>
    </div>

    <!-- 编辑面板 -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div v-if="editMode.enabled" class="fixed bottom-6 right-6 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl rounded-2xl p-5 w-80 z-50 backdrop-blur-xl bg-white/95 dark:bg-slate-900/95">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <div class="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span class="text-white text-sm">✏️</span>
            </div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">编辑视图</h3>
          </div>
          <button 
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            @click="toggleEditMode"
          >
            ✕
          </button>
        </div>
        
        <div class="space-y-2 max-h-72 overflow-y-auto pr-2 mb-4 custom-scrollbar">
          <div 
            v-for="w in widgetsSorted" 
            :key="w.id" 
            class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <label class="flex items-center gap-3 flex-1 cursor-pointer">
              <input 
                type="checkbox" 
                v-model="w.visible" 
                class="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ w.label }}</span>
            </label>
            <div class="flex gap-1">
              <button 
                class="p-1.5 rounded bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shadow-sm"
                @click="moveWidget(w.id, -1)"
                title="上移"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button 
                class="p-1.5 rounded bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shadow-sm"
                @click="moveWidget(w.id, 1)"
                title="下移"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <input 
          v-model="editMode.name" 
          placeholder="✨ 输入视图名称..." 
          class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
        />
        
        <div class="flex gap-2 mt-4">
          <button 
            class="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-900 dark:text-white text-sm font-medium rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
            @click="saveCurrentView(false)"
          >
            💾 保存
          </button>
          <button 
            class="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
            @click="saveCurrentView(true)"
          >
            ⭐ 设为默认
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch, onMounted, ref } from 'vue'
import { useAnalyticsStore } from '../stores/analyticsStore'
import { useDashboardPrefsStore } from '../stores/dashboardPrefs'
import KpiGrid from './analytics/KpiGrid.vue'
import ChartCard from './analytics/ChartCard.vue'
import DrillDownTable from './analytics/DrillDownTable.vue'

const analytics = useAnalyticsStore()
const prefsStore = useDashboardPrefsStore()

const filters = reactive({
  days: 30,
  provider: null as string | null,
  model: null as string | null,
  status: null as 'success' | 'error' | 'canceled' | null,
  projectId: null as string | null
})

const widgets = reactive([
  { id: 'cost', label: '总成本走势', visible: true, order: 0 },
  { id: 'tokens', label: 'Tokens 走势', visible: true, order: 1 },
  { id: 'volume', label: '请求量', visible: true, order: 2 },
  { id: 'latency', label: '平均耗时', visible: true, order: 3 },
  { id: 'p50p90', label: 'P50/P90', visible: true, order: 4 },
  { id: 'success', label: '成功率', visible: true, order: 5 }
])

const editMode = reactive({
  enabled: false,
  name: ''
})

const kpis = computed(() => [
  { label: '总成本', value: formatCurrency(totalCost.value), icon: '💰' },
  { label: '成本/1k', value: formatCurrency(costPer1k.value), icon: '🏷️' },
  { label: '有效 Tokens', value: formatNumber(effectiveTokens.value), icon: '🔢' },
  { label: '请求次数', value: formatNumber(totalRequests.value), icon: '📡' },
  { label: '平均耗时', value: `${formatNumber(avgLatency.value)} ms`, icon: '⏱️' },
  { label: 'P50 / P90', value: `${formatNumber(p50Latency.value)} / ${formatNumber(p90Latency.value)} ms`, icon: '🎯' },
  { label: '成功率', value: `${Math.round(successRate.value * 100)}%`, icon: '✅' },
  { label: '错误率', value: `${Math.round(errorRate.value * 100)}%`, icon: '⚠️' },
  { label: '已取消', value: `${Math.round(canceledRate.value * 100)}%`, icon: '⏹️' }
])

const totalCost = computed(() => sumField('cost'))
const totalTokens = computed(() => sumField('tokens_total'))
const effectiveTokens = computed(() => sumField('effective_tokens'))
const totalRequests = computed(() => sumField('request_count'))
const avgLatency = computed(() => averageField('avg_latency'))
const p50Latency = computed(() => averageField('p50_latency'))
const p90Latency = computed(() => averageField('p90_latency'))
const successRate = computed(() => computeRate('success'))
const errorRate = computed(() => computeRate('error'))
const canceledRate = computed(() => averageField('canceled_rate'))
const costPer1k = computed(() => {
  const tokens = totalTokens.value || 1
  return (totalCost.value / tokens) * 1000
})

const seriesCost = computed(() => analytics.toSeries(analytics.overview, 'cost'))
const seriesTokens = computed(() => analytics.toSeries(analytics.overview, 'tokens_total'))
const seriesVolume = computed(() => analytics.toSeries(analytics.overview, 'request_count'))
const seriesLatency = computed(() => analytics.toSeries(analytics.overview, 'avg_latency'))
const seriesSuccess = computed(() => analytics.toSeries(analytics.overviewStatus, 'success_rate'))
const seriesErrors = computed(() => analytics.toSeries(analytics.overviewStatus, 'error_rate'))

const comparisonRows = computed(() => {
  if (!analytics.comparison) return []
  return analytics.comparison.data.map((row) => ({
    key: `${row.provider}-${row.model}`,
    provider: row.provider ?? 'N/A',
    model: row.model ?? 'N/A',
    costPer1k: row.cost_per_1k_tokens ?? 0,
    successRate: row.success_rate ?? 0,
    avgLatency: row.avg_latency ?? 0,
    spark: [{ x: 0, y: 0 }, { x: 1, y: row.cost ?? 0 }]
  }))
})

const topErrorCodes = computed(() => {
  if (!analytics.reliability) return []
  const byCode: Record<string, number> = {}
  for (const row of analytics.reliability.data) {
    const code = row.error_code || '无'
    byCode[code] = (byCode[code] || 0) + row.request_count
  }
  return Object.entries(byCode)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
})

const drillRows = computed(() => analytics.drilldown?.data ?? [])
const widgetsSorted = computed(() => [...widgets].sort((a, b) => a.order - b.order))
const selectedViewId = ref<string>('')

// 推理 Token 相关计算属性
const hasReasoningData = computed(() => {
  return analytics.reasoningTrend?.data && analytics.reasoningTrend.data.length > 0
})

const totalReasoningTokens = computed(() => {
  if (!analytics.reasoningTrend) return 0
  return analytics.reasoningTrend.data.reduce((acc, row: any) => acc + Number(row.tokens_reasoning ?? 0), 0)
})

const avgReasoningRatio = computed(() => {
  if (!analytics.reasoningTrend || analytics.reasoningTrend.data.length === 0) return 0
  return analytics.reasoningTrend.data.reduce((acc, row: any) => acc + Number(row.reasoning_ratio ?? 0), 0) / analytics.reasoningTrend.data.length
})

const seriesReasoningTokens = computed(() => analytics.toSeries(analytics.reasoningTrend, 'tokens_reasoning' as any))
const seriesReasoningRatio = computed(() => analytics.toSeries(analytics.reasoningTrend, 'reasoning_ratio' as any))

const reasoningModelRows = computed(() => {
  if (!analytics.reasoningModelComparison) return []
  return analytics.reasoningModelComparison.data.map((row: any) => ({
    provider: row.provider ?? 'N/A',
    model: row.model ?? 'N/A',
    reasoning_tokens: row.tokens_reasoning ?? 0,
    reasoning_ratio: row.reasoning_ratio ?? 0,
    reasoning_usage_rate: row.reasoning_usage_rate ?? 0,
    cost_per_1k_reasoning: row.cost_per_1k_reasoning ?? 0
  })).slice(0, 10) // Top 10 models
})

const sumField = (field: keyof any) => {
  if (!analytics.overview) return 0
  return analytics.overview.data.reduce((acc, row) => acc + Number((row as any)[field] ?? 0), 0)
}

const averageField = (field: keyof any) => {
  if (!analytics.overview || analytics.overview.data.length === 0) return 0
  return (
    analytics.overview.data.reduce((acc, row) => acc + Number((row as any)[field] ?? 0), 0) /
    analytics.overview.data.length
  )
}

function computeRate(kind: 'success' | 'error' | 'canceled') {
  if (!analytics.overviewStatus) return 0
  const successRow = analytics.overviewStatus.data.find((r) => r.status === 'success')
  const errorRow = analytics.overviewStatus.data.find((r) => r.status === 'error')
  const canceledRow = analytics.overviewStatus.data.find((r) => r.status === 'canceled')
  
  // 计算成功率和错误率时排除 canceled（只计算有效请求）
  const effectiveTotal = (successRow?.request_count ?? 0) + (errorRow?.request_count ?? 0) || 1
  const allTotal = effectiveTotal + (canceledRow?.request_count ?? 0) || 1
  
  if (kind === 'success') {
    return (successRow?.request_count ?? 0) / effectiveTotal
  } else if (kind === 'error') {
    return (errorRow?.request_count ?? 0) / effectiveTotal
  } else {
    // canceled 相对于所有请求的比例
    return (canceledRow?.request_count ?? 0) / allTotal
  }
}

const formatCurrency = (v: number | string) => {
  const num = typeof v === 'string' ? Number(v) : v
  return `$${(num ?? 0).toFixed(3)}`
}
const formatNumber = (v: number | string) => {
  const num = typeof v === 'string' ? Number(v) : v
  return Math.round(num ?? 0).toLocaleString()

}

const openDrilldown = () => {
  analytics.refreshDrilldown(filters)
}

const moveWidget = (id: string, delta: number) => {
  const target = widgets.find((w) => w.id === id)
  if (!target) return
  target.order += delta
}

const toggleEditMode = () => {
  editMode.enabled = !editMode.enabled
}

const saveCurrentView = async (setDefault: boolean) => {
  const layout = widgetsSorted.value.map((w, idx) => ({ id: w.id, visible: w.visible, order: idx }))
  const name = editMode.name || '自定义视图'
  const saved = await prefsStore.saveView({
    name,
    layout,
    filters: { ...filters },
    viewId: selectedViewId.value || undefined,
    setDefault
  })
  selectedViewId.value = saved.viewId
  editMode.enabled = false
  editMode.name = ''
}

const applyView = (viewId: string) => {
  if (!viewId) return
  const view = prefsStore.views.find((v) => v.viewId === viewId)
  if (!view) return
  view.layout.forEach((w) => {
    const local = widgets.find((x) => x.id === w.id)
    if (local) {
      local.visible = w.visible
      local.order = w.order
    }
  })
  if (view.filters) {
    Object.assign(filters, view.filters)
  }
}

watch(
  () => ({ ...filters }),
  (val) => {
    analytics.refreshOverview(val)
    analytics.refreshComparison(val)
    analytics.refreshReliability(val)
    analytics.refreshDrilldown(val)
    analytics.refreshReasoningTrend(val)
    analytics.refreshReasoningModelComparison(val)
  },
  { deep: true, immediate: true }
)

onMounted(() => {
  // 移除重复调用 - watch 已经会在 immediate: true 时自动触发
  prefsStore.listViews().then(() => {
    const def = prefsStore.views.find((v) => v.isDefault)
    if (def) {
      selectedViewId.value = def.viewId
      applyView(def.viewId)
    }
  })
})

watch(selectedViewId, (id) => {
  if (id) {
    applyView(id)
  }
})

// 🔍 Debug Logging
watch(() => analytics.overview, (val) => {
  console.log('📊 [UI] AnalyticsView: overview updated', {
    hasData: !!val,
    rowCount: val?.data?.length ?? 0,
    firstRow: val?.data?.[0]
  })
}, { deep: true })

watch(seriesCost, (val) => {
  console.log('📊 [UI] AnalyticsView: seriesCost computed', {
    pointsCount: val.length,
    firstPoint: val[0],
    lastPoint: val[val.length - 1]
  })
})
</script>

<style scoped>
@reference "../style.css";

.header-input-chip {
  @apply bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg px-3 py-2 text-sm text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 hover:bg-white/30 transition-all duration-200;
}

.header-input-chip option {
  @apply bg-slate-900 text-white;
}

.input-chip {
  @apply bg-white dark:bg-slate-900/70 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  @apply bg-gray-100 dark:bg-slate-800 rounded-full;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  @apply bg-gray-300 dark:bg-slate-600 rounded-full hover:bg-gray-400 dark:hover:bg-slate-500;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.5s ease-out;
}
</style>
