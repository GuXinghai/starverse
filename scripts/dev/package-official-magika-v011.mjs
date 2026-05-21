import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'

const PACKAGE_VERSION = '0.1.1'
const MODEL_VERSION = 'standard_v3_3'
const PLATFORM = 'win32'
const ARCH = 'x64'
const ARTIFACT_NAME = `starverse-plugin-magika-${PACKAGE_VERSION}-${PLATFORM}-${ARCH}.zip`
const PACKAGE_ROOT = process.cwd()
const SOURCE_ENGINE_DIR = path.join(PACKAGE_ROOT, '.starverse-engines', 'magika')
const OUTPUT_ROOT = path.join(PACKAGE_ROOT, '.artifacts', 'plugin-packages')
const STAGE_ROOT = path.join(OUTPUT_ROOT, 'staging', `starverse-plugin-magika-${PACKAGE_VERSION}-${PLATFORM}-${ARCH}`)
const ENGINE_DIR = path.join(STAGE_ROOT, 'engine')
const LEGACY_METADATA_ROOT = path.join(
  OUTPUT_ROOT,
  'staging',
  'starverse-plugin-magika-0.1.0-win32-x64'
)

const CORE_ENGINE_PATHS = [
  'runtime/magika-pure-js-runtime.mjs',
  'model/standard_v3_3/model.json',
  'model/standard_v3_3/group1-shard1of1.bin',
  'model/standard_v3_3/config.min.json',
]

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

