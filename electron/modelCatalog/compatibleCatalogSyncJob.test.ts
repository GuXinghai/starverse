import { describe, expect, it, vi } from 'vitest'
import type {
  CompatibleCatalogSyncState,
  CompatibleEndpointRevision,
} from '../../src/shared/provider/openai-chat-compatible'
import { buildCompatibleNetworkError } from '../../src/shared/network/compatibleNetworkError'
import { createCompatibleRequestRegistry } from '../net/compatibleRequestRegistry'
import { createCompatibleCatalogSyncService, runCompatibleCatalogStartupSync } from './compatibleCatalogSyncJob'

const endpoint = (providerInstanceId: string, credentialVersionRef: string): CompatibleEndpointRevision => ({
  endpointRevisionId: `ocp_endpoint_${providerInstanceId.endsWith('abcdefgh') ? 'abcdefgh' : '12345678'}`,
  providerInstanceId,
  revision: 2,
  baseUrl: `https://${providerInstanceId}.example/v1`,
  allowInsecureHttp: false,
  securityPolicy: 'compatibility_first',
  auth: { mode: 'bearer', credentialVersionRef },
  credentialVersionRef,
  ordinaryHeaders: [], sensitiveHeaderRefs: [], query: [],
  requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1,
  responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1,
  createdAtMs: 2,
} as unknown as CompatibleEndpointRevision)

function dependencies(input?: Readonly<{
  body?: unknown
  transportFailure?: boolean
  initialState?: CompatibleCatalogSyncState | null
  abortAtSequence?: boolean
}>) {
  let state = input?.initialState ?? null
  const replaced: any[] = []
  const requests = createCompatibleRequestRegistry()
  const endpoints = new Map([
    ['ocp_provider_12345678', endpoint('ocp_provider_12345678', 'ocp_credential_12345678')],
    ['ocp_provider_abcdefgh', endpoint('ocp_provider_abcdefgh', 'ocp_credential_abcdefgh')],
  ])
  const db = { call: vi.fn(async (method: string, params: any) => {
    if (method === 'compatibleProvider.get') return {
      providerInstanceId: params.providerInstanceId, protocolKey: 'openai_chat_compatible', displayName: 'Provider',
      status: 'active', createdAtMs: 1, updatedAtMs: 1, deletedAtMs: null,
    }
    if (method === 'compatibleCatalog.getSyncState') return state
    if (method === 'compatibleEndpoint.listRevisions') return [endpoints.get(params.providerInstanceId)]
    if (method === 'settings.getNetworkProxySettingsStrict') return { value: { proxyMode: 'direct', manualProxyUrl: '', noProxy: '', strictSSL: true } }
    if (method === 'compatibleCatalog.markSyncing') {
      state = {
        providerInstanceId: params.providerInstanceId, status: 'syncing', lastAttemptAtMs: params.attemptedAtMs,
        lastSuccessAtMs: state?.lastSuccessAtMs ?? null, lastSuccessSnapshotId: state?.lastSuccessSnapshotId ?? null,
        failureCount: state?.failureCount ?? 0, backoffUntilMs: null, diagnostics: null, updatedAtMs: params.attemptedAtMs,
      } as CompatibleCatalogSyncState
      return state
    }
    if (method === 'compatibleCatalog.getNextSnapshotSequence') {
      if (input?.abortAtSequence) requests.abortRequest('sync-1', 'user_abort')
      return 1
    }
    if (method === 'compatibleCatalog.applyRemoteSyncSuccess') {
      replaced.push(params)
      state = {
        providerInstanceId: params.snapshot.providerInstanceId,
        status: params.models.length === 0 ? 'empty_success' : 'success',
        lastAttemptAtMs: params.snapshot.observedAtMs, lastSuccessAtMs: params.snapshot.observedAtMs,
        lastSuccessSnapshotId: params.snapshot.snapshotId, failureCount: 0, backoffUntilMs: null,
        diagnostics: null, updatedAtMs: params.snapshot.observedAtMs,
      } as CompatibleCatalogSyncState
      return { snapshot: params.snapshot, syncState: state, models: params.models.map((model: any) => ({
        protocolKey: 'openai_chat_compatible', providerInstanceId: params.snapshot.providerInstanceId, modelId: model.modelId,
        metadata: model.metadata, availability: 'active', sourcePresence: { remote: 'active', manual: false },
      })) }
    }
    if (method === 'compatibleCatalog.recordSyncFailure') {
      state = {
        providerInstanceId: params.providerInstanceId, status: params.backoffUntilMs === null ? 'failed' : 'backoff',
        lastAttemptAtMs: params.attemptedAtMs, lastSuccessAtMs: state?.lastSuccessAtMs ?? null,
        lastSuccessSnapshotId: state?.lastSuccessSnapshotId ?? null, failureCount: (state?.failureCount ?? 0) + 1,
        backoffUntilMs: params.backoffUntilMs, diagnostics: params.diagnostics, updatedAtMs: params.attemptedAtMs,
      } as CompatibleCatalogSyncState
      return state
    }
    throw new Error(`unexpected ${method}`)
  }) }
  const credentials = { readForMain: vi.fn((ref: string) => ({ mode: 'bearer' as const, token: `token-for-${ref}` })) }
  const transport = { request: vi.fn(async (request: any) => {
    request.resolveCredential?.()
    if (input?.transportFailure) return {
      ok: false as const,
      error: buildCompatibleNetworkError({ code: 'compatible_strict_ssrf_unavailable', stage: 'connect' }),
    }
    return {
      ok: true as const,
      response: new Response(JSON.stringify(input?.body ?? { data: [{ id: 'model-a' }, { id: 'model-a' }, null] }), { status: 200 }),
      diagnostics: {
        securityPolicy: 'compatibility_first' as const, proxyRoute: 'direct' as const,
        transportKind: 'node_undici' as const, transportCapability: 'pre_request_audit_only' as const,
        proxyBypassed: false, redirectCount: 0, insecureHttp: false,
      },
    }
  }) }
  return { db, credentials, transport, requests, replaced }
}

