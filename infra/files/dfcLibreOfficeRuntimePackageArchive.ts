import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { validatePluginPackageInventory } from '../../src/next/plugin-distribution/artifactInventory'
import { validatePluginPackageManifest } from '../../src/next/plugin-distribution/packageManifest'
import { sanitizePluginDistributionText } from '../../src/next/plugin-distribution/sanitization'
import type { PluginPackageArtifact } from '../../src/next/plugin-distribution/types'
import { validateSafeRelativePath } from '../../src/next/plugin-distribution/validation'
import {
  DFC_OFFICE_PDF_CAPABILITIES,
  DFC_OFFICE_PDF_DISPLAY_NAME,
  DFC_OFFICE_PDF_PLUGIN_ID,
  DFC_OFFICE_PDF_RUNTIME_ID,
  DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
  type DfcOfficePdfRuntimeManifest,
} from './dfcManagedLibreOfficeRuntime'
import {
  importDfcLibreOfficeManagedRuntimePackage,
  type DfcLibreOfficeManagedPackageInstallResult,
} from './dfcLibreOfficeManagedPackageInstaller'

export const DFC_LIBREOFFICE_SVPKG_MANIFEST = 'manifest.json'
export const DFC_LIBREOFFICE_SVPKG_INVENTORY = 'inventory.json'
export const DFC_LIBREOFFICE_SVPKG_RUNTIME_ROOT = 'runtime'
export const DFC_LIBREOFFICE_SVPKG_RUNTIME_MANIFEST = 'runtime/manifest.json'

export type DfcLibreOfficeRuntimePackageArchiveDiagnosticCode =
  | 'office_pdf_svpkg_extract_path_rejected'
  | 'office_pdf_svpkg_extract_failed'
  | 'office_pdf_svpkg_manifest_missing'
  | 'office_pdf_svpkg_manifest_invalid'
  | 'office_pdf_svpkg_inventory_missing'
  | 'office_pdf_svpkg_inventory_invalid'
  | 'office_pdf_svpkg_inventory_missing_file'
  | 'office_pdf_svpkg_inventory_unlisted_file'
  | 'office_pdf_svpkg_hash_mismatch'
  | 'office_pdf_svpkg_size_mismatch'
  | 'office_pdf_svpkg_runtime_missing'
  | 'office_pdf_svpkg_runtime_manifest_missing'
  | 'office_pdf_svpkg_runtime_invalid'
  | 'office_pdf_svpkg_platform_unsupported'
  | 'office_pdf_svpkg_production_gate_invalid'
  | 'office_pdf_svpkg_policy_missing'
  | 'office_pdf_svpkg_package_hash_mismatch'
  | 'office_pdf_svpkg_package_size_mismatch'

export type DfcLibreOfficeRuntimePackageArchiveDiagnostic = Readonly<{
  code: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode
  message: string
}>

export type DfcLibreOfficeRuntimePackageArchiveVerification = Readonly<{
  packageId: typeof DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID
  pluginId: typeof DFC_OFFICE_PDF_PLUGIN_ID
  runtimeId: typeof DFC_OFFICE_PDF_RUNTIME_ID
  packageVersion: string
  runtimeVersion: string
  platform: string
  arch: string | null
  packageSha256: string
  packageSizeBytes: number
  manifestSha256: string
  inventorySha256: string
  runtimeManifestSha256: string
  artifactCount: number
  productionApproved: false
  ownerGated: true
  experimental: true
  source: 'downloaded_candidate'
}>

export type DfcLibreOfficeRuntimePackageArchiveExtractionResult =
  | Readonly<{
      ok: true
      extractionRootDir: string
      runtimeRootDir: string
      verification: DfcLibreOfficeRuntimePackageArchiveVerification
      diagnostics: readonly DfcLibreOfficeRuntimePackageArchiveDiagnostic[]
    }>
  | Readonly<{
      ok: false
      extractionRootDir: null
      runtimeRootDir: null
      verification: null
      diagnostics: readonly DfcLibreOfficeRuntimePackageArchiveDiagnostic[]
    }>