async function main() {
  assertSourceAvailable()
  await rm(STAGE_ROOT, { recursive: true, force: true })
  await mkdir(ENGINE_DIR, { recursive: true })

  await copyEnginePayload()
  await writeEngineManifest()
  await writePackageMetadata()

  const artifacts = await buildInventoryArtifacts()
  const inventory = {
    inventorySchemaVersion: '1',
    pluginId: 'magika',
    pluginVersion: PACKAGE_VERSION,
    artifacts,
  }
  const inventoryBytes = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`)
  await writeFile(path.join(STAGE_ROOT, 'inventory.json'), inventoryBytes)

  const zipEntries = await listFiles(STAGE_ROOT)
  const zipBytes = createZip(zipEntries)
  await mkdir(OUTPUT_ROOT, { recursive: true })
  const zipPath = path.join(OUTPUT_ROOT, ARTIFACT_NAME)
  await writeFile(zipPath, zipBytes)

  const packageManifestBytes = await readFile(path.join(STAGE_ROOT, 'manifest.json'))
  const summary = {
    artifactName: ARTIFACT_NAME,
    stageRoot: STAGE_ROOT,
    zipPath,
    pluginId: 'magika',
    pluginVersion: PACKAGE_VERSION,
    modelVersion: MODEL_VERSION,
    platform: PLATFORM,
    arch: ARCH,
    manifestSha256: sha256(packageManifestBytes),
    inventorySha256: sha256(inventoryBytes),
    packageSizeBytes: zipBytes.byteLength,
    packageSha256: sha256(zipBytes),
    signatureStatus: 'pending-production-signature',
    signaturePayload: 'entire zip bytes',
    requiredRuntimePaths: [
      { path: 'node_modules/magika/package.json', kind: 'file' },
    ],
    dependencyRoots: [{ path: 'node_modules', kind: 'directory' }],
    stagedFileCount: zipEntries.length,
  }
  const summaryPath = path.join(OUTPUT_ROOT, `starverse-plugin-magika-${PACKAGE_VERSION}-${PLATFORM}-${ARCH}.summary.json`)
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)

  console.log(JSON.stringify(summary, null, 2))
}

function assertSourceAvailable() {
  const required = [
    path.join(SOURCE_ENGINE_DIR, 'runtime', 'magika-pure-js-runtime.mjs'),
    path.join(SOURCE_ENGINE_DIR, 'model', 'standard_v3_3', 'model.json'),
    path.join(SOURCE_ENGINE_DIR, 'model', 'standard_v3_3', 'group1-shard1of1.bin'),
    path.join(SOURCE_ENGINE_DIR, 'model', 'standard_v3_3', 'config.min.json'),
    path.join(SOURCE_ENGINE_DIR, 'node_modules', 'magika', 'package.json'),
  ]
  for (const filePath of required) {
    if (!existsSync(filePath)) {
      throw new Error(`missing required local Magika source file: ${path.relative(PACKAGE_ROOT, filePath)}`)
    }
  }
}

async function copyEnginePayload() {
  for (const dirName of ['runtime', 'model', 'config', 'node_modules']) {
    const sourcePath = path.join(SOURCE_ENGINE_DIR, dirName)
    if (existsSync(sourcePath)) {
      await cp(sourcePath, path.join(ENGINE_DIR, dirName), { recursive: true })
    }
  }
  await pruneRuntimeDependencyBuildArtifacts()
  await writeFile(path.join(ENGINE_DIR, 'runtime', 'magika-pure-js-runtime.mjs'), NODE_RUNTIME_WRAPPER)
}

async function pruneRuntimeDependencyBuildArtifacts() {
  const nodeModulesDir = path.join(ENGINE_DIR, 'node_modules')
  const directPrunePaths = [
    path.join(nodeModulesDir, '@tensorflow', 'tfjs', '.rollup.cache'),
  ]
  for (const prunePath of directPrunePaths) {
    await rm(prunePath, { recursive: true, force: true })
  }

  const tfjsNodeDir = path.join(nodeModulesDir, '@tensorflow', 'tfjs-node')
  if (!existsSync(tfjsNodeDir)) return
  const entries = await readdir(tfjsNodeDir, { withFileTypes: true })
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('build-tmp-'))
    .map((entry) => rm(path.join(tfjsNodeDir, entry.name), { recursive: true, force: true })))
}

async function writeEngineManifest() {
  const integrity = Object.fromEntries(
    await Promise.all(CORE_ENGINE_PATHS.map(async (relativePath) => [
      relativePath,
      sha256(await readFile(path.join(ENGINE_DIR, relativePath))),
    ]))
  )
  const manifest = {
    manifestSchemaVersion: '1',
    engineId: 'magika',
    displayName: 'Magika managed plugin',
    pluginVersion: PACKAGE_VERSION,
    runtimeKind: 'local_loader',
    runtimeEntry: 'runtime/magika-pure-js-runtime.mjs',
    modelVersion: MODEL_VERSION,
    modelFiles: [
      'model/standard_v3_3/model.json',
      'model/standard_v3_3/group1-shard1of1.bin',
    ],
    configFiles: ['model/standard_v3_3/config.min.json'],
    requiredRuntimePaths: [
      { path: 'node_modules/magika/package.json', kind: 'file' },
    ],
    dependencyRoots: [
      { path: 'node_modules', kind: 'directory' },
    ],
    integrity,
    license: 'Apache-2.0',
    attribution: 'Magika - Copyright 2024 Google LLC',
    healthcheck: null,
    capabilities: ['text_extraction'],
    supportedFormatIds: [],
    supportedMimeTypes: [],
    taxonomyMapVersionCompatibility: null,
    supportedLabels: ['json', 'javascript', 'typescript', 'html', 'css', 'markdown', 'python', 'yaml', 'xml', 'txt'],
    minStarverseVersion: null,
    platform: PLATFORM,
  }
  await writeFile(path.join(ENGINE_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function writePackageMetadata() {
  await mkdir(path.join(STAGE_ROOT, 'licenses'), { recursive: true })
  await mkdir(path.join(STAGE_ROOT, 'attribution'), { recursive: true })
  await mkdir(path.join(STAGE_ROOT, 'signatures'), { recursive: true })
  await copyOrWrite(
    path.join(LEGACY_METADATA_ROOT, 'licenses', 'MAGIKA.md'),
    path.join(STAGE_ROOT, 'licenses', 'MAGIKA.md'),
    'Magika license metadata from the official Google Magika package.\n'
  )
  await copyOrWrite(
    path.join(LEGACY_METADATA_ROOT, 'licenses', 'DEPENDENCIES.md'),
    path.join(STAGE_ROOT, 'licenses', 'DEPENDENCIES.md'),
    'Runtime dependency license metadata is bundled with this generated package.\n'
  )
  await copyOrWrite(
    path.join(LEGACY_METADATA_ROOT, 'attribution', 'ATTRIBUTION.md'),
    path.join(STAGE_ROOT, 'attribution', 'ATTRIBUTION.md'),
    'Magika - Copyright 2024 Google LLC\n'
  )

  const signaturePlaceholder = {
    status: 'pending-production-signature',
    packageArtifact: ARTIFACT_NAME,
    note: 'Production Ed25519 detached signature is generated outside this repository.',
  }
  await writeFile(
    path.join(STAGE_ROOT, 'signatures', 'PACKAGE-SIGNATURE-PENDING.json'),
    `${JSON.stringify(signaturePlaceholder, null, 2)}\n`
  )

  const packageManifest = {
    manifestSchemaVersion: '1',
    pluginId: 'magika',
    displayName: 'Starverse Magika File Type Classifier',
    publisher: 'Starverse',
    pluginVersion: PACKAGE_VERSION,
    runtimeKind: 'managed',
    compatibility: { platforms: [PLATFORM], architectures: [ARCH], starverseVersionRange: '>=0.0.0' },
    capabilities: ['file_identification', 'model_inference'],
    artifactInventoryRef: 'inventory.json',
    licenseRefs: ['licenses/MAGIKA.md', 'licenses/DEPENDENCIES.md'],
    attributionRefs: ['attribution/ATTRIBUTION.md'],
    network: { allowed: false },
    modelVersion: MODEL_VERSION,
    engineManifestRef: 'engine/manifest.json',
    runtimeEntryRef: 'engine/runtime/magika-pure-js-runtime.mjs',
    modelRefs: [
      'engine/model/standard_v3_3/model.json',
      'engine/model/standard_v3_3/group1-shard1of1.bin',
    ],
    configRefs: ['engine/model/standard_v3_3/config.min.json'],
  }
  await writeFile(path.join(STAGE_ROOT, 'manifest.json'), `${JSON.stringify(packageManifest, null, 2)}\n`)
}

async function copyOrWrite(sourcePath, targetPath, fallbackText) {
  if (existsSync(sourcePath)) {
    await cp(sourcePath, targetPath)
    return
  }
  await writeFile(targetPath, fallbackText)
}

async function buildInventoryArtifacts() {
  const files = (await listFiles(STAGE_ROOT)).filter((entry) => entry.relativePath !== 'inventory.json')
  const artifacts = []
  for (const entry of files) {
    const bytes = await readFile(entry.absolutePath)
    artifacts.push({
      artifactId: artifactIdForPath(entry.relativePath),
      relativePath: entry.relativePath,
      artifactClass: artifactClassForPath(entry.relativePath),
      sha256: sha256(bytes),
      sizeBytes: bytes.byteLength,
      required: true,
    })
  }
  return artifacts
}

function artifactClassForPath(relativePath) {
  if (relativePath === 'manifest.json' || relativePath === 'engine/manifest.json') return 'manifest'
  if (relativePath.startsWith('signatures/')) return 'signature'
  if (relativePath.startsWith('licenses/')) return 'license'
  if (relativePath.startsWith('attribution/')) return 'attribution'
  if (relativePath.startsWith('engine/model/') && relativePath.endsWith('config.min.json')) return 'config'
  if (relativePath.startsWith('engine/model/')) return 'model'
  if (relativePath.startsWith('engine/runtime/') || relativePath.startsWith('engine/node_modules/')) return 'runtime'
  return 'other'
}

function artifactIdForPath(relativePath) {
  const slug = relativePath
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 160)
  return `${slug}-${sha256(Buffer.from(relativePath, 'utf8')).slice(0, 12)}`
}

async function listFiles(rootDir) {
  const out = []
  async function visit(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath)
      } else if (entry.isFile()) {
        out.push({
          absolutePath,
          relativePath: path.relative(rootDir, absolutePath).replace(/\\/gu, '/'),
        })
      }
    }
  }
  await visit(rootDir)
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return out
}

function createZip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const entry of entries) {
    const content = readFileSyncBuffer(entry.absolutePath)
    const nameBytes = Buffer.from(entry.relativePath, 'utf8')
    const compressed = deflateRawSync(content)
    const crc = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.byteLength, 18)
    local.writeUInt32LE(content.byteLength, 22)
    local.writeUInt16LE(nameBytes.byteLength, 26)
    localParts.push(local, nameBytes, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.byteLength, 20)
    central.writeUInt32LE(content.byteLength, 24)
    central.writeUInt16LE(nameBytes.byteLength, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBytes)
    offset += local.byteLength + nameBytes.byteLength + compressed.byteLength
  }
  const centralOffset = offset
  const central = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(central.byteLength, 12)
  eocd.writeUInt32LE(centralOffset, 16)
  return Buffer.concat([...localParts, central, eocd])
}

function readFileSyncBuffer(filePath) {
  return readFileSync(filePath)
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

const NODE_RUNTIME_WRAPPER = `import { Magika } from "magika";
import * as tf from "@tensorflow/tfjs";
import * as http from "node:http";
import * as path from "node:path";
import * as fs from "node:fs/promises";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--model-dir" && i + 1 < argv.length) args.modelDir = argv[++i];
    else if (argv[i] === "--config-dir" && i + 1 < argv.length) args.configDir = argv[++i];
    else if (argv[i] === "--input" && i + 1 < argv.length) args.input = argv[++i];
    else if (argv[i] === "--output-json") args.outputJson = true;
  }
  return args;
}

