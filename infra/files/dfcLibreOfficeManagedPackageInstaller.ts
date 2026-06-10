import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { sanitizePluginDistributionText } from '../../src/next/plugin-distribution/sanitization'
import {
  DFC_OFFICE_PDF_RUNTIME_MANIFEST,
  createDfcLibreOfficeQuarantinedAvailabilitySummary,
  getDfcLibreOfficeRuntimePackageLayoutContract,
  getDfcLibreOfficeManagedRuntimeRoot,
  resolveDfcLibreOfficeRuntimeExecutionDescriptor,
  toDfcLibreOfficePluginLifecycleBridge,
  type DfcLibreOfficePluginLifecycleBridge,
  type DfcLibreOfficeRuntimePackageLayoutContract,
  type DfcOfficePdfManagedRuntimeExecutionDescriptor,
  type DfcOfficePdfRuntimeAvailabilitySummary,
  type DfcOfficePdfRuntimeProductCode,
} from './dfcManagedLibreOfficeRuntime'

export type DfcLibreOfficeManagedPackageInstallDiagnosticCode =
  | 'office_pdf_install_source_missing'
  | 'office_pdf_install_manifest_invalid'
  | 'office_pdf_install_artifact_hash_mismatch'
  | 'office_pdf_install_runtime_unavailable'
  | 'office_pdf_install_path_rejected'
  | 'office_pdf_install_revoked'
  | 'office_pdf_install_activation_failed'
  | 'office_pdf_install_cleanup_failed'

export type DfcLibreOfficeManagedPackageRollbackDiagnosticCode =
  | 'office_pdf_rollback_target_missing'
  | 'office_pdf_rollback_target_revoked'
  | 'office_pdf_rollback_target_invalid'
  | 'office_pdf_rollback_target_quarantined'
  | 'office_pdf_rollback_activation_failed'
  | 'office_pdf_install_cleanup_failed'

export type DfcLibreOfficeManagedPackageLifecycleDiagnosticCode =
  | 'office_pdf_update_target_missing'
  | 'office_pdf_update_target_invalid'
  | 'office_pdf_update_target_quarantined'
  | 'office_pdf_quarantine_applied'
  | 'office_pdf_repair_verified'
  | 'office_pdf_repair_quarantine_retained'
  | 'office_pdf_repair_missing_runtime'
  | 'office_pdf_repair_verification_failed'

export type DfcLibreOfficeManagedPackageDiagnostic = Readonly<{
  code:
    | DfcLibreOfficeManagedPackageInstallDiagnosticCode
    | DfcLibreOfficeManagedPackageRollbackDiagnosticCode
    | DfcLibreOfficeManagedPackageLifecycleDiagnosticCode
  message: string
}>

export type DfcLibreOfficePreviousKnownGoodRuntime = Readonly<{
  managedRuntimeRootDir: string
  packageVersion: string
  libreOfficeVersion: string
  revoked: boolean
}>

export type DfcLibreOfficeManagedPackageQuarantineState = Readonly<{
  quarantined: true
  reason: string
  productCode: DfcOfficePdfRuntimeProductCode
  internalCode: 'office_pdf_runtime_quarantined'
  quarantinedAt: string
  actor: string | null
}>

export type DfcLibreOfficeManagedPackageLifecycleState = Readonly<{
  activeRuntimeRootDir: string | null
  previousKnownGood: DfcLibreOfficePreviousKnownGoodRuntime | null
  quarantine: DfcLibreOfficeManagedPackageQuarantineState | null
}>

export type DfcLibreOfficeManagedPackagePluginImportContract = Readonly<{
  operation: 'import'
  installKind: 'imported_dev_artifact'
  productionApproved: false
  activeRuntimeRef: 'managed_runtime_root'
  bridge: DfcLibreOfficePluginLifecycleBridge
  verification: Readonly<{
    layoutContract: DfcLibreOfficeRuntimePackageLayoutContract
    manifestValidated: boolean
    artifactHashVerified: boolean
    executableHashVerified: boolean
    packageMetadataVerified: boolean
    securityPolicyVerified: boolean
  }>
}>

type DfcLibreOfficeManagedPackageVerificationFlags = DfcLibreOfficeManagedPackagePluginImportContract['verification']

