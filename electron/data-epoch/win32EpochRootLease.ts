import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import {
  assertEpoch2WorkspaceLayoutAuthority,
  STARVERSE_EPOCH_DIRECTORY,
  STARVERSE_PRODUCT_DIRECTORY,
  type Epoch2WorkspaceLayout,
} from './rootManifest'
import {
  projectEpoch2Config,
  type Epoch2CredentialDecryptValidator,
} from './configProjection'
import {
  assertEpoch2ResetJournalInventory,
  decodeEpoch2ResetJournal,
  type Epoch2ResetPhase,
} from './resetJournal'

const NATIVE_FILE_NAME = 'starverse_epoch_win32.node'
const TRANSITION_DIRECTORY = '.epoch-transition'
const LOCK_FILE_NAME = 'epoch-transition.lock'
const TRANSITION_FILE_FACTS = Object.freeze({
  transition_manifest: Object.freeze({ fileName: 'root-manifest.json', maxBytes: 4 * 1024 }),
  reset_journal: Object.freeze({ fileName: 'epoch-transition.journal.json', maxBytes: 64 * 1024 }),
})
const ISSUED_WIN32_EPOCH_LEASES = new WeakMap<object, Epoch2WorkspaceLayout>()

export type Win32EpochTransitionFileKey = keyof typeof TRANSITION_FILE_FACTS

export const EPOCH2_OWNED_TARGET_IDS = Object.freeze([
  'legacy_chat_db',
  'legacy_chat_db_wal',
  'legacy_chat_db_shm',
  'legacy_chat_db_journal',
  'legacy_assets',
  'legacy_engine_plugins',
  'legacy_managed_runtimes',
  'legacy_debug',
  'legacy_logs',
  'legacy_temp',
  'legacy_workspace',
] as const)
export type Epoch2OwnedTargetId = (typeof EPOCH2_OWNED_TARGET_IDS)[number]

export type Win32OwnedDeleteSummary = Readonly<{
  exists: boolean
  files: number
  directories: number
  rootFileId?: string
}>

export type Win32EpochRootIdentity = Readonly<{
  volumeSerial: string
  transitionFileId: string
}>

export interface Win32EpochRootLease {
  rootIdentity(): Win32EpochRootIdentity
  readTransitionFile(key: Win32EpochTransitionFileKey): Uint8Array | null
  writeTransitionFile(key: Win32EpochTransitionFileKey, bytes: Uint8Array): 'written' | 'exists'
  release(): void
}

export type Win32EpochLeaseRequest = Readonly<{
  mutexName: string
  appDataRoot: string
  productDirectory: typeof STARVERSE_PRODUCT_DIRECTORY
  transitionDirectory: typeof TRANSITION_DIRECTORY
  lockFileName: typeof LOCK_FILE_NAME
}>

type NativeLease = Readonly<{
  rootIdentity(): unknown
  readTransitionFile(fileName: string, maxBytes: number): unknown
  writeTransitionFile(fileName: string, bytes: Buffer, replaceExisting: boolean): unknown
  readLegacyConfig(operationId: string): unknown
  replaceLegacyConfig(operationId: string, snapshotId: string, bytes: Buffer): unknown
  inspectLegacyConfigBackups(): unknown
  deleteLegacyConfigBackups(): unknown
  ensureEpochRootMarker(): unknown
  verifyEpochRootMarker(): unknown
  acquireEpochDatabaseFile(mode: string): unknown
  putEpochAttachmentBlob(storageRef: string, sha256: string, bytes: Buffer): unknown
  readEpochAttachmentBlob(storageRef: string, sha256: string, sizeBytes: number): unknown
  inspectOwnedTarget(targetId: string): unknown
  deleteOwnedTarget(targetId: string): unknown
  cleanupTransitionTemps(): unknown
  release(): unknown
}>

type NativeEpochDatabaseFileAuthority = Readonly<{
  identity(): unknown
  verifyPathIdentity(): unknown
  release(): unknown
}>

type NativeAddon = Readonly<{
  selfTest(): unknown
  acquireEpochRootLease(input: Win32EpochLeaseRequest): unknown
}>

const NATIVE_WIN32_EPOCH_LEASES = new WeakMap<object, NativeLease>()

