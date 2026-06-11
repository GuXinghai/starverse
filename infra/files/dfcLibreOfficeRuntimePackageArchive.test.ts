import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  importDfcLibreOfficeRuntimePackageArchive,
  extractDfcLibreOfficeRuntimePackageArchive,
} from './dfcLibreOfficeRuntimePackageArchive'
import { getDfcLibreOfficeManagedRuntimeRoot } from './dfcManagedLibreOfficeRuntime'

const HEX_A = createHash('sha256').update('a').digest('hex')

type PackageOptions = Readonly<{
  omitPackageManifest?: boolean
  omitInventory?: boolean
  omitRuntimeManifest?: boolean
  omitExecutable?: boolean
  extraEntries?: readonly ZipFixtureEntry[]
  inventoryMutator?: (inventory: any) => void
  packageManifestMutator?: (manifest: any) => void
  runtimeManifestMutator?: (manifest: any) => void
}>

type ZipFixtureEntry = Readonly<{
  name: string
  content: Uint8Array | string
  externalAttributes?: number
}>

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function baseRuntimeManifest(executableBytes: Uint8Array): any {
  return {
    manifestSchemaVersion: '1',
    pluginId: 'libreoffice',
    packageId: 'starverse.dfc.libreoffice',
    runtimePackageId: 'starverse.dfc.libreoffice',
    engineId: 'libreoffice',
    runtimeId: 'libreoffice-office-pdf',
    displayName: 'LibreOffice Office PDF',
    pluginVersion: '25.8.7-starverse.1',
    runtimeKind: 'managed_external_process',
    enabled: true,
    platform: 'win32',
    arch: 'x64',
    capabilities: ['office_to_pdf', 'docx_to_pdf'],
    executablePath: 'program/soffice.exe',
    libreOfficeVersion: '25.8.7',
    packageVersion: '25.8.7-starverse.1',
    artifactSha256: sha256('runtime-artifact-25.8.7'),
    executableSha256: sha256(executableBytes),
    executableSizeBytes: executableBytes.byteLength,
    provenance: 'starverse-test-fixture',
    licenseId: 'MPL-2.0',
    attribution: 'The Document Foundation LibreOffice',
    notices: ['LibreOffice test fixture attribution'],
    minimumStarverseContractVersion: '1',
    officialRelease: {
      sourceKind: 'official',
      packageRef: 'starverse-runtime-libreoffice-25.8.7-win32-x64.svpkg',
      releaseTag: 'starverse-runtime-libreoffice-v25.8.7-win32-x64',
      provenance: 'starverse-test-fixture',
    },
    securityPolicy: {
      macrosDisabled: true,
      networkDisabled: true,
      externalLinksDisabled: true,
      embeddedObjectExecutionDisabled: true,
      isolatedProfileRequired: true,
    },
  }
}

function basePackageManifest(): any {
  return {
    manifestSchemaVersion: '1',
    pluginId: 'libreoffice',
    packageId: 'starverse.dfc.libreoffice',
    runtimeId: 'libreoffice-office-pdf',
    displayName: 'LibreOffice Office PDF',
    publisher: 'Starverse',
    pluginVersion: '25.8.7-starverse.1',
    packageVersion: '25.8.7-starverse.1',
    runtimeVersion: '25.8.7',
    runtimeKind: 'managed',
    platform: 'win32',
    arch: 'x64',
    compatibility: {
      platforms: ['win32'],
      architectures: ['x64'],
      starverseVersionRange: '>=0.0.1',
    },
    capabilities: ['document_conversion'],
    artifactInventoryRef: 'inventory.json',
    licenseRefs: ['licenses/LICENSE'],
    attributionRefs: ['attribution/NOTICE'],
    productionApproved: false,
    ownerGated: true,
    experimental: true,
    provenance: {
      reference: 'starverse-test-fixture',
    },
    securityPolicy: {
      macrosDisabled: true,
      networkDisabled: true,
      externalLinksDisabled: true,
      embeddedObjectExecutionDisabled: true,
      isolatedProfileRequired: true,
    },
    network: { allowed: false },
  }
}