export type DfcLibreOfficeManagedPackageInstallResult =
  | Readonly<{
      ok: true
      activeRuntimeRootDir: string
      runtime: DfcOfficePdfManagedRuntimeExecutionDescriptor
      previousKnownGood: DfcLibreOfficePreviousKnownGoodRuntime | null
      pluginManagement: DfcLibreOfficeManagedPackagePluginImportContract
      cleanupStatus: 'attempted' | 'not_needed' | 'failed'
      diagnostics: readonly DfcLibreOfficeManagedPackageDiagnostic[]
    }>
  | Readonly<{
      ok: false
      activeRuntimeRootDir: null
      runtime: null
      previousKnownGood: null
      pluginManagement: DfcLibreOfficeManagedPackagePluginImportContract
      cleanupStatus: 'attempted' | 'not_needed' | 'failed'
      diagnostics: readonly DfcLibreOfficeManagedPackageDiagnostic[]
    }>

export type DfcLibreOfficeManagedPackageRollbackResult =
  | Readonly<{
      ok: true
      activeRuntimeRootDir: string
      runtime: DfcOfficePdfManagedRuntimeExecutionDescriptor
      cleanupStatus: 'attempted' | 'not_needed' | 'failed'
      diagnostics: readonly DfcLibreOfficeManagedPackageDiagnostic[]
    }>
  | Readonly<{
      ok: false
      activeRuntimeRootDir: null
      runtime: null
      cleanupStatus: 'attempted' | 'not_needed' | 'failed'
      diagnostics: readonly DfcLibreOfficeManagedPackageDiagnostic[]
    }>

export type DfcLibreOfficeManagedPackageLifecycleOperation = 'update' | 'quarantine' | 'repair'
export type DfcLibreOfficeManagedPackageRepairStatus =
  | 'repaired'
  | 'still_unhealthy'
  | 'missing_runtime'
  | 'verification_failed'
  | 'quarantine_retained'

export type DfcLibreOfficeManagedPackageLifecycleOperationResult = Readonly<{
  ok: boolean
  operation: DfcLibreOfficeManagedPackageLifecycleOperation
  activeRuntimeRootDir: string | null
  runtime: DfcOfficePdfManagedRuntimeExecutionDescriptor | null
  previousKnownGood: DfcLibreOfficePreviousKnownGoodRuntime | null
  lifecycleState: DfcLibreOfficeManagedPackageLifecycleState
  repairStatus: DfcLibreOfficeManagedPackageRepairStatus | null
  pluginManagement: DfcLibreOfficeManagedPackagePluginImportContract
  diagnostics: readonly DfcLibreOfficeManagedPackageDiagnostic[]
}>

export type DfcLibreOfficeManagedPackageInstallInput = Readonly<{
  appManagedRootDir: string
  sourceRuntimeRootDir: string
  expectedArtifactSha256?: string | null
  packageRevoked?: boolean | null
  platform?: NodeJS.Platform
  arch?: string
}>

export type DfcLibreOfficeManagedPackageRollbackInput = Readonly<{
  appManagedRootDir: string
  previousKnownGood: DfcLibreOfficePreviousKnownGoodRuntime | null
  previousKnownGoodQuarantined?: boolean | null
  platform?: NodeJS.Platform
  arch?: string
}>

export type DfcLibreOfficeManagedPackageUpdateInput = Readonly<{
  appManagedRootDir: string
  targetRuntimeRootDir: string
  currentState?: DfcLibreOfficeManagedPackageLifecycleState | null
  targetQuarantined?: boolean | null
  expectedArtifactSha256?: string | null
  platform?: NodeJS.Platform
  arch?: string
}>

export type DfcLibreOfficeManagedPackageQuarantineInput = Readonly<{
  appManagedRootDir: string
  reason: string
  actor?: string | null
  now?: Date | string | null
  platform?: NodeJS.Platform
  arch?: string
}>

export type DfcLibreOfficeManagedPackageRepairInput = Readonly<{
  appManagedRootDir: string
  quarantine?: DfcLibreOfficeManagedPackageQuarantineState | null
  allowUnquarantine?: boolean | null
  platform?: NodeJS.Platform
  arch?: string
}>

const NUL_RE = /\0/u
const FULL_SHA256_RE = /^[a-fA-F0-9]{64}$/u

