import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
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
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200,
      headers: { get: () => null }, text: async () => JSON.stringify(rawResponse), body: null }))
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
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(new URL(fetchImpl.mock.calls[0][0] as string).searchParams.get('category')).toBe('programming')
      expect(result).toMatchObject({ ok: true, items: [{ modelId: 'google/gemini-image', displayName: 'Gemini Image',
        contextLength: 131072, maxOutputTokens: 8192, tokenizer: 'gemini', instructType: 'gemini',
        inputModalities: ['text', 'image'], outputModalities: ['text', 'image'],
        capabilities: { reasoning: true, tools: true, structuredOutputs: true, vision: true, longContext: true },
        pricing: { prompt: '0.000001', completion: '0.000002', image: '0.01' },
        hasPerRequestLimits: 1, hasDefaultParameters: 1, topProviderIsModerated: 1 }] })
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

  it('round-trips all four Gemini image model availability records without collapsing their capability seeds', async () => {
    const handlers = new Map<string, Handler>()
    const db = database()
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => null },
      text: async () => JSON.stringify({ models: [
        { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-lite-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3-pro-image', supportedGenerationMethods: ['generateContent'] },
      ] }), body: null }))
    try {
      registerGenerationV2ModelAvailabilityIpc({ registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler),
        credentialService: credentialService() as never, db, fetchImpl: fetchImpl as never })
      const sync = await handlers.get(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[0])?.({}, {
        providerKey: 'google_ai_studio', timeoutMs: 5_000,
      }) as any
      const listed = await handlers.get(GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[2])?.({}, {}) as any
      expect(sync).toMatchObject({ ok: true, status: 'synced' })
      const byId = new Map<string, any>(listed.models.map((model: any) => [model.nativeModelId, model] as const))
      expect(Array.from(byId.keys())).toEqual(expect.arrayContaining([
        'gemini-2.5-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image',
      ]))
      for (const id of ['gemini-2.5-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image']) {
        expect(byId.get(id)).toMatchObject({ providerKey: 'google_ai_studio', nativeModelId: id,
          capabilitySeed: { textChat: true, imageGeneration: true },
          providerSpecific: { imageGenerationPolicy: { modelFamily: id } } })
        expect(byId.get(id).providerSpecific.imageGenerationPolicy.supportedOutputModes)
          .toEqual(expect.arrayContaining(['image_only', 'image_and_text']))
      }
    } finally { db.close() }
  })
})
