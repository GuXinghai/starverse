import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  type CatalogSignatureVerificationResult,
  type PluginCatalogSignature,
  type TrustedCatalogPublicKeyMap,
  verifyCatalogSignature,
} from './pluginCatalogSignature'

export const OFFICIAL_PLUGIN_CATALOG_SCHEMA_VERSION = '1' as const
export const OFFICIAL_PLUGIN_CATALOG_SOURCE = 'official' as const

export type OfficialPluginCatalogEntry = Readonly<{
  pluginId: string
  pluginVersion: string
  packageSha256: string
  manifestSha256: string
  packagePath: string | null
  manifestPath: string | null
}>

export type OfficialPluginCatalog = Readonly<{
  schemaVersion: typeof OFFICIAL_PLUGIN_CATALOG_SCHEMA_VERSION
  source: typeof OFFICIAL_PLUGIN_CATALOG_SOURCE
  generatedAt: string | null
  plugins: readonly OfficialPluginCatalogEntry[]
  signature: PluginCatalogSignature
}>

type CatalogValidationSuccess = Readonly<{
  ok: true
  catalog: OfficialPluginCatalog
}>

type CatalogValidationFailure = Readonly<{
  ok: false
  errors: readonly string[]
}>

export type CatalogValidationResult = CatalogValidationSuccess | CatalogValidationFailure

export type CatalogHashVerificationResult = Readonly<{
  ok: boolean
  manifestSha256Match: boolean
  packageSha256Match: boolean
}>

export async function loadOfficialPluginCatalogFromFile(input: Readonly<{
  catalogPath: string
  readUtf8File?: (path: string) => Promise<string>
}>): Promise<OfficialPluginCatalog> {
  const readUtf8File = input.readUtf8File ?? defaultReadUtf8File
  const raw = await readUtf8File(input.catalogPath)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`invalid catalog json: ${detail}`)
  }
  return parseOfficialPluginCatalog(parsed)
}

export function validateOfficialPluginCatalog(input: unknown): CatalogValidationResult {
  const errors: string[] = []
  const source = asObject(input)
  if (!source) {
    return { ok: false, errors: ['catalog must be an object'] }
  }

  const schemaVersion = normalizeNonEmptyString(source.schemaVersion)
  if (!schemaVersion) {
    errors.push('schemaVersion is required')
  } else if (schemaVersion !== OFFICIAL_PLUGIN_CATALOG_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${OFFICIAL_PLUGIN_CATALOG_SCHEMA_VERSION}`)
  }

  const catalogSource = normalizeNonEmptyString(source.source)
  if (!catalogSource) {
    errors.push('source is required')
  } else if (catalogSource !== OFFICIAL_PLUGIN_CATALOG_SOURCE) {
    errors.push(`source must be ${OFFICIAL_PLUGIN_CATALOG_SOURCE}`)
  }

  const generatedAt = parseOptionalString(source.generatedAt, 'generatedAt', errors)
  const plugins = parsePlugins(source.plugins, errors)
  const signature = parseSignature(source.signature, errors)

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    catalog: {
      schemaVersion: OFFICIAL_PLUGIN_CATALOG_SCHEMA_VERSION,
      source: OFFICIAL_PLUGIN_CATALOG_SOURCE,
      generatedAt,
      plugins,
      signature: signature!,
    },
  }
}

export function parseOfficialPluginCatalog(input: unknown): OfficialPluginCatalog {
  const result = validateOfficialPluginCatalog(input)
  if (!result.ok) {
    throw new Error(`invalid official catalog: ${result.errors.join('; ')}`)
  }
  return result.catalog
}

export function toOfficialCatalogSignedPayload(catalog: OfficialPluginCatalog): Record<string, unknown> {
  return {
    schemaVersion: catalog.schemaVersion,
    source: catalog.source,
    generatedAt: catalog.generatedAt,
    plugins: catalog.plugins.map((plugin) => ({
      pluginId: plugin.pluginId,
      pluginVersion: plugin.pluginVersion,
      packageSha256: plugin.packageSha256,
      manifestSha256: plugin.manifestSha256,
      packagePath: plugin.packagePath,
      manifestPath: plugin.manifestPath,
    })),
  }
}

export function verifyOfficialPluginCatalogSignature(input: Readonly<{
  catalog: OfficialPluginCatalog
  trustedRoots: TrustedCatalogPublicKeyMap
}>): CatalogSignatureVerificationResult {
  return verifyCatalogSignature({
    signedPayload: toOfficialCatalogSignedPayload(input.catalog),
    signature: input.catalog.signature,
    trustedRoots: input.trustedRoots,
  })
}

export function verifyCatalogEntryHashes(input: Readonly<{
  entry: Pick<OfficialPluginCatalogEntry, 'manifestSha256' | 'packageSha256'>
  manifestBytes: Uint8Array
  packageBytes: Uint8Array
}>): CatalogHashVerificationResult {
  const manifestActual = sha256Hex(input.manifestBytes)
  const packageActual = sha256Hex(input.packageBytes)
  const manifestSha256Match = manifestActual === normalizeSha256Hex(input.entry.manifestSha256)
  const packageSha256Match = packageActual === normalizeSha256Hex(input.entry.packageSha256)
  return {
    ok: manifestSha256Match && packageSha256Match,
    manifestSha256Match,
    packageSha256Match,
  }
}

function parsePlugins(input: unknown, errors: string[]): readonly OfficialPluginCatalogEntry[] {
  if (!Array.isArray(input)) {
    errors.push('plugins must be an array')
    return []
  }
  const plugins: OfficialPluginCatalogEntry[] = []
  const dedupe = new Set<string>()

  input.forEach((entry, index) => {
    const source = asObject(entry)
    if (!source) {
      errors.push(`plugins[${index}] must be an object`)
      return
    }

    const pluginId = normalizeNonEmptyString(source.pluginId)
    const pluginVersion = normalizeNonEmptyString(source.pluginVersion)
    const manifestSha256 = normalizeSha256Hex(source.manifestSha256)
    const packageSha256 = normalizeSha256Hex(source.packageSha256)
    const packagePath = parseOptionalString(source.packagePath, `plugins[${index}].packagePath`, errors)
    const manifestPath = parseOptionalString(source.manifestPath, `plugins[${index}].manifestPath`, errors)

    if (!pluginId) errors.push(`plugins[${index}].pluginId is required`)
    if (!pluginVersion) errors.push(`plugins[${index}].pluginVersion is required`)
    if (!manifestSha256) errors.push(`plugins[${index}].manifestSha256 must be a sha256 hex string`)
    if (!packageSha256) errors.push(`plugins[${index}].packageSha256 must be a sha256 hex string`)

    if (!pluginId || !pluginVersion || !manifestSha256 || !packageSha256) return

    const dedupeKey = `${pluginId}@${pluginVersion}`
    if (dedupe.has(dedupeKey)) {
      errors.push(`plugins[${index}] duplicates pluginId+pluginVersion: ${dedupeKey}`)
      return
    }
    dedupe.add(dedupeKey)

    plugins.push({
      pluginId,
      pluginVersion,
      manifestSha256,
      packageSha256,
      packagePath,
      manifestPath,
    })
  })

  return plugins
}

function parseSignature(input: unknown, errors: string[]): PluginCatalogSignature | null {
  const source = asObject(input)
  if (!source) {
    errors.push('signature is required')
    return null
  }

  const keyId = normalizeNonEmptyString(source.keyId)
  const algorithm = normalizeNonEmptyString(source.algorithm)
  const value = normalizeNonEmptyString(source.value)
  if (!keyId) errors.push('signature.keyId is required')
  if (!algorithm) errors.push('signature.algorithm is required')
  if (!value) errors.push('signature.value is required')

  if (!keyId || !algorithm || !value) {
    return null
  }
  if (algorithm !== 'ed25519') {
    errors.push('signature.algorithm must be ed25519')
    return null
  }
  return {
    keyId,
    algorithm: 'ed25519',
    value,
  }
}

function parseOptionalString(input: unknown, field: string, errors: string[]): string | null {
  if (input == null) return null
  const normalized = normalizeNonEmptyString(input)
  if (!normalized) {
    errors.push(`${field} must be a non-empty string when provided`)
    return null
  }
  return normalized
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeSha256Hex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : null
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

async function defaultReadUtf8File(catalogPath: string): Promise<string> {
  return readFile(catalogPath, 'utf8')
}
