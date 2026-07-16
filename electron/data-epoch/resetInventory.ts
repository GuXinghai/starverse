import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  assertEpoch2WorkspaceLayoutAuthority,
  type Epoch2WorkspaceLayout,
} from './rootManifest'
import {
  EPOCH2_OWNED_TARGET_IDS,
  type Epoch2OwnedTargetId,
} from './win32EpochRootLease'

export const EPOCH2_OWNED_TARGET_PATH_NAMES = Object.freeze({
  legacy_chat_db: 'chat.db',
  legacy_chat_db_wal: 'chat.db-wal',
  legacy_chat_db_shm: 'chat.db-shm',
  legacy_chat_db_journal: 'chat.db-journal',
  legacy_assets: 'assets',
  legacy_engine_plugins: 'engine-plugins',
  legacy_managed_runtimes: 'managed-runtimes',
  legacy_debug: 'debug',
  legacy_logs: 'logs',
  legacy_temp: 'temp',
  legacy_workspace: 'workspace',
} as const satisfies Readonly<Record<Epoch2OwnedTargetId, string>>)

export type Epoch2ResetInventoryV1 = Readonly<{
  schemaVersion: 1
  legacyTargetPathDigests: Readonly<Record<Epoch2OwnedTargetId, string>>
  configPathDigest: string
  configBackupNamespaceDigests: Readonly<{
    standard: string
    corrupted: string
  }>
  transitionRootPathDigest: string
  workspaceRootPathDigest: string
  epochRootPathDigest: string
  databasePathDigest: string
}>

function canonicalPathKey(value: string): string {
  const resolved = path.resolve(value).normalize('NFC')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function digestPath(value: string): string {
  return createHash('sha256').update(canonicalPathKey(value), 'utf8').digest('hex')
}

function exactRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('EPOCH2_RESET_INVENTORY_INVALID')
  }
  return value as Record<string, unknown>
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
}

export function createEpoch2ResetInventory(
  layout: Epoch2WorkspaceLayout,
): Epoch2ResetInventoryV1 {
  assertEpoch2WorkspaceLayoutAuthority(layout)
  const legacyTargetPathDigests = Object.fromEntries(EPOCH2_OWNED_TARGET_IDS.map((targetId) => [
    targetId,
    digestPath(path.join(layout.productRoot, EPOCH2_OWNED_TARGET_PATH_NAMES[targetId])),
  ])) as Record<Epoch2OwnedTargetId, string>
  return Object.freeze({
    schemaVersion: 1,
    legacyTargetPathDigests: Object.freeze(legacyTargetPathDigests),
    configPathDigest: digestPath(path.join(layout.productRoot, 'config.json')),
    configBackupNamespaceDigests: Object.freeze({
      standard: digestPath(path.join(layout.productRoot, 'config.backup.<strict-timestamp>.json')),
      corrupted: digestPath(path.join(layout.productRoot, 'config.json.corrupted.<strict-reason>.<strict-timestamp>.bak')),
    }),
    transitionRootPathDigest: digestPath(layout.transitionRoot),
    workspaceRootPathDigest: digestPath(layout.workspaceRoot),
    epochRootPathDigest: digestPath(layout.epochRoot),
    databasePathDigest: digestPath(layout.databasePath),
  })
}

export function decodeEpoch2ResetInventory(value: unknown): Epoch2ResetInventoryV1 {
  const raw = exactRecord(value)
  if (!hasExactKeys(raw, [
    'configBackupNamespaceDigests',
    'configPathDigest',
    'databasePathDigest',
    'epochRootPathDigest',
    'legacyTargetPathDigests',
    'schemaVersion',
    'transitionRootPathDigest',
    'workspaceRootPathDigest',
  ]) || raw.schemaVersion !== 1) {
    throw new Error('EPOCH2_RESET_INVENTORY_INVALID')
  }
  const legacy = exactRecord(raw.legacyTargetPathDigests)
  const backups = exactRecord(raw.configBackupNamespaceDigests)
  if (!hasExactKeys(legacy, EPOCH2_OWNED_TARGET_IDS) ||
      !EPOCH2_OWNED_TARGET_IDS.every((targetId) => isDigest(legacy[targetId])) ||
      !hasExactKeys(backups, ['corrupted', 'standard']) ||
      !isDigest(backups.standard) || !isDigest(backups.corrupted) ||
      !isDigest(raw.configPathDigest) || !isDigest(raw.transitionRootPathDigest) ||
      !isDigest(raw.workspaceRootPathDigest) || !isDigest(raw.epochRootPathDigest) ||
      !isDigest(raw.databasePathDigest)) {
    throw new Error('EPOCH2_RESET_INVENTORY_INVALID')
  }
  return Object.freeze({
    schemaVersion: 1,
    legacyTargetPathDigests: Object.freeze(Object.fromEntries(
      EPOCH2_OWNED_TARGET_IDS.map((targetId) => [targetId, legacy[targetId] as string]),
    ) as Record<Epoch2OwnedTargetId, string>),
    configPathDigest: raw.configPathDigest,
    configBackupNamespaceDigests: Object.freeze({
      standard: backups.standard,
      corrupted: backups.corrupted,
    }),
    transitionRootPathDigest: raw.transitionRootPathDigest,
    workspaceRootPathDigest: raw.workspaceRootPathDigest,
    epochRootPathDigest: raw.epochRootPathDigest,
    databasePathDigest: raw.databasePathDigest,
  })
}
