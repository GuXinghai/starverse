import type {
  PluginCatalogEntry,
  PluginPackageArchitecture,
  PluginPackageCapability,
  PluginPackagePlatform,
  PluginPackageRuntimeKind,
} from './types'
import { compareSemverLike, readNonEmptyString } from './validation'

export type CatalogCompatibilityEnvironment = Readonly<{
  platform?: string
  architecture?: string
  appVersion?: string
  runtimeKind?: PluginPackageRuntimeKind | string | null
  capabilities?: readonly (PluginPackageCapability | string)[]
}>

export type CatalogEntryCapabilityMetadata = Readonly<{
  capabilities?: readonly PluginPackageCapability[]
}>

export type CatalogCompatibilityReason =
  | 'incompatible_platform'
  | 'incompatible_arch'
  | 'incompatible_app_version'
  | 'runtime_kind_unsupported'
  | 'capability_unsupported'

export type CatalogCompatibilityResult = Readonly<{
  compatible: boolean
  platformCompatible: boolean
  architectureCompatible: boolean
  appVersionCompatible: boolean
  runtimeKindCompatible: boolean
  capabilityCompatible: boolean
  reasons: readonly CatalogCompatibilityReason[]
}>

export function evaluateCatalogEntryCompatibility(
  entry: PluginCatalogEntry,
  environment?: CatalogCompatibilityEnvironment,
  metadata?: CatalogEntryCapabilityMetadata
): CatalogCompatibilityResult {
  const platform = normalizePlatform(environment?.platform)
  const architecture = normalizeArchitecture(environment?.architecture)
  const appVersion = readNonEmptyString(environment?.appVersion)
  const requestedRuntimeKind = readNonEmptyString(environment?.runtimeKind)
  const requestedCapabilities = normalizeCapabilities(environment?.capabilities)
  const entryCapabilities = new Set(metadata?.capabilities ?? [])

  const platformCompatible =
    entry.compatibility.platforms.includes('any') ||
    entry.compatibility.platforms.includes(platform) ||
    entry.platform === 'any' ||
    entry.platform === platform
  const architectureCompatible =
    entry.compatibility.architectures.includes('any') ||
    entry.compatibility.architectures.includes(architecture) ||
    entry.arch === 'any' ||
    entry.arch === architecture
  const appVersionCompatible = appVersion
    ? satisfiesSemverRange(appVersion, entry.compatibility.starverseVersionRange)
    : true
  const runtimeKindCompatible = requestedRuntimeKind ? entry.runtimeKind === requestedRuntimeKind : true
  const capabilityCompatible =
    requestedCapabilities.length === 0 ||
    requestedCapabilities.every((capability) => entryCapabilities.has(capability))

  const reasons: CatalogCompatibilityReason[] = []
  if (!platformCompatible) reasons.push('incompatible_platform')
  if (!architectureCompatible) reasons.push('incompatible_arch')
  if (!appVersionCompatible) reasons.push('incompatible_app_version')
  if (!runtimeKindCompatible) reasons.push('runtime_kind_unsupported')
  if (!capabilityCompatible) reasons.push('capability_unsupported')

  return {
    compatible: reasons.length === 0,
    platformCompatible,
    architectureCompatible,
    appVersionCompatible,
    runtimeKindCompatible,
    capabilityCompatible,
    reasons,
  }
}

function normalizePlatform(value: string | undefined): PluginPackagePlatform {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'win32' || normalized === 'darwin' || normalized === 'linux') return normalized
  return 'any'
}

function normalizeArchitecture(value: string | undefined): PluginPackageArchitecture {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'x64' || normalized === 'arm64') return normalized
  return 'any'
}

function normalizeCapabilities(
  input: readonly (PluginPackageCapability | string)[] | undefined
): readonly PluginPackageCapability[] {
  if (!input) return []
  return input.filter(isKnownCapability)
}

function isKnownCapability(value: string): value is PluginPackageCapability {
  return (
    value === 'file_identification' ||
    value === 'document_conversion' ||
    value === 'spreadsheet_conversion' ||
    value === 'presentation_conversion' ||
    value === 'text_extraction' ||
    value === 'metadata_extraction' ||
    value === 'audio_video_probe' ||
    value === 'model_inference' ||
    value === 'utility'
  )
}

function satisfiesSemverRange(currentVersion: string, starverseVersionRange: string): boolean {
  const range = starverseVersionRange.trim()
  if (!range) return false

  if (range.startsWith('>=')) {
    const minimum = range.slice(2).trim()
    const comparison = compareSemverLike(currentVersion, minimum)
    return comparison !== null && comparison >= 0
  }
  if (range.startsWith('=')) {
    const expected = range.slice(1).trim()
    const comparison = compareSemverLike(currentVersion, expected)
    return comparison !== null && comparison === 0
  }

  const comparison = compareSemverLike(currentVersion, range)
  return comparison !== null && comparison === 0
}
