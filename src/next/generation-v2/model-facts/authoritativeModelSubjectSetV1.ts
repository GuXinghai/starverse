import {
  canonicalizeCanonicalModelSubjectV1,
  canonicalSourceFactDigestV1,
  type CanonicalModelSubjectV1,
} from './canonicalSourceFactsV1'
import { PROVIDER_AUTHORITY_REGISTRY_REVISION_V1 } from './providerAuthorityRegistryV1'
import { stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'

export const AUTHORITATIVE_MODEL_SUBJECT_SET_SCHEMA_VERSION_V1 = 1 as const
export const AUTHORITATIVE_MODEL_SUBJECT_SET_BUILDER_REVISION_V1 =
  'authoritative-model-subject-set-builder-v1:20260921-2' as const

export type AuthoritativeModelSubjectProofV1 =
  | Readonly<{
    kind: 'provider_native_catalog'
    providerKey: string
    scopeId: string
    credentialScopeId: string
    credentialRevision: number
    endpointProfileId: string
    operationContractId: string
    catalogCategory: string
    activeSnapshotDigest: string
  }>
  | Readonly<{
    kind: 'compatible_model_binding'
    providerInstanceId: string
    endpointRevisionId: string
    endpointDigest: string
    source: 'manual'
  }>
  | Readonly<{
    kind: 'compatible_model_binding'
    providerInstanceId: string
    endpointRevisionId: string
    endpointDigest: string
    source: 'remote_sync'
    credentialScopeId: string
    credentialRevision: number
    acquisitionSnapshotDigest: string
  }>
  | Readonly<{
    kind: 'local_profile_binding'
    endpointProfileId: string
    providerId: 'lmstudio' | 'ollama' | 'generic_local'
    protocolContractId: string
    profileRevision: string
  }>

export type AuthoritativeModelSubjectCandidateV1 = Readonly<{
  subject: CanonicalModelSubjectV1
  proof: AuthoritativeModelSubjectProofV1
}>

export type AuthoritativeModelSubjectRecordV1 = Readonly<{
  subject: CanonicalModelSubjectV1
  proofs: readonly AuthoritativeModelSubjectProofV1[]
}>

export type AuthoritativeModelSubjectSetV1 = Readonly<{
  schemaVersion: 1
  providerAuthorityRegistryRevision: string
  builderRevision: string
  subjectSetRevision: string
  authorityInputRevision: string
  records: readonly AuthoritativeModelSubjectRecordV1[]
}>

function subjectKey(subject: CanonicalModelSubjectV1): string {
  return stableSerializeProviderRequestV2(subject)
}

function proofKey(proof: AuthoritativeModelSubjectProofV1): string {
  return stableSerializeProviderRequestV2(proof)
}

function text(value: unknown, maximum = 1024): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
  }
  return value
}

function digest(value: unknown): string {
  const normalized = text(value, 64)
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
  }
  return normalized
}

function canonicalProof(value: AuthoritativeModelSubjectProofV1): AuthoritativeModelSubjectProofV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
  }
  if (value.kind === 'provider_native_catalog') {
    if (!Number.isSafeInteger(value.credentialRevision) || value.credentialRevision < 0) {
      throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
    }
    return Object.freeze({ kind: value.kind, providerKey: text(value.providerKey), scopeId: text(value.scopeId),
      credentialScopeId: text(value.credentialScopeId), credentialRevision: value.credentialRevision,
      endpointProfileId: text(value.endpointProfileId), operationContractId: text(value.operationContractId),
      catalogCategory: value.catalogCategory === '' ? '' : text(value.catalogCategory),
      activeSnapshotDigest: digest(value.activeSnapshotDigest) })
  }
  if (value.kind === 'compatible_model_binding') {
    if (value.source !== 'manual' && value.source !== 'remote_sync') {
      throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
    }
    const base = Object.freeze({ kind: value.kind, providerInstanceId: text(value.providerInstanceId),
      endpointRevisionId: text(value.endpointRevisionId), endpointDigest: digest(value.endpointDigest) })
    if (value.source === 'manual') return Object.freeze({ ...base, source: value.source })
    if (!Number.isSafeInteger(value.credentialRevision) || value.credentialRevision < 0) {
      throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
    }
    return Object.freeze({ ...base, source: value.source,
      credentialScopeId: text(value.credentialScopeId), credentialRevision: value.credentialRevision,
      acquisitionSnapshotDigest: digest(value.acquisitionSnapshotDigest) })
  }
  if (value.kind === 'local_profile_binding') {
    if (value.providerId !== 'lmstudio' && value.providerId !== 'ollama' && value.providerId !== 'generic_local') {
      throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
    }
    return Object.freeze({ kind: value.kind, endpointProfileId: text(value.endpointProfileId),
      providerId: value.providerId, protocolContractId: text(value.protocolContractId),
      profileRevision: text(value.profileRevision) })
  }
  throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
}

export function buildAuthoritativeModelSubjectSetV1(
  candidates: readonly AuthoritativeModelSubjectCandidateV1[],
): AuthoritativeModelSubjectSetV1 {
  if (!Array.isArray(candidates) || candidates.length > 100_000) {
    throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
  }
  const bySubject = new Map<string, { subject: CanonicalModelSubjectV1; proofs: Map<string, AuthoritativeModelSubjectProofV1> }>()
  for (const candidate of candidates) {
    const subject = canonicalizeCanonicalModelSubjectV1(candidate.subject)
    const key = subjectKey(subject)
    const current = bySubject.get(key) ?? { subject, proofs: new Map() }
    const proof = canonicalProof(candidate.proof)
    current.proofs.set(proofKey(proof), proof)
    bySubject.set(key, current)
  }
  const records = Object.freeze([...bySubject.values()]
    .map((entry) => Object.freeze({ subject: entry.subject,
      proofs: Object.freeze([...entry.proofs.values()].sort((left, right) =>
        proofKey(left).localeCompare(proofKey(right), 'en'))) }))
    .sort((left, right) => subjectKey(left.subject).localeCompare(subjectKey(right.subject), 'en')))
  const identityProjection = Object.freeze({
    schemaVersion: AUTHORITATIVE_MODEL_SUBJECT_SET_SCHEMA_VERSION_V1,
    providerAuthorityRegistryRevision: PROVIDER_AUTHORITY_REGISTRY_REVISION_V1,
    builderRevision: AUTHORITATIVE_MODEL_SUBJECT_SET_BUILDER_REVISION_V1,
    subjects: Object.freeze(records.map((record) => record.subject)),
  })
  return Object.freeze({
    schemaVersion: AUTHORITATIVE_MODEL_SUBJECT_SET_SCHEMA_VERSION_V1,
    providerAuthorityRegistryRevision: PROVIDER_AUTHORITY_REGISTRY_REVISION_V1,
    builderRevision: AUTHORITATIVE_MODEL_SUBJECT_SET_BUILDER_REVISION_V1,
    subjectSetRevision: `authoritative-model-subject-set-v1:${canonicalSourceFactDigestV1(identityProjection)}`,
    authorityInputRevision: `authoritative-model-subject-input-v1:${canonicalSourceFactDigestV1(Object.freeze({
      ...identityProjection, records,
    }))}`,
    records,
  })
}
