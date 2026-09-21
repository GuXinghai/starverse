import type BetterSqlite3 from 'better-sqlite3'
import { ModelCatalogV2Repo, type ModelCatalogScopeIdentityV2 } from '../repo/modelCatalogV2Repo'
import { OpenAICompatibleV2Repo } from '../repo/openAICompatibleV2Repo'
import { LocalEndpointProfileV2Repo } from '../repo/localEndpointProfileV2Repo'
import {
  buildAuthoritativeModelSubjectSetV1,
  type AuthoritativeModelSubjectCandidateV1,
  type AuthoritativeModelSubjectSetV1,
} from '../../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import {
  providerAuthorityForCompatibleProviderInstanceV1,
  providerAuthorityForLocalProfileV1,
  providerAuthorityForNativeSurfaceV1,
} from '../../../src/next/generation-v2/model-facts/providerAuthorityRegistryV1'
import { ProviderCatalogAuthorityRegistryV2 } from '../../../src/next/modelCatalog/providerCatalogAuthorityRegistryV2'
import type { ProviderCredentialKey } from '../../../electron/credentials/providerCredentialContract'

type CredentialStatus = Readonly<{
  providerKey: ProviderCredentialKey
  configured: boolean
  revision: number
  credentialScopeId?: string
}>

type CredentialAuthority = Readonly<{
  getStatus: (providerKey: ProviderCredentialKey) => Promise<CredentialStatus>
}>

type CompatibleCredentialStatus = Readonly<{
  configured: boolean
  revision: number
  credentialScopeId?: string
}>

type CompatibleCredentialAuthority = Readonly<{
  getStatus: (providerInstanceId: string, credentialVersionRef: string) => Promise<CompatibleCredentialStatus>
}>

type CompatibleCurrentness = Readonly<{
  providerInstanceId: string
  endpointRevisionId: string
  endpointDigest: string
  credentialVersionRef: string | null
  credentialConfigured: boolean
  credentialScopeId: string | null
  credentialRevision: number
}>

function credentialProjection(statuses: readonly CredentialStatus[]): string {
  return JSON.stringify([...statuses].map((status) => Object.freeze({ providerKey: status.providerKey,
    configured: status.configured, revision: status.revision,
    credentialScopeId: status.credentialScopeId ?? null })).sort((left, right) =>
    left.providerKey.localeCompare(right.providerKey, 'en')))
}

function compatibleProjection(bindings: readonly CompatibleCurrentness[]): string {
  return JSON.stringify([...bindings].sort((left, right) =>
    left.providerInstanceId.localeCompare(right.providerInstanceId, 'en')))
}

function exactModelId(item: Readonly<Record<string, unknown>>): string {
  if (typeof item.modelId !== 'string' || item.modelId.length < 1 || item.modelId.length > 1024 ||
      item.modelId.trim() !== item.modelId) {
    throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
  }
  if (item.nativeModelId !== undefined && item.nativeModelId !== item.modelId) {
    throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
  }
  return item.modelId
}

