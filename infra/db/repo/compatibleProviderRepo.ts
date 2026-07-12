import type BetterSqlite3 from 'better-sqlite3'
import { z } from 'zod'
import {
  OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY,
  compatibleAuthDescriptorSchema,
  compatibleEndpointSecurityPolicySchema,
  compatibleCredentialMaskedSummarySchema,
  compatibleOrdinaryHeadersSchema,
  compatibleProfileVersionSchema,
  compatibleQueryConfigSchema,
  compatibleSensitiveHeaderRefsSchema,
  credentialVersionRefSchema,
  endpointRevisionIdSchema,
  providerInstanceIdSchema,
  requestProfileIdSchema,
  responseProfileIdSchema,
  type CompatibleCredentialDescriptor,
  type CompatibleEndpointRevision,
  type CompatibleProviderInstance,
} from '../../../src/shared/provider/openai-chat-compatible'

const timestampSchema = z.number().int().nonnegative()
const providerStatusSchema = z.enum(['active', 'disabled'])

export const CreateCompatibleProviderInputSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  displayName: z.string().trim().min(1).max(256),
  createdAtMs: timestampSchema,
}).strict()

export const UpdateCompatibleProviderInputSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  displayName: z.string().trim().min(1).max(256).optional(),
  status: providerStatusSchema.optional(),
  updatedAtMs: timestampSchema,
}).strict().refine((value) => value.displayName !== undefined || value.status !== undefined, {
  message: 'At least one provider field must be updated.',
})

export const TombstoneCompatibleProviderInputSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  deletedAtMs: timestampSchema,
}).strict()

export const CreateCompatibleCredentialDescriptorInputSchema = z.object({
  credentialVersionRef: credentialVersionRefSchema,
  providerInstanceId: providerInstanceIdSchema,
  version: compatibleProfileVersionSchema,
  authMode: z.enum(['none', 'bearer', 'basic', 'custom_headers']),
  backend: z.literal('electron_safe_storage'),
  maskedSummary: compatibleCredentialMaskedSummarySchema,
  createdAtMs: timestampSchema,
}).strict()

export const DeleteCompatibleCredentialDescriptorInputSchema = z.object({
  credentialVersionRef: credentialVersionRefSchema,
  deletedAtMs: timestampSchema,
}).strict()

const compatibleBaseUrlSchema = z.string().trim().url().max(2048).superRefine((value, ctx) => {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Only HTTP(S) endpoint URLs are allowed.' })
  }
  if (parsed.username || parsed.password) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Endpoint URL userinfo is forbidden.' })
  }
  if (parsed.search || parsed.hash) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Endpoint query and fragment must be configured separately.' })
  }
})

export const CreateCompatibleEndpointRevisionInputSchema = z.object({
  endpointRevisionId: endpointRevisionIdSchema,
  providerInstanceId: providerInstanceIdSchema,
  revision: compatibleProfileVersionSchema,
  baseUrl: compatibleBaseUrlSchema,
  allowInsecureHttp: z.boolean(),
  securityPolicy: compatibleEndpointSecurityPolicySchema,
  auth: compatibleAuthDescriptorSchema,
  credentialVersionRef: credentialVersionRefSchema.nullable(),
  ordinaryHeaders: compatibleOrdinaryHeadersSchema,
  sensitiveHeaderRefs: compatibleSensitiveHeaderRefsSchema,
  query: compatibleQueryConfigSchema,
  requestProfileId: requestProfileIdSchema,
  requestProfileVersion: compatibleProfileVersionSchema,
  responseProfileId: responseProfileIdSchema,
  responseProfileVersion: compatibleProfileVersionSchema,
  createdAtMs: timestampSchema,
}).strict().superRefine((value, ctx) => {
  const authRef = value.auth.mode === 'none' ? null : value.auth.credentialVersionRef
  if (authRef !== value.credentialVersionRef) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['credentialVersionRef'], message: 'Auth and endpoint credential references must match.' })
  }
  if (value.sensitiveHeaderRefs.some((entry) => entry.credentialVersionRef !== value.credentialVersionRef)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sensitiveHeaderRefs'], message: 'Sensitive header refs must use the endpoint credential version.' })
  }
  if (value.auth.mode === 'custom_headers' && value.sensitiveHeaderRefs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sensitiveHeaderRefs'], message: 'Custom-header auth requires sensitive header refs.' })
  }
  if (value.auth.mode !== 'custom_headers' && value.sensitiveHeaderRefs.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sensitiveHeaderRefs'], message: 'Sensitive header refs require custom-header auth.' })
  }
  const ordinaryNames = new Set(value.ordinaryHeaders.map((entry) => entry.name.toLowerCase()))
  if (value.sensitiveHeaderRefs.some((entry) => ordinaryNames.has(entry.name.toLowerCase()))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sensitiveHeaderRefs'], message: 'Ordinary and sensitive headers cannot share a name.' })
  }
})

