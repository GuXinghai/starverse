import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { app } from 'electron'
import {
  initializeOrVerifyFreshEpoch2Database,
  runFreshEpoch2DatabaseCrashSmoke,
  type FreshEpochDatabaseCrashSmokeStage,
} from '../../electron/data-epoch/freshEpochDatabaseInitializer'
import { createEpoch2ResetJournal } from '../../electron/data-epoch/resetJournal'
import { writeEpoch2ResetJournalAtomic } from '../../electron/data-epoch/resetJournalStore'
import {
  createEpoch2RootManifest,
  resolveEpoch2WorkspaceLayout,
} from '../../electron/data-epoch/rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from '../../electron/data-epoch/rootManifestStore'
import {
  acquireWin32EpochRootLease,
  ensureEpoch2RootAuthority,
  verifyEpoch2RootAuthority,
} from '../../electron/data-epoch/win32EpochRootLease'

const mode = process.argv[2]
const appDataRoot = process.env.SV_EPOCH_CRASH_ROOT
const crashStages = new Set<FreshEpochDatabaseCrashSmokeStage>([
  'after_schema', 'after_identity', 'after_envelope',
])

async function main(): Promise<void> {
  if (process.platform !== 'win32' || !appDataRoot || !path.isAbsolute(appDataRoot) ||
      (mode !== 'recover' && !crashStages.has(mode as FreshEpochDatabaseCrashSmokeStage))) {
    throw new Error('EPOCH2_CRASH_SMOKE_INPUT_INVALID')
  }
  app.setPath('userData', path.join(appDataRoot, 'user-data'))
  await app.whenReady()
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot,
    homeRoot: os.homedir(),
    repositoryRoot: app.getAppPath(),
  })
  fs.mkdirSync(layout.productRoot, { recursive: true })
  const lease = acquireWin32EpochRootLease(layout)
  try {
    if (!fs.existsSync(layout.transitionManifestPath)) {
      writeEpoch2TransitionOwnershipManifestAtomic({
        layout,
        lease,
        manifest: createEpoch2RootManifest({ layout }),
      })
    }
    if (!fs.existsSync(layout.journalPath)) {
      writeEpoch2ResetJournalAtomic({
        layout,
        lease,
        journal: createEpoch2ResetJournal({
          layout,
          operationId: '123e4567-e89b-42d3-a456-426614174000',
        }),
      })
    }
    const markerAlreadyExists = fs.existsSync(layout.markerPath)
    const rootAuthority = markerAlreadyExists
      ? verifyEpoch2RootAuthority({ layout, lease })
      : ensureEpoch2RootAuthority({ layout, lease })
    if (mode === 'recover') {
      const result = await initializeOrVerifyFreshEpoch2Database({ layout, lease, rootAuthority })
      const db = new BetterSqlite3(layout.databasePath, { readonly: true, fileMustExist: true })
      try {
        const state = db.prepare(`SELECT
          (SELECT count(*) FROM app_meta_v2) AS meta_count,
          (SELECT count(*) FROM epoch_scope_key_envelope_v2) AS envelope_count`).get()
        if (JSON.stringify(state) !== JSON.stringify({ meta_count: 1, envelope_count: 1 })) {
          throw new Error('EPOCH2_CRASH_RECOVERY_STATE_INVALID')
        }
      } finally { db.close() }
      process.stdout.write(`[fresh-epoch-database-crash] recovered ${result.created}\n`)
      return
    }

    const markerPath = process.env.SV_EPOCH_CRASH_MARKER
    if (!markerPath || !path.isAbsolute(markerPath)) {
      throw new Error('EPOCH2_CRASH_SMOKE_MARKER_INVALID')
    }
    await runFreshEpoch2DatabaseCrashSmoke({
      initializer: { layout, lease, rootAuthority },
      stage: mode as FreshEpochDatabaseCrashSmokeStage,
      markerPath,
    })
  } finally {
    lease.release()
  }
}

void main().then(() => app.quit(), (error: unknown) => {
  const code = error instanceof Error ? error.message : 'EPOCH2_CRASH_SMOKE_FAILED'
  process.stderr.write(`[fresh-epoch-database-crash] failed ${code}\n`)
  app.exit(1)
})
