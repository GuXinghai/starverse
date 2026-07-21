import { randomBytes } from 'node:crypto'
import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { app, safeStorage } from 'electron'
import {
  installGenerationV2SchemaInActiveTransaction,
  verifyInstalledGenerationV2SchemaInActiveTransaction,
  type GenerationV2SchemaBundle,
} from '../../infra/db/v2/schemaComposerV2'
import {
  createEpoch2RootManifest,
  type Epoch2WorkspaceLayout,
} from './rootManifest'
import {
  acquireWin32EpochDatabaseFileAuthority,
  assertEpoch2RootAuthority,
  type Epoch2RootAuthority,
  type Win32EpochDatabaseFileAuthority,
  type Win32EpochRootLease,
} from './win32EpochRootLease'
import {
  deriveCredentialScopeIdV2Primitive,
  type CredentialScopeIdV2,
} from '../../infra/security/credentialScopeV2Primitive'

const SCOPE_KEY_BYTES = 32
const SCOPE_KEY_BASE64 = /^[A-Za-z0-9+/]{43}=$/u
const MAX_ENVELOPE_BYTES = 1024 * 1024
export type FreshEpochDatabaseCrashSmokeStage = 'after_schema' | 'after_identity' | 'after_envelope'

export class FreshEpochDatabaseInitializerError extends Error {
  constructor(readonly code:
    | 'EPOCH2_SCHEMA_ASSET_ROOT_INVALID'
    | 'EPOCH2_DATABASE_PATH_NOT_ABSOLUTE'
    | 'EPOCH2_DATABASE_OPEN_FAILED'
    | 'EPOCH2_DATABASE_OPEN_CANTOPEN'
    | 'EPOCH2_DATABASE_PRAGMA_INVALID'
    | 'EPOCH2_DATABASE_STATE_INVALID'
    | 'EPOCH2_DATABASE_TRANSACTION_FAILED'
    | 'EPOCH2_DATABASE_POSTCOMMIT_INVALID'
    | 'EPOCH2_SCOPE_KEY_STORAGE_UNAVAILABLE'
    | 'EPOCH2_SCOPE_KEY_ENCRYPT_FAILED'
    | 'EPOCH2_SCOPE_KEY_DECRYPT_FAILED'
    | 'EPOCH2_SCOPE_KEY_REENCRYPT_FAILED') {
    super(code)
    this.name = 'FreshEpochDatabaseInitializerError'
  }
}

function emitDatabaseInitializationMilestone(value: string): void {
  if (process.env.SV_EPOCH2_NORMAL_PROFILE_INIT === '1') {
    process.stderr.write(`[epoch2-database] ${value}\n`)
  }
}

export type FreshEpochDatabaseInitializationResult = Readonly<{
  classification: 'epoch_2_database_initialized'
  executionAuthority: 'none'
  created: boolean
  databaseFileId: string
  schemaVersion: 1
  schemaDigest: string
  objectProjectionDigest: string
  rootId: string
}>

function translateFailure(
  error: unknown,
  fallback: FreshEpochDatabaseInitializerError['code'],
): FreshEpochDatabaseInitializerError {
  return error instanceof FreshEpochDatabaseInitializerError
    ? error
    : new FreshEpochDatabaseInitializerError(fallback)
}

async function requireAsyncSafeStorage(): Promise<void> {
  try {
    if (!await safeStorage.isAsyncEncryptionAvailable()) {
      throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_STORAGE_UNAVAILABLE')
    }
  } catch (error) {
    throw translateFailure(error, 'EPOCH2_SCOPE_KEY_STORAGE_UNAVAILABLE')
  }
}

async function createScopeKeyEnvelope(): Promise<Buffer> {
  const key = randomBytes(SCOPE_KEY_BYTES)
  let plaintext = ''
  try {
    plaintext = key.toString('base64')
    if (!SCOPE_KEY_BASE64.test(plaintext)) {
      throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_ENCRYPT_FAILED')
    }
    let encrypted: Buffer
    try {
      encrypted = await safeStorage.encryptStringAsync(plaintext)
    } catch {
      throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_ENCRYPT_FAILED')
    }
    if (!Buffer.isBuffer(encrypted) || encrypted.byteLength === 0 ||
        encrypted.byteLength > MAX_ENVELOPE_BYTES) {
      if (Buffer.isBuffer(encrypted)) encrypted.fill(0)
      throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_ENCRYPT_FAILED')
    }
    return encrypted
  } finally {
    plaintext = ''
    key.fill(0)
  }
}