describe('compatibleCatalogSyncJob', () => {
  it('uses the latest instance endpoint/credential, normalizes rows and writes one success snapshot', async () => {
    const deps = dependencies()
    const service = createCompatibleCatalogSyncService({ ...deps as any, nowMs: () => 10, randomSuffix: () => '12345678' })
    const result = await service.sync({ providerInstanceId: 'ocp_provider_12345678', requestId: 'sync-1', ownerWebContentsId: 7, force: true })
    expect(result).toMatchObject({
      ok: true, status: 'success', snapshotId: 'ocp_catalog_snapshot_12345678',
      sourceDiagnostics: { totalRows: 3, acceptedRows: 1, malformedRows: 1, duplicateRows: 1 },
    })
    expect(deps.transport.request).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: expect.objectContaining({ providerInstanceId: 'ocp_provider_12345678', revision: 2 }),
      operation: 'models',
    }))
    expect(deps.credentials.readForMain).toHaveBeenCalledWith('ocp_credential_12345678')
    expect(deps.replaced[0]).toMatchObject({ models: [{ modelId: 'model-a' }] })
    expect(JSON.stringify(result)).not.toContain('token-for')
  })

  it('records empty success distinctly and does not infer model capabilities', async () => {
    const deps = dependencies({ body: { data: [] } })
    const service = createCompatibleCatalogSyncService({ ...deps as any, nowMs: () => 10, randomSuffix: () => '12345678' })
    const result = await service.sync({ providerInstanceId: 'ocp_provider_12345678', requestId: 'sync-1', ownerWebContentsId: 7, force: true })
    expect(result).toMatchObject({ ok: true, status: 'empty_success', models: [] })
    expect(deps.replaced[0]).toMatchObject({ models: [] })
  })

  it('rejects an all-malformed non-empty response without staling the current catalog', async () => {
    const deps = dependencies({ body: { data: [null, {}, { id: '' }] } })
    const service = createCompatibleCatalogSyncService({ ...deps as any, nowMs: () => 10, randomSuffix: () => '12345678' })
    await expect(service.sync({ providerInstanceId: 'ocp_provider_12345678', requestId: 'sync-1', ownerWebContentsId: 7, force: true }))
      .resolves.toMatchObject({
        ok: false,
        error: { code: 'compatible_catalog_sync_failed' },
        syncState: { status: 'failed', diagnostics: { code: 'compatible_catalog_all_rows_invalid' } },
      })
    expect(deps.replaced).toEqual([])
  })

  it('honors abort after response parsing and before the atomic catalog commit', async () => {
    const deps = dependencies({ abortAtSequence: true })
    const service = createCompatibleCatalogSyncService({ ...deps as any, nowMs: () => 10, randomSuffix: () => '12345678' })
    await expect(service.sync({ providerInstanceId: 'ocp_provider_12345678', requestId: 'sync-1', ownerWebContentsId: 7, force: true }))
      .resolves.toMatchObject({ ok: false, error: { code: 'compatible_aborted' } })
    expect(deps.replaced).toEqual([])
  })

  it('preserves instance identity across different endpoint credentials', async () => {
    const deps = dependencies()
    const service = createCompatibleCatalogSyncService({ ...deps as any, nowMs: () => 10, randomSuffix: () => '12345678' })
    await service.sync({ providerInstanceId: 'ocp_provider_abcdefgh', requestId: 'sync-b', ownerWebContentsId: 7, force: true })
    expect(deps.transport.request).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: expect.objectContaining({ providerInstanceId: 'ocp_provider_abcdefgh' }),
    }))
    expect(deps.credentials.readForMain).toHaveBeenCalledWith('ocp_credential_abcdefgh')
  })

  it('records a typed strict-policy failure without writing a snapshot', async () => {
    const deps = dependencies({ transportFailure: true })
    const service = createCompatibleCatalogSyncService({ ...deps as any, nowMs: () => 10, randomSuffix: () => '12345678' })
    const result = await service.sync({ providerInstanceId: 'ocp_provider_12345678', requestId: 'sync-1', ownerWebContentsId: 7, force: true })
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'compatible_strict_ssrf_unavailable' },
      syncState: { status: 'failed', diagnostics: { code: 'compatible_strict_ssrf_unavailable' } },
    })
    expect(deps.replaced).toEqual([])
  })

  it('honors stored backoff unless manual refresh explicitly forces a new attempt', async () => {
    const initialState = {
      providerInstanceId: 'ocp_provider_12345678', status: 'backoff', lastAttemptAtMs: 1, lastSuccessAtMs: null,
      lastSuccessSnapshotId: null, failureCount: 1, backoffUntilMs: 100, diagnostics: null, updatedAtMs: 1,
    } as CompatibleCatalogSyncState
    const deps = dependencies({ initialState })
    const service = createCompatibleCatalogSyncService({ ...deps as any, nowMs: () => 10, randomSuffix: () => '12345678' })
    await expect(service.sync({ providerInstanceId: 'ocp_provider_12345678', requestId: 'sync-1', ownerWebContentsId: 7, force: false }))
      .resolves.toMatchObject({ ok: false, error: { code: 'compatible_catalog_sync_failed' }, syncState: { status: 'backoff' } })
    expect(deps.transport.request).not.toHaveBeenCalled()
    await expect(service.sync({ providerInstanceId: 'ocp_provider_12345678', requestId: 'sync-2', ownerWebContentsId: 7, force: true }))
      .resolves.toMatchObject({ ok: true })
  })

  it('bounds startup sync and skips fresh, disabled and active-backoff providers', async () => {
    const providers = [
      { providerInstanceId: 'ocp_provider_11111111', status: 'active' },
      { providerInstanceId: 'ocp_provider_22222222', status: 'active' },
      { providerInstanceId: 'ocp_provider_33333333', status: 'active' },
      { providerInstanceId: 'ocp_provider_44444444', status: 'active' },
      { providerInstanceId: 'ocp_provider_55555555', status: 'disabled' },
    ]
    const db = { call: vi.fn(async (method: string, params: any) => {
      if (method === 'compatibleProvider.list') return providers
      if (method === 'compatibleCatalog.getSyncState') {
        if (params.providerInstanceId.endsWith('11111111')) return { status: 'success', lastSuccessAtMs: 95_000, backoffUntilMs: null }
        if (params.providerInstanceId.endsWith('22222222')) return { status: 'backoff', lastSuccessAtMs: null, backoffUntilMs: 200_000 }
        return null
      }
      throw new Error('unexpected')
    }) }
    const sync = vi.fn(async (input) => ({ ok: !input.providerInstanceId.endsWith('44444444') }))
    const summary = await runCompatibleCatalogStartupSync({
      db: db as any,
      service: { sync } as any,
      nowMs: () => 100_000,
      freshnessMs: 60_000,
      maxProviders: 2,
      randomSuffix: () => '12345678',
    })
    expect(summary).toEqual({ considered: 5, attempted: 2, succeeded: 1, failed: 1 })
    expect(sync.mock.calls.map(([call]) => call.providerInstanceId)).toEqual(['ocp_provider_33333333', 'ocp_provider_44444444'])
    expect(sync.mock.calls.every(([call]) => call.ownerWebContentsId === 2_147_483_647 && call.force === false)).toBe(true)
  })
})