function buildValidPackage(options: PackageOptions = {}): Buffer {
  const executableBytes = Buffer.from('fake soffice executable', 'utf8')
  const runtimeManifest = baseRuntimeManifest(executableBytes)
  options.runtimeManifestMutator?.(runtimeManifest)
  const packageManifest = basePackageManifest()
  options.packageManifestMutator?.(packageManifest)

  const files: ZipFixtureEntry[] = []
  if (!options.omitPackageManifest) {
    files.push({ name: 'manifest.json', content: jsonBytes(packageManifest) })
  }
  if (!options.omitRuntimeManifest) {
    files.push({ name: 'runtime/manifest.json', content: jsonBytes(runtimeManifest) })
  }
  const executableEntry = { name: 'runtime/program/soffice.exe', content: executableBytes }
  if (!options.omitExecutable) files.push(executableEntry)
  files.push({ name: 'licenses/LICENSE', content: 'MPL-2.0 fixture license' })
  files.push({ name: 'attribution/NOTICE', content: 'LibreOffice attribution fixture' })
  files.push({ name: 'notices/NOTICE', content: 'LibreOffice notices fixture' })
  files.push({ name: 'provenance/provenance.json', content: jsonBytes({ source: 'fixture' }) })

  const inventoryArtifacts = files.map((file, index) => ({
    artifactId: `artifact-${index}`,
    relativePath: file.name,
    artifactClass: artifactClassForPath(file.name),
    sha256: sha256(file.content),
    sizeBytes: Buffer.from(file.content).byteLength,
    required: true,
  }))
  if (options.omitExecutable) {
    inventoryArtifacts.push({
      artifactId: 'artifact-missing-executable',
      relativePath: executableEntry.name,
      artifactClass: 'runtime',
      sha256: sha256(executableEntry.content),
      sizeBytes: Buffer.from(executableEntry.content).byteLength,
      required: true,
    })
  }
  const inventory = {
    inventorySchemaVersion: '1',
    pluginId: 'libreoffice',
    pluginVersion: '25.8.7-starverse.1',
    artifacts: inventoryArtifacts,
  }
  options.inventoryMutator?.(inventory)
  if (!options.omitInventory) {
    files.push({ name: 'inventory.json', content: jsonBytes(inventory) })
  }
  files.push(...(options.extraEntries ?? []))
  return createZip(files)
}

function artifactClassForPath(relativePath: string): string {
  if (relativePath === 'manifest.json' || relativePath.endsWith('/manifest.json')) return 'manifest'
  if (relativePath.includes('/program/')) return 'runtime'
  if (relativePath.startsWith('licenses/')) return 'license'
  if (relativePath.startsWith('attribution/')) return 'attribution'
  return 'documentation'
}

async function tempRoot(label: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), `starverse-dfc-svpkg-${label}-`))
}

describe('LibreOffice svpkg runtime package archive bridge', () => {
  it('accepts a valid svpkg fixture and keeps production approval false', async () => {
    const archive = buildValidPackage()
    const extractionRoot = await tempRoot('valid')
    const result = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes: archive,
      extractionRootDir: extractionRoot,
      repoRootDir: process.cwd(),
      expectedPackageSha256: sha256(archive),
      expectedPackageSizeBytes: archive.byteLength,
      platform: 'win32',
      arch: 'x64',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimeRootDir).toBe(path.join(extractionRoot, 'runtime'))
    expect(result.verification).toMatchObject({
      pluginId: 'libreoffice',
      runtimeId: 'libreoffice-office-pdf',
      packageVersion: '25.8.7-starverse.1',
      runtimeVersion: '25.8.7',
      platform: 'win32',
      arch: 'x64',
      productionApproved: false,
      ownerGated: true,
      experimental: true,
      source: 'downloaded_candidate',
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain(extractionRoot)
  })

  it('rejects missing top-level manifest, inventory, runtime manifest, and executable', async () => {
    const cases: Array<readonly [PackageOptions, string]> = [
      [{ omitPackageManifest: true }, 'office_pdf_svpkg_manifest_missing'],
      [{ omitInventory: true }, 'office_pdf_svpkg_inventory_missing'],
      [{ omitRuntimeManifest: true }, 'office_pdf_svpkg_runtime_manifest_missing'],
      [{ omitExecutable: true }, 'office_pdf_svpkg_inventory_missing_file'],
    ]

    for (const [options, code] of cases) {
      const result = await extractDfcLibreOfficeRuntimePackageArchive({
        packageBytes: buildValidPackage(options),
        extractionRootDir: await tempRoot(code),
        repoRootDir: process.cwd(),
        platform: 'win32',
        arch: 'x64',
      })
      expect(result).toMatchObject({
        ok: false,
        diagnostics: [expect.objectContaining({ code })],
      })
    }
  })

  it('rejects traversal, absolute, drive-letter, symlink, and duplicate archive entries', async () => {
    const symlinkAttrs = (0o120777 << 16) >>> 0
    const cases: Array<readonly [readonly ZipFixtureEntry[], string]> = [
      [[{ name: '../escape.txt', content: 'x' }], 'office_pdf_svpkg_extract_failed'],
      [[{ name: '/absolute.txt', content: 'x' }], 'office_pdf_svpkg_extract_failed'],
      [[{ name: 'C:\\absolute.txt', content: 'x' }], 'office_pdf_svpkg_extract_failed'],
      [[{ name: 'runtime/link', content: 'target', externalAttributes: symlinkAttrs }], 'office_pdf_svpkg_extract_failed'],
      [[{ name: 'runtime/program/soffice.exe', content: 'duplicate' }], 'office_pdf_svpkg_extract_failed'],
    ]

    for (const [extraEntries, code] of cases) {
      const result = await extractDfcLibreOfficeRuntimePackageArchive({
        packageBytes: buildValidPackage({ extraEntries }),
        extractionRootDir: await tempRoot(code),
        repoRootDir: process.cwd(),
        platform: 'win32',
        arch: 'x64',
      })
      expect(result).toMatchObject({
        ok: false,
        diagnostics: [expect.objectContaining({ code })],
      })
    }
  })

  it('rejects unlisted files, inventory missing files, hash mismatch, and size mismatch', async () => {
    const unlisted = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes: buildValidPackage({ extraEntries: [{ name: 'runtime/unlisted.txt', content: 'x' }] }),
      extractionRootDir: await tempRoot('unlisted'),
      repoRootDir: process.cwd(),
      platform: 'win32',
      arch: 'x64',
    })
    expect(unlisted).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_svpkg_inventory_unlisted_file' })],
    })

    const missing = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes: buildValidPackage({
        inventoryMutator(inventory) {
          inventory.artifacts.push({
            artifactId: 'missing-file',
            relativePath: 'runtime/missing.bin',
            artifactClass: 'runtime',
            sha256: HEX_A,
            sizeBytes: 1,
            required: true,
          })
        },
      }),
      extractionRootDir: await tempRoot('missing-inventory-file'),
      repoRootDir: process.cwd(),
      platform: 'win32',
      arch: 'x64',
    })
    expect(missing).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_svpkg_inventory_missing_file' })],
    })

    const hashMismatch = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes: buildValidPackage({
        inventoryMutator(inventory) {
          inventory.artifacts.find((item: any) => item.relativePath === 'runtime/program/soffice.exe').sha256 = HEX_A
        },
      }),
      extractionRootDir: await tempRoot('hash'),
      repoRootDir: process.cwd(),
      platform: 'win32',
      arch: 'x64',
    })
    expect(hashMismatch).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_svpkg_hash_mismatch' })],
    })

    const sizeMismatch = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes: buildValidPackage({
        inventoryMutator(inventory) {
          inventory.artifacts.find((item: any) => item.relativePath === 'runtime/program/soffice.exe').sizeBytes = 1
        },
      }),
      extractionRootDir: await tempRoot('size'),
      repoRootDir: process.cwd(),
      platform: 'win32',
      arch: 'x64',
    })
    expect(sizeMismatch).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_svpkg_size_mismatch' })],
    })
  })

  it('rejects platform mismatch, missing policy metadata, executable escapes, and productionApproved true', async () => {
    const platformMismatch = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes: buildValidPackage(),
      extractionRootDir: await tempRoot('platform'),
      repoRootDir: process.cwd(),
      platform: 'darwin',
      arch: 'x64',
    })
    expect(platformMismatch).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_svpkg_platform_unsupported' })],
    })

    const missingPolicy = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes: buildValidPackage({
        packageManifestMutator(manifest) {
          delete manifest.provenance
        },
      }),
      extractionRootDir: await tempRoot('policy'),
      repoRootDir: process.cwd(),
      platform: 'win32',
      arch: 'x64',
    })
    expect(missingPolicy).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_svpkg_policy_missing' })],
    })

    const escapedExecutable = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes: buildValidPackage({
        runtimeManifestMutator(manifest) {
          manifest.executablePath = '../outside/soffice.exe'
        },
      }),
      extractionRootDir: await tempRoot('escape'),
      repoRootDir: process.cwd(),
      platform: 'win32',
      arch: 'x64',
    })
    expect(escapedExecutable).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_svpkg_runtime_invalid' })],
    })

    const productionApproved = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes: buildValidPackage({
        packageManifestMutator(manifest) {
          manifest.productionApproved = true
        },
      }),
      extractionRootDir: await tempRoot('prod'),
      repoRootDir: process.cwd(),
      platform: 'win32',
      arch: 'x64',
    })
    expect(productionApproved).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_svpkg_production_gate_invalid' })],
    })
  })

  it('rejects extraction roots inside the repo or artifact directories with sanitized diagnostics', async () => {
    const repoResult = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes: buildValidPackage(),
      extractionRootDir: path.join(process.cwd(), 'tmp-svpkg-extract'),
      repoRootDir: process.cwd(),
      platform: 'win32',
      arch: 'x64',
    })
    expect(repoResult).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_svpkg_extract_path_rejected' })],
    })
    expect(JSON.stringify(repoResult)).not.toContain(process.cwd())

    const artifactResult = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes: buildValidPackage(),
      extractionRootDir: path.join(os.tmpdir(), '.artifacts', 'svpkg'),
      repoRootDir: process.cwd(),
      platform: 'win32',
      arch: 'x64',
    })
    expect(artifactResult).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'office_pdf_svpkg_extract_path_rejected' })],
    })
  })

  it('imports a verified extracted runtime through the existing managed package installer', async () => {
    const appRoot = await tempRoot('app')
    const extractionRoot = await tempRoot('import')
    const result = await importDfcLibreOfficeRuntimePackageArchive({
      packageBytes: buildValidPackage(),
      extractionRootDir: extractionRoot,
      appManagedRootDir: appRoot,
      repoRootDir: process.cwd(),
      platform: 'win32',
      arch: 'x64',
    })

    expect(result.ok).toBe(true)
    expect(result.verification).toMatchObject({
      source: 'downloaded_candidate',
      productionApproved: false,
      ownerGated: true,
      experimental: true,
    })
    expect(result.install).toMatchObject({
      ok: true,
      activeRuntimeRootDir: getDfcLibreOfficeManagedRuntimeRoot(appRoot),
      pluginManagement: {
        productionApproved: false,
        verification: expect.objectContaining({
          manifestValidated: true,
          artifactHashVerified: true,
          executableHashVerified: true,
          packageMetadataVerified: true,
          securityPolicyVerified: true,
        }),
      },
      diagnostics: [],
    })
    await expect(stat(extractionRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(JSON.stringify(result)).not.toContain(extractionRoot)
  })

  it('verifies a svpkg generated by the dry-run preparation script from a tiny source fixture', async () => {
    const sourceRoot = await createScriptSourceFixture()
    const outDir = await tempRoot('script-out')
    const outPath = path.join(outDir, 'libreoffice-fixture.svpkg')

    const stdout = await runNodeScript([
      'scripts/dfc/prepare-libreoffice-svpkg-dry-run.mjs',
      '--source',
      sourceRoot,
      '--out',
      outPath,
      '--platform',
      'win32',
      '--arch',
      'x64',
      '--runtime-version',
      '26.2.4',
      '--package-version',
      '26.2.4-starverse.0',
      '--upstream-url',
      'https://download.documentfoundation.org/libreoffice/stable/26.2.4/win/x86_64/LibreOffice_26.2.4_Win_x86-64.msi',
      '--allow-write',
    ])

    const parsed = JSON.parse(stdout) as { wrotePackage: boolean; blockers: readonly string[] }
    expect(parsed.wrotePackage).toBe(true)
    expect(parsed.blockers).toEqual([])

    const packageBytes = await readFile(outPath)
    const verification = await extractDfcLibreOfficeRuntimePackageArchive({
      packageBytes,
      extractionRootDir: await tempRoot('script-verify'),
      repoRootDir: process.cwd(),
      expectedPackageSha256: sha256(packageBytes),
      expectedPackageSizeBytes: packageBytes.byteLength,
      platform: 'win32',
      arch: 'x64',
    })

    expect(verification).toMatchObject({
      ok: true,
      verification: expect.objectContaining({
        packageVersion: '26.2.4-starverse.0',
        runtimeVersion: '26.2.4',
        productionApproved: false,
        ownerGated: true,
        experimental: true,
      }),
    })
    expect(JSON.stringify(verification)).not.toContain(sourceRoot)
  })
})

