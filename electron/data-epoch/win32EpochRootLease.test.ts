import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveEpoch2WorkspaceLayout } from './rootManifest'
import type { Epoch2WorkspaceLayout } from './rootManifest'
import {
  acquireWin32EpochRootLease,
  createWin32EpochLeaseRequest,
  Win32EpochRootLeaseError,
} from './win32EpochRootLease'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []

function makeLayout(appDataRoot?: string) {
  const root = appDataRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-epoch-native-'))
  if (!appDataRoot) roots.push(root)
  return resolveEpoch2WorkspaceLayout({
    appDataRoot: root,
    homeRoot: os.homedir(),
  })
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('win32 epoch root lease', () => {
  windowsIt('holds one cross-process authority and releases it explicitly', () => {
    const layout = makeLayout()
    const lease = acquireWin32EpochRootLease(layout)
    try {
      const identity = lease.rootIdentity()
      expect(identity.volumeSerial).toMatch(/^[0-9a-f]{16}$/)
      expect(identity.transitionFileId).toMatch(/^[0-9a-f]{32}$/)

      const addonPath = path.resolve('dist-native/win32-x64/starverse_epoch_win32.node')
      const childScript = [
        "const addon = require(process.argv[1])",
        "const request = JSON.parse(process.argv[2])",
        "try { addon.acquireEpochRootLease(request); process.exit(2) }",
        "catch (error) { process.stdout.write(String(error.code)); process.exit(error.code === 'EPOCH2_WIN32_LEASE_BUSY' ? 0 : 3) }",
      ].join('\n')
      const output = execFileSync(process.execPath, [
        '-e',
        childScript,
        addonPath,
        JSON.stringify(createWin32EpochLeaseRequest(layout)),
      ], { encoding: 'utf8' })
      expect(output).toBe('EPOCH2_WIN32_LEASE_BUSY')
    } finally {
      lease.release()
    }
    expect(() => lease.rootIdentity()).toThrowError(
      new Win32EpochRootLeaseError('EPOCH2_WIN32_LEASE_RELEASED'),
    )
    const reacquired = acquireWin32EpochRootLease(layout)
    reacquired.release()
  })

  windowsIt('rejects a junction in the app-data ancestry without following it', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-epoch-native-junction-'))
    roots.push(fixtureRoot)
    const target = path.join(fixtureRoot, 'target')
    const nested = path.join(target, 'nested')
    const junction = path.join(fixtureRoot, 'junction')
    fs.mkdirSync(nested, { recursive: true })
    fs.symlinkSync(target, junction, 'junction')
    const layout = makeLayout(path.join(junction, 'nested'))
    expect(() => acquireWin32EpochRootLease(layout)).toThrowError(
      new Win32EpochRootLeaseError('EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED'),
    )
    expect(fs.readdirSync(target)).toEqual(['nested'])
  })

  windowsIt('reads and atomically replaces only the two bounded transition files', () => {
    const layout = makeLayout()
    const lease = acquireWin32EpochRootLease(layout)
    try {
      expect(lease.readTransitionFile('transition_manifest')).toBeNull()
      const first = Buffer.from('{"version":1}\n', 'utf8')
      const second = Buffer.from('{"version":2}\n', 'utf8')
      expect(lease.writeTransitionFile('transition_manifest', first)).toBe('written')
      expect(Buffer.from(lease.readTransitionFile('transition_manifest')!)).toEqual(first)
      expect(lease.writeTransitionFile('transition_manifest', second)).toBe('exists')
      expect(Buffer.from(lease.readTransitionFile('transition_manifest')!)).toEqual(first)
      expect(lease.writeTransitionFile('reset_journal', second)).toBe('written')
      expect(Buffer.from(lease.readTransitionFile('reset_journal')!)).toEqual(second)
      expect(() => lease.writeTransitionFile(
        'transition_manifest',
        new Uint8Array(4 * 1024 + 1),
      )).toThrowError(new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID'))
      expect(fs.readdirSync(layout.transitionRoot).sort()).toEqual([
        'epoch-transition.journal.json',
        'epoch-transition.lock',
        'root-manifest.json',
      ])
    } finally {
      lease.release()
    }
  })

  windowsIt('recovers the OS-owned lock after an unclean holder exit', async () => {
    const layout = makeLayout()
    const addonPath = path.resolve('dist-native/win32-x64/starverse_epoch_win32.node')
    const childScript = [
      "const addon = require(process.argv[1])",
      "globalThis.lease = addon.acquireEpochRootLease(JSON.parse(process.argv[2]))",
      "process.stdout.write('ready\\n')",
      "setInterval(() => {}, 1000)",
    ].join('\n')
    const child = spawn(process.execPath, [
      '-e',
      childScript,
      addonPath,
      JSON.stringify(createWin32EpochLeaseRequest(layout)),
    ], { stdio: ['ignore', 'pipe', 'inherit'] })
    await once(child.stdout, 'data')
    expect(child.kill()).toBe(true)
    await once(child, 'exit')

    const recovered = acquireWin32EpochRootLease(layout)
    try {
      expect(recovered.rootIdentity().transitionFileId).toMatch(/^[0-9a-f]{32}$/)
    } finally {
      recovered.release()
    }
  })

  windowsIt('rejects detached native methods after the wrapped object is collected', () => {
    const layout = makeLayout()
    const addonPath = path.resolve('dist-native/win32-x64/starverse_epoch_win32.node')
    const childScript = [
      "const addon = require(process.argv[1])",
      "let lease = addon.acquireEpochRootLease(JSON.parse(process.argv[2]))",
      "const detached = lease.rootIdentity",
      "lease = null",
      "for (let index = 0; index < 4; index += 1) global.gc()",
      "try { detached(); process.exit(2) }",
      "catch (error) { process.stdout.write(String(error.code)); process.exit(error.code === 'EPOCH2_WIN32_NATIVE_INPUT_INVALID' ? 0 : 3) }",
    ].join('\n')
    const output = execFileSync(process.execPath, [
      '--expose-gc',
      '-e',
      childScript,
      addonPath,
      JSON.stringify(createWin32EpochLeaseRequest(layout)),
    ], { encoding: 'utf8' })
    expect(output).toBe('EPOCH2_WIN32_NATIVE_INPUT_INVALID')
  })

  it('derives a stable, root-scoped mutex request without loading native code', () => {
    const layout = makeLayout()
    const first = createWin32EpochLeaseRequest(layout)
    const second = createWin32EpochLeaseRequest(layout)
    expect(first).toEqual(second)
    expect(first.mutexName).toMatch(/^Local\\Starverse\.Epoch2\.[0-9a-f]{64}$/)
    expect(first.productDirectory).toBe('Starverse')
    expect(first.transitionDirectory).toBe('.epoch-transition')
  })

  it('rejects cloned or structurally forged layouts before native loading', () => {
    const layout = makeLayout()
    const clone = JSON.parse(JSON.stringify(layout)) as Epoch2WorkspaceLayout
    const forged = {
      ...layout,
      appDataRoot: path.join(os.tmpdir(), 'caller-selected-root'),
      productRoot: path.join(os.tmpdir(), 'caller-selected-root', 'Starverse'),
    } as Epoch2WorkspaceLayout
    expect(() => createWin32EpochLeaseRequest(clone)).toThrowError(
      new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID'),
    )
    expect(() => createWin32EpochLeaseRequest(forged)).toThrowError(
      new Win32EpochRootLeaseError('EPOCH2_WIN32_NATIVE_INPUT_INVALID'),
    )
  })
})
