#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { deflateRawSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const pluginId = 'libreoffice'
const runtimeId = 'libreoffice-office-pdf'
const packageId = 'starverse.dfc.libreoffice'
const displayName = 'LibreOffice Office PDF'
const requiredCapabilities = ['office_to_pdf', 'docx_to_pdf']

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  const sourceRoot = args.source ? path.resolve(args.source) : null
  const platform = args.platform ?? 'win32'
  const arch = args.arch ?? 'x64'
  const runtimeVersion = args.runtimeVersion ?? null
  const packageVersion = args.packageVersion ?? null
  const upstreamUrl = args.upstreamUrl ?? null
  const executablePath = args.executable ?? defaultExecutablePath(platform)
  const allowWrite = args.allowWrite === true
  const dryRun = !allowWrite
  const outPath = args.out ? path.resolve(args.out) : null

  const blockers = []
  if (!sourceRoot) blockers.push('missing --source')
  if (!runtimeVersion) blockers.push('missing --runtime-version')
  if (!packageVersion) blockers.push('missing --package-version')
  if (!upstreamUrl) blockers.push('missing --upstream-url')
  if (!outPath && allowWrite) blockers.push('missing --out for --allow-write')
  if (outPath) {
    const outputSafety = validateOutputPath(outPath)
    if (!outputSafety.ok) blockers.push(outputSafety.message)
  }

  let packagePreview = null
  if (sourceRoot && runtimeVersion && packageVersion && upstreamUrl) {
    const prepared = await preparePackage({
      sourceRoot,
      platform,
      arch,
      runtimeVersion,
      packageVersion,
      upstreamUrl,
      executablePath,
    })
    packagePreview = prepared.preview
    blockers.push(...prepared.blockers)
    if (allowWrite && blockers.length === 0 && outPath) {
      const written = await writeZipFile(prepared.files, outPath)
      packagePreview = {
        ...packagePreview,
        packageSha256: written.sha256,
        packageSizeBytes: written.sizeBytes,
      }
    }
  }

  const result = {
    dryRun,
    allowWrite,
    wrotePackage: allowWrite && blockers.length === 0 && Boolean(outPath),
    outputRef: outPath ? '[repo-external-svpkg]' : null,
    sourceRef: sourceRoot ? '[owner-provided-source]' : null,
    pluginId,
    runtimeId,
    packageId,
    productionApproved: false,
    ownerGated: true,
    experimental: true,
    blockers,
    packagePreview,
  }
  console.log(JSON.stringify(result, null, 2))

  if (allowWrite && blockers.length > 0) {
    process.exitCode = 1
  }
}

