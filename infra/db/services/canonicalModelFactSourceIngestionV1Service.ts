import type BetterSqlite3 from 'better-sqlite3'
import {
  CanonicalModelFactSourceV1Repo,
  type CanonicalModelFactSourcePublicationResultV1,
} from '../repo/canonicalModelFactSourceV1Repo'
import {
  createProviderNativeSourceAdapterV1,
  type ProviderNativeSurfaceIdV1,
} from '../../../src/next/generation-v2/model-facts/providerNativeSourceAdapterV1'
import { createModelsDevSourceAdapterV1 } from
  '../../../src/next/generation-v2/model-facts/modelsDevSourceAdapterV1'
import {
  PROVIDER_AUTHORITY_REGISTRY_REVISION_V1,
  providerAuthorityForNativeSurfaceV1,
} from '../../../src/next/generation-v2/model-facts/providerAuthorityRegistryV1'
import {
  buildRawSourceSnapshotRefV1,
  sanitizeRawSourcePayloadV1,
  type SanitizedRawPayloadV1,
} from '../../../src/next/generation-v2/model-facts/rawSourceSnapshotV1'
import {
  buildEnumerableSourcePublicationV1,
} from '../../../src/next/generation-v2/model-facts/sourceSnapshotBuilderV1'
import {
  buildModelsDevSourceScopeIdV1,
  buildProviderNativeSourceScopeIdV1,
} from '../../../src/next/generation-v2/model-facts/sourceScopeV1'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'

export type CanonicalRawEnvelopeInputV1 = Readonly<{
  recordKey: string
  payload: unknown
  networkPayloadSha256?: string
}>

export type CanonicalProviderNativeSurfaceIdV1 = ProviderNativeSurfaceIdV1

export function canonicalModelsDevSourceScopeIdV1(input: Readonly<{
  distributionId: string
  distributionChannel: string
}>): string {
  return buildModelsDevSourceScopeIdV1(input)
}

export function canonicalProviderNativeSourceScopeIdV1(input: Parameters<
  typeof buildProviderNativeSourceScopeIdV1
>[0]): string {
  return buildProviderNativeSourceScopeIdV1(input)
}

export function assertProviderNativeAuthorityBindingV1(input: Readonly<{
  surfaceId: CanonicalProviderNativeSurfaceIdV1
  implementationProviderId: string
  endpointProfileId: string
}>): CanonicalProviderNativeSurfaceIdV1 {
  const authority = providerAuthorityForNativeSurfaceV1(input.surfaceId)
  if (!authority.executionBindings.some((binding) =>
    binding.implementationProviderId === input.implementationProviderId &&
    binding.endpointProfileKind === input.endpointProfileId)) {
    throw new Error('GENERATION_V2_PROVIDER_NATIVE_AUTHORITY_BINDING_INVALID')
  }
  return input.surfaceId
}

function sanitizeAll(inputs: readonly CanonicalRawEnvelopeInputV1[]): readonly SanitizedRawPayloadV1[] {
  if (inputs.length < 1 || inputs.length > 64) {
    throw new Error('GENERATION_V2_CANONICAL_SOURCE_INGESTION_INVALID')
  }
  return Object.freeze(inputs.map((input) => sanitizeRawSourcePayloadV1(input)))
}

function hasInvalidField(publication: ReturnType<typeof buildEnumerableSourcePublicationV1>): boolean {
  return publication.subjectFacts.some((fact) => fact.payload.outcomes.some((outcome) =>
    outcome.currentObservation.kind === 'invalid'))
}

export class CanonicalModelFactSourceIngestionV1Service {
  readonly sourceRepo: CanonicalModelFactSourceV1Repo

  constructor(db: BetterSqlite3.Database, nowMs: () => number = Date.now) {
    this.sourceRepo = new CanonicalModelFactSourceV1Repo(db, nowMs)
  }

