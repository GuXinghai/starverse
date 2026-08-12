import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveEpoch2WorkspaceLayout } from './rootManifest'
import { acquireEpochRootLease, acquireWin32EpochDatabaseFileAuthority, ensureEpoch2RootAuthority } from './win32EpochRootLease'

const roots: string[] = []

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-posix-authority-'))
  roots.push(root)
  const appDataRoot = path.join(root, 'app-data')
  fs.mkdirSync(appDataRoot)
  return resolveEpoch2WorkspaceLayout({ appDataRoot, homeRoot: os.homedir(), repositoryRoot: process.cwd() })
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('POSIX epoch filesystem backend', () => {
  it('acquires a platform-neutral lease and rejects a concurrent lease', () => {
    const layout = fixture()
    const lease = acquireEpochRootLease(layout, 'linux')
    expect(lease.rootIdentity()).toMatchObject({ volumeSerial: expect.stringMatching(/^[0-9a-f]{16}$/u) })
    expect(() => acquireEpochRootLease(layout, 'linux')).toThrow('EPOCH2_POSIX_LEASE_BUSY')
    lease.release()
    const reacquired = acquireEpochRootLease(layout, 'linux')
    reacquired.release()
  })

  it('creates root and database authorities and detects database path replacement', () => {
    const layout = fixture()
    const lease = acquireEpochRootLease(layout, 'linux')
    try {
      const rootAuthority = ensureEpoch2RootAuthority({ layout, lease })
      expect(rootAuthority.epochFileId).toMatch(/^[0-9a-f]{32}$/u)
      const database = acquireWin32EpochDatabaseFileAuthority({ layout, lease, rootAuthority, mode: 'create_or_open' })
      expect(database.identity()).toMatchObject({ created: true, sizeBytes: 0n })
      const moved = `${layout.databasePath}.moved`
      fs.renameSync(layout.databasePath, moved)
      fs.writeFileSync(layout.databasePath, '')
      expect(() => database.verifyPathIdentity()).toThrow('EPOCH2_POSIX_DATABASE_FILE_CHANGED')
      database.release()
    } finally { lease.release() }
  })

  it('reclaims a stale lease whose PID was reused with a different process start identity', () => {
    const layout = fixture()
    const first = acquireEpochRootLease(layout, 'linux')
    const ownerPath = path.join(`${layout.lockPath}.lease`, 'owner.json')
    const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'))
    fs.writeFileSync(ownerPath, JSON.stringify({ ...owner, processStartId: 'reused-process' }))
    const recovered = acquireEpochRootLease(layout, 'linux')
    recovered.release()
    first.release()
  })

  it('rejects a symlinked product root before issuing a lease', () => {
    const layout = fixture()
    const outside = path.join(path.dirname(layout.appDataRoot), 'outside')
    fs.mkdirSync(outside)
    fs.symlinkSync(outside, layout.productRoot, 'junction')
    expect(() => acquireEpochRootLease(layout, 'linux')).toThrow('EPOCH2_POSIX_PATH_INVALID')
  })
})