export type DfcLibreOfficeRuntimePackageArchiveImportResult =
  | Readonly<{
      ok: true
      verification: DfcLibreOfficeRuntimePackageArchiveVerification
      install: DfcLibreOfficeManagedPackageInstallResult
      diagnostics: readonly DfcLibreOfficeRuntimePackageArchiveDiagnostic[]
    }>
  | Readonly<{
      ok: false
      verification: DfcLibreOfficeRuntimePackageArchiveVerification | null
      install: DfcLibreOfficeManagedPackageInstallResult | null
      diagnostics: readonly DfcLibreOfficeRuntimePackageArchiveDiagnostic[]
    }>

export type DfcLibreOfficeRuntimePackageArchiveExtractionInput = Readonly<{
  packageBytes: Uint8Array
  extractionRootDir: string
  repoRootDir?: string | null
  expectedPackageSha256?: string | null
  expectedPackageSizeBytes?: number | null
  platform?: NodeJS.Platform | null
  arch?: string | null
}>

export type DfcLibreOfficeRuntimePackageArchiveImportInput =
  DfcLibreOfficeRuntimePackageArchiveExtractionInput & Readonly<{
    appManagedRootDir: string
  }>

type ZipEntry = Readonly<{
  fileName: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
  externalAttributes: number
}>

const FULL_SHA256_RE = /^[a-f0-9]{64}$/u
const NUL_RE = /\0/u
const UNIX_SYMLINK_FILE_TYPE = 0o120000
const UNIX_FILE_TYPE_MASK = 0o170000

export async function extractDfcLibreOfficeRuntimePackageArchive(
  input: DfcLibreOfficeRuntimePackageArchiveExtractionInput
): Promise<DfcLibreOfficeRuntimePackageArchiveExtractionResult> {
  const rootCheck = validateExtractionRoot(input.extractionRootDir, input.repoRootDir ?? process.cwd())
  if (!rootCheck.ok) return failure('office_pdf_svpkg_extract_path_rejected', rootCheck.message)

  const packageSha256 = sha256(input.packageBytes)
  const packageSizeBytes = input.packageBytes.byteLength
  if (input.expectedPackageSha256 && input.expectedPackageSha256.toLowerCase() !== packageSha256) {
    return failure('office_pdf_svpkg_package_hash_mismatch', 'LibreOffice svpkg package hash mismatch.')
  }
  if (input.expectedPackageSizeBytes != null && input.expectedPackageSizeBytes !== packageSizeBytes) {
    return failure('office_pdf_svpkg_package_size_mismatch', 'LibreOffice svpkg package size mismatch.')
  }

  try {
    await rm(rootCheck.root, { recursive: true, force: true })
    await mkdir(rootCheck.root, { recursive: true })
    await extractZipCompatibleArchive(input.packageBytes, rootCheck.root)

    const verified = await verifyExtractedPackage({
      extractionRootDir: rootCheck.root,
      packageSha256,
      packageSizeBytes,
      platform: input.platform ?? process.platform,
      arch: input.arch ?? process.arch,
    })
    if (!verified.ok) {
      await cleanupExtraction(rootCheck.root)
      return failure(verified.code, verified.message)
    }
    return {
      ok: true,
      extractionRootDir: rootCheck.root,
      runtimeRootDir: path.join(rootCheck.root, DFC_LIBREOFFICE_SVPKG_RUNTIME_ROOT),
      verification: verified.verification,
      diagnostics: [],
    }
  } catch (error) {
    await cleanupExtraction(rootCheck.root)
    return failure(
      'office_pdf_svpkg_extract_failed',
      sanitizeMessage(error, 'LibreOffice svpkg package extraction failed.')
    )
  }
}

export async function importDfcLibreOfficeRuntimePackageArchive(
  input: DfcLibreOfficeRuntimePackageArchiveImportInput
): Promise<DfcLibreOfficeRuntimePackageArchiveImportResult> {
  const extracted = await extractDfcLibreOfficeRuntimePackageArchive(input)
  if (!extracted.ok) {
    return {
      ok: false,
      verification: null,
      install: null,
      diagnostics: extracted.diagnostics,
    }
  }
  try {
    const install = await importDfcLibreOfficeManagedRuntimePackage({
      appManagedRootDir: input.appManagedRootDir,
      sourceRuntimeRootDir: extracted.runtimeRootDir,
      platform: input.platform ?? undefined,
      arch: input.arch ?? undefined,
    })
    return {
      ok: install.ok,
      verification: extracted.verification,
      install,
      diagnostics: install.ok
        ? []
        : [diagnostic('office_pdf_svpkg_runtime_invalid', 'LibreOffice svpkg package import verification failed.')],
    }
  } finally {
    await cleanupExtraction(extracted.extractionRootDir)
  }
}

