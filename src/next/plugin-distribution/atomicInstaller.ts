import { sanitizePluginDistributionText } from './sanitization'
import { containsUnsafeRefSyntax, type PluginInstallPlan } from './installPlan'
import {
  patchPdpRegistryRecord,
  type PdpPluginRegistryRecord,
} from './registryModel'

export type ControlledRootResolution = Readonly<{
  rootRef: string
  rootKind: PluginInstallPlan['controlledRootKind']
}>

export type AtomicInstallState = 'staged' | 'installing' | 'installed' | 'failed'

export type AtomicInstallInput = Readonly<{
  plan: PluginInstallPlan
  controlledRoot: ControlledRootResolution
  existingRecord?: PdpPluginRegistryRecord | null
  simulateFinalizeFailure?: boolean
  stagingOwned?: boolean
}>

export type AtomicInstallResult =
  | Readonly<{
      ok: true
      state: 'installed'
      record: PdpPluginRegistryRecord
      cleanupRefs: readonly string[]
      diagnostics: readonly AtomicInstallDiagnostic[]
    }>
  | Readonly<{
      ok: false
      state: 'failed'
      failureReason: AtomicInstallFailureReason
      record: PdpPluginRegistryRecord | null
      previousRecord: PdpPluginRegistryRecord | null
      cleanupRefs: readonly string[]
      diagnostics: readonly AtomicInstallDiagnostic[]
    }>

export type AtomicInstallFailureReason =
  | 'install_root_unsafe'
  | 'package_path_unsafe'
  | 'package_unverified'
  | 'registry_identity_mismatch'
  | 'install_interrupted'
  | 'unknown'

export type AtomicInstallDiagnostic = Readonly<{
  code: AtomicInstallFailureReason
  field: string
  detail?: string
}>

export function finalizeAtomicInstallPlan(input: AtomicInstallInput): AtomicInstallResult {
  const previousRecord = input.existingRecord ?? null
  const rootValidation = validateControlledRoot(input.controlledRoot, input.plan)
  if (!rootValidation.ok) {
    return fail(input, 'install_root_unsafe', 'controlledRoot', rootValidation.detail)
  }
  const proofValidation = validateVerificationProof(input.plan)
  if (!proofValidation.ok) {
    return fail(input, 'package_unverified', 'plan.verificationProof', proofValidation.detail)
  }
  const existingRecordValidation = validateExistingRecord(input.existingRecord ?? null, input.plan)
  if (!existingRecordValidation.ok) {
    return fail(input, 'registry_identity_mismatch', 'existingRecord', existingRecordValidation.detail)
  }
  if (containsUnsafeRefSyntax(input.plan.stagingRef) || containsUnsafeRefSyntax(input.plan.finalInstallRef)) {
    return fail(input, 'package_path_unsafe', 'plan', 'install plan refs must not contain path syntax')
  }
  if (input.simulateFinalizeFailure) {
    return fail(input, 'install_interrupted', 'finalize', 'atomic install finalization failed')
  }

  const record = patchPdpRegistryRecord(
    previousRecord ?? createRecordFromPlan(input.plan),
    {
      pluginId: input.plan.pluginId,
      pluginVersion: input.plan.pluginVersion,
      runtimeKind: input.plan.runtimeKind,
      controlledRootKind: input.plan.controlledRootKind,
      installRef: input.plan.finalInstallRef,
      packageRef: input.plan.stagingRef,
      registryState: 'verified',
      installState: 'installed',
      verificationStatus: 'verified',
      enabled: false,
      healthStatus: 'unknown',
      failureReason: null,
    }
  )

  return {
    ok: true,
    state: 'installed',
    record,
    cleanupRefs: input.stagingOwned === false ? [] : [input.plan.stagingRef],
    diagnostics: [],
  }
}

function createRecordFromPlan(plan: PluginInstallPlan): PdpPluginRegistryRecord {
  return {
    pluginId: plan.pluginId,
    pluginVersion: plan.pluginVersion,
    runtimeKind: plan.runtimeKind,
    controlledRootKind: plan.controlledRootKind,
    installSource: 'manual_local',
    installRef: plan.finalInstallRef,
    packageRef: plan.stagingRef,
    registryState: 'verified',
    installState: 'installed',
    verificationStatus: 'verified',
    enabled: false,
    healthStatus: 'unknown',
    failureReason: null,
    diagnostics: [],
  }
}

function validateControlledRoot(
  root: ControlledRootResolution,
  plan: PluginInstallPlan
): Readonly<{ ok: true } | { ok: false; detail: string }> {
  if (root.rootKind !== plan.controlledRootKind) {
    return { ok: false, detail: 'controlled root kind must match install plan' }
  }
  if (containsUnsafeRefSyntax(root.rootRef)) {
    return { ok: false, detail: 'controlled root ref must be abstract and non-path-like' }
  }
  return { ok: true }
}

function validateVerificationProof(
  plan: PluginInstallPlan
): Readonly<{ ok: true } | { ok: false; detail: string }> {
  const proof = plan.verificationProof
  if (
    proof?.status !== 'cryptographic_ed25519_verified' ||
    !isSafeOpaqueProofValue(proof.verifiedKeyId) ||
    !isSafeOpaqueProofValue(proof.trustRootId)
  ) {
    return { ok: false, detail: 'install plan must carry cryptographic verification proof' }
  }
  return { ok: true }
}

function isSafeOpaqueProofValue(value: string): boolean {
  return Boolean(value.trim()) && !value.includes('\u0000') && !/^[A-Za-z]:[\\/]/u.test(value) && !/^\\\\/u.test(value)
}

function validateExistingRecord(
  record: PdpPluginRegistryRecord | null,
  plan: PluginInstallPlan
): Readonly<{ ok: true } | { ok: false; detail: string }> {
  if (!record) return { ok: true }
  if (
    record.pluginId !== plan.pluginId ||
    record.runtimeKind !== plan.runtimeKind ||
    record.controlledRootKind !== plan.controlledRootKind
  ) {
    return { ok: false, detail: 'existing registry record must match install plan identity and root' }
  }
  return { ok: true }
}

function fail(
  input: AtomicInstallInput,
  failureReason: AtomicInstallFailureReason,
  field: string,
  detail: string
): AtomicInstallResult {
  const cleanupRefs =
    input.stagingOwned === false || containsUnsafeRefSyntax(input.plan.stagingRef)
      ? []
      : [input.plan.stagingRef]
  return {
    ok: false,
    state: 'failed',
    failureReason,
    record: input.existingRecord ?? null,
    previousRecord: input.existingRecord ?? null,
    cleanupRefs,
    diagnostics: [
      {
        code: failureReason,
        field,
        detail: sanitizePluginDistributionText(detail),
      },
    ],
  }
}
