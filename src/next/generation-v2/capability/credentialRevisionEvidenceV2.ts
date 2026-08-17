import { sha256PreparedBytesV2, stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import type { PersistedRuntimeCapabilityEvidenceV2 } from './runtimeCapabilitySnapshotV2'

/**
 * Credential rotation is a capability-scope input, not a model capability
 * fact. Keep it as neutral provenance so it participates in the base
 * capability revision without advertising or rejecting a semantic field.
 */
export const CREDENTIAL_REVISION_EVIDENCE_ID_V2 = 'starverse.credential-scope-revision.v2'

export function credentialRevisionEvidenceV2(input: Readonly<{
  credentialRevision: number
  verifiedAt: string
}>): Omit<PersistedRuntimeCapabilityEvidenceV2, 'entryDigest'> {
  if (!Number.isSafeInteger(input.credentialRevision) || input.credentialRevision < 0 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input.verifiedAt) ||
      !Number.isFinite(Date.parse(input.verifiedAt)) || new Date(input.verifiedAt).toISOString() !== input.verifiedAt) {
    throw new Error('GENERATION_V2_CREDENTIAL_REVISION_EVIDENCE_INVALID')
  }
  const contentDigest = sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2({
    kind: 'credential_scope_revision', revision: input.credentialRevision,
  })))
  return Object.freeze({
    evidenceId: CREDENTIAL_REVISION_EVIDENCE_ID_V2,
    kind: 'contract_invariant',
    effect: 'unknown',
    sourceRef: 'starverse://generation-v2/credential-scope-revision',
    verifiedAt: input.verifiedAt,
    contentDigest,
  })
}
