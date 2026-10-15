import { canonicalSourceFactDigestV1 } from './canonicalSourceFactsV1'

const BOUNDED = 1024

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > BOUNDED || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('GENERATION_V2_CANONICAL_SOURCE_SCOPE_INVALID')
  }
  return value
}

export function buildProviderNativeSourceScopeIdV1(input: Readonly<{
  providerAuthorityId: string
  providerNativeSurfaceId: string
  endpointProfileId: string
  credentialScopeId: string
  credentialRevision: number
  catalogCategory?: string
}>): string {
  if (!Number.isSafeInteger(input.credentialRevision) || input.credentialRevision < 0) {
    throw new Error('GENERATION_V2_CANONICAL_SOURCE_SCOPE_INVALID')
  }
  const projection = Object.freeze({ sourceKind: 'provider_native' as const,
    providerAuthorityId: text(input.providerAuthorityId),
    providerNativeSurfaceId: text(input.providerNativeSurfaceId),
    endpointProfileId: text(input.endpointProfileId), credentialScopeId: text(input.credentialScopeId),
    credentialRevision: input.credentialRevision, catalogCategory: input.catalogCategory === undefined
      ? '' : text(input.catalogCategory) })
  return `canonical-source-scope-v1:${canonicalSourceFactDigestV1(projection)}`
}

export function buildModelsDevSourceScopeIdV1(input: Readonly<{
  distributionId: string
  distributionChannel?: string
}>): string {
  return `canonical-source-scope-v1:${canonicalSourceFactDigestV1({ sourceKind: 'models_dev',
    distributionId: text(input.distributionId), distributionChannel: input.distributionChannel === undefined
      ? '' : text(input.distributionChannel) })}`
}

export function buildCapabilityRuleSourceScopeIdV1(input: Readonly<{
  ruleStoreId: string
}>): string {
  return `canonical-source-scope-v1:${canonicalSourceFactDigestV1({ sourceKind: 'capability_rule',
    ruleStoreId: text(input.ruleStoreId) })}`
}
