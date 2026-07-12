import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DbWorkerRuntime } from './worker'

function bundle(providerSuffix: string, profileSuffix = providerSuffix) {
  const providerInstanceId = `ocp_provider_${providerSuffix}`
  const requestProfileId = `ocp_request_profile_${profileSuffix}`
  const reasoningMappingId = `ocp_reasoning_mapping_${profileSuffix}`
  const inlinePolicyId = `ocp_inline_policy_${profileSuffix}`
  const responseProfileId = `ocp_response_profile_${profileSuffix}`
  return {
    provider: { providerInstanceId, displayName: `Provider ${providerSuffix}`, createdAtMs: 1 },
    credential: null,
    requestProfile: {
      requestProfileId,
      version: 1,
      config: {
        schemaVersion: 1,
        standardFieldOwnership: 'builder',
        unsupportedFieldPolicy: 'error_before_fetch',
        extraBody: { enabled: true, maxDepth: 8, maxKeys: 256, maxBytes: 65536 },
      },
      createdAtMs: 1,
    },
    reasoningMapping: {
      mappingId: reasoningMappingId,
      version: 1,
      config: { schemaVersion: 1, mode: 'custom_preferred_with_builtin_fallback', rules: [], replay: { format: 'disabled', scope: 'never' } },
      createdAtMs: 1,
    },
    inlinePolicy: {
      inlinePolicyId,
      version: 1,
      config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] },
      createdAtMs: 1,
    },
    responseProfile: {
      responseProfileId,
      version: 1,
      reasoningMappingId,
      reasoningMappingVersion: 1,
      inlinePolicyId,
      inlinePolicyVersion: 1,
      config: {
        schemaVersion: 1,
        choicePolicy: 'preserve_all',
        unknownFieldPolicy: 'bounded_diagnostics',
        reasoningMapping: { mappingId: reasoningMappingId, version: 1 },
        inlinePolicy: { inlinePolicyId, version: 1 },
      },
      createdAtMs: 1,
    },
    endpoint: {
      endpointRevisionId: `ocp_endpoint_${providerSuffix}`,
      providerInstanceId,
      revision: 1,
      baseUrl: 'https://api.example.test/v1',
      allowInsecureHttp: false,
      securityPolicy: 'compatibility_first',
      auth: { mode: 'none' },
      credentialVersionRef: null,
      ordinaryHeaders: [],
      sensitiveHeaderRefs: [],
      query: [],
      requestProfileId,
      requestProfileVersion: 1,
      responseProfileId,
      responseProfileVersion: 1,
      createdAtMs: 1,
    },
  }
}

function revisionBundle(version: number) {
  const value = bundle('12345678')
  value.requestProfile.version = version
  value.reasoningMapping.version = version
  value.inlinePolicy.version = version
  value.responseProfile.version = version
  value.responseProfile.reasoningMappingVersion = version
  value.responseProfile.inlinePolicyVersion = version
  value.responseProfile.config.reasoningMapping.version = version
  value.responseProfile.config.inlinePolicy.version = version
  return value
}

