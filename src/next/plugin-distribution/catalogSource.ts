import { sanitizePluginDistributionText } from './sanitization'
import { readNonEmptyString } from './validation'

export const OFFICIAL_CATALOG_SOURCE_KINDS = [
  'bundled_static',
  'local_official_fixture',
  'dev_fixture',
] as const

export type OfficialCatalogSourceKind = (typeof OFFICIAL_CATALOG_SOURCE_KINDS)[number]

export type RejectedCatalogSourceKind =
  | 'remote_url'
  | 'user_url'
  | 'third_party'
  | 'marketplace_url'

export type CatalogSourceKind = OfficialCatalogSourceKind | RejectedCatalogSourceKind | string

export type OfficialCatalogSourceDescriptor = Readonly<{
  kind: CatalogSourceKind
  sourceRef?: string | null
  label?: string | null
}>

export type CatalogSourceValidationCode =
  | 'missing_source_kind'
  | 'unsupported_source_kind'
  | 'remote_source_not_allowed'
  | 'third_party_source_not_allowed'
  | 'dev_fixture_not_allowed'
  | 'unsafe_source_ref'

export type CatalogSourceDiagnostic = Readonly<{
  code: CatalogSourceValidationCode
  field: string
  detail?: string
}>

export type CatalogSourceValidationResult =
  | Readonly<{
      ok: true
      source: Readonly<{
        kind: OfficialCatalogSourceKind
        sourceRef: string | null
        label: string
      }>
      diagnostics: readonly CatalogSourceDiagnostic[]
    }>
  | Readonly<{
      ok: false
      diagnostics: readonly CatalogSourceDiagnostic[]
    }>

export type CatalogSourceValidationOptions = Readonly<{
  allowDevFixtures?: boolean
}>

const SAFE_SOURCE_REF_RE = /^[a-z0-9][a-z0-9._:-]{1,127}$/iu
const REJECTED_REMOTE_KINDS = new Set<string>(['remote_url', 'user_url', 'marketplace_url'])
const REJECTED_THIRD_PARTY_KINDS = new Set<string>(['third_party'])

export function validateOfficialCatalogSource(
  input: OfficialCatalogSourceDescriptor,
  options?: CatalogSourceValidationOptions
): CatalogSourceValidationResult {
  const diagnostics: CatalogSourceDiagnostic[] = []
  const kind = readNonEmptyString(input.kind)?.toLowerCase()
  if (!kind) {
    return fail('missing_source_kind', 'kind', 'catalog source kind is required')
  }

  if (REJECTED_REMOTE_KINDS.has(kind)) {
    diagnostics.push(diagnostic('remote_source_not_allowed', 'kind', 'catalog source must be local/static'))
  } else if (REJECTED_THIRD_PARTY_KINDS.has(kind)) {
    diagnostics.push(diagnostic('third_party_source_not_allowed', 'kind', 'catalog source must be official'))
  } else if (!isOfficialCatalogSourceKind(kind)) {
    diagnostics.push(diagnostic('unsupported_source_kind', 'kind', 'unsupported catalog source kind'))
  } else if (kind === 'dev_fixture' && options?.allowDevFixtures !== true) {
    diagnostics.push(diagnostic('dev_fixture_not_allowed', 'kind', 'dev fixture catalogs require explicit test/dev opt-in'))
  }

  const sourceRefResult = normalizeSourceRef(input.sourceRef ?? null)
  if (!sourceRefResult.ok) {
    diagnostics.push(diagnostic('unsafe_source_ref', 'sourceRef', sourceRefResult.detail))
  }

  if (diagnostics.length > 0 || !isOfficialCatalogSourceKind(kind) || !sourceRefResult.ok) {
    return { ok: false, diagnostics }
  }

  return {
    ok: true,
    source: {
      kind,
      sourceRef: sourceRefResult.value,
      label: sanitizePluginDistributionText(input.label) ?? kind,
    },
    diagnostics: [],
  }
}

function isOfficialCatalogSourceKind(value: string): value is OfficialCatalogSourceKind {
  return value === 'bundled_static' || value === 'local_official_fixture' || value === 'dev_fixture'
}

function normalizeSourceRef(
  input: string | null
): Readonly<{ ok: true; value: string | null } | { ok: false; detail: string }> {
  if (input === null) return { ok: true, value: null }
  const value = readNonEmptyString(input)
  if (!value) return { ok: false, detail: 'sourceRef cannot be blank when provided' }
  if (!SAFE_SOURCE_REF_RE.test(value) || containsPathOrUrlSyntax(value)) {
    return { ok: false, detail: 'sourceRef must be an abstract local/static catalog reference' }
  }
  return { ok: true, value }
}

function containsPathOrUrlSyntax(value: string): boolean {
  return (
    value.includes('/') ||
    value.includes('\\') ||
    /(^|[\\/])\.\.($|[\\/])/u.test(value) ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    /^\\\\/u.test(value) ||
    /^\//u.test(value) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(value)
  )
}

function fail(
  code: CatalogSourceValidationCode,
  field: string,
  detail: string
): CatalogSourceValidationResult {
  return { ok: false, diagnostics: [diagnostic(code, field, detail)] }
}

function diagnostic(
  code: CatalogSourceValidationCode,
  field: string,
  detail: string
): CatalogSourceDiagnostic {
  return { code, field, detail: sanitizePluginDistributionText(detail) }
}
