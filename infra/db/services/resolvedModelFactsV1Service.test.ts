import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { ResolvedModelFactsV1Service } from './resolvedModelFactsV1Service'

describe('ResolvedModelFactsV1Service', () => {
  it('resolves explicit current source absence and publishes an all-unknown exact-subject snapshot', () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    try {
      const service = new ResolvedModelFactsV1Service(db, () => 20)
      const subject = { providerAuthorityId: 'provider:test', endpointProfileId: 'endpoint:test', nativeModelId: 'model:test' }
      const scopes = { providerNative: 'scope:provider', modelsDev: 'scope:models-dev', capabilityRules: 'scope:rules' }
      const current = service.resolveAndPublish({ subject, sourceScopeSelection: scopes })
      expect(current.pointerRevision).toBe(1)
      expect(current.snapshot.resolvedFacts.fields.every((field) => field.state === 'unknown')).toBe(true)
      expect(current.snapshot.resolvedFacts.input.sources).toEqual({
        providerNative: { kind: 'absent', reason: 'not_available' },
        modelsDev: { kind: 'absent', reason: 'not_available' },
        capabilityRules: { kind: 'absent', reason: 'not_available' },
      })
      expect(service.resolveAndPublish({ subject, sourceScopeSelection: scopes }).pointerRevision).toBe(1)
    } finally { db.close() }
  })
})
