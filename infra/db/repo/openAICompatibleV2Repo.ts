import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import {
  compatibleAuthDescriptorSchema,
  compatibleDiscoveredFieldAggregateSchema,
  compatibleEndpointSecurityPolicySchema,
  compatibleInlinePolicyConfigSchema,
  compatibleModelMetadataSchema,
  compatibleOrdinaryHeadersSchema,
  compatibleQueryConfigSchema,
  compatibleReasoningMappingConfigSchema,
  compatibleRequestFieldMappingConfigSchema,
  compatibleRequestProfileConfigSchema,
  compatibleResponseProfileConfigSchema,
} from '../../../src/shared/provider/openai-chat-compatible/schemas'
import { compatibleModelIdSchema } from '../../../src/shared/provider/openai-chat-compatible/identity'
import { mergeCompatibleModelRecords } from '../../../src/shared/modelCatalog/providers/openai-chat-compatible/compatibleCatalogMerge'
import type { CompatibleMergedModel, CompatibleModelMetadata, CompatibleModelRecord } from '../../../src/shared/provider/openai-chat-compatible/domain'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'

type ConfigKind = 'request_profile' | 'request_mapping' | 'reasoning_mapping' | 'inline_policy' | 'response_profile'
type ProviderStatus = 'active' | 'disabled' | 'deleted'

export type OpenAICompatibleConfigRevisionV2 = Readonly<{
  configKind: ConfigKind
  configId: string
  version: number
  payload: unknown
  payloadDigest: string
  createdAtMs: number
}>

export type OpenAICompatibleEndpointRevisionV2 = Readonly<{
  endpointRevisionId: string
  providerInstanceId: string
  revision: number
  baseUrl: string
  securityPolicy: 'compatibility_first' | 'strict_ssrf'
  auth: unknown
  ordinaryHeaders: unknown
  query: unknown
  requestProfileId: string
  requestProfileVersion: number
  responseProfileId: string
  responseProfileVersion: number
  endpointDigest: string
  createdAtMs: number
}>

export type OpenAICompatibleProviderDetailsV2 = Readonly<{
  providerInstanceId: string
  protocolContractId: 'openai_chat_compatible'
  displayName: string
  status: ProviderStatus
  createdAtMs: number
  updatedAtMs: number
  deletedAtMs: number | null
  endpointRevisions: readonly OpenAICompatibleEndpointRevisionV2[]
}>

export type OpenAICompatibleActiveConfigurationV2 = Readonly<{
  requestProfile: OpenAICompatibleConfigRevisionV2
  requestMappings: readonly OpenAICompatibleConfigRevisionV2[]
  reasoningMapping: OpenAICompatibleConfigRevisionV2
  inlinePolicy: OpenAICompatibleConfigRevisionV2
  responseProfile: OpenAICompatibleConfigRevisionV2
}>

export type OpenAICompatibleDiscoveryV2 = Readonly<{
  providerInstanceId: string
  responseProfileId: string
  profileVersion: number
  streamPath: string
  state: 'candidate' | 'ignored' | 'confirmed'
  aggregate: unknown
  occurrenceCount: number
  firstObservedAtMs: number
  lastObservedAtMs: number
}>

export class OpenAICompatibleV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_NOT_FOUND'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_CONFLICT'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID') {
    super(code); this.name = 'OpenAICompatibleV2RepoError'
  }
}

type Row = Readonly<Record<string, unknown>>
type ConfigurationInput = Readonly<{
  requestProfile: Readonly<{ id: string; version: number; config: unknown }>
  requestMappings: readonly Readonly<{ id: string; version: number; config: unknown }>[]
  reasoningMapping: Readonly<{ id: string; version: number; config: unknown }>
  inlinePolicy: Readonly<{ id: string; version: number; config: unknown }>
  responseProfile: Readonly<{ id: string; version: number; config: unknown }>
}>

const configKinds: readonly ConfigKind[] = [
  'request_profile', 'request_mapping', 'reasoning_mapping', 'inline_policy', 'response_profile',
]

