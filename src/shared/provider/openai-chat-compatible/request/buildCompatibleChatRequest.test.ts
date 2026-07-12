import { describe, expect, it } from 'vitest'
import type { CompatibleRequestFieldMappingConfig, CompatibleRequestProfileConfig } from '../schemas'
import { buildCompatibleChatRequest } from './buildCompatibleChatRequest'

const profile = (defaults: Record<string, unknown> = {}): CompatibleRequestProfileConfig => ({
  schemaVersion: 1,
  standardFieldOwnership: 'builder',
  unsupportedFieldPolicy: 'error_before_fetch',
  defaults,
  extraBody: { enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 },
})

const base = () => ({
  modelId: 'model-a',
  stream: true,
  profile: profile(),
  messages: [{ role: 'user' as const, content: 'hello' }],
})

const mapping = (overrides: Partial<CompatibleRequestFieldMappingConfig> = {}): CompatibleRequestFieldMappingConfig => ({
  schemaVersion: 1,
  mappingId: 'ocp_request_mapping_12345678' as CompatibleRequestFieldMappingConfig['mappingId'],
  requestProfileId: 'ocp_request_profile_12345678' as CompatibleRequestFieldMappingConfig['requestProfileId'],
  requestProfileVersion: 1,
  sourceField: 'reasoning_effort',
  targetPath: ['reasoning', 'effort'],
  valueKind: 'string',
  valueMapping: { low: 'low', high: 'high' },
  omission: 'omit_when_unset',
  ...overrides,
})