export async function importDfcLibreOfficeManagedRuntimePackage(
  input: DfcLibreOfficeManagedPackageInstallInput
): Promise<DfcLibreOfficeManagedPackageInstallResult> {
  const appRoot = normalizeAbsoluteDir(input.appManagedRootDir)
  const sourceRoot = normalizeAbsoluteDir(input.sourceRuntimeRootDir)
  if (!appRoot || !sourceRoot) {
    return failed('office_pdf_install_path_rejected', 'Office PDF managed package import path was rejected.', 'not_needed')
  }
  if (input.packageRevoked === true) {
    return failed('office_pdf_install_revoked', 'Office PDF managed package is revoked.', 'not_needed')
  }
  if (!await directoryExists(sourceRoot)) {
    return failed('office_pdf_install_source_missing', 'Office PDF managed package source is missing.', 'not_needed')
  }
  if (await containsSymlink(sourceRoot)) {
    return failed('office_pdf_install_path_rejected', 'Office PDF managed package contains unsafe links.', 'not_needed')
  }

  const manifest = await readInstallManifest(sourceRoot)
  if (!manifest.ok) {
    return failed('office_pdf_install_manifest_invalid', 'Office PDF managed package manifest is invalid.', 'not_needed')
  }
  if (input.expectedArtifactSha256 && !isExpectedArtifactHash(manifest.artifactSha256, input.expectedArtifactSha256)) {
    return failed('office_pdf_install_artifact_hash_mismatch', 'Office PDF managed package artifact hash does not match.', 'not_needed', {
      manifestValidated: true,
      artifactHashVerified: false,
    })
  }

  const sourceAvailability = await resolveDfcLibreOfficeRuntimeExecutionDescriptor({
    managedRuntimeRootDir: sourceRoot,
    platform: input.platform,
    arch: input.arch,
  })
  if (!sourceAvailability.ok) {
    return failed('office_pdf_install_runtime_unavailable', 'Office PDF managed package runtime is unavailable.', 'not_needed', {
      manifestValidated: true,
      artifactHashVerified: true,
    })
  }

  const activeRoot = getDfcLibreOfficeManagedRuntimeRoot(appRoot)
  const parent = path.dirname(activeRoot)
  const stagingRoot = path.join(parent, `.staging-${Date.now()}-${process.pid}`)
  const backupRoot = path.join(parent, `.previous-${Date.now()}-${process.pid}`)
  let cleanupStatus: 'attempted' | 'not_needed' | 'failed' = 'not_needed'
  let previousKnownGood: DfcLibreOfficePreviousKnownGoodRuntime | null = null
  let activeMovedToBackup = false

  try {
    await mkdir(parent, { recursive: true })
    await rm(stagingRoot, { recursive: true, force: true })
    await cp(sourceRoot, stagingRoot, { recursive: true, force: false, errorOnExist: true })
    if (await containsSymlink(stagingRoot)) {
      cleanupStatus = await cleanup(stagingRoot)
      return failed('office_pdf_install_path_rejected', 'Office PDF managed package staging contains unsafe links.', cleanupStatus)
    }
    const stagedAvailability = await resolveDfcLibreOfficeRuntimeExecutionDescriptor({
      managedRuntimeRootDir: stagingRoot,
      platform: input.platform,
      arch: input.arch,
    })
    if (!stagedAvailability.ok) {
      cleanupStatus = await cleanup(stagingRoot)
      return failed('office_pdf_install_runtime_unavailable', 'Office PDF staged runtime is unavailable.', cleanupStatus)
    }

    const existing = await resolveDfcLibreOfficeRuntimeExecutionDescriptor({
      managedRuntimeRootDir: activeRoot,
      platform: input.platform,
      arch: input.arch,
    })
    if (existing.ok) {
      await rm(backupRoot, { recursive: true, force: true })
      await rename(activeRoot, backupRoot)
      activeMovedToBackup = true
      previousKnownGood = {
        managedRuntimeRootDir: backupRoot,
        packageVersion: existing.runtime.packageVersion,
        libreOfficeVersion: existing.runtime.libreOfficeVersion,
        revoked: false,
      }
    } else {
      await rm(activeRoot, { recursive: true, force: true })
    }

    await rename(stagingRoot, activeRoot)
    const activeAvailability = await resolveDfcLibreOfficeRuntimeExecutionDescriptor({
      managedRuntimeRootDir: activeRoot,
      platform: input.platform,
      arch: input.arch,
    })
    if (!activeAvailability.ok) {
      if (activeMovedToBackup) {
        await rm(activeRoot, { recursive: true, force: true })
        await rename(backupRoot, activeRoot)
      }
      cleanupStatus = await cleanup(stagingRoot)
      return failed('office_pdf_install_activation_failed', 'Office PDF managed package activation failed.', cleanupStatus)
    }

    return {
      ok: true,
      activeRuntimeRootDir: activeRoot,
      runtime: activeAvailability.runtime,
      previousKnownGood,
      pluginManagement: toPluginImportContract(activeAvailability.summary, true),
      cleanupStatus,
      diagnostics: [],
    }
  } catch {
    if (activeMovedToBackup && !await directoryExists(activeRoot) && await directoryExists(backupRoot)) {
      await rename(backupRoot, activeRoot).catch(() => undefined)
    }
    cleanupStatus = await cleanup(stagingRoot)
    return failed('office_pdf_install_activation_failed', 'Office PDF managed package activation failed.', cleanupStatus)
  }
}

