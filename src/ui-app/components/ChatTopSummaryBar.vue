<script setup lang="ts">
const props = defineProps<{
  title: string
  branchSummary: string
  runSummary: string
  modelSummary?: string | null
  webSummary?: string | null
  loadError?: string | null
  normalizedErrorSummary?: string | null
  normalizedErrorActionHint?: string | null
  consolePanelOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'toggleConsolePanel'): void
  (e: 'openSettings'): void
}>()
</script>

<template>
  <div class="flex flex-col">
    <div class="flex items-center justify-between gap-3 px-4 py-2">
      <div class="min-w-0">
        <div class="truncate text-sm font-semibold text-gray-900">{{ props.title || 'Untitled conversation' }}</div>
        <div class="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
          <span>{{ props.branchSummary }}</span>
          <span>{{ props.runSummary }}</span>
          <span v-if="props.modelSummary">{{ props.modelSummary }}</span>
          <span v-if="props.webSummary">{{ props.webSummary }}</span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50"
          @click="emit('openSettings')"
        >
          <span>Settings</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50"
          @click="emit('toggleConsolePanel')"
        >
          <span aria-hidden="true">{{ props.consolePanelOpen ? '→' : '←' }}</span>
          <span>{{ props.consolePanelOpen ? 'Hide Console' : 'Console' }}</span>
        </button>
      </div>
    </div>

    <div v-if="props.loadError" class="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900">
      {{ props.loadError }}
    </div>
    <div v-else-if="props.normalizedErrorSummary" class="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <div>{{ props.normalizedErrorSummary }}</div>
      <div v-if="props.normalizedErrorActionHint" class="mt-1 text-[11px] text-amber-800">{{ props.normalizedErrorActionHint }}</div>
    </div>
  </div>
</template>
