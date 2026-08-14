import fs from 'node:fs'

export class LinuxCredentialStoragePermissionError extends Error {
  constructor(readonly code: 'LINUX_CREDENTIAL_STORAGE_PERMISSION_INVALID') {
    super(code)
    this.name = 'LinuxCredentialStoragePermissionError'
  }
}

type PermissionFs = Pick<typeof fs, 'chmodSync' | 'existsSync' | 'lstatSync'>

export function isOwnerOnlyCredentialStorageMode(mode: number): boolean {
  return (mode & 0o077) === 0
}

/** Restrict files that may contain explicit plaintext credentials before use. */
export function enforceLinuxCredentialStoragePermissions(input: Readonly<{
  platform: NodeJS.Platform
  directories: readonly string[]
  files: readonly string[]
  optionalFiles?: readonly string[]
  fs?: PermissionFs
}>): void {
  if (input.platform !== 'linux') return
  const fileSystem = input.fs ?? fs
  const restrict = (target: string, mode: number, expected: 'directory' | 'file'): void => {
    if (!fileSystem.existsSync(target)) {
      throw new LinuxCredentialStoragePermissionError('LINUX_CREDENTIAL_STORAGE_PERMISSION_INVALID')
    }
    try {
      const before = fileSystem.lstatSync(target)
      if (before.isSymbolicLink() || (expected === 'directory' ? !before.isDirectory() : !before.isFile())) {
        throw new Error('unexpected_target_type')
      }
      fileSystem.chmodSync(target, mode)
      const after = fileSystem.lstatSync(target)
      if (after.isSymbolicLink() || (expected === 'directory' ? !after.isDirectory() : !after.isFile()) ||
          after.dev !== before.dev || after.ino !== before.ino ||
          !isOwnerOnlyCredentialStorageMode(after.mode) ||
          (typeof process.getuid === 'function' && after.uid !== process.getuid())) {
        throw new Error('mode_not_owner_only')
      }
    } catch {
      throw new LinuxCredentialStoragePermissionError('LINUX_CREDENTIAL_STORAGE_PERMISSION_INVALID')
    }
  }
  for (const directory of input.directories) restrict(directory, 0o700, 'directory')
  for (const file of input.files) restrict(file, 0o600, 'file')
  for (const file of input.optionalFiles ?? []) {
    if (fileSystem.existsSync(file)) restrict(file, 0o600, 'file')
  }
}
