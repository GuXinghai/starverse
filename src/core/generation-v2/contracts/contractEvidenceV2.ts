export type ContractEvidenceStabilityV2 = 'stable' | 'beta' | 'preview'

export type ContractEvidenceV2 = Readonly<{
  contractId: string
  contractRevision: string
  verifiedAt: string
  reviewAfter: string
  stability: ContractEvidenceStabilityV2
  sources: readonly Readonly<{
    url: string
    retrievedAt: string
    digest: string
  }>[]
  deprecatedAt?: string
  retireAt?: string
  supersededBy?: string
}>

export type ModelRetirementEvidenceV2 = Readonly<{
  providerId: string
  modelId: string
  retiredAt: string
  sourceUrl: string
  sourceDigest: string
  reason: string
}>

export type DynamicCapabilityEvidenceV2 = Readonly<{
  evidenceId: string
  refreshAfter: string
  expiresAt: string | null
  hardExpireAt: string | null
}>

function date(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('CONTRACT_EVIDENCE_INVALID')
  return value
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) throw new Error('CONTRACT_EVIDENCE_INVALID')
  return value
}

export function validateContractEvidenceV2(value: unknown): ContractEvidenceV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CONTRACT_EVIDENCE_INVALID')
  const raw = value as Record<string, unknown>
  if (typeof raw.contractId !== 'string' || typeof raw.contractRevision !== 'string' ||
      !['stable', 'beta', 'preview'].includes(String(raw.stability)) || !Array.isArray(raw.sources)) {
    throw new Error('CONTRACT_EVIDENCE_INVALID')
  }
  const sources = raw.sources.map((source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('CONTRACT_EVIDENCE_INVALID')
    const item = source as Record<string, unknown>
    if (typeof item.url !== 'string' || !/^https:\/\//iu.test(item.url)) throw new Error('CONTRACT_EVIDENCE_INVALID')
    return Object.freeze({ url: item.url, retrievedAt: date(item.retrievedAt), digest: digest(item.digest) })
  })
  return Object.freeze({
    contractId: raw.contractId,
    contractRevision: raw.contractRevision,
    verifiedAt: date(raw.verifiedAt),
    reviewAfter: date(raw.reviewAfter),
    stability: raw.stability as ContractEvidenceStabilityV2,
    sources: Object.freeze(sources),
    ...(raw.deprecatedAt === undefined ? {} : { deprecatedAt: date(raw.deprecatedAt) }),
    ...(raw.retireAt === undefined ? {} : { retireAt: date(raw.retireAt) }),
    ...(raw.supersededBy === undefined ? {} : { supersededBy: String(raw.supersededBy) }),
  })
}

export function isContractReviewDueV2(evidence: ContractEvidenceV2, nowMs: number): boolean {
  return nowMs >= Date.parse(evidence.reviewAfter)
}

export function isDynamicCapabilityHardExpiredV2(evidence: DynamicCapabilityEvidenceV2, nowMs: number): boolean {
  return evidence.hardExpireAt !== null && nowMs >= Date.parse(evidence.hardExpireAt)
}

export function isModelRetiredV2(evidence: ModelRetirementEvidenceV2, nowMs: number): boolean {
  return nowMs >= Date.parse(evidence.retiredAt)
}