export async function rollbackDfcLibreOfficeManagedRuntimePackage(
  input: DfcLibreOfficeManagedPackageRollbackInput
): Promise<DfcLibreOfficeManagedPackageRollbackResult> {
  const appRoot = normalizeAbsoluteDir(input.appManagedRootDir)
  const previous = input.previousKnownGood
  if (!appRoot || !previous) {
    return rollbackFailed('office_pdf_rollback_target_missing', 'Office PDF rollback target is missing.', 'not_needed')
  }
  if (previous.revoked) {
    return rollbackFailed('office_pdf_rollback_target_revoked', 'Office PDF rollback target is revoked.', 'not_needed')
  }
  if (input.previousKnownGoodQuarantined === true) {
    return rollbackFailed('office_pdf_rollback_target_quarantined', 'Office PDF rollback target is quarantined.', 'not_needed')
  }
  const previousRoot = normalizeAbsoluteDir(previous.managedRuntimeRootDir)
  if (!previousRoot || !await directoryExists(previousRoot)) {
    return rollbackFailed('office_pdf_rollback_target_missing', 'Office PDF rollback target is missing.', 'not_needed')
  }
  if (await containsSymlink(previousRoot)) {
    return rollbackFailed('office_pdf_rollback_target_invalid', 'Office PDF rollback target is invalid.', 'not_needed')
  }
  const previousAvailability = await resolveDfcLibreOfficeRuntimeExecutionDescriptor({
    managedRuntimeRootDir: previousRoot,
    platform: input.platform,
    arch: input.arch,
  })
  if (!previousAvailability.ok) {
    return rollbackFailed('office_pdf_rollback_target_invalid', 'Office PDF rollback target is invalid.', 'not_needed')
  }

  const activeRoot = getDfcLibreOfficeManagedRuntimeRoot(appRoot)
  const parent = path.dirname(activeRoot)
  const stagingRoot = path.join(parent, `.rollback-${Date.now()}-${process.pid}`)
  try {
    await mkdir(parent, { recursive: true })
    await rm(stagingRoot, { recursive: true, force: true })
    await cp(previousRoot, stagingRoot, { recursive: true, force: false, errorOnExist: true })
    const stagedAvailability = await resolveDfcLibreOfficeRuntimeExecutionDescriptor({
      managedRuntimeRootDir: stagingRoot,
      platform: input.platform,
      arch: input.arch,
    })
    if (!stagedAvailability.ok) {
      const cleanupStatus = await cleanup(stagingRoot)
      return rollbackFailed('office_pdf_rollback_target_invalid', 'Office PDF rollback target is invalid.', cleanupStatus)
    }
    await rm(activeRoot, { recursive: true, force: true })
    await rename(stagingRoot, activeRoot)
    const activeAvailability = await resolveDfcLibreOfficeRuntimeExecutionDescriptor({
      managedRuntimeRootDir: activeRoot,
      platform: input.platform,
      arch: input.arch,
    })
    if (!activeAvailability.ok) {
      return rollbackFailed('office_pdf_rollback_activation_failed', 'Office PDF rollback activation failed.', 'attempted')
    }
    return {
      ok: true,
      activeRuntimeRootDir: activeRoot,
      runtime: activeAvailability.runtime,
      cleanupStatus: 'attempted',
      diagnostics: [],
    }
  } catch {
    const cleanupStatus = await cleanup(stagingRoot)
    return rollbackFailed('office_pdf_rollback_activation_failed', 'Office PDF rollback activation failed.', cleanupStatus)
  }
}

