<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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

const dialogRef = ref<HTMLElement | null>(null)
let restoreFocusElement: HTMLElement | null = null
const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusFirstControl() {
  const dialog = dialogRef.value
  if (!dialog) return
  const first = dialog.querySelector<HTMLElement>(focusableSelector)
  ;(first ?? dialog).focus()
}

function onDialogKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const dialog = dialogRef.value
  if (!dialog) return
  const focusables = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
  if (focusables.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }
  const first = focusables[0]!
  const last = focusables[focusables.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(() => props.open, (open) => {
  if (open) {
    restoreFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void nextTick(focusFirstControl)
  } else if (restoreFocusElement) {
    const element = restoreFocusElement
    restoreFocusElement = null
    void nextTick(() => element.focus())
  }
})

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
  if (props.open) {
    restoreFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void nextTick(focusFirstControl)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (restoreFocusElement) restoreFocusElement.focus()
})
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" @click.self="onClose">
    <div
      ref="dialogRef"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      @keydown="onDialogKeydown"
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
