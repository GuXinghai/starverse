import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CompatibleCatalogRepo } from './compatibleCatalogRepo'

const unknownMetadata = (displayName: string) => ({
  schemaVersion: 1 as const,
  displayName,
  contextLength: null,
  maxOutputTokens: null,
  capabilities: { text: null, vision: null, tools: null, structuredOutputs: null, reasoning: null },
  pricing: { prompt: null, completion: null, request: null, image: null },
  fieldProvenance: { displayName: 'manual' as const },
})

describe('CompatibleCatalogRepo', () => {
  let db: BetterSqlite3.Database
  let repo: CompatibleCatalogRepo

  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    db.exec(readFileSync(path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'), 'utf8'))
    db.prepare(`
      INSERT INTO compatible_provider_instances (
        provider_instance_id, protocol_key, display_name, status, created_at_ms, updated_at_ms
      ) VALUES
        ('ocp_provider_12345678', 'openai_chat_compatible', 'A', 'active', 1, 1),
        ('ocp_provider_abcdefgh', 'openai_chat_compatible', 'B', 'active', 1, 1)
    `).run()
    repo = new CompatibleCatalogRepo(db)
  })

  afterEach(() => db.close())

  it('replaces only remote source rows and preserves independent manual records', () => {
    repo.upsertManualModel({
      providerInstanceId: 'ocp_provider_12345678',
      modelId: 'same-model',
      metadata: unknownMetadata('Manual'),
      updatedAtMs: 2,
    })
    repo.applyRemoteSyncSuccess({
      snapshot: {
        snapshotId: 'ocp_catalog_snapshot_12345678',
        providerInstanceId: 'ocp_provider_12345678',
        snapshotSequence: 1,
        observedAtMs: 3,
        checksum: 'one',
        metadata: { source: 'models' },
      },
      models: [
        { modelId: 'same-model', metadata: { ...unknownMetadata('Remote'), fieldProvenance: { displayName: 'remote_sync' } } },
        { modelId: 'remote-only', metadata: { ...unknownMetadata('Remote only'), fieldProvenance: { displayName: 'remote_sync' } } },
      ],
    })
    expect(repo.listModelRecords('ocp_provider_12345678', 'same-model').map((row) => row.source)).toEqual(['manual', 'remote_sync'])

    repo.applyRemoteSyncSuccess({
      snapshot: {
        snapshotId: 'ocp_catalog_snapshot_abcdefgh',
        providerInstanceId: 'ocp_provider_12345678',
        snapshotSequence: 2,
        observedAtMs: 4,
        checksum: 'two',
        metadata: null,
      },
      models: [{ modelId: 'replacement', metadata: { ...unknownMetadata('Replacement'), fieldProvenance: { displayName: 'remote_sync' } } }],
    })
    expect(repo.listModelRecords('ocp_provider_12345678').map((row) => [row.modelId, row.source])).toEqual([
      ['remote-only', 'remote_sync'],
      ['replacement', 'remote_sync'],
      ['same-model', 'manual'],
      ['same-model', 'remote_sync'],
    ])
    expect(repo.listModelRecords('ocp_provider_12345678', 'remote-only')[0]).toMatchObject({ state: 'stale' })
    expect(repo.listModelRecords('ocp_provider_12345678', 'replacement')[0]).toMatchObject({ state: 'active' })
    expect(repo.getSnapshot('ocp_catalog_snapshot_12345678')).not.toBeNull()
    expect(repo.getSnapshot('ocp_catalog_snapshot_abcdefgh')).toMatchObject({ modelCount: 1 })
    expect(repo.getSyncState('ocp_provider_12345678')).toMatchObject({
      status: 'success',
      lastSuccessSnapshotId: 'ocp_catalog_snapshot_abcdefgh',
      failureCount: 0,
    })
  })

  it('keeps provider scopes isolated for the same model ID', () => {
    repo.upsertManualModel({ providerInstanceId: 'ocp_provider_12345678', modelId: 'shared', metadata: unknownMetadata('A'), updatedAtMs: 2 })
    repo.upsertManualModel({ providerInstanceId: 'ocp_provider_abcdefgh', modelId: 'shared', metadata: unknownMetadata('B'), updatedAtMs: 2 })
    expect(repo.listModelRecords('ocp_provider_12345678', 'shared')[0]?.metadata.displayName).toBe('A')
    expect(repo.listModelRecords('ocp_provider_abcdefgh', 'shared')[0]?.metadata.displayName).toBe('B')
  })

  it('rechecks active provider status inside snapshot and manual writes', () => {
    repo.upsertManualModel({ providerInstanceId: 'ocp_provider_12345678', modelId: 'manual', metadata: unknownMetadata('Manual'), updatedAtMs: 2 })
    db.prepare(`UPDATE compatible_provider_instances SET status = 'deleted', deleted_at_ms = 3, updated_at_ms = 3 WHERE provider_instance_id = ?`)
      .run('ocp_provider_12345678')
    expect(() => repo.applyRemoteSyncSuccess({
      snapshot: {
        snapshotId: 'ocp_catalog_snapshot_12345678', providerInstanceId: 'ocp_provider_12345678',
        snapshotSequence: 1, observedAtMs: 4, checksum: null, metadata: null,
      },
      models: [],
    })).toThrow('compatible_provider_inactive')
    expect(() => repo.upsertManualModel({
      providerInstanceId: 'ocp_provider_12345678', modelId: 'late', metadata: unknownMetadata('Late'), updatedAtMs: 4,
    })).toThrow('compatible_provider_inactive')
    expect(() => repo.deleteManualModel('ocp_provider_12345678', 'manual')).toThrow('compatible_provider_inactive')
    expect(repo.getSnapshot('ocp_catalog_snapshot_12345678')).toBeNull()
  })

  it('validates a complete snapshot before the transaction writes anything', () => {
    expect(() => repo.applyRemoteSyncSuccess({
      snapshot: {
        snapshotId: 'ocp_catalog_snapshot_12345678',
        providerInstanceId: 'ocp_provider_12345678',
        snapshotSequence: 1,
        observedAtMs: 3,
        checksum: null,
        metadata: null,
      },
      models: [
        { modelId: 'duplicate', metadata: unknownMetadata('One') },
        { modelId: 'duplicate', metadata: unknownMetadata('Two') },
      ],
    })).toThrow(/duplicate remote model/i)
    expect(db.prepare(`SELECT COUNT(*) AS count FROM compatible_catalog_snapshots`).get()).toEqual({ count: 0 })
  })

  it('rolls back snapshot, stale markers and sync state when apply fails mid-transaction', () => {
    repo.applyRemoteSyncSuccess({
      snapshot: {
        snapshotId: 'ocp_catalog_snapshot_12345678', providerInstanceId: 'ocp_provider_12345678',
        snapshotSequence: 1, observedAtMs: 3, checksum: null, metadata: null,
      },
      models: [{ modelId: 'kept', metadata: { ...unknownMetadata('Kept'), fieldProvenance: { displayName: 'remote_sync' } } }],
    })
    db.exec(`
      CREATE TRIGGER fail_compatible_catalog_apply
      BEFORE INSERT ON compatible_model_records
      WHEN NEW.model_id = 'boom'
      BEGIN SELECT RAISE(ABORT, 'forced catalog apply failure'); END
    `)
    expect(() => repo.applyRemoteSyncSuccess({
      snapshot: {
        snapshotId: 'ocp_catalog_snapshot_abcdefgh', providerInstanceId: 'ocp_provider_12345678',
        snapshotSequence: 2, observedAtMs: 4, checksum: null, metadata: null,
      },
      models: [{ modelId: 'boom', metadata: { ...unknownMetadata('Boom'), fieldProvenance: { displayName: 'remote_sync' } } }],
    })).toThrow(/forced catalog apply failure/i)
    expect(repo.getSnapshot('ocp_catalog_snapshot_abcdefgh')).toBeNull()
    expect(repo.listModelRecords('ocp_provider_12345678', 'kept')[0]).toMatchObject({ state: 'active' })
    expect(repo.getSyncState('ocp_provider_12345678')).toMatchObject({
      status: 'success', lastSuccessSnapshotId: 'ocp_catalog_snapshot_12345678',
    })
  })

  it('stores success, empty success, failure and backoff state independently', () => {
    repo.applyRemoteSyncSuccess({
      snapshot: {
        snapshotId: 'ocp_catalog_snapshot_12345678',
        providerInstanceId: 'ocp_provider_12345678',
        snapshotSequence: 1,
        observedAtMs: 3,
        checksum: null,
        metadata: null,
      },
      models: [],
    })
    expect(repo.upsertSyncState({
      providerInstanceId: 'ocp_provider_12345678',
      status: 'empty_success',
      lastAttemptAtMs: 3,
      lastSuccessAtMs: 3,
      lastSuccessSnapshotId: 'ocp_catalog_snapshot_12345678',
      failureCount: 0,
      backoffUntilMs: null,
      diagnostics: null,
      updatedAtMs: 3,
    })).toMatchObject({ status: 'empty_success', failureCount: 0 })

    expect(repo.upsertSyncState({
      providerInstanceId: 'ocp_provider_12345678',
      status: 'backoff',
      lastAttemptAtMs: 4,
      lastSuccessAtMs: 3,
      lastSuccessSnapshotId: 'ocp_catalog_snapshot_12345678',
      failureCount: 1,
      backoffUntilMs: 100,
      diagnostics: { schemaVersion: 1, code: 'http_503', messageKey: 'compatible.catalog.temporarily_unavailable', retryable: true, httpStatus: 503 },
      updatedAtMs: 4,
    })).toMatchObject({ status: 'backoff', backoffUntilMs: 100, failureCount: 1 })
  })

  it('keeps last successful models and snapshot when a later sync fails', () => {
    repo.applyRemoteSyncSuccess({
      snapshot: {
        snapshotId: 'ocp_catalog_snapshot_12345678', providerInstanceId: 'ocp_provider_12345678',
        snapshotSequence: 1, observedAtMs: 3, checksum: null, metadata: null,
      },
      models: [{ modelId: 'kept', metadata: { ...unknownMetadata('Kept'), fieldProvenance: { displayName: 'remote_sync' } } }],
    })
    repo.markSyncing('ocp_provider_12345678', 4)
    repo.recordSyncFailure({
      providerInstanceId: 'ocp_provider_12345678',
      attemptedAtMs: 4,
      backoffUntilMs: 104,
      diagnostics: { schemaVersion: 1, code: 'network', messageKey: 'compatible.catalog.network', retryable: true, httpStatus: null },
    })
    expect(repo.listModelRecords('ocp_provider_12345678', 'kept')[0]).toMatchObject({ state: 'active' })
    expect(repo.getSyncState('ocp_provider_12345678')).toMatchObject({
      status: 'backoff', lastSuccessSnapshotId: 'ocp_catalog_snapshot_12345678', failureCount: 1,
    })
  })

  it('returns one deterministic merged model with reversible source diagnostics', () => {
    repo.applyRemoteSyncSuccess({
      snapshot: {
        snapshotId: 'ocp_catalog_snapshot_12345678', providerInstanceId: 'ocp_provider_12345678',
        snapshotSequence: 1, observedAtMs: 3, checksum: null, metadata: null,
      },
      models: [{ modelId: 'shared', metadata: { ...unknownMetadata('Remote'), fieldProvenance: { displayName: 'remote_sync' } } }],
    })
    repo.upsertManualModel({
      providerInstanceId: 'ocp_provider_12345678', modelId: 'shared', metadata: unknownMetadata('Manual'), updatedAtMs: 4,
    })
    expect(repo.listMergedModels('ocp_provider_12345678')).toEqual([
      expect.objectContaining({
        protocolKey: 'openai_chat_compatible', providerInstanceId: 'ocp_provider_12345678', modelId: 'shared',
        metadata: expect.objectContaining({ displayName: 'Manual', fieldProvenance: expect.objectContaining({ displayName: 'manual' }) }),
        sourcePresence: { remote: 'active', manual: true },
      }),
    ])
    repo.deleteManualModel('ocp_provider_12345678', 'shared')
    expect(repo.listMergedModels('ocp_provider_12345678')[0]?.metadata.displayName).toBe('Remote')
  })

  it('rejects invalid successful/backoff state and arbitrary diagnostic text before SQLite', () => {
    const base = {
      providerInstanceId: 'ocp_provider_12345678',
      lastAttemptAtMs: 3,
      lastSuccessAtMs: null,
      lastSuccessSnapshotId: null,
      failureCount: 1,
      backoffUntilMs: null,
      diagnostics: null,
      updatedAtMs: 3,
    }
    expect(() => repo.upsertSyncState({ ...base, status: 'success' })).toThrow(/requires a snapshot/i)
    expect(() => repo.upsertSyncState({ ...base, status: 'backoff' })).toThrow(/requires an expiry/i)
    expect(() => repo.upsertSyncState({
      ...base,
      status: 'failed',
      diagnostics: { schemaVersion: 1, code: 'auth', message: 'hunter2', retryable: false, httpStatus: 401 } as never,
    })).toThrow()
  })

  it('recovers crash-left syncing state without changing the last successful snapshot', () => {
    repo.applyRemoteSyncSuccess({
      snapshot: {
        snapshotId: 'ocp_catalog_snapshot_12345678', providerInstanceId: 'ocp_provider_12345678',
        snapshotSequence: 1, observedAtMs: 3, checksum: null, metadata: null,
      },
      models: [{ modelId: 'kept', metadata: { ...unknownMetadata('Kept'), fieldProvenance: { displayName: 'remote_sync' } } }],
    })
    repo.markSyncing('ocp_provider_12345678', 4)
    expect(repo.recoverInterruptedSyncs(5)).toBe(1)
    expect(repo.getSyncState('ocp_provider_12345678')).toMatchObject({
      status: 'failed', lastSuccessSnapshotId: 'ocp_catalog_snapshot_12345678', failureCount: 1,
      diagnostics: { code: 'compatible_catalog_interrupted', retryable: true },
    })
    expect(repo.listModelRecords('ocp_provider_12345678', 'kept')[0]).toMatchObject({ state: 'active' })
  })

  it('bounds stale records and snapshot history per provider instance', () => {
    repo.upsertManualModel({
      providerInstanceId: 'ocp_provider_12345678', modelId: 'manual-kept', metadata: unknownMetadata('Manual kept'), updatedAtMs: 1,
    })
    for (let sequence = 1; sequence <= 22; sequence += 1) {
      repo.applyRemoteSyncSuccess({
        snapshot: {
          snapshotId: `ocp_catalog_snapshot_${String(sequence).padStart(8, '0')}`,
          providerInstanceId: 'ocp_provider_12345678', snapshotSequence: sequence,
          observedAtMs: sequence, checksum: null, metadata: null,
        },
        models: [{ modelId: `model-${sequence}`, metadata: { ...unknownMetadata(`Model ${sequence}`), fieldProvenance: { displayName: 'remote_sync' } } }],
      })
    }
    expect(db.prepare(`SELECT COUNT(*) AS count FROM compatible_catalog_snapshots WHERE provider_instance_id = ?`)
      .get('ocp_provider_12345678')).toEqual({ count: 20 })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM compatible_model_records WHERE provider_instance_id = ? AND source = 'remote_sync'`)
      .get('ocp_provider_12345678')).toEqual({ count: 20 })
    expect(repo.listModelRecords('ocp_provider_12345678', 'model-22')[0]).toMatchObject({ state: 'active' })
    expect(repo.listModelRecords('ocp_provider_12345678', 'model-1')).toEqual([])
    expect(repo.listModelRecords('ocp_provider_12345678', 'manual-kept')[0]).toMatchObject({ source: 'manual', state: 'active' })
  })

  it('bounds manual records per provider while allowing updates at the limit', () => {
    db.exec(`
      WITH RECURSIVE sequence(value) AS (
        SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 10000
      )
      INSERT INTO compatible_model_records (
        provider_instance_id, model_id, source, record_state, snapshot_id, metadata_json, created_at_ms, updated_at_ms
      )
      SELECT 'ocp_provider_12345678', printf('manual-%05d', value), 'manual', 'active', NULL, '{}', 1, 1
      FROM sequence
    `)
    expect(() => repo.upsertManualModel({
      providerInstanceId: 'ocp_provider_12345678', modelId: 'overflow', metadata: unknownMetadata('Overflow'), updatedAtMs: 2,
    })).toThrow('compatible_catalog_manual_limit')
    db.prepare(`UPDATE compatible_model_records SET metadata_json = ? WHERE provider_instance_id = ? AND model_id = ? AND source = 'manual'`)
      .run(JSON.stringify(unknownMetadata('Existing')), 'ocp_provider_12345678', 'manual-00001')
    expect(repo.upsertManualModel({
      providerInstanceId: 'ocp_provider_12345678', modelId: 'manual-00001', metadata: unknownMetadata('Updated'), updatedAtMs: 2,
    })).toMatchObject({ modelId: 'manual-00001', metadata: { displayName: 'Updated' } })
  })
})
