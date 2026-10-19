<script setup lang="ts">
import { t } from '@/shared/i18n'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'

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
    <div class="flex items-start justify-between gap-3 px-6 pb-1 pt-3">
      <div class="min-w-0">
        <div class="sv-title truncate">{{ props.title || t('chat.topBar.untitledConversation') }}</div>
        <div class="sv-meta mt-0.5 flex flex-wrap items-center gap-x-1.5 [&>*+*]:before:mr-1.5 [&>*+*]:before:content-['·']">
          <span>{{ props.branchSummary }}</span>
          <span>{{ props.runSummary }}</span>
          <span v-if="props.modelSummary">{{ props.modelSummary }}</span>
          <span v-if="props.webSummary">{{ props.webSummary }}</span>
        </div>
      </div>

      <button
        type="button"
        class="sv-btn sv-btn-sm sv-btn-ghost w-28"
        :aria-expanded="props.consolePanelOpen"
        @click="emit('toggleConsolePanel')"
      >
        <UiIcon name="panel" :size="15" />
        <span>{{ props.consolePanelOpen ? t('chat.topBar.hideConsole') : t('chat.topBar.console') }}</span>
      </button>
    </div>

    <div v-if="props.loadError" class="sv-notice sv-notice-danger mx-6 mb-1 mt-1">
      <UiIcon name="alert" :size="14" class="mt-0.5 flex-none" />
      <span class="min-w-0 break-words">{{ props.loadError }}</span>
    </div>
    <div v-else-if="props.normalizedErrorSummary" class="sv-notice sv-notice-warning mx-6 mb-1 mt-1">
      <UiIcon name="alert" :size="14" class="mt-0.5 flex-none" />
      <div class="min-w-0 break-words">
        <div>{{ props.normalizedErrorSummary }}</div>
        <div v-if="props.normalizedErrorActionHint" class="mt-1">{{ props.normalizedErrorActionHint }}</div>
      </div>
    </div>
  </div>
</template>
