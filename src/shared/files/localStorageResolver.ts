import path from 'node:path'

export type ManagedStorageResolution =
  | Readonly<{ kind: 'ok'; path: string }>
  | Readonly<{ kind: 'missing' }>
  | Readonly<{
      kind: 'invalid'
      code: 'attachment_storage_uri_invalid' | 'attachment_local_path_outside_storage_root'
      message: string
    }>

export function resolveManagedStoragePath(
  storageRootDir: string,
  storageUri: string | null | undefined,
  options?: Readonly<{
    backend?: string | null
    deletedAt?: number | null
  }>
): ManagedStorageResolution {
  if (options?.backend && options.backend !== 'local_fs') return { kind: 'missing' }
  if (options?.deletedAt != null) return { kind: 'missing' }

  const normalized = String(storageUri ?? '').trim()
  if (!normalized) return { kind: 'missing' }
  if (normalized.includes('\\')) {
    return invalidStorageUri('Storage URI must use forward slashes and cannot contain backslashes.')
  }
  if (
    path.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    path.posix.isAbsolute(normalized) ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.startsWith('//')
  ) {
    return invalidStorageUri('Storage URI must be relative to the file storage root.')
  }

  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    return invalidStorageUri('Storage URI cannot contain relative path traversal segments.')
  }
  if (!isAllowedStorageUriPrefix(segments)) {
    return invalidStorageUri('Storage URI must be under assets/blobs, assets/original, or assets/derived.')
  }

  const root = path.resolve(String(storageRootDir ?? '').trim())
  if (!root) {
    return invalidStorageUri('Storage root directory is required.')
  }
  const finalPath = path.resolve(root, ...segments)
  if (!isPathInside(root, finalPath)) {
    return {
      kind: 'invalid',
      code: 'attachment_local_path_outside_storage_root',
      message: 'Resolved attachment path is outside the file storage root.',
    }
  }
  return { kind: 'ok', path: finalPath }
}

function invalidStorageUri(message: string): ManagedStorageResolution {
  return { kind: 'invalid', code: 'attachment_storage_uri_invalid', message }
}

function isAllowedStorageUriPrefix(segments: string[]): boolean {
  return (
    segments.length >= 3 &&
    segments[0] === 'assets' &&
    (segments[1] === 'blobs' || segments[1] === 'original' || segments[1] === 'derived')
  )
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}
