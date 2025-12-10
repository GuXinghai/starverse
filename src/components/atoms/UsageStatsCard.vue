<template>
  <div class="usage-stats-card rounded-lg border p-4 transition-colors bg-white border-gray-200 hover:bg-gray-50">
    <!-- 标题 -->
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-medium text-gray-700">
        {{ title }}
      </h3>
      <div v-if="icon" 
           class="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 text-gray-600">
        <span class="text-lg">{{ icon }}</span>
      </div>
    </div>

    <!-- 主数值 -->
    <div class="mb-2">
      <div class="text-2xl font-bold text-gray-900">
        {{ formattedValue }}
      </div>
      <div v-if="subtitle" 
           class="text-xs mt-1 text-gray-500">
        {{ subtitle }}
      </div>
    </div>

    <!-- 趋势指示器 (可选) -->
    <div v-if="trend !== undefined" 
         class="flex items-center gap-1 text-xs"
         :class="trend > 0 ? 'text-green-500' : trend < 0 ? 'text-red-500' : 'text-gray-500'">
      <span v-if="trend > 0">↑</span>
      <span v-else-if="trend < 0">↓</span>
      <span v-else>→</span>
      <span>{{ Math.abs(trend) }}%</span>
      <span class="text-gray-400">vs 上月</span>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" 
         class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80">
      <div class="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-blue-500"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  title: string
  value: number
  unit?: string
  icon?: string
  subtitle?: string
  trend?: number
  formatType?: 'number' | 'currency' | 'duration' | 'percentage'
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  unit: '',
  formatType: 'number',
  loading: false
})

const formattedValue = computed(() => {
  const val = props.value

  switch (props.formatType) {
    case 'currency':
      return `$${val.toFixed(4)}`
    
    case 'duration':
      // 将毫秒转换为易读格式
      if (val < 1000) return `${val}ms`
      if (val < 60000) return `${(val / 1000).toFixed(1)}s`
      return `${(val / 60000).toFixed(1)}m`
    
    case 'percentage':
      return `${val.toFixed(1)}%`
    
    case 'number':
    default:
      // 格式化大数字 (1000 -> 1K, 1000000 -> 1M)
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`
      if (val >= 1000) return `${(val / 1000).toFixed(1)}K`
      return val.toLocaleString()
  }
})
</script>

<style scoped>
.usage-stats-card {
  position: relative;
  min-height: 120px;
}
</style>
