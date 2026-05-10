import type { EngineId, EnginePlatform } from './externalEngineTypes'
import {
  createPackageFileEntry,
  createRuntimePackageInventory,
  type PackageArtifactClass,
  type PackageFileEntry,
  type RuntimePackageInventory,
} from './enginePackageContract'

export const CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES: readonly PackageArtifactClass[] = [
  'runtime',
  'manifest',
  'signature',
  'license',
  'attribution',
] as const

export type ConversionPackageSeed = Readonly<{
  engineId: EngineId
  packageVersion: string
  platform: EnginePlatform
  runtimeEntryRelPath: string
  license?: string | null
  attribution?: string | null
}>

export function createConversionRuntimeInventory(
  seed: ConversionPackageSeed,
  extraFiles?: readonly PackageFileEntry[]
): RuntimePackageInventory {
  const runtimeFile = createPackageFileEntry({
    relativePath: seed.runtimeEntryRelPath,
    artifactClass: 'runtime',
    required: true,
  })
  const manifestFile = createPackageFileEntry({
    relativePath: 'manifest.json',
    artifactClass: 'manifest',
    required: true,
  })
  const signatureFile = createPackageFileEntry({
    relativePath: 'manifest.json.sig',
    artifactClass: 'signature',
    required: true,
  })
  const licenseFile = createPackageFileEntry({
    relativePath: 'LICENSE',
    artifactClass: 'license',
    required: true,
  })
  const attributionFile = createPackageFileEntry({
    relativePath: 'ATTRIBUTION',
    artifactClass: 'attribution',
    required: true,
  })

  return createRuntimePackageInventory(
    {
      engineId: seed.engineId,
      packageVersion: seed.packageVersion,
      platform: seed.platform,
      license: seed.license ?? null,
      attribution: seed.attribution ?? null,
    },
    [runtimeFile, manifestFile, signatureFile, licenseFile, attributionFile, ...(extraFiles ?? [])]
  )
}
