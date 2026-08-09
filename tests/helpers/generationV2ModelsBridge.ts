import { vi } from 'vitest'

type Provider = 'openrouter' | 'openai_responses' | 'anthropic_messages' | 'google_ai_studio' | 'deepseek'

const methodByProvider = {
  openrouter: 'listOpenRouter',
  openai_responses: 'listOpenAIResponses',
  anthropic_messages: 'listAnthropic',
  google_ai_studio: 'listGoogleAIStudio',
  deepseek: 'listDeepSeek',
} as const

export function installGenerationV2ModelsList(provider: Provider, implementation: (...args: any[]) => any) {
  const current = (globalThis as any).generationV2 ?? {}
  const list = vi.fn(implementation)
  ;(globalThis as any).generationV2 = {
    ...current,
    models: { ...(current.models ?? {}), [methodByProvider[provider]]: list },
  }
  return list
}

export function successfulGenerationV2Models(items: readonly unknown[], input: Readonly<{
  responseDigest?: string
  observedAtMs?: number
}> = {}) {
  return {
    ok: true as const,
    responseDigest: input.responseDigest ?? 'catalog-test-digest',
    observedAtMs: input.observedAtMs ?? 123,
    items,
  }
}