export async function updateDfcLibreOfficeManagedRuntimePackage(
  input: DfcLibreOfficeManagedPackageUpdateInput
): Promise<DfcLibreOfficeManagedPackageLifecycleOperationResult> {
  const appRoot = normalizeAbsoluteDir(input.appManagedRootDir)
  const targetRoot = normalizeAbsoluteDir(input.targetRuntimeRootDir)
  if (!appRoot || !targetRoot || !await directoryExists(targetRoot)) {
    return lifecycleFailed('update', 'office_pdf_update_target_missing', 'Office PDF update target is missing.', appRoot)
  }
  if (input.targetQuarantined === true || input.currentState?.quarantine?.quarantined === true) {
    return lifecycleFailed('update', 'office_pdf_update_target_quarantined', 'Office PDF update target is quarantined.', appRoot, {
      quarantine: input.currentState?.quarantine ?? createQuarantineState('Office PDF update target is quarantined.', null),
    })
  }

  const install = await importDfcLibreOfficeManagedRuntimePackage({
    appManagedRootDir: appRoot,
    sourceRuntimeRootDir: targetRoot,
    expectedArtifactSha256: input.expectedArtifactSha256,
    platform: input.platform,
    arch: input.arch,
  })
  if (!install.ok) {
    return lifecycleFailed('update', 'office_pdf_update_target_invalid', 'Office PDF update target failed verification.', appRoot)
  }

  const lifecycleState: DfcLibreOfficeManagedPackageLifecycleState = {
    activeRuntimeRootDir: install.activeRuntimeRootDir,
    previousKnownGood: install.previousKnownGood,
    quarantine: null,
  }
  return {
    ok: true,
    operation: 'update',
    activeRuntimeRootDir: install.activeRuntimeRootDir,
    runtime: install.runtime,
    previousKnownGood: install.previousKnownGood,
    lifecycleState,
    repairStatus: null,
    pluginManagement: install.pluginManagement,
    diagnostics: [],
  }
}

export async function quarantineDfcLibreOfficeManagedRuntimePackage(
  input: DfcLibreOfficeManagedPackageQuarantineInput
): Promise<DfcLibreOfficeManagedPackageLifecycleOperationResult> {
  const appRoot = normalizeAbsoluteDir(input.appManagedRootDir)
  const activeRoot = appRoot ? getDfcLibreOfficeManagedRuntimeRoot(appRoot) : null
  const activeAvailability = activeRoot
    ? await resolveDfcLibreOfficeRuntimeExecutionDescriptor({
        managedRuntimeRootDir: activeRoot,
        platform: input.platform,
        arch: input.arch,
      })
    : null
  const quarantine = createQuarantineState(input.reason, input.actor ?? null, input.now)
  const summary = createDfcLibreOfficeQuarantinedAvailabilitySummary({
    message: quarantine.reason,
    runtime: activeAvailability?.ok ? activeAvailability.summary.runtime : null,
  })
  const lifecycleState: DfcLibreOfficeManagedPackageLifecycleState = {
    activeRuntimeRootDir: activeRoot,
    previousKnownGood: null,
    quarantine,
  }
  const verified = activeAvailability?.ok ?? false
  return {
    ok: true,
    operation: 'quarantine',
    activeRuntimeRootDir: activeRoot,
    runtime: null,
    previousKnownGood: null,
    lifecycleState,
    repairStatus: null,
    pluginManagement: toPluginImportContract(summary, {
      manifestValidated: verified,
      artifactHashVerified: verified,
      executableHashVerified: verified,
      packageMetadataVerified: verified,
      securityPolicyVerified: verified,
    }),
    diagnostics: [diagnostic('office_pdf_quarantine_applied', quarantine.reason)],
  }
}

