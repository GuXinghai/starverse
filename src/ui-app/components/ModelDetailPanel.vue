<script setup lang="ts">
import { computed } from 'vue'
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
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
  return value.toLocaleString()
}

function formatEpochSec(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
  try {
    return `${value} (${new Date(value * 1000).toLocaleString()})`
  } catch {
    return String(value)
  }
}

function formatEpochMs(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 'n/a'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return 'n/a'
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
</script>

<template>
  <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3" data-testid="model-detail-panel">
    <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Model Details</div>
    <div class="mt-1 text-[11px] text-gray-500">
      <div class="truncate" :title="props.modelId">{{ props.modelId }}</div>
      <div v-if="detail">Synced: {{ formatEpochMs(detail.syncedAtMs) }}</div>
    </div>

    <div v-if="props.error" class="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
      {{ props.error }}
    </div>
    <div v-else-if="props.loading" class="mt-2 text-[11px] text-gray-500">Loading model details...</div>
    <div v-else-if="!hasDetail" class="mt-2 text-[11px] text-gray-500">No model details available yet.</div>

    <div v-if="detail" class="mt-3 space-y-3 text-[11px] text-gray-700">
      <section class="rounded border border-gray-200 bg-white p-2" data-testid="model-detail-basic">
        <div class="font-semibold text-gray-900">Basic Info</div>
        <div class="mt-1 space-y-1">
          <div><span class="text-gray-500">Display:</span> {{ detail.displayName }}</div>
          <div><span class="text-gray-500">Model Key:</span> {{ detail.modelKey }}</div>
          <div><span class="text-gray-500">Canonical:</span> {{ detail.canonicalSlug || 'n/a' }}</div>
          <div><span class="text-gray-500">Vendor / Family:</span> {{ detail.vendor || 'n/a' }} / {{ detail.family || 'n/a' }}</div>
          <div><span class="text-gray-500">Created:</span> {{ formatEpochSec(detail.createdAtSec) }}</div>
          <div><span class="text-gray-500">Description:</span> {{ detail.description || 'n/a' }}</div>
        </div>
      </section>

      <section class="rounded border border-gray-200 bg-white p-2">
        <div class="font-semibold text-gray-900">Capability Limits & Quotas</div>
        <div class="mt-1 space-y-1">
          <div><span class="text-gray-500">Context Length:</span> {{ formatNumber(detail.contextLength) }} tokens</div>
          <div><span class="text-gray-500">Max Completion:</span> {{ formatNumber(detail.maxOutputTokens) }} tokens</div>
          <div><span class="text-gray-500">Top Provider Context:</span> {{ formatNumber(detail.topProviderContextLength) }} tokens</div>
          <div><span class="text-gray-500">Per-request Limits:</span> {{ detail.hasPerRequestLimits ? 'present' : 'none' }}</div>
          <pre class="max-h-28 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ formatJson(detail.perRequestLimits) }}</pre>
        </div>
      </section>

      <section class="rounded border border-gray-200 bg-white p-2">
        <div class="font-semibold text-gray-900">Modalities & Architecture</div>
        <div class="mt-1 space-y-1">
          <div><span class="text-gray-500">Architecture:</span> {{ detail.architectureModality || 'n/a' }}</div>
          <div><span class="text-gray-500">Input:</span> {{ detail.inputModalities.join(', ') || 'n/a' }}</div>
          <div><span class="text-gray-500">Output:</span> {{ detail.outputModalities.join(', ') || 'n/a' }}</div>
          <div><span class="text-gray-500">Tokenizer:</span> {{ detail.tokenizer || 'n/a' }}</div>
          <div><span class="text-gray-500">Instruct Type:</span> {{ detail.instructType || 'n/a' }}</div>
        </div>
      </section>

      <section class="rounded border border-gray-200 bg-white p-2">
        <div class="font-semibold text-gray-900">Parameters & Defaults</div>
        <div class="mt-1 space-y-1">
          <div><span class="text-gray-500">Supported:</span> {{ detail.supportedParameters.join(', ') || 'n/a' }}</div>
          <div><span class="text-gray-500">Default Parameters:</span> {{ detail.hasDefaultParameters ? 'present' : 'none' }}</div>
          <pre class="max-h-28 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ formatJson(detail.defaultParameters) }}</pre>
        </div>
      </section>

      <section class="rounded border border-gray-200 bg-white p-2">
        <div class="font-semibold text-gray-900">Pricing (Decimal Strings)</div>
        <div class="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
          <div class="text-gray-500">prompt</div><div>{{ detail.pricing.prompt || 'n/a' }}</div>
          <div class="text-gray-500">completion</div><div>{{ detail.pricing.completion || 'n/a' }}</div>
          <div class="text-gray-500">request</div><div>{{ detail.pricing.request || 'n/a' }}</div>
          <div class="text-gray-500">image</div><div>{{ detail.pricing.image || 'n/a' }}</div>
          <div class="text-gray-500">web_search</div><div>{{ detail.pricing.webSearch || 'n/a' }}</div>
          <div class="text-gray-500">internal_reasoning</div><div>{{ detail.pricing.internalReasoning || 'n/a' }}</div>
          <div class="text-gray-500">input_reuse_read</div><div>{{ detail.pricing.inputCacheRead || 'n/a' }}</div>
          <div class="text-gray-500">input_reuse_write</div><div>{{ detail.pricing.inputCacheWrite || 'n/a' }}</div>
        </div>
      </section>

      <section class="rounded border border-gray-200 bg-white p-2">
        <div class="font-semibold text-gray-900">Compliance & Lifecycle</div>
        <div class="mt-1 space-y-1">
          <div><span class="text-gray-500">Status / Visibility:</span> {{ detail.status }} / {{ detail.visibility }}</div>
          <div><span class="text-gray-500">Moderated:</span> {{ detail.topProviderIsModerated === null ? 'n/a' : detail.topProviderIsModerated ? 'yes' : 'no' }}</div>
          <div><span class="text-gray-500">Expiration Date:</span> {{ detail.expirationDate || 'n/a' }}</div>
          <div><span class="text-gray-500">Expiration Epoch:</span> {{ formatEpochSec(detail.expirationAtSec) }}</div>
          <div><span class="text-gray-500">Unknown Expiration:</span> {{ detail.unknownExpiration ? 'yes' : 'no' }}</div>
          <div><span class="text-gray-500">First Seen:</span> {{ formatEpochMs(detail.firstSeenAtMs) }}</div>
          <div><span class="text-gray-500">Last Seen:</span> {{ formatEpochMs(detail.lastSeenAtMs) }}</div>
        </div>
      </section>

      <details class="rounded border border-gray-200 bg-white p-2" data-testid="model-detail-raw">
        <summary class="cursor-pointer font-semibold text-gray-900">Raw Data (raw_json)</summary>
        <pre class="mt-2 max-h-40 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ detail.raw.rawJson || 'null' }}</pre>
        <div class="mt-2 text-[10px] text-gray-500">Derived field raw snapshots</div>
        <pre class="mt-1 max-h-28 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ detail.raw.pricingJson || 'null' }}</pre>
        <pre class="mt-1 max-h-28 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ detail.raw.perRequestLimitsJson || 'null' }}</pre>
        <pre class="mt-1 max-h-28 overflow-auto rounded bg-gray-50 p-2 text-[10px]">{{ detail.raw.defaultParametersJson || 'null' }}</pre>
      </details>
    </div>
  </aside>
</template>
