import { describe, expect, it, vi } from 'vitest'
import {
  enforceLinuxCredentialStoragePermissions,
  isOwnerOnlyCredentialStorageMode,
} from './linuxCredentialStoragePermissions'

describe('linuxCredentialStoragePermissions', () => {
  it('recognizes modes with no group or other access', () => {
    expect(isOwnerOnlyCredentialStorageMode(0o700)).toBe(true)
    expect(isOwnerOnlyCredentialStorageMode(0o600)).toBe(true)
    expect(isOwnerOnlyCredentialStorageMode(0o640)).toBe(false)
    expect(isOwnerOnlyCredentialStorageMode(0o604)).toBe(false)
  })

  it('restricts existing credential directories and files then verifies them', () => {
    const modes = new Map<string, number>([['/app', 0o755], ['/app/config.json', 0o644]])
    const facts = (value: string) => ({ mode: modes.get(value)!, dev: 1, ino: value === '/app' ? 1 : 2,
      uid: typeof process.getuid === 'function' ? process.getuid() : 0,
      isSymbolicLink: () => false, isDirectory: () => value === '/app', isFile: () => value !== '/app' })
    const fileSystem = {
      existsSync: vi.fn((value: string) => modes.has(value)),
      chmodSync: vi.fn((value: string, mode: number) => { modes.set(value, mode) }),
      lstatSync: vi.fn(facts),
    }
    enforceLinuxCredentialStoragePermissions({ platform: 'linux', directories: ['/app'], files: ['/app/config.json'], fs: fileSystem as never })
    expect(fileSystem.chmodSync).toHaveBeenNthCalledWith(1, '/app', 0o700)
    expect(fileSystem.chmodSync).toHaveBeenNthCalledWith(2, '/app/config.json', 0o600)
  })

  it('fails closed when owner-only permissions cannot be verified', () => {
    const fileSystem = {
      existsSync: () => true,
      chmodSync: () => undefined,
      lstatSync: () => ({ mode: 0o644, dev: 1, ino: 1, uid: typeof process.getuid === 'function' ? process.getuid() : 0,
        isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true }),
    }
    expect(() => enforceLinuxCredentialStoragePermissions({ platform: 'linux', directories: [], files: ['/app/config.json'], fs: fileSystem as never }))
      .toThrow('LINUX_CREDENTIAL_STORAGE_PERMISSION_INVALID')
  })

  it('fails closed when a required credential target is missing', () => {
    const fileSystem = { existsSync: () => false, chmodSync: () => undefined, lstatSync: () => { throw new Error('missing') } }
    expect(() => enforceLinuxCredentialStoragePermissions({ platform: 'linux', directories: [], files: ['/app/config.json'], fs: fileSystem as never }))
      .toThrow('LINUX_CREDENTIAL_STORAGE_PERMISSION_INVALID')
  })

  it('restricts present SQLite sidecars but does not require absent optional sidecars', () => {
    const modes = new Map<string, number>([['/app/db-wal', 0o644]])
    const fileSystem = {
      existsSync: (value: string) => modes.has(value),
      chmodSync: (value: string, mode: number) => { modes.set(value, mode) },
      lstatSync: (value: string) => ({ mode: modes.get(value)!, dev: 1, ino: 1,
        uid: typeof process.getuid === 'function' ? process.getuid() : 0,
        isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true }),
    }
    enforceLinuxCredentialStoragePermissions({ platform: 'linux', directories: [], files: [],
      optionalFiles: ['/app/db-wal', '/app/db-shm'], fs: fileSystem as never })
    expect(modes.get('/app/db-wal')).toBe(0o600)
  })

  it('rejects symlinks and unexpected target types', () => {
    const fileSystem = {
      existsSync: () => true,
      chmodSync: vi.fn(),
      lstatSync: () => ({ mode: 0o600, dev: 1, ino: 1,
        uid: typeof process.getuid === 'function' ? process.getuid() : 0,
        isSymbolicLink: () => true, isDirectory: () => false, isFile: () => true }),
    }
    expect(() => enforceLinuxCredentialStoragePermissions({ platform: 'linux', directories: [], files: ['/app/config.json'], fs: fileSystem as never }))
      .toThrow('LINUX_CREDENTIAL_STORAGE_PERMISSION_INVALID')
    expect(fileSystem.chmodSync).not.toHaveBeenCalled()
  })
})
