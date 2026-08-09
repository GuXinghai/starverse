import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import Store from 'electron-store'
import { app, session } from 'electron'
import { bootstrapEpoch2ToCommitted } from '../../electron/data-epoch/epoch2CommittedBootstrap'
import { readEpoch2ResetJournal } from '../../electron/data-epoch/resetJournalStore'
import { resolveEpoch2WorkspaceLayout } from '../../electron/data-epoch/rootManifest'
import { recoverEpoch2DatabaseSchemaMismatch } from '../../electron/data-epoch/schemaMismatchRecovery'
import { acquireWin32EpochRootLease } from '../../electron/data-epoch/win32EpochRootLease'

const appDataRoot = process.env.SV_EPOCH_RECOVERY_SMOKE_ROOT

async function main(): Promise<void> {
  if (process.platform !== 'win32' || !appDataRoot || !path.isAbsolute(appDataRoot)) {
    throw new Error('EPOCH2_RECOVERY_SMOKE_INPUT_INVALID')
  }
  app.setPath('userData', path.join(appDataRoot, 'user-data'))
  await app.whenReady()
  const repositoryRoot = path.resolve(process.cwd())
  const layout = resolveEpoch2WorkspaceLayout({ appDataRoot, homeRoot: os.homedir(), repositoryRoot })
  fs.mkdirSync(layout.productRoot, { recursive: true })
  const openCredentialStore = () => new Store({
    name: 'config', cwd: layout.productRoot, clearInvalidConfig: false,
  })
  const clearDefaultSessionData = async () => {
    await session.defaultSession.clearStorageData()
    await session.defaultSession.clearCache()
  }
  const readManifestDigest = () => {
    const db = new BetterSqlite3(layout.databasePath, { readonly: true, fileMustExist: true })
    try {
      const row = db.prepare(`SELECT schema_digest FROM generation_v2_schema_manifest
        WHERE manifest_id = 'generation_compiler_v2'`).get() as { schema_digest: string }
      return row.schema_digest
    } finally { db.close() }
  }

  process.stdout.write(`[schema-mismatch-recovery-smoke] fresh bootstrap start\n`)
  const fresh = await bootstrapEpoch2ToCommitted({ layout, clearDefaultSessionData, openCredentialStore })
  const originalDigest = readManifestDigest()
  await fresh.close()
  process.stdout.write(`[schema-mismatch-recovery-smoke] fresh committed digest=${originalDigest}\n`)

  process.stdout.write(`[schema-mismatch-recovery-smoke] simulate build-advanced database\n`)
  const tamper = new BetterSqlite3(layout.databasePath)
  tamper.prepare(`UPDATE generation_v2_schema_manifest SET schema_digest = ?
    WHERE manifest_id = 'generation_compiler_v2'`).run('a'.repeat(64))
  tamper.close()

  let mismatchObserved = false
  try {
    const runtime = await bootstrapEpoch2ToCommitted({ layout, clearDefaultSessionData, openCredentialStore })
    await runtime.close()
  } catch (error) {
    mismatchObserved = error instanceof Error && error.message === 'EPOCH2_DATABASE_SCHEMA_MISMATCH'
  }
  if (!mismatchObserved) throw new Error('EPOCH2_RECOVERY_SMOKE_MISMATCH_NOT_OBSERVED')
  process.stdout.write(`[schema-mismatch-recovery-smoke] mismatch observed\n`)

  const lease = acquireWin32EpochRootLease(layout)
  let recovered
  try {
    recovered = recoverEpoch2DatabaseSchemaMismatch({ layout, lease })
  } finally {
    lease.release()
  }
  const journal = (() => {
    const probe = acquireWin32EpochRootLease(layout)
    try { return readEpoch2ResetJournal({ layout, lease: probe }) } finally { probe.release() }
  })()
  if (recovered.backedUpFiles.indexOf('starverse.db') < 0 ||
      !fs.existsSync(path.join(recovered.backupDirectory, 'starverse.db')) ||
      journal?.phase !== 'epoch_root_created') {
    throw new Error('EPOCH2_RECOVERY_SMOKE_RECOVERY_INVALID')
  }
  process.stdout.write(`[schema-mismatch-recovery-smoke] recovered backup=${recovered.backupDirectory}\n`)

  const recreated = await bootstrapEpoch2ToCommitted({ layout, clearDefaultSessionData, openCredentialStore })
  const recreatedDigest = readManifestDigest()
  await recreated.close()
  if (recreatedDigest !== originalDigest) {
    throw new Error('EPOCH2_RECOVERY_SMOKE_RECREATE_INVALID')
  }
  process.stdout.write(`[schema-mismatch-recovery-smoke] recreated committed digest=${recreatedDigest}\n`)
  process.stdout.write(`[schema-mismatch-recovery-smoke] PASS\n`)
}

void main().then(() => app.quit(), (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[schema-mismatch-recovery-smoke] FAIL ${message}\n`)
  app.exit(1)
})