export async function repairDfcLibreOfficeManagedRuntimePackage(
  input: DfcLibreOfficeManagedPackageRepairInput
): Promise<DfcLibreOfficeManagedPackageLifecycleOperationResult> {
  const appRoot = normalizeAbsoluteDir(input.appManagedRootDir)
  const activeRoot = appRoot ? getDfcLibreOfficeManagedRuntimeRoot(appRoot) : null
  if (!appRoot || !activeRoot) {
    return lifecycleFailed('repair', 'office_pdf_repair_missing_runtime', 'Office PDF runtime is missing.', null, {
      repairStatus: 'missing_runtime',
    })
  }

  const availability = await resolveDfcLibreOfficeRuntimeExecutionDescriptor({
    managedRuntimeRootDir: activeRoot,
    platform: input.platform,
    arch: input.arch,
  })
  if (!availability.ok) {
    const missing = availability.summary.healthStatus === 'missing'
    return lifecycleFailed(
      'repair',
      missing ? 'office_pdf_repair_missing_runtime' : 'office_pdf_repair_verification_failed',
      'Office PDF runtime repair verification failed.',
      appRoot,
      {
        repairStatus: missing ? 'missing_runtime' : 'verification_failed',
        summary: availability.summary,
      }
    )
  }

  if (input.quarantine?.quarantined === true && input.allowUnquarantine !== true) {
    const summary = createDfcLibreOfficeQuarantinedAvailabilitySummary({
      message: 'Office PDF runtime repair verified the package but quarantine remains active.',
      runtime: availability.summary.runtime,
    })
    const lifecycleState: DfcLibreOfficeManagedPackageLifecycleState = {
      activeRuntimeRootDir: activeRoot,
      previousKnownGood: null,
      quarantine: input.quarantine,
    }
    return {
      ok: true,
      operation: 'repair',
      activeRuntimeRootDir: activeRoot,
      runtime: availability.runtime,
      previousKnownGood: null,
      lifecycleState,
      repairStatus: 'quarantine_retained',
      pluginManagement: toPluginImportContract(summary, true),
      diagnostics: [
        diagnostic(
          'office_pdf_repair_quarantine_retained',
          'Office PDF runtime repair verified the package but quarantine remains active.'
        ),
      ],
    }
  }

  const lifecycleState: DfcLibreOfficeManagedPackageLifecycleState = {
    activeRuntimeRootDir: activeRoot,
    previousKnownGood: null,
    quarantine: null,
  }
  return {
    ok: true,
    operation: 'repair',
    activeRuntimeRootDir: activeRoot,
    runtime: availability.runtime,
    previousKnownGood: null,
    lifecycleState,
    repairStatus: 'repaired',
    pluginManagement: toPluginImportContract(availability.summary, true),
    diagnostics: [diagnostic('office_pdf_repair_verified', 'Office PDF runtime package verification succeeded.')],
  }
}

async function readInstallManifest(root: string): Promise<Readonly<{ ok: true; artifactSha256: string | null } | { ok: false }>> {
  try {
    const text = await readFile(path.join(root, DFC_OFFICE_PDF_RUNTIME_MANIFEST), 'utf8')
    const parsed = JSON.parse(text) as { artifactSha256?: unknown }
    const artifactSha256 = typeof parsed.artifactSha256 === 'string' && FULL_SHA256_RE.test(parsed.artifactSha256)
      ? parsed.artifactSha256.toLowerCase()
      : null
    return { ok: true, artifactSha256 }
  } catch {
    return { ok: false }
  }
}

async function containsSymlink(root: string): Promise<boolean> {
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) continue
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      const link = await lstat(full).catch(() => null)
      if (!link) return true
      if (link.isSymbolicLink()) return true
      if (link.isDirectory()) pending.push(full)
    }
  }
  return false
}

async function directoryExists(target: string): Promise<boolean> {
  const entry = await lstat(target).catch(() => null)
  return !!entry?.isDirectory()
}

async function cleanup(target: string): Promise<'attempted' | 'failed'> {
  try {
    await rm(target, { recursive: true, force: true })
    return 'attempted'
  } catch {
    return 'failed'
  }
}

function normalizeAbsoluteDir(value: string): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized || NUL_RE.test(normalized)) return null
  return path.resolve(normalized)
}

