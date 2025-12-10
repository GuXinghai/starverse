import { computed, type ComputedRef } from 'vue'
import type { ReasoningPreference } from '../types/chat'
import type { ModelGenerationCapability } from '../types/generation'
import type { ReasoningConfig } from '../types/generation'

export type ReasoningTier = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'custom'

interface UseReasoningTiersOptions {
  preference: ComputedRef<ReasoningPreference>
  capability: ComputedRef<ModelGenerationCapability | null>
  onUpdate: (updates: Partial<ReasoningPreference>) => void
}

const BUDGET_PRESETS = {
  minimal: 1000,
  low: 2000,
  medium: 8000,
  high: 16000,
}

export function useReasoningTiers(options: UseReasoningTiersOptions) {
  const { preference, capability, onUpdate } = options

  const supportsReasoning = computed(
    () => capability.value?.reasoning.supportsReasoningParam === true,
  )

  const supportsBudget = computed(
    () => capability.value?.reasoning.supportsMaxReasoningTokens === true,
  )

  const resolvedTier = computed<ReasoningTier>(() => {
    if (!supportsReasoning.value || preference.value.visibility === 'off') return 'off'
    if (supportsBudget.value && typeof preference.value.maxTokens === 'number') {
      const val = preference.value.maxTokens
      if (val === BUDGET_PRESETS.minimal) return 'minimal'
      if (val === BUDGET_PRESETS.low) return 'low'
      if (val === BUDGET_PRESETS.medium) return 'medium'
      if (val === BUDGET_PRESETS.high) return 'high'
      return 'custom'
    }
    const effort = preference.value.effort
    if (effort === 'minimal') return 'minimal'
    if (effort === 'low') return 'low'
    if (effort === 'high') return 'high'
    if (effort === 'medium') return 'medium'
    return 'custom'
  })

  const reasoningConfig = computed<ReasoningConfig>(() => {
    if (!supportsReasoning.value) {
      return {
        controlMode: 'disabled',
        effort: 'none',
        maxReasoningTokens: undefined,
        maxCompletionTokens: undefined,
        showReasoningContent: false,
      }
    }

    if (preference.value.visibility === 'off') {
      return {
        controlMode: 'disabled',
        effort: preference.value.effort || undefined,
        maxReasoningTokens: undefined,
        maxCompletionTokens: undefined,
        showReasoningContent: false,
      }
    }

    if (supportsBudget.value && typeof preference.value.maxTokens === 'number') {
      return {
        controlMode: 'max_tokens',
        maxReasoningTokens: preference.value.maxTokens,
        effort: preference.value.effort || undefined,
        maxCompletionTokens: undefined,
        showReasoningContent: preference.value.visibility === 'visible',
      }
    }

    return {
      controlMode: 'effort',
      effort: preference.value.effort || 'medium',
      maxReasoningTokens: undefined,
      maxCompletionTokens: undefined,
      showReasoningContent: preference.value.visibility === 'visible',
    }
  })

  const selectTier = (tier: ReasoningTier) => {
    if (!supportsReasoning.value) return
    if (tier === 'off') {
      onUpdate({ visibility: 'off', maxTokens: null, mode: 'custom' })
      return
    }

    if (supportsBudget.value) {
      const value =
        tier === 'minimal'
          ? BUDGET_PRESETS.minimal
          : tier === 'low'
            ? BUDGET_PRESETS.low
            : tier === 'high'
              ? BUDGET_PRESETS.high
              : BUDGET_PRESETS.medium
      onUpdate({
        visibility: 'visible',
        maxTokens: value,
        mode: tier,
        effort: preference.value.effort,
      })
    } else {
      const effort =
        tier === 'minimal'
          ? 'minimal'
          : tier === 'low'
            ? 'low'
            : tier === 'high'
              ? 'high'
              : 'medium'
      onUpdate({
        visibility: 'visible',
        effort,
        maxTokens: null,
        mode: tier,
      })
    }
  }

  const setMaxReasoningTokens = (value: number | null) => {
    if (!supportsBudget.value || value === null || Number.isNaN(value)) {
      onUpdate({ maxTokens: null, mode: 'custom' })
      return
    }
    onUpdate({ maxTokens: Math.round(value), mode: 'custom', visibility: 'visible' })
  }

  const setEffort = (effort: ReasoningPreference['effort']) => {
    onUpdate({ effort, mode: 'custom', visibility: 'visible' })
  }

  const setVisibility = (visible: boolean) => {
    onUpdate({ visibility: visible ? 'visible' : 'off' })
  }

  return {
    supportsReasoning,
    supportsBudget,
    tier: resolvedTier,
    reasoningConfig,
    selectTier,
    setMaxReasoningTokens,
    setEffort,
    setVisibility,
  }
}
