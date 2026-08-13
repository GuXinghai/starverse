import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'

const ROOT = process.cwd()
const SPEC_ROOT = path.join(ROOT, 'scripts', 'plugin-packaging', 'magika')
const OUT = path.join(ROOT, '.artifacts', 'plugin-packages')
const VERSION = '0.2.0'
const MODEL_VERSION = 'standard_v3_3'
const DOWNLOAD_CACHE = path.join(OUT, 'download-cache', 'magika', MODEL_VERSION)
const ARTIFACT = `starverse-plugin-magika-${VERSION}-any-any.zip`
const STAGE = path.join(OUT, 'staging', ARTIFACT.replace(/\.zip$/u, ''))
const ENGINE = path.join(STAGE, 'engine')
const SPEC = JSON.parse(readFileSync(path.join(SPEC_ROOT, 'build-spec.json'), 'utf8'))
const CORE = [
  'runtime/magika-pure-js-runtime.mjs',
  `model/${MODEL_VERSION}/model.json`,
  `model/${MODEL_VERSION}/group1-shard1of1.bin`,
  `model/${MODEL_VERSION}/config.min.json`,
]

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

async function main() {
  assertInputs()
  const work = await materialize()
  try {
    await rm(STAGE, { recursive: true, force: true })
    await mkdir(path.join(ENGINE, 'runtime'), { recursive: true })
    await mkdir(path.join(ENGINE, 'model', MODEL_VERSION), { recursive: true })
    await cp(path.join(work, 'node_modules'), path.join(ENGINE, 'node_modules'), { recursive: true })
    await rm(path.join(ENGINE, 'node_modules', '.bin'), { recursive: true, force: true })
    await rm(path.join(ENGINE, 'node_modules', '.package-lock.json'), { force: true })
    await normalizePackagedMagikaManifest()
    await cp(path.join(SPEC_ROOT, 'magika-pure-js-runtime.mjs'), path.join(ENGINE, 'runtime', 'magika-pure-js-runtime.mjs'))
    await downloadModels()
    await assertPortableRuntime()
    await writeManifests()
    const inventory = await buildInventory()
    const inventoryBytes = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`)
    await writeFile(path.join(STAGE, 'inventory.json'), inventoryBytes)
    const entries = await listFiles(STAGE)
    const zipBytes = createZip(entries)
    await mkdir(OUT, { recursive: true })
    const zipPath = path.join(OUT, ARTIFACT)
    await writeFile(zipPath, zipBytes)
    const summary = {
      artifactName: ARTIFACT,
      pluginId: 'magika',
      pluginVersion: VERSION,
      modelVersion: MODEL_VERSION,
      platform: 'any',
      arch: 'any',
      packageSizeBytes: zipBytes.byteLength,
      packageSha256: sha256(zipBytes),
      manifestSha256: sha256(await readFile(path.join(STAGE, 'manifest.json'))),
      inventorySha256: sha256(inventoryBytes),
      stagedFileCount: entries.length,
      signatureStatus: 'pending-production-signature',
    }
    await writeFile(path.join(OUT, ARTIFACT.replace('.zip', '.summary.json')), `${JSON.stringify(summary, null, 2)}\n`)
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

function assertInputs() {
  for (const name of ['package.json', 'package-lock.json', 'build-spec.json', 'magika-pure-js-runtime.mjs', 'MAGIKA-LICENSE.md', 'ATTRIBUTION.md']) {
    if (!existsSync(path.join(SPEC_ROOT, name))) throw new Error(`missing Magika build input: ${name}`)
  }
  if (SPEC.pluginVersion !== VERSION || SPEC.modelVersion !== MODEL_VERSION || SPEC.magikaPackageVersion !== '1.0.0') {
    throw new Error('Magika build spec version mismatch')
  }
}

async function materialize() {
  const work = await mkdtemp(path.join(os.tmpdir(), 'starverse-magika-build-'))
  await cp(path.join(SPEC_ROOT, 'package.json'), path.join(work, 'package.json'))
  await cp(path.join(SPEC_ROOT, 'package-lock.json'), path.join(work, 'package-lock.json'))
  const npmCli = process.platform === 'win32'
    ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : null
  const command = npmCli ? process.execPath : 'npm'
  const args = [...(npmCli ? [npmCli] : []), 'ci', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund']
  const result = spawnSync(command, args, {
    cwd: work, shell: false, stdio: 'inherit', env: process.env,
  })
  if (result.status !== 0) {
    await rm(work, { recursive: true, force: true })
    const detail = result.error instanceof Error ? `: ${result.error.message}` : ''
    throw new Error(`Magika dependency materialization failed with exit ${result.status ?? 'unknown'}${detail}`)
  }
  const manifest = JSON.parse(await readFile(path.join(work, 'node_modules', 'magika', 'package.json'), 'utf8'))
  if (manifest.version !== SPEC.magikaPackageVersion) throw new Error('materialized Magika version mismatch')
  return work
}

async function downloadModels() {
  for (const model of SPEC.modelFiles) {
    if (!model || typeof model.name !== 'string' || typeof model.url !== 'string' || !/^[0-9a-f]{64}$/u.test(model.sha256)) {
      throw new Error('invalid Magika model build specification')
    }
    const cached = path.join(DOWNLOAD_CACHE, model.sha256)
    let bytes = existsSync(cached) ? await readFile(cached) : null
    if (!bytes || sha256(bytes) !== model.sha256) {
      const response = await fetch(model.url, { redirect: 'follow' })
      if (!response.ok) throw new Error(`Magika model download failed: ${model.name}: HTTP ${response.status}`)
      bytes = Buffer.from(await response.arrayBuffer())
      if (sha256(bytes) !== model.sha256) throw new Error(`Magika model hash mismatch: ${model.name}`)
      await mkdir(DOWNLOAD_CACHE, { recursive: true })
      await writeFile(cached, bytes)
    }
    await writeFile(path.join(ENGINE, 'model', MODEL_VERSION, model.name), bytes)
  }
}

async function assertPortableRuntime() {
  for (const forbidden of [
    path.join(ENGINE, 'node_modules', '@tensorflow', 'tfjs-node'),
    path.join(ENGINE, 'node_modules', '@tensorflow', 'tfjs-node-gpu'),
    path.join(ENGINE, 'node_modules', '@mapbox', 'node-pre-gyp'),
  ]) {
    if (existsSync(forbidden)) throw new Error('native or optional Magika dependency was materialized')
  }
  const native = (await listFiles(ENGINE)).find((entry) => entry.relativePath.toLowerCase().endsWith('.node'))
  if (native) throw new Error(`native runtime artifact is forbidden: ${native.relativePath}`)
  for (const entry of (await listFiles(path.join(ENGINE, 'node_modules'))).filter((value) => value.relativePath.endsWith('package.json'))) {
    const manifest = JSON.parse(await readFile(entry.absolutePath, 'utf8'))
    if (manifest.gypfile === true || Object.keys(manifest.optionalDependencies ?? {}).length > 0) {
      throw new Error(`optional or native dependency declaration is forbidden: ${entry.relativePath}`)
    }
  }
}

async function normalizePackagedMagikaManifest() {
  for (const filename of [
    path.join(ENGINE, 'node_modules', 'magika', 'package.json'),
    path.join(ENGINE, 'node_modules', 'magika', 'dist', 'cjs', 'package.json'),
    path.join(ENGINE, 'node_modules', 'magika', 'dist', 'mjs', 'package.json'),
  ]) {
    const manifest = JSON.parse(await readFile(filename, 'utf8'))
    delete manifest.optionalDependencies
    delete manifest.bin
    delete manifest.scripts
    delete manifest.devDependencies
    await writeFile(filename, `${JSON.stringify(manifest, null, 2)}\n`)
  }
}

async function writeManifests() {
  const integrity = Object.fromEntries(await Promise.all(CORE.map(async (relativePath) => [
    relativePath, sha256(await readFile(path.join(ENGINE, relativePath))),
  ])))
  const engineManifest = {
    manifestSchemaVersion: '1', engineId: 'magika', displayName: 'Magika managed plugin',
    pluginVersion: VERSION, runtimeKind: 'local_loader', runtimeEntry: 'runtime/magika-pure-js-runtime.mjs',
    modelVersion: MODEL_VERSION,
    modelFiles: [`model/${MODEL_VERSION}/model.json`, `model/${MODEL_VERSION}/group1-shard1of1.bin`],
    configFiles: [`model/${MODEL_VERSION}/config.min.json`],
    requiredRuntimePaths: [{ path: 'node_modules/magika/package.json', kind: 'file' }],
    dependencyRoots: [{ path: 'node_modules', kind: 'directory' }],
    integrity, license: 'Apache-2.0', attribution: 'Magika - Copyright 2024 Google LLC',
    healthcheck: null, capabilities: ['text_extraction'], supportedFormatIds: [], supportedMimeTypes: [],
    taxonomyMapVersionCompatibility: null,
    supportedLabels: ['json', 'javascript', 'typescript', 'html', 'css', 'markdown', 'python', 'yaml', 'xml', 'txt'],
    minStarverseVersion: null, platform: 'any',
  }
  await writeFile(path.join(ENGINE, 'manifest.json'), `${JSON.stringify(engineManifest, null, 2)}\n`)
  await mkdir(path.join(STAGE, 'licenses'), { recursive: true })
  await mkdir(path.join(STAGE, 'attribution'), { recursive: true })
  await mkdir(path.join(STAGE, 'signatures'), { recursive: true })
  await cp(path.join(SPEC_ROOT, 'MAGIKA-LICENSE.md'), path.join(STAGE, 'licenses', 'MAGIKA.md'))
  await cp(path.join(SPEC_ROOT, 'ATTRIBUTION.md'), path.join(STAGE, 'attribution', 'ATTRIBUTION.md'))
  await writeFile(path.join(STAGE, 'signatures', 'PACKAGE-SIGNATURE-PENDING.json'), `${JSON.stringify({
    status: 'pending-production-signature', packageArtifact: ARTIFACT,
    note: 'Production Ed25519 detached signature is generated by the protected release workflow.',
  }, null, 2)}\n`)
  const packageManifest = {
    manifestSchemaVersion: '1', pluginId: 'magika', displayName: 'Starverse Magika File Type Classifier',
    publisher: 'Starverse', pluginVersion: VERSION, runtimeKind: 'managed',
    compatibility: { platforms: ['any'], architectures: ['any'], starverseVersionRange: '>=0.0.0' },
    capabilities: ['file_identification', 'model_inference'], artifactInventoryRef: 'inventory.json',
    licenseRefs: ['licenses/MAGIKA.md'], attributionRefs: ['attribution/ATTRIBUTION.md'],
    network: { allowed: false }, modelVersion: MODEL_VERSION, engineManifestRef: 'engine/manifest.json',
    runtimeEntryRef: 'engine/runtime/magika-pure-js-runtime.mjs',
    modelRefs: [`engine/model/${MODEL_VERSION}/model.json`, `engine/model/${MODEL_VERSION}/group1-shard1of1.bin`],
    configRefs: [`engine/model/${MODEL_VERSION}/config.min.json`],
  }
  await writeFile(path.join(STAGE, 'manifest.json'), `${JSON.stringify(packageManifest, null, 2)}\n`)
}

async function buildInventory() {
  const files = (await listFiles(STAGE)).filter((entry) => entry.relativePath !== 'inventory.json')
  return {
    inventorySchemaVersion: '1', pluginId: 'magika', pluginVersion: VERSION,
    artifacts: await Promise.all(files.map(async (entry) => {
      const bytes = await readFile(entry.absolutePath)
      return {
        artifactId: `${entry.relativePath.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 160)}-${sha256(Buffer.from(entry.relativePath)).slice(0, 12)}`,
        relativePath: entry.relativePath,
        artifactClass: entry.relativePath.includes('manifest.json') ? 'manifest'
          : entry.relativePath.startsWith('signatures/') ? 'signature'
            : entry.relativePath.startsWith('licenses/') ? 'license'
              : entry.relativePath.startsWith('attribution/') ? 'attribution'
                : entry.relativePath.includes('/model/') ? 'model'
                  : entry.relativePath.includes('/runtime/') || entry.relativePath.includes('/node_modules/') ? 'runtime' : 'other',
        sha256: sha256(bytes), sizeBytes: bytes.byteLength, required: true,
      }
    })),
  }
}

async function listFiles(root) {
  const output = []
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolutePath)
      else if (entry.isFile()) output.push({ absolutePath, relativePath: path.relative(root, absolutePath).replace(/\\/gu, '/') })
      else throw new Error(`non-regular runtime entry is forbidden: ${path.relative(root, absolutePath)}`)
    }
  }
  await visit(root)
  return output.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

function createZip(entries) {
  const localParts = [], centralParts = []
  let offset = 0
  for (const entry of entries) {
    const content = readFileSync(entry.absolutePath)
    const name = Buffer.from(entry.relativePath, 'utf8')
    const compressed = deflateRawSync(content, { level: 9 })
    const crc = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(content.length, 22); local.writeUInt16LE(name.length, 26)
    localParts.push(local, name, compressed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + compressed.length
  }
  const central = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, central, end])
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let value = n
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
    table[n] = value >>> 0
  }
  return table
})()
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }
