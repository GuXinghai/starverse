import { describe, expect, it } from 'vitest'
import { compileDeepSeekStableChatRequestV1 } from './chatRequestV1'
import {
  DEEPSEEK_STABLE_SEMANTIC_INTENT_KEYS_V1,
  projectDeepSeekStableIntentV1,
} from './chatIntentProjectionV1'

function resolved(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 2,
    generation: {},
    reasoning: { mode: 'disabled' },
    web: { mode: 'disabled' },
    image: { mode: 'disabled' },
    tools: { mode: 'disabled' },
    attachments: [],
    providerExtension: { kind: 'none' },
    ...overrides,
  }
}

describe('DeepSeek stable semantic intent projection V1', () => {
  it('projects disabled-thinking sampling to the exact stable Chat wire fields', () => {
    const projection = projectDeepSeekStableIntentV1(resolved({
      generation: { maxOutputTokens: 1024, temperature: 0.5, topP: 0.8, stop: ['END'] },
    }))
    expect(projection).toMatchObject({
      classification: 'deepseek_stable_intent_projection_non_executable',
      executionAuthority: 'none',
      issues: [],
    })
    expect(projection.nativeSemanticFields).toEqual([
      { semanticPath: 'generation.maxOutputTokens', wireKey: 'max_tokens', value: 1024 },
      { semanticPath: 'generation.stop', wireKey: 'stop', value: ['END'] },
      { semanticPath: 'generation.temperature', wireKey: 'temperature', value: 0.5 },
      { semanticPath: 'reasoning.mode', wireKey: 'thinking.type', value: 'disabled' },
      { semanticPath: 'generation.topP', wireKey: 'top_p', value: 0.8 },
    ])
    const compiled = compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-flash', priorArtifact: null,
      clientEntries: [{ kind: 'client', message: { role: 'user', content: 'x' } }],
      thinking: { type: 'disabled' },
      generation: { maxTokens: 1024, temperature: 0.5, topP: 0.8, stop: ['END'] },
    })
    expect(compiled.nativeRequest).toMatchObject({
      max_tokens: 1024, temperature: 0.5, top_p: 0.8, stop: ['END'], thinking: { type: 'disabled' },
    })
  })

  it.each([
    ['low', 'high'], ['medium', 'high'], ['high', 'high'], ['xhigh', 'max'], ['max', 'max'],
  ] as const)('records the official thinking effort mapping %s -> %s', (effort, wireEffort) => {
    const projection = projectDeepSeekStableIntentV1(resolved({
      reasoning: { mode: 'enabled', effort },
    }))
    expect(projection.issues).toEqual([])
    expect(projection.nativeSemanticFields).toContainEqual({
      semanticPath: 'reasoning.effort', wireKey: 'reasoning_effort', value: wireEffort,
    })
  })

  it('rejects unsupported and no-effect fields instead of silently omitting them', () => {
    const projection = projectDeepSeekStableIntentV1(resolved({
      generation: {
        temperature: 0.5, topP: 0.8, topK: 5, seed: 1, candidateCount: 2,
        frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1,
      },
      reasoning: { mode: 'enabled', effort: 'minimal', summary: 'auto' },
    }))
    expect(projection.issues.map((issue) => [issue.semanticPath, issue.code])).toEqual([
      ['generation.candidateCount', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD'],
      ['generation.frequencyPenalty', 'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED'],
      ['generation.presencePenalty', 'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED'],
      ['generation.repetitionPenalty', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD'],
      ['generation.seed', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD'],
      ['generation.temperature', 'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED'],
      ['generation.topK', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD'],
      ['generation.topP', 'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED'],
      ['reasoning.effort', 'DEEPSEEK_REASONING_EFFORT_UNSUPPORTED'],
      ['reasoning.summary', 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD'],
    ])
    expect(new Set(projection.dispositions.map((entry) => entry.semanticPath)).size)
      .toBe(projection.dispositions.length)
  })

  it('rejects provider-invalid values before the request compiler and preserves disabled penalty semantics', () => {
    const invalid = projectDeepSeekStableIntentV1(resolved({
      generation: { temperature: 3, stop: Array.from({ length: 17 }, (_, index) => `S${index}`) },
    }))
    expect(invalid.issues).toEqual([
      { semanticPath: 'generation.stop', code: 'DEEPSEEK_FIELD_VALUE_UNSUPPORTED', wireKey: 'stop' },
      { semanticPath: 'generation.temperature', code: 'DEEPSEEK_FIELD_VALUE_UNSUPPORTED', wireKey: 'temperature' },
    ])
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-flash', priorArtifact: null,
      clientEntries: [{ kind: 'client', message: { role: 'user', content: 'x' } }],
      thinking: { type: 'disabled' }, generation: { temperature: 3 },
    })).toThrow('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-flash', priorArtifact: null,
      clientEntries: [{ kind: 'client', message: { role: 'user', content: 'x' } }],
      thinking: { type: 'disabled' },
      generation: { stop: Array.from({ length: 17 }, (_, index) => `S${index}`) },
    })).toThrow('GENERATION_V2_DEEPSEEK_REQUEST_LIMIT_EXCEEDED')

    const deprecated = projectDeepSeekStableIntentV1(resolved({
      generation: { frequencyPenalty: 0, presencePenalty: 0 },
    }))
    expect(deprecated.issues.map((issue) => issue.code)).toEqual([
      'DEEPSEEK_DEPRECATED_FIELD_UNSUPPORTED',
      'DEEPSEEK_DEPRECATED_FIELD_UNSUPPORTED',
    ])
  })

  it('blocks web, image, enabled tools and included attachments at their semantic leaves', () => {
    const projection = projectDeepSeekStableIntentV1(resolved({
      web: { mode: 'provider_search', types: ['web'] },
      image: { mode: 'generate', resolution: '1K', format: 'png', stream: true },
      tools: {
        mode: 'enabled', allowedToolIds: ['tool:weather'], toolChoice: { mode: 'omitted' },
        sideEffectConfirmation: 'required_each_retry',
      },
      attachments: [{
        assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64),
        include: true, sendAs: 'inline_text', conversion: 'none',
      }, {
        assetId: 'asset:2', assetRevisionId: 'revision:2', assetSha256: 'b'.repeat(64),
        include: false, sendAs: 'inline_text', conversion: 'none',
      }],
    }))
    const rejected = projection.dispositions.filter((entry) => entry.outcome === 'rejected')
      .map((entry) => entry.semanticPath)
    expect(rejected).toEqual([
      'attachments[0].conversion',
      'attachments[0].include',
      'attachments[0].sendAs',
      'image.format',
      'image.mode',
      'image.resolution',
      'image.stream',
      'tools.allowedToolIds',
      'tools.mode',
      'tools.toolChoice',
      'web.mode',
      'web.types',
    ])
    expect(projection.dispositions).toContainEqual(expect.objectContaining({
      semanticPath: 'attachments[1].include', outcome: 'accepted_no_wire',
    }))
    expect(projection.dispositions).toContainEqual(expect.objectContaining({
      semanticPath: 'tools.sideEffectConfirmation', outcome: 'accepted_no_wire',
    }))
  })

  it('uses array-index attachment paths without identity delimiter collisions', () => {
    const projection = projectDeepSeekStableIntentV1(resolved({
      attachments: [{
        assetId: 'a', assetRevisionId: 'b@c', assetSha256: 'a'.repeat(64),
        include: false, sendAs: 'inline_text', conversion: 'none',
      }, {
        assetId: 'a@b', assetRevisionId: 'c', assetSha256: 'b'.repeat(64),
        include: false, sendAs: 'inline_text', conversion: 'none',
      }],
    }))
    const paths = projection.dispositions.map((entry) => entry.semanticPath)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths).toContain('attachments[0].assetRevisionId')
    expect(paths).toContain('attachments[1].assetRevisionId')
  })

  it('requires one complete strict resolved intent and keeps the key list exhaustive', () => {
    expect(DEEPSEEK_STABLE_SEMANTIC_INTENT_KEYS_V1).toEqual([
      'generation', 'reasoning', 'web', 'image', 'tools', 'attachments', 'providerExtension',
    ])
    expect(() => projectDeepSeekStableIntentV1({ schemaVersion: 2 }))
      .toThrow('GENERATION_V2_RESOLVED_INTENT_INCOMPLETE')
    expect(() => projectDeepSeekStableIntentV1({ ...resolved(), unknown: true }))
      .toThrow('GENERATION_V2_INTENT_UNKNOWN_FIELD')
    let getterCalls = 0
    const accessor = Object.defineProperty(resolved(), 'generation', {
      enumerable: true,
      get: () => { getterCalls += 1; return {} },
    })
    expect(() => projectDeepSeekStableIntentV1(accessor))
      .toThrow('GENERATION_V2_INTENT_INVALID_SHAPE')
    expect(getterCalls).toBe(0)
  })
})
