<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { t } from '@/shared/i18n'

const props = withDefaults(defineProps<{
  open: boolean
  disabled: boolean
  isRunning: boolean
  title?: string
  variant?: 'default' | 'categorized'
}>(), {
  title: '',
  variant: 'default',
})

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
    <div
      role="dialog"
      aria-modal="true"
      :aria-label="props.title || t('settings.title')"
      class="w-full overflow-hidden rounded-xl bg-white shadow-xl"
      :class="props.variant === 'categorized' ? 'max-w-5xl' : 'max-w-xl'"
      :data-testid="props.variant === 'categorized' ? 'settings-modal-categorized' : 'settings-modal-default'"
    >
      <div class="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div class="text-sm font-semibold text-gray-900">{{ props.title || t('settings.title') }}</div>
        <button
          type="button"
          class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          :disabled="!canClose"
          :aria-label="t('common.close')"
          @click="onClose"
        >
          {{ t('common.close') }}
        </button>
      </div>

      <div :class="props.variant === 'categorized' ? 'h-[min(80vh,52rem)] overflow-hidden' : 'max-h-[80vh] overflow-auto'">
        <slot />
      </div>
    </div>
  </div>
</template>
