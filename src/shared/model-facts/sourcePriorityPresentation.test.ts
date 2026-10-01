import { describe, expect, it } from 'vitest'
import {
  SOURCE_PRIORITY_KEYS, parseSourcePriorityDraft, sourcePriorityErrorKey, sourcePriorityErrorKind, sourcePriorityKey,
  sourcePriorityRanks, sourcePriorityTies, sourcePriorityValidationKey,
} from './modelFactPresentation'
import { sourcePriorityConfigRevisionV1 } from '@/next/generation-v2/model-facts/sourcePriorityConfigV1'
import { t } from '@/shared/i18n'

describe('Source Priority presentation (Goal 4 S3)', () => {
  it('parses whole numbers and reports invalid text without coercing to 0', () => {
    expect(parseSourcePriorityDraft(' 3 ')).toEqual({ ok: true, value: 3 })
    expect(parseSourcePriorityDraft('-2')).toEqual({ ok: true, value: -2 })
    expect(parseSourcePriorityDraft('-0')).toEqual({ ok: true, value: 0 })
    expect(parseSourcePriorityDraft('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseSourcePriorityDraft('   ')).toEqual({ ok: false, reason: 'empty' })
    for (const text of ['abc', '1.5', '1e3', '0x10', 'NaN', 'Infinity', '3 4']) {
      expect(parseSourcePriorityDraft(text)).toEqual({ ok: false, reason: 'notInteger' })
    }
    expect(parseSourcePriorityDraft('9007199254740992')).toEqual({ ok: false, reason: 'outOfRange' })
    expect(parseSourcePriorityDraft(String(Number.MAX_SAFE_INTEGER))).toEqual({ ok: true, value: Number.MAX_SAFE_INTEGER })
  })

  it('derives dense rank and tie groups from the integers only (higher wins)', () => {
    expect(sourcePriorityRanks({ provider_native: 3, models_dev: 2, capability_rule: 1 }).map((entry) => [entry.key, entry.rank, entry.tiedWith]))
      .toEqual([['provider_native', 1, []], ['models_dev', 2, []], ['capability_rule', 3, []]])
    expect(sourcePriorityRanks({ provider_native: 3, models_dev: 3, capability_rule: -1 }).map((entry) => [entry.key, entry.rank, entry.tiedWith]))
      .toEqual([['provider_native', 1, ['models_dev']], ['models_dev', 1, ['provider_native']], ['capability_rule', 2, []]])
    expect(sourcePriorityTies({ provider_native: 3, models_dev: 2, capability_rule: 1 })).toEqual([])
    expect(sourcePriorityTies({ provider_native: 1, models_dev: 5, capability_rule: 1 })).toEqual([['provider_native', 'capability_rule']])
    expect(sourcePriorityTies({ provider_native: 0, models_dev: 0, capability_rule: 0 })).toEqual([SOURCE_PRIORITY_KEYS])
  })

  it('leaves sourcePriorityConfigRevision a function of the priorities alone', () => {
    const priorities = { provider_native: 3, models_dev: 3, capability_rule: 1 }
    const before = sourcePriorityConfigRevisionV1(priorities)
    sourcePriorityRanks(priorities)
    sourcePriorityTies(priorities)
    expect(sourcePriorityConfigRevisionV1(priorities)).toBe(before)
    expect(priorities).toEqual({ provider_native: 3, models_dev: 3, capability_rule: 1 })
  })

  it('maps bridge, repo and IPC failure codes (including Electron-wrapped ones) to localized kinds', () => {
    expect(sourcePriorityErrorKind(new Error('GENERATION_V2_SOURCE_PRIORITY_CONFIG_STALE_REVISION'))).toBe('staleRevision')
    expect(sourcePriorityErrorKind(new Error("Error invoking remote method 'x': Error: GENERATION_V2_SOURCE_PRIORITY_CONFIG_STALE_REVISION"))).toBe('staleRevision')
    expect(sourcePriorityErrorKind(new Error('GENERATION_V2_SOURCE_PRIORITY_CONFIG_INVALID'))).toBe('invalid')
    expect(sourcePriorityErrorKind(new Error('GENERATION_V2_SOURCE_PRIORITY_CONFIG_INPUT_INVALID'))).toBe('invalid')
    expect(sourcePriorityErrorKind(new Error('GENERATION_V2_SOURCE_PRIORITY_CONFIG_IPC_INVALID'))).toBe('invalid')
    expect(sourcePriorityErrorKind(new Error('GENERATION_V2_SOURCE_PRIORITY_CONFIG_UNAVAILABLE'))).toBe('unavailable')
    expect(sourcePriorityErrorKind('boom')).toBe('unknown')
  })

  it('has localized text for every key it can return', () => {
    const keys = [
      ...(['staleRevision', 'invalid', 'unavailable', 'unknown'] as const).map(sourcePriorityErrorKey),
      ...(['empty', 'notInteger', 'outOfRange'] as const).map(sourcePriorityValidationKey),
      ...['rank', 'rankTied', 'order', 'noTies', 'tie', 'tieExplanation', 'openInspector', 'edit', 'latestSaved', 'latestLoaded', 'loadLatestKeepDraft'].map(sourcePriorityKey),
    ]
    for (const locale of ['zh-CN', 'en-US'] as const) {
      for (const key of keys) expect(t(key, locale), `${locale} ${key}`).not.toBe(key)
    }
  })
})
