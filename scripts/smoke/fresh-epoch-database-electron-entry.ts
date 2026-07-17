import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { app } from 'electron'
import { initializeOrVerifyFreshEpoch2Database } from '../../electron/data-epoch/freshEpochDatabaseInitializer'
import { createEpoch2ResetJournal } from '../../electron/data-epoch/resetJournal'
import { writeEpoch2ResetJournalAtomic } from '../../electron/data-epoch/resetJournalStore'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from '../../electron/data-epoch/rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from '../../electron/data-epoch/rootManifestStore'
import {
  acquireWin32EpochRootLease,
  ensureEpoch2RootAuthority,
} from '../../electron/data-epoch/win32EpochRootLease'

async function main(): Promise<void> {
  if (process.platform !== 'win32') throw new Error('EPOCH2_ELECTRON_SMOKE_WIN32_REQUIRED')
  const repositoryRoot = app.getAppPath()
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-epoch-db-electron-'))
  app.setPath('userData', path.join(temporaryRoot, 'user-data'))
  await app.whenReady()
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot: temporaryRoot,
    homeRoot: os.homedir(),
    repositoryRoot,
  })
  fs.mkdirSync(layout.productRoot, { recursive: true })
  const lease = acquireWin32EpochRootLease(layout)
  try {
    writeEpoch2TransitionOwnershipManifestAtomic({
      layout,
      lease,
      manifest: createEpoch2RootManifest({ layout }),
    })
    writeEpoch2ResetJournalAtomic({
      layout,
      lease,
      journal: createEpoch2ResetJournal({
        layout,
        operationId: '123e4567-e89b-42d3-a456-426614174000',
      }),
    })
    const rootAuthority = ensureEpoch2RootAuthority({ layout, lease })
    const first = await initializeOrVerifyFreshEpoch2Database({
      layout,
      lease,
      rootAuthority,
    })
    const second = await initializeOrVerifyFreshEpoch2Database({
      layout,
      lease,
      rootAuthority,
    })
    if (!first.created || second.created || first.databaseFileId !== second.databaseFileId ||
        first.schemaDigest !== second.schemaDigest || first.rootId !== second.rootId) {
      throw new Error('EPOCH2_ELECTRON_SMOKE_REOPEN_INVALID')
    }
    const db = new BetterSqlite3(layout.databasePath, { readonly: true, fileMustExist: true })
    try {
      const row = db.prepare(`SELECT m.data_epoch, m.application_id, m.root_id,
        typeof(e.ciphertext) AS ciphertext_type
        FROM app_meta_v2 AS m
        JOIN epoch_scope_key_envelope_v2 AS e USING (singleton_id)`).get() as Record<string, unknown>
      if (row.data_epoch !== 2 || row.application_id !== 'io.github.guxinghai.starverse' ||
          row.root_id !== first.rootId || row.ciphertext_type !== 'blob') {
        throw new Error('EPOCH2_ELECTRON_SMOKE_IDENTITY_INVALID')
      }
    } finally { db.close() }
    process.stdout.write('[fresh-epoch-database-electron-smoke] passed\n')
  } finally {
    lease.release()
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

void main().then(() => app.quit(), (error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : error instanceof Error ? error.message : 'EPOCH2_ELECTRON_SMOKE_FAILED'
  process.stderr.write(`[fresh-epoch-database-electron-smoke] failed ${code}\n`)
  app.exit(1)
})