async function verifyExtractedPackage(input: Readonly<{
  extractionRootDir: string
  packageSha256: string
  packageSizeBytes: number
  platform: NodeJS.Platform
  arch: string
}>): Promise<Readonly<{
  ok: true
  verification: DfcLibreOfficeRuntimePackageArchiveVerification
} | {
  ok: false
  code: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode
  message: string
}>> {
  const packageManifestBytes = await readRequiredFile(
    input.extractionRootDir,
    DFC_LIBREOFFICE_SVPKG_MANIFEST,
    'office_pdf_svpkg_manifest_missing'
  )
  if (!packageManifestBytes.ok) return packageManifestBytes
  const inventoryBytes = await readRequiredFile(
    input.extractionRootDir,
    DFC_LIBREOFFICE_SVPKG_INVENTORY,
    'office_pdf_svpkg_inventory_missing'
  )
  if (!inventoryBytes.ok) return inventoryBytes

  const manifestJson = parseJson(packageManifestBytes.bytes)
  if (!manifestJson.ok) return invalid('office_pdf_svpkg_manifest_invalid', 'LibreOffice svpkg package manifest is invalid.')
  const manifestResult = validatePluginPackageManifest(manifestJson.value)
  if (!manifestResult.ok) {
    return invalid('office_pdf_svpkg_manifest_invalid', 'LibreOffice svpkg package manifest failed validation.')
  }
  const packagePolicy = validateLibreOfficePackagePolicy(manifestJson.value, input.platform, input.arch)
  if (!packagePolicy.ok) return packagePolicy

  const inventoryJson = parseJson(inventoryBytes.bytes)
  if (!inventoryJson.ok) return invalid('office_pdf_svpkg_inventory_invalid', 'LibreOffice svpkg package inventory is invalid.')
  const inventoryResult = validatePluginPackageInventory(inventoryJson.value)
  if (!inventoryResult.ok) {
    return invalid('office_pdf_svpkg_inventory_invalid', 'LibreOffice svpkg package inventory failed validation.')
  }

  const inventoryCheck = await verifyInventoryFiles(input.extractionRootDir, inventoryResult.inventory.artifacts)
  if (!inventoryCheck.ok) return inventoryCheck

  const runtimeRoot = path.join(input.extractionRootDir, DFC_LIBREOFFICE_SVPKG_RUNTIME_ROOT)
  const runtimeManifestBytes = await readRequiredFile(
    input.extractionRootDir,
    DFC_LIBREOFFICE_SVPKG_RUNTIME_MANIFEST,
    'office_pdf_svpkg_runtime_manifest_missing'
  )
  if (!runtimeManifestBytes.ok) return runtimeManifestBytes
  const runtimeManifestJson = parseJson(runtimeManifestBytes.bytes)
  if (!runtimeManifestJson.ok) return invalid('office_pdf_svpkg_runtime_invalid', 'LibreOffice runtime manifest is invalid.')
  const runtimeManifest = validateRuntimeManifestShape(runtimeManifestJson.value, input.platform, input.arch)
  if (!runtimeManifest.ok) return runtimeManifest
  const runtimePayload = await stat(runtimeRoot).catch(() => null)
  if (!runtimePayload?.isDirectory()) {
    return invalid('office_pdf_svpkg_runtime_missing', 'LibreOffice svpkg runtime payload is missing.')
  }
  const executableCheck = await verifyRuntimeExecutable(runtimeRoot, runtimeManifest.manifest)
  if (!executableCheck.ok) return executableCheck

  return {
    ok: true,
    verification: {
      packageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
      pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
      runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
      packageVersion: packagePolicy.packageVersion,
      runtimeVersion: packagePolicy.runtimeVersion,
      platform: packagePolicy.platform,
      arch: packagePolicy.arch,
      packageSha256: input.packageSha256,
      packageSizeBytes: input.packageSizeBytes,
      manifestSha256: sha256(packageManifestBytes.bytes),
      inventorySha256: sha256(inventoryBytes.bytes),
      runtimeManifestSha256: sha256(runtimeManifestBytes.bytes),
      artifactCount: inventoryResult.inventory.artifacts.length,
      productionApproved: false,
      ownerGated: true,
      experimental: true,
      source: 'downloaded_candidate',
    },
  }
}

async function verifyInventoryFiles(
  root: string,
  artifacts: readonly PluginPackageArtifact[]
): Promise<Readonly<{ ok: true } | {
  ok: false
  code: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode
  message: string
}>> {
  const listedPaths = new Set(artifacts.map((artifact) => artifact.relativePath))
  const requiredClasses = new Set(artifacts.map((artifact) => artifact.artifactClass))
  for (const [artifactClass, message] of [
    ['runtime', 'LibreOffice svpkg inventory is missing runtime payload.'],
    ['manifest', 'LibreOffice svpkg inventory is missing manifest payload.'],
    ['license', 'LibreOffice svpkg inventory is missing license payload.'],
    ['attribution', 'LibreOffice svpkg inventory is missing attribution payload.'],
  ] as const) {
    if (!requiredClasses.has(artifactClass)) {
      return invalid('office_pdf_svpkg_policy_missing', message)
    }
  }

  for (const artifact of artifacts) {
    const filePath = resolveExtractedFile(root, artifact.relativePath)
    if (!filePath) {
      return invalid('office_pdf_svpkg_inventory_invalid', 'LibreOffice svpkg inventory path is unsafe.')
    }
    const bytes = await readFile(filePath).catch(() => null)
    if (!bytes) {
      return invalid('office_pdf_svpkg_inventory_missing_file', 'LibreOffice svpkg inventory references a missing file.')
    }
    if (bytes.byteLength !== artifact.sizeBytes) {
      return invalid('office_pdf_svpkg_size_mismatch', 'LibreOffice svpkg inventory size mismatch.')
    }
    if (sha256(bytes) !== artifact.sha256) {
      return invalid('office_pdf_svpkg_hash_mismatch', 'LibreOffice svpkg inventory hash mismatch.')
    }
  }

  const actualFiles = await listExtractedFiles(root)
  for (const relativePath of actualFiles) {
    if (relativePath === DFC_LIBREOFFICE_SVPKG_INVENTORY) continue
    if (!listedPaths.has(relativePath)) {
      return invalid('office_pdf_svpkg_inventory_unlisted_file', 'LibreOffice svpkg package contains an unlisted file.')
    }
  }
  return { ok: true }
}

