import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS, GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS,
  registerGenerationV2ModelAvailabilityIpc } from './generationV2ModelAvailabilityIpc'
import { resolveModelCapabilitiesV2 } from '../../src/next/modelCatalog/modelCapabilityResolverV2'
import type { CatalogProviderModelObservationV2 } from '../../src/shared/modelCatalog/providerModelObservationV2'

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
    const rawResponse = { data: [{
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
      const byId = new Map<string, any>(listed.models.map((model: any) => [model.modelId, model] as const))
      expect(Array.from(byId.keys())).toEqual(expect.arrayContaining([
        'gemini-2.5-flash-image', 'gemini-3.1-flash-lite-image',
        'gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview',
        'gemini-3-pro-image', 'gemini-3-pro-image-preview',
      ]))
      const expectedFamily = new Map([
        ['gemini-2.5-flash-image', 'gemini-2.5-flash-image'],
        ['gemini-3.1-flash-lite-image', 'gemini-3.1-flash-lite-image'],
        ['gemini-3.1-flash-image', 'gemini-3.1-flash-image'],
        ['gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image'],
        ['gemini-3-pro-image', 'gemini-3-pro-image'],
        ['gemini-3-pro-image-preview', 'gemini-3-pro-image'],
      ])
      for (const [id, family] of expectedFamily) {
        expect(byId.get(id)).toMatchObject({ providerKey: 'google_ai_studio', modelId: id })
        const payload = byId.get(id).raw.buckets[0].payload
        expect(payload.observation.rawProviderRecord.name).toBe(`models/${id}`)
        expect(payload.providerSpecific?.imageGenerationPolicy).toBeUndefined()
        const resolved = resolveModelCapabilitiesV2(payload.observation as CatalogProviderModelObservationV2)
        expect(resolved.providerSpecific).toMatchObject({
          kind: 'gemini_image_generation', source: 'verified_contract',
          protocolContractId: 'gemini-interactions-v1beta', policy: { modelFamily: family },
        })
        expect(resolved.providerSpecific?.kind === 'gemini_image_generation' &&
          resolved.providerSpecific.policy.supportedOutputModes)
          .toEqual(expect.arrayContaining(['image_only', 'image_and_text']))
      }
    } finally { db.close() }
  })
})
