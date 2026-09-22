import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { seedMaterializedCapabilityRulesForTestV1 } from '../../infra/db/test-support/materializedCapabilityRuleTestSupport'
import type { CanonicalFactValueV1, CanonicalSemanticPathV1 } from '../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import type { CapabilityRuleCoreRuleV1, CapabilityRuleOwnershipSnapshotV1 } from '../../src/next/generation-v2/capability-rules/capabilityRuleCoreV1'
import { createGenerationV2CapabilityResolutionService } from './generationV2CapabilityResolutionService'

const scope = `credential-scope-v2:${'b'.repeat(64)}` as never

vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))

function exactRule(input: Readonly<{
  ruleId: string
  nativeModelId: string
  path: CanonicalSemanticPathV1
  value: CanonicalFactValueV1
}>): CapabilityRuleCoreRuleV1 {
  return { ruleId: input.ruleId, label: null, description: null, priority: 0, configured: 'on',
    providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1',
    selector: { kind: 'exact', nativeModelIds: [input.nativeModelId] },
    assertion: { path: input.path, value: input.value }, evidence: null }
}

function cloudSnapshot(rules: readonly CapabilityRuleCoreRuleV1[]): CapabilityRuleOwnershipSnapshotV1 {
  return { schemaVersion: 1, ownership: 'cloud', ownerId: 'test:cloud', packs: [{
    schemaVersion: 1, packId: 'pack.test.openai-responses', displayName: 'OpenAI Responses test',
    description: null, priority: 0, mode: 'no_control', target: 'enabled', rules,
  }] }
}

