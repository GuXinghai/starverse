<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    <div 
      v-for="kpi in kpis" 
      :key="kpi.label" 
      class="group relative rounded-2xl border border-gray-200/70 dark:border-slate-800 bg-gradient-to-br from-white via-white to-gray-50/50 dark:from-slate-900/80 dark:via-slate-900/60 dark:to-slate-900/40 shadow-md hover:shadow-xl transition-all duration-300 p-5 overflow-hidden hover:scale-105 hover:-translate-y-1"
    >
      <!-- 装饰性渐变背景 -->
      <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      <div class="relative z-10">
        <div class="flex items-center justify-between mb-3">
          <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-slate-400 font-semibold">{{ kpi.label }}</div>
          <div class="text-2xl group-hover:scale-110 transition-transform duration-300">{{ kpi.icon }}</div>
        </div>
        <div class="text-3xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
          {{ kpi.value }}
        </div>
        <div v-if="kpi.hint" class="text-xs text-gray-500 dark:text-slate-400 mt-2">{{ kpi.hint }}</div>
      </div>
      
      <!-- 底部装饰条 -->
      <div class="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
type KpiItem = {
  label: string
  value: string | number
  icon?: string
  hint?: string
}

defineProps<{
  kpis: KpiItem[]
}>()
</script>