function isExpectedArtifactHash(actual: string | null, expected: string): boolean {
  const normalizedExpected = expected.trim().toLowerCase()
  return FULL_SHA256_RE.test(normalizedExpected) && actual === normalizedExpected
}

function failed(
  code: DfcLibreOfficeManagedPackageInstallDiagnosticCode,
  message: string,
  cleanupStatus: 'attempted' | 'not_needed' | 'failed',
  verification?: Partial<Omit<DfcLibreOfficeManagedPackageVerificationFlags, 'layoutContract'>>
): DfcLibreOfficeManagedPackageInstallResult {
  return {
    ok: false,
    activeRuntimeRootDir: null,
    runtime: null,
    previousKnownGood: null,
    pluginManagement: toPluginImportContract(failedSummary(code, message), {
      manifestValidated: verification?.manifestValidated ?? false,
      artifactHashVerified: verification?.artifactHashVerified ?? false,
      executableHashVerified: verification?.executableHashVerified ?? false,
      packageMetadataVerified: verification?.packageMetadataVerified ?? false,
      securityPolicyVerified: verification?.securityPolicyVerified ?? false,
    }),
    cleanupStatus,
    diagnostics: [diagnostic(code, message)],
  }
}

function rollbackFailed(
  code: DfcLibreOfficeManagedPackageRollbackDiagnosticCode,
  message: string,
  cleanupStatus: 'attempted' | 'not_needed' | 'failed'
): DfcLibreOfficeManagedPackageRollbackResult {
  return {
    ok: false,
    activeRuntimeRootDir: null,
    runtime: null,
    cleanupStatus,
    diagnostics: [diagnostic(code, message)],
  }
}

function lifecycleFailed(
  operation: DfcLibreOfficeManagedPackageLifecycleOperation,
  code: DfcLibreOfficeManagedPackageLifecycleDiagnosticCode,
  message: string,
  appRoot: string | null,
  options?: Readonly<{
    quarantine?: DfcLibreOfficeManagedPackageQuarantineState | null
    repairStatus?: DfcLibreOfficeManagedPackageRepairStatus | null
    summary?: DfcOfficePdfRuntimeAvailabilitySummary | null
  }>
): DfcLibreOfficeManagedPackageLifecycleOperationResult {
  const activeRuntimeRootDir = appRoot ? getDfcLibreOfficeManagedRuntimeRoot(appRoot) : null
  const summary = options?.summary ?? lifecycleFailedSummary(code, message)
  const lifecycleState: DfcLibreOfficeManagedPackageLifecycleState = {
    activeRuntimeRootDir,
    previousKnownGood: null,
    quarantine: options?.quarantine ?? null,
  }
  return {
    ok: false,
    operation,
    activeRuntimeRootDir: null,
    runtime: null,
    previousKnownGood: null,
    lifecycleState,
    repairStatus: options?.repairStatus ?? null,
    pluginManagement: toPluginImportContract(summary, false),
    diagnostics: [diagnostic(code, message)],
  }
}

function diagnostic(
  code:
    | DfcLibreOfficeManagedPackageInstallDiagnosticCode
    | DfcLibreOfficeManagedPackageRollbackDiagnosticCode
    | DfcLibreOfficeManagedPackageLifecycleDiagnosticCode,
  message: string
): DfcLibreOfficeManagedPackageDiagnostic {
  return {
    code,
    message: sanitizePluginDistributionText(message) ?? 'Office PDF managed package operation failed.',
  }
}