async function preparePackage(input) {
  const blockers = []
  const sourceSafety = validateSourcePath(input.sourceRoot)
  if (!sourceSafety.ok) {
    return { blockers: [sourceSafety.message], preview: null, bytes: Buffer.alloc(0) }
  }
  const files = await collectRuntimeFiles(input.sourceRoot)
  const executable = files.find((file) => file.relativePath === normalizeRelativePath(input.executablePath))
  if (!executable) blockers.push(`missing executable at ${input.executablePath}`)

  const metadata = await collectMetadata(input.sourceRoot)
  blockers.push(...metadata.blockers)

  const executableSha256 = executable ? await hashFile(executable.absolutePath) : sha256(Buffer.alloc(0))
  const executableSizeBytes = executable ? (await stat(executable.absolutePath)).size : 0
  const artifactHasher = createHash('sha256')
  for (const file of files) {
    artifactHasher.update(await readFile(file.absolutePath))
  }
  const artifactSha256 = artifactHasher.digest('hex')

  const runtimeManifest = {
    manifestSchemaVersion: '1',
    pluginId,
    packageId,
    runtimePackageId: packageId,
    engineId: 'libreoffice',
    runtimeId,
    displayName,
    pluginVersion: input.packageVersion,
    runtimeKind: 'managed_external_process',
    enabled: true,
    platform: input.platform,
    arch: input.arch,
    capabilities: requiredCapabilities,
    executablePath: input.executablePath.replace(/\\/gu, '/'),
    libreOfficeVersion: input.runtimeVersion,
    packageVersion: input.packageVersion,
    artifactSha256,
    executableSha256,
    executableSizeBytes,
    provenance: `The Document Foundation official download: ${input.upstreamUrl}`,
    licenseId: 'MPL-2.0',
    attribution: 'The Document Foundation LibreOffice',
    notices: ['LibreOffice package prepared by Starverse dry-run script from Owner-provided source.'],
    minimumStarverseContractVersion: '1',
    officialRelease: {
      sourceKind: 'official',
      packageRef: input.upstreamUrl,
      releaseTag: `starverse-runtime-libreoffice-v${input.packageVersion}-${input.platform}-${input.arch}`,
      provenance: 'The Document Foundation official download infrastructure',
    },
    securityPolicy: {
      macrosDisabled: true,
      networkDisabled: true,
      externalLinksDisabled: true,
      embeddedObjectExecutionDisabled: true,
      isolatedProfileRequired: true,
    },
  }

  const packageManifest = {
    manifestSchemaVersion: '1',
    pluginId,
    packageId,
    runtimeId,
    displayName,
    publisher: 'Starverse',
    pluginVersion: input.packageVersion,
    packageVersion: input.packageVersion,
    runtimeVersion: input.runtimeVersion,
    runtimeKind: 'managed',
    platform: input.platform,
    arch: input.arch,
    compatibility: {
      platforms: [input.platform],
      architectures: [input.arch],
      starverseVersionRange: '>=0.0.1',
    },
    capabilities: ['document_conversion'],
    artifactInventoryRef: 'inventory.json',
    licenseRefs: metadata.licenseRefs,
    attributionRefs: metadata.attributionRefs,
    productionApproved: false,
    ownerGated: true,
    experimental: true,
    provenance: {
      reference: input.upstreamUrl,
      authority: 'The Document Foundation',
      preparedAt: new Date().toISOString(),
    },
    securityPolicy: runtimeManifest.securityPolicy,
    network: { allowed: false },
  }

  const packageFiles = [
    { relativePath: 'manifest.json', bytes: Buffer.from(json(packageManifest)) },
    { relativePath: 'runtime/manifest.json', bytes: Buffer.from(json(runtimeManifest)) },
    ...files.map((file) => ({
      relativePath: `runtime/${file.relativePath}`,
      filePath: file.absolutePath,
    })),
    ...metadata.files,
  ]
  const materialized = []
  for (const file of packageFiles) {
    const sizeBytes = file.bytes ? file.bytes.byteLength : (await stat(file.filePath)).size
    const fileSha256 = file.bytes ? sha256(file.bytes) : await hashFile(file.filePath)
    materialized.push({
      relativePath: file.relativePath,
      bytes: file.bytes,
      filePath: file.filePath,
      sha256: fileSha256,
      sizeBytes,
    })
  }

  const inventory = {
    inventorySchemaVersion: '1',
    pluginId,
    pluginVersion: input.packageVersion,
    artifacts: materialized.map((file, index) => ({
      artifactId: `artifact-${index}`,
      relativePath: file.relativePath,
      artifactClass: artifactClassForPath(file.relativePath),
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      required: true,
    })),
  }
  const inventoryBytes = Buffer.from(json(inventory))
  materialized.push({
    relativePath: 'inventory.json',
    bytes: inventoryBytes,
    sha256: sha256(inventoryBytes),
    sizeBytes: inventoryBytes.byteLength,
  })

  const preview = {
    archiveFormat: 'svpkg-zip-compatible',
    layout: [
      'manifest.json',
      'inventory.json',
      'runtime/manifest.json',
      'runtime/**',
      'licenses/**',
      'notices/**',
      'attribution/**',
      'provenance/**',
    ],
    packageSha256: null,
    packageSizeBytes: null,
    manifestSha256: sha256(Buffer.from(json(packageManifest))),
    runtimeManifestSha256: sha256(Buffer.from(json(runtimeManifest))),
    inventoryArtifactCount: inventory.artifacts.length,
    packageManifest,
    runtimeManifest,
  }
  return { blockers, preview, files: materialized }
}

async function collectRuntimeFiles(sourceRoot) {
  const out = []
  const pending = ['']
  while (pending.length > 0) {
    const prefix = pending.pop() ?? ''
    const dir = path.join(sourceRoot, prefix)
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const relativePath = normalizeRelativePath(prefix ? `${prefix}/${entry.name}` : entry.name)
      if (entry.isSymbolicLink()) throw new Error('source contains symlink; refusing to package')
      if (isMetadataPath(relativePath)) continue
      if (entry.isDirectory()) {
        pending.push(relativePath)
      } else if (entry.isFile()) {
        if (relativePath === 'manifest.json') continue
        out.push({
          relativePath,
          absolutePath: path.join(sourceRoot, relativePath),
        })
      }
    }
  }
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

async function collectMetadata(sourceRoot) {
  const blockers = []
  const files = []
  for (const [dir, requiredFile, label] of [
    ['licenses', 'LICENSE', 'license'],
    ['notices', 'NOTICE', 'notices'],
    ['attribution', 'NOTICE', 'attribution'],
    ['provenance', 'provenance.json', 'provenance'],
  ]) {
    const target = path.join(sourceRoot, dir, requiredFile)
    const bytes = await readFile(target).catch(() => null)
    if (!bytes || bytes.byteLength === 0) {
      blockers.push(`missing ${label} metadata at ${dir}/${requiredFile}`)
      continue
    }
    files.push({
      relativePath: `${dir}/${requiredFile}`,
      bytes,
    })
  }
  return {
    blockers,
    files,
    licenseRefs: files.some((file) => file.relativePath === 'licenses/LICENSE') ? ['licenses/LICENSE'] : [],
    attributionRefs: files.some((file) => file.relativePath === 'attribution/NOTICE') ? ['attribution/NOTICE'] : [],
  }
}

