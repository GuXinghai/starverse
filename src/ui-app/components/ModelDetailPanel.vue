<script setup lang="ts">
import { computed } from 'vue'
import { t, tf } from '@/shared/i18n'
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
  <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3" data-testid="model-detail-panel">
    <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.modelDetailsTitle') }}</div>
    <div class="mt-1 text-[11px] text-gray-500">
      <div class="truncate" :title="props.modelId">{{ props.modelId }}</div>
      <div v-if="detail">{{ tf('errors.modelCatalog.syncedAt', { time: formatEpochMs(detail.syncedAtMs) }) }}</div>
    </div>

    <div v-if="props.error" class="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
      {{ props.error }}
    </div>
    <div v-else-if="props.loading" class="mt-2 text-[11px] text-gray-500">{{ t('errors.modelCatalog.loadingModelDetails') }}</div>
    <div v-else-if="!hasDetail" class="mt-2 text-[11px] text-gray-500">{{ t('errors.modelCatalog.noModelDetails') }}</div>

    <div v-if="detail" class="mt-3 space-y-3 text-[11px] text-gray-700">
      <section class="rounded border border-gray-200 bg-white p-2" data-testid="model-detail-basic">
        <div class="font-semibold text-gray-900">{{ t('errors.modelCatalog.basicInfo') }}</div>
        <div class="mt-1 space-y-1">
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.display') }}:</span> {{ detail.displayName }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.modelKey') }}:</span> {{ detail.modelKey }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.canonical') }}:</span> {{ detail.canonicalSlug || notAvailable }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.vendorFamily') }}:</span> {{ detail.vendor || notAvailable }} / {{ detail.family || notAvailable }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.created') }}:</span> {{ formatEpochSec(detail.createdAtSec) }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.description') }}:</span> {{ detail.description || notAvailable }}</div>
        </div>
      </section>

      <section class="rounded border border-gray-200 bg-white p-2">
        <div class="font-semibold text-gray-900">{{ t('errors.modelCatalog.capabilityLimitsQuotas') }}</div>
        <div class="mt-1 space-y-1">
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.contextLength') }}:</span> {{ formatNumber(detail.contextLength) }} {{ t('errors.modelCatalog.tokens') }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.maxCompletionTokens') }}:</span> {{ formatNumber(detail.maxOutputTokens) }} {{ t('errors.modelCatalog.tokens') }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.topProviderContext') }}:</span> {{ formatNumber(detail.topProviderContextLength) }} {{ t('errors.modelCatalog.tokens') }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.perRequestLimits') }}:</span> {{ formatPresent(detail.hasPerRequestLimits) }}</div>
          <pre class="max-h-28 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ formatJson(detail.perRequestLimits) }}</pre>
        </div>
      </section>

      <section class="rounded border border-gray-200 bg-white p-2">
        <div class="font-semibold text-gray-900">{{ t('errors.modelCatalog.modalitiesArchitecture') }}</div>
        <div class="mt-1 space-y-1">
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.architecture') }}:</span> {{ detail.architectureModality || notAvailable }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.input') }}:</span> {{ detail.inputModalities.join(', ') || notAvailable }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.output') }}:</span> {{ detail.outputModalities.join(', ') || notAvailable }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.tokenizer') }}:</span> {{ detail.tokenizer || notAvailable }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.instructType') }}:</span> {{ detail.instructType || notAvailable }}</div>
        </div>
      </section>

      <section class="rounded border border-gray-200 bg-white p-2">
        <div class="font-semibold text-gray-900">{{ t('errors.modelCatalog.parametersDefaults') }}</div>
        <div class="mt-1 space-y-1">
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.supported') }}:</span> {{ detail.supportedParameters.join(', ') || notAvailable }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.defaultParameters') }}:</span> {{ formatPresent(detail.hasDefaultParameters) }}</div>
          <pre class="max-h-28 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ formatJson(detail.defaultParameters) }}</pre>
        </div>
      </section>

      <section class="rounded border border-gray-200 bg-white p-2">
        <div class="font-semibold text-gray-900">{{ t('errors.modelCatalog.pricingDecimalStrings') }}</div>
        <div class="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
          <div class="text-gray-500">{{ t('errors.modelCatalog.pricePrompt') }}</div><div>{{ detail.pricing.prompt || notAvailable }}</div>
          <div class="text-gray-500">{{ t('errors.modelCatalog.priceCompletion') }}</div><div>{{ detail.pricing.completion || notAvailable }}</div>
          <div class="text-gray-500">{{ t('errors.modelCatalog.priceRequest') }}</div><div>{{ detail.pricing.request || notAvailable }}</div>
          <div class="text-gray-500">{{ t('errors.modelCatalog.priceImage') }}</div><div>{{ detail.pricing.image || notAvailable }}</div>
          <div class="text-gray-500">{{ t('errors.modelCatalog.priceWebSearch') }}</div><div>{{ detail.pricing.webSearch || notAvailable }}</div>
          <div class="text-gray-500">{{ t('errors.modelCatalog.priceInternalReasoning') }}</div><div>{{ detail.pricing.internalReasoning || notAvailable }}</div>
          <div class="text-gray-500">{{ t('errors.modelCatalog.priceInputReuseRead') }}</div><div>{{ detail.pricing.inputCacheRead || notAvailable }}</div>
          <div class="text-gray-500">{{ t('errors.modelCatalog.priceInputReuseWrite') }}</div><div>{{ detail.pricing.inputCacheWrite || notAvailable }}</div>
        </div>
      </section>

      <section class="rounded border border-gray-200 bg-white p-2">
        <div class="font-semibold text-gray-900">{{ t('errors.modelCatalog.complianceLifecycle') }}</div>
        <div class="mt-1 space-y-1">
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.statusVisibility') }}:</span> {{ detail.status }} / {{ detail.visibility }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.moderatedLabel') }}:</span> {{ formatBoolean(detail.topProviderIsModerated) }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.expirationDate') }}:</span> {{ detail.expirationDate || notAvailable }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.expirationEpoch') }}:</span> {{ formatEpochSec(detail.expirationAtSec) }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.unknownExpiration') }}:</span> {{ formatBoolean(detail.unknownExpiration) }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.firstSeen') }}:</span> {{ formatEpochMs(detail.firstSeenAtMs) }}</div>
          <div><span class="text-gray-500">{{ t('errors.modelCatalog.lastSeen') }}:</span> {{ formatEpochMs(detail.lastSeenAtMs) }}</div>
        </div>
      </section>

      <details class="rounded border border-gray-200 bg-white p-2" data-testid="model-detail-raw">
        <summary class="cursor-pointer font-semibold text-gray-900">{{ t('errors.modelCatalog.rawData') }}</summary>
        <pre class="mt-2 max-h-40 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ detail.raw.rawJson || 'null' }}</pre>
        <div class="mt-2 text-[10px] text-gray-500">{{ t('errors.modelCatalog.derivedRawSnapshots') }}</div>
        <pre class="mt-1 max-h-28 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ detail.raw.pricingJson || 'null' }}</pre>
        <pre class="mt-1 max-h-28 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ detail.raw.perRequestLimitsJson || 'null' }}</pre>
        <pre class="mt-1 max-h-28 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ detail.raw.defaultParametersJson || 'null' }}</pre>
      </details>
    </div>
  </aside>
</template>