export function sha256ForDfcLibreOfficeManagedPackageInstaller(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function toPluginImportContract(
  summary: DfcOfficePdfRuntimeAvailabilitySummary,
  verification: boolean | Omit<DfcLibreOfficeManagedPackageVerificationFlags, 'layoutContract'>
): DfcLibreOfficeManagedPackagePluginImportContract {
  const importSummary: DfcOfficePdfRuntimeAvailabilitySummary = summary.status === 'experimental' || summary.status === 'available'
    ? {
        ...summary,
        source: summary.source === 'fake_seam' ? 'fake_seam' : 'imported_dev_artifact',
      }
    : summary
  return {
    operation: 'import',
    installKind: 'imported_dev_artifact',
    productionApproved: false,
    activeRuntimeRef: 'managed_runtime_root',
    bridge: toDfcLibreOfficePluginLifecycleBridge(importSummary),
    verification: {
      layoutContract: getDfcLibreOfficeRuntimePackageLayoutContract(),
      ...normalizeVerificationFlags(verification),
    },
  }
}

function createQuarantineState(
  reason: string,
  actor: string | null,
  now?: Date | string | null
): DfcLibreOfficeManagedPackageQuarantineState {
  const timestamp = now instanceof Date
    ? now.toISOString()
    : typeof now === 'string' && now.trim()
      ? now.trim()
      : new Date().toISOString()
  return {
    quarantined: true,
    reason: sanitizePluginDistributionText(reason) ?? 'Office PDF managed runtime is quarantined.',
    productCode: 'conversion_sandbox_denied',
    internalCode: 'office_pdf_runtime_quarantined',
    quarantinedAt: timestamp,
    actor: sanitizePluginDistributionText(actor ?? '') ?? null,
  }
}

function normalizeVerificationFlags(
  verification: boolean | Omit<DfcLibreOfficeManagedPackageVerificationFlags, 'layoutContract'>
): Omit<DfcLibreOfficeManagedPackageVerificationFlags, 'layoutContract'> {
  if (typeof verification !== 'boolean') return verification
  return {
    manifestValidated: verification,
    artifactHashVerified: verification,
    executableHashVerified: verification,
    packageMetadataVerified: verification,
    securityPolicyVerified: verification,
  }
}

function failedSummary(
  code: DfcLibreOfficeManagedPackageInstallDiagnosticCode,
  message: string
): DfcOfficePdfRuntimeAvailabilitySummary {
  return {
    status: code === 'office_pdf_install_revoked' || code === 'office_pdf_install_path_rejected'
      ? 'blocked'
      : 'unavailable',
    healthStatus: code === 'office_pdf_install_source_missing' ? 'missing' : 'unhealthy',
    productCode: code === 'office_pdf_install_source_missing'
      ? 'conversion_engine_missing'
      : code === 'office_pdf_install_path_rejected' || code === 'office_pdf_install_revoked'
        ? 'conversion_sandbox_denied'
        : 'conversion_engine_unhealthy',
    internalCode: code === 'office_pdf_install_source_missing'
      ? 'office_pdf_runtime_missing'
      : code === 'office_pdf_install_path_rejected'
        ? 'office_pdf_runtime_path_rejected'
        : 'office_pdf_runtime_manifest_invalid',
    message: sanitizePluginDistributionText(message) ?? 'Office PDF managed package import failed.',
    retryable: code === 'office_pdf_install_source_missing',
    recoverable: code !== 'office_pdf_install_revoked',
    source: code === 'office_pdf_install_source_missing' ? 'missing_manifest' : 'managed_manifest',
    runtime: null,
  }
}

function lifecycleFailedSummary(
  code: DfcLibreOfficeManagedPackageLifecycleDiagnosticCode,
  message: string
): DfcOfficePdfRuntimeAvailabilitySummary {
  if (code === 'office_pdf_update_target_quarantined') {
    return createDfcLibreOfficeQuarantinedAvailabilitySummary({ message })
  }
  return {
    status: 'unavailable',
    healthStatus: code === 'office_pdf_update_target_missing' || code === 'office_pdf_repair_missing_runtime'
      ? 'missing'
      : 'unhealthy',
    productCode: code === 'office_pdf_update_target_missing' || code === 'office_pdf_repair_missing_runtime'
      ? 'conversion_engine_missing'
      : 'conversion_engine_unhealthy',
    internalCode: code === 'office_pdf_update_target_missing' || code === 'office_pdf_repair_missing_runtime'
      ? 'office_pdf_runtime_missing'
      : 'office_pdf_runtime_manifest_invalid',
    message: sanitizePluginDistributionText(message) ?? 'Office PDF lifecycle operation failed.',
    retryable: code === 'office_pdf_update_target_missing' || code === 'office_pdf_repair_missing_runtime',
    recoverable: true,
    source: code === 'office_pdf_update_target_missing' || code === 'office_pdf_repair_missing_runtime'
      ? 'missing_manifest'
      : 'managed_manifest',
    runtime: null,
  }
}
