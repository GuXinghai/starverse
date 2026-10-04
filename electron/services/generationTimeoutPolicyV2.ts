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
export const GENERATION_TOTAL_TIMEOUT_MAX_MS = 24 * 60 * 60_000

/** `undefined` / `null` mean "unlimited". Any other value must be a safe integer in [1, max]. */
export type GenerationTotalTimeoutMsV2 = number | null | undefined

export function isValidGenerationTotalTimeoutMsV2(value: GenerationTotalTimeoutMsV2): boolean {
  return value === undefined || value === null ||
    (Number.isSafeInteger(value) && value >= 1 && value <= GENERATION_TOTAL_TIMEOUT_MAX_MS)
}

export function createGenerationAbortScope(
  external: AbortSignal | undefined,
  totalTimeoutMs?: GenerationTotalTimeoutMsV2,
): Readonly<{ signal: AbortSignal; timedOut: () => boolean; dispose: () => void }> {
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
