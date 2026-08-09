import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveGeminiThinkingCapability } from './geminiThinkingPolicy'

type AuditRow = Readonly<{
  exactModelId: string
  supportedGenerationMethods: readonly string[]
  thinkingOwnProperty: boolean
  thinkingValue?: unknown
}>

const fixturePath = resolvePath(process.cwd(), 'docs/architecture/generation-compiler-v2/evidence/gemini-thinking-contract-audit-20260724/model-audit.json')
const auditRows = JSON.parse(readFileSync(fixturePath, 'utf8')) as AuditRow[]

describe('Gemini v1beta full catalog thinking classification', () => {
  it('classifies every GenerateContent model from the raw local audit fixture', () => {
    const rows = auditRows.filter((row) => row.supportedGenerationMethods.includes('generateContent'))
    const report = rows.map((row) => {
      const capability = resolveGeminiThinkingCapability({
        model: row.exactModelId,
        thinking: row.thinkingValue,
        thinkingOwnProperty: row.thinkingOwnProperty,
        supportedGenerationMethods: row.supportedGenerationMethods,
      })
      return {
        modelId: row.exactModelId,
        thinkingOwnProperty: capability.thinkingOwnProperty,
        thinkingRawValue: capability.thinkingRawValue,
        thinkingSupported: capability.thinkingSupported,
        controlKind: capability.controlKind,
        matchedRule: capability.matchedRule,
        defaultDisplay: capability.kind === 'level'
          ? `Default (${capability.defaultLevel})`
          : capability.kind === 'budget'
            ? `Default (${capability.defaultBudgetMode})`
            : null,
        allowedLevels: capability.kind === 'level' ? capability.levels : [],
        budgetRange: capability.kind === 'budget' ? [capability.minBudget, capability.maxBudget] : null,
        allowOff: capability.allowOff,
        allowDynamic: capability.allowDynamic,
      }
    })

    expect(rows).toHaveLength(41)
    expect(report.filter((row) => row.thinkingSupported === 'supported')).toHaveLength(31)
    expect(report.filter((row) => row.thinkingSupported === 'unsupported')).toHaveLength(10)
    expect(report.filter((row) => row.controlKind === 'default-only').map((row) => row.modelId)).toEqual(expect.arrayContaining([
      'gemini-3-pro-image',
      'gemini-3.1-flash-image',
      'nano-banana-pro-preview',
    ]))
    expect(report.filter((row) => row.thinkingSupported === 'unsupported').every((row) => row.matchedRule === null)).toBe(true)
    expect(report.every((row) => row.thinkingSupported !== 'supported' || row.controlKind !== null)).toBe(true)
    expect(new Set(report.map((row) => row.modelId)).size).toBe(report.length)
    expect(report.find((row) => row.modelId === 'gemini-3.1-flash-lite')).toMatchObject({
      thinkingSupported: 'supported', controlKind: 'level', matchedRule: 'gemini-3.1-flash-lite',
      defaultDisplay: 'Default (minimal)', allowedLevels: ['minimal', 'low', 'medium', 'high'],
    })
  })

  it('does not upgrade synthetic non-boolean raw values by model name', () => {
    for (const thinking of [false, null, 'true']) {
      const result = resolveGeminiThinkingCapability({
        model: 'gemini-3.6-flash', thinking, thinkingOwnProperty: true, supportedGenerationMethods: ['generateContent'],
      })
      expect(result).toMatchObject({ thinkingSupported: 'unsupported', matchedRule: null, kind: 'unsupported' })
    }
  })

  it('keeps the provider-reported Robotics ER 2 preview on default-only control', () => {
    expect(resolveGeminiThinkingCapability({
      model: 'models/gemini-robotics-er-2-preview',
      thinking: true,
      thinkingOwnProperty: true,
      supportedGenerationMethods: ['generateContent', 'countTokens', 'createCachedContent', 'batchGenerateContent'],
    })).toMatchObject({
      thinkingSupported: 'supported',
      controlKind: 'default-only',
      matchedRule: null,
      kind: 'default-only',
    })
  })
})
