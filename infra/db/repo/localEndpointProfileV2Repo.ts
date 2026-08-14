import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { GenerationV2Identity } from '../../../src/next/generation-v2/domain/identityV2'
import {
  decodeLocalEndpointExecutionProviderId,
  decodeLocalEndpointProtocolV2,
  isLocalEndpointProtocolCompatible,
  type LocalEndpointExecutionProviderId,
  type LocalEndpointProtocolV2,
} from '../../../src/shared/provider/localProviderRouteDescriptor'

export type { LocalEndpointProtocolV2 } from '../../../src/shared/provider/localProviderRouteDescriptor'

export type LocalEndpointProfileV2 = Readonly<{
  endpointProfileId: string
  providerId: LocalEndpointExecutionProviderId
  protocolContractId: LocalEndpointProtocolV2
  baseUrl: string
  credentialMode: 'none'
  credentialScopeId: string
  protocolConfig: Readonly<Record<string, unknown>>
  revisionGeneration: number
  profileRevision: string
  profileDigest: string
  createdAtMs: number
  updatedAtMs: number
}>

export class LocalEndpointProfileV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID'
    | 'GENERATION_V2_LOCAL_PROFILE_NOT_FOUND'
    | 'GENERATION_V2_LOCAL_PROFILE_CONFLICT'
    | 'GENERATION_V2_LOCAL_PROFILE_STATE_INVALID') {
    super(code)
    this.name = 'LocalEndpointProfileV2RepoError'
  }
}

