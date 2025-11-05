<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string | null | undefined
}>()

const statusText = computed(() => props.status || '正在启动 Starverse...')
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-900 to-blue-700 text-white">
    <div class="flex flex-col items-center gap-6 rounded-3xl border border-white/15 bg-white/10 px-10 py-12 shadow-2xl backdrop-blur-xl">
      <div class="flex items-center gap-4">
        <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
          <svg class="h-10 w-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <p class="text-3xl font-semibold tracking-wide">Starverse</p>
          <p class="text-sm text-white/70">Ignite your creative workflows</p>
        </div>
      </div>

      <div class="flex items-center gap-3 text-sm text-white/80">
        <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="tracking-wide">{{ statusText }}</span>
      </div>

      <div class="h-1.5 w-64 overflow-hidden rounded-full bg-white/15">
        <div class="h-full w-full animate-pulse bg-gradient-to-r from-white/20 via-white/80 to-white/20"></div>
      </div>
    </div>
  </div>
</template>
