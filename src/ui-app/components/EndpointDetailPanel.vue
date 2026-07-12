<script setup lang="ts">
import { computed, ref } from 'vue'
import { t, tf } from '@/shared/i18n'
import type { ModelEndpointDetail } from '@/next/modelCatalog/modelEndpointDetailService'

const props = withDefaults(
  defineProps<{
    modelId: string
    loading: boolean
    fetchedAtMs: number | null
    items: readonly ModelEndpointDetail[]
    error?: string | null
    disabled?: boolean
  }>(),
  {
    error: null,
    disabled: false,
  },
)

const emit = defineEmits<{
  refresh: []
}>()

type TriState = 'any' | 'yes' | 'no'
type EndpointSortMetric = 'latency_p50' | 'latency_p99' | 'throughput_p50' | 'throughput_p99' | 'uptime'
type EndpointSortOrder = 'asc' | 'desc'

const providerFilter = ref('all')
const tagFilter = ref('all')
const quantizationFilter = ref('all')
const supportsCachingFilter = ref<TriState>('any')
const statusFilter = ref('all')
const uptimeMinFilter = ref('')
const selectedParameters = ref<string[]>([])
const sortMetric = ref<EndpointSortMetric>('latency_p50')
const sortOrder = ref<EndpointSortOrder>('asc')

const fetchedAtLabel = computed(() => {
  if (typeof props.fetchedAtMs !== 'number' || !Number.isFinite(props.fetchedAtMs)) return t('errors.modelCatalog.never')
  try {
    return new Date(props.fetchedAtMs).toLocaleString()
  } catch {
    return t('errors.modelCatalog.invalid')
  }
})

function onRefresh() {
  if (props.disabled || props.loading) return
  emit('refresh')
}

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function asUniqueOptions(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b))
}

const providerOptions = computed(() => asUniqueOptions(props.items.map((item) => item.providerName)))
const tagOptions = computed(() => asUniqueOptions(props.items.map((item) => item.tag)))
const quantizationOptions = computed(() => asUniqueOptions(props.items.map((item) => item.quantization)))
const supportedParameterOptions = computed(() =>
  Array.from(
    new Set(
      props.items.flatMap((item) =>
        item.supportedParameters
          .map((param) => normalizeToken(param))
          .filter((param) => param.length > 0)
      )
    )
  ).sort((a, b) => a.localeCompare(b))
)

const statusOptions = computed(() => {
  const numeric = Array.from(
    new Set(
      props.items
        .map((item) => (typeof item.status === 'number' && Number.isFinite(item.status) ? item.status : null))
        .filter((item): item is number => item !== null)
    )
  ).sort((a, b) => a - b)
  const hasUnknown = props.items.some((item) => item.status == null)
  return [
    ...(hasUnknown ? [{ value: '__unknown__', label: t('errors.modelCatalog.unknown') }] : []),
    ...numeric.map((value) => ({ value: String(value), label: String(value) })),
  ]
})

function emptyValue(value: unknown): unknown {
  return value ?? t('errors.modelCatalog.notAvailable')
}

function metricValue(item: ModelEndpointDetail, metric: EndpointSortMetric): number | null {
  if (metric === 'latency_p50') return item.latencyLast30m?.p50 ?? null
  if (metric === 'latency_p99') return item.latencyLast30m?.p99 ?? null
  if (metric === 'throughput_p50') return item.throughputLast30m?.p50 ?? null
  if (metric === 'throughput_p99') return item.throughputLast30m?.p99 ?? null
  return typeof item.uptimeLast30m === 'number' && Number.isFinite(item.uptimeLast30m)
    ? item.uptimeLast30m
    : null
}

function toggleParameter(value: string) {
  const normalized = normalizeToken(value)
  if (!normalized) return
  const index = selectedParameters.value.indexOf(normalized)
  if (index >= 0) {
    selectedParameters.value.splice(index, 1)
    return
  }
  selectedParameters.value.push(normalized)
}

