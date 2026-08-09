import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cleanupEpoch2TransitionTemps,
  deleteEpoch2OwnedTarget,
  inspectEpoch2OwnedTarget,
} from './nativeOwnedDelete'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from './rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from './rootManifestStore'
import { acquireWin32EpochRootLease, createWin32EpochLeaseRequest } from './win32EpochRootLease'

const windowsIt = process.platform === 'win32' ? it : it.skip

async function waitUntil(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('TEST_WAIT_TIMEOUT')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

function withLease(
  name: string,
  run: (fixture: ReturnType<typeof createFixture>) => void,
): void {
  const fixture = createFixture(name)
  try {
    run(fixture)
  } finally {
    fixture.lease.release()
    fs.rmSync(fixture.directory, { recursive: true, force: true })
  }
}

function createFixture(name: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot: directory,
    homeRoot: os.homedir(),
    repositoryRoot: process.cwd(),
  })
  const lease = acquireWin32EpochRootLease(layout)
  return { directory, layout, lease }
}

function publishManifest(fixture: ReturnType<typeof createFixture>): void {
  writeEpoch2TransitionOwnershipManifestAtomic({
    layout: fixture.layout,
    lease: fixture.lease,
    manifest: createEpoch2RootManifest({ layout: fixture.layout }),
  })
}

function overwriteExistingFile(filePath: string, value: string): void {
  const descriptor = fs.openSync(filePath, 'r+')
  try {
    fs.ftruncateSync(descriptor, 0)
    fs.writeFileSync(descriptor, value)
  } finally {
    fs.closeSync(descriptor)
  }
}

