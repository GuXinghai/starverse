<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  open: boolean
  disabled: boolean
  isRunning: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const canClose = computed(() => !props.disabled)

function onClose() {
  if (!canClose.value) return
  emit('close')
}

function onKeydown(ev: KeyboardEvent) {
  if (!props.open) return
  if (ev.key === 'Escape') onClose()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" @click.self="onClose">
    <div class="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-xl">
      <div class="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div class="text-sm font-semibold text-gray-900">Settings</div>
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          :disabled="!canClose"
          aria-label="Close settings"
          @click="onClose"
        >
          Close
        </button>
      </div>

      <div class="max-h-[80vh] overflow-auto">
        <slot />
      </div>
    </div>
  </div>
</template>

