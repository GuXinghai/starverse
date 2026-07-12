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
  <div class="rounded-lg border border-gray-200 bg-white p-3" data-testid="new-chat-lifecycle-settings">
    <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">{{ t('chat.newTemplate.settingsTitle') }}</div>
    <div v-if="value" class="mt-3 space-y-3 text-xs text-gray-700">
      <label class="block space-y-1">
        <span>{{ t('chat.newTemplate.startupNavigation') }}</span>
        <select v-model="value.startupNavigation" class="w-full rounded border px-2 py-1" data-testid="new-chat-startup-navigation">
          <option value="open_new">{{ t('chat.newTemplate.openNew') }}</option>
          <option value="restore_last_formal">{{ t('chat.newTemplate.restoreFormal') }}</option>
          <option value="projects_only">{{ t('chat.newTemplate.projectsOnly') }}</option>
        </select>
      </label>
      <label class="flex items-center gap-2"><input v-model="value.startupTemplateReset.modelConfig" type="checkbox" />{{ t('chat.newTemplate.startupResetModel') }}</label>
      <label class="flex items-center gap-2"><input v-model="value.startupTemplateReset.draftAttachments" type="checkbox" />{{ t('chat.newTemplate.startupResetDraft') }}</label>
      <label class="block space-y-1">
        <span>{{ t('chat.newTemplate.postSendReset') }}</span>
        <select v-model="value.postSendTemplateReset" class="w-full rounded border px-2 py-1" data-testid="new-chat-post-send-reset">
          <option value="reset_all">{{ t('chat.newTemplate.resetAll') }}</option>
          <option value="preserve_model_config">{{ t('chat.newTemplate.preserveModel') }}</option>
        </select>
      </label>
      <button type="button" class="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50" :disabled="saving" data-testid="new-chat-lifecycle-save" @click="save">{{ t('common.save') }}</button>
    </div>
    <div v-if="error" class="mt-2 text-xs text-red-600">{{ error }}</div>
  </div>
</template>