function assertEncryptedEnvelope(encrypted: unknown): Buffer {
  if (!Buffer.isBuffer(encrypted) || encrypted.byteLength === 0 ||
      encrypted.byteLength > MAX_ENVELOPE_BYTES) {
    if (Buffer.isBuffer(encrypted)) encrypted.fill(0)
    throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_REENCRYPT_FAILED')
  }
  return encrypted
}

async function decryptScopeKeyEnvelope(ciphertext: Buffer): Promise<Readonly<{
  key: Buffer
  rewrappedEnvelope?: Buffer
}>> {
  let plaintext = ''
  let key: Buffer | undefined
  let rewrapped: Buffer | undefined
  let returned = false
  try {
    let decrypted: Electron.DecryptStringAsyncReturnValue
    try {
      decrypted = await safeStorage.decryptStringAsync(ciphertext)
    } catch {
      throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_DECRYPT_FAILED')
    }
    if (!decrypted || typeof decrypted !== 'object' ||
        typeof decrypted.shouldReEncrypt !== 'boolean' || typeof decrypted.result !== 'string') {
      throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_DECRYPT_FAILED')
    }
    plaintext = decrypted.result
    if (!SCOPE_KEY_BASE64.test(plaintext)) {
      throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_DECRYPT_FAILED')
    }
    key = Buffer.from(plaintext, 'base64')
    if (key.byteLength !== SCOPE_KEY_BYTES || key.toString('base64') !== plaintext) {
      throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_DECRYPT_FAILED')
    }
    if (decrypted.shouldReEncrypt) {
      try {
        rewrapped = assertEncryptedEnvelope(await safeStorage.encryptStringAsync(plaintext))
      } catch (error) {
        throw translateFailure(error, 'EPOCH2_SCOPE_KEY_REENCRYPT_FAILED')
      }
    }
    const result = Object.freeze({ key, rewrappedEnvelope: rewrapped })
    returned = true
    return result
  } finally {
    plaintext = ''
    if (!returned) {
      key?.fill(0)
      rewrapped?.fill(0)
    }
    ciphertext.fill(0)
  }
}

async function verifyScopeKeyEnvelope(ciphertext: Buffer): Promise<Buffer | undefined> {
  const decrypted = await decryptScopeKeyEnvelope(ciphertext)
  try {
    return decrypted.rewrappedEnvelope
  } finally {
    decrypted.key.fill(0)
  }
}

function schemaAssetRoot(): string {
  // Packaged SQL fragments live under app.asar. Development builds are often
  // launched by their compiled entry file, where app.getAppPath() resolves to
  // dist-electron rather than the repository root.
  const root = app.isPackaged ? app.getAppPath() : process.cwd()
  if (typeof root !== 'string' || !path.isAbsolute(root) || root.includes('\0')) {
    throw new FreshEpochDatabaseInitializerError('EPOCH2_SCHEMA_ASSET_ROOT_INVALID')
  }
  return path.resolve(root)
}

function configureConnection(db: BetterSqlite3.Database): void {
  const journalMode = db.pragma('journal_mode = DELETE', { simple: true })
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = FULL')
  db.pragma('busy_timeout = 0')
  if (journalMode !== 'delete' || db.pragma('foreign_keys', { simple: true }) !== 1 ||
      db.pragma('synchronous', { simple: true }) !== 2 ||
      db.pragma('journal_mode', { simple: true }) !== 'delete') {
    throw new FreshEpochDatabaseInitializerError('EPOCH2_DATABASE_PRAGMA_INVALID')
  }
}

function hasInstalledObjects(db: BetterSqlite3.Database): boolean {
  const row = db.prepare(`SELECT count(*) AS count FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'`).get() as { count: number }
  return row.count !== 0
}

function insertFreshAppIdentity(input: Readonly<{
  db: BetterSqlite3.Database
  bundle: GenerationV2SchemaBundle
  layout: Epoch2WorkspaceLayout
  nowMs: number
}>): void {
  const manifest = createEpoch2RootManifest({ layout: input.layout })
  input.db.prepare(`INSERT INTO app_meta_v2 (
    singleton_id, data_epoch, application_id, root_id, schema_digest, created_at_ms
  ) VALUES (1, 2, ?, ?, ?, ?)`).run(
    manifest.applicationId,
    manifest.rootId,
    input.bundle.schemaDigest,
    input.nowMs,
  )
}