function validateLibreOfficePackagePolicy(
  input: unknown,
  platform: NodeJS.Platform,
  arch: string
): Readonly<{
  ok: true
  packageVersion: string
  runtimeVersion: string
  platform: string
  arch: string | null
} | {
  ok: false
  code: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode
  message: string
}> {
  if (!isRecord(input)) return invalid('office_pdf_svpkg_manifest_invalid', 'LibreOffice svpkg package manifest is invalid.')
  if (input.pluginId !== DFC_OFFICE_PDF_PLUGIN_ID || input.runtimeId !== DFC_OFFICE_PDF_RUNTIME_ID) {
    return invalid('office_pdf_svpkg_manifest_invalid', 'LibreOffice svpkg package identity is invalid.')
  }
  if (input.packageId !== DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID) {
    return invalid('office_pdf_svpkg_manifest_invalid', 'LibreOffice svpkg package id is invalid.')
  }
  if (input.displayName !== DFC_OFFICE_PDF_DISPLAY_NAME) {
    return invalid('office_pdf_svpkg_manifest_invalid', 'LibreOffice svpkg package display name is invalid.')
  }
  if (input.productionApproved !== false || input.ownerGated !== true || input.experimental !== true) {
    return invalid('office_pdf_svpkg_production_gate_invalid', 'LibreOffice svpkg package production gate is invalid.')
  }
  const packageVersion = readString(input.packageVersion)
  const runtimeVersion = readString(input.runtimeVersion)
  const packagePlatform = readString(input.platform)
  const packageArch = readString(input.arch)
  if (!packageVersion || !runtimeVersion || !packagePlatform) {
    return invalid('office_pdf_svpkg_manifest_invalid', 'LibreOffice svpkg package version metadata is incomplete.')
  }
  if (packagePlatform !== 'any' && packagePlatform !== platform) {
    return invalid('office_pdf_svpkg_platform_unsupported', 'LibreOffice svpkg package platform is unsupported.')
  }
  if (packageArch && packageArch !== 'any' && packageArch !== arch) {
    return invalid('office_pdf_svpkg_platform_unsupported', 'LibreOffice svpkg package architecture is unsupported.')
  }
  if (!Array.isArray(input.capabilities) || !input.capabilities.includes('document_conversion')) {
    return invalid('office_pdf_svpkg_manifest_invalid', 'LibreOffice svpkg package capabilities are invalid.')
  }
  if (!hasRequiredPackagePolicy(input.securityPolicy)) {
    return invalid('office_pdf_svpkg_policy_missing', 'LibreOffice svpkg package security policy is incomplete.')
  }
  if (!hasNonEmptyArray(input.licenseRefs) || !hasNonEmptyArray(input.attributionRefs)) {
    return invalid('office_pdf_svpkg_policy_missing', 'LibreOffice svpkg package license or attribution refs are missing.')
  }
  if (!isRecord(input.provenance) || !readString(input.provenance.reference)) {
    return invalid('office_pdf_svpkg_policy_missing', 'LibreOffice svpkg package provenance is missing.')
  }
  return {
    ok: true,
    packageVersion,
    runtimeVersion,
    platform: packagePlatform,
    arch: packageArch,
  }
}

function validateRuntimeManifestShape(
  input: unknown,
  platform: NodeJS.Platform,
  arch: string
): Readonly<{ ok: true; manifest: DfcOfficePdfRuntimeManifest } | {
  ok: false
  code: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode
  message: string
}> {
  if (!isRecord(input)) return invalid('office_pdf_svpkg_runtime_invalid', 'LibreOffice runtime manifest is invalid.')
  const manifest = input as Partial<DfcOfficePdfRuntimeManifest>
  if (
    manifest.pluginId !== DFC_OFFICE_PDF_PLUGIN_ID ||
    manifest.packageId !== DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID ||
    manifest.runtimePackageId !== DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID ||
    manifest.runtimeId !== DFC_OFFICE_PDF_RUNTIME_ID
  ) {
    return invalid('office_pdf_svpkg_runtime_invalid', 'LibreOffice runtime manifest identity is invalid.')
  }
  if (manifest.platform !== platform || (manifest.arch && manifest.arch !== arch)) {
    return invalid('office_pdf_svpkg_platform_unsupported', 'LibreOffice runtime manifest platform is unsupported.')
  }
  if (!Array.isArray(manifest.capabilities) || !DFC_OFFICE_PDF_CAPABILITIES.every((capability) => manifest.capabilities?.includes(capability))) {
    return invalid('office_pdf_svpkg_runtime_invalid', 'LibreOffice runtime manifest capabilities are invalid.')
  }
  if (!isRuntimeExecutableRelativePathAllowed(manifest.executablePath)) {
    return invalid('office_pdf_svpkg_runtime_invalid', 'LibreOffice runtime manifest executable path is unsafe.')
  }
  if (!hasRequiredRuntimeSecurityPolicy(manifest.securityPolicy)) {
    return invalid('office_pdf_svpkg_policy_missing', 'LibreOffice runtime manifest security policy is incomplete.')
  }
  return { ok: true, manifest: manifest as DfcOfficePdfRuntimeManifest }
}