export type CreateCompatibleProviderInput = z.input<typeof CreateCompatibleProviderInputSchema>
export type UpdateCompatibleProviderInput = z.input<typeof UpdateCompatibleProviderInputSchema>
export type TombstoneCompatibleProviderInput = z.input<typeof TombstoneCompatibleProviderInputSchema>
export type CreateCompatibleCredentialDescriptorInput = z.input<typeof CreateCompatibleCredentialDescriptorInputSchema>
export type DeleteCompatibleCredentialDescriptorInput = z.input<typeof DeleteCompatibleCredentialDescriptorInputSchema>
export type CreateCompatibleEndpointRevisionInput = z.input<typeof CreateCompatibleEndpointRevisionInputSchema>

type ProviderRow = {
  provider_instance_id: string
  protocol_key: string
  display_name: string
  status: CompatibleProviderInstance['status']
  created_at_ms: number
  updated_at_ms: number
  deleted_at_ms: number | null
}

type CredentialRow = {
  credential_version_ref: string
  provider_instance_id: string
  version: number
  auth_mode: CompatibleCredentialDescriptor['authMode']
  backend: CompatibleCredentialDescriptor['backend']
  masked_summary_json: string
  created_at_ms: number
  deleted_at_ms: number | null
}

type EndpointRow = {
  endpoint_revision_id: string
  provider_instance_id: string
  revision: number
  base_url: string
  allow_insecure_http: number
  security_policy: CompatibleEndpointRevision['securityPolicy']
  auth_mode: CompatibleEndpointRevision['auth']['mode']
  credential_version_ref: string | null
  auth_config_json: string
  ordinary_headers_json: string
  sensitive_header_refs_json: string
  query_json: string
  request_profile_id: string
  request_profile_version: number
  response_profile_id: string
  response_profile_version: number
  created_at_ms: number
}

function mapProvider(row: ProviderRow): CompatibleProviderInstance {
  return {
    providerInstanceId: providerInstanceIdSchema.parse(row.provider_instance_id),
    protocolKey: OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY,
    displayName: row.display_name,
    status: row.status,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
    deletedAtMs: row.deleted_at_ms,
  }
}

function mapCredential(row: CredentialRow): CompatibleCredentialDescriptor {
  return {
    credentialVersionRef: credentialVersionRefSchema.parse(row.credential_version_ref),
    providerInstanceId: providerInstanceIdSchema.parse(row.provider_instance_id),
    version: row.version,
    authMode: row.auth_mode,
    backend: row.backend,
    maskedSummary: compatibleCredentialMaskedSummarySchema.parse(JSON.parse(row.masked_summary_json)),
    createdAtMs: row.created_at_ms,
    deletedAtMs: row.deleted_at_ms,
  }
}

function mapEndpoint(row: EndpointRow): CompatibleEndpointRevision {
  return {
    endpointRevisionId: endpointRevisionIdSchema.parse(row.endpoint_revision_id),
    providerInstanceId: providerInstanceIdSchema.parse(row.provider_instance_id),
    revision: row.revision,
    baseUrl: row.base_url,
    allowInsecureHttp: row.allow_insecure_http === 1,
    securityPolicy: compatibleEndpointSecurityPolicySchema.parse(row.security_policy),
    auth: compatibleAuthDescriptorSchema.parse(JSON.parse(row.auth_config_json)),
    credentialVersionRef: row.credential_version_ref ? credentialVersionRefSchema.parse(row.credential_version_ref) : null,
    ordinaryHeaders: compatibleOrdinaryHeadersSchema.parse(JSON.parse(row.ordinary_headers_json)),
    sensitiveHeaderRefs: compatibleSensitiveHeaderRefsSchema.parse(JSON.parse(row.sensitive_header_refs_json)),
    query: compatibleQueryConfigSchema.parse(JSON.parse(row.query_json)),
    requestProfileId: requestProfileIdSchema.parse(row.request_profile_id),
    requestProfileVersion: row.request_profile_version,
    responseProfileId: responseProfileIdSchema.parse(row.response_profile_id),
    responseProfileVersion: row.response_profile_version,
    createdAtMs: row.created_at_ms,
  }
}

