import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createEpoch2RootManifest, type Epoch2WorkspaceLayout } from './rootManifest'

type FileIdentity = Readonly<{ dev: bigint; ino: bigint; size: bigint; created: boolean }>
type ConfigSnapshot = Readonly<{ operationId: string; snapshotId: string; sourcePath: string; exists: boolean; fingerprint: string }>
type ProcessLeaseOwner = Readonly<{ pid: number; token: string; bootId: string; processStartId: string }>

const FALLBACK_BOOT_ID = `process-boot-${randomBytes(16).toString('hex')}`
const FALLBACK_PROCESS_START_ID = `process-start-${randomBytes(16).toString('hex')}`

const OWNED_TARGET_NAMES = Object.freeze({
  legacy_chat_db: 'chat.db', legacy_chat_db_wal: 'chat.db-wal', legacy_chat_db_shm: 'chat.db-shm',
  legacy_chat_db_journal: 'chat.db-journal', legacy_assets: 'assets', legacy_engine_plugins: 'engine-plugins',
  legacy_managed_runtimes: 'managed-runtimes', legacy_debug: 'debug', legacy_logs: 'logs', legacy_temp: 'temp',
  legacy_workspace: 'workspace',
} as const)

function isLegacyConfigBackupName(name: string): boolean {
  if (/^config\.backup\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/u.test(name)) return true
  return /^config\.json\.corrupted\.(?:invalid-format|parse-error)\.[1-9]\d{12}\.bak$/u.test(name)
}

function fail(code: string): never {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  throw error
}

function hex(value: bigint, width: number): string {
  return value.toString(16).padStart(width, '0').slice(-width)
}

function identity(target: string, expected: 'file' | 'directory', created = false): FileIdentity {
  let stat: fs.BigIntStats
  try { stat = fs.lstatSync(target, { bigint: true }) } catch { return fail('EPOCH2_POSIX_PATH_INVALID') }
  if (stat.isSymbolicLink() || (expected === 'file' ? !stat.isFile() || stat.nlink !== 1n : !stat.isDirectory()) || stat.nlink < 1n ||
      (typeof process.getuid === 'function' && stat.uid !== BigInt(process.getuid()))) {
    return fail('EPOCH2_POSIX_PATH_INVALID')
  }
  return Object.freeze({ dev: stat.dev, ino: stat.ino, size: stat.size, created })
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function ensureDirectory(target: string): FileIdentity {
  try { fs.mkdirSync(target, { recursive: false, mode: 0o700 }) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return fail('EPOCH2_POSIX_PATH_INVALID')
  }
  const value = identity(target, 'directory')
  try { fs.chmodSync(target, 0o700) } catch { return fail('EPOCH2_POSIX_PATH_INVALID') }
  return value
}

function readBounded(target: string, maxBytes: number): Buffer | null {
  try { fs.lstatSync(target) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    return fail('EPOCH2_POSIX_PATH_INVALID')
  }
  try {
    const value = identity(target, 'file')
    if (value.size > BigInt(maxBytes)) return fail('EPOCH2_POSIX_FILE_TOO_LARGE')
    const bytes = fs.readFileSync(target)
    const after = identity(target, 'file')
    if (!sameIdentity(value, after) || bytes.byteLength > maxBytes) return fail('EPOCH2_POSIX_PATH_CHANGED')
    return bytes
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function atomicWrite(target: string, bytes: Buffer, replaceExisting: boolean): boolean {
  const directory = path.dirname(target)
  const temp = path.join(directory, `.svtmp-${randomBytes(16).toString('hex')}`)
  let descriptor: number | undefined
  try {
    if (!replaceExisting && fs.existsSync(target)) return false
    descriptor = fs.openSync(temp, 'wx', 0o600)
    fs.writeFileSync(descriptor, bytes)
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor); descriptor = undefined
    if (replaceExisting) {
      fs.renameSync(temp, target)
    } else {
      try { fs.linkSync(temp, target) } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
        throw error
      }
      fs.unlinkSync(temp)
    }
    fs.chmodSync(target, 0o600)
    if (process.platform !== 'win32') {
      const directoryFd = fs.openSync(directory, 'r')
      try { fs.fsyncSync(directoryFd) } finally { fs.closeSync(directoryFd) }
    }
    identity(target, 'file')
    return true
  } catch { return fail('EPOCH2_POSIX_ATOMIC_WRITE_FAILED') }
  finally {
    if (descriptor !== undefined) try { fs.closeSync(descriptor) } catch { /* terminal cleanup */ }
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp) } catch { /* terminal cleanup */ }
  }
}

