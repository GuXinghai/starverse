<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/shared/i18n'
import type { WorkspaceStartupState } from '../app/workspaceStartupController'

const props = withDefaults(defineProps<{ state: WorkspaceStartupState; empty?: boolean }>(), { empty: false })
const emit = defineEmits<{ (event: 'retry'): void; (event: 'openSettings'): void }>()
const message = computed(() => props.state.error === 'bridge_unavailable' ? t('errors.startup.bridgeUnavailable')
  : props.state.error === 'superseded' ? t('errors.startup.interrupted') : t('errors.startup.failed'))
</script>

<template>
  <div v-if="state.phase === 'loading'" role="status" aria-live="polite" class="border-b border-gray-200 px-4 py-3 text-sm" data-testid="workspace-startup-loading">
    {{ t('errors.startup.loading') }}
  </div>
  <div v-else-if="state.phase === 'error'" role="alert" class="border-b border-red-200 bg-red-50 px-4 py-3 text-sm" data-testid="workspace-startup-error">
    <p>{{ message }}</p>
    <p class="mt-1">{{ t('errors.startup.retryHint') }}</p>
    <div class="mt-2 flex gap-2">
      <button type="button" class="rounded border bg-white px-3 py-1" data-testid="workspace-startup-retry" @click="emit('retry')">{{ t('common.retry') }}</button>
      <button type="button" class="rounded border bg-white px-3 py-1" data-testid="workspace-startup-settings" @click="emit('openSettings')">{{ t('common.settings') }}</button>
    </div>
  </div>
  <div v-else-if="empty" role="status" class="border-b border-gray-200 px-4 py-3 text-sm" data-testid="workspace-startup-empty">
    <p>{{ t('errors.startup.empty') }}</p>
    <button type="button" class="mt-2 rounded border bg-white px-3 py-1" data-testid="workspace-startup-settings" @click="emit('openSettings')">{{ t('common.settings') }}</button>
  </div>
</template>
