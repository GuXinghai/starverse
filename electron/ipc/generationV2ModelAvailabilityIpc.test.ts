import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { CanonicalModelFactSourceV1Repo } from '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import { canonicalProviderNativeSourceScopeIdV1 } from
  '../../infra/db/services/canonicalModelFactSourceIngestionV1Service'
import { GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS, GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS,
  registerGenerationV2ModelAvailabilityIpc } from './generationV2ModelAvailabilityIpc'

type Handler = (event: unknown, payload: unknown) => Promise<unknown>

function credentialService() {
  return {
    getStatus: vi.fn(async () => ({ configured: true, credentialScopeId: 'scope:test', revision: 1 })),
    withCredential: vi.fn(async ({ consume }: { consume: (lease: { credential: string }) => Promise<unknown> }) =>
      consume({ credential: 'secret-not-renderer-visible' })),
  }
}

function database() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

function openRouterRawModel(id: string, name: string) {
  return {
    id,
    name,
    canonical_slug: id,
    context_length: 8192,
    created: 1_700_000_000,
    supported_parameters: [],
    architecture: {
      modality: 'text->text',
      input_modalities: ['text'],
      output_modalities: ['text'],
      tokenizer: 'other',
      instruct_type: null,
    },
    top_provider: { max_completion_tokens: 4096, context_length: 8192, is_moderated: false },
    pricing: { prompt: '0', completion: '0' },
  }
}

