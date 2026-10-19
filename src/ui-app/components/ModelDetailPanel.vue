<script setup lang="ts">
import { computed } from 'vue'
import { t, tf } from '@/shared/i18n'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'
import type { ModelCatalogModelDetail } from '@/next/modelCatalog/modelDetailService'

const props = withDefaults(
  defineProps<{
    modelId: string
    loading: boolean
    detail: ModelCatalogModelDetail | null
    error?: string | null
    disabled?: boolean
  }>(),
  {
    error: null,
    disabled: false,
  },
)

function formatNumber(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return t('errors.modelCatalog.notAvailable')
  return value.toLocaleString()
}

function formatEpochSec(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return t('errors.modelCatalog.notAvailable')
  try {
    return `${value} (${new Date(value * 1000).toLocaleString()})`
  } catch {
    return String(value)
  }
}

function formatEpochMs(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return t('errors.modelCatalog.notAvailable')
  try {
    return new Date(value).toLocaleString()
  } catch {
    return t('errors.modelCatalog.notAvailable')
  }
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const detail = computed(() => props.detail)
const hasDetail = computed(() => detail.value !== null)
const notAvailable = computed(() => t('errors.modelCatalog.notAvailable'))

function formatPresent(value: boolean): string {
  return value ? t('errors.modelCatalog.present') : t('errors.modelCatalog.noneValue')
}

function formatBoolean(value: boolean | null): string {
  if (value === null) return t('errors.modelCatalog.notAvailable')
  return value ? t('errors.modelCatalog.yesValue') : t('errors.modelCatalog.noValue')
}
</script>

<template>
  <aside data-testid="model-detail-panel">
    <div class="sv-label">{{ t('errors.modelCatalog.modelDetailsTitle') }}</div>
    <div class="mt-1 text-xs text-gray-500">
      <div class="truncate" :title="props.modelId">{{ props.modelId }}</div>
      <div v-if="detail">{{ tf('errors.modelCatalog.syncedAt', { time: formatEpochMs(detail.syncedAtMs) }) }}</div>
    </div>

    <div v-if="props.error" class="sv-notice sv-notice-warning mt-3">
      {{ props.error }}
    </div>
    <div v-else-if="props.loading" class="mt-3 text-xs text-gray-500">{{ t('errors.modelCatalog.loadingModelDetails') }}</div>
    <div v-else-if="!hasDetail" class="mt-3 text-xs text-gray-500">{{ t('errors.modelCatalog.noModelDetails') }}</div>

    <div v-if="detail" class="mt-4 flex flex-col gap-5 text-xs text-gray-700">
      <section data-testid="model-detail-basic">
        <h3 class="mdp-heading">{{ t('errors.modelCatalog.basicInfo') }}</h3>
        <dl class="mdp-dl">
          <div><dt>{{ t('errors.modelCatalog.display') }}</dt><dd>{{ detail.displayName }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.modelKey') }}</dt><dd>{{ detail.modelKey }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.canonical') }}</dt><dd>{{ detail.canonicalSlug || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.vendorFamily') }}</dt><dd>{{ detail.vendor || notAvailable }} / {{ detail.family || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.created') }}</dt><dd>{{ formatEpochSec(detail.createdAtSec) }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.description') }}</dt><dd>{{ detail.description || notAvailable }}</dd></div>
        </dl>
      </section>

      <section>
        <h3 class="mdp-heading">{{ t('errors.modelCatalog.capabilityLimitsQuotas') }}</h3>
        <dl class="mdp-dl">
          <div><dt>{{ t('errors.modelCatalog.contextLength') }}</dt><dd>{{ formatNumber(detail.contextLength) }} {{ t('errors.modelCatalog.tokens') }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.maxCompletionTokens') }}</dt><dd>{{ formatNumber(detail.maxOutputTokens) }} {{ t('errors.modelCatalog.tokens') }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.topProviderContext') }}</dt><dd>{{ formatNumber(detail.topProviderContextLength) }} {{ t('errors.modelCatalog.tokens') }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.perRequestLimits') }}</dt><dd>{{ formatPresent(detail.hasPerRequestLimits) }}</dd></div>
        </dl>
        <pre class="mdp-pre mt-2 max-h-28">{{ formatJson(detail.perRequestLimits) }}</pre>
      </section>

      <section>
        <h3 class="mdp-heading">{{ t('errors.modelCatalog.modalitiesArchitecture') }}</h3>
        <dl class="mdp-dl">
          <div><dt>{{ t('errors.modelCatalog.architecture') }}</dt><dd>{{ detail.architectureModality || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.input') }}</dt><dd>{{ detail.inputModalities.join(', ') || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.output') }}</dt><dd>{{ detail.outputModalities.join(', ') || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.tokenizer') }}</dt><dd>{{ detail.tokenizer || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.instructType') }}</dt><dd>{{ detail.instructType || notAvailable }}</dd></div>
        </dl>
      </section>

      <section>
        <h3 class="mdp-heading">{{ t('errors.modelCatalog.parametersDefaults') }}</h3>
        <dl class="mdp-dl">
          <div><dt>{{ t('errors.modelCatalog.supported') }}</dt><dd>{{ detail.supportedParameters.join(', ') || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.defaultParameters') }}</dt><dd>{{ formatPresent(detail.hasDefaultParameters) }}</dd></div>
        </dl>
        <pre class="mdp-pre mt-2 max-h-28">{{ formatJson(detail.defaultParameters) }}</pre>
      </section>

      <section>
        <h3 class="mdp-heading">{{ t('errors.modelCatalog.pricingDecimalStrings') }}</h3>
        <dl class="mdp-dl">
          <div><dt>{{ t('errors.modelCatalog.pricePrompt') }}</dt><dd>{{ detail.pricing.prompt || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.priceCompletion') }}</dt><dd>{{ detail.pricing.completion || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.priceRequest') }}</dt><dd>{{ detail.pricing.request || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.priceImage') }}</dt><dd>{{ detail.pricing.image || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.priceWebSearch') }}</dt><dd>{{ detail.pricing.webSearch || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.priceInternalReasoning') }}</dt><dd>{{ detail.pricing.internalReasoning || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.priceInputReuseRead') }}</dt><dd>{{ detail.pricing.inputCacheRead || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.priceInputReuseWrite') }}</dt><dd>{{ detail.pricing.inputCacheWrite || notAvailable }}</dd></div>
        </dl>
      </section>

      <section>
        <h3 class="mdp-heading">{{ t('errors.modelCatalog.complianceLifecycle') }}</h3>
        <dl class="mdp-dl">
          <div><dt>{{ t('errors.modelCatalog.statusVisibility') }}</dt><dd>{{ detail.status }} / {{ detail.visibility }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.moderatedLabel') }}</dt><dd>{{ formatBoolean(detail.topProviderIsModerated) }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.expirationDate') }}</dt><dd>{{ detail.expirationDate || notAvailable }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.expirationEpoch') }}</dt><dd>{{ formatEpochSec(detail.expirationAtSec) }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.unknownExpiration') }}</dt><dd>{{ formatBoolean(detail.unknownExpiration) }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.firstSeen') }}</dt><dd>{{ formatEpochMs(detail.firstSeenAtMs) }}</dd></div>
          <div><dt>{{ t('errors.modelCatalog.lastSeen') }}</dt><dd>{{ formatEpochMs(detail.lastSeenAtMs) }}</dd></div>
        </dl>
      </section>

      <details class="mdp-raw" data-testid="model-detail-raw">
        <summary class="mdp-summary">
          <span class="mdp-chev"><UiIcon name="chevronRight" :size="14" /></span>
          <span>{{ t('errors.modelCatalog.rawData') }}</span>
        </summary>
        <pre class="mdp-pre mt-2 max-h-40">{{ detail.raw.rawJson || 'null' }}</pre>
        <div class="mt-2 text-xs text-gray-500">{{ t('errors.modelCatalog.derivedRawSnapshots') }}</div>
        <pre class="mdp-pre mt-1 max-h-28">{{ detail.raw.pricingJson || 'null' }}</pre>
        <pre class="mdp-pre mt-1 max-h-28">{{ detail.raw.perRequestLimitsJson || 'null' }}</pre>
        <pre class="mdp-pre mt-1 max-h-28">{{ detail.raw.defaultParametersJson || 'null' }}</pre>
      </details>
    </div>
  </aside>
</template>

<style scoped>
.mdp-heading { margin: 0 0 2px; font-size: 13px; font-weight: 600; color: var(--sv-text); }
.mdp-dl { margin: 0; }
/* key / value rows separated by hairlines; the label column shrinks with the panel */
.mdp-dl > div {
  display: grid;
  grid-template-columns: minmax(4.5rem, 38%) minmax(0, 1fr);
  gap: 0 12px;
  padding: 6px 0;
  border-top: 1px solid var(--sv-line);
}
.mdp-dl dt { color: var(--sv-text-3); overflow-wrap: anywhere; }
.mdp-dl dd { margin: 0; color: var(--sv-text); overflow-wrap: anywhere; }
.mdp-pre {
  margin: 0;
  overflow: auto;
  padding: 8px;
  border-radius: var(--sv-radius-control);
  background: var(--sv-sunken);
  color: var(--sv-text-2);
  font-size: 12px;
}
.mdp-summary {
  display: flex;
  align-items: center;
  gap: 4px;
  list-style: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--sv-text);
}
.mdp-summary::-webkit-details-marker { display: none; }
.mdp-chev {
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex: none;
  align-items: center;
  justify-content: center;
  color: var(--sv-text-3);
  transition: transform 120ms;
}
.mdp-raw[open] > .mdp-summary .mdp-chev { transform: rotate(90deg); }
</style>