export class Win32EpochRootLeaseError extends Error {
  constructor(readonly code:
    | 'EPOCH2_WIN32_NATIVE_REQUIRED'
    | 'EPOCH2_WIN32_NATIVE_CONTRACT_INVALID'
    | 'EPOCH2_WIN32_NATIVE_INPUT_INVALID'
    | 'EPOCH2_WIN32_APP_DATA_PATH_UNSAFE'
    | 'EPOCH2_WIN32_ROOT_OPEN_FAILED'
    | 'EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED'
    | 'EPOCH2_WIN32_MUTEX_OPEN_FAILED'
    | 'EPOCH2_WIN32_MUTEX_WAIT_FAILED'
    | 'EPOCH2_WIN32_LEASE_BUSY'
    | 'EPOCH2_WIN32_NT_API_UNAVAILABLE'
    | 'EPOCH2_WIN32_LOCK_OPEN_FAILED'
    | 'EPOCH2_WIN32_ROOT_IDENTITY_FAILED'
    | 'EPOCH2_WIN32_LEASE_RELEASED'
    | 'EPOCH2_WIN32_TRANSITION_READ_FAILED'
    | 'EPOCH2_WIN32_TRANSITION_REPARSE_POINT'
    | 'EPOCH2_WIN32_TRANSITION_FILE_TOO_LARGE'
    | 'EPOCH2_WIN32_RANDOM_FAILED'
    | 'EPOCH2_WIN32_RANDOM_COLLISION'
    | 'EPOCH2_WIN32_ATOMIC_REPLACE_FAILED'
    | 'EPOCH2_WIN32_TRANSITION_WRITE_FAILED'
    | 'EPOCH2_WIN32_TRANSITION_FLUSH_FAILED'
    | 'EPOCH2_WIN32_TRANSITION_RENAME_FAILED'
    | 'EPOCH2_WIN32_DELETE_TARGET_NOT_ALLOWED'
    | 'EPOCH2_WIN32_DELETE_OWNERSHIP_INVALID'
    | 'EPOCH2_WIN32_DELETE_TARGET_OPEN_FAILED'
    | 'EPOCH2_WIN32_DELETE_REPARSE_POINT'
    | 'EPOCH2_WIN32_DELETE_ENUMERATION_FAILED'
    | 'EPOCH2_WIN32_DELETE_ENUMERATION_INVALID'
    | 'EPOCH2_WIN32_DELETE_TREE_LIMIT_EXCEEDED'
    | 'EPOCH2_WIN32_DELETE_IDENTITY_FAILED'
    | 'EPOCH2_WIN32_DELETE_TREE_CHANGED'
    | 'EPOCH2_WIN32_DELETE_PROTECTED_DESCENDANT'
    | 'EPOCH2_WIN32_DELETE_API_UNSUPPORTED'
    | 'EPOCH2_WIN32_DELETE_FAILED'
    | 'EPOCH2_WIN32_TEMP_NAME_INVALID'
    | 'EPOCH2_WIN32_TEMP_REPARSE_OR_CHANGED'
    | 'EPOCH2_WIN32_TEMP_INVALID'
    | 'EPOCH2_WIN32_CONFIG_OWNERSHIP_INVALID'
    | 'EPOCH2_WIN32_CONFIG_READ_FAILED'
    | 'EPOCH2_WIN32_CONFIG_REPARSE_POINT'
    | 'EPOCH2_WIN32_CONFIG_CHANGED'
    | 'EPOCH2_WIN32_CONFIG_REPLACE_FAILED'
    | 'EPOCH2_WIN32_CONFIG_BACKUP_NAME_INVALID'
    | 'EPOCH2_WIN32_CONFIG_BACKUP_INVALID'
    | 'EPOCH2_WIN32_EPOCH_ROOT_INVALID'
    | 'EPOCH2_WIN32_EPOCH_ROOT_CONFLICT'
    | 'EPOCH2_WIN32_EPOCH_MARKER_INVALID'
    | 'EPOCH2_WIN32_EPOCH_MARKER_CONFLICT'
    | 'EPOCH2_WIN32_EPOCH_MARKER_TEMP_INVALID'
    | 'EPOCH2_WIN32_EPOCH_PHASE_CLOSED'
    | 'EPOCH2_WIN32_CONFIG_TRANSACTION_CONFLICT'
    | 'EPOCH2_WIN32_DATABASE_FILE_ROOT_INVALID'
    | 'EPOCH2_WIN32_DATABASE_FILE_OPEN_FAILED'
    | 'EPOCH2_WIN32_DATABASE_FILE_MISSING'
    | 'EPOCH2_WIN32_DATABASE_FILE_INVALID'
    | 'EPOCH2_WIN32_DATABASE_FILE_CHANGED'
    | 'EPOCH2_WIN32_DATABASE_FILE_RELEASED'
    | 'EPOCH2_WIN32_ATTACHMENT_BLOB_HASH_MISMATCH'
    | 'EPOCH2_WIN32_ATTACHMENT_BLOB_ROOT_INVALID'
    | 'EPOCH2_WIN32_ATTACHMENT_BLOB_INVALID'
    | 'EPOCH2_WIN32_ATTACHMENT_BLOB_OPEN_FAILED'
    | 'EPOCH2_WIN32_ATTACHMENT_BLOB_WRITE_FAILED'
    | 'EPOCH2_WIN32_ATTACHMENT_BLOB_CONFLICT'
    | 'EPOCH2_WIN32_ATTACHMENT_BLOB_MISSING') {
    super(code)
    this.name = 'Win32EpochRootLeaseError'
  }
}

