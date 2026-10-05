/**
 * User-facing "Total generation timeout": the maximum wall-clock duration of one generation.
 * Stored in the V2 UI preferences as milliseconds; `null` / absent means Unlimited (the default).
 * It is NOT an idle, first-token, connection or tool-wait timeout.
 */
export const GENERATION_TOTAL_TIMEOUT_PREFERENCE_KEY = 'generationTotalTimeoutMs'
export const GENERATION_TOTAL_TIMEOUT_MAX_MS = 24 * 60 * 60_000
export const GENERATION_TOTAL_TIMEOUT_MIN_MINUTES = 1
export const GENERATION_TOTAL_TIMEOUT_MAX_MINUTES = GENERATION_TOTAL_TIMEOUT_MAX_MS / 60_000

export function isValidGenerationTotalTimeoutPreferenceMs(value: unknown): value is number | null {
  return value === null ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= GENERATION_TOTAL_TIMEOUT_MIN_MINUTES * 60_000 &&
      value <= GENERATION_TOTAL_TIMEOUT_MAX_MS)
}

/** Unreadable or out-of-range persisted values fall back to Unlimited rather than a surprising limit. */
export function normalizeStoredGenerationTotalTimeoutMs(value: unknown): number | null {
  return typeof value === 'number' && isValidGenerationTotalTimeoutPreferenceMs(value) ? value : null
}

/** Whole minutes only, within [1, 1440]. */
export function parseGenerationTotalTimeoutMinutesText(text: string): Readonly<{ ok: true; ms: number }> | Readonly<{ ok: false }> {
  const trimmed = String(text ?? '').trim()
  if (!/^\d+$/.test(trimmed)) return { ok: false }
  const minutes = Number(trimmed)
  if (!Number.isSafeInteger(minutes) || minutes < GENERATION_TOTAL_TIMEOUT_MIN_MINUTES ||
      minutes > GENERATION_TOTAL_TIMEOUT_MAX_MINUTES) return { ok: false }
  return { ok: true, ms: minutes * 60_000 }
}
