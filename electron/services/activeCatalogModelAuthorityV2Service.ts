import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
// Approved main-process active-Catalog Generation V2 composition boundary.
// eslint-disable-next-line no-restricted-imports
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
// eslint-disable-next-line no-restricted-imports
import { GenerationV2Digest, GenerationV2Identity, type GenerationV2Identity as Identity } from '../../src/next/generation-v2/domain/identityV2'
// eslint-disable-next-line no-restricted-imports
import { ProviderCatalogAuthorityRegistryV2 } from '../../src/next/modelCatalog/providerCatalogAuthorityRegistryV2'
import { resolveModelCapabilitiesV2 } from '../../src/next/modelCatalog/modelCapabilityResolverV2'
import type { ProviderCatalogKnownProviderKey } from '../../src/shared/modelCatalog/providerCatalogContracts'
import type { CatalogProviderModelObservationV2 } from '../../src/shared/modelCatalog/providerModelObservationV2'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'

export class ActiveCatalogModelAuthorityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ACTIVE_CATALOG_INPUT_INVALID'
    | 'GENERATION_V2_ACTIVE_CATALOG_MISSING'
    | 'GENERATION_V2_ACTIVE_CATALOG_OBSERVATION_INVALID'
    | 'GENERATION_V2_ACTIVE_CATALOG_CHANGED') {
    super(code)
    this.name = 'ActiveCatalogModelAuthorityV2Error'
  }
}

const authorities = new WeakSet<object>()

export type ActiveCatalogModelAuthorityV2 = Readonly<Record<string, any>> & Readonly<{
  catalogProviderKey: ProviderCatalogKnownProviderKey
  assertCurrent(): void
}>

export function isActiveCatalogModelAuthorityV2(
  value: unknown,
  providerKey?: ProviderCatalogKnownProviderKey,
): value is ActiveCatalogModelAuthorityV2 {
  return Boolean(value && typeof value === 'object' && authorities.has(value) &&
    (providerKey === undefined || (value as { catalogProviderKey?: unknown }).catalogProviderKey === providerKey))
}

export function readActiveCatalogSnapshotAuthorityV2(value: unknown): Readonly<{
  scopeId: string; catalogDigest: string; authorityRevision: number; observationDigest: string
  contractRevision: string; resolutionDigest: string
}> {
  if (!isActiveCatalogModelAuthorityV2(value)) {
    throw new ActiveCatalogModelAuthorityV2Error('GENERATION_V2_ACTIVE_CATALOG_INPUT_INVALID')
  }
  const authority = value as any
  return Object.freeze({ scopeId: authority.catalogScopeId, catalogDigest: authority.catalogDigest.value,
    authorityRevision: authority.catalogAuthorityRevision, observationDigest: authority.observationDigest.value,
    contractRevision: authority.contractRevision.value, resolutionDigest: authority.resolutionDigest.value })
}

export function projectActiveCatalogSnapshotAuthorityV2(value: unknown): Readonly<{
  catalogAuthority?: ReturnType<typeof readActiveCatalogSnapshotAuthorityV2>
}> {
  return isActiveCatalogModelAuthorityV2(value)
    ? Object.freeze({ catalogAuthority: readActiveCatalogSnapshotAuthorityV2(value) })
    : Object.freeze({})
}

function object(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableSerializeProviderRequestV2(value), 'utf8').digest('hex')
}

