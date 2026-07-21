import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_NATIVE_HISTORY_MAX_BLOCKS_V1,
  AnthropicNativeContentBlocksV1Error,
  createAnthropicNativeHistoryArtifactV1,
  decodeAnthropicNativeHistoryArtifactV1,
  deserializeAnthropicNativeHistoryArtifactV1,
  isAnthropicNativeHistoryArtifactV1,
  serializeAnthropicNativeHistoryArtifactV1,
} from './nativeContentBlocksV1'

const usage = Object.freeze({
  cache_creation: null,
  cache_creation_input_tokens: 3,
  cache_read_input_tokens: 2,
  inference_geo: 'us',
  input_tokens: 11,
  output_tokens: 7,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: 'standard',
})

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    providerKey: 'anthropic',
    sourceApi: 'anthropic_messages',
    snapshotKey: 'assistant',
    role: 'assistant',
    status: 'final',
    content: [{ type: 'text', text: 'answer', citations: null }],
    model: 'claude-sonnet-4-5',
    stopReason: 'end_turn',
    stopSequence: null,
    usage,
    ...overrides,
  }
}

function expectCode(action: () => unknown, code: AnthropicNativeContentBlocksV1Error['code']) {
  expect(action).toThrowError(expect.objectContaining({ code }))
}