const filteredAndSortedItems = computed(() => {
  const minUptimeRaw = Number(uptimeMinFilter.value)
  const minUptime = Number.isFinite(minUptimeRaw) ? minUptimeRaw : null
  const requiredParams = new Set(selectedParameters.value.map((item) => normalizeToken(item)).filter(Boolean))

  const filtered = props.items.filter((item) => {
    if (providerFilter.value !== 'all' && normalizeToken(item.providerName) !== normalizeToken(providerFilter.value)) {
      return false
    }
    if (tagFilter.value !== 'all' && normalizeToken(item.tag) !== normalizeToken(tagFilter.value)) {
      return false
    }
    if (quantizationFilter.value !== 'all' && normalizeToken(item.quantization) !== normalizeToken(quantizationFilter.value)) {
      return false
    }
    if (supportsCachingFilter.value === 'yes' && item.supportsImplicitCaching !== true) return false
    if (supportsCachingFilter.value === 'no' && item.supportsImplicitCaching !== false) return false
    if (statusFilter.value === '__unknown__' && item.status != null) return false
    if (statusFilter.value !== 'all' && statusFilter.value !== '__unknown__' && String(item.status ?? '') !== statusFilter.value) {
      return false
    }
    if (minUptime !== null) {
      if (typeof item.uptimeLast30m !== 'number' || !Number.isFinite(item.uptimeLast30m)) return false
      if (item.uptimeLast30m < minUptime) return false
    }
    if (requiredParams.size > 0) {
      const itemParams = new Set(item.supportedParameters.map((param) => normalizeToken(param)).filter(Boolean))
      for (const param of requiredParams) {
        if (!itemParams.has(param)) return false
      }
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const aMetric = metricValue(a, sortMetric.value)
    const bMetric = metricValue(b, sortMetric.value)
    if (aMetric == null && bMetric == null) return a.endpointKey.localeCompare(b.endpointKey)
    if (aMetric == null) return 1
    if (bMetric == null) return -1
    if (aMetric === bMetric) return a.endpointKey.localeCompare(b.endpointKey)
    return sortOrder.value === 'asc' ? aMetric - bMetric : bMetric - aMetric
  })
  return sorted
})
</script>

<template>
  <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3" data-testid="endpoint-detail-panel">
    <div class="flex items-center justify-between gap-2">
      <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.detailTabEndpoints') }}</div>
      <button
        type="button"
        class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        :disabled="props.disabled || props.loading"
        data-testid="endpoint-detail-refresh"
        @click="onRefresh"
      >
        {{ props.loading ? t('errors.modelCatalog.refreshing') : t('errors.modelCatalog.refresh') }}
      </button>
    </div>

    <div class="mt-2 text-[11px] text-gray-500">
      <div class="truncate" :title="props.modelId">{{ props.modelId }}</div>
      <div data-testid="endpoint-detail-fetched-at">{{ tf('errors.modelCatalog.fetchedAt', { time: fetchedAtLabel }) }}</div>
      <div class="text-[10px] text-blue-700">{{ t('errors.modelCatalog.endpointFiltersNotice') }}</div>
      <div class="text-[10px]">{{ t('errors.modelCatalog.endpointPerfNotice') }}</div>
    </div>

    <div class="mt-2 rounded border border-gray-200 bg-white p-2 text-[11px]">
      <div class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{{ t('errors.modelCatalog.endpointFilterSort') }}</div>
      <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label class="flex flex-col gap-1">
          <span class="text-[10px] text-gray-500">{{ t('errors.modelCatalog.provider') }}</span>
          <select v-model="providerFilter" class="rounded border border-gray-200 px-2 py-1" data-testid="endpoint-filter-provider">
            <option value="all">{{ t('errors.modelCatalog.all') }}</option>
            <option v-for="option in providerOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[10px] text-gray-500">{{ t('errors.modelCatalog.tag') }}</span>
          <select v-model="tagFilter" class="rounded border border-gray-200 px-2 py-1" data-testid="endpoint-filter-tag">
            <option value="all">{{ t('errors.modelCatalog.all') }}</option>
            <option v-for="option in tagOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[10px] text-gray-500">{{ t('errors.modelCatalog.quantization') }}</span>
          <select v-model="quantizationFilter" class="rounded border border-gray-200 px-2 py-1" data-testid="endpoint-filter-quantization">
            <option value="all">{{ t('errors.modelCatalog.all') }}</option>
            <option v-for="option in quantizationOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[10px] text-gray-500">{{ t('errors.modelCatalog.supportsImplicitReuse') }}</span>
          <select v-model="supportsCachingFilter" class="rounded border border-gray-200 px-2 py-1" data-testid="endpoint-filter-supports-caching">
            <option value="any">{{ t('errors.modelCatalog.any') }}</option>
            <option value="yes">{{ t('errors.modelCatalog.yesValue') }}</option>
            <option value="no">{{ t('errors.modelCatalog.noValue') }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[10px] text-gray-500">{{ t('errors.modelCatalog.status') }}</span>
          <select v-model="statusFilter" class="rounded border border-gray-200 px-2 py-1" data-testid="endpoint-filter-status">
            <option value="all">{{ t('errors.modelCatalog.all') }}</option>
            <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[10px] text-gray-500">{{ t('errors.modelCatalog.uptimeAtLeast') }}</span>
          <input
            v-model="uptimeMinFilter"
            type="number"
            min="0"
            max="100"
            step="0.1"
            class="rounded border border-gray-200 px-2 py-1"
            data-testid="endpoint-filter-uptime-min"
          />
        </label>
      </div>

      <div class="mt-2">
        <div class="text-[10px] text-gray-500">{{ t('errors.modelCatalog.supportedParametersContainsAll') }}</div>
        <div v-if="supportedParameterOptions.length === 0" class="mt-1 text-[10px] text-gray-400">{{ t('errors.modelCatalog.noParameterMetadata') }}</div>
        <div v-else class="mt-1 flex flex-wrap gap-2">
          <label v-for="param in supportedParameterOptions" :key="param" class="inline-flex items-center gap-1 text-[10px] text-gray-700">
            <input
              type="checkbox"
              :checked="selectedParameters.includes(param)"
              :data-testid="`endpoint-filter-param-${param}`"
              @change="toggleParameter(param)"
            />
            <span>{{ param }}</span>
          </label>
        </div>
      </div>

      <div class="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        <label class="flex flex-col gap-1">
          <span class="text-[10px] text-gray-500">{{ t('errors.modelCatalog.sortMetric') }}</span>
          <select v-model="sortMetric" class="rounded border border-gray-200 px-2 py-1" data-testid="endpoint-sort-metric">
            <option value="latency_p50">{{ t('errors.modelCatalog.latencyP50') }}</option>
            <option value="latency_p99">{{ t('errors.modelCatalog.latencyP99') }}</option>
            <option value="throughput_p50">{{ t('errors.modelCatalog.throughputP50') }}</option>
            <option value="throughput_p99">{{ t('errors.modelCatalog.throughputP99') }}</option>
            <option value="uptime">{{ t('errors.modelCatalog.uptime') }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[10px] text-gray-500">{{ t('errors.modelCatalog.sortOrder') }}</span>
          <select v-model="sortOrder" class="rounded border border-gray-200 px-2 py-1" data-testid="endpoint-sort-order">
            <option value="asc">{{ t('errors.modelCatalog.sortAsc') }}</option>
            <option value="desc">{{ t('errors.modelCatalog.sortDesc') }}</option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="props.error" class="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
      {{ props.error }}
    </div>

    <div v-if="!props.loading && props.items.length === 0" class="mt-3 text-[11px] text-gray-500">
      {{ t('errors.modelCatalog.noEndpointDetails') }}
    </div>
    <div v-else-if="!props.loading && filteredAndSortedItems.length === 0" class="mt-3 text-[11px] text-gray-500">
      {{ t('errors.modelCatalog.noEndpointMatches') }}
    </div>

    <div v-else class="mt-3 space-y-2">
      <div
        v-for="item in filteredAndSortedItems"
        :key="item.endpointKey"
        class="rounded border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700"
        :data-testid="`endpoint-detail-item-${item.endpointKey}`"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="truncate font-semibold text-gray-900">
            {{ item.providerName || item.tag || t('errors.modelCatalog.unknownProvider') }}
          </div>
          <div class="shrink-0 text-[10px] uppercase tracking-wide text-gray-500">
            {{ item.quantization || t('errors.modelCatalog.notAvailable') }}
          </div>
        </div>
        <div class="mt-1 flex flex-wrap gap-2 text-[10px] text-gray-600">
          <span>{{ t('errors.modelCatalog.endpointStatus') }}: {{ emptyValue(item.status) }}</span>
          <span>{{ t('errors.modelCatalog.endpointContext') }}: {{ emptyValue(item.contextLength) }}</span>
          <span>{{ t('errors.modelCatalog.endpointPrompt') }}: {{ emptyValue(item.maxPromptTokens) }}</span>
          <span>{{ t('errors.modelCatalog.endpointCompletion') }}: {{ emptyValue(item.maxCompletionTokens) }}</span>
          <span>{{ t('errors.modelCatalog.endpointUptime30m') }}: {{ emptyValue(item.uptimeLast30m) }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>