function insertFreshScopeEnvelope(input: Readonly<{
  db: BetterSqlite3.Database
  envelope: Buffer
  nowMs: number
}>): void {
  input.db.prepare(`INSERT INTO epoch_scope_key_envelope_v2 (
    singleton_id, backend, key_version, envelope_revision, ciphertext, created_at_ms, updated_at_ms
  ) VALUES (1, 'electron_safe_storage', 1, 1, ?, ?, ?)`).run(
    input.envelope, input.nowMs, input.nowMs,
  )
}

function crashForSmoke(stage: FreshEpochDatabaseCrashSmokeStage, markerPath: string): never {
  if (app.isPackaged || !path.isAbsolute(markerPath) || markerPath.includes('\0')) {
    throw new FreshEpochDatabaseInitializerError('EPOCH2_DATABASE_STATE_INVALID')
  }
  const descriptor = openSync(markerPath, 'wx', 0o600)
  try {
    writeSync(descriptor, `${stage}\n`, undefined, 'utf8')
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  process.kill(process.pid, 'SIGKILL')
  throw new FreshEpochDatabaseInitializerError('EPOCH2_DATABASE_STATE_INVALID')
}

type PersistedScopeEnvelope = Readonly<{
  ciphertext: Buffer
  envelopeRevision: number
}>

function readAndValidateIdentity(input: Readonly<{
  db: BetterSqlite3.Database
  bundle: GenerationV2SchemaBundle
  layout: Epoch2WorkspaceLayout
}>): PersistedScopeEnvelope {
  const expected = createEpoch2RootManifest({ layout: input.layout })
  const meta = input.db.prepare(`SELECT data_epoch, application_id, root_id, schema_digest, created_at_ms
    FROM app_meta_v2 WHERE singleton_id = 1`).get() as {
      data_epoch: number
      application_id: string
      root_id: string
      schema_digest: string
      created_at_ms: number
    } | undefined
  const envelope = input.db.prepare(`SELECT backend, key_version, envelope_revision, ciphertext,
      created_at_ms, updated_at_ms
    FROM epoch_scope_key_envelope_v2 WHERE singleton_id = 1`).get() as {
      backend: string
      key_version: number
      envelope_revision: number
      ciphertext: Buffer
      created_at_ms: number
      updated_at_ms: number
    } | undefined
  if (!meta || meta.data_epoch !== 2 || meta.application_id !== expected.applicationId ||
      meta.root_id !== expected.rootId || meta.schema_digest !== input.bundle.schemaDigest ||
      !Number.isSafeInteger(meta.created_at_ms) || meta.created_at_ms < 0 || !envelope ||
      envelope.backend !== 'electron_safe_storage' || envelope.key_version !== 1 ||
      !Number.isSafeInteger(envelope.envelope_revision) || envelope.envelope_revision < 1 ||
      envelope.created_at_ms !== meta.created_at_ms ||
      !Number.isSafeInteger(envelope.updated_at_ms) || envelope.updated_at_ms < envelope.created_at_ms ||
      !Buffer.isBuffer(envelope.ciphertext) ||
      envelope.ciphertext.byteLength === 0 || envelope.ciphertext.byteLength > MAX_ENVELOPE_BYTES) {
    if (envelope && Buffer.isBuffer(envelope.ciphertext)) envelope.ciphertext.fill(0)
    throw new FreshEpochDatabaseInitializerError('EPOCH2_DATABASE_STATE_INVALID')
  }
  return Object.freeze({
    ciphertext: envelope.ciphertext,
    envelopeRevision: envelope.envelope_revision,
  })
}

function openDatabase(
  input: Readonly<{ layout: Epoch2WorkspaceLayout; readonly: boolean }>,
): BetterSqlite3.Database {
  if (!path.isAbsolute(input.layout.databasePath)) {
    throw new FreshEpochDatabaseInitializerError('EPOCH2_DATABASE_PATH_NOT_ABSOLUTE')
  }
  try {
    return new BetterSqlite3(input.layout.databasePath, input.readonly
      ? { readonly: true, fileMustExist: true }
      : undefined)
  } catch (error) {
    const sqliteCode = error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
    throw new FreshEpochDatabaseInitializerError(
      sqliteCode === 'SQLITE_CANTOPEN'
        ? 'EPOCH2_DATABASE_OPEN_CANTOPEN'
        : 'EPOCH2_DATABASE_OPEN_FAILED',
    )
  }
}

async function postCommitVerify(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  schemaRoot: string
  authority: Win32EpochDatabaseFileAuthority
}>): Promise<Readonly<{
  bundle: GenerationV2SchemaBundle
  rewrappedEnvelope?: Buffer
  envelopeRevision: number
}>> {
  input.authority.verifyPathIdentity()
  const db = openDatabase({ layout: input.layout, readonly: true })
  let persisted: PersistedScopeEnvelope | undefined
  let rewrappedEnvelope: Buffer | undefined
  try {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new FreshEpochDatabaseInitializerError('EPOCH2_DATABASE_POSTCOMMIT_INVALID')
    }
    db.exec('BEGIN')
    let bundle: GenerationV2SchemaBundle
    try {
      bundle = verifyInstalledGenerationV2SchemaInActiveTransaction(db, input.schemaRoot)
      persisted = readAndValidateIdentity({ db, bundle, layout: input.layout })
      db.exec('COMMIT')
    } catch (error) {
      if (db.inTransaction) db.exec('ROLLBACK')
      throw error
    }
    db.close()
    rewrappedEnvelope = await verifyScopeKeyEnvelope(persisted.ciphertext)
    const envelopeRevision = persisted.envelopeRevision
    persisted = undefined
    input.authority.verifyPathIdentity()
    return Object.freeze({ bundle, rewrappedEnvelope, envelopeRevision })
  } catch (error) {
    persisted?.ciphertext.fill(0)
    rewrappedEnvelope?.fill(0)
    if (db.open) db.close()
    throw translateFailure(error, 'EPOCH2_DATABASE_POSTCOMMIT_INVALID')
  }
}

