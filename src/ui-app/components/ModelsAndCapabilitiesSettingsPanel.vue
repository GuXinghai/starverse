<script setup lang="ts">
import { ref, watch } from 'vue'
import { t } from '@/shared/i18n'
import CapabilityRulesOverviewPanel from './CapabilityRulesOverviewPanel.vue'
import ModelFactsInspectorPanel from './ModelFactsInspectorPanel.vue'
import ModelFactsSourcePrioritySettingsPanel from './ModelFactsSourcePrioritySettingsPanel.vue'
import type { CanonicalModelSubjectV1 } from '@/next/generation-v2/model-facts/canonicalSourceFactsV1'

type TabId = 'cloud' | 'user' | 'inspector'
const props = withDefaults(defineProps<{
  initialTab?: TabId
  inspectorSubject?: CanonicalModelSubjectV1 | null
}>(), {
  initialTab: 'cloud',
  inspectorSubject: null,
})
const tabs: readonly Readonly<{ id: TabId; label: string }>[] = [
  { id: 'cloud', label: 'settings.modelsCapabilities.cloudTab' },
  { id: 'user', label: 'settings.modelsCapabilities.userTab' },
  { id: 'inspector', label: 'settings.modelsCapabilities.inspectorTab' },
]
const active = ref<TabId>(props.initialTab)
watch(() => props.initialTab, (value) => { active.value = value })
function tabId(id: TabId) { return `models-capabilities-tab-${id}` }
function panelId(id: TabId) { return `models-capabilities-panel-${id}` }
function select(id: TabId, focus = false) {
  active.value = id
  if (focus) requestAnimationFrame(() => document.getElementById(tabId(id))?.focus())
}
function keydown(event: KeyboardEvent, current: TabId) {
  const index = tabs.findIndex((tab) => tab.id === current)
  if (index < 0) return
  let next: number | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = tabs.length - 1
  if (next === null) return
  event.preventDefault()
  select(tabs[next]!.id, true)
}
</script>

<template>
  <section class="space-y-3" data-testid="models-capabilities-settings-panel">
    <nav class="flex gap-1 overflow-x-auto border-b border-gray-200 pb-2" role="tablist" :aria-label="t('settings.modelsCapabilities.tabsLabel')">
      <button v-for="tab in tabs" :id="tabId(tab.id)" :key="tab.id" type="button" role="tab"
        class="shrink-0 rounded px-3 py-1.5 text-xs font-medium outline-none ring-blue-300 focus:ring-2"
        :class="active === tab.id ? 'bg-blue-50 text-blue-800' : 'text-gray-600 hover:bg-gray-50'"
        :aria-selected="active === tab.id" :aria-controls="panelId(tab.id)" :tabindex="active === tab.id ? 0 : -1"
        @click="select(tab.id)" @keydown="keydown($event, tab.id)">{{ t(tab.label) }}</button>
    </nav>
    <div :id="panelId('cloud')" v-show="active === 'cloud'" role="tabpanel" :aria-labelledby="tabId('cloud')" class="space-y-3"><CapabilityRulesOverviewPanel ownership="cloud" /><ModelFactsSourcePrioritySettingsPanel /></div>
    <div :id="panelId('user')" v-show="active === 'user'" role="tabpanel" :aria-labelledby="tabId('user')"><CapabilityRulesOverviewPanel ownership="user" /></div>
    <div :id="panelId('inspector')" v-show="active === 'inspector'" role="tabpanel" :aria-labelledby="tabId('inspector')"><ModelFactsInspectorPanel :initialSubject="props.inspectorSubject" /></div>
  </section>
</template>