describe('buildCompatibleChatRequest', () => {
  it('builds all roles, images and linked tool calls without provider-specific fields', () => {
    const result = buildCompatibleChatRequest({
      ...base(),
      messages: [
        { role: 'system', content: 'system' },
        { role: 'developer', content: 'developer' },
        { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'https://example.test/image.png' } }] },
        { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' } }] },
        { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true}' },
      ],
    })
    expect(result.body).toMatchObject({ model: 'model-a', stream: true })
    expect(result.body.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'developer' }),
      expect.objectContaining({ role: 'tool', tool_call_id: 'call-1' }),
    ]))
    expect(result.serialized).not.toMatch(/openrouter|endpoint|credential|providerInstanceId/iu)
  })

  it('preserves unset, explicit and profile_default including zero false and empty arrays', () => {
    const result = buildCompatibleChatRequest({
      ...base(),
      profile: profile({ temperature: 0, parallel_tool_calls: false, stop: [] }),
      fields: {
        temperature: { state: 'profile_default' },
        parallel_tool_calls: { state: 'profile_default' },
        stop: { state: 'profile_default' },
        top_p: { state: 'unset' },
        seed: { state: 'explicit', value: 0 },
        n: { state: 'explicit', value: 2 },
      },
    })
    expect(result.body).toMatchObject({ temperature: 0, parallel_tool_calls: false, stop: [], seed: 0, n: 2 })
    expect(result.body).not.toHaveProperty('top_p')
    expect(result.choiceCount).toBe(2)
  })

  it('rejects runtime-configured unsupported fields and unmapped reasoning controls instead of dropping them', () => {
    expect(() => buildCompatibleChatRequest({ ...base(), fields: { vendor_magic: { state: 'explicit', value: true } } as never }))
      .toThrow('compatible_request_field_unsupported')
    expect(() => buildCompatibleChatRequest({
      ...base(), reasoningControls: { reasoning_effort: { state: 'explicit', value: 'high' } }, requestMappings: [],
    })).toThrow('compatible_request_mapping_missing')
  })

  it('applies request-only reasoning mappings and rejects required unset or ownership collisions', () => {
    expect(buildCompatibleChatRequest({
      ...base(),
      reasoningControls: { reasoning_effort: { state: 'explicit', value: 'high' } },
      requestMappings: [mapping()],
    }).body).toMatchObject({ reasoning: { effort: 'high' } })
    expect(() => buildCompatibleChatRequest({ ...base(), requestMappings: [mapping({ omission: 'required' })] }))
      .toThrow('compatible_request_mapping_required')
    expect(() => buildCompatibleChatRequest({ ...base(), requestMappings: [mapping({ targetPath: ['model'] })] }))
      .toThrow(/compatible_request_path_conflict/)
    expect(() => buildCompatibleChatRequest({ ...base(), requestMappings: [mapping({ targetPath: ['vendor', 'api_key'] })] }))
      .toThrow('compatible_request_mapping_invalid')
  })

  it('merges safe extraBody only when exact/ancestor/descendant ownership is disjoint', () => {
    expect(buildCompatibleChatRequest({ ...base(), extraBody: { vendor: { flag: true } } }).body)
      .toMatchObject({ vendor: { flag: true } })
    expect(() => buildCompatibleChatRequest({ ...base(), extraBody: { model: 'override' } }))
      .toThrow(/compatible_request_path_conflict/)
    expect(() => buildCompatibleChatRequest({ ...base(), extraBody: { credentialVersionRef: 'ocp_credential_12345678' } }))
      .toThrow(/compatible_request_path_conflict/)
    expect(() => buildCompatibleChatRequest({
      ...base(), reasoningControls: { reasoning_effort: { state: 'explicit', value: 'low' } },
      requestMappings: [mapping()], extraBody: { reasoning: 'override' },
    })).toThrow(/compatible_request_path_conflict/)
    expect(buildCompatibleChatRequest({
      ...base(),
      reasoningControls: { reasoning_effort: { state: 'explicit', value: 'low' } },
      requestMappings: [mapping({ targetPath: ['vendor', 'effort'] })],
      extraBody: { vendor: { flag: true } },
    }).body).toMatchObject({ vendor: { effort: 'low', flag: true } })
  })

  it('validates tools, response format, token conflicts and unsupported content before any transport exists', () => {
    expect(buildCompatibleChatRequest({
      ...base(),
      fields: {
        tools: { state: 'explicit', value: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object' }, strict: true } }] },
        tool_choice: { state: 'explicit', value: { type: 'function', function: { name: 'lookup' } } },
        response_format: { state: 'explicit', value: { type: 'json_schema', json_schema: { name: 'answer', schema: { type: 'object' }, strict: true } } },
        stream_options: { state: 'explicit', value: { include_usage: true } },
      },
    }).body).toHaveProperty('tools')
    expect(() => buildCompatibleChatRequest({
      ...base(), fields: { max_tokens: { state: 'explicit', value: 10 }, max_completion_tokens: { state: 'explicit', value: 10 } },
    })).toThrow('compatible_request_token_limit_conflict')
    expect(() => buildCompatibleChatRequest({
      ...base(), fields: { tool_choice: { state: 'explicit', value: 'auto' } },
    })).toThrow('compatible_request_tools_required')
    expect(() => buildCompatibleChatRequest({
      ...base(), stream: false, fields: { stream_options: { state: 'explicit', value: { include_usage: true } } },
    })).toThrow('compatible_request_stream_options_invalid')
    expect(() => buildCompatibleChatRequest({ ...base(), messages: [{ role: 'user', content: [{ type: 'file', file: {} }] }] as never }))
      .toThrow('compatible_request_content_unsupported')
    expect(() => buildCompatibleChatRequest({
      ...base(), messages: [{ role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{' } }] }],
    })).toThrow('compatible_request_tools_invalid')
    expect(() => buildCompatibleChatRequest({
      ...base(), messages: [
        { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{}' } }] },
        { role: 'user', content: 'skips required result' },
      ],
    })).toThrow('compatible_request_tool_result_invalid')
  })

  it('serializes deterministically and diagnostics contain only paths, owners and states', () => {
    const input = { ...base(), extraBody: { zeta: 1, alpha: { beta: true } } }
    const first = buildCompatibleChatRequest(input)
    const second = buildCompatibleChatRequest(input)
    expect(first.serialized).toBe(second.serialized)
    expect(first.serialized.indexOf('alpha')).toBeLessThan(first.serialized.indexOf('zeta'))
    expect(JSON.stringify(first.diagnostics)).not.toContain('hello')
  })

  it('allows secret-like user content in the wire body without copying it into diagnostics', () => {
    const secretLikeUserText = 'sk_1234567890abcdefghijklmnopqrstuv'
    const result = buildCompatibleChatRequest({ ...base(), messages: [{ role: 'user', content: secretLikeUserText }] })
    expect(result.serialized).toContain(secretLikeUserText)
    expect(JSON.stringify(result.diagnostics)).not.toContain(secretLikeUserText)
  })

  it('strictly rejects internal or unknown keys anywhere in message wire objects', () => {
    expect(() => buildCompatibleChatRequest({
      ...base(),
      messages: [{ role: 'user', content: 'hello', credentialVersionRef: 'ocp_credential_12345678' }] as never,
    })).toThrow('compatible_request_messages_invalid')
    expect(() => buildCompatibleChatRequest({
      ...base(),
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello', routeProvenanceId: 'ocp_route_12345678' }] }] as never,
    })).toThrow('compatible_request_messages_invalid')
  })

  it('rejects prototype keys, cycles and oversized/deep extraBody before serialization', () => {
    const polluted = JSON.parse('{"__proto__":{"polluted":true}}')
    expect(() => buildCompatibleChatRequest({ ...base(), extraBody: polluted })).toThrow()
    const cyclic: any = { vendor: {} }
    cyclic.vendor.self = cyclic
    expect(() => buildCompatibleChatRequest({ ...base(), extraBody: cyclic })).toThrow(/cycle|JSON/iu)
    let deep: any = { leaf: true }
    for (let index = 0; index < 10; index += 1) deep = { child: deep }
    expect(() => buildCompatibleChatRequest({ ...base(), extraBody: deep })).toThrow()
  })

  it('uses profile-specific extraBody bytes and counts every nested key', () => {
    const large = '.'.repeat(20 * 1024)
    expect(buildCompatibleChatRequest({ ...base(), profile: profile(), extraBody: { vendor: large } }).body)
      .toMatchObject({ vendor: large })
    expect(() => buildCompatibleChatRequest({
      ...base(),
      profile: { ...profile(), extraBody: { enabled: true, maxDepth: 8, maxKeys: 1, maxBytes: 32768 } },
      extraBody: { outer: { inner: true } },
    })).toThrow('compatible_extra_body_overflow')
    const shallowProfile = { ...profile(), extraBody: { enabled: true, maxDepth: 1, maxKeys: 8, maxBytes: 32768 } }
    expect(buildCompatibleChatRequest({ ...base(), profile: shallowProfile, extraBody: { flag: true } }).body).toMatchObject({ flag: true })
    expect(() => buildCompatibleChatRequest({ ...base(), profile: shallowProfile, extraBody: { outer: { inner: true } } }))
      .toThrow('compatible_extra_body_overflow')
  })
})