function rewrapScopeKeyEnvelope(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  schemaRoot: string
  authority: Win32EpochDatabaseFileAuthority
  expectedRevision: number
  envelope: Buffer
}>): void {
  input.authority.verifyPathIdentity()
  const db = openDatabase({ layout: input.layout, readonly: false })
  try {
    configureConnection(db)
    db.exec('BEGIN IMMEDIATE')
    try {
      const bundle = verifyInstalledGenerationV2SchemaInActiveTransaction(db, input.schemaRoot)
      const persisted = readAndValidateIdentity({ db, bundle, layout: input.layout })
      try {
        if (persisted.envelopeRevision !== input.expectedRevision) {
          throw new FreshEpochDatabaseInitializerError('EPOCH2_DATABASE_STATE_INVALID')
        }
      } finally {
        persisted.ciphertext.fill(0)
      }
      const nowMs = Date.now()
      const result = db.prepare(`UPDATE epoch_scope_key_envelope_v2
        SET ciphertext = ?, envelope_revision = envelope_revision + 1, updated_at_ms = ?
        WHERE singleton_id = 1 AND envelope_revision = ?`).run(
        input.envelope, nowMs, input.expectedRevision,
      )
      if (result.changes !== 1) {
        throw new FreshEpochDatabaseInitializerError('EPOCH2_DATABASE_STATE_INVALID')
      }
      db.exec('COMMIT')
    } catch (error) {
      if (db.inTransaction) db.exec('ROLLBACK')
      throw error
    }
  } catch (error) {
    throw translateFailure(error, 'EPOCH2_SCOPE_KEY_REENCRYPT_FAILED')
  } finally {
    input.envelope.fill(0)
    if (db.open) db.close()
  }
  input.authority.verifyPathIdentity()
}

export type FreshEpochDatabaseInitializerInput = Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  rootAuthority: Epoch2RootAuthority
}>

async function verifyAndDescribeFreshEpoch2Database(input: Readonly<{
  initializer: FreshEpochDatabaseInitializerInput
  authority: Win32EpochDatabaseFileAuthority
  initialDatabaseFileId: string
  schemaRoot: string
  created: boolean
}>): Promise<FreshEpochDatabaseInitializationResult> {
  let verified = await postCommitVerify({
    layout: input.initializer.layout,
    schemaRoot: input.schemaRoot,
    authority: input.authority,
  })
  if (verified.rewrappedEnvelope) {
    rewrapScopeKeyEnvelope({
      layout: input.initializer.layout,
      schemaRoot: input.schemaRoot,
      authority: input.authority,
      expectedRevision: verified.envelopeRevision,
      envelope: verified.rewrappedEnvelope,
    })
    verified = await postCommitVerify({
      layout: input.initializer.layout,
      schemaRoot: input.schemaRoot,
      authority: input.authority,
    })
    if (verified.rewrappedEnvelope) {
      verified.rewrappedEnvelope.fill(0)
      throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_REENCRYPT_FAILED')
    }
  }
  const bundle = verified.bundle
  const finalIdentity = input.authority.verifyPathIdentity()
  const manifest = createEpoch2RootManifest({ layout: input.initializer.layout })
  if (finalIdentity.databaseFileId !== input.initialDatabaseFileId ||
      !bundle.objectProjectionDigest) {
    throw new FreshEpochDatabaseInitializerError('EPOCH2_DATABASE_POSTCOMMIT_INVALID')
  }
  return Object.freeze({
    classification: 'epoch_2_database_initialized',
    executionAuthority: 'none',
    created: input.created,
    databaseFileId: finalIdentity.databaseFileId,
    schemaVersion: bundle.schemaVersion,
    schemaDigest: bundle.schemaDigest,
    objectProjectionDigest: bundle.objectProjectionDigest,
    rootId: manifest.rootId,
  })
}

