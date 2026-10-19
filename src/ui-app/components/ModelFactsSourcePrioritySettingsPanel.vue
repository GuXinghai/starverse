<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import { t, tf } from '@/shared/i18n'
import {
  SOURCE_PRIORITY_KEYS, parseSourcePriorityDraft, sourcePriorityErrorKey, sourcePriorityErrorKind, sourcePriorityKey,
  sourcePriorityRanks, sourcePriorityTies, sourcePriorityValidationKey,
  type SourcePriorityErrorKind, type SourcePriorityKey,
} from '@/shared/model-facts/modelFactPresentation'

type PriorityMap = Readonly<Record<SourcePriorityKey, number>>
type PriorityResponse = Readonly<{ config: Readonly<{ priorities: PriorityMap; sourcePriorityConfigRevision: string }> }>

const emit = defineEmits<{ (event: 'open-inspector'): void }>()

const LABEL_KEYS: Readonly<Record<SourcePriorityKey, string>> = {
  provider_native: 'settings.modelsCapabilities.providerNativePriority',
  models_dev: 'settings.modelsCapabilities.modelsDevPriority',
  capability_rule: 'settings.modelsCapabilities.capabilityRulesPriority',
}

const loading = ref(false)
const saving = ref(false)
const error = ref<Readonly<{ kind: SourcePriorityErrorKind; detail: string }> | null>(null)
const status = ref<string | null>(null)
const revision = ref('')
/** The user's text, kept as typed so invalid input is reported instead of coerced. */
const drafts = ref<Record<SourcePriorityKey, string>>({ provider_native: '3', models_dev: '2', capability_rule: '1' })
/** Latest stored priorities fetched after a stale save, shown next to the preserved draft. */
const latest = ref<PriorityMap | null>(null)

const parsed = computed(() => Object.fromEntries(SOURCE_PRIORITY_KEYS.map((key) => [key, parseSourcePriorityDraft(drafts.value[key])])) as
  Record<SourcePriorityKey, ReturnType<typeof parseSourcePriorityDraft>>)
const valid = computed<PriorityMap | null>(() => SOURCE_PRIORITY_KEYS.every((key) => parsed.value[key].ok)
  ? Object.fromEntries(SOURCE_PRIORITY_KEYS.map((key) => [key, (parsed.value[key] as { value: number }).value])) as PriorityMap
  : null)
const ranks = computed(() => valid.value ? sourcePriorityRanks(valid.value) : null)
const ties = computed(() => valid.value ? sourcePriorityTies(valid.value) : [])
const order = computed(() => {
  if (!ranks.value) return ''
  const sorted = [...ranks.value].sort((left, right) => left.rank - right.rank)
  return sorted.map((entry, index) => `${index === 0 ? '' : sorted[index - 1]!.rank === entry.rank ? ' = ' : ' > '}${t(LABEL_KEYS[entry.key])}`).join('')
})

function bridge() {
  const value = window.generationV2?.modelFacts?.sourcePriority
  if (!value || typeof value.get !== 'function' || typeof value.update !== 'function') {
    throw new Error('GENERATION_V2_SOURCE_PRIORITY_CONFIG_UNAVAILABLE')
  }
  return value
}

function fail(cause: unknown) {
  error.value = { kind: sourcePriorityErrorKind(cause), detail: cause instanceof Error ? cause.message : String(cause) }
}

function draftsFrom(priorities: PriorityMap): Record<SourcePriorityKey, string> {
  return { provider_native: String(priorities.provider_native), models_dev: String(priorities.models_dev),
    capability_rule: String(priorities.capability_rule) }
}

function sourceList(keys: readonly SourcePriorityKey[]): string {
  return keys.map((key) => t(LABEL_KEYS[key])).join(', ')
}

function rankText(key: SourcePriorityKey): string {
  const entry = ranks.value?.find((candidate) => candidate.key === key)
  if (!entry) return ''
  return entry.tiedWith.length > 0
    ? tf(sourcePriorityKey('rankTied'), { rank: entry.rank, sources: sourceList(entry.tiedWith) })
    : tf(sourcePriorityKey('rank'), { rank: entry.rank })
}

function hintText(key: SourcePriorityKey): string {
  const result = parsed.value[key]
  return result.ok ? rankText(key) : t(sourcePriorityValidationKey(result.reason))
}

/** Discards the draft and shows the stored configuration. */
async function load() {
  loading.value = true
  error.value = null
  status.value = null
  try {
    const result = await bridge().get({}) as PriorityResponse
    drafts.value = draftsFrom(result.config.priorities)
    revision.value = result.config.sourcePriorityConfigRevision
    latest.value = null
  } catch (cause) { fail(cause) }
  finally { loading.value = false }
}

/** After a stale save: adopt the latest revision for the next save but keep the user's draft. */
async function loadLatestKeepDraft() {
  loading.value = true
  try {
    const result = await bridge().get({}) as PriorityResponse
    latest.value = { ...result.config.priorities }
    revision.value = result.config.sourcePriorityConfigRevision
    error.value = null
    status.value = t(sourcePriorityKey('latestLoaded'))
  } catch (cause) { fail(cause) }
  finally { loading.value = false }
}

