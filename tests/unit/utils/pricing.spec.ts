import { describe, it, expect } from 'vitest'
import {
  parseUsdPerToken,
  formatUsdPer1MFromPerToken,
  formatUsdPerToken,
} from '../../../src/utils/pricing'

describe('pricing utils', () => {
  describe('parseUsdPerToken', () => {
    it('parses numeric strings', () => {
      expect(parseUsdPerToken('0.00002')).toBeCloseTo(0.00002, 12)
    })

    it('treats empty/invalid as 0', () => {
      expect(parseUsdPerToken('')).toBe(0)
      expect(parseUsdPerToken(null)).toBe(0)
      expect(parseUsdPerToken(undefined)).toBe(0)
      expect(parseUsdPerToken('not-a-number')).toBe(0)
    })

    it('supports scientific notation', () => {
      expect(parseUsdPerToken('1e-6')).toBeCloseTo(0.000001, 12)
    })
  })

  describe('formatUsdPer1MFromPerToken', () => {
    it('converts per-token to per-1M (string-safe)', () => {
      expect(formatUsdPer1MFromPerToken('0.00002')).toBe('20')
    })

    it('treats 0/empty/undefined as 0', () => {
      expect(formatUsdPer1MFromPerToken('0')).toBe('0')
      expect(formatUsdPer1MFromPerToken('')).toBe('0')
      expect(formatUsdPer1MFromPerToken(undefined)).toBe('0')
      expect(formatUsdPer1MFromPerToken(null)).toBe('0')
    })

    it('supports scientific notation', () => {
      expect(formatUsdPer1MFromPerToken('1e-6')).toBe('1')
    })

    it('avoids float tail errors like 19.999999', () => {
      // 0.000019999999 per token * 1e6 = 19.999999 exactly (string math)
      // 默认 maxFractionDigits=6，应原样展示（不会变成 20 或 19.999998）
      expect(formatUsdPer1MFromPerToken('0.000019999999')).toBe('19.999999')
    })

    it('rounds to maxFractionDigits and keeps minFractionDigits', () => {
      expect(formatUsdPer1MFromPerToken('0.0000001234567', { maxFractionDigits: 6 })).toBe('0.123457')
      expect(formatUsdPer1MFromPerToken('0.00002', { minFractionDigits: 2, maxFractionDigits: 6 })).toBe('20.00')
    })
  })

  describe('formatUsdPerToken', () => {
    it('formats per-token without conversion', () => {
      expect(formatUsdPerToken('0.00002')).toBe('0.00002')
    })
  })
})
