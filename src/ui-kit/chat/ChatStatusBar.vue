<script setup lang="ts">
import { computed } from 'vue'
import type { RunVM } from './types'
import { t } from '@/shared/i18n'

type TokenUsage = Readonly<{
  promptTokens: number
  completionTokens: number
  totalTokens: number
}>

const props = withDefaults(
  defineProps<{
    title?: string
    run: RunVM | null
    isRunning: boolean
    showAbort?: boolean
    showReset?: boolean
    showUsage?: boolean
    usageThisTurn?: TokenUsage | null
    usageSessionTotalDerived?: TokenUsage | null
    showSessionTotalDerived?: boolean
  }>(),
  {
    title: '',
    showAbort: true,
    showReset: false,
    showUsage: true,
    showSessionTotalDerived: false,
  },
)

const emit = defineEmits<{
  abort: []
  reset: []
}>()

type Tone = 'idle' | 'active' | 'ok' | 'error' | 'warning'

const statusTone = computed<Tone>(() => {
  const s = props.run?.status
  switch (s) {
    case 'requesting':
    case 'streaming':
      return 'active'
    case 'done':
      return 'ok'
    case 'error':
      return 'error'
    case 'aborted':
      return 'warning'
    default:
      return 'idle'
  }
})

const statusTextClass = computed(() => {
  switch (statusTone.value) {
    case 'error':
      return 'text-[var(--sv-danger)]'
    case 'warning':
      return 'text-[var(--sv-warning)]'
    case 'idle':
      return 'text-[var(--sv-text-3)]'
    default:
      return 'text-[var(--sv-text-2)]'
  }
})

const errorText = computed(() => {
  const err = props.run?.error
  if (!err) return null
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err, null, 2)
  } catch {
    return String(err)
  }
})

const usageSummary = computed(() => {
  const direct = props.usageThisTurn
  if (direct) return { pt: direct.promptTokens, ct: direct.completionTokens, tt: direct.totalTokens }

  if (!props.run?.usage || typeof props.run.usage !== 'object') return null
  const u = props.run.usage as any
  const pt = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : null
  const ct = typeof u.completion_tokens === 'number' ? u.completion_tokens : null
  const tt = typeof u.total_tokens === 'number' ? u.total_tokens : null
  if (pt == null && ct == null && tt == null) return null
  return { pt: pt ?? 0, ct: ct ?? 0, tt: tt ?? 0 }
})

const derivedUsageSummary = computed(() => {
  const u = props.usageSessionTotalDerived
  if (!u) return null
  return { pt: u.promptTokens, ct: u.completionTokens, tt: u.totalTokens }
})

function parseNumberLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function resolveUsageCostInfo(usage: unknown): Readonly<{ value: number; currency: string }> | null {
  if (!usage || typeof usage !== 'object') return null
  const raw = usage as Record<string, unknown>
  const rawCost = raw.cost

  let value = parseNumberLike(rawCost)
  if (value == null && rawCost && typeof rawCost === 'object') {
    const costObj = rawCost as Record<string, unknown>
    value =
      parseNumberLike(costObj.amount) ??
      parseNumberLike(costObj.value) ??
      parseNumberLike(costObj.total) ??
      parseNumberLike(costObj.usd)
  }
  if (value == null) return null

  const rawCurrency =
    (rawCost && typeof rawCost === 'object' ? (rawCost as Record<string, unknown>).currency : undefined) ??
    raw.cost_currency ??
    raw.currency
  const currency = typeof rawCurrency === 'string' && rawCurrency.trim().length > 0 ? rawCurrency.trim().toUpperCase() : 'USD'
  return { value, currency }
}

const usageCostSummary = computed(() => {
  const info = resolveUsageCostInfo(props.run?.usage)
  if (!info) return null
  const decimals = info.value >= 1 ? 4 : 6
  return {
    ...info,
    text: `${info.currency} ${info.value.toFixed(decimals)}`,
  }
})
</script>

<template>
  <div class="border-b border-[var(--sv-line)] bg-white">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs text-[var(--sv-text-3)]">
      <div class="flex items-center gap-2">
        <div class="font-medium text-[var(--sv-text)]">{{ props.title || t('chat.status.title') }}</div>
        <span
          v-if="props.run"
          class="font-medium"
          :class="statusTextClass"
        >
          {{ props.run.status }}
        </span>
      </div>

      <div v-if="props.run" class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div v-if="props.run.model">
          {{ t('chat.status.model') }}: <span class="font-mono text-[var(--sv-text-2)]">{{ props.run.model }}</span>
        </div>
        <div v-if="props.run.provider">
          {{ t('chat.status.provider') }}: <span class="font-mono text-[var(--sv-text-2)]">{{ props.run.provider }}</span>
        </div>
        <div v-if="props.run.generationId">
          {{ t('chat.status.generation') }}: <span class="font-mono text-[var(--sv-text-2)]">{{ props.run.generationId }}</span>
        </div>
        <div v-if="props.run.finishReason">
          {{ t('chat.status.finish') }}: <span class="font-mono text-[var(--sv-text-2)]">{{ props.run.finishReason }}</span>
        </div>
        <div
          v-if="props.run.completionOutcome === 'truncated'"
          class="font-medium text-[var(--sv-warning)]"
        >
          {{ t('chat.status.truncated') }}
        </div>
        <div v-if="props.showUsage && usageSummary" class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{{ t('chat.status.thisTurn') }}</span>
          <span class="font-mono text-[var(--sv-text-2)]">{{ t('chat.status.promptShort') }}={{ usageSummary.pt }}</span>
          <span class="font-mono text-[var(--sv-text-2)]">{{ t('chat.status.completionShort') }}={{ usageSummary.ct }}</span>
          <span class="font-mono text-[var(--sv-text-2)]">{{ t('chat.status.totalShort') }}={{ usageSummary.tt }}</span>
          <span v-if="usageCostSummary" class="font-mono text-[var(--sv-text-2)]">{{ t('chat.status.cost') }}={{ usageCostSummary.text }}</span>
        </div>
        <div
          v-if="props.showUsage && props.showSessionTotalDerived && derivedUsageSummary"
          class="flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span>{{ t('chat.status.sessionTotalDerived') }}</span>
          <span class="font-mono text-[var(--sv-text-2)]">{{ t('chat.status.promptShort') }}={{ derivedUsageSummary.pt }}</span>
          <span class="font-mono text-[var(--sv-text-2)]">{{ t('chat.status.completionShort') }}={{ derivedUsageSummary.ct }}</span>
          <span class="font-mono text-[var(--sv-text-2)]">{{ t('chat.status.totalShort') }}={{ derivedUsageSummary.tt }}</span>
        </div>
      </div>

      <div class="ml-auto flex gap-2">
        <slot name="actions" />
        <button
          v-if="props.showAbort"
          class="sv-btn sv-btn-sm"
          :disabled="!props.isRunning"
          @click="emit('abort')"
        >
          {{ t('chat.status.abort') }}
        </button>
        <button
          v-if="props.showReset"
          class="sv-btn sv-btn-sm"
          @click="emit('reset')"
        >
          {{ t('chat.status.reset') }}
        </button>
      </div>
    </div>

    <div v-if="errorText" class="sv-notice sv-notice-danger mx-4 mb-2">
      <span class="font-medium">{{ t('chat.status.error') }}:</span> <span class="min-w-0 break-words font-mono">{{ errorText }}</span>
    </div>
  </div>
</template>