async function save() {
  if (!valid.value) return
  saving.value = true
  error.value = null
  status.value = null
  try {
    const result = await bridge().update({ expectedConfigRevision: revision.value, priorities: { ...valid.value } }) as PriorityResponse
    drafts.value = draftsFrom(result.config.priorities)
    revision.value = result.config.sourcePriorityConfigRevision
    latest.value = null
    status.value = t('settings.modelsCapabilities.prioritySaved')
  } catch (cause) { fail(cause) }
  finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" data-testid="model-facts-source-priority-settings">
    <header>
      <h3 class="text-sm font-semibold text-gray-900">{{ t('settings.modelsCapabilities.priorityTitle') }}</h3>
      <p class="sv-meta mt-1">{{ t('settings.modelsCapabilities.priorityDescription') }}</p>
    </header>
    <div v-if="error" role="alert" class="sv-notice sv-notice-danger" data-testid="source-priority-error" :data-error-kind="error.kind">
      <UiIcon name="alert" :size="14" class="mt-0.5 shrink-0" />
      <div class="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <p>{{ t(sourcePriorityErrorKey(error.kind)) }}</p>
        <p v-if="error.kind === 'unknown'" class="break-all">{{ error.detail }}</p>
        <button v-if="error.kind === 'staleRevision'" type="button" class="sv-btn sv-btn-sm" :disabled="loading || saving" @click="loadLatestKeepDraft">{{ t(sourcePriorityKey('loadLatestKeepDraft')) }}</button>
      </div>
    </div>
    <p v-if="latest" class="text-xs text-gray-600" data-testid="source-priority-latest">
      {{ t(sourcePriorityKey('latestSaved')) }}: {{ SOURCE_PRIORITY_KEYS.map((key) => `${t(LABEL_KEYS[key])} ${latest![key]}`).join(' · ') }}
    </p>
    <form class="grid gap-x-4 gap-y-4 sm:grid-cols-3" novalidate @submit.prevent="save">
      <div v-for="key in SOURCE_PRIORITY_KEYS" :key="key" class="min-w-0 text-xs text-gray-700">
        <label class="flex flex-col gap-1">{{ t(LABEL_KEYS[key]) }}
          <input v-model="drafts[key]" type="text" inputmode="numeric" class="sv-input w-full"
            :class="parsed[key].ok ? '' : 'border-[var(--sv-danger)]'" :disabled="loading || saving"
            :aria-invalid="!parsed[key].ok" :aria-describedby="`source-priority-${key}-hint`" />
        </label>
        <p :id="`source-priority-${key}-hint`" class="mt-1 min-h-4 text-xs" :class="parsed[key].ok ? 'text-gray-500' : 'text-[var(--sv-danger)]'" :data-testid="`source-priority-${key}-hint`">
          {{ hintText(key) }}
        </p>
      </div>
      <div v-if="ranks" class="flex flex-col gap-2 text-xs text-gray-700 sm:col-span-3" data-testid="source-priority-order">
        <p>{{ t(sourcePriorityKey('order')) }}: {{ order }}</p>
        <p v-if="ties.length === 0" class="text-gray-500">{{ t(sourcePriorityKey('noTies')) }}</p>
        <div v-else class="sv-notice sv-notice-warning flex-col" data-testid="source-priority-ties">
          <div class="flex items-start gap-2">
            <UiIcon name="alert" :size="14" class="mt-0.5 shrink-0" />
            <div class="flex min-w-0 flex-col gap-1">
              <p v-for="group in ties" :key="group.join(',')">{{ tf(sourcePriorityKey('tie'), { sources: sourceList(group), priority: valid![group[0]!] }) }}</p>
              <p>{{ t(sourcePriorityKey('tieExplanation')) }}</p>
            </div>
          </div>
          <button type="button" class="sv-btn sv-btn-sm ml-5" @click="emit('open-inspector')">{{ t(sourcePriorityKey('openInspector')) }}</button>
        </div>
      </div>
      <div class="sv-divider-t flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3 sm:col-span-3">
        <span class="sv-meta min-w-0 flex-1 break-all">{{ revision }}</span>
        <div class="flex items-center gap-2">
          <p v-if="status" class="flex items-center gap-1 text-xs text-gray-700"><UiIcon name="check" :size="14" class="shrink-0" />{{ status }}</p>
          <button type="button" class="sv-btn sv-btn-sm min-w-20" :disabled="loading || saving" @click="load">{{ t('common.reload') }}</button>
          <button type="submit" class="sv-btn sv-btn-sm sv-btn-primary min-w-20" :disabled="loading || saving || !revision || !valid">{{ t('settings.modelsCapabilities.savePriority') }}</button>
        </div>
      </div>
    </form>
  </section>
</template>
