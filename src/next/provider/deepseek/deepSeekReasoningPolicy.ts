import type { ReasoningEffort } from '../../state/types'

export const DEEPSEEK_SELECTABLE_REASONING_EFFORTS =
  Object.freeze(['high', 'max'] as const satisfies readonly ReasoningEffort[])

export function isDeepSeekSelectableReasoningEffort(
  value: unknown,
): value is (typeof DEEPSEEK_SELECTABLE_REASONING_EFFORTS)[number] {
  return typeof value === 'string' &&
    (DEEPSEEK_SELECTABLE_REASONING_EFFORTS as readonly string[]).includes(value)
}