async function verifyRuntimeExecutable(
  runtimeRoot: string,
  manifest: DfcOfficePdfRuntimeManifest
): Promise<Readonly<{ ok: true } | {
  ok: false
  code: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode
  message: string
}>> {
  const executablePath = resolveExtractedFile(runtimeRoot, manifest.executablePath)
  if (!executablePath) {
    return invalid('office_pdf_svpkg_runtime_invalid', 'LibreOffice runtime manifest executable path is unsafe.')
  }
  const bytes = await readFile(executablePath).catch(() => null)
  if (!bytes) {
    return invalid('office_pdf_svpkg_inventory_missing_file', 'LibreOffice runtime executable is missing.')
  }
  if (manifest.executableSizeBytes != null && manifest.executableSizeBytes !== bytes.byteLength) {
    return invalid('office_pdf_svpkg_size_mismatch', 'LibreOffice runtime executable size mismatch.')
  }
  if (manifest.executableSha256 && manifest.executableSha256.toLowerCase() !== sha256(bytes)) {
    return invalid('office_pdf_svpkg_hash_mismatch', 'LibreOffice runtime executable hash mismatch.')
  }
  return { ok: true }
}

async function extractZipCompatibleArchive(bytes: Uint8Array, targetDir: string): Promise<void> {
  const buffer = Buffer.from(bytes)
  const entries = readZipCentralDirectory(buffer)
  const seen = new Set<string>()
  for (const entry of entries) {
    if (isZipSymlink(entry)) throw new Error('zip symlink entries are not allowed')
    const normalized = normalizeArchiveEntryName(entry.fileName)
    if (!normalized) {
      if (isDirectoryEntry(entry.fileName)) continue
      throw new Error('zip entry path is unsafe')
    }
    const duplicateKey = normalized.toLowerCase()
    if (seen.has(duplicateKey)) throw new Error('zip duplicate entry path')
    seen.add(duplicateKey)
    await writeZipEntry(buffer, entry, targetDir, normalized)
  }
}

function readZipCentralDirectory(buffer: Buffer): readonly ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer)
  if (eocdOffset < 0) throw new Error('zip end of central directory not found')
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16)
  const entries: ZipEntry[] = []
  let offset = centralDirectoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('zip central directory entry invalid')
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const externalAttributes = buffer.readUInt32LE(offset + 38)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const nameStart = offset + 46
    const nameEnd = nameStart + fileNameLength
    if (nameEnd > buffer.length) throw new Error('zip central directory entry name invalid')
    const fileName = buffer.subarray(nameStart, nameEnd).toString('utf8')
    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      externalAttributes,
    })
    offset = nameEnd + extraLength + commentLength
  }
  return entries
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22)
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  return -1
}

async function writeZipEntry(buffer: Buffer, entry: ZipEntry, targetDir: string, relativePath: string): Promise<void> {
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) {
    throw new Error('zip local file header invalid')
  }
  const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26)
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28)
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > buffer.length) throw new Error('zip entry exceeds package size')
  const compressed = buffer.subarray(dataStart, dataEnd)
  const content = entry.compressionMethod === 0
    ? compressed
    : entry.compressionMethod === 8
      ? inflateRawSync(compressed)
      : null
  if (!content) throw new Error('zip compression method unsupported')
  if (content.byteLength !== entry.uncompressedSize) throw new Error('zip entry size mismatch')
  const targetPath = resolveExtractedFile(targetDir, relativePath)
  if (!targetPath) throw new Error('zip entry escapes target directory')
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content, { flag: 'wx' })
}

function normalizeArchiveEntryName(input: string): string | null {
  if (isDirectoryEntry(input)) return null
  const result = validateSafeRelativePath(input)
  return result.ok ? result.path : null
}

function isDirectoryEntry(input: string): boolean {
  return input.trim().replace(/\\/gu, '/').endsWith('/')
}

function isZipSymlink(entry: ZipEntry): boolean {
  const unixMode = entry.externalAttributes >>> 16
  return (unixMode & UNIX_FILE_TYPE_MASK) === UNIX_SYMLINK_FILE_TYPE
}

function isRuntimeExecutableRelativePathAllowed(input: unknown): boolean {
  const safe = validateSafeRelativePath(input)
  if (!safe.ok) return false
  const parts = safe.path.split('/')
  const basename = parts[parts.length - 1]?.toLowerCase() ?? ''
  return basename === 'soffice' || basename.endsWith('.exe') || safe.path.includes('.app/Contents/MacOS/')
}

function resolveExtractedFile(root: string, relativePath: string): string | null {
  const safe = validateSafeRelativePath(relativePath)
  if (!safe.ok) return null
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, safe.path)
  const relative = path.relative(resolvedRoot, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return resolved
}

