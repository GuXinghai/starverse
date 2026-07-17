import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
} from '../../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'
import {
  RuntimeCapabilityV2Repo,
  isRuntimeCapabilityRepositoryFactV2,
} from './runtimeCapabilityV2Repo'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function capabilityJson(resolvedAt = '2026-07-17T12:00:00.000Z'): string {
  const record = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2,
    resolvedAt,
    binding: {
      credentialScopeId: 'credential-scope:1',
      providerId: 'deepseek',
      endpointProfileId: 'deepseek-stable-api-v1',
      endpointBinding: {
        kind: 'provider_managed_set',
        endpointSetRevision: 'endpoint-set:1',
        descriptors: [{ endpointId: 'deepseek-stable', descriptorRevision: 'descriptor:1' }],
      },
      protocolContractId: 'deepseek-stable-chat-v1',
      contractRevision: `deepseek-stable-chat-v1:${HASH_A}`,
      contractDefinitionDigest: HASH_A,
      registryRevision: `provider-contract-registry-v1:${HASH_B}`,
      modelId: 'deepseek-v4-pro',
      operation: 'text',
    },
    evidence: [{
      evidenceId: 'deepseek.stable.supports',
      kind: 'official_documentation',
      effect: 'supports',
      sourceRef: 'https://api-docs.deepseek.com/api/create-chat-completion',
      verifiedAt: '2026-07-17T00:00:00.000Z',
      contentDigest: HASH_C,
    }],
    fields: RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((field) =>
      field === 'generation.temperature'
        ? {
            path: field,
            state: 'supported',
            domain: { kind: 'range', min: 0, max: 2, integer: false },
            constraints: [],
            evidenceIds: ['deepseek.stable.supports'],
          }
        : { path: field, state: 'unavailable', constraints: [], evidenceIds: [] }),
    tools: [],
    continuation: { kind: 'none', evidenceIds: ['deepseek.stable.supports'] },
  })
  return decodeRuntimeCapabilitySnapshotV2(record).canonicalJson
}

describe('RuntimeCapabilityV2Repo immutable canonical persistence', () => {
  it('persists one canonical capability and returns exact idempotent replay', () => {
    const db = database()
    try {
      const repo = new RuntimeCapabilityV2Repo(db)
      const json = capabilityJson()
      let escaped: unknown
      const first = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const result = repo.insertCanonical(context, json, 100)
        escaped = result.fact
        expect(result.kind).toBe('created')
        expect(isRuntimeCapabilityRepositoryFactV2(result.fact)).toBe(true)
        expect(result.fact.capability.canonicalJson).toBe(json)
        return result.fact.capability.snapshotHash.value
      })
      expect(isRuntimeCapabilityRepositoryFactV2(escaped)).toBe(false)
      const replay = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertCanonical(context, json, 200))
      expect(replay.kind).toBe('idempotent_replay')
      expect(repo.getBySnapshotHash(first).canonicalJson).toBe(json)
      expect(db.prepare('SELECT created_at_ms FROM runtime_capability_snapshot_v2').get())
        .toEqual({ created_at_ms: 100 })
    } finally { db.close() }
  })

  it('rolls back insertion and revokes the transaction-scoped fact', () => {
    const db = database()
    try {
      const repo = new RuntimeCapabilityV2Repo(db)
      let escaped: unknown
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        escaped = repo.insertCanonical(context, capabilityJson(), 100).fact
        throw new Error('abort capability')
      })).toThrow('abort capability')
      expect(isRuntimeCapabilityRepositoryFactV2(escaped)).toBe(false)
      expect(db.prepare('SELECT count(*) AS count FROM runtime_capability_snapshot_v2').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('retains distinct exact snapshots when only the resolution time changes', () => {
    const db = database()
    try {
      const repo = new RuntimeCapabilityV2Repo(db)
      const first = capabilityJson('2026-07-17T12:00:00.000Z')
      const second = capabilityJson('2026-07-17T12:00:01.000Z')
      const facts = [first, second].map((json, index) =>
        runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
          repo.insertCanonical(context, json, 100 + index).fact.capability))
      expect(facts[0].revision.value).toBe(facts[1].revision.value)
      expect(facts[0].snapshotHash.value).not.toBe(facts[1].snapshotHash.value)
      expect(repo.getBySnapshotHash(facts[0].snapshotHash.value).canonicalJson).toBe(first)
      expect(repo.getBySnapshotHash(facts[1].snapshotHash.value).canonicalJson).toBe(second)
      expect(db.prepare('SELECT count(*) AS count FROM runtime_capability_snapshot_v2').get())
        .toEqual({ count: 2 })
    } finally { db.close() }
  })

  it('rejects noncanonical input, forged contexts and stored projection corruption', () => {
    const db = database()
    try {
      const repo = new RuntimeCapabilityV2Repo(db)
      const json = capabilityJson()
      expect(() => repo.insertCanonical({} as never, json, 100))
        .toThrow('GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT')
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertCanonical(context, ` ${json}`, 100)))
        .toThrow('GENERATION_V2_CAPABILITY_REPOSITORY_INPUT_INVALID')
      const snapshotHash = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertCanonical(context, json, 100).fact.capability.snapshotHash.value)
      db.pragma('foreign_keys = OFF')
      db.prepare('DROP TRIGGER trg_runtime_capability_snapshot_v2_immutable').run()
      db.prepare('UPDATE runtime_capability_snapshot_v2 SET evidence_digest=? WHERE capability_snapshot_hash=?')
        .run('f'.repeat(64), snapshotHash)
      expect(() => repo.getBySnapshotHash(snapshotHash))
        .toThrow('GENERATION_V2_CAPABILITY_REPOSITORY_STATE_INVALID')
    } finally { db.close() }
  })

  it('forbids direct update and delete of retained capability provenance', () => {
    const db = database()
    try {
      const repo = new RuntimeCapabilityV2Repo(db)
      const snapshotHash = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertCanonical(context, capabilityJson(), 100).fact.capability.snapshotHash.value)
      expect(() => db.prepare('UPDATE runtime_capability_snapshot_v2 SET created_at_ms=101 WHERE capability_snapshot_hash=?')
        .run(snapshotHash)).toThrow('GENERATION_V2_CAPABILITY_SNAPSHOT_IMMUTABLE')
      expect(() => db.prepare('DELETE FROM runtime_capability_snapshot_v2 WHERE capability_snapshot_hash=?')
        .run(snapshotHash)).toThrow('GENERATION_V2_CAPABILITY_SNAPSHOT_IMMUTABLE')
    } finally { db.close() }
  })
})