const NATIVE_ERROR_CODES = new Set<Win32EpochRootLeaseError['code']>([
  'EPOCH2_WIN32_NATIVE_INPUT_INVALID',
  'EPOCH2_WIN32_APP_DATA_PATH_UNSAFE',
  'EPOCH2_WIN32_ROOT_OPEN_FAILED',
  'EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED',
  'EPOCH2_WIN32_MUTEX_OPEN_FAILED',
  'EPOCH2_WIN32_MUTEX_WAIT_FAILED',
  'EPOCH2_WIN32_LEASE_BUSY',
  'EPOCH2_WIN32_NT_API_UNAVAILABLE',
  'EPOCH2_WIN32_LOCK_OPEN_FAILED',
  'EPOCH2_WIN32_ROOT_IDENTITY_FAILED',
  'EPOCH2_WIN32_LEASE_RELEASED',
  'EPOCH2_WIN32_TRANSITION_READ_FAILED',
  'EPOCH2_WIN32_TRANSITION_REPARSE_POINT',
  'EPOCH2_WIN32_TRANSITION_FILE_TOO_LARGE',
  'EPOCH2_WIN32_RANDOM_FAILED',
  'EPOCH2_WIN32_RANDOM_COLLISION',
  'EPOCH2_WIN32_ATOMIC_REPLACE_FAILED',
  'EPOCH2_WIN32_TRANSITION_WRITE_FAILED',
  'EPOCH2_WIN32_TRANSITION_FLUSH_FAILED',
  'EPOCH2_WIN32_TRANSITION_RENAME_FAILED',
  'EPOCH2_WIN32_DELETE_TARGET_NOT_ALLOWED',
  'EPOCH2_WIN32_DELETE_OWNERSHIP_INVALID',
  'EPOCH2_WIN32_DELETE_TARGET_OPEN_FAILED',
  'EPOCH2_WIN32_DELETE_REPARSE_POINT',
  'EPOCH2_WIN32_DELETE_ENUMERATION_FAILED',
  'EPOCH2_WIN32_DELETE_ENUMERATION_INVALID',
  'EPOCH2_WIN32_DELETE_TREE_LIMIT_EXCEEDED',
  'EPOCH2_WIN32_DELETE_IDENTITY_FAILED',
  'EPOCH2_WIN32_DELETE_TREE_CHANGED',
  'EPOCH2_WIN32_DELETE_PROTECTED_DESCENDANT',
  'EPOCH2_WIN32_DELETE_API_UNSUPPORTED',
  'EPOCH2_WIN32_DELETE_FAILED',
  'EPOCH2_WIN32_TEMP_NAME_INVALID',
  'EPOCH2_WIN32_TEMP_REPARSE_OR_CHANGED',
  'EPOCH2_WIN32_TEMP_INVALID',
  'EPOCH2_WIN32_CONFIG_OWNERSHIP_INVALID',
  'EPOCH2_WIN32_CONFIG_READ_FAILED',
  'EPOCH2_WIN32_CONFIG_REPARSE_POINT',
  'EPOCH2_WIN32_CONFIG_CHANGED',
  'EPOCH2_WIN32_CONFIG_REPLACE_FAILED',
  'EPOCH2_WIN32_CONFIG_BACKUP_NAME_INVALID',
  'EPOCH2_WIN32_CONFIG_BACKUP_INVALID',
  'EPOCH2_WIN32_EPOCH_ROOT_INVALID',
  'EPOCH2_WIN32_EPOCH_ROOT_CONFLICT',
  'EPOCH2_WIN32_EPOCH_MARKER_INVALID',
  'EPOCH2_WIN32_EPOCH_MARKER_CONFLICT',
  'EPOCH2_WIN32_EPOCH_MARKER_TEMP_INVALID',
  'EPOCH2_WIN32_EPOCH_PHASE_CLOSED',
  'EPOCH2_WIN32_CONFIG_TRANSACTION_CONFLICT',
  'EPOCH2_WIN32_DATABASE_FILE_ROOT_INVALID',
  'EPOCH2_WIN32_DATABASE_FILE_OPEN_FAILED',
  'EPOCH2_WIN32_DATABASE_FILE_MISSING',
  'EPOCH2_WIN32_DATABASE_FILE_INVALID',
  'EPOCH2_WIN32_DATABASE_FILE_CHANGED',
  'EPOCH2_WIN32_DATABASE_FILE_RELEASED',
  'EPOCH2_WIN32_ATTACHMENT_BLOB_HASH_MISMATCH',
  'EPOCH2_WIN32_ATTACHMENT_BLOB_ROOT_INVALID',
  'EPOCH2_WIN32_ATTACHMENT_BLOB_INVALID',
  'EPOCH2_WIN32_ATTACHMENT_BLOB_OPEN_FAILED',
  'EPOCH2_WIN32_ATTACHMENT_BLOB_WRITE_FAILED',
  'EPOCH2_WIN32_ATTACHMENT_BLOB_CONFLICT',
  'EPOCH2_WIN32_ATTACHMENT_BLOB_MISSING',
])

function nativeBinaryPath(): string {
  const resourcesPath = process.resourcesPath
  // `process.defaultApp` is not a stable dev/packaged discriminator for explicit
  // Electron executable launches (including Playwright). A packaged app has its
  // application ASAR under resources; development and E2E launches do not.
  const packagedAsarPath = typeof resourcesPath === 'string' && resourcesPath !== ''
    ? path.join(resourcesPath, 'app.asar')
    : null
  if (packagedAsarPath !== null && fs.existsSync(packagedAsarPath)) {
    return path.join(
      resourcesPath,
      'app.asar.unpacked',
      'dist-native',
      'win32-x64',
      NATIVE_FILE_NAME,
    )
  }
  return path.resolve(process.cwd(), 'dist-native', 'win32-x64', NATIVE_FILE_NAME)
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index])
}

function loadNativeAddon(): NativeAddon {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_REQUIRED')
  }
  let loaded: unknown
  try {
    loaded = createRequire(import.meta.url)(nativeBinaryPath())
  } catch {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_REQUIRED')
  }
  if (!loaded || typeof loaded !== 'object' ||
      !hasExactKeys(loaded, ['acquireEpochRootLease', 'selfTest'])) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
  }
  const candidate = loaded as Partial<NativeAddon>
  if (typeof candidate.selfTest !== 'function' || typeof candidate.acquireEpochRootLease !== 'function') {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
  }
  const selfTest = candidate.selfTest()
  if (!selfTest || typeof selfTest !== 'object' ||
      !hasExactKeys(selfTest, ['napiVersion', 'win32']) ||
      (selfTest as Record<string, unknown>).win32 !== true ||
      typeof (selfTest as Record<string, unknown>).napiVersion !== 'number') {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
  }
  return candidate as NativeAddon
}

function assertExpectedLayout(layout: Epoch2WorkspaceLayout): void {
  try {
    assertEpoch2WorkspaceLayoutAuthority(layout)
  } catch {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
  }
  if (path.basename(layout.productRoot) !== STARVERSE_PRODUCT_DIRECTORY ||
      path.dirname(layout.productRoot) !== layout.appDataRoot ||
      path.basename(layout.transitionRoot) !== TRANSITION_DIRECTORY ||
      path.dirname(layout.transitionRoot) !== layout.productRoot ||
      path.basename(layout.lockPath) !== LOCK_FILE_NAME ||
      path.dirname(layout.lockPath) !== layout.transitionRoot ||
      path.basename(layout.epochRoot) !== STARVERSE_EPOCH_DIRECTORY) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
  }
}

export function createWin32EpochLeaseRequest(layout: Epoch2WorkspaceLayout): Win32EpochLeaseRequest {
  assertExpectedLayout(layout)
  const rootKey = path.resolve(layout.appDataRoot).normalize('NFC').toLowerCase()
  const digest = createHash('sha256')
    .update(`starverse-epoch-2\0${rootKey}`, 'utf8')
    .digest('hex')
  return Object.freeze({
    mutexName: `Local\\Starverse.Epoch2.${digest}`,
    appDataRoot: layout.appDataRoot,
    productDirectory: STARVERSE_PRODUCT_DIRECTORY,
    transitionDirectory: TRANSITION_DIRECTORY,
    lockFileName: LOCK_FILE_NAME,
  })
}

