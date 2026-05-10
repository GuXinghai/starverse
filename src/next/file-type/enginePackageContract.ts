import type { EngineId, EnginePlatform } from './externalEngineTypes'

export const PACKAGE_ARTIFACT_CLASSES = [
  'runtime',
  'model',
  'config',
  'wrapper',
  'manifest',
  'signature',
  'license',
  'attribution',
  'healthcheck',
] as const
export type PackageArtifactClass = (typeof PACKAGE_ARTIFACT_CLASSES)[number]

export type PackageFileEntry = Readonly<{
  relativePath: string
  artifactClass: PackageArtifactClass
  sha256?: string | null
  required?: boolean
}>

export type RuntimePackageInventory = Readonly<{
  schemaVersion: '1'
  engineId: EngineId
  packageVersion: string
  platform: EnginePlatform
  modelVersion?: string | null
  files: readonly PackageFileEntry[]
  license?: string | null
  attribution?: string | null
}>

export type PackageValidationIssue = Readonly<{
  field: string
  message: string
}>

export type PackageInventoryValidation =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; issues: readonly PackageValidationIssue[] }>

export type PackageFilePathValidation =
  | Readonly<{ ok: true; normalized: string }>
  | Readonly<{ ok: false; reason: string }>

export type PackageRequiredClassesValidation =
  | Readonly<{ ok: true; classes: readonly PackageArtifactClass[] }>
  | Readonly<{ ok: false; missing: readonly PackageArtifactClass[]; issues: readonly PackageValidationIssue[] }>

const VALID_PLATFORMS = new Set(['any', 'win32', 'darwin', 'linux'])
const VALID_CLASSES = new Set<string>(PACKAGE_ARTIFACT_CLASSES)
const SHA256_HEX_RE = /^[a-f0-9]{64}$/u

export function validatePackageFilePath(rawPath: string): PackageFilePathValidation {
  const normalized = normalizePackageFilePath(rawPath)
  if (!normalized) {
    return { ok: false, reason: 'path is empty' }
  }
  if (normalized.includes('\u0000')) {
    return { ok: false, reason: 'path contains NUL byte' }
  }
  if (/^[A-Za-z]:[/\\]/.test(normalized)) {
    return { ok: false, reason: 'path must be relative, not absolute' }
  }
  if (normalized.startsWith('/') || normalized.startsWith('\\')) {
    return { ok: false, reason: 'path must be relative, not absolute' }
  }
  const segments = normalized.replace(/\\/g, '/').split('/')
  if (segments.some((s) => s === '..')) {
    return { ok: false, reason: 'path must not contain .. traversal' }
  }
  if (
    normalized.includes('\u2024') ||
    normalized.includes('\u2025') ||
    normalized.includes('\uFE30')
  ) {
    return { ok: false, reason: 'path must not contain traversal characters' }
  }
  if (normalized.startsWith('.')) {
    const firstSeg = segments[0] ?? ''
    if (firstSeg === '' || firstSeg === '.' || firstSeg === '..') {
      return { ok: false, reason: 'path must be a relative path inside the package root' }
    }
  }
  return { ok: true, normalized }
}

export function normalizePackageFilePath(rawPath: string): string | null {
  if (typeof rawPath !== 'string') return null
  const trimmed = rawPath.trim()
  if (trimmed.length === 0) return null
  return trimmed.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\/+/, '') || null
}

export function validateRuntimePackageInventory(
  input: unknown
): PackageInventoryValidation {
  const issues: PackageValidationIssue[] = []

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, issues: [{ field: 'root', message: 'inventory must be an object' }] }
  }

  const source = input as Record<string, unknown>

  const schemaVersion = source.schemaVersion
  if (schemaVersion !== '1') {
    issues.push({ field: 'schemaVersion', message: 'schemaVersion must be "1"' })
  }

  const engineId = typeof source.engineId === 'string' ? source.engineId.trim() : ''
  if (!engineId) {
    issues.push({ field: 'engineId', message: 'engineId is required' })
  }

  const packageVersion =
    typeof source.packageVersion === 'string' ? source.packageVersion.trim() : ''
  if (!packageVersion) {
    issues.push({ field: 'packageVersion', message: 'packageVersion is required' })
  }

  const platform = source.platform
  if (typeof platform !== 'string' || !VALID_PLATFORMS.has(platform)) {
    issues.push({
      field: 'platform',
      message: 'platform must be one of any/win32/darwin/linux',
    })
  }

  const files = source.files
  if (!Array.isArray(files)) {
    issues.push({ field: 'files', message: 'files must be an array' })
  } else {
    validatePackageFiles(files, issues)
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  return { ok: true }
}