async function hashFile(filePath) {
  return sha256(await readFile(filePath))
}

async function writeZipFile(entries, outPath) {
  const stream = createWriteStream(outPath, { flags: 'wx' })
  const outputHash = createHash('sha256')
  const centralParts = []
  let offset = 0
  let written = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.relativePath, 'utf8')
    const content = entry.bytes ? Buffer.from(entry.bytes) : await readFile(entry.filePath)
    const compressed = deflateRawSync(content, { level: 6 })
    const crc = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.byteLength, 18)
    local.writeUInt32LE(content.byteLength, 22)
    local.writeUInt16LE(name.byteLength, 26)
    local.writeUInt16LE(0, 28)
    await writeStreamChunk(stream, outputHash, local)
    await writeStreamChunk(stream, outputHash, name)
    await writeStreamChunk(stream, outputHash, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x031e, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.byteLength, 20)
    central.writeUInt32LE(content.byteLength, 24)
    central.writeUInt16LE(name.byteLength, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.byteLength + name.byteLength + compressed.byteLength
    written = offset
  }
  const centralDirectory = Buffer.concat(centralParts)
  await writeStreamChunk(stream, outputHash, centralDirectory)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDirectory.byteLength, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  await writeStreamChunk(stream, outputHash, eocd)
  await endStream(stream)
  written += centralDirectory.byteLength + eocd.byteLength
  return {
    sha256: outputHash.digest('hex'),
    sizeBytes: written,
  }
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function writeStreamChunk(stream, hash, chunk) {
  hash.update(chunk)
  await new Promise((resolve, reject) => {
    stream.write(chunk, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function endStream(stream) {
  await new Promise((resolve, reject) => {
    stream.end((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1)
  }
  return crc >>> 0
})

function validateSourcePath(sourceRoot) {
  if (!sourceRoot || sourceRoot.includes('\0')) return { ok: false, message: 'invalid source path' }
  if (sourceRoot.split(/[\\/]/u).some((part) => part.toLowerCase() === '.artifacts')) {
    return { ok: false, message: 'source path cannot be under .artifacts' }
  }
  return { ok: true }
}

function validateOutputPath(outPath) {
  if (!outPath || outPath.includes('\0')) return { ok: false, message: 'invalid output path' }
  if (!outPath.endsWith('.svpkg')) return { ok: false, message: 'output must end with .svpkg' }
  if (outPath.split(/[\\/]/u).some((part) => part.toLowerCase() === '.artifacts')) {
    return { ok: false, message: 'output path cannot be under .artifacts' }
  }
  const relative = path.relative(repoRoot, outPath)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return { ok: false, message: 'output path cannot be inside the source repository' }
  }
  return { ok: true }
}

function parseArgs(argv) {
  const out = { dryRun: true, allowWrite: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--help':
      case '-h':
        out.help = true
        break
      case '--source':
        out.source = argv[++i]
        break
      case '--out':
        out.out = argv[++i]
        break
      case '--platform':
        out.platform = argv[++i]
        break
      case '--arch':
        out.arch = argv[++i]
        break
      case '--runtime-version':
        out.runtimeVersion = argv[++i]
        break
      case '--package-version':
        out.packageVersion = argv[++i]
        break
      case '--upstream-url':
        out.upstreamUrl = argv[++i]
        break
      case '--executable':
        out.executable = argv[++i]
        break
      case '--dry-run':
        out.dryRun = true
        break
      case '--allow-write':
        out.allowWrite = true
        break
      default:
        throw new Error(`unknown argument: ${arg}`)
    }
  }
  return out
}

function artifactClassForPath(relativePath) {
  if (relativePath === 'manifest.json' || relativePath.endsWith('/manifest.json')) return 'manifest'
  if (relativePath.startsWith('runtime/')) return 'runtime'
  if (relativePath.startsWith('licenses/')) return 'license'
  if (relativePath.startsWith('attribution/')) return 'attribution'
  if (relativePath.startsWith('notices/') || relativePath.startsWith('provenance/')) return 'documentation'
  return 'other'
}

function normalizeRelativePath(value) {
  return String(value ?? '').trim().replace(/\\/gu, '/').replace(/^\.\/+/u, '')
}

function isMetadataPath(relativePath) {
  return /^(licenses|notices|attribution|provenance)(\/|$)/u.test(relativePath)
}

function defaultExecutablePath(platform) {
  if (platform === 'win32') return 'program/soffice.exe'
  return 'program/soffice'
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function printUsage() {
  console.log(`Usage: node scripts/dfc/prepare-libreoffice-svpkg-dry-run.mjs --source <path> --out <repo-external.svpkg> --platform win32 --arch x64 --runtime-version <version> --package-version <version> --upstream-url <url> [--dry-run] [--allow-write]`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