function translateNativeError(error: unknown): never {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
  if (typeof code === 'string' && NATIVE_ERROR_CODES.has(code as Win32EpochRootLeaseError['code'])) {
    throw new Win32EpochRootLeaseError(code as Win32EpochRootLeaseError['code'])
  }
  throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
}

function decodeRootIdentity(value: unknown): Win32EpochRootIdentity {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, [
    'transitionFileId',
    'volumeSerial',
  ])) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
  }
  const record = value as Record<string, unknown>
  if (typeof record.transitionFileId !== 'string' || !/^[0-9a-f]{32}$/.test(record.transitionFileId) ||
      typeof record.volumeSerial !== 'string' || !/^[0-9a-f]{16}$/.test(record.volumeSerial)) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
  }
  return Object.freeze({
    transitionFileId: record.transitionFileId,
    volumeSerial: record.volumeSerial,
  })
}

function isOwnedTargetId(value: unknown): value is Epoch2OwnedTargetId {
  return typeof value === 'string' && (EPOCH2_OWNED_TARGET_IDS as readonly string[]).includes(value)
}

function decodeDeleteSummary(value: unknown): Win32OwnedDeleteSummary {
  if (!value || typeof value !== 'object') {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
  }
  const record = value as Record<string, unknown>
  const expectedKeys = record.exists === false
    ? ['directories', 'exists', 'files']
    : ['directories', 'exists', 'files', 'rootFileId']
  if (!hasExactKeys(record, expectedKeys) ||
      typeof record.exists !== 'boolean' ||
      !Number.isSafeInteger(record.files) || (record.files as number) < 0 ||
      !Number.isSafeInteger(record.directories) || (record.directories as number) < 0 ||
      (record.exists === true &&
        (typeof record.rootFileId !== 'string' || !/^[0-9a-f]{32}$/.test(record.rootFileId))) ||
      (record.exists === false && (record.files !== 0 || record.directories !== 0))) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
  }
  return Object.freeze({
    exists: record.exists,
    files: record.files as number,
    directories: record.directories as number,
    ...(record.exists ? { rootFileId: record.rootFileId as string } : {}),
  })
}

export function acquireWin32EpochRootLease(layout: Epoch2WorkspaceLayout): Win32EpochRootLease {
  const request = createWin32EpochLeaseRequest(layout)
  const addon = loadNativeAddon()
  let nativeLease: NativeLease
  try {
    const acquired = addon.acquireEpochRootLease(request)
    if (!acquired || typeof acquired !== 'object') {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
    const candidate = acquired as Partial<NativeLease>
    if (typeof candidate.rootIdentity !== 'function' ||
        typeof candidate.readTransitionFile !== 'function' ||
        typeof candidate.writeTransitionFile !== 'function' ||
        typeof candidate.readLegacyConfig !== 'function' ||
        typeof candidate.replaceLegacyConfig !== 'function' ||
        typeof candidate.inspectLegacyConfigBackups !== 'function' ||
        typeof candidate.deleteLegacyConfigBackups !== 'function' ||
        typeof candidate.ensureEpochRootMarker !== 'function' ||
        typeof candidate.verifyEpochRootMarker !== 'function' ||
        typeof candidate.acquireEpochDatabaseFile !== 'function' ||
        typeof candidate.putEpochAttachmentBlob !== 'function' ||
        typeof candidate.readEpochAttachmentBlob !== 'function' ||
        typeof candidate.inspectOwnedTarget !== 'function' ||
        typeof candidate.deleteOwnedTarget !== 'function' ||
        typeof candidate.cleanupTransitionTemps !== 'function' ||
        typeof candidate.release !== 'function') {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
    nativeLease = candidate as NativeLease
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  }
  let released = false
  const lease: Win32EpochRootLease = Object.freeze({
    rootIdentity(): Win32EpochRootIdentity {
      if (released) throw new Win32EpochRootLeaseError('EPOCH2_WIN32_LEASE_RELEASED')
      try {
        return decodeRootIdentity(nativeLease.rootIdentity())
      } catch (error) {
        if (error instanceof Win32EpochRootLeaseError) throw error
        return translateNativeError(error)
      }
    },
    readTransitionFile(key: Win32EpochTransitionFileKey): Uint8Array | null {
      if (released) throw new Win32EpochRootLeaseError('EPOCH2_WIN32_LEASE_RELEASED')
      const fact = TRANSITION_FILE_FACTS[key]
      if (!fact) throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
      try {
        const value = nativeLease.readTransitionFile(fact.fileName, fact.maxBytes)
        if (value === null) return null
        if (!Buffer.isBuffer(value) || value.byteLength > fact.maxBytes) {
          throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
        }
        return Uint8Array.from(value)
      } catch (error) {
        if (error instanceof Win32EpochRootLeaseError) throw error
        return translateNativeError(error)
      }
    },
    writeTransitionFile(
      key: Win32EpochTransitionFileKey,
      bytes: Uint8Array,
    ): 'written' | 'exists' {
      if (released) throw new Win32EpochRootLeaseError('EPOCH2_WIN32_LEASE_RELEASED')
      const fact = TRANSITION_FILE_FACTS[key]
      if (!fact || !ArrayBuffer.isView(bytes) ||
          Object.prototype.toString.call(bytes) !== '[object Uint8Array]' ||
          Object.prototype.toString.call(bytes.buffer) === '[object SharedArrayBuffer]' ||
          bytes.byteLength === 0 || bytes.byteLength > fact.maxBytes) {
        throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
      }
      try {
        const result = nativeLease.writeTransitionFile(
          fact.fileName,
          Buffer.from(bytes),
          key === 'reset_journal',
        )
        if (result !== true && result !== false) {
          throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
        }
        return result ? 'written' : 'exists'
      } catch (error) {
        if (error instanceof Win32EpochRootLeaseError) throw error
        return translateNativeError(error)
      }
    },
    release(): void {
      if (released) return
      try {
        for (const authority of EPOCH_DATABASE_AUTHORITIES_BY_LEASE.get(lease) ?? []) {
          authority.release()
        }
        nativeLease.release()
        released = true
        NATIVE_WIN32_EPOCH_LEASES.delete(lease)
      } catch (error) {
        return translateNativeError(error)
      }
    },
  })
  ISSUED_WIN32_EPOCH_LEASES.set(lease, layout)
  NATIVE_WIN32_EPOCH_LEASES.set(lease, nativeLease)
  return lease
}

function nativeLeaseForOwnedOperation(lease: Win32EpochRootLease): NativeLease {
  const nativeLease = NATIVE_WIN32_EPOCH_LEASES.get(lease)
  if (!nativeLease) throw new Win32EpochRootLeaseError('EPOCH2_WIN32_LEASE_RELEASED')
  return nativeLease
}

function readWin32EpochLegacyConfig(
  lease: Win32EpochRootLease,
  operationId: string,
): Readonly<{ bytes: Uint8Array | null; snapshotId: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(operationId)) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
  }
  try {
    const value = nativeLeaseForOwnedOperation(lease).readLegacyConfig(operationId)
    if (!value || typeof value !== 'object' ||
        !hasExactKeys(value, ['bytes', 'snapshotId'])) {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
    const record = value as Record<string, unknown>
    if ((record.bytes !== null &&
          (!Buffer.isBuffer(record.bytes) || record.bytes.byteLength > 1024 * 1024)) ||
        typeof record.snapshotId !== 'string' || !/^[a-f0-9]{32}$/u.test(record.snapshotId)) {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
    return Object.freeze({
      bytes: record.bytes === null ? null : Uint8Array.from(record.bytes as Buffer),
      snapshotId: record.snapshotId,
    })
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  }
}

function replaceWin32EpochLegacyConfig(
  lease: Win32EpochRootLease,
  operationId: string,
  snapshotId: string,
  bytes: Uint8Array,
): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(operationId) ||
      !/^[a-f0-9]{32}$/u.test(snapshotId) || !ArrayBuffer.isView(bytes) ||
      Object.prototype.toString.call(bytes) !== '[object Uint8Array]' ||
      Object.prototype.toString.call(bytes.buffer) === '[object SharedArrayBuffer]' ||
      bytes.byteLength === 0 || bytes.byteLength > 1024 * 1024) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
  }
  try {
    if (nativeLeaseForOwnedOperation(lease).replaceLegacyConfig(
      operationId,
      snapshotId,
      Buffer.from(bytes),
    ) !== true) {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  }
}

