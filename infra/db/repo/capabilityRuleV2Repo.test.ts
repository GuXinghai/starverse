import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { CapabilityRuleV2Repo, CapabilityRuleV2RepoError } from './capabilityRuleV2Repo'
import { installBuiltInCapabilityRulesV2 } from './installBuiltInCapabilityRulesV2'
import type { CapabilityRulePackDefinitionV2 } from '../../../src/next/generation-v2/capability-rules/capabilityRuleV2'
import { BUILTIN_CAPABILITY_RULE_PACKS_V2 } from '../../../src/next/generation-v2/capability-rules/builtinCapabilityRulePacksV2'

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function pack(input: Readonly<{
  ownerKind?: 'built_in' | 'user'
  ownerId?: string
  packId?: string
  packVersion?: number
  modelId?: string
  selector?: Readonly<{ kind: 'exact'; values: readonly string[] }> | Readonly<{
    kind: 'regex'; value: string; positiveExamples: readonly string[]; negativeExamples: readonly string[]
  }>
  effortValues?: readonly string[]
  priority?: number
}>): CapabilityRulePackDefinitionV2 {
  const effortValues = input.effortValues ?? ['high', 'max']
  const selected = input.selector ?? { kind: 'exact' as const, values: [input.modelId ?? 'deepseek-v4-pro'] }
  return {
    schemaVersion: 1 as const,
    ownerKind: input.ownerKind ?? 'built_in',
    ownerId: input.ownerId ?? 'starverse',
    packId: input.packId ?? 'starverse.builtin.test',
    packVersion: input.packVersion ?? 1,
    enabled: true,
    rules: [{
      ruleId: 'reasoning-effort', providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
      selector: selected,
      semanticPath: 'reasoning.effort',
      state: 'supported', domain: { kind: 'enum', values: effortValues },
      defaultValue: effortValues[0], constraints: [], priority: input.priority ?? 100, enabled: true,
      evidenceSourceRef: 'starverse.deepseek.reviewed',
      evidenceKind: 'explicit_provider', evidenceNote: 'Focused repository test evidence for a model capability fact.',
      identityEvidenceKind: selected.kind === 'regex' ? 'derived_selector' : 'provider_archive',
      identityEvidenceSourceRef: selected.kind === 'regex' ? 'selector.deepseek.test' : 'archive.deepseek.test',
      provenanceUrl: 'https://api-docs.deepseek.com/guides/thinking_mode',
      verifiedAt: '2026-08-28T00:00:00.000Z',
    }],
  }
}

