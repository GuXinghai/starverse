<template>
  <div class="group rounded-2xl border border-gray-200/70 bg-gradient-to-br from-white via-white to-gray-50/50 dark:from-slate-900/80 dark:via-slate-900/60 dark:to-slate-900/40 dark:border-slate-800 shadow-md hover:shadow-xl transition-all duration-300 p-5 flex flex-col gap-4 hover:scale-105 overflow-hidden relative">
    <!-- 装饰性背景 -->
    <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
    
    <div class="relative z-10">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <p class="text-xs uppercase tracking-wider text-gray-500 dark:text-slate-400 font-semibold mb-1">{{ subtitle }}</p>
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">{{ title }}</h3>
        </div>
        <div class="text-right">
          <div class="text-2xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">{{ value }}</div>
          <p v-if="hint" class="text-xs text-gray-500 dark:text-slate-400 mt-1">{{ hint }}</p>
        </div>
      </div>
      
      <div class="h-32 rounded-lg overflow-hidden bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-slate-800/30 dark:to-slate-800/30 p-2">
        <svg v-if="points.length > 1" :viewBox="`0 0 ${width} ${height}`" class="w-full h-full">
          <defs>
            <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="rgba(99, 102, 241, 0.4)" />
              <stop offset="100%" stop-color="rgba(99, 102, 241, 0.05)" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <path :d="areaPath" fill="url(#chartFill)" />
          <path 
            :d="linePath" 
            class="stroke-[3] transition-all duration-300 group-hover:stroke-[4]" 
            stroke="url(#lineGradient)" 
            fill="none" 
            stroke-linecap="round" 
            stroke-linejoin="round"
            filter="url(#glow)"
          />
          <defs>
            <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stop-color="#6366F1" />
              <stop offset="50%" stop-color="#A855F7" />
              <stop offset="100%" stop-color="#EC4899" />
            </linearGradient>
          </defs>
        </svg>
        <div v-else class="h-full flex flex-col items-center justify-center text-gray-400 dark:text-slate-500">
          <svg class="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p class="text-xs">暂无数据</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type Point = { x: number; y: number }

const props = defineProps<{
  title: string
  subtitle?: string
  value?: string | number
  hint?: string
  points: Point[]
}>()

const width = 200
const height = 100

const normalized = computed(() => {
  if (!props.points.length) return []
  const xs = props.points.map((p) => p.x)
  const ys = props.points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  return props.points.map((p) => ({
    x: ((p.x - minX) / spanX) * (width - 10) + 5,
    y: height - (((p.y - minY) / spanY) * (height - 10) + 5)
  }))
})

const linePath = computed(() => {
  if (normalized.value.length === 0) return ''
  return normalized.value
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')
})

const areaPath = computed(() => {
  if (normalized.value.length === 0) return ''
  const start = normalized.value[0]
  const end = normalized.value[normalized.value.length - 1]
  if (!start || !end) return ''
  const lines = normalized.value
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')
  return `${lines} L ${end.x} ${height} L ${start.x} ${height} Z`
})
</script>