function deleteWin32EpochLegacyConfigBackups(
  lease: Win32EpochRootLease,
): number {
  try {
    const removed = nativeLeaseForOwnedOperation(lease).deleteLegacyConfigBackups()
    if (!Number.isSafeInteger(removed) || (removed as number) < 0) {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
    return removed as number
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  }
}

function inspectWin32EpochLegacyConfigBackups(
  lease: Win32EpochRootLease,
): number {
  try {
    const inspected = nativeLeaseForOwnedOperation(lease).inspectLegacyConfigBackups()
    if (!Number.isSafeInteger(inspected) || (inspected as number) < 0) {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
    return inspected as number
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  }
}

export function inspectWin32EpochOwnedTarget(
  lease: Win32EpochRootLease,
  targetId: Epoch2OwnedTargetId,
): Win32OwnedDeleteSummary {
  if (!isOwnedTargetId(targetId)) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
  }
  try {
    return decodeDeleteSummary(nativeLeaseForOwnedOperation(lease).inspectOwnedTarget(targetId))
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  }
}

export function deleteWin32EpochOwnedTarget(
  lease: Win32EpochRootLease,
  targetId: Epoch2OwnedTargetId,
): Win32OwnedDeleteSummary {
  if (!isOwnedTargetId(targetId)) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
  }
  try {
    return decodeDeleteSummary(nativeLeaseForOwnedOperation(lease).deleteOwnedTarget(targetId))
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  }
}

export function cleanupWin32EpochTransitionTemps(lease: Win32EpochRootLease): number {
  try {
    const removed = nativeLeaseForOwnedOperation(lease).cleanupTransitionTemps()
    if (!Number.isSafeInteger(removed) || (removed as number) < 0) {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
    return removed as number
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  }
}

export function assertWin32EpochRootLeaseAuthority(
  lease: unknown,
  layout: Epoch2WorkspaceLayout,
): asserts lease is Win32EpochRootLease {
  assertEpoch2WorkspaceLayoutAuthority(layout)
  if (!lease || typeof lease !== 'object' || ISSUED_WIN32_EPOCH_LEASES.get(lease) !== layout) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
  }
}

export type Epoch2ConfigReplacementAuthority = Readonly<{
  schemaVersion: 1
  byteLength: number
  sha256: string
}>

type IssuedConfigReplacement = Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  bytes: Uint8Array
  snapshotId: string
  operationId: string
  journalPhase: Epoch2ResetPhase
}>

const ISSUED_CONFIG_REPLACEMENTS = new WeakMap<object, IssuedConfigReplacement>()
const legacyConfigDecoder = new TextDecoder('utf-8', { fatal: true })
const projectedConfigEncoder = new TextEncoder()
const persistedResetJournalDecoder = new TextDecoder('utf-8', { fatal: true })

function readPersistedConfigJournal(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>, allowedPhases: ReadonlySet<string>) {
  const bytes = input.lease.readTransitionFile('reset_journal')
  if (bytes === null) throw new Error('EPOCH2_CONFIG_REPLACEMENT_PHASE_INVALID')
  let journal
  try {
    journal = decodeEpoch2ResetJournal(JSON.parse(persistedResetJournalDecoder.decode(bytes)))
    assertEpoch2ResetJournalInventory(journal, input.layout)
  } catch {
    throw new Error('EPOCH2_RESET_JOURNAL_INVALID')
  }
  if (!allowedPhases.has(journal.phase)) {
    throw new Error('EPOCH2_CONFIG_REPLACEMENT_PHASE_INVALID')
  }
  return journal
}