function validatePackageFiles(
  files: unknown[],
  issues: PackageValidationIssue[]
): void {
  if (files.length === 0) {
    issues.push({ field: 'files', message: 'files must not be empty' })
    return
  }

  const paths = new Set<string>()
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (!file || typeof file !== 'object') {
      issues.push({ field: `files[${i}]`, message: 'each file entry must be an object' })
      continue
    }
    const entry = file as Record<string, unknown>

    const rawPath = typeof entry.relativePath === 'string' ? entry.relativePath : ''
    const pathResult = validatePackageFilePath(rawPath)
    if (!pathResult.ok) {
      issues.push({ field: `files[${i}].relativePath`, message: pathResult.reason })
    } else {
      if (paths.has(pathResult.normalized)) {
        issues.push({
          field: `files[${i}].relativePath`,
          message: 'duplicate relative path in inventory',
        })
      }
      paths.add(pathResult.normalized)
    }

    const artifactClass = entry.artifactClass
    if (typeof artifactClass !== 'string' || !VALID_CLASSES.has(artifactClass)) {
      issues.push({
        field: `files[${i}].artifactClass`,
        message: `artifactClass must be one of ${PACKAGE_ARTIFACT_CLASSES.join('/')}`,
      })
    }

    if (entry.sha256 !== undefined && entry.sha256 !== null) {
      if (typeof entry.sha256 !== 'string' || !SHA256_HEX_RE.test(entry.sha256.trim())) {
        issues.push({
          field: `files[${i}].sha256`,
          message: 'sha256 must be a 64-char hex string or null',
        })
      }
    }

    if (entry.required !== undefined && typeof entry.required !== 'boolean') {
      issues.push({
        field: `files[${i}].required`,
        message: 'required must be a boolean',
      })
    }
  }
}

export function collectPackageArtifactClasses(
  inventory: RuntimePackageInventory
): readonly PackageArtifactClass[] {
  const classes = new Set<PackageArtifactClass>()
  for (const file of inventory.files) {
    classes.add(file.artifactClass)
  }
  return Array.from(classes).sort()
}

export function validatePackageRequiredArtifacts(
  inventory: RuntimePackageInventory,
  requiredClasses: readonly PackageArtifactClass[]
): PackageRequiredClassesValidation {
  const present = new Set(collectPackageArtifactClasses(inventory))
  const missing: PackageArtifactClass[] = []
  const issues: PackageValidationIssue[] = []

  for (const reqClass of requiredClasses) {
    if (!present.has(reqClass)) {
      missing.push(reqClass)
      issues.push({
        field: 'files',
        message: `required artifact class missing: ${reqClass}`,
      })
    }
  }

  if (missing.length > 0) {
    return { ok: false, missing, issues }
  }

  return { ok: true, classes: requiredClasses }
}

export function hasPackageRequiredLicenses(
  inventory: RuntimePackageInventory
): boolean {
  const hasLicenseFile = inventory.files.some(
    (f) => f.artifactClass === 'license'
  )
  const hasLicenseField =
    typeof inventory.license === 'string' && inventory.license.trim().length > 0
  return hasLicenseFile || hasLicenseField
}

export function hasPackageRequiredAttributions(
  inventory: RuntimePackageInventory
): boolean {
  const hasAttributionFile = inventory.files.some(
    (f) => f.artifactClass === 'attribution'
  )
  const hasAttributionField =
    typeof inventory.attribution === 'string' && inventory.attribution.trim().length > 0
  return hasAttributionFile || hasAttributionField
}

export function formatPackageIssues(
  issues: readonly PackageValidationIssue[]
): string {
  return issues
    .map((issue) => {
      const clean = issue.message
        .replace(/[A-Za-z]:\\[^\s]+/g, '[redacted-path]')
        .replace(/\/[^\s]+\/[^\s]+/g, '[redacted-path]')
      return `${issue.field}: ${clean}`
    })
    .join('; ')
}

export function createPackageFileEntry(
  overrides?: Partial<PackageFileEntry>
): PackageFileEntry {
  return {
    relativePath: overrides?.relativePath ?? '',
    artifactClass: overrides?.artifactClass ?? 'runtime',
    sha256: overrides?.sha256 ?? null,
    required: overrides?.required ?? false,
  }
}

export function createRuntimePackageInventory(
  overrides?: Partial<Omit<RuntimePackageInventory, 'files'>>,
  files: readonly PackageFileEntry[] = []
): RuntimePackageInventory {
  return {
    schemaVersion: '1',
    engineId: overrides?.engineId ?? ('' as EngineId),
    packageVersion: overrides?.packageVersion ?? '0.0.0',
    platform: overrides?.platform ?? 'any',
    modelVersion: overrides?.modelVersion ?? null,
    files,
    license: overrides?.license ?? null,
    attribution: overrides?.attribution ?? null,
  }
}
