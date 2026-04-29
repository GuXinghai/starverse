<script setup lang="ts">
const props = defineProps<{
  open: boolean
  activeView: 'reasoning' | 'console'
  canShowReasoning: boolean
}>()

const emit = defineEmits<{
  (e: 'toggleOpen'): void
  (e: 'setView', view: 'reasoning' | 'console'): void
}>()
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
      <div class="flex items-center gap-1">
        <button
          v-if="props.canShowReasoning"
          type="button"
          class="rounded-md px-2 py-1 text-[11px] font-medium"
          :class="props.activeView === 'reasoning' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
          @click="emit('setView', 'reasoning')"
        >
          Reasoning
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-[11px] font-medium"
          :class="props.activeView === 'console' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
          @click="emit('setView', 'console')"
        >
          Console
        </button>
      </div>

      <button
        type="button"
        class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
        @click="emit('toggleOpen')"
      >
        <span aria-hidden="true">{{ props.open ? '→' : '←' }}</span>
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <slot />
    </div>
  </div>
</template>
