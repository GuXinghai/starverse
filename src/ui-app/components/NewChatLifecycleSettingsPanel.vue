<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getNewChatLifecycleSettings, setNewChatLifecycleSettings, type NewChatLifecycleSettings } from '@/next/convo/systemChatTemplateClient'
import { t } from '@/shared/i18n'

const value = ref<NewChatLifecycleSettings | null>(null)
const saving = ref(false)
const error = ref('')
onMounted(async () => {
  try { value.value = await getNewChatLifecycleSettings() } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
})
async function save() {
  if (!value.value || saving.value) return
  saving.value = true
  error.value = ''
  try { await setNewChatLifecycleSettings(value.value) } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) } finally { saving.value = false }
}
</script>

<template>
  <div data-testid="new-chat-lifecycle-settings">
    <div class="text-sm font-semibold">{{ t('chat.newTemplate.settingsTitle') }}</div>
    <div v-if="value" class="mt-3 flex flex-col gap-3">
      <label class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <span class="text-[13px] font-medium">{{ t('chat.newTemplate.startupNavigation') }}</span>
        <select v-model="value.startupNavigation" class="sv-select w-56" data-testid="new-chat-startup-navigation">
          <option value="open_new">{{ t('chat.newTemplate.openNew') }}</option>
          <option value="restore_last_formal">{{ t('chat.newTemplate.restoreFormal') }}</option>
          <option value="projects_only">{{ t('chat.newTemplate.projectsOnly') }}</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-[13px]"><input v-model="value.startupTemplateReset.modelConfig" type="checkbox" class="size-4" />{{ t('chat.newTemplate.startupResetModel') }}</label>
      <label class="flex items-center gap-2 text-[13px]"><input v-model="value.startupTemplateReset.draftAttachments" type="checkbox" class="size-4" />{{ t('chat.newTemplate.startupResetDraft') }}</label>
      <label class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <span class="text-[13px] font-medium">{{ t('chat.newTemplate.postSendReset') }}</span>
        <select v-model="value.postSendTemplateReset" class="sv-select w-56" data-testid="new-chat-post-send-reset">
          <option value="reset_all">{{ t('chat.newTemplate.resetAll') }}</option>
          <option value="preserve_model_config">{{ t('chat.newTemplate.preserveModel') }}</option>
        </select>
      </label>
      <div class="flex items-center justify-between gap-3">
        <div class="min-h-[18px] min-w-0 flex-1 break-words text-xs text-[color:var(--sv-danger)]">{{ error }}</div>
        <button type="button" class="sv-btn w-20 shrink-0" :disabled="saving" data-testid="new-chat-lifecycle-save" @click="save">{{ t('common.save') }}</button>
      </div>
    </div>
    <div v-else class="mt-2 min-h-[18px] break-words text-xs text-[color:var(--sv-danger)]">{{ error }}</div>
  </div>
</template>
