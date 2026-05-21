#!/usr/bin/env node

import { createHash, sign } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'

const SIGNATURE_SCHEMA_VERSION = '1'
const DEFAULT_EXPIRES_DAYS = 365

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const zipPath = args.zip
  if (!zipPath) {
    throw new Error('missing required --zip <path>')
  }

  const privateKeyPem = readRequiredEnv('STARVERSE_PLUGIN_SIGNING_PRIVATE_KEY')
  const keyId = readRequiredEnv('STARVERSE_PLUGIN_SIGNING_KEY_ID')
  const zipBytes = await readFile(zipPath)
  const signedAt = args.signedAt ?? new Date().toISOString()
  const expiresAt = args.expiresAt ?? new Date(Date.parse(signedAt) + DEFAULT_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const entries = extractRequiredZipEntries(zipBytes, ['manifest.json', 'inventory.json'])
  const packageSha256 = sha256(zipBytes)
  const manifestSha256 = sha256(entries.get('manifest.json'))
  const inventorySha256 = sha256(entries.get('inventory.json'))
  const signatureValue = sign(null, zipBytes, privateKeyPem).toString('base64')

  const envelope = {
    signatureSchemaVersion: SIGNATURE_SCHEMA_VERSION,
    keyId,
    algorithm: 'ed25519',
    signedAt,
    expiresAt,
    value: signatureValue,
    coveredManifestSha256: manifestSha256,
    coveredInventorySha256: inventorySha256,
  }
  const result = {
    artifactName: path.basename(zipPath),
    zipPath: path.resolve(zipPath),
    packageSha256,
    packageSizeBytes: zipBytes.byteLength,
    manifestSha256,
    inventorySha256,
    signatureEnvelope: envelope,
  }

  if (args.out) {
    await mkdir(path.dirname(path.resolve(args.out)), { recursive: true })
    await writeFile(args.out, `${JSON.stringify(envelope, null, 2)}\n`)
  }
  if (args.summaryOut) {
    await mkdir(path.dirname(path.resolve(args.summaryOut)), { recursive: true })
    await writeFile(args.summaryOut, `${JSON.stringify(result, null, 2)}\n`)
  }

  const printable = args.printEnvelope ? result : {
    ...result,
    signatureEnvelope: {
      ...envelope,
      value: '<redacted>',
    },
  }
  console.log(JSON.stringify(printable, null, 2))
}

function parseArgs(argv) {
  const args = {
    help: false,
    printEnvelope: false,
    zip: null,
    out: null,
    summaryOut: null,
    signedAt: null,
    expiresAt: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--print-envelope') {
      args.printEnvelope = true
    } else if (arg === '--zip') {
      args.zip = requireValue(argv, ++i, arg)
    } else if (arg === '--out') {
      args.out = requireValue(argv, ++i, arg)
    } else if (arg === '--summary-out') {
      args.summaryOut = requireValue(argv, ++i, arg)
    } else if (arg === '--signed-at') {
      args.signedAt = requireValue(argv, ++i, arg)
    } else if (arg === '--expires-at') {
      args.expiresAt = requireValue(argv, ++i, arg)
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  return args
}

function requireValue(argv, index, name) {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`missing value for ${name}`)
  }
  return value
}

function readRequiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`missing required environment variable: ${name}`)
  }
  return value
}

function extractRequiredZipEntries(zipBytes, names) {
  const wanted = new Set(names)
  const out = new Map()
  let offset = 0
  while (offset + 30 <= zipBytes.byteLength) {
    const signature = zipBytes.readUInt32LE(offset)
    if (signature === 0x02014b50 || signature === 0x06054b50) break
    if (signature !== 0x04034b50) {
      throw new Error('invalid zip local file header')
    }

    const flags = zipBytes.readUInt16LE(offset + 6)
    const compressionMethod = zipBytes.readUInt16LE(offset + 8)
    const compressedSize = zipBytes.readUInt32LE(offset + 18)
    const nameLength = zipBytes.readUInt16LE(offset + 26)
    const extraLength = zipBytes.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLength
    const contentStart = nameEnd + extraLength
    const contentEnd = contentStart + compressedSize
    if (contentEnd > zipBytes.byteLength) {
      throw new Error('zip entry extends beyond package bytes')
    }

    const name = zipBytes.subarray(nameStart, nameEnd).toString('utf8')
    if (wanted.has(name)) {
      if ((flags & 0x1) !== 0) {
        throw new Error(`zip entry is encrypted: ${name}`)
      }
      const compressed = zipBytes.subarray(contentStart, contentEnd)
      const content = compressionMethod === 0
        ? Buffer.from(compressed)
        : compressionMethod === 8
          ? inflateRawSync(compressed)
          : null
      if (!content) {
        throw new Error(`unsupported zip compression method for ${name}`)
      }
      out.set(name, content)
    }
    offset = contentEnd
  }

  for (const name of names) {
    if (!out.has(name)) {
      throw new Error(`missing required zip entry: ${name}`)
    }
  }
  return out
}

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function printHelp() {
  console.log(`Usage: node scripts/plugin-signing/sign-official-plugin-release.mjs --zip <path> [options]

Signs an official plugin release package with an Ed25519 detached signature over the entire zip bytes.

Required environment:
  STARVERSE_PLUGIN_SIGNING_PRIVATE_KEY   PEM encoded Ed25519 private key
  STARVERSE_PLUGIN_SIGNING_KEY_ID        stable signing key id

Options:
  --zip <path>           Release zip to sign.
  --out <path>           Write signature envelope JSON.
  --summary-out <path>   Write package hash and signature summary JSON.
  --signed-at <iso>      Override signedAt timestamp.
  --expires-at <iso>     Override expiresAt timestamp.
  --print-envelope       Print the signature value to stdout. Intended for controlled local release only.
  --help                 Show this help.
`)
}
