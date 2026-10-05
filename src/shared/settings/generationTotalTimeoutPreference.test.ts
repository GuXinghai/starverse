import { describe, expect, it } from 'vitest'
import {
  isValidGenerationTotalTimeoutPreferenceMs, normalizeStoredGenerationTotalTimeoutMs,
  parseGenerationTotalTimeoutMinutesText,
} from './generationTotalTimeoutPreference'

describe('total generation timeout preference', () => {
  it('treats absent or unusable stored values as Unlimited', () => {
    for (const v of [undefined, null, 0, -1, 1.5, '600000', 59_999, 24 * 60 * 60_000 + 1, {}]) {
      expect(normalizeStoredGenerationTotalTimeoutMs(v)).toBeNull()
    }
    expect(normalizeStoredGenerationTotalTimeoutMs(1_800_000)).toBe(1_800_000)
  })
  it('accepts only null or a bounded integer ms', () => {
    expect(isValidGenerationTotalTimeoutPreferenceMs(null)).toBe(true)
    expect(isValidGenerationTotalTimeoutPreferenceMs(undefined)).toBe(false)
    expect(isValidGenerationTotalTimeoutPreferenceMs(60_000)).toBe(true)
    expect(isValidGenerationTotalTimeoutPreferenceMs(24 * 60 * 60_000)).toBe(true)
  })
  it('parses whole minutes in [1, 1440] and rejects everything else', () => {
    expect(parseGenerationTotalTimeoutMinutesText(' 30 ')).toEqual({ ok: true, ms: 1_800_000 })
    expect(parseGenerationTotalTimeoutMinutesText('1440')).toEqual({ ok: true, ms: 86_400_000 })
    for (const bad of ['', '0', '-5', '1.5', '1e3', 'abc', '1441', '99999999999999999999']) {
      expect(parseGenerationTotalTimeoutMinutesText(bad).ok, bad).toBe(false)
    }
  })
})