  publishProviderNative(input: Readonly<{
    surfaceId: ProviderNativeSurfaceIdV1
    endpointProfileId: string
    credentialScopeId: string
    credentialRevision: number
    catalogCategory?: string
    rawEnvelopes: readonly CanonicalRawEnvelopeInputV1[]
    recordSetCompleteness: 'complete' | 'partial' | 'unknown'
    expectedCurrentRevision: string | null
    fetchedAtMs: number
    lastAttemptedAtMs?: number
  }>): CanonicalModelFactSourcePublicationResultV1 {
    const authority = providerAuthorityForNativeSurfaceV1(input.surfaceId)
    const sourceScopeId = buildProviderNativeSourceScopeIdV1({
      providerAuthorityId: authority.providerAuthorityId, providerNativeSurfaceId: input.surfaceId,
      endpointProfileId: input.endpointProfileId, credentialScopeId: input.credentialScopeId,
      credentialRevision: input.credentialRevision,
      ...(input.catalogCategory === undefined ? {} : { catalogCategory: input.catalogCategory }),
    })
    const rawPayloads = sanitizeAll(input.rawEnvelopes)
    const rawSnapshot = buildRawSourceSnapshotRefV1({ sourceKind: 'provider_native', sourceScopeId,
      recordSetCompleteness: input.recordSetCompleteness, rawEnvelopeRefs: rawPayloads.map((entry) => entry.ref) })
    const adapter = createProviderNativeSourceAdapterV1({ sourceSurfaceId: input.surfaceId,
      endpointProfileId: input.endpointProfileId, rawPayloadReader: {
        readRawPayload: (ref) => rawPayloads.find((entry) => entry.ref.storeId === ref.storeId &&
          entry.ref.recordKey === ref.recordKey)?.persistedPayload ??
          this.sourceRepo.readRawPayload(ref),
      } })
    const currentSource = input.expectedCurrentRevision === null ? null
      : this.sourceRepo.readSourceRevision(input.expectedCurrentRevision)
    if (currentSource && currentSource.sourceRevision.rawSourceSnapshotRevision === rawSnapshot.rawSourceSnapshotRevision &&
        currentSource.sourceRevision.adapterRevision === adapter.adapterRevision &&
        currentSource.sourceRevision.coverageManifestRevision === adapter.coverageManifest.manifestRevision &&
        currentSource.sourceRevision.providerAuthorityRegistryRevision === PROVIDER_AUTHORITY_REGISTRY_REVISION_V1) {
      return this.sourceRepo.refreshCurrentSourceRevision({
        canonicalSourceRevision: input.expectedCurrentRevision!, fetchedAtMs: input.fetchedAtMs,
        ...(input.lastAttemptedAtMs === undefined ? {} : { lastAttemptedAtMs: input.lastAttemptedAtMs }),
      })
    }
    const provisional = buildEnumerableSourcePublicationV1({ adapter, rawSnapshot })
    const usePrevious = input.expectedCurrentRevision !== null && hasInvalidField(provisional)
    const publication = usePrevious ? buildEnumerableSourcePublicationV1({ adapter, rawSnapshot,
      previousSourceRevision: input.expectedCurrentRevision!, previousSubjectFact: (key) => {
        const subject = provisional.recordIndex.exactSubjects.find((entry) =>
          stableSerializeProviderRequestV2(entry) === key)
        return subject ? this.sourceRepo.readSubjectFact({ canonicalSourceRevision: input.expectedCurrentRevision!,
          subject })?.payload ?? null : null
      } }) : provisional
    return this.sourceRepo.publishSourceRevision({ rawPayloads, rawSnapshot,
      sourceRevision: publication.sourceRevision, subjectIndexMode: 'complete',
      subjectFacts: publication.subjectFacts, expectedCurrentRevision: input.expectedCurrentRevision,
      fetchedAtMs: input.fetchedAtMs,
      ...(input.lastAttemptedAtMs === undefined ? {} : { lastAttemptedAtMs: input.lastAttemptedAtMs }),
    })
  }

  refreshProviderNative(input: Readonly<Omit<Parameters<CanonicalModelFactSourceIngestionV1Service[
    'publishProviderNative']>[0], 'expectedCurrentRevision'>>): CanonicalModelFactSourcePublicationResultV1 {
    const authority = providerAuthorityForNativeSurfaceV1(input.surfaceId)
    const sourceScopeId = buildProviderNativeSourceScopeIdV1({
      providerAuthorityId: authority.providerAuthorityId, providerNativeSurfaceId: input.surfaceId,
      endpointProfileId: input.endpointProfileId, credentialScopeId: input.credentialScopeId,
      credentialRevision: input.credentialRevision,
      ...(input.catalogCategory === undefined ? {} : { catalogCategory: input.catalogCategory }),
    })
    const current = this.sourceRepo.readSourceState('provider_native', sourceScopeId)
    return this.publishProviderNative({ ...input,
      expectedCurrentRevision: current?.currentSourceRevision ?? null })
  }

  recordProviderNativeRefreshFailure(input: Readonly<{
    surfaceId: ProviderNativeSurfaceIdV1
    endpointProfileId: string
    credentialScopeId: string
    credentialRevision: number
    catalogCategory?: string
    attemptedAtMs: number
    staleReason: string
  }>): void {
    const authority = providerAuthorityForNativeSurfaceV1(input.surfaceId)
    const sourceScopeId = buildProviderNativeSourceScopeIdV1({
      providerAuthorityId: authority.providerAuthorityId, providerNativeSurfaceId: input.surfaceId,
      endpointProfileId: input.endpointProfileId, credentialScopeId: input.credentialScopeId,
      credentialRevision: input.credentialRevision,
      ...(input.catalogCategory === undefined ? {} : { catalogCategory: input.catalogCategory }),
    })
    this.sourceRepo.recordRefreshFailure({ sourceKind: 'provider_native', sourceScopeId,
      attemptedAtMs: input.attemptedAtMs, staleReason: input.staleReason })
  }

