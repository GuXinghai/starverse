<template>
  <div class="rounded-2xl border border-gray-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden">
    <div class="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-slate-800/50 dark:to-slate-800/30 border-b border-gray-200 dark:border-slate-800">
      <div class="flex items-center gap-3">
        <div class="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
          <span class="text-white text-sm">📋</span>
        </div>
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">请求明细</h3>
      </div>
      <slot name="actions" />
    </div>
    
    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-100 dark:bg-slate-900/80 text-gray-600 dark:text-slate-300">
          <tr>
            <th class="text-left px-6 py-3 font-semibold uppercase tracking-wider text-xs">时间</th>
            <th class="text-left px-6 py-3 font-semibold uppercase tracking-wider text-xs">模型</th>
            <th class="text-left px-6 py-3 font-semibold uppercase tracking-wider text-xs">Provider</th>
            <th class="text-left px-6 py-3 font-semibold uppercase tracking-wider text-xs">成本</th>
            <th class="text-left px-6 py-3 font-semibold uppercase tracking-wider text-xs">Tokens</th>
            <th class="text-left px-6 py-3 font-semibold uppercase tracking-wider text-xs">耗时</th>
            <th class="text-left px-6 py-3 font-semibold uppercase tracking-wider text-xs">状态</th>
          </tr>
        </thead>
        <tbody v-if="rows.length > 0">
          <tr 
            v-for="row in rows" 
            :key="row.id" 
            class="border-t border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <td class="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white font-medium">{{ formatTs(row.timestamp) }}</td>
            <td class="px-6 py-4 text-gray-700 dark:text-slate-200">
              <span class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                {{ row.model }}
              </span>
            </td>
            <td class="px-6 py-4 text-gray-700 dark:text-slate-200 font-medium">{{ row.provider }}</td>
            <td class="px-6 py-4 text-gray-700 dark:text-slate-200 font-mono">{{ formatCurrency(row.cost) }}</td>
            <td class="px-6 py-4 text-gray-700 dark:text-slate-200 font-mono">{{ row.tokens_input + row.tokens_output }}</td>
            <td class="px-6 py-4 text-gray-700 dark:text-slate-200 font-mono">{{ formatMs(row.duration_ms) }}</td>
            <td class="px-6 py-4">
              <span
                class="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold shadow-sm"
                :class="row.status === 'success'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                  : row.status === 'error'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                  : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800'"
              >
                {{ row.status === 'success' ? '✅' : row.status === 'error' ? '❌' : '⏹️' }}
                {{ row.status }}
              </span>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr>
            <td colspan="7" class="px-6 py-12 text-center">
              <div class="flex flex-col items-center justify-center text-gray-400 dark:text-slate-500">
                <svg class="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p class="text-lg font-medium mb-1">暂无请求记录</p>
                <p class="text-sm">调整筛选条件以查看更多数据</p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UsageDrillDownRow } from '../../services/db'

defineProps<{
  rows: UsageDrillDownRow[]
}>()

const formatTs = (ts: number) => {
  const d = new Date(ts)
  return d.toLocaleString()
}

const formatCurrency = (v: number) => `$${v.toFixed(4)}`
const formatMs = (v: number) => `${Math.round(v)} ms`
</script>
