import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runEpoch2ResetThroughConfigReplacement } from './dataEpochCoordinatorCore'
import { ensureEpoch2RootCreated } from './epochRootCoordinatorCore'
import { inspectEpoch2OwnedTarget } from './nativeOwnedDelete'
import {
  advanceEpoch2ResetJournal,
  createEpoch2ResetJournal,
} from './resetJournal'
import {
  readEpoch2ResetJournal,
  writeEpoch2ResetJournalAtomic,
} from './resetJournalStore'
import {
  createEpoch2RootManifest,
  resolveEpoch2WorkspaceLayout,
} from './rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from './rootManifestStore'
import {
  acquireWin32EpochRootLease,
  assertEpoch2RootAuthority,
  ensureEpoch2RootAuthority,
  verifyEpoch2RootAuthority,
} from './win32EpochRootLease'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []
const operationId = '123e4567-e89b-42d3-a456-426614174000'

function fixture(
  name: string,
  beforeAcquire?: (layout: ReturnType<typeof resolveEpoch2WorkspaceLayout>) => void,
) {
  const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  roots.push(appDataRoot)
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot,
    homeRoot: os.homedir(),
    repositoryRoot: process.cwd(),
  })
  fs.mkdirSync(layout.productRoot, { recursive: true })
  beforeAcquire?.(layout)
  const lease = acquireWin32EpochRootLease(layout)
  const manifest = createEpoch2RootManifest({ layout })
  writeEpoch2TransitionOwnershipManifestAtomic({ layout, lease, manifest })
  let journal = createEpoch2ResetJournal({ layout, operationId })
  writeEpoch2ResetJournalAtomic({ layout, lease, journal })
  for (const phase of ['legacy_files_deleted', 'config_replaced'] as const) {
    journal = advanceEpoch2ResetJournal(journal, phase)
    writeEpoch2ResetJournalAtomic({ layout, lease, journal })
  }
  return { layout, lease, manifest }
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('epoch-2 root marker authority and coordinator phase', () => {
  windowsIt('creates and holds the exact epoch root marker without creating a database', () => {
    const { layout, lease, manifest } = fixture('starverse-epoch-root-create')
    let released = false
    try {
      const authority = ensureEpoch2RootAuthority({ layout, lease })
      assertEpoch2RootAuthority(authority, { layout, lease })
      expect(Object.isFrozen(authority)).toBe(true)
      expect(authority.volumeSerial).toMatch(/^[0-9a-f]{16}$/u)
      expect(authority.workspaceFileId).toMatch(/^[0-9a-f]{32}$/u)
      expect(authority.epochFileId).toMatch(/^[0-9a-f]{32}$/u)
      expect(authority.markerFileId).toMatch(/^[0-9a-f]{32}$/u)
      expect(fs.readFileSync(layout.markerPath, 'utf8')).toBe(`${JSON.stringify(manifest, null, 2)}\n`)
      expect(fs.existsSync(layout.databasePath)).toBe(false)
      expect(() => inspectEpoch2OwnedTarget({
        layout,
        lease,
        targetId: 'legacy_chat_db',
      })).toThrow('EPOCH2_WIN32_EPOCH_PHASE_CLOSED')
      const verified = verifyEpoch2RootAuthority({ layout, lease })
      expect(verified).toEqual(authority)
      expect(() => assertEpoch2RootAuthority(authority, { layout, lease }))
        .toThrow('EPOCH2_WIN32_EPOCH_ROOT_INVALID')
      assertEpoch2RootAuthority(verified, { layout, lease })
      expect(() => assertEpoch2RootAuthority(
        { ...verified },
        { layout, lease },
      )).toThrow('EPOCH2_WIN32_EPOCH_ROOT_INVALID')
      lease.release()
      released = true
      expect(() => assertEpoch2RootAuthority(verified, { layout, lease }))
        .toThrow('EPOCH2_WIN32_LEASE_RELEASED')
    } finally {
      if (!released) lease.release()
    }
  })

  windowsIt('recovers exact marker temps and rejects unknown workspace or epoch entries', () => {
    let value = fixture('starverse-epoch-root-temp', (layout) => {
      fs.mkdirSync(layout.epochRoot, { recursive: true })
      fs.writeFileSync(path.join(layout.epochRoot, `.svmarker-${'a'.repeat(32)}`), 'partial')
    })
    try {
      ensureEpoch2RootAuthority({ layout: value.layout, lease: value.lease })
      expect(fs.readdirSync(value.layout.epochRoot)).toEqual(['root-manifest.json'])
    } finally {
      value.lease.release()
    }

    value = fixture('starverse-epoch-root-workspace-conflict', (layout) => {
      fs.mkdirSync(layout.workspaceRoot, { recursive: true })
      fs.writeFileSync(path.join(layout.workspaceRoot, 'unknown'), 'conflict')
    })
    try {
      expect(() => ensureEpoch2RootAuthority({ layout: value.layout, lease: value.lease }))
        .toThrow('EPOCH2_WIN32_EPOCH_ROOT_CONFLICT')
      expect(fs.readFileSync(path.join(value.layout.workspaceRoot, 'unknown'), 'utf8')).toBe('conflict')
    } finally {
      value.lease.release()
    }

    value = fixture('starverse-epoch-root-child-conflict', (layout) => {
      fs.mkdirSync(layout.epochRoot, { recursive: true })
      fs.writeFileSync(path.join(layout.epochRoot, 'unknown'), 'conflict')
    })
    try {
      expect(() => ensureEpoch2RootAuthority({ layout: value.layout, lease: value.lease }))
        .toThrow('EPOCH2_WIN32_EPOCH_ROOT_CONFLICT')
      expect(fs.readFileSync(path.join(value.layout.epochRoot, 'unknown'), 'utf8')).toBe('conflict')
    } finally {
      value.lease.release()
    }
  })

  windowsIt('rejects conflicting, oversized and reparse markers without replacement', () => {
    for (const variant of ['conflict', 'oversized', 'reparse'] as const) {
      const value = fixture(`starverse-epoch-marker-${variant}`, (layout) => {
        fs.mkdirSync(layout.epochRoot, { recursive: true })
        if (variant === 'reparse') {
          const outside = path.join(layout.appDataRoot, 'outside-marker.json')
          fs.writeFileSync(outside, 'outside')
          fs.symlinkSync(outside, layout.markerPath, 'file')
        } else {
          fs.writeFileSync(layout.markerPath, variant === 'oversized' ? 'x'.repeat(4097) : '{}\n')
        }
      })
      try {
        expect(() => ensureEpoch2RootAuthority({ layout: value.layout, lease: value.lease }))
          .toThrow(/EPOCH2_WIN32_EPOCH_MARKER_(?:CONFLICT|INVALID)/u)
      } finally {
        value.lease.release()
      }
    }
  })

  windowsIt('publishes the marker before advancing and recovers when the journal stayed behind', () => {
    const { layout, lease } = fixture('starverse-epoch-root-coordinator')
    try {
      ensureEpoch2RootAuthority({ layout, lease })
      expect(readEpoch2ResetJournal({ layout, lease })?.phase).toBe('config_replaced')
      const result = ensureEpoch2RootCreated({ layout, lease })
      expect(result.journal.phase).toBe('epoch_root_created')
      assertEpoch2RootAuthority(result.rootAuthority, { layout, lease })
      const replay = ensureEpoch2RootCreated({ layout, lease })
      expect(replay.journal.phase).toBe('epoch_root_created')
      expect(replay.rootAuthority).toEqual(result.rootAuthority)
    } finally {
      lease.release()
    }
  })

  windowsIt('revokes the prior root authority before a failed native reverify', () => {
    const { layout, lease } = fixture('starverse-epoch-root-failed-reverify')
    try {
      const authority = ensureEpoch2RootAuthority({ layout, lease })
      assertEpoch2RootAuthority(authority, { layout, lease })
      fs.rmSync(layout.transitionManifestPath)
      expect(() => verifyEpoch2RootAuthority({ layout, lease }))
        .toThrow('EPOCH2_WIN32_EPOCH_ROOT_INVALID')
      expect(() => assertEpoch2RootAuthority(authority, { layout, lease }))
        .toThrow('EPOCH2_WIN32_EPOCH_ROOT_INVALID')
    } finally {
      lease.release()
    }
  })

  windowsIt('prevents the config coordinator from sweeping workspace after root creation', async () => {
    const { layout, lease } = fixture('starverse-epoch-root-phase-fence')
    try {
      ensureEpoch2RootCreated({ layout, lease })
      fs.writeFileSync(path.join(layout.productRoot, 'chat.db'), 'must-remain-for-router')
      await expect(runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData: async () => {},
      })).rejects.toThrow('EPOCH2_CONFIG_COORDINATOR_PHASE_INVALID')
      expect(fs.readFileSync(path.join(layout.productRoot, 'chat.db'), 'utf8'))
        .toBe('must-remain-for-router')
    } finally {
      lease.release()
    }
  })
})
