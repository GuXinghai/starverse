import { createHash, randomBytes } from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'
import { readEpoch2ResetJournal } from './resetJournalStore'
import type { Epoch2WorkspaceLayout } from './rootManifest'
import {
  assertWin32EpochRootLeaseAuthority,
  verifyEpoch2RootAuthority,
  type Win32EpochRootLease,
} from './win32EpochRootLease'

export const EPOCH2_CONFIG_FILE_NAME = 'config.json' as const
export const EPOCH2_CONFIG_RECOVERY_BACKUP_ROOT = 'epoch-2-recovery-backups' as const
const FRESH_CONFIG_TEXT = '{}\n'
const configDecoder = new TextDecoder('utf-8', { fatal: true })

export type Epoch2ConfigRecoveryErrorCode =
  | 'EPOCH2_CONFIG_CORRUPT'
  | 'EPOCH2_CONFIG_RECOVERY_JOURNAL_INVALID'
  | 'EPOCH2_CONFIG_RECOVERY_NOT_CORRUPT'
  | 'EPOCH2_CONFIG_RECOVERY_BACKUP_FAILED'
  | 'EPOCH2_CONFIG_RECOVERY_INSTALL_FAILED'

export class Epoch2ConfigRecoveryError extends Error {
  constructor(readonly code: Epoch2ConfigRecoveryErrorCode) {
    super(code)
    this.name = 'Epoch2ConfigRecoveryError'
  }
}

export type Epoch2ConfigInspection =
  | Readonly<{ state: 'missing' }>
  | Readonly<{ state: 'valid' }>
  | Readonly<{ state: 'corrupt' }>

function isPlainObjectJson(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch {
    return false
  }
}

/** Reads config.json without modifying it. ENOENT is "missing"; other I/O errors propagate. */
export function inspectEpoch2ConfigFile(configPath: string): Epoch2ConfigInspection {
  let bytes: Buffer
  try {
    bytes = readFileSync(configPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { state: 'missing' }
    throw error
  }
  try {
    return isPlainObjectJson(configDecoder.decode(bytes)) ? { state: 'valid' } : { state: 'corrupt' }
  } catch {
    return { state: 'corrupt' }
  }
}

export function assertEpoch2ConfigFileUsable(configPath: string): void {
  if (inspectEpoch2ConfigFile(configPath).state === 'corrupt') {
    throw new Epoch2ConfigRecoveryError('EPOCH2_CONFIG_CORRUPT')
  }
}

function stripTrailingCommas(text: string): string {
  let out = ''
  let inString = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      out += char
      if (char === '\\') {
        index += 1
        if (index < text.length) out += text[index]
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === ',') {
      let lookahead = index + 1
      while (lookahead < text.length && /\s/u.test(text[lookahead])) lookahead += 1
      if (text[lookahead] === '}' || text[lookahead] === ']') continue
    }
    out += char
  }
  return out
}

/**
 * Lossless repair only: BOM, NUL/whitespace padding and trailing commas. It never
 * completes truncated content or drops data, so a repaired file carries exactly the
 * keys the corrupt file did. Returns null when no such repair applies.
 */
export function repairEpoch2ConfigText(bytes: Uint8Array): string | null {
  let text: string
  try {
    text = configDecoder.decode(bytes)
  } catch {
    return null
  }
  const trimmed = text.replace(/^[\s\0]+|[\s\0]+$/gu, '')
  for (const candidate of [trimmed, stripTrailingCommas(trimmed)]) {
    if (isPlainObjectJson(candidate)) return `${candidate}\n`
  }
  return null
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function prepareBackupDirectory(productRoot: string): string {
  const root = path.join(productRoot, EPOCH2_CONFIG_RECOVERY_BACKUP_ROOT)
  mkdirSync(root, { recursive: true })
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const target = path.join(root, `config-${Date.now()}${attempt === 0 ? '' : `-${attempt}`}`)
    try {
      mkdirSync(target, { recursive: false })
      return target
    } catch {
      // EEXIST or transient filesystem failure: attempt the next name.
    }
  }
  throw new Epoch2ConfigRecoveryError('EPOCH2_CONFIG_RECOVERY_BACKUP_FAILED')
}

