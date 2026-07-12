import { describe, expect, it } from 'vitest'
import {
  OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY,
  compatibleAuthDescriptorSchema,
  compatibleInlinePolicyConfigSchema,
  compatibleOrdinaryHeadersSchema,
  compatibleQueryConfigSchema,
  compatibleRawExtensionValueSchema,
  compatibleReasoningMappingConfigSchema,
  endpointRevisionIdSchema,
  formatCompatibleOpaqueId,
  providerInstanceIdSchema,
  toCompatibleRendererCredentialDescriptor,
  type CompatibleCredentialDescriptor,
} from './index'

const providerInstanceId = providerInstanceIdSchema.parse('ocp_provider_12345678')
const credentialVersionRef = 'ocp_credential_12345678' as CompatibleCredentialDescriptor['credentialVersionRef']

describe('OpenAI Chat Completions-compatible canonical domain schemas', () => {
  it('exposes one canonical protocol key and rejects cross-kind opaque IDs', () => {
    expect(OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY).toBe('openai_chat_compatible')
    expect(providerInstanceId).toBe('ocp_provider_12345678')
    expect(endpointRevisionIdSchema.safeParse(providerInstanceId)).not.toMatchObject({ success: true })
    expect(formatCompatibleOpaqueId('route', '12345678')).toBe('ocp_route_12345678')
  })

  it('stores auth descriptors as secure references and rejects raw secret fields', () => {
    expect(compatibleAuthDescriptorSchema.parse({
      mode: 'bearer',
      credentialVersionRef,
    })).toEqual({ mode: 'bearer', credentialVersionRef })

    expect(compatibleAuthDescriptorSchema.safeParse({
      mode: 'bearer',
      credentialVersionRef,
      token: 'sk-this-must-never-enter-sqlite',
    }).success).toBe(false)
  })

  it('separates ordinary headers from sensitive secure references', () => {
    expect(compatibleOrdinaryHeadersSchema.parse([
      { name: 'X-Client-Name', value: 'Starverse', classification: 'public_non_secret' },
    ])).toHaveLength(1)
    expect(compatibleOrdinaryHeadersSchema.safeParse([
      { name: 'Authorization', value: 'Bearer secret', classification: 'public_non_secret' },
    ]).success).toBe(false)
    expect(compatibleOrdinaryHeadersSchema.safeParse([
      { name: 'Host', value: 'example.test', classification: 'public_non_secret' },
    ]).success).toBe(false)
    expect(compatibleOrdinaryHeadersSchema.safeParse([
      { name: 'X-Client-Auth', value: 'hunter2', classification: 'public_non_secret' },
    ]).success).toBe(false)
    expect(compatibleOrdinaryHeadersSchema.safeParse([
      { name: 'X-Tenant', value: 'hunter2' },
    ]).success).toBe(false)
  })

  it('rejects secret-like query values and duplicate query names', () => {
    expect(compatibleQueryConfigSchema.parse([{ name: 'region', value: 'us-east', classification: 'public_non_secret' }])).toHaveLength(1)
    expect(compatibleQueryConfigSchema.parse([{ name: 'api-version', value: '2026-01-01', classification: 'public_non_secret' }])).toHaveLength(1)
    expect(compatibleQueryConfigSchema.safeParse([{ name: 'api_key', value: 'not-allowed', classification: 'public_non_secret' }]).success).toBe(false)
    expect(compatibleQueryConfigSchema.safeParse([{ name: 'access', value: 'hunter2', classification: 'public_non_secret' }]).success).toBe(false)
    expect(compatibleQueryConfigSchema.safeParse([{ name: 'region', value: 'hunter2' }]).success).toBe(false)
    expect(compatibleQueryConfigSchema.safeParse([
      { name: 'region', value: 'one', classification: 'public_non_secret' },
      { name: 'REGION', value: 'two', classification: 'public_non_secret' },
    ]).success).toBe(false)
  })

  it('allows exactly the two frozen reasoning modes', () => {
    for (const mode of ['custom_preferred_with_builtin_fallback', 'custom_only'] as const) {
      expect(compatibleReasoningMappingConfigSchema.parse({
        schemaVersion: 1,
        mode,
        rules: [],
        replay: { format: 'disabled', scope: 'never' },
      }).mode).toBe(mode)
    }
    expect(compatibleReasoningMappingConfigSchema.safeParse({
      schemaVersion: 1,
      mode: 'automatic',
      rules: [],
      replay: { format: 'disabled', scope: 'never' },
    }).success).toBe(false)
    expect(compatibleReasoningMappingConfigSchema.safeParse({
      schemaVersion: 1,
      mode: 'custom_only',
      rules: [],
      replay: { format: 'assistant_content_tags', openTag: '<r>', closeTag: '<r>', scope: 'all_assistant_messages' },
    }).success).toBe(false)
  })

  it('keeps canonical think tags implicit and custom tags additive', () => {
    expect(compatibleInlinePolicyConfigSchema.parse({
      schemaVersion: 1,
      canonicalThinkTags: true,
      customTags: [{ openTag: '<analysis>', closeTag: '</analysis>' }],
    }).customTags).toHaveLength(1)
    expect(compatibleInlinePolicyConfigSchema.safeParse({
      schemaVersion: 1,
      canonicalThinkTags: true,
      customTags: [{ openTag: '<think>', closeTag: '</think>' }],
    }).success).toBe(false)
    expect(compatibleInlinePolicyConfigSchema.safeParse({ schemaVersion: 1, canonicalThinkTags: true, customTags: [{ openTag: '<abc>', closeTag: '<abc>x' }] }).success).toBe(false)
    expect(compatibleInlinePolicyConfigSchema.safeParse({ schemaVersion: 1, canonicalThinkTags: true, customTags: [{ openTag: `<${'界'.repeat(43)}>`, closeTag: '</x>' }] }).success).toBe(false)
    expect(compatibleInlinePolicyConfigSchema.safeParse({ schemaVersion: 1, canonicalThinkTags: true, customTags: [{ openTag: '```think', closeTag: '```' }] }).success).toBe(false)
    expect(compatibleInlinePolicyConfigSchema.safeParse({ schemaVersion: 1, canonicalThinkTags: true, customTags: [{ openTag: '  ```think', closeTag: '  ```' }] }).success).toBe(false)
  })

  it('rejects secrets, standard-field duplication and unbounded raw extension values', () => {
    expect(compatibleRawExtensionValueSchema.parse({ vendor_trace: { phase: '[redacted]' } })).toEqual({
      vendor_trace: { phase: '[redacted]' },
    })
    expect(compatibleRawExtensionValueSchema.safeParse({ vendor_trace: { phase: 'hunter2' } }).success).toBe(false)
    expect(compatibleRawExtensionValueSchema.safeParse({ authorization: 'Bearer secret' }).success).toBe(false)
    expect(compatibleRawExtensionValueSchema.safeParse({ choices: [{ delta: 'duplicate' }] }).success).toBe(false)
    expect(compatibleRawExtensionValueSchema.safeParse({ vendor_trace: 'x'.repeat(5000) }).success).toBe(false)
    expect(compatibleRawExtensionValueSchema.safeParse({ ['x'.repeat(17 * 1024)]: true }).success).toBe(false)
  })

  it('projects credential descriptors without exposing secure payload fields', () => {
    const descriptor: CompatibleCredentialDescriptor = {
      credentialVersionRef,
      providerInstanceId,
      version: 1,
      authMode: 'bearer',
      backend: 'electron_safe_storage',
      maskedSummary: {
        schemaVersion: 1,
        authMode: 'bearer',
        configured: true,
        maskState: 'configured_masked',
        sensitiveHeaderNames: [],
      },
      createdAtMs: 1,
      deletedAtMs: null,
    }

    const safe = toCompatibleRendererCredentialDescriptor(descriptor)
    expect(safe).toEqual(expect.objectContaining({
      credentialVersionRef,
      configured: true,
      maskState: 'configured_masked',
    }))
    expect(JSON.stringify(safe)).not.toContain('token')
    expect(JSON.stringify(safe)).not.toContain('password')
    expect(toCompatibleRendererCredentialDescriptor(descriptor, false)).toMatchObject({
      configured: false,
      maskState: 'not_configured',
    })
  })
})