const CONFIG_PHASE_POLICY = Object.freeze({
  prepared: 'prepare_only',
  legacy_files_deleted: 'commit',
  config_replaced: 'commit',
  epoch_root_created: 'commit',
  database_created: 'commit',
  committed: 'commit',
} satisfies Record<Epoch2ResetPhase, 'prepare_only' | 'commit'>)
const CONFIG_PREPARE_PHASES: ReadonlySet<string> = new Set(Object.keys(CONFIG_PHASE_POLICY))
const CONFIG_COMMIT_PHASES: ReadonlySet<string> = new Set(
  Object.entries(CONFIG_PHASE_POLICY)
    .filter(([, policy]) => policy === 'commit')
    .map(([phase]) => phase),
)

function decodeLegacyConfig(bytes: Uint8Array | null): unknown {
  if (bytes === null) return {}
  try {
    return JSON.parse(legacyConfigDecoder.decode(bytes))
  } catch {
    throw new Error('EPOCH2_CONFIG_INVALID')
  }
}

export async function prepareEpoch2ConfigReplacement(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  validateDecrypt: Epoch2CredentialDecryptValidator
}>): Promise<Epoch2ConfigReplacementAuthority> {
  assertWin32EpochRootLeaseAuthority(input.lease, input.layout)
  const journal = readPersistedConfigJournal(input, CONFIG_PREPARE_PHASES)
  const snapshot = readWin32EpochLegacyConfig(input.lease, journal.operationId)
  let rawConfig: unknown
  try {
    rawConfig = decodeLegacyConfig(snapshot.bytes)
  } finally {
    snapshot.bytes?.fill(0)
  }
  const projected = await projectEpoch2Config({
    rawConfig,
    validateDecrypt: input.validateDecrypt,
  })
  const bytes = projectedConfigEncoder.encode(`${JSON.stringify(projected, null, 2)}\n`)
  if (bytes.byteLength === 0 || bytes.byteLength > 1024 * 1024) {
    throw new Error('EPOCH2_CONFIG_INVALID')
  }
  const authority: Epoch2ConfigReplacementAuthority = Object.freeze({
    schemaVersion: 1,
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
  ISSUED_CONFIG_REPLACEMENTS.set(authority, Object.freeze({
    layout: input.layout,
    lease: input.lease,
    bytes: Uint8Array.from(bytes),
    snapshotId: snapshot.snapshotId,
    operationId: journal.operationId,
    journalPhase: journal.phase,
  }))
  return authority
}

export function commitEpoch2ConfigReplacement(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  authority: Epoch2ConfigReplacementAuthority
}>): void {
  assertWin32EpochRootLeaseAuthority(input.lease, input.layout)
  const issued = ISSUED_CONFIG_REPLACEMENTS.get(input.authority)
  if (!issued || issued.layout !== input.layout || issued.lease !== input.lease) {
    throw new Error('EPOCH2_CONFIG_REPLACEMENT_AUTHORITY_INVALID')
  }
  try {
    const journal = readPersistedConfigJournal(input, CONFIG_COMMIT_PHASES)
    const phaseMatches = issued.journalPhase === 'prepared'
      ? journal.phase === 'legacy_files_deleted'
      : journal.phase === issued.journalPhase
    if (journal.operationId !== issued.operationId || !phaseMatches) {
      throw new Error('EPOCH2_CONFIG_REPLACEMENT_AUTHORITY_INVALID')
    }
    replaceWin32EpochLegacyConfig(
      input.lease,
      issued.operationId,
      issued.snapshotId,
      issued.bytes,
    )
  } finally {
    issued.bytes.fill(0)
    ISSUED_CONFIG_REPLACEMENTS.delete(input.authority)
  }
}

export function disposeEpoch2ConfigReplacementAuthority(
  authority: Epoch2ConfigReplacementAuthority,
): void {
  const issued = ISSUED_CONFIG_REPLACEMENTS.get(authority)
  if (!issued) return
  issued.bytes.fill(0)
  ISSUED_CONFIG_REPLACEMENTS.delete(authority)
}

export function deleteEpoch2LegacyConfigBackups(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): number {
  assertWin32EpochRootLeaseAuthority(input.lease, input.layout)
  readPersistedConfigJournal(input, CONFIG_COMMIT_PHASES)
  return deleteWin32EpochLegacyConfigBackups(input.lease)
}

export function inspectEpoch2LegacyConfigBackups(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): number {
  assertWin32EpochRootLeaseAuthority(input.lease, input.layout)
  readPersistedConfigJournal(input, CONFIG_PREPARE_PHASES)
  return inspectWin32EpochLegacyConfigBackups(input.lease)
}

export type Epoch2RootAuthority = Readonly<{
  schemaVersion: 1
  volumeSerial: string
  workspaceFileId: string
  epochFileId: string
  markerFileId: string
}>

const ISSUED_EPOCH2_ROOT_AUTHORITIES = new WeakMap<object, Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>>()
const CURRENT_EPOCH2_ROOT_AUTHORITY_BY_LEASE = new WeakMap<Win32EpochRootLease, object>()

function decodeEpoch2RootAuthorityResult(value: unknown): Epoch2RootAuthority {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('EPOCH2_WIN32_EPOCH_ROOT_INVALID')
  }
  const raw = value as Record<string, unknown>
  if (Object.keys(raw).sort().join('\0') !== [
    'epochFileId',
    'markerFileId',
    'volumeSerial',
    'workspaceFileId',
  ].join('\0') || typeof raw.volumeSerial !== 'string' ||
      typeof raw.workspaceFileId !== 'string' || typeof raw.epochFileId !== 'string' ||
      typeof raw.markerFileId !== 'string' || !/^[0-9a-f]{16}$/u.test(raw.volumeSerial) ||
      !/^[0-9a-f]{32}$/u.test(raw.workspaceFileId) ||
      !/^[0-9a-f]{32}$/u.test(raw.epochFileId) ||
      !/^[0-9a-f]{32}$/u.test(raw.markerFileId)) {
    throw new Error('EPOCH2_WIN32_EPOCH_ROOT_INVALID')
  }
  return Object.freeze({
    schemaVersion: 1,
    volumeSerial: raw.volumeSerial,
    workspaceFileId: raw.workspaceFileId,
    epochFileId: raw.epochFileId,
    markerFileId: raw.markerFileId,
  })
}

