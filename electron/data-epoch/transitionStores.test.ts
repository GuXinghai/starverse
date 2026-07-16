import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createEpoch2RootManifest,
  resolveEpoch2WorkspaceLayout,
} from './rootManifest'
import {
  readAndVerifyEpoch2RootManifest,
  writeEpoch2RootManifestAtomic,
} from './rootManifestStore'
import {
  advanceEpoch2ResetJournal,
  createEpoch2ResetJournal,
} from './resetJournal'
import {
  readEpoch2ResetJournal,
  writeEpoch2ResetJournalAtomic,
} from './resetJournalStore'
import {
  acquireWin32EpochRootLease,
  Win32EpochRootLeaseError,
} from './win32EpochRootLease'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []
const operationId = '123e4567-e89b-42d3-a456-426614174000'
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

function fixture() {
  const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-transition-store-'))
  roots.push(appDataRoot)
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot,
    homeRoot: os.homedir(),
    repositoryRoot: process.cwd(),
  })
  return { layout, lease: acquireWin32EpochRootLease(layout) }
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('epoch-2 lease-bound transition stores', () => {
  windowsIt('persists the manifest and adjacent journal phases through the same lease', () => {
    const { layout, lease } = fixture()
    try {
      const manifest = createEpoch2RootManifest({ layout })
      writeEpoch2RootManifestAtomic({ layout, lease, manifest })
      writeEpoch2RootManifestAtomic({ layout, lease, manifest })
      expect(readAndVerifyEpoch2RootManifest({ layout, lease })).toEqual(manifest)

      const prepared = createEpoch2ResetJournal({
        operationId,
        layout,
      })
      writeEpoch2ResetJournalAtomic({ layout, lease, journal: prepared })
      const next = advanceEpoch2ResetJournal(prepared, 'legacy_files_deleted')
      writeEpoch2ResetJournalAtomic({ layout, lease, journal: next })
      expect(readEpoch2ResetJournal({ layout, lease })).toEqual(next)
      expect(fs.readdirSync(layout.transitionRoot).sort()).toEqual([
        'epoch-transition.journal.json',
        'epoch-transition.lock',
        'root-manifest.json',
      ])
    } finally {
      lease.release()
    }
  })

  windowsIt('rejects a forged lease/layout pairing and every use after release', () => {
    const first = fixture()
    const second = fixture()
    try {
      const secondManifest = createEpoch2RootManifest({ layout: second.layout })
      expect(() => writeEpoch2RootManifestAtomic({
        layout: second.layout,
        lease: first.lease,
        manifest: secondManifest,
      })).toThrowError(new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID'))
      first.lease.release()
      expect(() => readEpoch2ResetJournal({
        layout: first.layout,
        lease: first.lease,
      })).toThrowError(new Win32EpochRootLeaseError('EPOCH2_WIN32_LEASE_RELEASED'))
    } finally {
      first.lease.release()
      second.lease.release()
    }
  })

  windowsIt('never replaces a conflicting manifest published at the native commit point', () => {
    const { layout, lease } = fixture()
    try {
      const expected = createEpoch2RootManifest({ layout })
      const conflictingBytes = Buffer.from(`${JSON.stringify({
        ...expected,
        applicationId: 'attacker.invalid',
      })}\n`, 'utf8')
      expect(lease.writeTransitionFile('transition_manifest', conflictingBytes)).toBe('written')
      expect(lease.writeTransitionFile(
        'transition_manifest',
        Buffer.from(`${JSON.stringify(expected)}\n`, 'utf8'),
      )).toBe('exists')
      expect(() => writeEpoch2RootManifestAtomic({ layout, lease, manifest: expected }))
        .toThrow('EPOCH2_ROOT_MANIFEST_MISMATCH')
      expect(Buffer.from(lease.readTransitionFile('transition_manifest')!)).toEqual(conflictingBytes)
    } finally {
      lease.release()
    }
  })

  windowsIt('never follows a reparse target and bounds bytes before decoding JSON', () => {
    const { layout, lease } = fixture()
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-transition-outside-'))
    roots.push(outsideRoot)
    const outsideFile = path.join(outsideRoot, 'sentinel.json')
    fs.writeFileSync(outsideFile, '{"sentinel":true}\n')
    try {
      fs.symlinkSync(outsideFile, layout.transitionManifestPath, 'file')
      expect(() => readAndVerifyEpoch2RootManifest({ layout, lease }))
        .toThrowError(new Win32EpochRootLeaseError('EPOCH2_WIN32_TRANSITION_REPARSE_POINT'))
      expect(fs.readFileSync(outsideFile, 'utf8')).toBe('{"sentinel":true}\n')
      fs.unlinkSync(layout.transitionManifestPath)

      fs.writeFileSync(layout.transitionManifestPath, Buffer.alloc(4 * 1024 + 1))
      expect(() => readAndVerifyEpoch2RootManifest({ layout, lease }))
        .toThrowError(new Win32EpochRootLeaseError('EPOCH2_WIN32_TRANSITION_FILE_TOO_LARGE'))
    } finally {
      lease.release()
    }
  })

  windowsIt('treats pre-rename crash temps as uncommitted and never follows them', () => {
    const { layout, lease } = fixture()
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-transition-temp-outside-'))
    roots.push(outsideRoot)
    const outsideFile = path.join(outsideRoot, 'sentinel.json')
    fs.writeFileSync(outsideFile, '{"sentinel":true}\n')
    try {
      fs.writeFileSync(path.join(layout.transitionRoot, `.svtmp-${'a'.repeat(32)}`), '{partial')
      fs.symlinkSync(
        outsideFile,
        path.join(layout.transitionRoot, `.svtmp-${'b'.repeat(32)}`),
        'file',
      )
      const manifest = createEpoch2RootManifest({ layout })
      writeEpoch2RootManifestAtomic({ layout, lease, manifest })
      expect(readAndVerifyEpoch2RootManifest({ layout, lease })).toEqual(manifest)
      expect(fs.readFileSync(outsideFile, 'utf8')).toBe('{"sentinel":true}\n')
      expect(fs.readdirSync(layout.transitionRoot).sort()).toEqual([
        `.svtmp-${'a'.repeat(32)}`,
        `.svtmp-${'b'.repeat(32)}`,
        'epoch-transition.lock',
        'root-manifest.json',
      ])
    } finally {
      lease.release()
    }
  })

  windowsIt('rejects forged journal values before native persistence', () => {
    const { layout, lease } = fixture()
    try {
      const forged = {
        ...createEpoch2ResetJournal({
          operationId,
          layout,
        }),
        injected: true,
      } as never
      expect(() => writeEpoch2ResetJournalAtomic({ layout, lease, journal: forged }))
        .toThrow('EPOCH2_RESET_JOURNAL_INVALID')
      expect(readEpoch2ResetJournal({ layout, lease })).toBeNull()
    } finally {
      lease.release()
    }
  })

  windowsIt('rejects a structurally valid persisted inventory from a different root', () => {
    const { layout, lease } = fixture()
    const otherLayout = resolveEpoch2WorkspaceLayout({
      appDataRoot: path.join(os.tmpdir(), 'starverse-transition-other-root'),
      homeRoot: os.homedir(),
      repositoryRoot: process.cwd(),
    })
    try {
      const wrongRootJournal = createEpoch2ResetJournal({ operationId, layout: otherLayout })
      expect(lease.writeTransitionFile(
        'reset_journal',
        Buffer.from(`${JSON.stringify(wrongRootJournal, null, 2)}\n`),
      )).toBe('written')
      expect(() => readEpoch2ResetJournal({ layout, lease }))
        .toThrow('EPOCH2_RESET_JOURNAL_INVALID')
    } finally {
      lease.release()
    }
  })

  it('keeps both stores free of absolute path and Node filesystem I/O', () => {
    for (const file of ['rootManifestStore.ts', 'resetJournalStore.ts']) {
      const source = fs.readFileSync(path.join(currentDirectory, file), 'utf8')
      expect(source).not.toMatch(/from ['"]node:(?:fs|path)['"]/u)
      expect(source).not.toMatch(/\b(?:existsSync|readFileSync|writeFileSync|renameSync|unlinkSync)\b/u)
    }
  })
})