describe('CapabilityRuleV2Repo', () => {
  it('installs the reviewed Starverse defaults into normalized database rows', () => {
    const db = database()
    try {
      installBuiltInCapabilityRulesV2(db, () => 50)
      const repo = new CapabilityRuleV2Repo(db)
      expect(repo.listPacks('built_in')).toHaveLength(5)
      expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'deepseek-v4-flash' }).fields).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'reasoning.effort', domain: { kind: 'enum', values: ['high', 'low', 'max'] } }),
      ]))
      const exactRules = BUILTIN_CAPABILITY_RULE_PACKS_V2.flatMap((pack) => pack.rules)
        .filter((rule) => rule.selector.kind === 'exact')
      const identities = new Map(exactRules.flatMap((rule) => rule.selector.kind === 'exact'
        ? rule.selector.values.map((nativeModelId) => [
          `${rule.providerId}\0${rule.endpointProfileId}\0${nativeModelId}`,
          { providerId: rule.providerId, endpointProfileId: rule.endpointProfileId, nativeModelId },
        ] as const) : []))
      for (const identity of identities.values()) expect(repo.resolveForIdentity(identity).fields.length).toBeGreaterThan(0)
    } finally { db.close() }
  })

  it('projects retained provider facts only for evidenced native identities', () => {
    const db = database()
    try {
      installBuiltInCapabilityRulesV2(db, () => 50)
      const repo = new CapabilityRuleV2Repo(db)
      const cases = [
        { providerId: 'google_ai_studio', endpointProfileId: 'gemini-developer-api-v1beta',
          nativeModelId: 'gemini-3.1-flash-image', path: 'image.resolution' },
        { providerId: 'openai_responses', endpointProfileId: 'openai-api-v1',
          nativeModelId: 'gpt-5.6-sol', path: 'reasoning.effort' },
        { providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
          nativeModelId: 'deepseek-v4-pro', path: 'reasoning.effort' },
        { providerId: 'anthropic', endpointProfileId: 'anthropic-developer-api-2023-06-01',
          nativeModelId: 'claude-opus-4-6', path: 'reasoning.effort' },
      ] as const
      for (const item of cases) {
        expect(repo.resolveForIdentity(item).fields).toEqual(expect.arrayContaining([
          expect.objectContaining({ path: item.path, state: 'supported' }),
        ]))
        expect(repo.resolveForIdentity({ ...item, nativeModelId: `${item.nativeModelId}-unknown` }).fields).toEqual([])
      }
    } finally { db.close() }
  })

  it('installs and resolves an exact-model built-in rule with canonical domain types', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db, () => 100)
      const installed = repo.installBuiltInPacks([pack({})])
      expect(installed).toHaveLength(1)
      expect(installed[0]).toMatchObject({ ownerKind: 'built_in', packVersion: 1, installedAtMs: 100 })
      const resolved = repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'deepseek-v4-pro' })
      expect(resolved.fields).toEqual([expect.objectContaining({ path: 'reasoning.effort', state: 'supported',
        domain: { kind: 'enum', values: ['high', 'max'] }, defaultValue: 'high' })])
      expect(resolved.evidence).toEqual([expect.objectContaining({ kind: 'capability_rule', effect: 'supports' })])
      expect(resolved.ruleSetRevision).toMatch(/^capability-rule-set-v2:[0-9a-f]{64}$/u)
    } finally { db.close() }
  })

  it('lets one exact rule cover several explicitly listed native model ids', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db)
      repo.installBuiltInPacks([pack({ selector: { kind: 'exact',
        values: ['deepseek-v4-flash', 'deepseek-v4-pro'] } })])
      for (const nativeModelId of ['deepseek-v4-flash', 'deepseek-v4-pro']) {
        expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
          nativeModelId }).fields).toHaveLength(1)
      }
      expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'deepseek-v4' }).fields).toEqual([])
    } finally { db.close() }
  })

  it('does not match aliases, prefixes, previews, or unknown exact model ids', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db)
      repo.installBuiltInPacks([pack({})])
      for (const nativeModelId of ['deepseek-v4-pro-preview', 'models/deepseek-v4-pro', 'deepseek-v4', 'DEEPSEEK-V4-PRO']) {
        expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1', nativeModelId }).fields)
          .toEqual([])
      }
      expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-other-endpoint',
        nativeModelId: 'deepseek-v4-pro' }).fields).toEqual([])
      expect(repo.resolveForIdentity({ providerId: 'openrouter', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'deepseek-v4-pro' }).fields).toEqual([])
    } finally { db.close() }
  })

  it('supports anchored regex identity selectors with exact-over-regex precedence', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db)
      repo.installBuiltInPacks([pack({ selector: { kind: 'regex',
        value: '^deepseek-v4-(?:flash|pro)$', positiveExamples: ['deepseek-v4-flash', 'deepseek-v4-pro'],
        negativeExamples: ['deepseek-v4', 'openrouter/deepseek-v4-pro'] }, effortValues: ['low'], priority: 500 })])
      repo.replaceUserPack(pack({ ownerKind: 'user', ownerId: 'user:1', packId: 'user.exact',
        selector: { kind: 'exact', values: ['deepseek-v4-pro'] }, effortValues: ['max'], priority: -100 }))
      expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'deepseek-v4-flash' }).fields[0]).toMatchObject({ domain: { kind: 'enum', values: ['low'] } })
      expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'deepseek-v4-pro' }).fields[0]).toMatchObject({ domain: { kind: 'enum', values: ['max'] } })
      expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'deepseek-v4-pro-preview' }).fields).toEqual([])
    } finally { db.close() }
  })

  it('fails deterministically on equal-priority conflicting regex matches across packs', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db)
      const selector = { kind: 'regex' as const, value: '^deepseek-v4-(?:flash|pro)$',
        positiveExamples: ['deepseek-v4-flash', 'deepseek-v4-pro'], negativeExamples: ['deepseek-v4-preview'] }
      repo.replaceUserPack(pack({ ownerKind: 'user', ownerId: 'user:1', packId: 'user.regex.first',
        selector, effortValues: ['low'], priority: 100 }))
      repo.replaceUserPack(pack({ ownerKind: 'user', ownerId: 'user:1', packId: 'user.regex.second',
        selector, effortValues: ['max'], priority: 100 }))
      expect(() => repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'deepseek-v4-pro' })).toThrow('GENERATION_V2_CAPABILITY_RULE_CONFLICT')
    } finally { db.close() }
  })

  it('does not project rules from a disabled pack', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db)
      repo.installBuiltInPacks([{ ...pack({}), enabled: false }])
      expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'deepseek-v4-pro' }).fields).toEqual([])
    } finally { db.close() }
  })

  it.each(['deepseek-v4-.*', '^.*pro.*$', '^deepseek-v4-(?=pro)$', '^deepseek-v4-(pro)\\1$',
    '^deepseek-v4-(?:pro)?$', '^(?:deepseek-{1,2}){1,2}pro$', '^deepseek-v4-[0-9]{1,64}$',
    '^(?:a|aa){1,32}$']) (
    'rejects unsafe or overly broad regex selector %s', (value) => {
      const source = pack({ selector: { kind: 'regex', value,
        positiveExamples: ['deepseek-v4-pro'], negativeExamples: ['not-deepseek'] } })
      const db = database()
      try {
        expect(() => new CapabilityRuleV2Repo(db).installBuiltInPacks([source]))
          .toThrow('GENERATION_V2_CAPABILITY_RULE_INVALID')
      } finally { db.close() }
    })

  it('preserves provider-native model identity without normalization', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db, () => 100)
      const nativeModelId = 'publishers/google/models/gemini@preview'
      repo.installBuiltInPacks([pack({ modelId: nativeModelId })])
      expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId }).fields).toHaveLength(1)
      expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'gemini@preview' }).fields).toEqual([])
    } finally { db.close() }
  })

  it('rejects command and runtime safety paths as Capability Rule facts', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db)
      const source = pack({ ownerKind: 'user', ownerId: 'user:1', packId: 'user.unsafe' })
      expect(() => repo.replaceUserPack({ ...source, rules: [{ ...source.rules[0],
        semanticPath: 'tools.sideEffectConfirmation', domain: { kind: 'enum', values: ['required_each_retry'] },
        defaultValue: 'required_each_retry' }] })).toThrow('GENERATION_V2_CAPABILITY_RULE_INVALID')
      expect(() => repo.replaceUserPack({ ...source, rules: [{ ...source.rules[0],
        semanticPath: 'providerExtension.thinkingMode', domain: { kind: 'enum', values: ['adaptive'] },
        defaultValue: 'adaptive' }] })).toThrow('GENERATION_V2_CAPABILITY_RULE_INVALID')
    } finally { db.close() }
  })

  it('updates built-in packs without overwriting user-owned packs', () => {
    const db = database()
    try {
      let now = 100
      const repo = new CapabilityRuleV2Repo(db, () => now)
      repo.installBuiltInPacks([pack({ packVersion: 1 })])
      repo.replaceUserPack(pack({ ownerKind: 'user', ownerId: 'user:local', packId: 'user.deepseek',
        packVersion: 1, effortValues: ['medium'], priority: 200 }))
      now = 200
      repo.installBuiltInPacks([pack({ packVersion: 2, effortValues: ['high', 'max', 'ultra'] })])
      expect(repo.listPacks()).toEqual([
        expect.objectContaining({ ownerKind: 'built_in', packVersion: 2, updatedAtMs: 200 }),
        expect.objectContaining({ ownerKind: 'user', packVersion: 1, updatedAtMs: 100 }),
      ])
      expect(repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'deepseek-v4-pro' }).fields[0]).toMatchObject({
        domain: { kind: 'enum', values: ['medium'] },
      })
    } finally { db.close() }
  })

  it('retires built-in packs removed from a later shipped set without touching user packs', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db, () => 100)
      repo.installBuiltInPacks([pack({ packId: 'starverse.builtin.keep' }),
        pack({ packId: 'starverse.builtin.retire', modelId: 'deepseek-v4-flash' })])
      repo.replaceUserPack(pack({ ownerKind: 'user', ownerId: 'user:1', packId: 'user.keep', priority: 200 }))
      repo.installBuiltInPacks([pack({ packId: 'starverse.builtin.keep' })])
      expect(repo.listPacks('built_in').map((item) => item.packId)).toEqual(['starverse.builtin.keep'])
      expect(repo.listPacks('user').map((item) => item.packId)).toEqual(['user.keep'])
    } finally { db.close() }
  })

  it('rejects a changed built-in payload without a version increment', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db)
      repo.installBuiltInPacks([pack({ packVersion: 1 })])
      expect(() => repo.installBuiltInPacks([pack({ packVersion: 1, effortValues: ['high'] })]))
        .toThrowError(new CapabilityRuleV2RepoError('GENERATION_V2_CAPABILITY_RULE_VERSION_COLLISION'))
    } finally { db.close() }
  })

  it('rejects duplicate built-in natural keys across separate packs', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db)
      expect(() => repo.installBuiltInPacks([
        pack({ packId: 'starverse.builtin.first' }),
        pack({ packId: 'starverse.builtin.second' }),
      ])).toThrow('GENERATION_V2_CAPABILITY_RULE_REPOSITORY_INVALID')
    } finally { db.close() }
  })

  it('rejects overlapping exact-model members across built-in rule sets', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db)
      expect(() => repo.installBuiltInPacks([
        pack({ packId: 'starverse.builtin.first', selector: { kind: 'exact',
          values: ['deepseek-v4-flash', 'deepseek-v4-pro'] } }),
        pack({ packId: 'starverse.builtin.second', selector: { kind: 'exact',
          values: ['deepseek-v4-pro'] } }),
      ])).toThrow('GENERATION_V2_CAPABILITY_RULE_REPOSITORY_INVALID')
    } finally { db.close() }
  })

  it('rejects equal-priority conflicting facts instead of applying hidden owner precedence', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db)
      repo.installBuiltInPacks([pack({ priority: 100 })])
      repo.replaceUserPack(pack({ ownerKind: 'user', ownerId: 'user:local', packId: 'user.conflict',
        priority: 100, effortValues: ['medium'] }))
      expect(() => repo.resolveForIdentity({ providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        nativeModelId: 'deepseek-v4-pro' })).toThrow('GENERATION_V2_CAPABILITY_RULE_CONFLICT')
    } finally { db.close() }
  })

  it('keeps equivalent equal-priority built-in and user evidence independently addressable', () => {
    const db = database()
    try {
      const repo = new CapabilityRuleV2Repo(db)
      repo.installBuiltInPacks([pack({ priority: 100 })])
      repo.replaceUserPack(pack({ ownerKind: 'user', ownerId: 'user:local', packId: 'user.same-fact',
        priority: 100 }))
      const projection = repo.resolveForIdentity({ providerId: 'deepseek',
        endpointProfileId: 'deepseek-stable-api-v1', nativeModelId: 'deepseek-v4-pro' })
      expect(projection.rules).toHaveLength(2)
      expect(projection.evidence).toHaveLength(2)
      expect(new Set(projection.evidence.map((entry) => entry.evidenceId)).size).toBe(2)
      expect(new Set(projection.fields[0]?.evidenceIds).size).toBe(2)
    } finally { db.close() }
  })
})