async function readRequiredFile(
  root: string,
  relativePath: string,
  missingCode: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode
): Promise<Readonly<{ ok: true; bytes: Buffer } | {
  ok: false
  code: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode
  message: string
}>> {
  const filePath = resolveExtractedFile(root, relativePath)
  if (!filePath) return invalid('office_pdf_svpkg_extract_path_rejected', 'LibreOffice svpkg package path was rejected.')
  const bytes = await readFile(filePath).catch(() => null)
  if (!bytes) return invalid(missingCode, 'LibreOffice svpkg required file is missing.')
  return { ok: true, bytes }
}

async function listExtractedFiles(root: string): Promise<readonly string[]> {
  const out: string[] = []
  const pending = ['']
  while (pending.length > 0) {
    const prefix = pending.pop() ?? ''
    const dir = path.join(root, prefix)
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) throw new Error('extracted package contains unsafe links')
      if (entry.isDirectory()) {
        pending.push(relative)
      } else if (entry.isFile()) {
        const safe = validateSafeRelativePath(relative)
        if (!safe.ok) throw new Error('extracted package contains unsafe paths')
        out.push(safe.path)
      }
    }
  }
  return out
}

function validateExtractionRoot(
  extractionRootDir: string,
  repoRootDir: string
): Readonly<{ ok: true; root: string } | { ok: false; message: string }> {
  if (!extractionRootDir || NUL_RE.test(extractionRootDir)) {
    return { ok: false, message: 'LibreOffice svpkg extraction root is invalid.' }
  }
  const root = path.resolve(extractionRootDir)
  if (root === path.parse(root).root) {
    return { ok: false, message: 'LibreOffice svpkg extraction root cannot be filesystem root.' }
  }
  const home = process.env.USERPROFILE || process.env.HOME
  if (home && path.resolve(home) === root) {
    return { ok: false, message: 'LibreOffice svpkg extraction root cannot be user home.' }
  }
  if (root.split(/[\\/]/u).some((part) => part.toLowerCase() === '.artifacts')) {
    return { ok: false, message: 'LibreOffice svpkg extraction root cannot be under artifact directories.' }
  }
  const repo = path.resolve(repoRootDir)
  const relative = path.relative(repo, root)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return { ok: false, message: 'LibreOffice svpkg extraction root cannot be inside the source repository.' }
  }
  return { ok: true, root }
}

function parseJson(bytes: Uint8Array): Readonly<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown }
  } catch {
    return { ok: false }
  }
}

function hasRequiredPackagePolicy(value: unknown): boolean {
  return isRecord(value)
    && value.macrosDisabled === true
    && value.networkDisabled === true
    && value.externalLinksDisabled === true
    && value.embeddedObjectExecutionDisabled === true
    && value.isolatedProfileRequired === true
}

function hasRequiredRuntimeSecurityPolicy(value: DfcOfficePdfRuntimeManifest['securityPolicy']): boolean {
  return value?.macrosDisabled === true
    && value.networkDisabled === true
    && value.externalLinksDisabled === true
    && value.embeddedObjectExecutionDisabled === true
    && value.isolatedProfileRequired === true
}

function hasNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => readString(entry))
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function invalid(
  code: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode,
  message: string
): Readonly<{ ok: false; code: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode; message: string }> {
  return { ok: false, code, message }
}

function failure(
  code: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode,
  message: string
): DfcLibreOfficeRuntimePackageArchiveExtractionResult {
  return {
    ok: false,
    extractionRootDir: null,
    runtimeRootDir: null,
    verification: null,
    diagnostics: [diagnostic(code, message)],
  }
}

function diagnostic(
  code: DfcLibreOfficeRuntimePackageArchiveDiagnosticCode,
  message: string
): DfcLibreOfficeRuntimePackageArchiveDiagnostic {
  return {
    code,
    message: sanitizePluginDistributionText(message) ?? 'LibreOffice svpkg package verification failed.',
  }
}

function sanitizeMessage(error: unknown, fallback: string): string {
  return sanitizePluginDistributionText(error instanceof Error ? error.message : String(error)) ?? fallback
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

async function cleanupExtraction(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true }).catch(() => undefined)
}