function positive(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : fallback
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function descriptor(profile: Readonly<Record<string, unknown>>, providerKey: ProviderCatalogKnownProviderKey) {
  if (providerKey === 'google_ai_studio') return object(object(profile.descriptors)?.models)
  if (providerKey === 'openrouter') return object(object(object(profile.operations)?.chat_completions)?.descriptor)
  return object(profile.descriptor)
}

function observationFromCatalogItem(item: unknown): CatalogProviderModelObservationV2 | null {
  const record = object(item)
  const raw = object(record?.raw)
  const buckets = Array.isArray(raw?.buckets) ? raw.buckets : []
  for (const value of buckets) {
    const bucket = object(value)
    const payload = object(bucket?.payload)
    const candidate = object(bucket?.observation) ?? object(payload?.observation)
    if (candidate?.schemaVersion === 2 && typeof candidate.providerKey === 'string' &&
        typeof candidate.nativeModelId === 'string' && typeof candidate.observedAtMs === 'number' &&
        object(candidate.rawProviderRecord) && object(candidate.facts) && object(candidate.provenance)) {
      return candidate as CatalogProviderModelObservationV2
    }
  }
  return null
}

export function createActiveCatalogModelAuthorityV2Service(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
}>) {
  const repo = new ModelCatalogV2Repo(input.db)
  return Object.freeze({
    withExactActiveModel: async <T>(request: Readonly<{
      providerKey: ProviderCatalogKnownProviderKey
      endpointProfile: unknown
      expectedCredentialRevision: number
      expectedCredentialScopeId: CredentialScopeIdV2
      modelId: Identity<'model_id'>
      consume: (evidence: any) => Promise<T> | T
    }>): Promise<T> => {
      const registry = ProviderCatalogAuthorityRegistryV2.get(request.providerKey)
      const profile = object(request.endpointProfile)
      const endpointDescriptor = profile ? descriptor(profile, request.providerKey) : null
      if (!registry || !profile || !endpointDescriptor || typeof request.consume !== 'function') {
        throw new ActiveCatalogModelAuthorityV2Error('GENERATION_V2_ACTIVE_CATALOG_INPUT_INVALID')
      }
      const scope = Object.freeze({ providerKey: request.providerKey,
        credentialScopeId: request.expectedCredentialScopeId, endpointProfileId: registry.endpointProfileId,
        operationContractId: registry.modelsContractId, category: '' })
      return input.credentialService.withCredentialScopeBindingAuthority({
        providerKey: registry.credentialKey, expectedRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId,
        consume: async (credentialAuthority) => {
          const active = repo.readActive(scope)
          if (!active) throw new ActiveCatalogModelAuthorityV2Error('GENERATION_V2_ACTIVE_CATALOG_MISSING')
          const item = active.items.find((candidate) => candidate.modelId === request.modelId.value) ?? null
          const suppliedObservation = observationFromCatalogItem(item)
           if (item === null) throw new ActiveCatalogModelAuthorityV2Error('GENERATION_V2_ACTIVE_CATALOG_MISSING')
           const observation = suppliedObservation?.schemaVersion === 2 && suppliedObservation.providerKey === request.providerKey &&
               suppliedObservation.nativeModelId === request.modelId.value
             ? suppliedObservation as CatalogProviderModelObservationV2
             : (() => { throw new ActiveCatalogModelAuthorityV2Error('GENERATION_V2_ACTIVE_CATALOG_OBSERVATION_INVALID') })()
           // Catalog capability summaries remain evidence/display metadata only.
           // They no longer decide whether a Generation V2 semantic intent is legal;
           // the provider runtime capability resolver owns that decision.
           const resolutions = resolveModelCapabilitiesV2(observation)
          const raw = observation.rawProviderRecord
          const revision = `catalog-v2:${active.snapshotDigest}:${active.status.authorityRevision}`
          const evidenceDigest = GenerationV2Digest.create('evidence_digest', active.snapshotDigest)
          const anthropicCapabilities = request.providerKey === 'anthropic_messages' ? object(raw.capabilities) : null
          const anthropicThinking = object(anthropicCapabilities?.thinking)
          const anthropicThinkingTypes = object(anthropicThinking?.types)
          const supportedThinkingTypes = ['enabled', 'adaptive'].filter((kind) =>
            object(anthropicThinkingTypes?.[kind])?.supported === true)
          const anthropicEffort = object(anthropicCapabilities?.effort)
          const supportedEfforts = ['low', 'medium', 'high', 'max', 'xhigh'].filter((effort) =>
            object(anthropicEffort?.[effort])?.supported === true)
          const geminiMethods = Array.isArray(raw.supportedGenerationMethods)
            ? raw.supportedGenerationMethods.filter((value): value is string => typeof value === 'string') : []
          const geminiThinkingOwn = Object.prototype.hasOwnProperty.call(raw, 'thinking')
          const geminiModel = Object.freeze({
            name: typeof raw.name === 'string' ? raw.name : `models/${request.modelId.value}`,
            baseModelId: typeof raw.baseModelId === 'string' ? raw.baseModelId : request.modelId.value,
            version: typeof raw.version === 'string' ? raw.version : '',
            displayName: typeof raw.displayName === 'string' ? raw.displayName : request.modelId.value,
            description: typeof raw.description === 'string' ? raw.description : '',
            inputTokenLimit: positive(raw.inputTokenLimit, 1),
            outputTokenLimit: positive(raw.outputTokenLimit, 1_000_000),
            supportedGenerationMethods: Object.freeze(geminiMethods),
            thinkingOwnProperty: geminiThinkingOwn,
            thinkingRawType: geminiThinkingOwn ? (raw.thinking === null ? 'null' : Array.isArray(raw.thinking) ? 'array' : typeof raw.thinking) : 'missing',
            ...(geminiThinkingOwn ? { thinkingRawValue: raw.thinking } : {}),
            ...(finite(raw.temperature) !== undefined ? { temperature: finite(raw.temperature) } : {}),
            ...(finite(raw.maxTemperature) !== undefined ? { maxTemperature: finite(raw.maxTemperature) } : {}),
            ...(finite(raw.topP) !== undefined ? { topP: finite(raw.topP) } : {}),
            ...(finite(raw.topK) !== undefined ? { topK: finite(raw.topK) } : {}),
          })
          const resolutionHash = digest(resolutions)
          const openAIModelCapability = Object.freeze({
            capabilityEvidenceDigest: GenerationV2Digest.create('evidence_digest', resolutionHash),
            capability: Object.freeze({ family: request.modelId.value,
              maxOutputTokens: positive(raw.max_output_tokens ?? raw.maxOutputTokens, 1_000_000) }),
          })
          const authority = Object.freeze({
            trust: 'verified_active_catalog_model_authority_v2' as const,
            usage: 'provider_binding_capability_input_only' as const, executionAuthority: 'none' as const,
            classification: 'verified_active_catalog_model_authority_v2' as const,
            catalogProviderKey: request.providerKey, catalogScopeId: active.status.scopeId,
            catalogDigest: evidenceDigest, catalogAuthorityRevision: active.status.authorityRevision,
            catalogAdapterRevision: active.adapterRevision, observation,
            observationDigest: GenerationV2Digest.create('evidence_digest', digest(observation)), resolutions,
            resolutionDigest: GenerationV2Digest.create('evidence_digest', resolutionHash),
            contractRevision: registry.reviewedContract.contractRevision,
            providerId: GenerationV2Identity.create('provider_id', registry.executionProviderId),
            credentialScopeId: request.providerKey === 'openrouter' ? request.expectedCredentialScopeId :
              GenerationV2Identity.create('credential_scope_id', request.expectedCredentialScopeId),
            credentialRevision: request.expectedCredentialRevision,
            endpointProfileId: profile.endpointProfileId,
            endpointSetRevision: profile.endpointSetRevision,
            descriptorRevision: endpointDescriptor.descriptorRevision,
            descriptorDigest: endpointDescriptor.descriptorDigest,
            modelId: request.modelId, rowGeneration: active.status.authorityRevision, observedAtMs: active.observedAtMs,
            modelsResponseRevision: revision, modelResponseRevision: revision,
            modelsResponseDigest: evidenceDigest, modelResponseDigest: evidenceDigest, responseDigest: evidenceDigest,
            ownedBy: typeof item?.ownedBy === 'string' ? item.ownedBy : '', created: positive(item?.createdAtSec, 0),
            displayName: typeof item?.displayName === 'string' ? item.displayName : request.modelId.value,
            createdAt: typeof item?.createdAt === 'string' ? item.createdAt : new Date(active.observedAtMs).toISOString(),
            maxInputTokens: positive(raw.max_input_tokens ?? raw.maxInputTokens, 1),
            maxTokens: positive(raw.max_tokens ?? raw.maxOutputTokens, 1_000_000),
            capabilities: Object.freeze({}),
            supportedThinkingTypes: Object.freeze(supportedThinkingTypes),
            supportedEfforts: Object.freeze(supportedEfforts),
            model: geminiModel,
            modelCapability: openAIModelCapability,
            supportedParameters: Object.freeze(Array.isArray(item?.supportedParameters)
              ? item.supportedParameters.filter((value): value is string => typeof value === 'string') : []),
            inputModalities: Object.freeze(Array.isArray(item?.inputModalities)
              ? item.inputModalities.filter((value): value is string => typeof value === 'string') : []),
            outputModalities: Object.freeze(Array.isArray(item?.outputModalities)
              ? item.outputModalities.filter((value): value is string => typeof value === 'string') : []),
            assertCurrent: () => {
              if (!authorities.has(authority)) throw new ActiveCatalogModelAuthorityV2Error('GENERATION_V2_ACTIVE_CATALOG_CHANGED')
              credentialAuthority.assertCurrent()
              const current = repo.readActive(scope)
              if (!current || current.status.scopeId !== active.status.scopeId ||
                  current.snapshotDigest !== active.snapshotDigest ||
                  current.status.authorityRevision !== active.status.authorityRevision) {
                throw new ActiveCatalogModelAuthorityV2Error('GENERATION_V2_ACTIVE_CATALOG_CHANGED')
              }
            },
          })
          authorities.add(authority)
          try {
            const result = await request.consume(authority)
            authority.assertCurrent()
            return result
          } finally { authorities.delete(authority) }
        },
      })
    },
  })
}