  publishModelsDev(input: Readonly<{
    distributionId: string
    distributionChannel: string
    rawEnvelope: CanonicalRawEnvelopeInputV1
    expectedCurrentRevision: string | null
    fetchedAtMs: number
    lastAttemptedAtMs?: number
  }>): CanonicalModelFactSourcePublicationResultV1 {
    const sourceScopeId = buildModelsDevSourceScopeIdV1({ distributionId: input.distributionId,
      distributionChannel: input.distributionChannel })
    const rawPayloads = sanitizeAll([input.rawEnvelope])
    const rawSnapshot = buildRawSourceSnapshotRefV1({ sourceKind: 'models_dev', sourceScopeId,
      recordSetCompleteness: 'complete', rawEnvelopeRefs: rawPayloads.map((entry) => entry.ref) })
    const adapter = createModelsDevSourceAdapterV1({ rawPayloadReader: {
      readRawPayload: (ref) => rawPayloads.find((entry) => entry.ref.storeId === ref.storeId &&
        entry.ref.recordKey === ref.recordKey)?.persistedPayload ?? this.sourceRepo.readRawPayload(ref),
    } })
    const currentSource = input.expectedCurrentRevision === null ? null
      : this.sourceRepo.readSourceRevision(input.expectedCurrentRevision)
    if (currentSource && currentSource.sourceRevision.rawSourceSnapshotRevision === rawSnapshot.rawSourceSnapshotRevision &&
        currentSource.sourceRevision.adapterRevision === adapter.adapterRevision &&
        currentSource.sourceRevision.coverageManifestRevision === adapter.coverageManifest.manifestRevision &&
        currentSource.sourceRevision.providerAuthorityRegistryRevision === PROVIDER_AUTHORITY_REGISTRY_REVISION_V1) {
      return this.sourceRepo.refreshCurrentSourceRevision({
        canonicalSourceRevision: input.expectedCurrentRevision!, fetchedAtMs: input.fetchedAtMs,
        ...(input.lastAttemptedAtMs === undefined ? {} : { lastAttemptedAtMs: input.lastAttemptedAtMs }),
      })
    }
    const provisional = buildEnumerableSourcePublicationV1({ adapter, rawSnapshot })
    const usePrevious = input.expectedCurrentRevision !== null && hasInvalidField(provisional)
    const publication = usePrevious ? buildEnumerableSourcePublicationV1({ adapter, rawSnapshot,
      previousSourceRevision: input.expectedCurrentRevision!, previousSubjectFact: (key) => {
        const subject = provisional.recordIndex.exactSubjects.find((entry) =>
          stableSerializeProviderRequestV2(entry) === key)
        return subject ? this.sourceRepo.readSubjectFact({ canonicalSourceRevision: input.expectedCurrentRevision!,
          subject })?.payload ?? null : null
      } }) : provisional
    return this.sourceRepo.publishSourceRevision({ rawPayloads, rawSnapshot,
      sourceRevision: publication.sourceRevision, subjectIndexMode: 'complete',
      subjectFacts: publication.subjectFacts, expectedCurrentRevision: input.expectedCurrentRevision,
      fetchedAtMs: input.fetchedAtMs,
      ...(input.lastAttemptedAtMs === undefined ? {} : { lastAttemptedAtMs: input.lastAttemptedAtMs }),
    })
  }

  refreshModelsDev(input: Readonly<Omit<Parameters<CanonicalModelFactSourceIngestionV1Service[
    'publishModelsDev']>[0], 'expectedCurrentRevision'>>): CanonicalModelFactSourcePublicationResultV1 {
    const sourceScopeId = buildModelsDevSourceScopeIdV1({ distributionId: input.distributionId,
      distributionChannel: input.distributionChannel })
    const current = this.sourceRepo.readSourceState('models_dev', sourceScopeId)
    return this.publishModelsDev({ ...input, expectedCurrentRevision: current?.currentSourceRevision ?? null })
  }

  recordModelsDevRefreshFailure(input: Readonly<{
    distributionId: string
    distributionChannel: string
    attemptedAtMs: number
    staleReason: string
  }>): void {
    const sourceScopeId = buildModelsDevSourceScopeIdV1({ distributionId: input.distributionId,
      distributionChannel: input.distributionChannel })
    this.sourceRepo.recordRefreshFailure({ sourceKind: 'models_dev', sourceScopeId,
      attemptedAtMs: input.attemptedAtMs, staleReason: input.staleReason })
  }
}