describe('Anthropic Messages native history artifact V1', () => {
  it('preserves ordered native blocks, thinking signature, direct caller, and plain JSON tool input', () => {
    const content = [
      { type: 'thinking', thinking: 'reason', signature: 'signed' },
      { type: 'redacted_thinking', data: 'opaque' },
      { type: 'text', text: 'before tool', citations: null },
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: 'weather',
        input: { city: 'Shanghai', nested: [{ unit: 'c' }] },
        caller: { type: 'direct' },
      },
      { type: 'text', text: 'after tool', citations: null },
    ]
    const artifact = createAnthropicNativeHistoryArtifactV1(snapshot({
      content,
      stopReason: 'tool_use',
      stopSequence: 'done',
    }))

    expect(artifact).toMatchObject({
      artifactKind: 'anthropic_messages_native_history_v1',
      artifactCodecVersion: 1,
      providerKey: 'anthropic',
      sourceApi: 'anthropic_messages',
      assistantMessage: { role: 'assistant', content },
      model: 'claude-sonnet-4-5',
      stopReason: 'tool_use',
      stopSequence: 'done',
      usage,
    })
    expect(artifact.assistantMessage.content.map((block) => block.type)).toEqual([
      'thinking', 'redacted_thinking', 'text', 'tool_use', 'text',
    ])
    expect(Object.isFrozen(artifact.assistantMessage.content[3])).toBe(true)
    expect(Object.isFrozen((artifact.assistantMessage.content[3] as { input: object }).input)).toBe(true)
  })

  it('has a canonical round-trip and rejects non-canonical JSON', () => {
    const artifact = createAnthropicNativeHistoryArtifactV1(snapshot())
    const canonical = serializeAnthropicNativeHistoryArtifactV1(artifact)
    const decoded = deserializeAnthropicNativeHistoryArtifactV1(canonical)

    expect(decoded).toEqual(artifact)
    expect(decoded.artifactHash).toBe(artifact.artifactHash)
    expect(isAnthropicNativeHistoryArtifactV1(decoded)).toBe(true)
    expectCode(
      () => deserializeAnthropicNativeHistoryArtifactV1(JSON.stringify(JSON.parse(canonical), null, 2)),
      'GENERATION_V2_ANTHROPIC_NATIVE_NON_CANONICAL',
    )
  })

  it('rejects extra snapshot, artifact, block, caller, and usage keys including diagnostics', () => {
    expectCode(
      () => createAnthropicNativeHistoryArtifactV1(snapshot({ diagnostics: [] })),
      'GENERATION_V2_ANTHROPIC_NATIVE_UNKNOWN_FIELD',
    )
    expectCode(
      () => createAnthropicNativeHistoryArtifactV1(snapshot({
        content: [{ type: 'text', text: 'x', citations: null, extra: true }],
      })),
      'GENERATION_V2_ANTHROPIC_NATIVE_UNKNOWN_FIELD',
    )
    expectCode(
      () => createAnthropicNativeHistoryArtifactV1(snapshot({
        content: [{ type: 'tool_use', id: 'x', name: 'x', input: {}, caller: { type: 'direct', extra: true } }],
      })),
      'GENERATION_V2_ANTHROPIC_NATIVE_UNKNOWN_FIELD',
    )
    expectCode(
      () => createAnthropicNativeHistoryArtifactV1(snapshot({ usage: { ...usage, total_tokens: 18 } })),
      'GENERATION_V2_ANTHROPIC_NATIVE_UNKNOWN_FIELD',
    )
    const artifact = createAnthropicNativeHistoryArtifactV1(snapshot())
    expectCode(
      () => decodeAnthropicNativeHistoryArtifactV1({ ...artifact, extra: true }),
      'GENERATION_V2_ANTHROPIC_NATIVE_UNKNOWN_FIELD',
    )
  })

  it('fails closed on unknown blocks, non-null citations, non-direct callers, and future typed usage', () => {
    for (const content of [
      [{ type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: {} }],
      [{ type: 'text', text: 'cited', citations: [] }],
      [{ type: 'tool_use', id: 'x', name: 'x', input: {}, caller: { type: 'server' } }],
    ]) {
      expect(() => createAnthropicNativeHistoryArtifactV1(snapshot({ content }))).toThrow(AnthropicNativeContentBlocksV1Error)
    }
    for (const field of ['cache_creation', 'output_tokens_details', 'server_tool_use'] as const) {
      expect(() => createAnthropicNativeHistoryArtifactV1(snapshot({
        usage: { ...usage, [field]: { future: true } },
      }))).toThrow(AnthropicNativeContentBlocksV1Error)
    }
  })

  it('requires complete thinking/redacted/tool blocks and strict complete usage', () => {
    for (const content of [
      [{ type: 'thinking', thinking: 'reason', signature: '' }],
      [{ type: 'redacted_thinking', data: '' }],
      [{ type: 'tool_use', id: '', name: 'tool', input: {}, caller: { type: 'direct' } }],
      [{ type: 'tool_use', id: 'id', name: '', input: {}, caller: { type: 'direct' } }],
      [{ type: 'tool_use', id: 'id', name: 'tool', input: undefined, caller: { type: 'direct' } }],
    ]) {
      expect(() => createAnthropicNativeHistoryArtifactV1(snapshot({ content }))).toThrow(AnthropicNativeContentBlocksV1Error)
    }
    for (const badUsage of [
      { ...usage, input_tokens: -1 },
      { ...usage, output_tokens: 1.5 },
      { ...usage, cache_read_input_tokens: Number.MAX_SAFE_INTEGER + 1 },
      { ...usage, service_tier: 'unknown' },
      Object.fromEntries(Object.entries(usage).filter(([key]) => key !== 'server_tool_use')),
    ]) {
      expect(() => createAnthropicNativeHistoryArtifactV1(snapshot({ usage: badUsage }))).toThrow(AnthropicNativeContentBlocksV1Error)
    }
  })

  it('preserves signature-only omitted thinking and rejects an empty content array', () => {
    const artifact = createAnthropicNativeHistoryArtifactV1(snapshot({
      content: [{ type: 'thinking', thinking: '', signature: 'signed-opaque' }],
    }))
    expect(artifact.assistantMessage.content).toEqual([
      { type: 'thinking', thinking: '', signature: 'signed-opaque' },
    ])
    expect(() => createAnthropicNativeHistoryArtifactV1(snapshot({ content: [] })))
      .toThrow(AnthropicNativeContentBlocksV1Error)
  })

  it('enforces only the tool_use stop lower bound and preserves tool blocks for other terminal reasons', () => {
    expectCode(
      () => createAnthropicNativeHistoryArtifactV1(snapshot({ stopReason: 'tool_use' })),
      'GENERATION_V2_ANTHROPIC_NATIVE_STOP_MISMATCH',
    )
    const tool = { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: {}, caller: { type: 'direct' } }
    for (const stopReason of ['end_turn', 'max_tokens', 'stop_sequence', 'pause_turn', 'refusal']) {
      expect(createAnthropicNativeHistoryArtifactV1(snapshot({ content: [tool], stopReason })).stopReason).toBe(stopReason)
    }
    expect(() => createAnthropicNativeHistoryArtifactV1(snapshot({ stopReason: 'content_filter' })))
      .toThrow(AnthropicNativeContentBlocksV1Error)
  })

  it('detects semantic and hash tampering', () => {
    const artifact = createAnthropicNativeHistoryArtifactV1(snapshot())
    expectCode(
      () => decodeAnthropicNativeHistoryArtifactV1({ ...artifact, model: 'claude-opus-4-6' }),
      'GENERATION_V2_ANTHROPIC_NATIVE_HASH_MISMATCH',
    )
    expectCode(
      () => decodeAnthropicNativeHistoryArtifactV1({ ...artifact, artifactHash: '0'.repeat(64) }),
      'GENERATION_V2_ANTHROPIC_NATIVE_HASH_MISMATCH',
    )
  })

  it('rejects non-final or incomplete legacy snapshots', () => {
    expectCode(
      () => createAnthropicNativeHistoryArtifactV1(snapshot({ status: 'streaming' })),
      'GENERATION_V2_ANTHROPIC_NATIVE_NOT_FINAL',
    )
    const { model: _model, ...withoutModel } = snapshot()
    expect(() => createAnthropicNativeHistoryArtifactV1(withoutModel)).toThrow(AnthropicNativeContentBlocksV1Error)
  })

  it('enforces block-count and 20 MiB canonical artifact limits', () => {
    const tooMany = Array.from({ length: ANTHROPIC_NATIVE_HISTORY_MAX_BLOCKS_V1 + 1 }, () => ({
      type: 'text', text: '', citations: null,
    }))
    expectCode(
      () => createAnthropicNativeHistoryArtifactV1(snapshot({ content: tooMany })),
      'GENERATION_V2_ANTHROPIC_NATIVE_LIMIT_EXCEEDED',
    )
    expectCode(
      () => createAnthropicNativeHistoryArtifactV1(snapshot({
        content: [{ type: 'text', text: 'x'.repeat(20 * 1_024 * 1_024), citations: null }],
      })),
      'GENERATION_V2_ANTHROPIC_NATIVE_LIMIT_EXCEEDED',
    )
  })
})
