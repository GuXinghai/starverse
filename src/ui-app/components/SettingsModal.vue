<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { t } from '@/shared/i18n'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'

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
  <div v-if="props.open" class="sv-backdrop" @click.self="onClose">
    <div
      ref="dialogRef"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      @keydown="onDialogKeydown"
      :aria-label="props.title || t('settings.title')"
      class="sv-dialog w-full overflow-hidden"
      :class="props.variant === 'categorized' ? 'max-w-5xl' : 'max-w-xl'"
      :data-testid="props.variant === 'categorized' ? 'settings-modal-categorized' : 'settings-modal-default'"
    >
      <div class="sv-divider-b flex h-12 items-center justify-between gap-2 pl-5 pr-3">
        <div class="min-w-0 truncate text-sm font-semibold">{{ props.title || t('settings.title') }}</div>
        <button
          type="button"
          class="sv-icon-btn shrink-0"
          :disabled="!canClose"
          :aria-label="t('common.close')"
          :title="t('common.close')"
          @click="onClose"
        >
          <UiIcon name="close" :size="16" />
        </button>
      </div>

      <div :class="props.variant === 'categorized' ? 'h-[min(80vh,52rem)] overflow-hidden' : 'max-h-[80vh] overflow-auto'">
        <slot />
      </div>
    </div>
  </div>
</template>