function issueEpoch2RootAuthority(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  mode: 'ensure' | 'verify'
}>): Epoch2RootAuthority {
  assertWin32EpochRootLeaseAuthority(input.lease, input.layout)
  const previous = CURRENT_EPOCH2_ROOT_AUTHORITY_BY_LEASE.get(input.lease)
  if (previous) ISSUED_EPOCH2_ROOT_AUTHORITIES.delete(previous)
  CURRENT_EPOCH2_ROOT_AUTHORITY_BY_LEASE.delete(input.lease)
  try {
    const nativeLease = nativeLeaseForOwnedOperation(input.lease)
    const authority = decodeEpoch2RootAuthorityResult(input.mode === 'ensure'
      ? nativeLease.ensureEpochRootMarker()
      : nativeLease.verifyEpochRootMarker())
    ISSUED_EPOCH2_ROOT_AUTHORITIES.set(authority, Object.freeze({
      layout: input.layout,
      lease: input.lease,
    }))
    CURRENT_EPOCH2_ROOT_AUTHORITY_BY_LEASE.set(input.lease, authority)
    return authority
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  }
}

export function ensureEpoch2RootAuthority(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): Epoch2RootAuthority {
  return issueEpoch2RootAuthority({ ...input, mode: 'ensure' })
}

export function verifyEpoch2RootAuthority(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): Epoch2RootAuthority {
  return issueEpoch2RootAuthority({ ...input, mode: 'verify' })
}

export function assertEpoch2RootAuthority(
  authority: unknown,
  input: Readonly<{
    layout: Epoch2WorkspaceLayout
    lease: Win32EpochRootLease
  }>,
): asserts authority is Epoch2RootAuthority {
  const issued = authority && typeof authority === 'object'
    ? ISSUED_EPOCH2_ROOT_AUTHORITIES.get(authority)
    : undefined
  if (!issued || issued.layout !== input.layout || issued.lease !== input.lease ||
      CURRENT_EPOCH2_ROOT_AUTHORITY_BY_LEASE.get(input.lease) !== authority) {
    throw new Error('EPOCH2_WIN32_EPOCH_ROOT_INVALID')
  }
  input.lease.rootIdentity()
}

export type Win32EpochDatabaseFileMode = 'create_or_open' | 'verify_existing'

export type Win32EpochDatabaseFileIdentity = Readonly<{
  volumeSerial: string
  databaseFileId: string
  sizeBytes: bigint
  created: boolean
}>

export interface Win32EpochDatabaseFileAuthority {
  identity(): Win32EpochDatabaseFileIdentity
  verifyPathIdentity(): Win32EpochDatabaseFileIdentity
  release(): void
}

const NATIVE_EPOCH_DATABASE_AUTHORITIES = new WeakMap<object, NativeEpochDatabaseFileAuthority>()
const EPOCH_DATABASE_AUTHORITY_BINDINGS = new WeakMap<object, Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  rootAuthority: Epoch2RootAuthority
}>>()
const EPOCH_DATABASE_AUTHORITIES_BY_LEASE = new WeakMap<
  Win32EpochRootLease,
  Set<Win32EpochDatabaseFileAuthority>
>()

function decodeEpochDatabaseFileIdentity(value: unknown): Win32EpochDatabaseFileIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !hasExactKeys(value, ['created', 'databaseFileId', 'sizeBytes', 'volumeSerial'])) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
  }
  const raw = value as Record<string, unknown>
  if (typeof raw.volumeSerial !== 'string' || !/^[0-9a-f]{16}$/u.test(raw.volumeSerial) ||
      typeof raw.databaseFileId !== 'string' || !/^[0-9a-f]{32}$/u.test(raw.databaseFileId) ||
      typeof raw.sizeBytes !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(raw.sizeBytes) ||
      typeof raw.created !== 'boolean') {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
  }
  let sizeBytes: bigint
  try { sizeBytes = BigInt(raw.sizeBytes) } catch {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
  }
  return Object.freeze({
    volumeSerial: raw.volumeSerial,
    databaseFileId: raw.databaseFileId,
    sizeBytes,
    created: raw.created,
  })
}

function nativeEpochDatabaseAuthority(
  authority: Win32EpochDatabaseFileAuthority,
): NativeEpochDatabaseFileAuthority {
  const native = NATIVE_EPOCH_DATABASE_AUTHORITIES.get(authority)
  if (!native) throw new Win32EpochRootLeaseError('EPOCH2_WIN32_DATABASE_FILE_RELEASED')
  return native
}