async function initializeOrVerifyFreshEpoch2DatabaseCore(
  input: FreshEpochDatabaseInitializerInput,
  crashSmoke?: Readonly<{ stage: FreshEpochDatabaseCrashSmokeStage; markerPath: string }>,
): Promise<FreshEpochDatabaseInitializationResult> {
  assertEpoch2RootAuthority(input.rootAuthority, input)
  await requireAsyncSafeStorage()
  const authority = acquireWin32EpochDatabaseFileAuthority({ ...input, mode: 'create_or_open' })
  const initialIdentity = authority.identity()
  const schemaRoot = schemaAssetRoot()
  let envelope: Buffer | undefined
  let created = false
  try {
    authority.verifyPathIdentity()
    const db = openDatabase({ layout: input.layout, readonly: false })
    try {
      configureConnection(db)
      emitDatabaseInitializationMilestone('connection_configured')
      const initiallyEmpty = !hasInstalledObjects(db)
      if (initiallyEmpty) {
        envelope = await createScopeKeyEnvelope()
        emitDatabaseInitializationMilestone('scope_envelope_created')
      }
      db.exec('BEGIN IMMEDIATE')
      emitDatabaseInitializationMilestone('transaction_started')
      try {
        const emptyInsideTransaction = !hasInstalledObjects(db)
        if (emptyInsideTransaction !== initiallyEmpty) {
          throw new FreshEpochDatabaseInitializerError('EPOCH2_DATABASE_STATE_INVALID')
        }
        const bundle = installGenerationV2SchemaInActiveTransaction(db, schemaRoot)
        emitDatabaseInitializationMilestone('schema_installed')
        if (initiallyEmpty && crashSmoke?.stage === 'after_schema') {
          crashForSmoke(crashSmoke.stage, crashSmoke.markerPath)
        }
        if (initiallyEmpty) {
          if (!envelope) throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_ENCRYPT_FAILED')
          const nowMs = Date.now()
          insertFreshAppIdentity({
            db,
            bundle,
            layout: input.layout,
            nowMs,
          })
          emitDatabaseInitializationMilestone('identity_inserted')
          if (crashSmoke?.stage === 'after_identity') {
            crashForSmoke(crashSmoke.stage, crashSmoke.markerPath)
          }
          insertFreshScopeEnvelope({ db, envelope, nowMs })
          emitDatabaseInitializationMilestone('scope_envelope_inserted')
          if (crashSmoke?.stage === 'after_envelope') {
            crashForSmoke(crashSmoke.stage, crashSmoke.markerPath)
          }
          created = true
        } else {
          const persisted = readAndValidateIdentity({ db, bundle, layout: input.layout })
          persisted.ciphertext.fill(0)
        }
        db.exec('COMMIT')
        emitDatabaseInitializationMilestone('transaction_committed')
      } catch (error) {
        if (db.inTransaction) db.exec('ROLLBACK')
        throw error
      }
    } catch (error) {
      if (db.open) db.close()
      throw translateFailure(error, 'EPOCH2_DATABASE_TRANSACTION_FAILED')
    }
    if (db.open) db.close()
    envelope?.fill(0)
    envelope = undefined
    return await verifyAndDescribeFreshEpoch2Database({
      initializer: input,
      authority,
      initialDatabaseFileId: initialIdentity.databaseFileId,
      schemaRoot,
      created,
    })
  } finally {
    envelope?.fill(0)
    authority.release()
  }
}

export async function initializeOrVerifyFreshEpoch2Database(
  input: FreshEpochDatabaseInitializerInput,
): Promise<FreshEpochDatabaseInitializationResult> {
  return initializeOrVerifyFreshEpoch2DatabaseCore(input)
}

