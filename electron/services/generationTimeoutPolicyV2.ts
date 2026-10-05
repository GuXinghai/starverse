/**
 * Shared Generation V2 execution deadline boundary.
 *
 * Timeout categories are NOT interchangeable:
 *  - total generation timeout: enforced here, only when explicitly configured (default: unlimited);
 *  - connection / first-response / first-event / stream-idle: intentionally not enforced. Long-thinking
 *    models may legitimately be silent, so no default may reinterpret silence as failure;
 *  - tool wait: the runner terminalizes as `awaiting_tool` and holds no timer here.
 * User cancellation (Stop) always aborts with reason `user_cancelled`, independent of any timeout.
 */
import { GENERATION_TOTAL_TIMEOUT_MAX_MS, GENERATION_TOTAL_TIMEOUT_PREFERENCE_KEY, normalizeStoredGenerationTotalTimeoutMs } from '../../src/shared/settings/generationTotalTimeoutPreference'

import { GENERATION_V2_UI_PREFERENCE_NAMESPACE } from '../../src/shared/settings/generationV2UiPreferenceKeys'
export { GENERATION_TOTAL_TIMEOUT_MAX_MS }

/** `undefined` / `null` mean "unlimited". Any other value must be a safe integer in [1, max]. */
export type GenerationTotalTimeoutMsV2 = number | null | undefined

export function isValidGenerationTotalTimeoutMsV2(value: GenerationTotalTimeoutMsV2): boolean {
  return value === undefined || value === null ||
    (Number.isSafeInteger(value) && value >= 1 && value <= GENERATION_TOTAL_TIMEOUT_MAX_MS)
}

let configuredTotalTimeoutSource: () => GenerationTotalTimeoutMsV2 = () => null

/**
 * Registers where the user-configured total timeout is read (once, at app wiring). It is consulted each time
 * a generation scope is created with no explicit value, so every runner honours Settings without per-provider code.
 */
export function setGenerationTotalTimeoutSourceV2(source: (() => GenerationTotalTimeoutMsV2) | null): void {
  configuredTotalTimeoutSource = source ?? (() => null)
}

/** Reads the persisted Settings value on every call, so a change applies to the next generation without restart. */
export function createStoreBackedGenerationTotalTimeoutSourceV2(store: Readonly<{ get: (key: string) => unknown }>): () => GenerationTotalTimeoutMsV2 {
  return () => {
    try {
      const prefs = store.get(GENERATION_V2_UI_PREFERENCE_NAMESPACE)
      const raw = prefs && typeof prefs === 'object' ? (prefs as Record<string, unknown>)[GENERATION_TOTAL_TIMEOUT_PREFERENCE_KEY] : undefined
      return normalizeStoredGenerationTotalTimeoutMs(raw)
    } catch { return null }
  }
}

export function createGenerationAbortScope(
  external: AbortSignal | undefined,
  explicitTotalTimeoutMs?: GenerationTotalTimeoutMsV2,
): Readonly<{ signal: AbortSignal; timedOut: () => boolean; dispose: () => void }> {
  const totalTimeoutMs = explicitTotalTimeoutMs === undefined ? configuredTotalTimeoutSource() : explicitTotalTimeoutMs
  if (!isValidGenerationTotalTimeoutMsV2(totalTimeoutMs)) throw new RangeError('GENERATION_TOTAL_TIMEOUT_INVALID')
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort('user_cancelled')
  if (external?.aborted) controller.abort('user_cancelled')
  else external?.addEventListener('abort', onAbort, { once: true })
  // setTimeout silently clamps > 2^31-1 to 1ms; 24h max keeps us well inside the range.
  const timer = typeof totalTimeoutMs === 'number'
    ? setTimeout(() => { if (controller.signal.aborted) return; timedOut = true; controller.abort('timeout') }, totalTimeoutMs)
    : undefined
  ;(timer as NodeJS.Timeout | undefined)?.unref?.()
  return Object.freeze({
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      if (timer) clearTimeout(timer)
      external?.removeEventListener('abort', onAbort)
    },
  })
}
