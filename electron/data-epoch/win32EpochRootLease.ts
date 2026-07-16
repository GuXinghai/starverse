import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import {
  assertEpoch2WorkspaceLayoutAuthority,
  STARVERSE_EPOCH_DIRECTORY,
  STARVERSE_PRODUCT_DIRECTORY,
  type Epoch2WorkspaceLayout,
} from './rootManifest'

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
  inspectOwnedTarget(targetId: string): unknown
  deleteOwnedTarget(targetId: string): unknown
  cleanupTransitionTemps(): unknown
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
    | 'EPOCH2_WIN32_TEMP_INVALID') {
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
])

function nativeBinaryPath(): string {
  const resourcesPath = process.resourcesPath
  if (process.defaultApp !== true && typeof resourcesPath === 'string' && resourcesPath !== '') {
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
