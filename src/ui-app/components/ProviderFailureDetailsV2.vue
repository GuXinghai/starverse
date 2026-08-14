<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@/shared/i18n'
import type { ProviderFailureV2 } from '@/shared/provider/providerFailureV2'
import { projectProviderFailureEnvelopeForUiV2 } from '@/shared/provider/providerFailureUiProjectionV2'

const props = withDefaults(defineProps<{
  failure: ProviderFailureV2
  testIdPrefix?: string
}>(), {
  testIdPrefix: 'provider-failure',
})

const projection = computed(() => projectProviderFailureEnvelopeForUiV2(props.failure))
const failure = computed(() => projection.value.failure)
const copied = ref(false)
const safeProjectedJson = computed(() => JSON.stringify(projection.value, null, 2))
const providerRawJson = computed(() => {
  const raw = failure.value.providerError?.rawJson
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw, null, 2)
  } catch {
    return '[unserializable raw error]'
  }
})

async function copySafeProjectedJson() {
  try {
    await navigator.clipboard.writeText(safeProjectedJson.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <details
    class="mt-2 rounded-md border border-red-200 bg-red-50/70 px-3 py-2 text-[11px] text-red-950"
    :data-testid="`${props.testIdPrefix}-details-v2`"
  >
    <summary class="cursor-pointer font-semibold">
      {{ t('errors.providerFailureDetails.title') }}
    </summary>

    <div
      v-if="projection.uiTruncations.length > 0"
      class="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900"
      :data-testid="`${props.testIdPrefix}-ui-truncation`"
    >
      {{ t('errors.providerFailureDetails.uiTruncated') }}
      {{ projection.projectedBytes }} / 65536 bytes
    </div>

    <dl class="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)]">
      <dt class="font-semibold">{{ t('errors.providerFailureDetails.provider') }}</dt>
      <dd :data-testid="`${props.testIdPrefix}-provider`">{{ failure.provider.namespace }}:{{ failure.provider.id }}</dd>
      <dt class="font-semibold">{{ t('errors.providerFailureDetails.origin') }}</dt>
      <dd :data-testid="`${props.testIdPrefix}-origin`">{{ failure.origin }}</dd>
      <dt class="font-semibold">{{ t('errors.providerFailureDetails.phase') }}</dt>
      <dd :data-testid="`${props.testIdPrefix}-phase`">{{ failure.phase }}</dd>
      <dt class="font-semibold">{{ t('errors.providerFailureDetails.diagnosticCode') }}</dt>
      <dd :data-testid="`${props.testIdPrefix}-diagnostic`">{{ failure.starverseDiagnosticCode }}</dd>
      <dt class="font-semibold">{{ t('errors.providerFailureDetails.contract') }}</dt>
      <dd class="break-all">{{ failure.contractId }}</dd>
      <dt class="font-semibold">{{ t('errors.providerFailureDetails.operation') }}</dt>
      <dd class="break-all">{{ failure.operationId }}</dd>
      <dt class="font-semibold">{{ t('errors.providerFailureDetails.requestSequence') }}</dt>
      <dd>{{ failure.requestSequence }}</dd>
      <template v-if="failure.httpStatus !== null">
        <dt class="font-semibold">{{ t('errors.providerFailureDetails.httpStatus') }}</dt>
        <dd :data-testid="`${props.testIdPrefix}-http-status`">
          {{ [failure.httpStatus, failure.httpStatusText].filter((value) => value !== null && value !== '').join(' ') }}
        </dd>
      </template>
      <template v-if="failure.providerError">
        <dt class="font-semibold">{{ t('errors.providerFailureDetails.providerCode') }}</dt>
        <dd>{{ failure.providerError.code ?? '—' }}</dd>
        <dt class="font-semibold">{{ t('errors.providerFailureDetails.providerType') }}</dt>
        <dd>{{ failure.providerError.type ?? '—' }}</dd>
        <dt class="font-semibold">{{ t('errors.providerFailureDetails.message') }}</dt>
        <dd class="whitespace-pre-wrap break-words" :data-testid="`${props.testIdPrefix}-message`">
          {{ failure.providerError.message ?? failure.providerError.rawText ?? '—' }}
        </dd>
        <dt class="font-semibold">{{ t('errors.providerFailureDetails.parameter') }}</dt>
        <dd>{{ failure.providerError.param ?? '—' }}</dd>
        <dt class="font-semibold">{{ t('errors.providerFailureDetails.requestId') }}</dt>
        <dd class="break-all">{{ failure.providerError.requestId ?? '—' }}</dd>
        <dt class="font-semibold">{{ t('errors.providerFailureDetails.retryAfter') }}</dt>
        <dd>{{ failure.providerError.retryAfterMs ?? '—' }}</dd>
      </template>
      <template v-if="failure.transportError">
        <dt class="font-semibold">{{ t('errors.providerFailureDetails.transport') }}</dt>
        <dd class="whitespace-pre-wrap break-words">
          {{ [failure.transportError.name, failure.transportError.code, failure.transportError.message].filter(Boolean).join(' · ') }}
        </dd>
      </template>
      <dt class="font-semibold">{{ t('errors.providerFailureDetails.redactions') }}</dt>
      <dd>{{ failure.redactions.length }}</dd>
      <dt class="font-semibold">{{ t('errors.providerFailureDetails.truncations') }}</dt>
      <dd>{{ failure.truncations.length }}</dd>
    </dl>

    <details class="mt-2 border-t border-red-200 pt-2">
      <summary class="cursor-pointer font-semibold">{{ t('errors.providerFailureDetails.safeJson') }}</summary>
      <div class="mt-2 flex justify-end">
        <button
          type="button"
          class="rounded border border-red-200 bg-white px-2 py-1 font-semibold hover:bg-red-50"
          :data-testid="`${props.testIdPrefix}-copy-json`"
          @click="copySafeProjectedJson"
        >
          {{ copied ? t('errors.providerFailureDetails.copied') : t('errors.providerFailureDetails.copy') }}
        </button>
      </div>
      <pre
        class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all"
        :data-testid="`${props.testIdPrefix}-safe-json`"
      >{{ safeProjectedJson }}</pre>
      <div v-if="providerRawJson || failure.providerError?.rawText || failure.rawFrameExcerpt" class="sr-only">
        {{ t('errors.providerFailureDetails.rawFacts') }}
      </div>
    </details>
  </details>
</template>