describe('generationV2ModelAvailabilityIpc', () => {
  it('pins OpenRouter category on the official models request and preserves the rich catalog projection', async () => {
    const handlers = new Map<string, Handler>()
    const rawResponse = { total_count: 1, future_top_level_field: { retained: true }, data: [{
      id: 'google/gemini-image', name: 'Gemini Image', canonical_slug: 'google/gemini-image',
      description: 'Image generation model', context_length: 131072, created: 1_700_000_000,
      supported_parameters: ['reasoning', 'tools', 'response_format'],
      architecture: { modality: 'text+image->text+image', input_modalities: ['text', 'image'],
        output_modalities: ['text', 'image'], tokenizer: 'gemini', instruct_type: 'gemini' },
      top_provider: { max_completion_tokens: 8192, context_length: 131072, is_moderated: true },
      pricing: { prompt: '0.000001', completion: '0.000002', image: '0.01' },
      per_request_limits: { max_images: 1 }, default_parameters: { temperature: 0.2 },
    }] }
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes('/providers') ? { data: [] } : rawResponse,
    ), { status: 200, headers: { 'content-type': 'application/json' } }))
    const db = database()
    try {
      registerGenerationV2ModelAvailabilityIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler),
        credentialService: credentialService() as never, db, fetchImpl: fetchImpl as never,
      })

      const sync = await handlers.get(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[0])?.({}, {
        providerKey: 'openrouter', timeoutMs: 5_000, category: 'programming',
      }) as any
      const result = await handlers.get(GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[4])?.({}, {
        category: 'programming',
      }) as any

      expect(sync).toMatchObject({ ok: true, status: 'synced' })
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      const modelCall = fetchImpl.mock.calls.find(([url]) => String(url).includes('/models/user'))
      expect(new URL(modelCall?.[0] as string).searchParams.get('category')).toBe('programming')
      expect(result).toMatchObject({ ok: true, items: [{ modelId: 'google/gemini-image', displayName: 'Gemini Image',
        contextLength: 131072, maxOutputTokens: 8192, tokenizer: 'gemini', instructType: 'gemini',
        inputModalities: ['text', 'image'], outputModalities: ['text', 'image'],
        capabilities: { reasoning: true, tools: true, structuredOutputs: true, vision: true, longContext: true },
        pricing: { prompt: '0.000001', completion: '0.000002', image: '0.01' },
        hasPerRequestLimits: true, hasDefaultParameters: true, topProviderIsModerated: true }] })
      const factRepo = new CanonicalModelFactSourceV1Repo(db)
      const sourceScopeId = canonicalProviderNativeSourceScopeIdV1({ providerAuthorityId: 'openrouter',
        providerNativeSurfaceId: 'openrouter-chat-models-v1', endpointProfileId: 'openrouter-first-party-v1',
        credentialScopeId: 'scope:test', credentialRevision: 1, catalogCategory: 'programming' })
      const current = factRepo.readSourceState('provider_native', sourceScopeId)
      expect(current?.currentSourceRevision).toMatch(/^canonical-source-v1:/u)
      const storedSource = factRepo.readSourceRevision(current!.currentSourceRevision!)
      expect(storedSource?.rawSnapshot.rawEnvelopeRefs).toHaveLength(1)
      expect(factRepo.readRawPayload(storedSource!.rawSnapshot.rawEnvelopeRefs[0]!)).toEqual(rawResponse)
      expect(factRepo.readSubjectFact({ canonicalSourceRevision: current!.currentSourceRevision!,
        subject: { providerAuthorityId: 'openrouter', endpointProfileId: 'openrouter-first-party-v1',
          nativeModelId: 'google/gemini-image' } })?.payload.outcomes).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'limits.contextWindow.maxTokens' }),
        expect.objectContaining({ path: 'modalities.input' }),
      ]))
      expect(JSON.stringify(result)).not.toContain('secret-not-renderer-visible')
    } finally { db.close() }
  })

  it('rejects the OpenRouter-only category field on other provider model-list contracts', async () => {
    const handlers = new Map<string, Handler>()
    const credentials = credentialService()
    const db = database()
    try {
      registerGenerationV2ModelAvailabilityIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler),
        credentialService: credentials as never, db, fetchImpl: vi.fn() as never,
      })
      const result = await handlers.get(GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[0])?.({}, { category: 'programming' }) as any
      expect(result).toMatchObject({ ok: false, code: 'invalid_payload' })
      expect(credentials.withCredential).not.toHaveBeenCalled()
    } finally { db.close() }
  })

  it('does not let canonical fact publication failure block a valid Provider Catalog sync', async () => {
    const handlers = new Map<string, Handler>()
    let tooDeep: Record<string, unknown> = { retained: true }
    for (let index = 0; index < 70; index += 1) tooDeep = { nested: tooDeep }
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes('/providers') ? { data: [] } : {
        data: [openRouterRawModel('openai/catalog-survives', 'Catalog Survives')], future: tooDeep,
      },
    ), { status: 200, headers: { 'content-type': 'application/json' } }))
    const db = database()
    try {
      registerGenerationV2ModelAvailabilityIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler),
        credentialService: credentialService() as never, db, fetchImpl: fetchImpl as never,
      })
      const sync = await handlers.get(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[0])?.({}, {
        providerKey: 'openrouter', timeoutMs: 5_000,
      }) as any
      expect(sync).toMatchObject({ ok: true, status: 'synced',
        items: [{ modelId: 'openai/catalog-survives' }] })

      const facts = new CanonicalModelFactSourceV1Repo(db)
      const scope = canonicalProviderNativeSourceScopeIdV1({ providerAuthorityId: 'openrouter',
        providerNativeSurfaceId: 'openrouter-chat-models-v1', endpointProfileId: 'openrouter-first-party-v1',
        credentialScopeId: 'scope:test', credentialRevision: 1 })
      expect(facts.readSourceState('provider_native', scope)).toMatchObject({
        currentSourceRevision: null, staleReason: 'CANONICAL_MODEL_FACT_PUBLICATION_FAILED',
      })
    } finally { db.close() }
  })

  it('keeps a manual sync pending until the selected snapshot is explicitly applied', async () => {
    const handlers = new Map<string, Handler>()
    const db = database()
    const modelPayloads = [openRouterRawModel('openai/active', 'Active'), openRouterRawModel('openai/pending', 'Pending')]
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify({
      data: url.includes('/providers') ? [] : [modelPayloads.shift()],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    try {
      registerGenerationV2ModelAvailabilityIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler),
        credentialService: credentialService() as never,
        db,
        fetchImpl: fetchImpl as never,
      })
      const sync = handlers.get(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[0])!
      const apply = handlers.get(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[4])!
      const list = handlers.get(GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[4])!

      expect(await sync({}, { providerKey: 'openrouter', timeoutMs: 5_000 }))
        .toMatchObject({ ok: true, status: 'synced', items: [{ modelId: 'openai/active' }] })
      const pending = await sync({}, { providerKey: 'openrouter', timeoutMs: 5_000, applyMode: 'manual' }) as any
      expect(pending).toMatchObject({ ok: true, status: 'pending', modelCount: 1 })
      expect(await list({}, {})).toMatchObject({
        ok: true,
        items: [{ modelId: 'openai/active' }],
        pendingSnapshotDigest: pending.pendingSnapshotDigest,
      })

      expect(await apply({}, {
        providerKey: 'openrouter',
        snapshotDigest: pending.pendingSnapshotDigest,
      })).toMatchObject({ ok: true, status: 'synced', items: [{ modelId: 'openai/pending' }] })
      expect(await list({}, {})).toMatchObject({
        ok: true,
        items: [{ modelId: 'openai/pending' }],
        pendingSnapshotDigest: null,
      })
    } finally {
      db.close()
    }
  })

  it('keeps the active snapshot and returns the original provider failure after a refresh fails', async () => {
    const handlers = new Map<string, Handler>()
    const db = database()
    let modelRequest = 0
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/providers')) return new Response(JSON.stringify({ data: [] }), { status: 200 })
      modelRequest += 1
      if (modelRequest === 1) return new Response(JSON.stringify({ data: [openRouterRawModel('openai/lkg', 'LKG Model')] }), { status: 200 })
      return new Response(JSON.stringify({
          error: {
            code: 'rate_limit_exceeded',
            type: 'provider_error',
            message: 'Please retry later.',
          },
        }), { status: 429, statusText: 'Too Many Requests', headers: { 'retry-after': '30', 'x-request-id': 'req_catalog_1' } })
    })
    try {
      registerGenerationV2ModelAvailabilityIpc({
        registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler),
        credentialService: credentialService() as never,
        db,
        fetchImpl: fetchImpl as never,
      })
      const syncHandler = handlers.get(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[0])!
      const listHandler = handlers.get(GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[4])!

      expect(await syncHandler({}, { providerKey: 'openrouter', timeoutMs: 5_000 }))
        .toMatchObject({ ok: true, status: 'synced', modelCount: 1 })

      const failed = await syncHandler({}, { providerKey: 'openrouter', timeoutMs: 5_000 }) as any
      const listed = await listHandler({}, {}) as any

      expect(failed).toMatchObject({
        ok: false,
        active: {
          ok: true,
          status: 'failed',
          modelCount: 1,
          errorMessage: expect.stringContaining('Please retry later.'),
          providerFailure: {
            httpStatus: 429,
            providerError: {
              code: 'rate_limit_exceeded',
              message: 'Please retry later.',
              requestId: 'req_catalog_1',
              retryAfterMs: 30_000,
            },
          },
        },
      })
      expect(listed).toMatchObject({
        ok: true,
        status: 'failed',
        errorMessage: expect.stringContaining('Please retry later.'),
        items: [{ modelId: 'openai/lkg' }],
        providerFailure: {
          httpStatus: 429,
          providerError: { code: 'rate_limit_exceeded', message: 'Please retry later.' },
        },
      })
      const factScope = canonicalProviderNativeSourceScopeIdV1({ providerAuthorityId: 'openrouter',
        providerNativeSurfaceId: 'openrouter-chat-models-v1', endpointProfileId: 'openrouter-first-party-v1',
        credentialScopeId: 'scope:test', credentialRevision: 1 })
      expect(new CanonicalModelFactSourceV1Repo(db).readSourceState('provider_native', factScope))
        .toMatchObject({ staleReason: failed.providerFailure.starverseDiagnosticCode })
    } finally {
      db.close()
    }
  })

  it('keeps all six observed Gemini image models raw while resolving the reviewed image matrix separately', async () => {
    const handlers = new Map<string, Handler>()
    const db = database()
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => null },
      text: async () => JSON.stringify({ models: [
        { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-lite-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-image-preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3-pro-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3-pro-image-preview', supportedGenerationMethods: ['generateContent'] },
      ] }), body: null }))
    try {
      registerGenerationV2ModelAvailabilityIpc({ registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler),
        credentialService: credentialService() as never, db, fetchImpl: fetchImpl as never })
      const sync = await handlers.get(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[0])?.({}, {
        providerKey: 'google_ai_studio', timeoutMs: 5_000,
      }) as any
      const listed = await handlers.get(GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[2])?.({}, {}) as any
      expect(sync).toMatchObject({ ok: true, status: 'synced' })
      const byId = new Map<string, any>(listed.items.map((model: any) => [model.modelId, model] as const))
      expect(Array.from(byId.keys())).toEqual(expect.arrayContaining([
        'gemini-2.5-flash-image', 'gemini-3.1-flash-lite-image',
        'gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview',
        'gemini-3-pro-image', 'gemini-3-pro-image-preview',
      ]))
      const expectedIds = [
        'gemini-2.5-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image',
        'gemini-3.1-flash-image-preview', 'gemini-3-pro-image', 'gemini-3-pro-image-preview',
      ]
      for (const id of expectedIds) {
        expect(byId.get(id)).toMatchObject({ providerKey: 'google_ai_studio', modelId: id })
        const payload = byId.get(id).raw.buckets[0].payload
        expect(payload.observation.rawProviderRecord.name).toBe(`models/${id}`)
        expect(payload.providerSpecific?.imageGenerationPolicy).toBeUndefined()
      }
    } finally { db.close() }
  })
})