describe('DbWorkerRuntime compatible registry transactions', () => {
  it('atomically creates a fresh provider graph, rolls back conflicts and rotates credentials', async () => {
    const runtime = new DbWorkerRuntime({
      dbPath: ':memory:',
      schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'),
    })
    try {
      const first = await runtime.handleMessage({ id: 'create-first', method: 'compatibleRegistry.create', params: bundle('12345678') })
      expect(first.ok, JSON.stringify(first)).toBe(true)
      expect(first).toMatchObject({ ok: true, result: { provider: { providerInstanceId: 'ocp_provider_12345678' } } })

      const lateMapping = await runtime.handleMessage({
        id: 'late-mapping',
        method: 'compatibleProfile.createRequestMapping',
        params: {
          mappingId: 'ocp_request_mapping_12345678',
          version: 1,
          requestProfileId: 'ocp_request_profile_12345678',
          requestProfileVersion: 1,
          targetPath: ['reasoning', 'effort'],
          config: {
            schemaVersion: 1,
            mappingId: 'ocp_request_mapping_12345678',
            requestProfileId: 'ocp_request_profile_12345678',
            requestProfileVersion: 1,
            sourceField: 'reasoning_effort',
            targetPath: ['reasoning', 'effort'],
            valueKind: 'string',
            valueMapping: { low: 'low', high: 'high' },
            omission: 'omit_when_unset',
          },
          createdAtMs: 2,
        },
      })
      expect(lateMapping.ok).toBe(false)
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM compatible_request_field_mappings`).get()).toEqual({ count: 0 })

      const conflict = await runtime.handleMessage({
        id: 'create-conflict',
        method: 'compatibleRegistry.create',
        params: bundle('87654321', '12345678'),
      })
      expect(conflict.ok).toBe(false)
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM compatible_provider_instances`).get()).toEqual({ count: 1 })
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM compatible_endpoint_revisions`).get()).toEqual({ count: 1 })

      const rotated = await runtime.handleMessage({
        id: 'rotate-first',
        method: 'compatibleRegistry.rotateCredential',
        params: {
          providerInstanceId: 'ocp_provider_12345678',
          credential: {
            credentialVersionRef: 'ocp_credential_12345678',
            providerInstanceId: 'ocp_provider_12345678',
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
          },
          endpointRevisionId: 'ocp_endpoint_abcdefgh',
          auth: { mode: 'bearer', credentialVersionRef: 'ocp_credential_12345678' },
          sensitiveHeaderRefs: [],
          createdAtMs: 2,
        },
      })
      expect(rotated).toMatchObject({
        ok: true,
        result: {
          credential: { version: 1 },
          endpoint: { revision: 2, credentialVersionRef: 'ocp_credential_12345678' },
        },
      })
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM compatible_endpoint_revisions`).get()).toEqual({ count: 2 })

      const revision = revisionBundle(2)
      const revised = await runtime.handleMessage({
        id: 'revise-first',
        method: 'compatibleRegistry.reviseConfiguration',
        params: {
          providerInstanceId: 'ocp_provider_12345678',
          endpointRevisionId: 'ocp_endpoint_profile2a',
          requestProfile: revision.requestProfile,
          requestMappings: [],
          reasoningMapping: revision.reasoningMapping,
          inlinePolicy: revision.inlinePolicy,
          responseProfile: revision.responseProfile,
          createdAtMs: 3,
        },
      })
      expect(revised).toMatchObject({ ok: true, result: { revision: 3, requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 2 } })
      expect(runtime.db.prepare(`SELECT revision, request_profile_id, request_profile_version FROM compatible_endpoint_revisions ORDER BY revision`).all()).toEqual([
        { revision: 1, request_profile_id: 'ocp_request_profile_12345678', request_profile_version: 1 },
        { revision: 2, request_profile_id: 'ocp_request_profile_12345678', request_profile_version: 1 },
        { revision: 3, request_profile_id: 'ocp_request_profile_12345678', request_profile_version: 2 },
      ])

      expect((await runtime.handleMessage({ id: 'discover', method: 'compatibleDiagnostics.upsertDiscoveredField', params: {
        providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678', profileVersion: 2,
        streamPath: 'choices.*.delta.thought_process', state: 'candidate',
        aggregate: { schemaVersion: 1, observedShapes: ['string'], redactedPreview: null, sampleCount: 2 },
        occurrenceCount: 2, firstObservedAtMs: 3, lastObservedAtMs: 3,
      } })).ok).toBe(true)
      const accepted = revisionBundle(3)
      const mismatchedAccept = await runtime.handleMessage({ id: 'accept-discovery-mismatch', method: 'compatibleRegistry.reviseConfiguration', params: {
        providerInstanceId: 'ocp_provider_12345678', endpointRevisionId: 'ocp_endpoint_badaccept',
        requestProfile: accepted.requestProfile, requestMappings: [], reasoningMapping: accepted.reasoningMapping,
        inlinePolicy: accepted.inlinePolicy, responseProfile: accepted.responseProfile,
        acceptedDiscoveryPaths: ['choices.*.delta.thought_process'], createdAtMs: 4,
      } })
      expect(mismatchedAccept.ok).toBe(false)
      expect(runtime.db.prepare(`SELECT state FROM compatible_discovered_fields WHERE stream_path = ?`).get('choices.*.delta.thought_process')).toEqual({ state: 'candidate' })
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM compatible_request_profiles WHERE version = 3`).get()).toEqual({ count: 0 })
      ;(accepted.reasoningMapping.config as any).rules = [{ stream: { path: 'choices.*.delta.thought_process', mode: 'append' }, semantic: 'text' }]
      const acceptedResult = await runtime.handleMessage({ id: 'accept-discovery', method: 'compatibleRegistry.reviseConfiguration', params: {
        providerInstanceId: 'ocp_provider_12345678', endpointRevisionId: 'ocp_endpoint_profile3a',
        requestProfile: accepted.requestProfile, requestMappings: [], reasoningMapping: accepted.reasoningMapping,
        inlinePolicy: accepted.inlinePolicy, responseProfile: accepted.responseProfile,
        acceptedDiscoveryPaths: ['choices.*.delta.thought_process'], createdAtMs: 4,
      } })
      expect(acceptedResult).toMatchObject({ ok: true, result: { revision: 4, responseProfileVersion: 3 } })
      expect(runtime.db.prepare(`SELECT state FROM compatible_discovered_fields WHERE stream_path = ?`).get('choices.*.delta.thought_process')).toEqual({ state: 'confirmed' })

      const conflicting = revisionBundle(4)
      conflicting.reasoningMapping = accepted.reasoningMapping
      const rejected = await runtime.handleMessage({
        id: 'revise-conflict',
        method: 'compatibleRegistry.reviseConfiguration',
        params: {
          providerInstanceId: 'ocp_provider_12345678', endpointRevisionId: 'ocp_endpoint_profile4a',
          requestProfile: conflicting.requestProfile, requestMappings: [], reasoningMapping: conflicting.reasoningMapping,
          inlinePolicy: conflicting.inlinePolicy, responseProfile: conflicting.responseProfile, createdAtMs: 5,
        },
      })
      expect(rejected.ok).toBe(false)
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM compatible_request_profiles WHERE request_profile_id = ? AND version = 4`).get('ocp_request_profile_12345678')).toEqual({ count: 0 })
      expect(runtime.db.prepare(`SELECT COUNT(*) AS count FROM compatible_endpoint_revisions`).get()).toEqual({ count: 4 })
    } finally {
      runtime.shutdown()
    }
  })

  it('atomically clears endpoint authentication and tombstones its credential descriptor', async () => {
    const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve(process.cwd(), 'infra', 'db', 'schema.sql') })
    try {
      const graph = bundle('clearauth')
      graph.credential = {
        credentialVersionRef: 'ocp_credential_clearauth', providerInstanceId: 'ocp_provider_clearauth', version: 1,
        authMode: 'bearer', backend: 'electron_safe_storage',
        maskedSummary: { schemaVersion: 1, authMode: 'bearer', configured: true, maskState: 'configured_masked', sensitiveHeaderNames: [] },
        createdAtMs: 1,
      } as any
      graph.endpoint.auth = { mode: 'bearer', credentialVersionRef: 'ocp_credential_clearauth' } as any
      graph.endpoint.credentialVersionRef = 'ocp_credential_clearauth' as any
      expect((await runtime.handleMessage({ id: 'create-auth', method: 'compatibleRegistry.create', params: graph })).ok).toBe(true)
      const cleared = await runtime.handleMessage({ id: 'clear-auth', method: 'compatibleRegistry.updateEndpoint', params: {
        providerInstanceId: 'ocp_provider_clearauth', endpointRevisionId: 'ocp_endpoint_clearrev2',
        baseUrl: graph.endpoint.baseUrl, allowInsecureHttp: false, securityPolicy: 'compatibility_first', ordinaryHeaders: [], query: [],
        clearAuthentication: true, createdAtMs: 2,
      } })
      expect(cleared).toMatchObject({ ok: true, result: { revision: 2, auth: { mode: 'none' }, credentialVersionRef: null } })
      expect(runtime.db.prepare(`SELECT deleted_at_ms FROM compatible_credential_descriptors WHERE credential_version_ref = ?`).get('ocp_credential_clearauth')).toEqual({ deleted_at_ms: 2 })
    } finally { runtime.shutdown() }
  })
})
