import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnthropicCatalogSource } from '../../../src/shared/modelCatalog/providers/anthropic/anthropicCatalogSource'
import { createDeepSeekCatalogSource } from '../../../src/shared/modelCatalog/providers/deepseek/deepSeekCatalogSource'
import { createGoogleAIStudioCatalogSource } from '../../../src/shared/modelCatalog/providers/google/googleAIStudioCatalogSource'
import { createOpenAIResponsesCatalogSource } from '../../../src/shared/modelCatalog/providers/openai/openAIResponsesCatalogSource'
import { createOpenRouterCatalogSource } from '../../../src/shared/modelCatalog/providers/openrouter/openRouterCatalogSource'
import type { ProviderCatalogSource } from '../../../src/shared/modelCatalog/providerCatalogContracts'
import { catalogItemsContentDigestV2 } from './catalogSnapshotDigestV2'

const json = (payload: unknown) => new Response(JSON.stringify(payload), {
  status: 200, headers: { 'content-type': 'application/json' },
})

type Case = Readonly<{
  name: string
  providerKey: string
  baseUrl: string
  source: (fetchImpl: typeof fetch) => ProviderCatalogSource
  respond: (url: string, variant: 'a' | 'b') => Response
}>

// One payload per provider, plus a variant that differs in content, so the test can tell "same models fetched
// later" apart from "different models".
const CASES: readonly Case[] = [
  {
    name: 'anthropic', providerKey: 'anthropic_messages', baseUrl: 'https://api.anthropic.com/v1/',
    source: () => createAnthropicCatalogSource(),
    respond: (_url, variant) => json({ has_more: false, data: [{ type: 'model', id: variant === 'a' ? 'claude-a' : 'claude-b',
      display_name: 'Claude', created_at: '2026-01-01T00:00:00Z', max_input_tokens: 200000, max_tokens: 64000,
      capabilities: { vision: true, tool_use: true, extended_thinking: true } }] }),
  },
  {
    name: 'deepseek', providerKey: 'deepseek', baseUrl: 'https://api.deepseek.com/',
    source: () => createDeepSeekCatalogSource(),
    respond: (_url, variant) => json({ object: 'list', data: [{ object: 'model', id: variant === 'a' ? 'ds-a' : 'ds-b', owned_by: 'deepseek' }] }),
  },
  {
    name: 'google', providerKey: 'google_ai_studio', baseUrl: 'https://generativelanguage.googleapis.com/',
    source: () => createGoogleAIStudioCatalogSource(),
    respond: (_url, variant) => json({ models: [{ name: `models/gemini-${variant}`, displayName: 'Gemini',
      supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1000, outputTokenLimit: 100 }] }),
  },
  {
    name: 'openai', providerKey: 'openai_responses', baseUrl: 'https://api.openai.com/v1/',
    source: () => createOpenAIResponsesCatalogSource(),
    respond: (_url, variant) => json({ object: 'list', data: [{ object: 'model', id: variant === 'a' ? 'gpt-a' : 'gpt-b', owned_by: 'openai', created: 1710000000 }] }),
  },
  {
    name: 'openrouter', providerKey: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1',
    source: (fetchImpl) => createOpenRouterCatalogSource({ fetchImpl, enableCountProbe: false }),
    respond: (url, variant) => url.endsWith('/providers')
      ? json({ data: [{ slug: 'openai', name: 'OpenAI' }] })
      : json({ data: [{ id: `openai/gpt-${variant}`, name: 'GPT', context_length: 128000,
        architecture: { input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: ['tools'] }] }),
  },
]

async function fetchItems(testCase: Case, variant: 'a' | 'b', clockMs: number) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(clockMs)
  const fetchImpl = vi.fn(async (url: string) => testCase.respond(String(url), variant)) as unknown as typeof fetch
  const snapshot = await testCase.source(fetchImpl).fetchSnapshot({
    providerKey: testCase.providerKey as never, apiKey: 'test-key', baseUrl: testCase.baseUrl, fetchImpl,
  })
  return snapshot.models.map((model) => ({ ...model }))
}

describe('catalogItemsContentDigestV2 (R4-08 / P3a-02)', () => {
  afterEach(() => { vi.useRealTimers() })

  for (const testCase of CASES) {
    it(`${testCase.name}: the same models fetched at a different time keep the same digest`, async () => {
      const first = await fetchItems(testCase, 'a', 1_700_000_000_000)
      const later = await fetchItems(testCase, 'a', 1_700_000_900_000)
      // The raw items do carry the fetch time, which is exactly why the old digest changed on every refresh.
      expect(JSON.stringify(first)).not.toBe(JSON.stringify(later))
      expect(catalogItemsContentDigestV2(first)).toBe(catalogItemsContentDigestV2(later))
    })

    it(`${testCase.name}: different models still produce a different digest`, async () => {
      const first = await fetchItems(testCase, 'a', 1_700_000_000_000)
      const other = await fetchItems(testCase, 'b', 1_700_000_000_000)
      expect(catalogItemsContentDigestV2(first)).not.toBe(catalogItemsContentDigestV2(other))
    })
  }
})
