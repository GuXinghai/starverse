import type { Epoch2WorkspaceLayout } from './rootManifest'
import { readAndVerifyEpoch2TransitionOwnershipManifest } from './rootManifestStore'
import {
  assertWin32EpochRootLeaseAuthority,
  cleanupWin32EpochTransitionTemps,
  deleteWin32EpochOwnedTarget,
  inspectWin32EpochOwnedTarget,
  type Epoch2OwnedTargetId,
  type Win32EpochRootLease,
  type Win32OwnedDeleteSummary,
} from './win32EpochRootLease'

export class Epoch2OwnedDeleteError extends Error {
  constructor(readonly code: 'EPOCH2_DELETE_OWNERSHIP_INVALID') {
    super(code)
    this.name = 'Epoch2OwnedDeleteError'
  }
}

function assertDeleteAuthority(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): void {
  try {
    assertWin32EpochRootLeaseAuthority(input.lease, input.layout)
    readAndVerifyEpoch2TransitionOwnershipManifest(input)
  } catch {
    throw new Epoch2OwnedDeleteError('EPOCH2_DELETE_OWNERSHIP_INVALID')
  }
}

export function inspectEpoch2OwnedTarget(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  targetId: Epoch2OwnedTargetId
}>): Win32OwnedDeleteSummary {
  assertDeleteAuthority(input)
  return inspectWin32EpochOwnedTarget(input.lease, input.targetId)
}

export function deleteEpoch2OwnedTarget(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  targetId: Epoch2OwnedTargetId
}>): Win32OwnedDeleteSummary {
  assertDeleteAuthority(input)
  return deleteWin32EpochOwnedTarget(input.lease, input.targetId)
}

export function cleanupEpoch2TransitionTemps(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
}>): number {
  assertWin32EpochRootLeaseAuthority(input.lease, input.layout)
  return cleanupWin32EpochTransitionTemps(input.lease)
}
