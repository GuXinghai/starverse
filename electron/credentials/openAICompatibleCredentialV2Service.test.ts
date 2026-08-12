import BetterSqlite3 from 'better-sqlite3'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'

const safe = vi.hoisted(() => ({ available: true, generation: 0, backend: 'gnome_libsecret' as const,
  decryptStringAsync: vi.fn(async (value: Buffer) => ({ result: value.toString('utf8').replace(/^enc:\d+:/u, ''), shouldReEncrypt: false })),
  getSelectedStorageBackend: vi.fn(() => safe.backend) }))
vi.mock('electron', () => ({ safeStorage: {
  isAsyncEncryptionAvailable: vi.fn(async () => safe.available),
  getSelectedStorageBackend: safe.getSelectedStorageBackend,
  encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`enc:${++safe.generation}:${value}`, 'utf8')),
  decryptStringAsync: safe.decryptStringAsync,
} }))

import { createOpenAICompatibleCredentialV2Service } from './openAICompatibleCredentialV2Service'

function deferred(): Readonly<{ promise: Promise<void>; resolve: () => void }> {
  let resolve!: () => void
  return Object.freeze({ promise: new Promise<void>((next) => { resolve = next }), resolve })
}

describe('OpenAI-compatible V2 credential service', () => {
  let db: BetterSqlite3.Database
  const providerInstanceId = 'ocp_provider_12345678'
  const credentialVersionRef = 'ocp_credential_12345678'
  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    db.prepare(`INSERT INTO openai_compatible_provider_v2 VALUES (?, 'openai_chat_compatible', 'Test', 'active', 1, 1, NULL)`)
      .run(providerInstanceId)
    safe.available = true; safe.generation = 0; safe.backend = 'gnome_libsecret'; safe.getSelectedStorageBackend.mockReset(); safe.decryptStringAsync.mockReset()
    safe.getSelectedStorageBackend.mockImplementation(() => safe.backend)
    safe.decryptStringAsync.mockImplementation(async (value: Buffer) => ({ result: value.toString('utf8').replace(/^enc:\d+:/u, ''), shouldReEncrypt: false }))
  })
  afterEach(() => db.close())

  it('stores only safeStorage payload in SQLite and leases it main-side', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db, platform: 'linux' })
    const status = await service.write({ providerInstanceId, credentialVersionRef, expectedRevision: 0,
      credential: { mode: 'bearer', token: 'secret-value' } })
    expect(status).toMatchObject({ configured: true, revision: 1 })
    expect(db.prepare('SELECT backend, typeof(payload) AS kind, payload FROM openai_compatible_credential_v2').get())
      .toMatchObject({ backend: 'electron_safe_storage', kind: 'blob' })
    expect(JSON.stringify(db.prepare('SELECT payload FROM openai_compatible_credential_v2').all())).not.toContain('secret-value')
    await expect(service.withCredential({ providerInstanceId, credentialVersionRef, expectedRevision: 1,
      expectedCredentialScopeId: status.credentialScopeId!, consume: (lease) => lease.credential }))
      .resolves.toEqual({ mode: 'bearer', token: 'secret-value' })
    const restarted = createOpenAICompatibleCredentialV2Service({ db })
    await expect(restarted.getStatus(providerInstanceId, credentialVersionRef)).resolves.toMatchObject({ configured: true, revision: 1 })
  })

  it('keeps a session override in main memory and restores the persistent credential after restart', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db, platform: 'linux' })
    const persistent = await service.write({ providerInstanceId, credentialVersionRef, expectedRevision: 0,
      credential: { mode: 'bearer', token: 'persisted' } })
    const session = await service.write({ providerInstanceId, credentialVersionRef, expectedRevision: persistent.revision,
      storageMode: 'session', credential: { mode: 'bearer', token: 'temporary' } })
    expect(session).toMatchObject({ configured: true, storageBackend: 'session', sessionOverridesPersistent: true })
    expect(JSON.stringify(db.prepare('SELECT payload FROM openai_compatible_credential_v2').all())).not.toContain('temporary')
    await expect(service.withCredential({ providerInstanceId, credentialVersionRef, expectedRevision: session.revision,
      expectedCredentialScopeId: session.credentialScopeId!, consume: (lease) => JSON.stringify(lease.credential) }))
      .resolves.toContain('temporary')
    await service.close()
    const restarted = createOpenAICompatibleCredentialV2Service({ db })
    const restored = await restarted.getStatus(providerInstanceId, credentialVersionRef)
    expect(restored).toMatchObject({ configured: true, storageBackend: 'electron_safe_storage', sessionOverridesPersistent: false })
  })

  it('clears a session-only credential with a monotonic revision', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db })
    const session = await service.write({ providerInstanceId, credentialVersionRef, expectedRevision: 0,
      storageMode: 'session', credential: { mode: 'bearer', token: 'temporary' } })
    await expect(service.clear(providerInstanceId, credentialVersionRef, session.revision)).resolves.toMatchObject({
      configured: false, revision: session.revision + 1, sessionOverridesPersistent: false,
    })
    await expect(service.getStatus(providerInstanceId, credentialVersionRef)).resolves.toMatchObject({ configured: false, revision: session.revision + 1 })
    await expect(service.write({ providerInstanceId, credentialVersionRef, expectedRevision: 0,
      storageMode: 'session', credential: { mode: 'bearer', token: 'stale' } }))
      .rejects.toMatchObject({ code: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE' })
  })

  it('rolls back an in-memory session mutation when its surrounding SQLite operation fails', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db })
    const prepared = await service.prepare({ providerInstanceId, credentialVersionRef, expectedRevision: 0,
      storageMode: 'session', credential: { mode: 'bearer', token: 'temporary' } })
    await expect(service.commit(providerInstanceId, () => {
      service.writePrepared(prepared)
      throw new Error('endpoint insert failed')
    })).rejects.toThrow('endpoint insert failed')
    await expect(service.getStatus(providerInstanceId, credentialVersionRef)).resolves.toMatchObject({ configured: false, revision: 0 })
  })

  it('clears all in-memory sessions when a provider is deleted', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db })
    const session = await service.write({ providerInstanceId, credentialVersionRef, expectedRevision: 0,
      storageMode: 'session', credential: { mode: 'bearer', token: 'temporary' } })
    service.clearProviderSessions(providerInstanceId)
    await expect(service.withCredential({ providerInstanceId, credentialVersionRef, expectedRevision: session.revision,
      expectedCredentialScopeId: session.credentialScopeId!, consume: () => undefined }))
      .rejects.toMatchObject({ code: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING' })
  })

  it('persists plaintext only when explicitly requested and clears both layers', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db, platform: 'linux' })
    const plain = await service.write({ providerInstanceId, credentialVersionRef, expectedRevision: 0, storageMode: 'plaintext',
      credential: { mode: 'bearer', token: 'explicit-plaintext' } })
    expect(plain).toMatchObject({ storageBackend: 'plaintext', sessionOverridesPersistent: false })
    expect(db.prepare('SELECT backend, payload FROM openai_compatible_credential_v2').get()).toMatchObject({ backend: 'plaintext' })
    const session = await service.write({ providerInstanceId, credentialVersionRef, expectedRevision: plain.revision, storageMode: 'session',
      credential: { mode: 'bearer', token: 'temporary' } })
    await expect(service.clear(providerInstanceId, credentialVersionRef, session.revision)).resolves.toMatchObject({ configured: false })
    expect(db.prepare('SELECT payload, configured FROM openai_compatible_credential_v2').get()).toEqual({ payload: null, configured: 0 })
  })

  it('fails closed for basic_text and unknown Linux backends before writing SQLite', async () => {
    for (const backend of ['basic_text', 'unknown'] as const) {
      safe.backend = backend as never
      const service = createOpenAICompatibleCredentialV2Service({ db, platform: 'linux' })
      await expect(service.write({ providerInstanceId, credentialVersionRef, expectedRevision: 0,
        credential: { mode: 'bearer', token: 'never-persist' } }))
        .rejects.toMatchObject({ code: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED' })
      expect(db.prepare('SELECT COUNT(*) AS count FROM openai_compatible_credential_v2').get()).toEqual({ count: 0 })
    }
  })

  it('rejects explicit plaintext persistence outside Linux', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db, platform: 'win32' })
    await expect(service.write({ providerInstanceId, credentialVersionRef, expectedRevision: 0,
      storageMode: 'plaintext', credential: { mode: 'bearer', token: 'never-persist' } }))
      .rejects.toMatchObject({ code: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_PLAINTEXT_UNSUPPORTED' })
    expect(db.prepare('SELECT COUNT(*) AS count FROM openai_compatible_credential_v2').get()).toEqual({ count: 0 })
  })

  it('preserves decrypt and record diagnostics in configured status', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db })
    const written = await service.write({ providerInstanceId, credentialVersionRef, expectedRevision: 0,
      credential: { mode: 'bearer', token: 'secret' } })
    safe.decryptStringAsync.mockRejectedValueOnce(new Error('os decrypt failed'))
    await expect(service.withCredential({ providerInstanceId, credentialVersionRef, expectedRevision: written.revision,
      expectedCredentialScopeId: written.credentialScopeId!, consume: () => undefined }))
      .rejects.toMatchObject({ code: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DECRYPT_FAILED' })
    await expect(service.getStatus(providerInstanceId, credentialVersionRef)).resolves.toMatchObject({
      configured: true, availability: 'unavailable',
      diagnosticCode: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DECRYPT_FAILED',
    })

    db.prepare('UPDATE openai_compatible_credential_v2 SET backend=?, payload=? WHERE credential_version_ref=?')
      .run('plaintext', Buffer.from('{not-json', 'utf8'), credentialVersionRef)
    const restarted = createOpenAICompatibleCredentialV2Service({ db, platform: 'linux' })
    await expect(restarted.withCredential({ providerInstanceId, credentialVersionRef, expectedRevision: written.revision,
      expectedCredentialScopeId: written.credentialScopeId!, consume: () => undefined }))
      .rejects.toMatchObject({ code: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_RECORD_INVALID' })
    await expect(restarted.getStatus(providerInstanceId, credentialVersionRef)).resolves.toMatchObject({
      configured: true, availability: 'unavailable',
      diagnosticCode: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_RECORD_INVALID',
    })
  })

  it('fails closed when the Linux safeStorage backend query fails', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db, platform: 'linux' })
    safe.getSelectedStorageBackend.mockImplementationOnce(() => { throw new Error('backend query failed') })
    await expect(service.write({ providerInstanceId, credentialVersionRef, expectedRevision: 0,
      credential: { mode: 'bearer', token: 'never-persist' } }))
      .rejects.toMatchObject({ code: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED' })
    expect(db.prepare('SELECT COUNT(*) AS count FROM openai_compatible_credential_v2').get()).toEqual({ count: 0 })
  })

  it('serializes competing writes and lets an issued lease finish after clear', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db })
    const request = { providerInstanceId, credentialVersionRef, expectedRevision: 0, credential: { mode: 'bearer' as const, token: 'first' } }
    const [first, second] = await Promise.allSettled([service.write(request), service.write({ ...request, credential: { mode: 'bearer', token: 'second' } })])
    expect([first, second].filter((value) => value.status === 'fulfilled')).toHaveLength(1)
    const status = await service.getStatus(providerInstanceId, credentialVersionRef)
    const gate = deferred(); const started = deferred()
    const consumption = service.withCredential({ providerInstanceId, credentialVersionRef, expectedRevision: status.revision,
      expectedCredentialScopeId: status.credentialScopeId!, consume: async (lease) => { started.resolve(); await gate.promise; return JSON.stringify(lease.credential) } })
    await started.promise
    await expect(service.clear(providerInstanceId, credentialVersionRef, status.revision)).resolves.toMatchObject({ configured: false, revision: status.revision + 1 })
    gate.resolve()
    await expect(consumption).resolves.toMatch(/"token":"(first|second)"/u)
  })

  it('commits exactly one of one hundred compatible writes from the same revision', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db })
    const results = await Promise.allSettled(Array.from({ length: 100 }, (_value, index) => service.write({ providerInstanceId, credentialVersionRef,
      expectedRevision: 0, credential: { mode: 'bearer', token: `candidate-${index}` } })))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(99)
    await expect(service.getStatus(providerInstanceId, credentialVersionRef)).resolves.toMatchObject({ configured: true, revision: 1 })
  })

  it('does not publish a prepared credential when its SQLite transaction rolls back', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db })
    const prepared = await service.prepare({ providerInstanceId, credentialVersionRef, expectedRevision: 0, credential: { mode: 'bearer', token: 'never-committed' } })
    expect(() => db.transaction(() => { service.writePrepared(prepared); throw new Error('injected rollback') })()).toThrow('injected rollback')
    service.discardPrepared(prepared)
    await expect(service.getStatus(providerInstanceId, credentialVersionRef)).resolves.toMatchObject({ configured: false, revision: 0 })
  })

  it('rejects a standalone write for a missing provider without creating an orphan credential', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db })
    await expect(service.write({ providerInstanceId: 'ocp_provider_missing', credentialVersionRef, expectedRevision: 0,
      credential: { mode: 'bearer', token: 'not-stored' } })).rejects.toMatchObject({ code: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING' })
    expect(db.prepare('SELECT count(*) AS count FROM openai_compatible_credential_v2').get()).toEqual({ count: 0 })
  })

  it('drains an active lease and rejects new work after close', async () => {
    const service = createOpenAICompatibleCredentialV2Service({ db })
    const status = await service.write({ providerInstanceId, credentialVersionRef, expectedRevision: 0, credential: { mode: 'bearer', token: 'secret' } })
    const gate = deferred(); const started = deferred()
    const consumption = service.withCredential({ providerInstanceId, credentialVersionRef, expectedRevision: status.revision, expectedCredentialScopeId: status.credentialScopeId!,
      consume: async () => { started.resolve(); await gate.promise } })
    await started.promise
    const firstClose = service.close(); const secondClose = service.close()
    await expect(service.getStatus(providerInstanceId, credentialVersionRef)).rejects.toThrow('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_NOT_INITIALIZED')
    gate.resolve(); await Promise.all([consumption, firstClose, secondClose])
  })
})