function writeExclusiveDurable(filePath: string, text: string): void {
  const fd = openSync(filePath, 'wx', 0o600)
  try {
    writeSync(fd, text)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

export type Epoch2ConfigReplacementResult = Readonly<{
  backupDirectory: string
  backupPath: string
  originalSha256: string
}>

/**
 * Moves the corrupt config.json (same bytes, never rewritten) into a fresh backup
 * directory and installs `replacementText` as the new config.json. The replacement is
 * written to a temp file first, so any failure leaves the original in place.
 */
function replaceConfigPreservingOriginal(productRoot: string, replacementText: string): Epoch2ConfigReplacementResult {
  const configPath = path.join(productRoot, EPOCH2_CONFIG_FILE_NAME)
  const stat = lstatSync(configPath)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Epoch2ConfigRecoveryError('EPOCH2_CONFIG_RECOVERY_BACKUP_FAILED')
  }
  const originalSha256 = sha256(readFileSync(configPath))
  const tempPath = path.join(productRoot, `${EPOCH2_CONFIG_FILE_NAME}.recovery-${randomBytes(6).toString('hex')}.tmp`)
  try {
    writeExclusiveDurable(tempPath, replacementText)
  } catch {
    try { unlinkSync(tempPath) } catch { /* temp was never created or is already gone */ }
    throw new Epoch2ConfigRecoveryError('EPOCH2_CONFIG_RECOVERY_INSTALL_FAILED')
  }
  let backupDirectory: string
  let backupPath: string
  try {
    backupDirectory = prepareBackupDirectory(productRoot)
    backupPath = path.join(backupDirectory, EPOCH2_CONFIG_FILE_NAME)
    renameSync(configPath, backupPath)
  } catch (error) {
    try { unlinkSync(tempPath) } catch { /* best effort */ }
    throw error instanceof Epoch2ConfigRecoveryError
      ? error
      : new Epoch2ConfigRecoveryError('EPOCH2_CONFIG_RECOVERY_BACKUP_FAILED')
  }
  try {
    if (sha256(readFileSync(backupPath)) !== originalSha256) throw new Error('backup digest mismatch')
    renameSync(tempPath, configPath)
  } catch {
    // Restore the untouched original so a failed recovery leaves the profile as found.
    try { renameSync(backupPath, configPath) } catch { /* original stays in the backup directory */ }
    try { unlinkSync(tempPath) } catch { /* best effort */ }
    throw new Epoch2ConfigRecoveryError('EPOCH2_CONFIG_RECOVERY_INSTALL_FAILED')
  }
  return Object.freeze({ backupDirectory, backupPath, originalSha256 })
}

export type Epoch2ConfigRepairOutcome =
  | Readonly<{ outcome: 'repaired' }> & Epoch2ConfigReplacementResult
  | Readonly<{ outcome: 'unrecoverable' }>

/** Lease-free core: repairs a corrupt config.json under productRoot if a lossless repair exists. */
export function repairCorruptConfigFile(productRoot: string): Epoch2ConfigRepairOutcome {
  const configPath = path.join(productRoot, EPOCH2_CONFIG_FILE_NAME)
  if (inspectEpoch2ConfigFile(configPath).state !== 'corrupt') {
    throw new Epoch2ConfigRecoveryError('EPOCH2_CONFIG_RECOVERY_NOT_CORRUPT')
  }
  const repaired = repairEpoch2ConfigText(readFileSync(configPath))
  if (repaired === null) return Object.freeze({ outcome: 'unrecoverable' })
  return Object.freeze({ outcome: 'repaired', ...replaceConfigPreservingOriginal(productRoot, repaired) })
}

/** Lease-free core: preserves the corrupt config.json and installs a new empty one. */
export function createFreshConfigFile(productRoot: string): Epoch2ConfigReplacementResult {
  const configPath = path.join(productRoot, EPOCH2_CONFIG_FILE_NAME)
  if (inspectEpoch2ConfigFile(configPath).state !== 'corrupt') {
    throw new Epoch2ConfigRecoveryError('EPOCH2_CONFIG_RECOVERY_NOT_CORRUPT')
  }
  return replaceConfigPreservingOriginal(productRoot, FRESH_CONFIG_TEXT)
}

function assertRecoverable(layout: Epoch2WorkspaceLayout, lease: Win32EpochRootLease): void {
  assertWin32EpochRootLeaseAuthority(lease, layout)
  verifyEpoch2RootAuthority({ layout, lease })
  const journal = readEpoch2ResetJournal({ layout, lease })
  if (!journal || (journal.phase !== 'database_created' && journal.phase !== 'committed')) {
    throw new Epoch2ConfigRecoveryError('EPOCH2_CONFIG_RECOVERY_JOURNAL_INVALID')
  }
}

/**
 * Non-destructive repair of a corrupt app config. Only config.json is touched; the
 * epoch-2 database, workspace and attachment blobs are never opened. The caller must
 * hold the epoch-2 root lease.
 */
export function repairCorruptEpoch2Config(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): Epoch2ConfigRepairOutcome {
  assertRecoverable(input.layout, input.lease)
  return repairCorruptConfigFile(input.layout.productRoot)
}

/**
 * Consent-gated fresh config: the corrupt file is preserved verbatim in the recovery
 * backup directory and a clean config is created beside it. Credentials and settings
 * from the corrupt file are not carried over. The caller must hold the root lease.
 */
export function createFreshEpoch2Config(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): Epoch2ConfigReplacementResult {
  assertRecoverable(input.layout, input.lease)
  return createFreshConfigFile(input.layout.productRoot)
}