function digest(value: unknown): string {
  return createHash('sha256').update(stableSerializeProviderRequestV2(value), 'utf8').digest('hex')
}
function id(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
  }
  return value
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
  return value as number
}
function timestamp(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
  return value as number
}
function closed(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') || Object.keys(descriptors).some((key) => !keys.includes(key)) ||
      Object.values(descriptors).some((entry) => !entry.enumerable || !('value' in entry) || entry.value === undefined)) {
    throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, entry]) => [key, entry.value]))
}
function plainArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
  return value
}
function canonicalBaseUrl(value: unknown): string {
  if (typeof value !== 'string') throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
  let url: URL
  try { url = new URL(value) } catch { throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID') }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
  }
  return url.origin
}
function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID')
  try { return JSON.parse(value) } catch { throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID') }
}
function config(kind: ConfigKind, configId: unknown, revision: unknown, payload: unknown, createdAtMs: unknown): OpenAICompatibleConfigRevisionV2 {
  const identifier = id(configId); const parsedVersion = version(revision); const at = timestamp(createdAtMs)
  let validated: unknown
  try {
    validated = kind === 'request_profile' ? compatibleRequestProfileConfigSchema.parse(payload)
      : kind === 'request_mapping' ? compatibleRequestFieldMappingConfigSchema.parse(payload)
        : kind === 'reasoning_mapping' ? compatibleReasoningMappingConfigSchema.parse(payload)
          : kind === 'inline_policy' ? compatibleInlinePolicyConfigSchema.parse(payload)
            : compatibleResponseProfileConfigSchema.parse(payload)
  } catch { throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID') }
  return Object.freeze({ configKind: kind, configId: identifier, version: parsedVersion, payload: validated,
    payloadDigest: digest(validated), createdAtMs: at })
}
function decodeConfig(row: Row): OpenAICompatibleConfigRevisionV2 {
  const kind = row.config_kind
  if (typeof kind !== 'string' || !configKinds.includes(kind as ConfigKind) || typeof row.payload_digest !== 'string' || !/^[0-9a-f]{64}$/u.test(row.payload_digest)) {
    throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID')
  }
  const result = config(kind as ConfigKind, row.config_id, row.version, parseJson(row.payload_json), row.created_at_ms)
  if (result.payloadDigest !== row.payload_digest || stableSerializeProviderRequestV2(result.payload) !== row.payload_json) {
    throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID')
  }
  return result
}
function decodeEndpoint(row: Row): OpenAICompatibleEndpointRevisionV2 {
  if (typeof row.endpoint_revision_id !== 'string' || typeof row.provider_instance_id !== 'string' ||
      typeof row.endpoint_digest !== 'string' || !/^[0-9a-f]{64}$/u.test(row.endpoint_digest)) {
    throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID')
  }
  let auth: unknown; let headers: unknown; let query: unknown; let policy: 'compatibility_first' | 'strict_ssrf'
  try {
    auth = compatibleAuthDescriptorSchema.parse(parseJson(row.auth_json))
    headers = compatibleOrdinaryHeadersSchema.parse(parseJson(row.ordinary_headers_json))
    query = compatibleQueryConfigSchema.parse(parseJson(row.query_json))
    policy = compatibleEndpointSecurityPolicySchema.parse(row.security_policy)
  } catch { throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID') }
  const result = Object.freeze({ endpointRevisionId: id(row.endpoint_revision_id), providerInstanceId: id(row.provider_instance_id),
    revision: version(row.revision), baseUrl: canonicalBaseUrl(row.base_url), securityPolicy: policy, auth, ordinaryHeaders: headers, query,
    requestProfileId: id(row.request_profile_id), requestProfileVersion: version(row.request_profile_version),
    responseProfileId: id(row.response_profile_id), responseProfileVersion: version(row.response_profile_version),
    endpointDigest: row.endpoint_digest, createdAtMs: timestamp(row.created_at_ms) })
  if (result.endpointDigest !== digest({ protocolContractId: 'openai_chat_compatible', providerInstanceId: result.providerInstanceId,
    revision: result.revision, baseUrl: result.baseUrl, securityPolicy: result.securityPolicy, auth: result.auth,
    ordinaryHeaders: result.ordinaryHeaders, query: result.query, requestProfileId: result.requestProfileId,
    requestProfileVersion: result.requestProfileVersion, responseProfileId: result.responseProfileId,
    responseProfileVersion: result.responseProfileVersion })) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID')
  return result
}

function modelRecord(row: Row): CompatibleModelRecord {
  let metadata: CompatibleModelMetadata
  try { metadata = compatibleModelMetadataSchema.parse(parseJson(row.metadata_json)) }
  catch { throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID') }
  if (typeof row.provider_instance_id !== 'string' || typeof row.model_id !== 'string' ||
      (row.source !== 'remote_sync' && row.source !== 'manual') || (row.state !== 'active' && row.state !== 'stale') ||
      typeof row.metadata_digest !== 'string' || row.metadata_digest !== digest(metadata)) {
    throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID')
  }
  const updatedAtMs = timestamp(row.updated_at_ms)
  return Object.freeze({ providerInstanceId: id(row.provider_instance_id) as CompatibleModelRecord['providerInstanceId'],
    modelId: compatibleModelIdSchema.parse(row.model_id), source: row.source, state: row.state, snapshotId: null,
    metadata, createdAtMs: updatedAtMs, updatedAtMs })
}

function discoveryRecord(row: Row): OpenAICompatibleDiscoveryV2 {
  let aggregate: unknown
  try { aggregate = compatibleDiscoveredFieldAggregateSchema.parse(parseJson(row.aggregate_json)) }
  catch { throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID') }
  if (typeof row.provider_instance_id !== 'string' || typeof row.response_profile_id !== 'string' ||
      typeof row.stream_path !== 'string' || !['candidate', 'ignored', 'confirmed'].includes(String(row.state))) {
    throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID')
  }
  return Object.freeze({ providerInstanceId: id(row.provider_instance_id), responseProfileId: id(row.response_profile_id),
    profileVersion: version(row.response_profile_version), streamPath: row.stream_path, state: row.state as OpenAICompatibleDiscoveryV2['state'],
    aggregate, occurrenceCount: version(row.occurrence_count), firstObservedAtMs: timestamp(row.first_observed_at_ms),
    lastObservedAtMs: timestamp(row.last_observed_at_ms) })
}

export class OpenAICompatibleV2Repo {
  constructor(private readonly db: BetterSqlite3.Database, private readonly nowMs: () => number = Date.now) {}

  create(input: Readonly<{ providerInstanceId: string; displayName: string; endpointRevisionId: string; baseUrl: string;
    securityPolicy: 'compatibility_first' | 'strict_ssrf'; auth: unknown; ordinaryHeaders: unknown; query: unknown;
    configuration: ConfigurationInput }>): OpenAICompatibleProviderDetailsV2 {
    const at = this.nowMs(); const providerInstanceId = id(input.providerInstanceId)
    if (typeof input.displayName !== 'string' || input.displayName.trim() !== input.displayName || input.displayName.length < 1 || input.displayName.length > 256) {
      throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    }
    return this.db.transaction(() => {
      try { this.db.prepare(`INSERT INTO openai_compatible_provider_v2 VALUES (?, 'openai_chat_compatible', ?, 'active', ?, ?, NULL)`)
        .run(providerInstanceId, input.displayName, at, at) } catch { throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_CONFLICT') }
      this.writeConfiguration(input.configuration, at)
      this.writeEndpoint({ providerInstanceId, endpointRevisionId: input.endpointRevisionId, revision: 1, baseUrl: input.baseUrl,
        securityPolicy: input.securityPolicy, auth: input.auth, ordinaryHeaders: input.ordinaryHeaders, query: input.query,
        requestProfileId: input.configuration.requestProfile.id, requestProfileVersion: input.configuration.requestProfile.version,
        responseProfileId: input.configuration.responseProfile.id, responseProfileVersion: input.configuration.responseProfile.version, createdAtMs: at })
      return this.get(providerInstanceId)
    })()
  }

  reviseConfiguration(input: Readonly<{ providerInstanceId: string; endpointRevisionId: string; configuration: ConfigurationInput }>): OpenAICompatibleProviderDetailsV2 {
    const providerInstanceId = id(input.providerInstanceId); const at = this.nowMs()
    return this.db.transaction(() => {
      const latest = this.latestEndpoint(providerInstanceId); this.writeConfiguration(input.configuration, at)
      this.writeEndpoint({ providerInstanceId, endpointRevisionId: input.endpointRevisionId, revision: latest.revision + 1,
        baseUrl: latest.baseUrl, securityPolicy: latest.securityPolicy, auth: latest.auth, ordinaryHeaders: latest.ordinaryHeaders, query: latest.query,
        requestProfileId: input.configuration.requestProfile.id, requestProfileVersion: input.configuration.requestProfile.version,
        responseProfileId: input.configuration.responseProfile.id, responseProfileVersion: input.configuration.responseProfile.version, createdAtMs: at })
      this.touch(providerInstanceId, at); return this.get(providerInstanceId)
    })()
  }

  get(providerInstanceId: string): OpenAICompatibleProviderDetailsV2 {
    const identifier = id(providerInstanceId); const row = this.db.prepare('SELECT * FROM openai_compatible_provider_v2 WHERE provider_instance_id=?').get(identifier) as Row | undefined
    if (!row || row.protocol_contract_id !== 'openai_chat_compatible' || typeof row.display_name !== 'string' ||
        !['active', 'disabled', 'deleted'].includes(row.status as string) || !Number.isSafeInteger(row.created_at_ms) || !Number.isSafeInteger(row.updated_at_ms) ||
        (row.deleted_at_ms !== null && !Number.isSafeInteger(row.deleted_at_ms))) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_NOT_FOUND')
    const endpoints = (this.db.prepare(`SELECT * FROM openai_compatible_endpoint_revision_v2 WHERE provider_instance_id=? ORDER BY revision DESC`).all(identifier) as Row[]).map(decodeEndpoint)
    if (endpoints.length === 0) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID')
    return Object.freeze({ providerInstanceId: identifier, protocolContractId: 'openai_chat_compatible', displayName: row.display_name,
      status: row.status as ProviderStatus, createdAtMs: timestamp(row.created_at_ms), updatedAtMs: timestamp(row.updated_at_ms),
      deletedAtMs: row.deleted_at_ms === null ? null : timestamp(row.deleted_at_ms), endpointRevisions: Object.freeze(endpoints) })
  }

  list(): readonly OpenAICompatibleProviderDetailsV2[] {
    return Object.freeze((this.db.prepare(`SELECT provider_instance_id FROM openai_compatible_provider_v2 WHERE status <> 'deleted' ORDER BY provider_instance_id`).all() as Row[])
      .map((row) => this.get(id(row.provider_instance_id))))
  }

  updateProvider(input: Readonly<{ providerInstanceId: string; displayName?: string; status?: 'active' | 'disabled' }>): OpenAICompatibleProviderDetailsV2 {
    const providerInstanceId = id(input.providerInstanceId)
    if (input.displayName === undefined && input.status === undefined || input.displayName !== undefined &&
        (typeof input.displayName !== 'string' || input.displayName.trim() !== input.displayName || input.displayName.length < 1 || input.displayName.length > 256) ||
        input.status !== undefined && input.status !== 'active' && input.status !== 'disabled') {
      throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    }
    if (this.db.prepare(`UPDATE openai_compatible_provider_v2 SET display_name=COALESCE(?, display_name), status=COALESCE(?, status), updated_at_ms=?
      WHERE provider_instance_id=? AND status <> 'deleted'`).run(input.displayName ?? null, input.status ?? null, this.nowMs(), providerInstanceId).changes !== 1) {
      throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_NOT_FOUND')
    }
    return this.get(providerInstanceId)
  }

  updateEndpoint(input: Readonly<{ providerInstanceId: string; endpointRevisionId: string; baseUrl: string; securityPolicy: 'compatibility_first' | 'strict_ssrf'; auth: unknown; ordinaryHeaders: unknown; query: unknown }>): OpenAICompatibleProviderDetailsV2 {
    const providerInstanceId = id(input.providerInstanceId); const at = this.nowMs()
    return this.db.transaction(() => {
      const latest = this.latestEndpoint(providerInstanceId)
      this.writeEndpoint({ providerInstanceId, endpointRevisionId: input.endpointRevisionId, revision: latest.revision + 1,
        baseUrl: input.baseUrl, securityPolicy: input.securityPolicy, auth: input.auth, ordinaryHeaders: input.ordinaryHeaders, query: input.query,
        requestProfileId: latest.requestProfileId, requestProfileVersion: latest.requestProfileVersion,
        responseProfileId: latest.responseProfileId, responseProfileVersion: latest.responseProfileVersion, createdAtMs: at })
      this.touch(providerInstanceId, at); return this.get(providerInstanceId)
    })()
  }

  deleteProvider(providerInstanceId: string): void {
    const identifier = id(providerInstanceId); const at = this.nowMs()
    if (this.db.prepare(`UPDATE openai_compatible_provider_v2 SET status='deleted', deleted_at_ms=?, updated_at_ms=?
      WHERE provider_instance_id=? AND status <> 'deleted'`).run(at, at, identifier).changes !== 1) {
      throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_NOT_FOUND')
    }
  }

  listMergedModels(providerInstanceId: string, includeStale = true): readonly CompatibleMergedModel[] {
    const provider = this.get(providerInstanceId)
    const rows = this.db.prepare(`SELECT * FROM openai_compatible_model_v2 WHERE provider_instance_id=?
      ${includeStale ? '' : "AND state='active'"} ORDER BY model_id, source`).all(provider.providerInstanceId) as Row[]
    return mergeCompatibleModelRecords(rows.map(modelRecord))
  }

  replaceRemoteModels(providerInstanceId: string, models: readonly Readonly<{ modelId: string; metadata: unknown }>[]): readonly CompatibleMergedModel[] {
    const provider = this.get(providerInstanceId); const at = this.nowMs()
    if (provider.status !== 'active' || !Array.isArray(models) || models.length > 10_000) {
      throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    }
    const normalized = models.map((item) => Object.freeze({ modelId: compatibleModelIdSchema.parse(item.modelId),
      metadata: compatibleModelMetadataSchema.parse(item.metadata) }))
    if (new Set(normalized.map((item) => item.modelId)).size !== normalized.length) {
      throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    }
    return this.db.transaction(() => {
      this.db.prepare(`UPDATE openai_compatible_model_v2 SET state='stale', updated_at_ms=?
        WHERE provider_instance_id=? AND source='remote_sync'`).run(at, provider.providerInstanceId)
      const write = this.db.prepare(`INSERT INTO openai_compatible_model_v2
        (provider_instance_id, model_id, source, state, metadata_json, metadata_digest, updated_at_ms)
        VALUES (?, ?, 'remote_sync', 'active', ?, ?, ?)
        ON CONFLICT(provider_instance_id, model_id, source) DO UPDATE SET
          state='active', metadata_json=excluded.metadata_json, metadata_digest=excluded.metadata_digest, updated_at_ms=excluded.updated_at_ms`)
      for (const item of normalized) write.run(provider.providerInstanceId, item.modelId,
        stableSerializeProviderRequestV2(item.metadata), digest(item.metadata), at)
      this.touch(provider.providerInstanceId, at)
      return this.listMergedModels(provider.providerInstanceId, true)
    })()
  }

  upsertManualModel(providerInstanceId: string, modelId: string, metadata: unknown): readonly CompatibleMergedModel[] {
    const provider = this.get(providerInstanceId); const parsedModelId = compatibleModelIdSchema.parse(modelId)
    const parsedMetadata = compatibleModelMetadataSchema.parse(metadata); const at = this.nowMs()
    this.db.prepare(`INSERT INTO openai_compatible_model_v2
      (provider_instance_id, model_id, source, state, metadata_json, metadata_digest, updated_at_ms)
      VALUES (?, ?, 'manual', 'active', ?, ?, ?)
      ON CONFLICT(provider_instance_id, model_id, source) DO UPDATE SET
        state='active', metadata_json=excluded.metadata_json, metadata_digest=excluded.metadata_digest, updated_at_ms=excluded.updated_at_ms`)
      .run(provider.providerInstanceId, parsedModelId, stableSerializeProviderRequestV2(parsedMetadata), digest(parsedMetadata), at)
    this.touch(provider.providerInstanceId, at)
    return this.listMergedModels(provider.providerInstanceId, true)
  }

  deleteManualModel(providerInstanceId: string, modelId: string): readonly CompatibleMergedModel[] {
    const provider = this.get(providerInstanceId); const parsedModelId = compatibleModelIdSchema.parse(modelId)
    this.db.prepare(`DELETE FROM openai_compatible_model_v2 WHERE provider_instance_id=? AND model_id=? AND source='manual'`)
      .run(provider.providerInstanceId, parsedModelId)
    return this.listMergedModels(provider.providerInstanceId, true)
  }

  observeDiscovery(input: Readonly<{ providerInstanceId: string; responseProfileId: string; responseProfileVersion: number;
    observations: readonly Readonly<{ streamPath: string; aggregate: unknown; occurrenceCount: number }>[] }>): readonly OpenAICompatibleDiscoveryV2[] {
    const provider = this.get(input.providerInstanceId); const responseProfileId = id(input.responseProfileId)
    const responseProfileVersion = version(input.responseProfileVersion); this.getConfiguration('response_profile', responseProfileId, responseProfileVersion)
    if (!Array.isArray(input.observations) || input.observations.length > 128) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    const at = this.nowMs()
    this.db.transaction(() => {
      const read = this.db.prepare(`SELECT * FROM openai_compatible_discovery_v2 WHERE provider_instance_id=? AND response_profile_id=?
        AND response_profile_version=? AND stream_path=?`)
      const insert = this.db.prepare(`INSERT INTO openai_compatible_discovery_v2 VALUES (?, ?, ?, ?, 'candidate', ?, ?, ?, ?)`)
      const update = this.db.prepare(`UPDATE openai_compatible_discovery_v2 SET aggregate_json=?, occurrence_count=?, last_observed_at_ms=?
        WHERE provider_instance_id=? AND response_profile_id=? AND response_profile_version=? AND stream_path=?`)
      for (const item of input.observations) {
        if (typeof item.streamPath !== 'string' || item.streamPath.length < 1 || item.streamPath.length > 1024 ||
            /[\u0000-\u001f\u007f]/u.test(item.streamPath) || !Number.isSafeInteger(item.occurrenceCount) || item.occurrenceCount < 1) {
          throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
        }
        const aggregate = compatibleDiscoveredFieldAggregateSchema.parse(item.aggregate)
        const existing = read.get(provider.providerInstanceId, responseProfileId, responseProfileVersion, item.streamPath) as Row | undefined
        if (!existing) insert.run(provider.providerInstanceId, responseProfileId, responseProfileVersion, item.streamPath,
          stableSerializeProviderRequestV2(aggregate), item.occurrenceCount, at, at)
        else {
          const prior = discoveryRecord(existing); const previous = prior.aggregate as { observedShapes: readonly string[]; redactedPreview: unknown; sampleCount: number }
          const next = compatibleDiscoveredFieldAggregateSchema.parse({ schemaVersion: 1,
            observedShapes: [...new Set([...previous.observedShapes, ...aggregate.observedShapes])],
            redactedPreview: aggregate.redactedPreview ?? previous.redactedPreview,
            sampleCount: previous.sampleCount + aggregate.sampleCount })
          update.run(stableSerializeProviderRequestV2(next), prior.occurrenceCount + item.occurrenceCount, at,
            provider.providerInstanceId, responseProfileId, responseProfileVersion, item.streamPath)
        }
      }
    })()
    return this.listDiscovery(provider.providerInstanceId)
  }

  listDiscovery(providerInstanceId: string): readonly OpenAICompatibleDiscoveryV2[] {
    const provider = this.get(providerInstanceId)
    return Object.freeze((this.db.prepare(`SELECT * FROM openai_compatible_discovery_v2 WHERE provider_instance_id=?
      ORDER BY response_profile_id, response_profile_version, stream_path`).all(provider.providerInstanceId) as Row[]).map(discoveryRecord))
  }

  setDiscoveryState(providerInstanceId: string, responseProfileId: string, responseProfileVersion: number,
    streamPath: string, state: 'ignored' | 'confirmed'): readonly OpenAICompatibleDiscoveryV2[] {
    const provider = this.get(providerInstanceId)
    if (state !== 'ignored' && state !== 'confirmed' || this.db.prepare(`UPDATE openai_compatible_discovery_v2 SET state=?
      WHERE provider_instance_id=? AND response_profile_id=? AND response_profile_version=? AND stream_path=?`)
      .run(state, provider.providerInstanceId, id(responseProfileId), version(responseProfileVersion), streamPath).changes !== 1) {
      throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_NOT_FOUND')
    }
    return this.listDiscovery(provider.providerInstanceId)
  }

  getConfiguration(kind: ConfigKind, configId: string, revision: number): OpenAICompatibleConfigRevisionV2 {
    const row = this.db.prepare('SELECT * FROM openai_compatible_config_revision_v2 WHERE config_kind=? AND config_id=? AND version=?')
      .get(kind, id(configId), version(revision)) as Row | undefined
    if (!row) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_NOT_FOUND')
    return decodeConfig(row)
  }

  getActiveConfiguration(providerInstanceId: string): OpenAICompatibleActiveConfigurationV2 {
    return this.getConfigurationForEndpointRevision(providerInstanceId, this.latestEndpoint(id(providerInstanceId)).endpointRevisionId)
  }

  /**
   * Reads the exact immutable configuration graph selected by an endpoint
   * revision.  Generation snapshots must never be reinterpreted through the
   * provider's latest endpoint/configuration revision.
   */
  getConfigurationForEndpointRevision(providerInstanceId: string, endpointRevisionId: string): OpenAICompatibleActiveConfigurationV2 {
    const endpoint = this.getEndpointRevision(providerInstanceId, endpointRevisionId)
    const requestProfile = this.getConfiguration('request_profile', endpoint.requestProfileId, endpoint.requestProfileVersion)
    const responseProfile = this.getConfiguration('response_profile', endpoint.responseProfileId, endpoint.responseProfileVersion)
    const response = responseProfile.payload as { reasoningMapping?: { mappingId?: unknown; version?: unknown }; inlinePolicy?: { inlinePolicyId?: unknown; version?: unknown } }
    const requestMappings = (this.db.prepare(`SELECT * FROM openai_compatible_config_revision_v2
      WHERE config_kind='request_mapping' ORDER BY config_id, version`).all() as Row[]).map(decodeConfig).filter((entry) => {
      const value = entry.payload as { requestProfileId?: unknown; requestProfileVersion?: unknown }
      return value.requestProfileId === requestProfile.configId && value.requestProfileVersion === requestProfile.version
    })
    return Object.freeze({ requestProfile, requestMappings: Object.freeze(requestMappings),
      reasoningMapping: this.getConfiguration('reasoning_mapping', String(response.reasoningMapping?.mappingId), Number(response.reasoningMapping?.version)),
      inlinePolicy: this.getConfiguration('inline_policy', String(response.inlinePolicy?.inlinePolicyId), Number(response.inlinePolicy?.version)),
      responseProfile })
  }

  getEndpointRevision(providerInstanceId: string, endpointRevisionId: string): OpenAICompatibleEndpointRevisionV2 {
    const provider = id(providerInstanceId); const revisionId = id(endpointRevisionId)
    const row = this.db.prepare(`SELECT * FROM openai_compatible_endpoint_revision_v2
      WHERE provider_instance_id=? AND endpoint_revision_id=?`).get(provider, revisionId) as Row | undefined
    if (!row) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_NOT_FOUND')
    return decodeEndpoint(row)
  }

  private writeConfiguration(input: ConfigurationInput, at: number): void {
    const entries = [
      config('request_profile', input.requestProfile.id, input.requestProfile.version, input.requestProfile.config, at),
      ...plainArray(input.requestMappings).map((item) => {
        const entry = closed(item, ['id', 'version', 'config']); return config('request_mapping', entry.id, entry.version, entry.config, at)
      }),
      config('reasoning_mapping', input.reasoningMapping.id, input.reasoningMapping.version, input.reasoningMapping.config, at),
      config('inline_policy', input.inlinePolicy.id, input.inlinePolicy.version, input.inlinePolicy.config, at),
      config('response_profile', input.responseProfile.id, input.responseProfile.version, input.responseProfile.config, at),
    ]
    if (entries.filter((entry) => entry.configKind === 'request_mapping').length > 32 ||
        new Set(entries.map((entry) => `${entry.configKind}\0${entry.configId}\0${entry.version}`)).size !== entries.length) {
      throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    }
    const request = entries.find((entry) => entry.configKind === 'request_profile')!
    const response = entries.find((entry) => entry.configKind === 'response_profile')!
    const reasoning = entries.find((entry) => entry.configKind === 'reasoning_mapping')!
    const inline = entries.find((entry) => entry.configKind === 'inline_policy')!
    for (const mapping of entries.filter((entry) => entry.configKind === 'request_mapping')) {
      const value = mapping.payload as { mappingId?: unknown; requestProfileId?: unknown; requestProfileVersion?: unknown }
      if (value.mappingId !== mapping.configId || value.requestProfileId !== request.configId || value.requestProfileVersion !== request.version) {
        throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
      }
    }
    const responseValue = response.payload as { reasoningMapping?: { mappingId?: unknown; version?: unknown }; inlinePolicy?: { inlinePolicyId?: unknown; version?: unknown } }
    if (responseValue.reasoningMapping?.mappingId !== reasoning.configId || responseValue.reasoningMapping.version !== reasoning.version ||
        responseValue.inlinePolicy?.inlinePolicyId !== inline.configId || responseValue.inlinePolicy.version !== inline.version) {
      throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    }
    for (const entry of entries) {
      const existing = this.db.prepare('SELECT * FROM openai_compatible_config_revision_v2 WHERE config_kind=? AND config_id=? AND version=?')
        .get(entry.configKind, entry.configId, entry.version) as Row | undefined
      if (existing) {
        const persisted = decodeConfig(existing)
        if (persisted.payloadDigest !== entry.payloadDigest) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_CONFLICT')
        continue
      }
      const prior = this.db.prepare('SELECT MAX(version) AS version FROM openai_compatible_config_revision_v2 WHERE config_kind=? AND config_id=?')
        .get(entry.configKind, entry.configId) as { version: number | null }
      if (prior.version !== null && entry.version !== prior.version + 1) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_CONFLICT')
      this.db.prepare(`INSERT INTO openai_compatible_config_revision_v2 VALUES (?, ?, ?, ?, ?, ?)`).run(
        entry.configKind, entry.configId, entry.version, stableSerializeProviderRequestV2(entry.payload), entry.payloadDigest, entry.createdAtMs)
    }
  }

  private writeEndpoint(input: Omit<OpenAICompatibleEndpointRevisionV2, 'endpointDigest'>): void {
    let auth: unknown; let headers: unknown; let query: unknown; let policy: 'compatibility_first' | 'strict_ssrf'
    try { auth = compatibleAuthDescriptorSchema.parse(input.auth); headers = compatibleOrdinaryHeadersSchema.parse(input.ordinaryHeaders)
      query = compatibleQueryConfigSchema.parse(input.query); policy = compatibleEndpointSecurityPolicySchema.parse(input.securityPolicy) } catch {
      throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    }
    const value = Object.freeze({ protocolContractId: 'openai_chat_compatible', providerInstanceId: id(input.providerInstanceId), revision: version(input.revision),
      baseUrl: canonicalBaseUrl(input.baseUrl), securityPolicy: policy, auth, ordinaryHeaders: headers, query,
      requestProfileId: id(input.requestProfileId), requestProfileVersion: version(input.requestProfileVersion),
      responseProfileId: id(input.responseProfileId), responseProfileVersion: version(input.responseProfileVersion) })
    this.getConfiguration('request_profile', value.requestProfileId, value.requestProfileVersion)
    this.getConfiguration('response_profile', value.responseProfileId, value.responseProfileVersion)
    const endpointDigest = digest(value)
    try { this.db.prepare(`INSERT INTO openai_compatible_endpoint_revision_v2 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id(input.endpointRevisionId), value.providerInstanceId, value.revision, value.baseUrl, value.securityPolicy,
        stableSerializeProviderRequestV2(value.auth), stableSerializeProviderRequestV2(value.ordinaryHeaders), stableSerializeProviderRequestV2(value.query),
        value.requestProfileId, value.requestProfileVersion, value.responseProfileId, value.responseProfileVersion, endpointDigest, timestamp(input.createdAtMs))
    } catch { throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_CONFLICT') }
  }
  private latestEndpoint(providerInstanceId: string): OpenAICompatibleEndpointRevisionV2 {
    const row = this.db.prepare('SELECT * FROM openai_compatible_endpoint_revision_v2 WHERE provider_instance_id=? ORDER BY revision DESC LIMIT 1').get(providerInstanceId) as Row | undefined
    if (!row) throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_NOT_FOUND')
    return decodeEndpoint(row)
  }
  private touch(providerInstanceId: string, at: number): void {
    if (this.db.prepare(`UPDATE openai_compatible_provider_v2 SET updated_at_ms=? WHERE provider_instance_id=? AND status <> 'deleted'`).run(at, providerInstanceId).changes !== 1) {
      throw new OpenAICompatibleV2RepoError('GENERATION_V2_OPENAI_COMPATIBLE_NOT_FOUND')
    }
  }
}