function fingerprint(target: string): string {
  const bytes = readBounded(target, 1024 * 1024)
  return bytes === null ? 'missing' : createHash('sha256').update(bytes).digest('hex')
}

function linuxBootId(): string {
  if (process.platform !== 'linux') return FALLBACK_BOOT_ID
  try { return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() } catch { return fail('EPOCH2_POSIX_LEASE_IDENTITY_UNAVAILABLE') }
}

function processStartId(pid: number): string | null {
  if (!Number.isSafeInteger(pid) || pid < 1) return null
  if (process.platform !== 'linux') return pid === process.pid ? FALLBACK_PROCESS_START_ID : null
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/u)
    return fields[19] && /^\d+$/u.test(fields[19]) ? fields[19] : null
  } catch { return null }
}

function currentLeaseOwner(token: string): ProcessLeaseOwner {
  const start = processStartId(process.pid)
  if (!start) return fail('EPOCH2_POSIX_LEASE_IDENTITY_UNAVAILABLE')
  return Object.freeze({ pid: process.pid, token, bootId: linuxBootId(), processStartId: start })
}

function liveProcess(owner: Partial<ProcessLeaseOwner>): boolean {
  if (typeof owner.pid !== 'number' || typeof owner.bootId !== 'string' || typeof owner.processStartId !== 'string') return false
  return owner.bootId === linuxBootId() && processStartId(owner.pid) === owner.processStartId
}