export class AuthoritativeModelSubjectSetV1Service {
  readonly #catalogRepo: ModelCatalogV2Repo
  readonly #compatibleRepo: OpenAICompatibleV2Repo
  readonly #localRepo: LocalEndpointProfileV2Repo

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly credentialAuthority: CredentialAuthority,
    private readonly compatibleCredentialAuthority: CompatibleCredentialAuthority,
  ) {
    this.#catalogRepo = new ModelCatalogV2Repo(db)
    this.#compatibleRepo = new OpenAICompatibleV2Repo(db)
    this.#localRepo = new LocalEndpointProfileV2Repo(db)
  }


  async #compatibleCurrentness(): Promise<readonly CompatibleCurrentness[]> {
    const providers = this.db.transaction(() => this.#compatibleRepo.list()
      .filter((entry) => entry.status === 'active')
      .map((provider) => {
        const endpoint = provider.endpointRevisions[0]
        if (!endpoint) throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_AUTHORITY_INVALID')
        const auth = endpoint.auth as { mode?: unknown; credentialVersionRef?: unknown }
        if (auth.mode === 'none') return Object.freeze({ providerInstanceId: provider.providerInstanceId,
          endpointRevisionId: endpoint.endpointRevisionId, endpointDigest: endpoint.endpointDigest,
          credentialVersionRef: null })
        if (typeof auth.credentialVersionRef !== 'string') {
          throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_AUTHORITY_INVALID')
        }
        return Object.freeze({ providerInstanceId: provider.providerInstanceId,
          endpointRevisionId: endpoint.endpointRevisionId, endpointDigest: endpoint.endpointDigest,
          credentialVersionRef: auth.credentialVersionRef })
      }))()
    return Object.freeze(await Promise.all(providers.map(async (provider): Promise<CompatibleCurrentness> => {
      if (provider.credentialVersionRef === null) return Object.freeze({ ...provider,
        credentialConfigured: true, credentialScopeId: 'compatible-credential-none', credentialRevision: 0 })
      const status = await this.compatibleCredentialAuthority.getStatus(
        provider.providerInstanceId, provider.credentialVersionRef)
      return Object.freeze({ ...provider, credentialConfigured: status.configured,
        credentialScopeId: status.credentialScopeId ?? null, credentialRevision: status.revision })
    })))
  }

  async readCurrent(): Promise<AuthoritativeModelSubjectSetV1> {
    const catalogAuthorities = ProviderCatalogAuthorityRegistryV2.list()
    const before = await Promise.all(catalogAuthorities.map((entry) =>
      this.credentialAuthority.getStatus(entry.credentialKey)))
    const compatibleBefore = await this.#compatibleCurrentness()
    const candidates = this.db.transaction(() => {
      const candidates: AuthoritativeModelSubjectCandidateV1[] = []
      for (const catalog of catalogAuthorities) {
        const status = before.find((entry) => entry.providerKey === catalog.credentialKey)
        if (!status?.configured || !status.credentialScopeId) continue
        const scope: ModelCatalogScopeIdentityV2 = Object.freeze({ providerKey: catalog.providerKey,
          credentialScopeId: status.credentialScopeId, endpointProfileId: catalog.endpointProfileId,
          operationContractId: catalog.modelsContractId, category: '' })
        const active = this.#catalogRepo.readActive(scope)
        if (!active) continue
        const authority = providerAuthorityForNativeSurfaceV1(catalog.modelsContractId)
        if (!authority.executionBindings.some((binding) =>
          binding.implementationProviderId === catalog.executionProviderId &&
          binding.endpointProfileKind === catalog.endpointProfileId)) {
          throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_AUTHORITY_INVALID')
        }
        for (const item of active.items) {
          candidates.push(Object.freeze({ subject: Object.freeze({
            providerAuthorityId: authority.providerAuthorityId,
            endpointProfileId: catalog.endpointProfileId,
            nativeModelId: exactModelId(item),
          }), proof: Object.freeze({ kind: 'provider_native_catalog' as const,
            providerKey: catalog.providerKey, scopeId: active.status.scopeId,
            credentialScopeId: status.credentialScopeId, credentialRevision: status.revision,
            endpointProfileId: catalog.endpointProfileId, operationContractId: catalog.modelsContractId,
            catalogCategory: '', activeSnapshotDigest: active.snapshotDigest }) }))
        }
      }
      for (const provider of this.#compatibleRepo.list().filter((entry) => entry.status === 'active')) {
        const authority = providerAuthorityForCompatibleProviderInstanceV1(provider.providerInstanceId)
        const endpoint = provider.endpointRevisions[0]
        if (!endpoint) throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_AUTHORITY_INVALID')
        const currentness = compatibleBefore.find((entry) =>
          entry.providerInstanceId === provider.providerInstanceId)
        if (!currentness || currentness.endpointRevisionId !== endpoint.endpointRevisionId ||
            currentness.endpointDigest !== endpoint.endpointDigest) {
          throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_STALE')
        }
        for (const model of this.#compatibleRepo.listAuthoritativeModelBindings(provider.providerInstanceId)) {
          const subject = Object.freeze({
            providerAuthorityId: authority.providerAuthorityId,
            endpointProfileId: authority.endpointProfileId,
            nativeModelId: model.modelId,
          })
          if (model.manual) candidates.push(Object.freeze({ subject,
            proof: Object.freeze({ kind: 'compatible_model_binding' as const,
              providerInstanceId: provider.providerInstanceId, endpointRevisionId: endpoint.endpointRevisionId,
              endpointDigest: endpoint.endpointDigest, source: 'manual' as const }) }))
          const remote = model.remoteAcquisition
          if (remote && currentness.credentialConfigured && currentness.credentialScopeId !== null &&
              remote.credentialScopeId === currentness.credentialScopeId &&
              remote.credentialRevision === currentness.credentialRevision) {
            candidates.push(Object.freeze({ subject, proof: Object.freeze({
              kind: 'compatible_model_binding' as const,
              providerInstanceId: provider.providerInstanceId, endpointRevisionId: endpoint.endpointRevisionId,
              endpointDigest: endpoint.endpointDigest, source: 'remote_sync' as const,
              credentialScopeId: remote.credentialScopeId, credentialRevision: remote.credentialRevision,
              acquisitionSnapshotDigest: remote.snapshotDigest,
            }) }))
          }
        }
      }
      for (const profile of this.#localRepo.list()) {
        const authority = providerAuthorityForLocalProfileV1(profile.providerId)
        const modelId = profile.protocolConfig.modelId
        if (typeof modelId !== 'string') throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_INVALID')
        candidates.push(Object.freeze({ subject: Object.freeze({
          providerAuthorityId: authority.providerAuthorityId,
          endpointProfileId: profile.endpointProfileId,
          nativeModelId: modelId,
        }), proof: Object.freeze({ kind: 'local_profile_binding' as const,
          endpointProfileId: profile.endpointProfileId, providerId: profile.providerId,
          protocolContractId: profile.protocolContractId, profileRevision: profile.profileRevision }) }))
      }
      return Object.freeze(candidates)
    })()
    const result = buildAuthoritativeModelSubjectSetV1(candidates)
    const after = await Promise.all(catalogAuthorities.map((entry) =>
      this.credentialAuthority.getStatus(entry.credentialKey)))
    const compatibleAfter = await this.#compatibleCurrentness()
    if (credentialProjection(before) !== credentialProjection(after) ||
        compatibleProjection(compatibleBefore) !== compatibleProjection(compatibleAfter)) {
      throw new Error('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_STALE')
    }
    return result
  }
}