export function acquireWin32EpochDatabaseFileAuthority(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  rootAuthority: Epoch2RootAuthority
  mode: Win32EpochDatabaseFileMode
}>): Win32EpochDatabaseFileAuthority {
  assertEpoch2RootAuthority(input.rootAuthority, input)
  if (input.mode !== 'create_or_open' && input.mode !== 'verify_existing') {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
  }
  let native: NativeEpochDatabaseFileAuthority
  try {
    const value = nativeLeaseForOwnedOperation(input.lease).acquireEpochDatabaseFile(input.mode)
    if (!value || typeof value !== 'object') {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
    const candidate = value as Partial<NativeEpochDatabaseFileAuthority>
    if (typeof candidate.identity !== 'function' ||
        typeof candidate.verifyPathIdentity !== 'function' ||
        typeof candidate.release !== 'function') {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
    native = candidate as NativeEpochDatabaseFileAuthority
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  }
  let released = false
  const authority: Win32EpochDatabaseFileAuthority = Object.freeze({
    identity(): Win32EpochDatabaseFileIdentity {
      assertWin32EpochDatabaseFileAuthority(authority, input)
      try { return decodeEpochDatabaseFileIdentity(nativeEpochDatabaseAuthority(authority).identity()) } catch (error) {
        if (error instanceof Win32EpochRootLeaseError) throw error
        return translateNativeError(error)
      }
    },
    verifyPathIdentity(): Win32EpochDatabaseFileIdentity {
      assertWin32EpochDatabaseFileAuthority(authority, input)
      try {
        return decodeEpochDatabaseFileIdentity(
          nativeEpochDatabaseAuthority(authority).verifyPathIdentity(),
        )
      } catch (error) {
        if (error instanceof Win32EpochRootLeaseError) throw error
        return translateNativeError(error)
      }
    },
    release(): void {
      if (released) return
      try { native.release() } catch (error) { return translateNativeError(error) }
      released = true
      NATIVE_EPOCH_DATABASE_AUTHORITIES.delete(authority)
      EPOCH_DATABASE_AUTHORITY_BINDINGS.delete(authority)
      EPOCH_DATABASE_AUTHORITIES_BY_LEASE.get(input.lease)?.delete(authority)
    },
  })
  NATIVE_EPOCH_DATABASE_AUTHORITIES.set(authority, native)
  EPOCH_DATABASE_AUTHORITY_BINDINGS.set(authority, Object.freeze({
    layout: input.layout,
    lease: input.lease,
    rootAuthority: input.rootAuthority,
  }))
  const authorities = EPOCH_DATABASE_AUTHORITIES_BY_LEASE.get(input.lease) ?? new Set()
  authorities.add(authority)
  EPOCH_DATABASE_AUTHORITIES_BY_LEASE.set(input.lease, authorities)
  try { authority.identity() } catch (error) {
    authority.release()
    throw error
  }
  return authority
}

export function assertWin32EpochDatabaseFileAuthority(
  authority: unknown,
  input: Readonly<{
    layout: Epoch2WorkspaceLayout
    lease: Win32EpochRootLease
    rootAuthority: Epoch2RootAuthority
  }>,
): asserts authority is Win32EpochDatabaseFileAuthority {
  const candidate = authority && typeof authority === 'object' ? authority : null
  const binding = candidate ? EPOCH_DATABASE_AUTHORITY_BINDINGS.get(candidate) : undefined
  if (!candidate || !binding || binding.layout !== input.layout || binding.lease !== input.lease ||
      binding.rootAuthority !== input.rootAuthority ||
      !NATIVE_EPOCH_DATABASE_AUTHORITIES.has(candidate)) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_DATABASE_FILE_RELEASED')
  }
  assertEpoch2RootAuthority(input.rootAuthority, input)
}

function assertEpochAttachmentBlobReference(input: Readonly<{
  storageRef: unknown
  sha256: unknown
  sizeBytes: unknown
}>): asserts input is Readonly<{
  storageRef: string
  sha256: string
  sizeBytes: number
}> {
  if (typeof input.storageRef !== 'string' || typeof input.sha256 !== 'string' ||
      typeof input.sizeBytes !== 'number' || !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes < 0 || !/^[0-9a-f]{64}$/u.test(input.sha256) ||
      input.storageRef !== `sha256/${input.sha256.slice(0, 2)}/${input.sha256}`) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
  }
}

function ownedAttachmentBuffer(bytes: Uint8Array): Buffer {
  // Vitest/Electron can provide Buffer values from a different realm, so rely
  // on Node's intrinsic Buffer brand before the local Uint8Array fallback.
  if ((!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) ||
      !Number.isSafeInteger(bytes.byteLength) || bytes.byteLength < 0) {
    throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
  }
  return Buffer.from(bytes)
}

/**
 * Stores one immutable blob beneath epoch-2/assets using only native
 * handle-relative operations. The storage ref is a closed digest namespace,
 * never an arbitrary filesystem path.
 */
export function putWin32EpochAttachmentBlob(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  rootAuthority: Epoch2RootAuthority
  storageRef: string
  sha256: string
  bytes: Uint8Array
}>): 'written' | 'exists' {
  assertEpoch2RootAuthority(input.rootAuthority, input)
  const owned = ownedAttachmentBuffer(input.bytes)
  try {
    assertEpochAttachmentBlobReference({
      storageRef: input.storageRef,
      sha256: input.sha256,
      sizeBytes: owned.byteLength,
    })
    const result = nativeLeaseForOwnedOperation(input.lease).putEpochAttachmentBlob(
      input.storageRef, input.sha256, owned,
    )
    if (typeof result !== 'boolean') {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
    return result ? 'written' : 'exists'
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  } finally {
    owned.fill(0)
  }
}

/**
 * Reads an immutable blob only after native verification of the root marker,
 * canonical digest path, no-reparse/single-link file facts, byte count and
 * SHA-256. The caller owns the returned copy and must dispose it promptly.
 */
export function readWin32EpochAttachmentBlob(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  rootAuthority: Epoch2RootAuthority
  storageRef: string
  sha256: string
  sizeBytes: number
}>): Uint8Array {
  assertEpoch2RootAuthority(input.rootAuthority, input)
  assertEpochAttachmentBlobReference(input)
  try {
    const value = nativeLeaseForOwnedOperation(input.lease).readEpochAttachmentBlob(
      input.storageRef, input.sha256, input.sizeBytes,
    )
    if (!Buffer.isBuffer(value) || value.byteLength !== input.sizeBytes) {
      throw new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
    }
    const copy = Uint8Array.from(value)
    value.fill(0)
    return copy
  } catch (error) {
    if (error instanceof Win32EpochRootLeaseError) throw error
    return translateNativeError(error)
  }
}