export async function verifyExistingFreshEpoch2Database(
  input: FreshEpochDatabaseInitializerInput,
): Promise<FreshEpochDatabaseInitializationResult> {
  assertEpoch2RootAuthority(input.rootAuthority, input)
  await requireAsyncSafeStorage()
  const authority = acquireWin32EpochDatabaseFileAuthority({ ...input, mode: 'verify_existing' })
  const initialIdentity = authority.identity()
  try {
    return await verifyAndDescribeFreshEpoch2Database({
      initializer: input,
      authority,
      initialDatabaseFileId: initialIdentity.databaseFileId,
      schemaRoot: schemaAssetRoot(),
      created: false,
    })
  } finally {
    authority.release()
  }
}

async function withVerifiedEpoch2ScopeKey<T>(input: Readonly<{
  initializer: FreshEpochDatabaseInitializerInput
  consume: (scopeKey: Uint8Array) => Promise<T> | T
}>): Promise<T> {
  assertEpoch2RootAuthority(input.initializer.rootAuthority, input.initializer)
  await requireAsyncSafeStorage()
  const authority = acquireWin32EpochDatabaseFileAuthority({
    ...input.initializer,
    mode: 'verify_existing',
  })
  const schemaRoot = schemaAssetRoot()
  let persisted: PersistedScopeEnvelope | undefined
  let decrypted: Awaited<ReturnType<typeof decryptScopeKeyEnvelope>> | undefined
  try {
    let verified = await postCommitVerify({
      layout: input.initializer.layout,
      schemaRoot,
      authority,
    })
    if (verified.rewrappedEnvelope) {
      rewrapScopeKeyEnvelope({
        layout: input.initializer.layout,
        schemaRoot,
        authority,
        expectedRevision: verified.envelopeRevision,
        envelope: verified.rewrappedEnvelope,
      })
      verified = await postCommitVerify({
        layout: input.initializer.layout,
        schemaRoot,
        authority,
      })
      if (verified.rewrappedEnvelope) {
        verified.rewrappedEnvelope.fill(0)
        throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_REENCRYPT_FAILED')
      }
    }
    const db = openDatabase({ layout: input.initializer.layout, readonly: true })
    try {
      db.pragma('foreign_keys = ON')
      db.exec('BEGIN')
      try {
        const bundle = verifyInstalledGenerationV2SchemaInActiveTransaction(db, schemaRoot)
        persisted = readAndValidateIdentity({
          db,
          bundle,
          layout: input.initializer.layout,
        })
        db.exec('COMMIT')
      } catch (error) {
        if (db.inTransaction) db.exec('ROLLBACK')
        throw error
      }
    } finally {
      db.close()
    }
    decrypted = await decryptScopeKeyEnvelope(persisted.ciphertext)
    persisted = undefined
    if (decrypted.rewrappedEnvelope) {
      decrypted.rewrappedEnvelope.fill(0)
      throw new FreshEpochDatabaseInitializerError('EPOCH2_SCOPE_KEY_REENCRYPT_FAILED')
    }
    authority.verifyPathIdentity()
    return await input.consume(decrypted.key)
  } finally {
    persisted?.ciphertext.fill(0)
    decrypted?.key.fill(0)
    decrypted?.rewrappedEnvelope?.fill(0)
    authority.release()
  }
}

export async function deriveCredentialScopeIdWithVerifiedEpoch2Key(input: Readonly<{
  initializer: FreshEpochDatabaseInitializerInput
  providerId: string
  credential: string
}>): Promise<CredentialScopeIdV2> {
  return withVerifiedEpoch2ScopeKey({
    initializer: input.initializer,
    consume: (scopeKey) => deriveCredentialScopeIdV2Primitive({
      epochScopeKey: scopeKey,
      providerId: input.providerId,
      credential: input.credential,
    }),
  })
}

export async function runFreshEpoch2DatabaseCrashSmoke(input: Readonly<{
  initializer: FreshEpochDatabaseInitializerInput
  stage: FreshEpochDatabaseCrashSmokeStage
  markerPath: string
}>): Promise<never> {
  await initializeOrVerifyFreshEpoch2DatabaseCore(input.initializer, {
    stage: input.stage,
    markerPath: input.markerPath,
  })
  throw new FreshEpochDatabaseInitializerError('EPOCH2_DATABASE_STATE_INVALID')
}
