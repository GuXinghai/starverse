import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { CapabilityRuleV2Repo } from '../../infra/db/repo/capabilityRuleV2Repo'
import { installBuiltInCapabilityRulesV2 } from '../../infra/db/repo/installBuiltInCapabilityRulesV2'

describe('OpenAI Responses database capability rules', () => {
  it('resolves exact documented GPT-5 effort domains without projecting the generic API enum', () => {
    const db = new BetterSqlite3(':memory:')
    try {
      applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
      installBuiltInCapabilityRulesV2(db)
      const repo = new CapabilityRuleV2Repo(db)
      const resolve = (nativeModelId: string) => repo.resolveForIdentity({
        providerId: 'openai_responses', endpointProfileId: 'openai-api-v1', nativeModelId,
      })
      expect(resolve('gpt-5').fields.find((field) => field.path === 'reasoning.effort')?.domain).toEqual({
        kind: 'enum', values: ['high', 'low', 'medium', 'minimal'],
      })
      expect(resolve('gpt-5-pro').fields.find((field) => field.path === 'reasoning.effort')).toEqual(
        expect.objectContaining({ domain: { kind: 'enum', values: ['high'] }, defaultValue: 'high' }),
      )
      expect(resolve('gpt-5.4-pro-2026-03-05').fields.find((field) => field.path === 'reasoning.effort')).toEqual(
        expect.objectContaining({ domain: { kind: 'enum', values: ['high', 'medium', 'xhigh'] }, defaultValue: 'medium' }),
      )
      expect(resolve('gpt-5.6-sol').fields.find((field) => field.path === 'reasoning.effort')?.domain).toEqual({
        kind: 'enum', values: ['high', 'low', 'max', 'medium', 'none', 'xhigh'],
      })
      expect(resolve('gpt-5.6-sol').fields.find((field) => field.path === 'image.size')).toBeUndefined()
      expect(repo.resolveForIdentity({ providerId: 'openai_responses', endpointProfileId: 'openai-api-v1',
        nativeModelId: 'gpt-5.6-sol-preview' }).fields).toEqual([])
    } finally { db.close() }
  })

  it('records o-series reasoning support but leaves undocumented effort domains missing', () => {
    const db = new BetterSqlite3(':memory:')
    try {
      applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
      installBuiltInCapabilityRulesV2(db)
      const repo = new CapabilityRuleV2Repo(db)
      for (const nativeModelId of ['o1', 'o1-2024-12-17', 'o3', 'o3-pro', 'o4-mini-2025-04-16']) {
        const resolved = repo.resolveForIdentity({
          providerId: 'openai_responses', endpointProfileId: 'openai-api-v1', nativeModelId,
        })
        expect(resolved.fields.find((field) => field.path === 'reasoning.mode')).toEqual(expect.objectContaining({
          state: 'supported', domain: { kind: 'enum', values: ['enabled'] },
        }))
        expect(resolved.fields.find((field) => field.path === 'reasoning.effort')).toBeUndefined()
      }
    } finally { db.close() }
  })
})