export class CompatibleProviderRepo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  createProvider(input: CreateCompatibleProviderInput): CompatibleProviderInstance {
    const value = CreateCompatibleProviderInputSchema.parse(input)
    this.db.prepare(`
      INSERT INTO compatible_provider_instances (
        provider_instance_id, protocol_key, display_name, status, created_at_ms, updated_at_ms, deleted_at_ms
      ) VALUES (@providerInstanceId, @protocolKey, @displayName, 'active', @createdAtMs, @createdAtMs, NULL)
    `).run({ ...value, protocolKey: OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY })
    return this.getProvider(value.providerInstanceId)!
  }

  getProvider(providerInstanceId: unknown): CompatibleProviderInstance | null {
    const id = providerInstanceIdSchema.parse(providerInstanceId)
    const row = this.db.prepare(`
      SELECT * FROM compatible_provider_instances WHERE provider_instance_id = ?
    `).get(id) as ProviderRow | undefined
    return row ? mapProvider(row) : null
  }

  listProviders(input: Readonly<{ includeDeleted?: boolean }> = {}): CompatibleProviderInstance[] {
    const rows = this.db.prepare(`
      SELECT * FROM compatible_provider_instances
      WHERE @includeDeleted = 1 OR deleted_at_ms IS NULL
      ORDER BY lower(display_name), provider_instance_id
    `).all({ includeDeleted: input.includeDeleted === true ? 1 : 0 }) as ProviderRow[]
    return rows.map(mapProvider)
  }

  updateProvider(input: UpdateCompatibleProviderInput): CompatibleProviderInstance {
    const value = UpdateCompatibleProviderInputSchema.parse(input)
    const current = this.getProvider(value.providerInstanceId)
    if (!current || current.status === 'deleted') throw new Error('Compatible provider instance is unavailable.')
    const result = this.db.prepare(`
      UPDATE compatible_provider_instances
      SET display_name = @displayName, status = @status, updated_at_ms = @updatedAtMs
      WHERE provider_instance_id = @providerInstanceId AND deleted_at_ms IS NULL
    `).run({
      providerInstanceId: value.providerInstanceId,
      displayName: value.displayName ?? current.displayName,
      status: value.status ?? current.status,
      updatedAtMs: value.updatedAtMs,
    })
    if (result.changes !== 1) throw new Error('Compatible provider instance update failed.')
    return this.getProvider(value.providerInstanceId)!
  }

  tombstoneProvider(input: TombstoneCompatibleProviderInput): CompatibleProviderInstance {
    const value = TombstoneCompatibleProviderInputSchema.parse(input)
    const result = this.db.prepare(`
      UPDATE compatible_provider_instances
      SET status = 'deleted', deleted_at_ms = @deletedAtMs, updated_at_ms = @deletedAtMs
      WHERE provider_instance_id = @providerInstanceId AND deleted_at_ms IS NULL
    `).run(value)
    if (result.changes !== 1) throw new Error('Compatible provider instance is unavailable or already deleted.')
    return this.getProvider(value.providerInstanceId)!
  }

  createCredentialDescriptor(input: CreateCompatibleCredentialDescriptorInput): CompatibleCredentialDescriptor {
    const value = CreateCompatibleCredentialDescriptorInputSchema.parse(input)
    const provider = this.getProvider(value.providerInstanceId)
    if (!provider || provider.status === 'deleted') throw new Error('Compatible provider instance is unavailable.')
    if (value.maskedSummary.authMode !== value.authMode) {
      throw new Error('Credential auth mode and masked summary must match.')
    }
    this.db.prepare(`
      INSERT INTO compatible_credential_descriptors (
        credential_version_ref, provider_instance_id, version, auth_mode, backend,
        masked_summary_json, created_at_ms, deleted_at_ms
      ) VALUES (
        @credentialVersionRef, @providerInstanceId, @version, @authMode, @backend,
        @maskedSummaryJson, @createdAtMs, NULL
      )
    `).run({ ...value, maskedSummaryJson: JSON.stringify(value.maskedSummary) })
    return this.getCredentialDescriptor(value.credentialVersionRef)!
  }

  getCredentialDescriptor(credentialVersionRef: unknown): CompatibleCredentialDescriptor | null {
    const ref = credentialVersionRefSchema.parse(credentialVersionRef)
    const row = this.db.prepare(`
      SELECT * FROM compatible_credential_descriptors WHERE credential_version_ref = ?
    `).get(ref) as CredentialRow | undefined
    return row ? mapCredential(row) : null
  }

  listCredentialDescriptors(providerInstanceId: unknown, input: Readonly<{ includeDeleted?: boolean }> = {}): CompatibleCredentialDescriptor[] {
    const id = providerInstanceIdSchema.parse(providerInstanceId)
    const rows = this.db.prepare(`
      SELECT * FROM compatible_credential_descriptors
      WHERE provider_instance_id = ? AND (? = 1 OR deleted_at_ms IS NULL)
      ORDER BY version DESC, credential_version_ref
    `).all(id, input.includeDeleted === true ? 1 : 0) as CredentialRow[]
    return rows.map(mapCredential)
  }

  deleteCredentialDescriptor(input: DeleteCompatibleCredentialDescriptorInput): CompatibleCredentialDescriptor {
    const value = DeleteCompatibleCredentialDescriptorInputSchema.parse(input)
    const result = this.db.prepare(`
      UPDATE compatible_credential_descriptors SET deleted_at_ms = @deletedAtMs
      WHERE credential_version_ref = @credentialVersionRef AND deleted_at_ms IS NULL
    `).run(value)
    if (result.changes !== 1) throw new Error('Compatible credential descriptor is unavailable or already deleted.')
    return this.getCredentialDescriptor(value.credentialVersionRef)!
  }

  createEndpointRevision(input: CreateCompatibleEndpointRevisionInput): CompatibleEndpointRevision {
    const value = CreateCompatibleEndpointRevisionInputSchema.parse(input)
    const provider = this.getProvider(value.providerInstanceId)
    if (!provider || provider.status !== 'active') throw new Error('Compatible provider instance is unavailable for endpoint revision creation.')
    if (value.allowInsecureHttp !== value.baseUrl.startsWith('http:')) {
      throw new Error('Endpoint insecure HTTP marker is inconsistent with the canonical Base URL.')
    }
    if (value.credentialVersionRef) {
      const descriptor = this.getCredentialDescriptor(value.credentialVersionRef)
      if (!descriptor || descriptor.deletedAtMs !== null || descriptor.providerInstanceId !== value.providerInstanceId) {
        throw new Error('Compatible credential reference is unavailable for this provider.')
      }
      if (descriptor.authMode !== value.auth.mode) {
        throw new Error('Compatible credential auth mode does not match the endpoint revision.')
      }
    }
    this.db.prepare(`
      INSERT INTO compatible_endpoint_revisions (
        endpoint_revision_id, provider_instance_id, revision, base_url, allow_insecure_http, security_policy,
        auth_mode, credential_version_ref, auth_config_json,
        ordinary_headers_json, sensitive_header_refs_json, query_json,
        request_profile_id, request_profile_version,
        response_profile_id, response_profile_version, created_at_ms
      ) VALUES (
        @endpointRevisionId, @providerInstanceId, @revision, @baseUrl, @allowInsecureHttp, @securityPolicy,
        @authMode, @credentialVersionRef, @authConfigJson,
        @ordinaryHeadersJson, @sensitiveHeaderRefsJson, @queryJson,
        @requestProfileId, @requestProfileVersion,
        @responseProfileId, @responseProfileVersion, @createdAtMs
      )
    `).run({
      ...value,
      allowInsecureHttp: value.allowInsecureHttp ? 1 : 0,
      authMode: value.auth.mode,
      authConfigJson: JSON.stringify(value.auth),
      ordinaryHeadersJson: JSON.stringify(value.ordinaryHeaders),
      sensitiveHeaderRefsJson: JSON.stringify(value.sensitiveHeaderRefs),
      queryJson: JSON.stringify(value.query),
    })
    return this.getEndpointRevision(value.endpointRevisionId)!
  }

  getEndpointRevision(endpointRevisionId: unknown): CompatibleEndpointRevision | null {
    const id = endpointRevisionIdSchema.parse(endpointRevisionId)
    const row = this.db.prepare(`
      SELECT * FROM compatible_endpoint_revisions WHERE endpoint_revision_id = ?
    `).get(id) as EndpointRow | undefined
    return row ? mapEndpoint(row) : null
  }

  listEndpointRevisions(providerInstanceId: unknown): CompatibleEndpointRevision[] {
    const id = providerInstanceIdSchema.parse(providerInstanceId)
    return (this.db.prepare(`
      SELECT * FROM compatible_endpoint_revisions
      WHERE provider_instance_id = ? ORDER BY revision DESC
    `).all(id) as EndpointRow[]).map(mapEndpoint)
  }

  getLatestEndpointRevision(providerInstanceId: unknown): CompatibleEndpointRevision | null {
    return this.listEndpointRevisions(providerInstanceId)[0] ?? null
  }
}