function serveDirReadOnly(root) {
  const resolvedRoot = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    try {
      const reqPath = new URL(req.url, "http://localhost").pathname;
      const filePath = path.resolve(resolvedRoot, \`.\${reqPath}\`);
      if (!filePath.startsWith(resolvedRoot + path.sep) && filePath !== resolvedRoot) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = { ".json": "application/json", ".bin": "application/octet-stream" };
      res.writeHead(200, { "Content-Type": mimeMap[ext] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(500);
      res.end("Internal Error");
    }
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
    server.on("error", reject);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.modelDir || !args.input) {
    process.stderr.write("usage: node runtime.mjs --model-dir <dir> --input <file> [--config-dir <dir>] [--output-json]\\n");
    process.exit(1);
  }

  await tf.setBackend("cpu");
  await tf.ready();

  const { server, port } = await serveDirReadOnly(args.modelDir);
  const modelURL = \`http://127.0.0.1:\${port}/model.json\`;
  const modelConfigURL = \`http://127.0.0.1:\${port}/config.min.json\`;

  try {
    const magika = new Magika();
    await magika.load({ modelURL, modelConfigURL });
    const inputBytes = await fs.readFile(args.input);
    const result = await magika.identifyBytes(new Uint8Array(inputBytes));
    const output = {
      label: result.prediction?.output?.label ?? "unknown",
      score: result.prediction?.score ?? 0,
      modelVersion: Magika.MODEL_VERSION ?? "unknown",
    };
    process.stdout.write(JSON.stringify(output));
  } finally {
    server.close();
  }
}

main().catch((error) => {
  process.stderr.write(\`classify error: \${error instanceof Error ? error.message : String(error)}\\n\`);
  process.exit(1);
});
`