function subjectCandidates(modelIds: readonly string[]) {
  return modelIds.map((nativeModelId) => ({
    subject: { providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', nativeModelId },
    proof: { kind: 'provider_native_catalog' as const, providerKey: 'openai_responses' as const,
      scopeId: 'scope:test:openai', credentialScopeId: scope, credentialRevision: 1,
      endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', catalogCategory: '',
      activeSnapshotDigest: 'c'.repeat(64) },
  }))
}

function seedCatalog(db: BetterSqlite3.Database, modelIds: readonly string[]): void {
  const catalog = new ModelCatalogV2Repo(db, () => 100)
  const catalogScope = Object.freeze({ providerKey: 'openai_responses' as const, credentialScopeId: scope,
    endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', category: '' })
  catalog.beginSync(catalogScope, 'attempt:openai')
  catalog.commitSync({ scope: catalogScope, attemptId: 'attempt:openai', responseDigest: 'c'.repeat(64),
    observedAtMs: 100, applyMode: 'automatic', items: modelIds.map((modelId) => ({
      providerKey: 'openai_responses' as const, nativeModelId: modelId, modelId,
      modelKey: `openai_responses::${modelId}`, displayName: modelId,
      raw: { schemaVersion: 1 as const, buckets: [{ source: 'models' as const, fetchedAtMs: 100,
        baseUrl: 'https://api.openai.com/v1', payload: { observation: {
          schemaVersion: 2 as const, providerKey: 'openai_responses' as const, nativeModelId: modelId,
          endpointId: 'openai-responses-official', observedAtMs: 100,
          rawProviderRecord: { id: modelId, max_tokens: 65_536 }, facts: {},
          provenance: { sourceKind: 'provider_api' as const, sourceLabel: 'openai_responses_models_api',
            observedAtMs: 100, parserVersion: 2 as const },
        } } }] },
    })) })
}

function database(modelIds: readonly string[], rules: readonly CapabilityRuleCoreRuleV1[]): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  seedCatalog(db, modelIds)
  seedMaterializedCapabilityRulesForTestV1(db, {
    ownershipSnapshots: [cloudSnapshot(rules)], subjectCandidates: subjectCandidates(modelIds),
  })
  return db
}

function credentialService() {
  return {
    withCredentialScopeBindingAuthority: async ({ consume }: { consume: (authority: never) => Promise<unknown> }) =>
      consume({ assertCurrent: () => undefined } as never),
  } as never
}

function request(modelId: string) {
  return { providerId: 'openai_responses', credentialRevision: 1, credentialScopeId: scope,
    endpointProfileId: 'openai-api-v1', protocolId: 'openai-responses-v1', modelId, operation: 'text' as const }
}

describe('OpenAI Responses Goal 3 capability resolution', () => {
  it('consumes exact materialized effort claims without projecting the generic API enum', async () => {
    const models = ['gpt-5', 'gpt-5-pro', 'gpt-5.4-pro-2026-03-05', 'gpt-5.6-sol', 'gpt-5.6-sol-preview']
    const rules = [
      ['gpt-5', ['high', 'low', 'medium', 'minimal'], 'medium'],
      ['gpt-5-pro', ['high'], 'high'],
      ['gpt-5.4-pro-2026-03-05', ['high', 'medium', 'xhigh'], 'medium'],
      ['gpt-5.6-sol', ['high', 'low', 'max', 'medium', 'none', 'xhigh'], 'medium'],
    ].flatMap(([nativeModelId, values, defaultValue]) => [
      exactRule({ ruleId: `${nativeModelId}.effort.values`, nativeModelId: nativeModelId as string,
        path: 'reasoning.effort.nativeValues', value: { kind: 'native_string_set', values: values as string[], completeness: 'complete' } }),
      exactRule({ ruleId: `${nativeModelId}.effort.default`, nativeModelId: nativeModelId as string,
        path: 'reasoning.effort.providerDefault', value: { kind: 'native_string', value: defaultValue as string } }),
      exactRule({ ruleId: `${nativeModelId}.reasoning.support`, nativeModelId: nativeModelId as string,
        path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }),
    ])
    const db = database(models, rules)
    try {
      const service = createGenerationV2CapabilityResolutionService({ db,
        credentialService: credentialService(), openAICompatibleCredentialService: {} as never })
      const resolve = async (nativeModelId: string) => (await service.resolve(request(nativeModelId) as never))
        .resolvedCapability.modelFacts
      expect((await resolve('gpt-5')).fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({
        domain: { kind: 'enum', values: ['high', 'low', 'medium', 'minimal'] }, defaultValue: 'medium',
      })
      expect((await resolve('gpt-5-pro')).fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({
        domain: { kind: 'enum', values: ['high'] }, defaultValue: 'high',
      })
      expect((await resolve('gpt-5.4-pro-2026-03-05')).fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({
        domain: { kind: 'enum', values: ['high', 'medium', 'xhigh'] }, defaultValue: 'medium',
      })
      expect((await resolve('gpt-5.6-sol')).fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({
        domain: { kind: 'enum', values: ['high', 'low', 'max', 'medium', 'none', 'xhigh'] },
      })
      expect((await resolve('gpt-5.6-sol')).fields.find((field) => field.path === 'image.size')?.state).toBe('unknown')
      expect((await resolve('gpt-5.6-sol-preview')).fields.find((field) => field.path === 'reasoning.effort')?.state)
        .toBe('unknown')
    } finally { db.close() }
  })

  it('consumes exact o-series support claims while leaving undocumented effort unknown', async () => {
    const models = ['o1', 'o1-2024-12-17', 'o3', 'o3-pro', 'o4-mini-2025-04-16']
    const rules = models.map((nativeModelId) => exactRule({ ruleId: `${nativeModelId}.reasoning.support`, nativeModelId,
      path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }))
    const db = database(models, rules)
    try {
      const service = createGenerationV2CapabilityResolutionService({ db,
        credentialService: credentialService(), openAICompatibleCredentialService: {} as never })
      for (const nativeModelId of models) {
        const resolved = (await service.resolve(request(nativeModelId) as never)).resolvedCapability.modelFacts
        const reasoningMode = resolved.fields.find((field) => field.path === 'reasoning.mode')
        expect(reasoningMode).toMatchObject({ state: 'supported' })
        expect(reasoningMode?.domain).toBeUndefined()
        expect(resolved.fields.find((field) => field.path === 'reasoning.effort')?.state).toBe('unknown')
      }
    } finally { db.close() }
  })
})
