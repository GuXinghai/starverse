import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CompatibleProviderRepo } from './compatibleProviderRepo'

describe('CompatibleProviderRepo', () => {
  let db: BetterSqlite3.Database
  let repo: CompatibleProviderRepo

  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    db.exec(readFileSync(path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'), 'utf8'))
    repo = new CompatibleProviderRepo(db)
  })

  afterEach(() => db.close())

  function createProvider() {
    return repo.createProvider({
      providerInstanceId: 'ocp_provider_12345678',
      displayName: 'Example Provider',
      createdAtMs: 1,
    })
  }

  function insertProfiles() {
    db.prepare(`
      INSERT INTO compatible_request_profiles (request_profile_id, version, schema_version, config_json, created_at_ms)
      VALUES ('ocp_request_profile_12345678', 1, 1, '{}', 1)
    `).run()
    db.prepare(`
      INSERT INTO compatible_reasoning_mappings (mapping_id, version, mode, schema_version, config_json, created_at_ms)
      VALUES ('ocp_reasoning_mapping_12345678', 1, 'custom_only', 1, '{}', 1)
    `).run()
    db.prepare(`
      INSERT INTO compatible_inline_policies (inline_policy_id, version, schema_version, config_json, created_at_ms)
      VALUES ('ocp_inline_policy_12345678', 1, 1, '{}', 1)
    `).run()
    db.prepare(`
      INSERT INTO compatible_response_profiles (
        response_profile_id, version, schema_version,
        reasoning_mapping_id, reasoning_mapping_version,
        inline_policy_id, inline_policy_version, config_json, created_at_ms
      ) VALUES (
        'ocp_response_profile_12345678', 1, 1,
        'ocp_reasoning_mapping_12345678', 1,
        'ocp_inline_policy_12345678', 1, '{}', 1
      )
    `).run()
  }

  function createCredential() {
    return repo.createCredentialDescriptor({
      credentialVersionRef: 'ocp_credential_12345678',
      providerInstanceId: 'ocp_provider_12345678',
      version: 1,
      authMode: 'bearer',
      backend: 'electron_safe_storage',
      maskedSummary: {
        schemaVersion: 1,
        authMode: 'bearer',
        configured: true,
        maskState: 'configured_masked',
        sensitiveHeaderNames: [],
      },
      createdAtMs: 1,
    })
  }

  it('creates, updates and tombstones stable provider identities', () => {
    expect(createProvider()).toMatchObject({
      providerInstanceId: 'ocp_provider_12345678',
      protocolKey: 'openai_chat_compatible',
      status: 'active',
    })
    expect(repo.updateProvider({
      providerInstanceId: 'ocp_provider_12345678',
      displayName: 'Renamed Provider',
      status: 'disabled',
      updatedAtMs: 2,
    })).toMatchObject({ displayName: 'Renamed Provider', status: 'disabled' })
    expect(repo.tombstoneProvider({
      providerInstanceId: 'ocp_provider_12345678',
      deletedAtMs: 3,
    })).toMatchObject({ status: 'deleted', deletedAtMs: 3 })
    expect(repo.listProviders()).toEqual([])
    expect(repo.listProviders({ includeDeleted: true })).toHaveLength(1)
  })

  it('rejects duplicate active names while allowing reuse after a tombstone', () => {
    createProvider()
    expect(() => repo.createProvider({
      providerInstanceId: 'ocp_provider_abcdefgh',
      displayName: ' example provider ',
      createdAtMs: 2,
    })).toThrow(/unique/i)
    repo.tombstoneProvider({ providerInstanceId: 'ocp_provider_12345678', deletedAtMs: 3 })
    expect(repo.createProvider({
      providerInstanceId: 'ocp_provider_abcdefgh',
      displayName: 'example provider',
      createdAtMs: 4,
    }).providerInstanceId).toBe('ocp_provider_abcdefgh')
  })

  it('persists only masked credential descriptors and rejects raw secret-shaped input', () => {
    createProvider()
    expect(createCredential()).toMatchObject({
      credentialVersionRef: 'ocp_credential_12345678',
      authMode: 'bearer',
      deletedAtMs: null,
    })
    expect(() => repo.createCredentialDescriptor({
      credentialVersionRef: 'ocp_credential_abcdefgh',
      providerInstanceId: 'ocp_provider_12345678',
      version: 2,
      authMode: 'bearer',
      backend: 'electron_safe_storage',
      maskedSummary: {
        schemaVersion: 1,
        authMode: 'bearer',
        configured: true,
        maskState: 'configured_masked',
        sensitiveHeaderNames: [],
      },
      createdAtMs: 2,
      token: 'sk-forbidden-raw-secret',
    } as any)).toThrow()
    const raw = db.prepare(`
      SELECT masked_summary_json FROM compatible_credential_descriptors
      WHERE credential_version_ref = 'ocp_credential_12345678'
    `).get() as { masked_summary_json: string }
    expect(raw.masked_summary_json).not.toContain('sk-')
    expect(raw.masked_summary_json).not.toContain('token')
  })

  it('creates immutable endpoint revisions with separate safe headers/query and secure refs', () => {
    createProvider()
    createCredential()
    insertProfiles()

    const endpoint = repo.createEndpointRevision({
      endpointRevisionId: 'ocp_endpoint_12345678',
      providerInstanceId: 'ocp_provider_12345678',
      revision: 1,
      baseUrl: 'https://api.example.test/v1',
      allowInsecureHttp: false,
      securityPolicy: 'compatibility_first',
      auth: { mode: 'bearer', credentialVersionRef: 'ocp_credential_12345678' },
      credentialVersionRef: 'ocp_credential_12345678',
      ordinaryHeaders: [{ name: 'X-Client', value: 'Starverse', classification: 'public_non_secret' }],
      sensitiveHeaderRefs: [],
      query: [{ name: 'region', value: 'test', classification: 'public_non_secret' }],
      requestProfileId: 'ocp_request_profile_12345678',
      requestProfileVersion: 1,
      responseProfileId: 'ocp_response_profile_12345678',
      responseProfileVersion: 1,
      createdAtMs: 2,
    })

    expect(endpoint).toMatchObject({
      endpointRevisionId: 'ocp_endpoint_12345678',
      providerInstanceId: 'ocp_provider_12345678',
      auth: { mode: 'bearer', credentialVersionRef: 'ocp_credential_12345678' },
      query: [{ name: 'region', value: 'test', classification: 'public_non_secret' }],
    })
    expect(() => db.prepare(`
      UPDATE compatible_endpoint_revisions SET base_url = 'https://other.example.test/v1'
    `).run()).toThrow(/immutable/i)
    expect(() => db.prepare(`
      UPDATE compatible_endpoint_revisions SET security_policy = 'strict_ssrf'
    `).run()).toThrow(/immutable/i)
  })

  it('allows explicitly marked HTTP while rejecting URL userinfo, marker mismatch, auth-ref mismatch and secret-like fields', () => {
    createProvider()
    createCredential()
    insertProfiles()
    const base = {
      endpointRevisionId: 'ocp_endpoint_12345678',
      providerInstanceId: 'ocp_provider_12345678',
      revision: 1,
      baseUrl: 'https://api.example.test/v1',
      allowInsecureHttp: false,
      securityPolicy: 'compatibility_first' as const,
      auth: { mode: 'bearer' as const, credentialVersionRef: 'ocp_credential_12345678' },
      credentialVersionRef: 'ocp_credential_12345678',
      ordinaryHeaders: [],
      sensitiveHeaderRefs: [],
      query: [],
      requestProfileId: 'ocp_request_profile_12345678',
      requestProfileVersion: 1,
      responseProfileId: 'ocp_response_profile_12345678',
      responseProfileVersion: 1,
      createdAtMs: 2,
    }
    expect(() => repo.createEndpointRevision({ ...base, baseUrl: 'https://user:pass@api.example.test/v1' })).toThrow(/userinfo/i)
    expect(() => repo.createEndpointRevision({ ...base, baseUrl: 'http://api.example.test/v1' })).toThrow(/marker/i)
    expect(repo.createEndpointRevision({
      ...base,
      endpointRevisionId: 'ocp_endpoint_http1234',
      baseUrl: 'http://api.example.test/v1',
      allowInsecureHttp: true,
    }).allowInsecureHttp).toBe(true)
    expect(repo.createEndpointRevision({
      ...base,
      endpointRevisionId: 'ocp_endpoint_strict12',
      revision: 2,
      securityPolicy: 'strict_ssrf',
    }).securityPolicy).toBe('strict_ssrf')
    expect(() => repo.createEndpointRevision({ ...base, credentialVersionRef: null })).toThrow(/must match/i)
    expect(() => repo.createEndpointRevision({
      ...base,
      ordinaryHeaders: [{ name: 'Authorization', value: 'Bearer raw-secret', classification: 'public_non_secret' }],
    })).toThrow(/secure references/i)
    expect(() => repo.createEndpointRevision({
      ...base,
      query: [{ name: 'api_key', value: 'raw-secret', classification: 'public_non_secret' }],
    })).toThrow(/query parameters/i)
    expect(() => repo.createEndpointRevision({
      ...base,
      ordinaryHeaders: [{ name: 'X-Client-Auth', value: 'hunter2', classification: 'public_non_secret' }],
    })).toThrow(/secure references/i)
    expect(() => repo.createEndpointRevision({
      ...base,
      query: [{ name: 'access', value: 'hunter2', classification: 'public_non_secret' }],
    })).toThrow(/query parameters/i)
    expect(() => repo.createEndpointRevision({
      ...base,
      auth: { mode: 'custom_headers', credentialVersionRef: 'ocp_credential_12345678' },
      ordinaryHeaders: [{ name: 'X-Tenant', value: 'public', classification: 'public_non_secret' }],
      sensitiveHeaderRefs: [{ name: 'x-tenant', credentialVersionRef: 'ocp_credential_12345678' }],
    })).toThrow(/share a name/i)
    expect(() => repo.createEndpointRevision({
      ...base,
      ordinaryHeaders: [{ name: 'X-Tenant', value: 'hunter2' }] as never,
    })).toThrow()
    expect(() => repo.createEndpointRevision({
      ...base,
      query: [{ name: 'region', value: 'hunter2' }] as never,
    })).toThrow()
  })
})