describe('Win32 epoch owned deletion authority', () => {
  windowsIt('rejects raw-addon deletion without the canonical manifest and rejects alternate namespaces', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-owned-raw-'))
    const layout = resolveEpoch2WorkspaceLayout({
      appDataRoot: directory,
      homeRoot: os.homedir(),
      repositoryRoot: process.cwd(),
    })
    const addon = createRequire(import.meta.url)(
      path.resolve(process.cwd(), 'dist-native', 'win32-x64', 'starverse_epoch_win32.node'),
    ) as {
      acquireEpochRootLease(request: unknown): {
        deleteOwnedTarget(targetId: string): unknown
        readLegacyConfig(operationId: string): unknown
        inspectLegacyConfigBackups(): unknown
        ensureEpochRootMarker(): unknown
        release(): void
      }
    }
    const request = createWin32EpochLeaseRequest(layout)
    fs.mkdirSync(layout.productRoot, { recursive: true })
    fs.writeFileSync(path.join(layout.productRoot, 'chat.db'), 'keep')
    const rawLease = addon.acquireEpochRootLease(request)
    try {
      expect(() => rawLease.deleteOwnedTarget('legacy_chat_db'))
        .toThrow('EPOCH2_WIN32_DELETE_OWNERSHIP_INVALID')
      expect(() => rawLease.readLegacyConfig('123e4567-e89b-42d3-a456-426614174000'))
        .toThrow('EPOCH2_WIN32_CONFIG_OWNERSHIP_INVALID')
      expect(() => rawLease.inspectLegacyConfigBackups())
        .toThrow('EPOCH2_WIN32_CONFIG_OWNERSHIP_INVALID')
      expect(() => rawLease.ensureEpochRootMarker())
        .toThrow('EPOCH2_WIN32_EPOCH_ROOT_INVALID')
      expect(fs.readFileSync(path.join(layout.productRoot, 'chat.db'), 'utf8')).toBe('keep')
    } finally {
      rawLease.release()
    }
    expect(() => addon.acquireEpochRootLease({ ...request, productDirectory: 'Alternate' }))
      .toThrow('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
    fs.rmSync(directory, { recursive: true, force: true })
  })

  windowsIt('keeps TS and native manifest bytes aligned for Unicode, case and trailing-separator vectors', () => {
    const container = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-owned-contract-'))
    const decomposedName = `Cafe\u0301-MiXeD`
    const appDataRoot = path.join(container, decomposedName)
    fs.mkdirSync(appDataRoot)
    const layout = resolveEpoch2WorkspaceLayout({
      appDataRoot,
      homeRoot: os.homedir(),
      repositoryRoot: process.cwd(),
    })
    const manifest = createEpoch2RootManifest({ layout })
    const exactManifest = `${JSON.stringify(manifest, null, 2)}\n`
    const lease = acquireWin32EpochRootLease(layout)
    try {
      writeEpoch2TransitionOwnershipManifestAtomic({ layout, lease, manifest })
      fs.writeFileSync(path.join(layout.productRoot, 'chat.db'), 'unicode vector')
      expect(deleteEpoch2OwnedTarget({
        layout,
        lease,
        targetId: 'legacy_chat_db',
      }).exists).toBe(true)
    } finally {
      lease.release()
    }

    fs.writeFileSync(path.join(layout.productRoot, 'chat.db'), 'format drift')
    overwriteExistingFile(layout.transitionManifestPath, `${JSON.stringify(manifest)}\n`)
    const driftLease = acquireWin32EpochRootLease(layout)
    try {
      expect(() => deleteEpoch2OwnedTarget({
        layout,
        lease: driftLease,
        targetId: 'legacy_chat_db',
      })).toThrow('EPOCH2_WIN32_DELETE_OWNERSHIP_INVALID')
      expect(fs.readFileSync(path.join(layout.productRoot, 'chat.db'), 'utf8')).toBe('format drift')
    } finally {
      driftLease.release()
    }

    overwriteExistingFile(layout.transitionManifestPath, exactManifest)
    fs.mkdirSync(path.join(layout.productRoot, 'logs'))
    fs.writeFileSync(path.join(layout.productRoot, 'logs', 'vector.txt'), 'case vector')
    const addon = createRequire(import.meta.url)(
      path.resolve(process.cwd(), 'dist-native', 'win32-x64', 'starverse_epoch_win32.node'),
    ) as {
      acquireEpochRootLease(request: unknown): {
        deleteOwnedTarget(targetId: string): { exists: boolean }
        release(): void
      }
    }
    const request = createWin32EpochLeaseRequest(layout)
    const caseVariantRoot = path.join(
      path.dirname(layout.appDataRoot),
      decomposedName.toUpperCase(),
    ) + path.sep
    const rawLease = addon.acquireEpochRootLease({ ...request, appDataRoot: caseVariantRoot })
    try {
      expect(rawLease.deleteOwnedTarget('legacy_logs').exists).toBe(true)
      expect(fs.existsSync(path.join(layout.productRoot, 'logs'))).toBe(false)
    } finally {
      rawLease.release()
      fs.rmSync(container, { recursive: true, force: true })
    }
  })

  windowsIt('requires the lease-bound ownership manifest and accepts only fixed target ids', () => {
    withLease('starverse-owned-authority', (fixture) => {
      fs.writeFileSync(path.join(fixture.layout.productRoot, 'chat.db'), 'legacy')
      expect(() => inspectEpoch2OwnedTarget({
        layout: fixture.layout,
        lease: fixture.lease,
        targetId: 'legacy_chat_db',
      })).toThrow('EPOCH2_DELETE_OWNERSHIP_INVALID')

      publishManifest(fixture)
      expect(() => deleteEpoch2OwnedTarget({
        layout: fixture.layout,
        lease: fixture.lease,
        targetId: '../config.json' as never,
      }))
        .toThrow('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
      expect(fs.readFileSync(path.join(fixture.layout.productRoot, 'chat.db'), 'utf8')).toBe('legacy')
    })
  })

  windowsIt('deletes a fixed legacy tree post-order and leaves protected product state intact', () => {
    withLease('starverse-owned-tree', (fixture) => {
      publishManifest(fixture)
      const target = path.join(fixture.layout.productRoot, 'assets')
      const nested = path.join(target, 'nested', 'deeper')
      fs.mkdirSync(nested, { recursive: true })
      fs.writeFileSync(path.join(target, 'root.bin'), 'root')
      const readonly = path.join(nested, 'readonly.bin')
      fs.writeFileSync(readonly, 'nested')
      fs.chmodSync(readonly, 0o444)
      const outsideHardlinkSource = path.join(fixture.directory, 'outside-hardlink.bin')
      fs.writeFileSync(outsideHardlinkSource, 'outside hardlink content')
      fs.linkSync(outsideHardlinkSource, path.join(nested, 'hardlink.bin'))
      fs.writeFileSync(path.join(fixture.layout.productRoot, 'config.json'), '{"keep":true}')

      expect(inspectEpoch2OwnedTarget({
        layout: fixture.layout,
        lease: fixture.lease,
        targetId: 'legacy_assets',
      })).toMatchObject({ exists: true, files: 3, directories: 3 })

      expect(deleteEpoch2OwnedTarget({
        layout: fixture.layout,
        lease: fixture.lease,
        targetId: 'legacy_assets',
      })).toMatchObject({ exists: true, files: 3, directories: 3 })
      expect(fs.existsSync(target)).toBe(false)
      expect(fs.readFileSync(outsideHardlinkSource, 'utf8')).toBe('outside hardlink content')
      expect(fs.readFileSync(path.join(fixture.layout.productRoot, 'config.json'), 'utf8'))
        .toBe('{"keep":true}')
      expect(deleteEpoch2OwnedTarget({
        layout: fixture.layout,
        lease: fixture.lease,
        targetId: 'legacy_assets',
      })).toEqual({ exists: false, files: 0, directories: 0 })
    })
  })

  windowsIt('handles a deeply nested fixed target within the explicit native bounds', () => {
    withLease('starverse-owned-deep', (fixture) => {
      publishManifest(fixture)
      let cursor = path.join(fixture.layout.productRoot, 'debug')
      fs.mkdirSync(cursor)
      for (let index = 0; index < 64; index += 1) {
        cursor = path.join(cursor, `d${index}`)
        fs.mkdirSync(cursor)
      }
      fs.writeFileSync(path.join(cursor, 'leaf.txt'), 'leaf')
      expect(deleteEpoch2OwnedTarget({
        layout: fixture.layout,
        lease: fixture.lease,
        targetId: 'legacy_debug',
      })).toMatchObject({ exists: true, files: 1, directories: 65 })
      expect(fs.existsSync(path.join(fixture.layout.productRoot, 'debug'))).toBe(false)
    })
  })

  windowsIt('fails closed without mutation while the fixed target is exclusively occupied', async () => {
    const fixture = createFixture('starverse-owned-occupied')
    const target = path.join(fixture.layout.productRoot, 'chat.db')
    const ready = path.join(fixture.directory, 'lock-ready')
    const release = path.join(fixture.directory, 'lock-release')
    fs.writeFileSync(target, 'occupied')
    publishManifest(fixture)
    const child = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$stream=[System.IO.File]::Open($env:LOCK_TARGET,"Open","Read","None");' +
        '[System.IO.File]::WriteAllText($env:LOCK_READY,"ready");' +
        'while(-not [System.IO.File]::Exists($env:LOCK_RELEASE)){Start-Sleep -Milliseconds 20};' +
        '$stream.Dispose()',
    ], {
      env: { ...process.env, LOCK_TARGET: target, LOCK_READY: ready, LOCK_RELEASE: release },
      stdio: 'ignore',
    })
    try {
      try {
        await waitUntil(() => fs.existsSync(ready))
        expect(() => deleteEpoch2OwnedTarget({
          layout: fixture.layout,
          lease: fixture.lease,
          targetId: 'legacy_chat_db',
        })).toThrow('EPOCH2_WIN32_DELETE_TARGET_OPEN_FAILED')
      } finally {
        fs.writeFileSync(release, 'release')
        await new Promise<void>((resolve) => {
          if (child.exitCode !== null) resolve()
          else child.once('exit', () => resolve())
        })
      }
      expect(fs.readFileSync(target, 'utf8')).toBe('occupied')
    } finally {
      fixture.lease.release()
      fs.rmSync(fixture.directory, { recursive: true, force: true })
    }
  })

  windowsIt('rejects protected epoch-2 descendants and any nested reparse point before mutation', () => {
    withLease('starverse-owned-protected', (fixture) => {
      publishManifest(fixture)
      fs.mkdirSync(fixture.layout.epochRoot, { recursive: true })
      fs.writeFileSync(path.join(fixture.layout.epochRoot, 'sentinel.txt'), 'keep')
      expect(() => deleteEpoch2OwnedTarget({
        layout: fixture.layout,
        lease: fixture.lease,
        targetId: 'legacy_workspace',
      })).toThrow('EPOCH2_WIN32_DELETE_PROTECTED_DESCENDANT')
      expect(fs.readFileSync(path.join(fixture.layout.epochRoot, 'sentinel.txt'), 'utf8')).toBe('keep')

      const outside = path.join(fixture.directory, 'outside')
      const target = path.join(fixture.layout.productRoot, 'logs')
      fs.mkdirSync(outside)
      fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'outside')
      fs.mkdirSync(target)
      fs.writeFileSync(path.join(target, 'before.txt'), 'keep until rejected')
      fs.symlinkSync(outside, path.join(target, 'linked'), 'junction')
      expect(() => deleteEpoch2OwnedTarget({
        layout: fixture.layout,
        lease: fixture.lease,
        targetId: 'legacy_logs',
      })).toThrow('EPOCH2_WIN32_DELETE_REPARSE_POINT')
      expect(fs.readFileSync(path.join(target, 'before.txt'), 'utf8')).toBe('keep until rejected')
      expect(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8')).toBe('outside')
    })
  })

  windowsIt('holds a pre-existing canonical epoch-2 child against rename for the lease lifetime', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-owned-epoch-held-'))
    const layout = resolveEpoch2WorkspaceLayout({
      appDataRoot: directory,
      homeRoot: os.homedir(),
      repositoryRoot: process.cwd(),
    })
    fs.mkdirSync(layout.epochRoot, { recursive: true })
    const sentinel = path.join(layout.epochRoot, 'sentinel.txt')
    fs.writeFileSync(sentinel, 'current epoch')
    const lease = acquireWin32EpochRootLease(layout)
    try {
      writeEpoch2TransitionOwnershipManifestAtomic({
        layout,
        lease,
        manifest: createEpoch2RootManifest({ layout }),
      })
      const renamedEpoch = path.join(layout.workspaceRoot, 'renamed-epoch')
      fs.renameSync(layout.epochRoot, renamedEpoch)
      expect(() => deleteEpoch2OwnedTarget({
        layout,
        lease,
        targetId: 'legacy_workspace',
      })).toThrow('EPOCH2_WIN32_DELETE_PROTECTED_DESCENDANT')
      expect(fs.readFileSync(path.join(renamedEpoch, 'sentinel.txt'), 'utf8')).toBe('current epoch')
      const renamedAsLegacyTarget = path.join(layout.productRoot, 'assets')
      fs.renameSync(renamedEpoch, renamedAsLegacyTarget)
      expect(() => deleteEpoch2OwnedTarget({
        layout,
        lease,
        targetId: 'legacy_assets',
      })).toThrow('EPOCH2_WIN32_DELETE_PROTECTED_DESCENDANT')
      expect(fs.readFileSync(path.join(renamedAsLegacyTarget, 'sentinel.txt'), 'utf8'))
        .toBe('current epoch')
    } finally {
      lease.release()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  windowsIt('cleans only exact crash-temporary regular files and fails closed on near matches', () => {
    withLease('starverse-transition-temp', (fixture) => {
      const valid = `.svtmp-${'a'.repeat(32)}`
      fs.writeFileSync(path.join(fixture.layout.transitionRoot, valid), 'temporary')
      expect(cleanupEpoch2TransitionTemps({
        layout: fixture.layout,
        lease: fixture.lease,
      })).toBe(1)
      expect(fs.existsSync(path.join(fixture.layout.transitionRoot, valid))).toBe(false)

      const invalid = `.svtmp-${'b'.repeat(31)}z`
      const validBeforeInvalid = `.svtmp-${'0'.repeat(32)}`
      fs.writeFileSync(path.join(fixture.layout.transitionRoot, validBeforeInvalid), 'must remain')
      fs.writeFileSync(path.join(fixture.layout.transitionRoot, invalid), 'near match')
      expect(() => cleanupEpoch2TransitionTemps({
        layout: fixture.layout,
        lease: fixture.lease,
      })).toThrow('EPOCH2_WIN32_TEMP_NAME_INVALID')
      expect(fs.existsSync(path.join(fixture.layout.transitionRoot, invalid))).toBe(true)
      expect(fs.existsSync(path.join(fixture.layout.transitionRoot, validBeforeInvalid))).toBe(true)
      expect(fs.existsSync(fixture.layout.lockPath)).toBe(true)
    })
  })

  windowsIt('rejects exact-name crash-temp directories and released lease use', () => {
    const fixture = createFixture('starverse-transition-temp-dir')
    const exactDirectory = path.join(fixture.layout.transitionRoot, `.svtmp-${'c'.repeat(32)}`)
    fs.mkdirSync(exactDirectory)
    try {
      expect(() => cleanupEpoch2TransitionTemps({
        layout: fixture.layout,
        lease: fixture.lease,
      })).toThrow('EPOCH2_WIN32_TEMP_INVALID')
      expect(fs.existsSync(exactDirectory)).toBe(true)
      fixture.lease.release()
      expect(() => cleanupEpoch2TransitionTemps({
        layout: fixture.layout,
        lease: fixture.lease,
      })).toThrow('EPOCH2_WIN32_LEASE_RELEASED')
    } finally {
      fixture.lease.release()
      fs.rmSync(fixture.directory, { recursive: true, force: true })
    }
  })

  windowsIt('rejects an exact-name crash-temp reparse point without touching its target', () => {
    withLease('starverse-transition-temp-reparse', (fixture) => {
      const outside = path.join(fixture.directory, 'outside-temp')
      fs.mkdirSync(outside)
      fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'outside')
      fs.symlinkSync(
        outside,
        path.join(fixture.layout.transitionRoot, `.svtmp-${'d'.repeat(32)}`),
        'junction',
      )
      expect(() => cleanupEpoch2TransitionTemps({
        layout: fixture.layout,
        lease: fixture.lease,
      })).toThrow('EPOCH2_WIN32_TEMP_REPARSE_OR_CHANGED')
      expect(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8')).toBe('outside')
    })
  })
})