function acquireProcessLease(layout: Epoch2WorkspaceLayout): Readonly<{ directory: string; token: string; release: () => void }> {
  const directory = `${layout.lockPath}.lease`
  const token = randomBytes(32).toString('hex')
  const currentOwner = currentLeaseOwner(token)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = `${directory}.${token}.${attempt}`
    const candidateOwner = path.join(candidate, 'owner.json')
    try {
      fs.mkdirSync(candidate, { mode: 0o700 })
      fs.writeFileSync(candidateOwner, `${JSON.stringify(currentOwner)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      fs.renameSync(candidate, directory)
      const ownerPath = path.join(directory, 'owner.json')
      identity(directory, 'directory'); identity(ownerPath, 'file')
      return Object.freeze({ directory, token, release: () => {
        try {
          const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8')) as Partial<ProcessLeaseOwner>
          if (owner.pid === currentOwner.pid && owner.token === token && owner.bootId === currentOwner.bootId &&
              owner.processStartId === currentOwner.processStartId) fs.rmSync(directory, { recursive: true })
        } catch { /* a replaced lease is never deleted */ }
      } })
    } catch (error) {
      try { if (fs.existsSync(candidate)) fs.rmSync(candidate, { recursive: true }) } catch { /* candidate is non-authoritative */ }
      if (!fs.existsSync(directory)) return fail('EPOCH2_POSIX_LEASE_OPEN_FAILED')
      try {
        const stat = fs.lstatSync(directory)
        if (stat.isSymbolicLink() || !stat.isDirectory()) return fail('EPOCH2_POSIX_LEASE_INVALID')
        const ownerPath = path.join(directory, 'owner.json')
        const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8')) as Partial<ProcessLeaseOwner>
        if (liveProcess(owner)) return fail('EPOCH2_POSIX_LEASE_BUSY')
        const quarantine = `${directory}.stale.${token}.${attempt}`
        fs.renameSync(directory, quarantine)
        fs.rmSync(quarantine, { recursive: true })
      } catch (inspectionError) {
        if (inspectionError instanceof Error && inspectionError.message === 'EPOCH2_POSIX_LEASE_BUSY') throw inspectionError
        return fail('EPOCH2_POSIX_LEASE_INVALID')
      }
    }
  }
  return fail('EPOCH2_POSIX_LEASE_BUSY')
}

function inspectTree(target: string): Readonly<{ exists: boolean; files: number; directories: number; rootFileId?: string }> {
  if (!fs.existsSync(target)) return Object.freeze({ exists: false, files: 0, directories: 0 })
  const root = fs.lstatSync(target, { bigint: true })
  if (root.isSymbolicLink()) return fail('EPOCH2_POSIX_DELETE_TARGET_INVALID')
  let files = 0; let directories = 0
  const visit = (value: string): void => {
    const stat = fs.lstatSync(value)
    if (stat.isSymbolicLink()) return fail('EPOCH2_POSIX_DELETE_TARGET_INVALID')
    if (stat.isDirectory()) {
      directories += 1
      for (const child of fs.readdirSync(value)) visit(path.join(value, child))
    } else if (stat.isFile()) files += 1
    else return fail('EPOCH2_POSIX_DELETE_TARGET_INVALID')
  }
  visit(target)
  return Object.freeze({ exists: true, files, directories, rootFileId: hex(root.ino, 32) })
}

function deleteTree(target: string): ReturnType<typeof inspectTree> {
  const summary = inspectTree(target)
  if (!summary.exists) return summary
  const remove = (value: string): void => {
    const stat = fs.lstatSync(value)
    if (stat.isSymbolicLink()) return fail('EPOCH2_POSIX_DELETE_TARGET_INVALID')
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(value)) remove(path.join(value, child))
      fs.rmdirSync(value)
    } else if (stat.isFile()) fs.unlinkSync(value)
    else return fail('EPOCH2_POSIX_DELETE_TARGET_INVALID')
  }
  remove(target)
  return summary
}

/** Raw POSIX backend consumed by the platform-neutral authority wrapper. */
export function createPosixEpochNativeLease(layout: Epoch2WorkspaceLayout): object {
  if (process.platform !== 'linux') {
    // Tests may exercise this backend explicitly on another host through the
    // platform facade; filesystem semantics used here remain POSIX-style.
  }
  identity(layout.appDataRoot, 'directory')
  ensureDirectory(layout.productRoot)
  const transitionIdentity = ensureDirectory(layout.transitionRoot)
  const processLease = acquireProcessLease(layout)
  const expectedManifest = `${JSON.stringify(createEpoch2RootManifest({ layout }), null, 2)}\n`
  let released = false
  let configSnapshot: ConfigSnapshot | undefined
  const databaseAuthorities = new Set<{ release: () => void }>()
  const assertCurrent = (): void => {
    if (released) return fail('EPOCH2_POSIX_LEASE_RELEASED')
    if (!sameIdentity(transitionIdentity, identity(layout.transitionRoot, 'directory'))) return fail('EPOCH2_POSIX_PATH_CHANGED')
  }
  const transitionPath = (name: string): string => {
    if (name !== 'root-manifest.json' && name !== 'epoch-transition.journal.json') return fail('EPOCH2_POSIX_INPUT_INVALID')
    return path.join(layout.transitionRoot, name)
  }
  const rootResult = () => {
    const workspace = identity(layout.workspaceRoot, 'directory')
    const epoch = identity(layout.epochRoot, 'directory')
    const marker = identity(layout.markerPath, 'file')
    if (readBounded(layout.markerPath, 4 * 1024)?.toString('utf8') !== expectedManifest) return fail('EPOCH2_POSIX_EPOCH_ROOT_INVALID')
    return Object.freeze({ volumeSerial: hex(workspace.dev, 16), workspaceFileId: hex(workspace.ino, 32),
      epochFileId: hex(epoch.ino, 32), markerFileId: hex(marker.ino, 32) })
  }
  const lease = {
    rootIdentity: () => { assertCurrent(); return Object.freeze({ volumeSerial: hex(transitionIdentity.dev, 16), transitionFileId: hex(transitionIdentity.ino, 32) }) },
    readTransitionFile: (name: string, maxBytes: number) => { assertCurrent(); return readBounded(transitionPath(name), maxBytes) },
    writeTransitionFile: (name: string, bytes: Buffer, replaceExisting: boolean) => { assertCurrent(); return atomicWrite(transitionPath(name), bytes, replaceExisting) },
    readLegacyConfig: (operationId: string) => {
      assertCurrent()
      const rollback = path.join(layout.transitionRoot, `.svcfg-old-${operationId}`)
      const sourcePath = fs.existsSync(rollback) ? rollback : path.join(layout.productRoot, 'config.json')
      const bytes = readBounded(sourcePath, 1024 * 1024)
      const snapshotId = randomBytes(16).toString('hex')
      configSnapshot = Object.freeze({ operationId, snapshotId, sourcePath, exists: bytes !== null, fingerprint: fingerprint(sourcePath) })
      return Object.freeze({ bytes, snapshotId })
    },
    replaceLegacyConfig: (operationId: string, snapshotId: string, bytes: Buffer) => {
      assertCurrent()
      const snapshot = configSnapshot
      if (!snapshot || snapshot.operationId !== operationId || snapshot.snapshotId !== snapshotId ||
          fingerprint(snapshot.sourcePath) !== snapshot.fingerprint) return fail('EPOCH2_POSIX_CONFIG_CHANGED')
      const configPath = path.join(layout.productRoot, 'config.json')
      const rollback = path.join(layout.transitionRoot, `.svcfg-old-${operationId}`)
      if (snapshot.sourcePath === rollback && fs.existsSync(configPath)) {
        const published = readBounded(configPath, 1024 * 1024)
        if (!published || !published.equals(bytes)) return fail('EPOCH2_POSIX_CONFIG_CHANGED')
        fs.unlinkSync(rollback); configSnapshot = undefined; return true
      }
      if (snapshot.exists && snapshot.sourcePath === configPath) fs.renameSync(configPath, rollback)
      if (!atomicWrite(configPath, bytes, false)) return fail('EPOCH2_POSIX_CONFIG_CHANGED')
      if (snapshot.sourcePath === rollback && fs.existsSync(rollback)) fs.unlinkSync(rollback)
      configSnapshot = undefined
      return true
    },
    inspectLegacyConfigBackups: () => {
      assertCurrent()
      const names = fs.readdirSync(layout.productRoot)
      if (names.some((name) => (/^config\.backup\.|^config\.json\.corrupted\./u.test(name)) && !isLegacyConfigBackupName(name))) {
        return fail('EPOCH2_POSIX_CONFIG_BACKUP_INVALID')
      }
      return names.filter(isLegacyConfigBackupName).length
    },
    deleteLegacyConfigBackups: () => {
      assertCurrent(); let removed = 0
      const names = fs.readdirSync(layout.productRoot)
      if (names.some((name) => (/^config\.backup\.|^config\.json\.corrupted\./u.test(name)) && !isLegacyConfigBackupName(name))) {
        return fail('EPOCH2_POSIX_CONFIG_BACKUP_INVALID')
      }
      for (const name of names) if (isLegacyConfigBackupName(name)) {
        const target = path.join(layout.productRoot, name); identity(target, 'file'); fs.unlinkSync(target); removed += 1
      }
      return removed
    },
    ensureEpochRootMarker: () => {
      assertCurrent(); ensureDirectory(layout.workspaceRoot); ensureDirectory(layout.epochRoot)
      if (fs.readdirSync(layout.workspaceRoot).some((name) => name !== path.basename(layout.epochRoot))) return fail('EPOCH2_POSIX_EPOCH_ROOT_CONFLICT')
      for (const name of fs.readdirSync(layout.epochRoot)) {
        if (name === path.basename(layout.markerPath)) continue
        if (!/^\.sv(?:tmp|marker)-[0-9a-f]{32}$/u.test(name)) return fail('EPOCH2_POSIX_EPOCH_ROOT_CONFLICT')
        const target = path.join(layout.epochRoot, name); identity(target, 'file'); fs.unlinkSync(target)
      }
      if (!fs.existsSync(layout.markerPath)) atomicWrite(layout.markerPath, Buffer.from(expectedManifest, 'utf8'), false)
      return rootResult()
    },
    verifyEpochRootMarker: () => { assertCurrent(); return rootResult() },
    acquireEpochDatabaseFile: (mode: string) => {
      assertCurrent(); rootResult()
      const existed = fs.existsSync(layout.databasePath)
      if (mode === 'verify_existing' && !existed) return fail('EPOCH2_POSIX_DATABASE_FILE_MISSING')
      const descriptor = fs.openSync(layout.databasePath, existed ? 'r+' : 'wx+', 0o600)
      fs.chmodSync(layout.databasePath, 0o600)
      const original = identity(layout.databasePath, 'file', !existed)
      let databaseReleased = false
      const verify = () => {
        if (databaseReleased || released) return fail('EPOCH2_POSIX_DATABASE_FILE_RELEASED')
        const current = identity(layout.databasePath, 'file', original.created)
        const descriptorStat = fs.fstatSync(descriptor, { bigint: true })
        if (!sameIdentity(original, current) || descriptorStat.dev !== original.dev || descriptorStat.ino !== original.ino || descriptorStat.nlink !== 1n) {
          return fail('EPOCH2_POSIX_DATABASE_FILE_CHANGED')
        }
        return Object.freeze({ volumeSerial: hex(current.dev, 16), databaseFileId: hex(current.ino, 32),
          sizeBytes: current.size.toString(), created: original.created })
      }
      const authority = { identity: verify, verifyPathIdentity: verify, release: () => {
        if (databaseReleased) return; databaseReleased = true; databaseAuthorities.delete(authority); fs.closeSync(descriptor)
      } }
      databaseAuthorities.add(authority)
      verify()
      return authority
    },
    putEpochAttachmentBlob: (storageRef: string, sha256: string, bytes: Buffer) => {
      assertCurrent(); rootResult()
      const target = path.join(layout.assetsRoot, ...storageRef.split('/'))
      ensureDirectory(layout.assetsRoot); ensureDirectory(path.join(layout.assetsRoot, 'sha256')); ensureDirectory(path.dirname(target))
      if (createHash('sha256').update(bytes).digest('hex') !== sha256) return fail('EPOCH2_POSIX_ATTACHMENT_HASH_MISMATCH')
      if (fs.existsSync(target)) {
        const current = readBounded(target, bytes.byteLength)
        if (!current || !current.equals(bytes)) return fail('EPOCH2_POSIX_ATTACHMENT_CONFLICT')
        return false
      }
      atomicWrite(target, bytes, false); return true
    },
    readEpochAttachmentBlob: (storageRef: string, sha256: string, sizeBytes: number) => {
      assertCurrent(); rootResult()
      const target = path.join(layout.assetsRoot, ...storageRef.split('/'))
      const bytes = readBounded(target, sizeBytes)
      if (!bytes || bytes.byteLength !== sizeBytes || createHash('sha256').update(bytes).digest('hex') !== sha256) return fail('EPOCH2_POSIX_ATTACHMENT_INVALID')
      return bytes
    },
    inspectOwnedTarget: (targetId: keyof typeof OWNED_TARGET_NAMES) => { assertCurrent(); return inspectTree(path.join(layout.productRoot, OWNED_TARGET_NAMES[targetId])) },
    deleteOwnedTarget: (targetId: keyof typeof OWNED_TARGET_NAMES) => { assertCurrent(); return deleteTree(path.join(layout.productRoot, OWNED_TARGET_NAMES[targetId])) },
    cleanupTransitionTemps: () => {
      assertCurrent(); let removed = 0
      for (const name of fs.readdirSync(layout.transitionRoot)) if (/^\.svtmp-[0-9a-f]{32}$/u.test(name)) {
        const target = path.join(layout.transitionRoot, name); identity(target, 'file'); fs.unlinkSync(target); removed += 1
      }
      return removed
    },
    release: () => {
      if (released) return
      for (const authority of [...databaseAuthorities]) authority.release()
      released = true; processLease.release()
    },
  }
  return Object.freeze(lease)
}
