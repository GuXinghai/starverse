import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { createOpenRouterImageEndpointSelectionV2Service } from './openRouterImageEndpointSelectionV2Service'

const intent = Object.freeze({ schemaVersion: 2, generation: { candidateCount: 1 }, reasoning: { mode: 'disabled' },
  web: { mode: 'disabled' }, image: { mode: 'generate' }, tools: { mode: 'disabled' }, attachments: [],
  providerExtension: { kind: 'none' } })
const descriptor = {
  id: 'google/gemini-3.1-flash-image',
  endpoints: [
    { provider_name: 'Vertex', provider_slug: 'google-vertex/global', provider_tag: 'google-vertex/global',
      supported_parameters: { n: { type: 'range', min: 1, max: 1 } }, allowed_passthrough_parameters: [], supports_streaming: false },
    { provider_name: 'AI Studio', provider_slug: 'google-ai-studio', provider_tag: 'google-ai-studio',
      supported_parameters: { n: { type: 'range', min: 1, max: 1 } }, allowed_passthrough_parameters: [], supports_streaming: false },
  ],
}

describe('OpenRouter Images endpoint selection V2 service', () => {
  it('requires a user choice for multiple candidates and persists the exact selected tag', async () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(descriptor), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    const credentialService = {
      getStatus: vi.fn(async () => ({ configured: true, revision: 1, credentialScopeId: 'credential-scope-v2:test' })),
      withCredential: vi.fn(async ({ consume }: { consume: (lease: unknown) => unknown }) => consume({
        credential: 'secret', assertCurrent: () => undefined,
      })),
    }
    try {
      const service = createOpenRouterImageEndpointSelectionV2Service({ db,
        credentialService: credentialService as never, fetchImpl, nowMs: () => 100 })
      const first = await service.read({ modelId: descriptor.id, semanticIntent: intent })
      expect(first.decision).toBe('selection_required')
      expect(first.candidates.map((item) => item.providerTag)).toEqual(['google-ai-studio', 'google-vertex/global'])
      const selected = await service.select({ modelId: descriptor.id, semanticIntent: intent,
        providerTag: 'google-vertex/global' })
      expect(selected.binding).toMatchObject({ providerTag: 'google-vertex/global', selectedBy: 'user' })
      expect(selected.candidates[0]).toMatchObject({ providerTag: 'google-vertex/global', bound: true })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    } finally { db.close() }
  })
})