type Row = Readonly<Record<string, unknown>>
function hash(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }
function baseUrl(value: unknown, providerId: string): string {
  if (typeof value !== 'string') throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID')
  let url: URL
  try { url = new URL(value) } catch { throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID') }
  if (url.protocol !== 'http:' || url.username || url.password || url.search || url.hash ||
      (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '[::1]') ||
      url.pathname !== '/' || !url.port || (providerId === 'lmstudio' && url.port === '0')) {
    throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID')
  }
  return url.origin
}
function protocolConfig(providerId: string, value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID')
  const input = value as Record<string, unknown>
  if (providerId !== 'ollama') {
    if (Object.keys(input).length !== 0) throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID')
    return Object.freeze({})
  }
  if (Object.keys(input).sort().join('\0') !== 'modelId\0thinkingControl\0tools' || typeof input.modelId !== 'string' ||
      input.modelId.length === 0 || input.modelId.length > 512 || input.modelId.trim() !== input.modelId ||
      (input.thinkingControl !== 'boolean' && input.thinkingControl !== 'effort') || typeof input.tools !== 'boolean') {
    throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID')
  }
  return Object.freeze({ modelId: input.modelId, thinkingControl: input.thinkingControl, tools: input.tools })
}
function digestProjection(providerId: string, protocolContractId: string, baseUrlValue: string, config: Readonly<Record<string, unknown>>): string {
  return hash(stableSerializeProviderRequestV2({ schemaVersion: 1, providerId, protocolContractId,
    baseUrl: baseUrlValue, credentialMode: 'none', protocolConfig: config }))
}
function decode(row: Row): LocalEndpointProfileV2 {
  let providerId: LocalEndpointExecutionProviderId
  let protocolContractId: LocalEndpointProtocolV2
  try {
    providerId = decodeLocalEndpointExecutionProviderId(row.provider_id)
    protocolContractId = decodeLocalEndpointProtocolV2(row.protocol_contract_id)
  } catch {
    throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_STATE_INVALID')
  }
  if (typeof row.endpoint_profile_id !== 'string' ||
      !isLocalEndpointProtocolCompatible(providerId, protocolContractId) || row.credential_mode !== 'none' ||
      typeof row.base_url !== 'string' || typeof row.protocol_config_json !== 'string' || !Number.isSafeInteger(row.revision_generation) || (row.revision_generation as number) < 1 ||
      typeof row.profile_digest !== 'string' || !/^[0-9a-f]{64}$/u.test(row.profile_digest) ||
      typeof row.profile_revision !== 'string' || !Number.isSafeInteger(row.created_at_ms) || !Number.isSafeInteger(row.updated_at_ms)) {
    throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_STATE_INVALID')
  }
  GenerationV2Identity.create('endpoint_profile_id', row.endpoint_profile_id)
  const canonicalBaseUrl = baseUrl(row.base_url, providerId)
  let parsedConfig: unknown
  try { parsedConfig = JSON.parse(row.protocol_config_json) } catch { throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_STATE_INVALID') }
  const config = protocolConfig(providerId, parsedConfig)
  if (stableSerializeProviderRequestV2(config) !== row.protocol_config_json) throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_STATE_INVALID')
  const digest = digestProjection(providerId, protocolContractId, canonicalBaseUrl, config)
  const generation = row.revision_generation as number
  if (digest !== row.profile_digest || row.profile_revision !== `local-profile-v2:${generation}:${digest}` ||
      (row.updated_at_ms as number) < (row.created_at_ms as number)) {
    throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_STATE_INVALID')
  }
  return Object.freeze({ endpointProfileId: row.endpoint_profile_id, providerId,
    protocolContractId, baseUrl: canonicalBaseUrl,
    credentialMode: 'none', credentialScopeId: `local-none:${hash(`${row.endpoint_profile_id}\0${digest}`)}`, protocolConfig: config,
    revisionGeneration: generation, profileRevision: row.profile_revision, profileDigest: digest,
    createdAtMs: row.created_at_ms as number, updatedAtMs: row.updated_at_ms as number })
}

export class LocalEndpointProfileV2Repo {
  constructor(private readonly db: BetterSqlite3.Database, private readonly nowMs: () => number = Date.now) {}
  create(input: Readonly<{ endpointProfileId: string; providerId: LocalEndpointExecutionProviderId;
    protocolContractId: LocalEndpointProtocolV2; baseUrl: string; protocolConfig?: Readonly<Record<string, unknown>> }>): LocalEndpointProfileV2 {
    GenerationV2Identity.create('endpoint_profile_id', input.endpointProfileId)
    if (!isLocalEndpointProtocolCompatible(input.providerId, input.protocolContractId)) throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID')
    const url = baseUrl(input.baseUrl, input.providerId)
    const config = protocolConfig(input.providerId, input.protocolConfig ?? {})
    const configJson = stableSerializeProviderRequestV2(config)
    const digest = digestProjection(input.providerId, input.protocolContractId, url, config)
    const at = this.nowMs()
    const existing = this.db.prepare(`SELECT * FROM local_endpoint_profile_v2
      WHERE provider_id=? AND protocol_contract_id=? AND base_url=? AND protocol_config_json=?`).get(
      input.providerId, input.protocolContractId, url, configJson) as Row | undefined
    if (existing) return decode(existing)
    try { this.db.prepare(`INSERT INTO local_endpoint_profile_v2 VALUES (?, ?, ?, ?, 'none', ?, 1, ?, ?, ?, ?)`)
      .run(input.endpointProfileId, input.providerId, input.protocolContractId, url, configJson,
        `local-profile-v2:1:${digest}`, digest, at, at) } catch {
      const raced = this.db.prepare(`SELECT * FROM local_endpoint_profile_v2
        WHERE provider_id=? AND protocol_contract_id=? AND base_url=? AND protocol_config_json=?`).get(
        input.providerId, input.protocolContractId, url, configJson) as Row | undefined
      if (raced) return decode(raced)
      throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_CONFLICT')
    }
    return this.get(input.endpointProfileId)
  }
  get(endpointProfileId: string): LocalEndpointProfileV2 {
    GenerationV2Identity.create('endpoint_profile_id', endpointProfileId)
    const row = this.db.prepare('SELECT * FROM local_endpoint_profile_v2 WHERE endpoint_profile_id=?').get(endpointProfileId) as Row | undefined
    if (!row) throw new LocalEndpointProfileV2RepoError('GENERATION_V2_LOCAL_PROFILE_NOT_FOUND')
    return decode(row)
  }
  list(): readonly LocalEndpointProfileV2[] {
    return Object.freeze((this.db.prepare('SELECT * FROM local_endpoint_profile_v2 ORDER BY endpoint_profile_id ASC').all() as Row[]).map(decode))
  }
  delete(endpointProfileId: string): boolean {
    GenerationV2Identity.create('endpoint_profile_id', endpointProfileId)
    return this.db.prepare('DELETE FROM local_endpoint_profile_v2 WHERE endpoint_profile_id=?').run(endpointProfileId).changes === 1
  }
}
