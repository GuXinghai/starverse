<script setup lang="ts">
import { t } from '@/shared/i18n'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'

const props = withDefaults(
  defineProps<{
    floating?: boolean
  }>(),
  {
    floating: false,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <button
      v-if="props.floating"
      type="button"
      class="group flex h-6 w-full shrink-0 items-center justify-center"
      :aria-label="t('chat.rightRail.closePanel')"
      data-testid="right-rail-floating-close-handle"
      @click="emit('close')"
    >
      <span class="h-1 w-10 rounded-full bg-[var(--sv-line-strong)] group-hover:bg-[var(--sv-text-3)]" />
    </button>

    <div v-else class="flex h-10 shrink-0 items-center justify-end px-3">
      <button
        type="button"
        class="sv-icon-btn"
        :aria-label="t('chat.rightRail.closePanel')"
        :title="t('chat.rightRail.closePanel')"
        @click="emit('close')"
      >
        <UiIcon name="forward" :size="16" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <slot />
    </div>
  </div>
</template>
