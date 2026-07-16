import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createEpoch2ResetJournal } from './resetJournal'
import { writeEpoch2ResetJournalAtomic } from './resetJournalStore'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from './rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from './rootManifestStore'
import {
  acquireWin32EpochDatabaseFileAuthority,
  acquireWin32EpochRootLease,
  assertWin32EpochDatabaseFileAuthority,
  createWin32EpochLeaseRequest,
  ensureEpoch2RootAuthority,
  verifyEpoch2RootAuthority,
} from './win32EpochRootLease'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []

function fixture(name: string) {
  const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  roots.push(appDataRoot)
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot,
    homeRoot: os.homedir(),
    repositoryRoot: process.cwd(),
  })
  fs.mkdirSync(layout.productRoot, { recursive: true })
  const lease = acquireWin32EpochRootLease(layout)
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
  return { layout, lease, rootAuthority }
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('Win32 epoch-2 main database file authority', () => {
  windowsIt('holds one no-delete-share file identity across the SQLite connection lifetime', () => {
    const value = fixture('starverse-epoch-db-create')
    const authority = acquireWin32EpochDatabaseFileAuthority({
      ...value,
      mode: 'create_or_open',
    })
    try {
      const created = authority.identity()
      expect(created.created).toBe(true)
      expect(created.sizeBytes).toBe(0n)
      expect(created.volumeSerial).toMatch(/^[0-9a-f]{16}$/u)
      expect(created.databaseFileId).toMatch(/^[0-9a-f]{32}$/u)
      const db = new BetterSqlite3(value.layout.databasePath)
      try {
        db.exec('CREATE TABLE authority_probe (id INTEGER PRIMARY KEY)')
        const verified = authority.verifyPathIdentity()
        expect(verified.databaseFileId).toBe(created.databaseFileId)
        expect(verified.sizeBytes).toBeGreaterThan(0n)
        expect(() => fs.renameSync(
          value.layout.databasePath,
          `${value.layout.databasePath}.moved`,
        )).toThrow()
      } finally { db.close() }
      expect(authority.verifyPathIdentity().databaseFileId).toBe(created.databaseFileId)
    } finally {
      authority.release()
      value.lease.release()
    }
  })

  windowsIt('reopens the same nonempty database identity only in verify mode', () => {
    const value = fixture('starverse-epoch-db-verify')
    const created = acquireWin32EpochDatabaseFileAuthority({ ...value, mode: 'create_or_open' })
    const initialId = created.identity().databaseFileId
    const db = new BetterSqlite3(value.layout.databasePath)
    db.exec('CREATE TABLE persisted (id INTEGER PRIMARY KEY)')
    db.close()
    created.release()

    const verifiedRoot = verifyEpoch2RootAuthority(value)
    const verified = acquireWin32EpochDatabaseFileAuthority({
      layout: value.layout,
      lease: value.lease,
      rootAuthority: verifiedRoot,
      mode: 'verify_existing',
    })
    try {
      expect(verified.identity()).toMatchObject({
        created: false,
        databaseFileId: initialId,
      })
      expect(verified.verifyPathIdentity().databaseFileId).toBe(initialId)
    } finally {
      verified.release()
      value.lease.release()
    }
  })

  windowsIt('fails verify mode on a missing database without creating it', () => {
    const value = fixture('starverse-epoch-db-missing')
    try {
      expect(() => acquireWin32EpochDatabaseFileAuthority({
        ...value,
        mode: 'verify_existing',
      })).toThrow('EPOCH2_WIN32_DATABASE_FILE_MISSING')
      expect(fs.existsSync(value.layout.databasePath)).toBe(false)
    } finally { value.lease.release() }
  })

  windowsIt('recovers one empty direct-create crash point without changing file identity', () => {
    const value = fixture('starverse-epoch-db-empty-recovery')
    const first = acquireWin32EpochDatabaseFileAuthority({ ...value, mode: 'create_or_open' })
    const firstIdentity = first.identity()
    first.release()
    const replay = acquireWin32EpochDatabaseFileAuthority({ ...value, mode: 'create_or_open' })
    try {
      expect(replay.identity()).toEqual({ ...firstIdentity, created: false })
    } finally {
      replay.release()
      value.lease.release()
    }
  })

  windowsIt('rejects pre-existing hardlinks and file reparse points', () => {
    for (const variant of ['hardlink', 'reparse'] as const) {
      const value = fixture(`starverse-epoch-db-${variant}`)
      const outside = path.join(value.layout.appDataRoot, `outside-${variant}.db`)
      fs.writeFileSync(outside, 'outside')
      if (variant === 'hardlink') fs.linkSync(outside, value.layout.databasePath)
      else fs.symlinkSync(outside, value.layout.databasePath, 'file')
      try {
        expect(() => acquireWin32EpochDatabaseFileAuthority({
          ...value,
          mode: 'create_or_open',
        })).toThrow('EPOCH2_WIN32_DATABASE_FILE_INVALID')
        expect(fs.readFileSync(outside, 'utf8')).toBe('outside')
      } finally { value.lease.release() }
    }
  })

  windowsIt('never silently accepts a hardlink added while the authority is held', () => {
    const value = fixture('starverse-epoch-db-live-hardlink')
    const authority = acquireWin32EpochDatabaseFileAuthority({ ...value, mode: 'create_or_open' })
    const linkPath = path.join(value.layout.epochRoot, 'database-hardlink-probe')
    let linked = false
    try {
      try {
        fs.linkSync(value.layout.databasePath, linkPath)
        linked = true
      } catch { /* the held handle may reject link creation */ }
      if (linked) {
        expect(() => authority.verifyPathIdentity())
          .toThrow('EPOCH2_WIN32_DATABASE_FILE_CHANGED')
      } else {
        expect(authority.verifyPathIdentity().databaseFileId).toMatch(/^[0-9a-f]{32}$/u)
      }
    } finally {
      authority.release()
      value.lease.release()
    }
  })

  windowsIt('rejects forged or stale root authority and releases with the parent lease', () => {
    const value = fixture('starverse-epoch-db-authority')
    expect(() => acquireWin32EpochDatabaseFileAuthority({
      ...value,
      rootAuthority: { ...value.rootAuthority },
      mode: 'create_or_open',
    })).toThrow('EPOCH2_WIN32_EPOCH_ROOT_INVALID')
    const authority = acquireWin32EpochDatabaseFileAuthority({ ...value, mode: 'create_or_open' })
    assertWin32EpochDatabaseFileAuthority(authority, value)
    verifyEpoch2RootAuthority(value)
    expect(() => authority.identity()).toThrow('EPOCH2_WIN32_EPOCH_ROOT_INVALID')
    authority.release()
    value.lease.release()
    expect(() => authority.identity()).toThrow('EPOCH2_WIN32_DATABASE_FILE_RELEASED')
    expect(() => assertWin32EpochDatabaseFileAuthority(authority, value))
      .toThrow('EPOCH2_WIN32_DATABASE_FILE_RELEASED')
  })

  windowsIt('native root refresh invalidates raw database children on success and failure', () => {
    const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-epoch-db-raw-parent-'))
    roots.push(appDataRoot)
    const layout = resolveEpoch2WorkspaceLayout({
      appDataRoot,
      homeRoot: os.homedir(),
      repositoryRoot: process.cwd(),
    })
    fs.mkdirSync(layout.productRoot, { recursive: true })
    interface RawDatabaseAuthority {
      identity: () => unknown
      verifyPathIdentity: () => unknown
      release: () => void
    }
    interface RawLease {
      writeTransitionFile: (name: string, bytes: Buffer, replace: boolean) => boolean
      ensureEpochRootMarker: () => unknown
      verifyEpochRootMarker: () => unknown
      acquireEpochDatabaseFile: (mode: string) => RawDatabaseAuthority
      release: () => void
    }
    const addon = createRequire(import.meta.url)(
      path.resolve('dist-native/win32-x64/starverse_epoch_win32.node'),
    ) as { acquireEpochRootLease: (request: unknown) => RawLease }
    const manifestBytes = Buffer.from(`${JSON.stringify(createEpoch2RootManifest({ layout }), null, 2)}\n`)
    const rawLease = addon.acquireEpochRootLease(createWin32EpochLeaseRequest(layout))
    let manifestFd: number | undefined
    try {
      expect(rawLease.writeTransitionFile('root-manifest.json', manifestBytes, false)).toBe(true)
      rawLease.ensureEpochRootMarker()
      const refreshed = rawLease.acquireEpochDatabaseFile('create_or_open')
      rawLease.verifyEpochRootMarker()
      expect(() => refreshed.identity()).toThrow('EPOCH2_WIN32_DATABASE_FILE_RELEASED')
      const failedRefresh = rawLease.acquireEpochDatabaseFile('verify_existing')
      expect(() => rawLease.ensureEpochRootMarker()).toThrow('EPOCH2_WIN32_EPOCH_ROOT_CONFLICT')
      expect(() => failedRefresh.verifyPathIdentity()).toThrow('EPOCH2_WIN32_DATABASE_FILE_RELEASED')
      rawLease.verifyEpochRootMarker()
      const preflightFailure = rawLease.acquireEpochDatabaseFile('verify_existing')
      expect(preflightFailure.identity()).toBeTruthy()
      manifestFd = fs.openSync(layout.transitionManifestPath, 'r+')
      const overwriteManifest = (bytes: Buffer) => {
        fs.writeSync(manifestFd!, bytes, 0, bytes.length, 0)
        fs.ftruncateSync(manifestFd!, bytes.length)
        fs.fsyncSync(manifestFd!)
      }
      overwriteManifest(Buffer.from('invalid ownership manifest'))
      expect(() => rawLease.verifyEpochRootMarker()).toThrow('EPOCH2_WIN32_EPOCH_ROOT_INVALID')
      expect(() => preflightFailure.identity()).toThrow('EPOCH2_WIN32_DATABASE_FILE_RELEASED')
      overwriteManifest(manifestBytes)
      fs.closeSync(manifestFd)
      manifestFd = undefined
      rawLease.verifyEpochRootMarker()
      const recovered = rawLease.acquireEpochDatabaseFile('verify_existing')
      expect(recovered.identity()).toBeTruthy()
      recovered.release()
    } finally {
      rawLease.release()
      if (manifestFd !== undefined) fs.closeSync(manifestFd)
    }
  })

  windowsIt('native parent release invalidates every raw database child before releasing the mutex', () => {
    const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-epoch-db-raw-parent-'))
    roots.push(appDataRoot)
    const layout = resolveEpoch2WorkspaceLayout({
      appDataRoot,
      homeRoot: os.homedir(),
      repositoryRoot: process.cwd(),
    })
    fs.mkdirSync(layout.productRoot, { recursive: true })
    interface RawDatabaseAuthority {
      identity: () => unknown
      verifyPathIdentity: () => unknown
    }
    interface RawLease {
      writeTransitionFile: (name: string, bytes: Buffer, replace: boolean) => boolean
      ensureEpochRootMarker: () => unknown
      acquireEpochDatabaseFile: (mode: string) => RawDatabaseAuthority
      release: () => void
    }
    const addon = createRequire(import.meta.url)(
      path.resolve('dist-native/win32-x64/starverse_epoch_win32.node'),
    ) as { acquireEpochRootLease: (request: unknown) => RawLease }
    const rawLease = addon.acquireEpochRootLease(createWin32EpochLeaseRequest(layout))
    const manifestBytes = Buffer.from(`${JSON.stringify(createEpoch2RootManifest({ layout }), null, 2)}\n`)
    expect(rawLease.writeTransitionFile('root-manifest.json', manifestBytes, false)).toBe(true)
    rawLease.ensureEpochRootMarker()
    const first = rawLease.acquireEpochDatabaseFile('create_or_open')
    const second = rawLease.acquireEpochDatabaseFile('create_or_open')
    rawLease.release()
    expect(() => first.identity()).toThrow('EPOCH2_WIN32_DATABASE_FILE_RELEASED')
    expect(() => second.verifyPathIdentity()).toThrow('EPOCH2_WIN32_DATABASE_FILE_RELEASED')
    const reacquired = addon.acquireEpochRootLease(createWin32EpochLeaseRequest(layout))
    reacquired.release()
  })
})
