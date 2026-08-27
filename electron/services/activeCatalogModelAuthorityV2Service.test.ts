import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
// Approved main-process active-Catalog authority fixture imports.
// eslint-disable-next-line no-restricted-imports
import { GenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
// eslint-disable-next-line no-restricted-imports
import { readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/next/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import { createActiveCatalogModelAuthorityV2Service, readActiveCatalogSnapshotAuthorityV2 } from './activeCatalogModelAuthorityV2Service'

describe('ActiveCatalogModelAuthorityV2Service', () => {
  it('binds generation to the immutable active observation without provider network access', async () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    const credentialScopeId = `credential-scope-v2:${'a'.repeat(64)}` as never
    const scope = Object.freeze({ providerKey: 'openai_responses', credentialScopeId,
      endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', category: '' })
    const observation = Object.freeze({ schemaVersion: 2 as const, providerKey: 'openai_responses' as const,
      endpointId: 'openai-responses-official', nativeModelId: 'gpt-test', observedAtMs: 100,
      rawProviderRecord: Object.freeze({ id: 'gpt-test', object: 'model', owned_by: 'openai' }),
      facts: Object.freeze(Object.fromEntries(['textChat', 'reasoning', 'tools', 'structuredOutputs', 'vision']
        .map((key) => [key, Object.freeze({ providerPath: `data[].${key}`, ownProperty: false,
          presence: 'missing' as const })]))) as never,
      provenance: Object.freeze({ sourceKind: 'provider_api' as const, sourceLabel: 'openai_models_api',
        observedAtMs: 100, parserVersion: 2 as const }) })
    const repo = new ModelCatalogV2Repo(db, () => 100)
    repo.beginSync(scope, 'attempt:1')
    repo.commitSync({ scope, attemptId: 'attempt:1', responseDigest: '1'.repeat(64), observedAtMs: 100,
      applyMode: 'automatic', items: [{ providerKey: 'openai_responses', nativeModelId: 'gpt-test',
        modelId: 'gpt-test', modelKey: 'openai_responses::gpt-test', displayName: 'GPT Test',
        raw: { schemaVersion: 1, buckets: [{ source: 'models', fetchedAtMs: 100,
          baseUrl: 'https://api.openai.com/v1', payload: { observation } }] } }] })

    let current = true
    const service = createActiveCatalogModelAuthorityV2Service({ db, credentialService: {
      withCredentialScopeBindingAuthority: async ({ consume }: any) => consume(Object.freeze({
        assertCurrent: () => { if (!current) throw new Error('stale credential') },
      })),
    } as never })
    const result = await service.withExactActiveModel({ providerKey: 'openai_responses',
      endpointProfile: readVerifiedOpenAIResponsesEndpointProfileV2(), expectedCredentialRevision: 1,
      expectedCredentialScopeId: credentialScopeId, modelId: GenerationV2Identity.create('model_id', 'gpt-test'),
      consume: (authority) => ({ catalog: readActiveCatalogSnapshotAuthorityV2(authority),
        model: authority.modelId.value }) })
    current = false

    expect(result).toMatchObject({ model: 'gpt-test',
      catalog: { catalogDigest: '1'.repeat(64), authorityRevision: 2 } })
    db.close()
  })
})