async function createScriptSourceFixture(): Promise<string> {
  const sourceRoot = await tempRoot('script-source')
  await mkdir(path.join(sourceRoot, 'program'), { recursive: true })
  await mkdir(path.join(sourceRoot, 'licenses'), { recursive: true })
  await mkdir(path.join(sourceRoot, 'notices'), { recursive: true })
  await mkdir(path.join(sourceRoot, 'attribution'), { recursive: true })
  await mkdir(path.join(sourceRoot, 'provenance'), { recursive: true })
  await writeFile(path.join(sourceRoot, 'program', 'soffice.exe'), 'fixture soffice')
  await writeFile(path.join(sourceRoot, 'licenses', 'LICENSE'), 'MPL-2.0 fixture license')
  await writeFile(path.join(sourceRoot, 'notices', 'NOTICE'), 'LibreOffice fixture notices')
  await writeFile(path.join(sourceRoot, 'attribution', 'NOTICE'), 'The Document Foundation fixture attribution')
  await writeFile(path.join(sourceRoot, 'provenance', 'provenance.json'), JSON.stringify({ source: 'fixture' }))
  return sourceRoot
}

async function runNodeScript(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [...args], { cwd: process.cwd(), windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

function createZip(entries: readonly ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const content = Buffer.from(entry.content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(content.byteLength, 18)
    local.writeUInt32LE(content.byteLength, 22)
    local.writeUInt16LE(name.byteLength, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, content)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x031e, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(content.byteLength, 20)
    central.writeUInt32LE(content.byteLength, 24)
    central.writeUInt16LE(name.byteLength, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(entry.externalAttributes ?? 0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.byteLength + name.byteLength + content.byteLength
  }
  const centralDirectory = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDirectory.byteLength, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, centralDirectory, eocd])
}
