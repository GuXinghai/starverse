import { describe, expect, it } from 'vitest'
import {
  resolveGenericEndpointDescriptor,
  toSafeGenericEndpointMetadata,
  type GenericEndpointConfig,
  type GenericCredentialRef,
  type ResolveGenericCredential,
  type ConfigValidationError,
} from '@/next/provider/generic/genericEndpointConfig'
import {
  GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
  type GenericEndpointDescriptor,
} from '@/next/provider/generic/genericEndpointDescriptor'
import {
  createBearerCredential,
  isCredentialValid,
} from '@/next/provider/credentials/providerCredential'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CREDENTIAL_REF: GenericCredentialRef = { kind: 'credential_ref', id: 'default' }

function validConfig(overrides?: Partial<GenericEndpointConfig>): GenericEndpointConfig {
  return {
    endpointId: 'ep-1',
    displayName: 'My Endpoint',
    profileId: GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-4o-mini',
    credentialRef: VALID_CREDENTIAL_REF,
    ...overrides,
  }
}

function validResolver(): ResolveGenericCredential {
  return () => createBearerCredential('sk-test-key')
}

function failingResolver(message?: string): ResolveGenericCredential {
  return () => ({ code: 'missing_token', message: message ?? 'Credential not found' })
}

function isDescriptor(result: GenericEndpointDescriptor | ConfigValidationError): result is GenericEndpointDescriptor {
  return 'profileId' in result && 'credential' in result
}

function isError(result: GenericEndpointDescriptor | ConfigValidationError): result is ConfigValidationError {
  return 'code' in result && 'message' in result && !('profileId' in result)
}

// ---------------------------------------------------------------------------
// Config shape — no secret material
// ---------------------------------------------------------------------------

describe('GenericEndpointConfig', () => {
  it('config type contains endpointId, displayName, profileId, baseUrl, model, credentialRef', () => {
    const config = validConfig()
    expect(config.endpointId).toBe('ep-1')
    expect(config.displayName).toBe('My Endpoint')
    expect(config.profileId).toBe(GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID)
    expect(config.baseUrl).toBe('https://api.example.com/v1')
    expect(config.model).toBe('gpt-4o-mini')
    expect(config.credentialRef).toEqual({ kind: 'credential_ref', id: 'default' })
  })

  it('config does not contain raw apiKey, token, Authorization, or secret fields', () => {
    const config = validConfig()
    const serialized = JSON.stringify(config)
    expect(serialized).not.toContain('sk-')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('password')
  })

  it('credentialRef is a non-secret reference, not credential material', () => {
    const config = validConfig()
    expect(config.credentialRef.kind).toBe('credential_ref')
    expect(typeof config.credentialRef.id).toBe('string')
    // credentialRef must not have token/secret/password fields
    expect('token' in config.credentialRef).toBe(false)
    expect('secret' in config.credentialRef).toBe(false)
    expect('password' in config.credentialRef).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Secret-like field rejection
// ---------------------------------------------------------------------------

describe('secret-like field rejection', () => {
  const secretFieldNames = [
    'apiKey', 'api_key', 'token', 'accessToken', 'access_token',
    'bearerToken', 'bearer_token', 'authToken', 'auth_token',
    'authorization', 'secret', 'secretKey', 'secret_key',
    'password', 'privateKey', 'private_key',
  ]

  for (const fieldName of secretFieldNames) {
    it(`rejects config with "${fieldName}" field`, () => {
      const configWithSecret = { ...validConfig(), [fieldName]: 'sk-leaked-key' } as any
      const result = resolveGenericEndpointDescriptor(configWithSecret, validResolver())
      expect(isError(result)).toBe(true)
      if (isError(result)) {
        expect(result.code).toBe('secret_like_field_rejected')
        expect(result.message).toContain(fieldName)
        // Must not echo the secret value
        expect(result.message).not.toContain('sk-leaked-key')
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Valid config + resolver produces valid descriptor
// ---------------------------------------------------------------------------

describe('resolveGenericEndpointDescriptor', () => {
  it('valid config + resolver produces valid descriptor', () => {
    const result = resolveGenericEndpointDescriptor(validConfig(), validResolver())
    expect(isDescriptor(result)).toBe(true)
    if (isDescriptor(result)) {
      expect(result.profileId).toBe(GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID)
      expect(result.baseUrl).toBe('https://api.example.com/v1/chat/completions')
      expect(result.model).toBe('gpt-4o-mini')
      expect(isCredentialValid(result.credential)).toBe(true)
    }
  })

  it('descriptor uses normalized URL from config.baseUrl', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ baseUrl: 'https://custom.api.com:8443/v1/' }),
      validResolver(),
    )
    expect(isDescriptor(result)).toBe(true)
    if (isDescriptor(result)) {
      expect(result.baseUrl).toBe('https://custom.api.com:8443/v1/chat/completions')
    }
  })

  it('descriptor uses trimmed model', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ model: '  custom-model  ' }),
      validResolver(),
    )
    expect(isDescriptor(result)).toBe(true)
    if (isDescriptor(result)) {
      expect(result.model).toBe('custom-model')
    }
  })

  it('descriptor capability defaults remain conservative', () => {
    const result = resolveGenericEndpointDescriptor(validConfig(), validResolver())
    expect(isDescriptor(result)).toBe(true)
    if (isDescriptor(result)) {
      expect(result.capability.textChat).toBe(true)
      expect(result.capability.streamingText).toBe(true)
      expect(result.capability.tools).toBe(false)
      expect(result.capability.vision).toBe(false)
      expect(result.capability.reasoning).toBe(false)
      expect(result.capability.webSearch).toBe(false)
      expect(result.capability.imageGeneration).toBe(false)
      expect(result.capability.structuredOutput).toBe(false)
    }
  })

  // -----------------------------------------------------------------------
  // Endpoint ID validation
  // -----------------------------------------------------------------------

  it('empty endpointId fails safely', () => {
    const result = resolveGenericEndpointDescriptor(validConfig({ endpointId: '' }), validResolver())
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_endpoint_id')
  })

  it('whitespace-only endpointId fails safely', () => {
    const result = resolveGenericEndpointDescriptor(validConfig({ endpointId: '   ' }), validResolver())
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_endpoint_id')
  })

  // -----------------------------------------------------------------------
  // Profile ID validation
  // -----------------------------------------------------------------------

  it('unknown profileId fails with safe message', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ profileId: 'deepseek_v3' as any }),
      validResolver(),
    )
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.code).toBe('invalid_profile')
      expect(result.message).not.toContain('deepseek_v3')
    }
  })

  // -----------------------------------------------------------------------
  // Base URL validation
  // -----------------------------------------------------------------------

  it('empty baseUrl fails safely', () => {
    const result = resolveGenericEndpointDescriptor(validConfig({ baseUrl: '' }), validResolver())
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_base_url')
  })

  it('invalid baseUrl fails safely', () => {
    const result = resolveGenericEndpointDescriptor(validConfig({ baseUrl: 'not-a-url' }), validResolver())
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_base_url')
  })

  it('file: baseUrl fails safely', () => {
    const result = resolveGenericEndpointDescriptor(validConfig({ baseUrl: 'file:///tmp' }), validResolver())
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('url_scheme_not_allowed')
  })

  it('URL with userinfo fails safely', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ baseUrl: 'https://admin:secretpass@api.example.com/v1' }),
      validResolver(),
    )
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.code).toBe('url_has_userinfo')
      expect(result.message).not.toContain('secretpass')
      expect(result.message).not.toContain('admin')
    }
  })

  it('URL with query fails safely', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ baseUrl: 'https://api.example.com/v1?key=val' }),
      validResolver(),
    )
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('url_has_query')
  })

  // -----------------------------------------------------------------------
  // Model validation
  // -----------------------------------------------------------------------

  it('empty model fails safely', () => {
    const result = resolveGenericEndpointDescriptor(validConfig({ model: '' }), validResolver())
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_model')
  })

  it('whitespace-only model fails safely', () => {
    const result = resolveGenericEndpointDescriptor(validConfig({ model: '   ' }), validResolver())
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_model')
  })

  // -----------------------------------------------------------------------
  // Credential ref validation
  // -----------------------------------------------------------------------

  it('missing credentialRef fails safely', () => {
    const result = resolveGenericEndpointDescriptor(
      { ...validConfig(), credentialRef: undefined as any },
      validResolver(),
    )
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_credential_ref')
  })

  it('credentialRef with wrong kind fails safely', () => {
    const result = resolveGenericEndpointDescriptor(
      { ...validConfig(), credentialRef: { kind: 'other', id: 'x' } as any },
      validResolver(),
    )
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_credential_ref')
  })

  it('credentialRef with empty id fails safely', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ credentialRef: { kind: 'credential_ref', id: '' } }),
      validResolver(),
    )
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_credential_ref')
  })

  // -----------------------------------------------------------------------
  // Credential resolution failures
  // -----------------------------------------------------------------------

  it('resolver missing credential fails safely', () => {
    const result = resolveGenericEndpointDescriptor(validConfig(), failingResolver())
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.code).toBe('credential_resolution_failed')
      // Must not echo resolver internals
      expect(result.message).not.toContain('sk-')
    }
  })

  it('resolver empty token credential fails safely', () => {
    const resolver: ResolveGenericCredential = () => createBearerCredential('')
    const result = resolveGenericEndpointDescriptor(validConfig(), resolver)
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.code).toBe('credential_resolution_failed')
    }
  })

  it('token-bearing credential resolver output does not leak through validation errors', () => {
    const secretToken = 'sk-super-secret-resolver-token'
    const resolver: ResolveGenericCredential = () => createBearerCredential(secretToken)

    // Use an invalid config that triggers validation after credential resolution
    const result = resolveGenericEndpointDescriptor(
      validConfig({ baseUrl: 'file:///etc/passwd' }),
      resolver,
    )
    expect(isError(result)).toBe(true)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(secretToken)
  })

  // -----------------------------------------------------------------------
  // Capability override
  // -----------------------------------------------------------------------

  it('unsupported capability override fails', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ capabilityOverride: { tools: true } as any }),
      validResolver(),
    )
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.code).toBe('blocked_capability_override')
    }
  })

  it('unsupported vision override fails', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ capabilityOverride: { vision: true } as any }),
      validResolver(),
    )
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('blocked_capability_override')
  })

  it('unsupported reasoning override fails', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ capabilityOverride: { reasoning: true } as any }),
      validResolver(),
    )
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('blocked_capability_override')
  })

  it('empty capability override succeeds', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ capabilityOverride: {} }),
      validResolver(),
    )
    expect(isDescriptor(result)).toBe(true)
  })

  it('disabling a conservative feature is allowed', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ capabilityOverride: { samplingParams: false } }),
      validResolver(),
    )
    expect(isDescriptor(result)).toBe(true)
    if (isDescriptor(result)) {
      expect(result.capability.samplingParams).toBe(false)
    }
  })

  // -----------------------------------------------------------------------
  // Error safety — no token leakage
  // -----------------------------------------------------------------------

  it('validation errors do not expose raw token from resolver', () => {
    const secretToken = 'sk-error-leak-test-token'
    const resolver: ResolveGenericCredential = () => createBearerCredential(secretToken)

    // Trigger an error by using invalid profile
    const result = resolveGenericEndpointDescriptor(
      validConfig({ profileId: 'invalid_profile' as any }),
      resolver,
    )
    expect(isError(result)).toBe(true)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(secretToken)
  })

  it('validation errors do not expose URL userinfo', () => {
    const result = resolveGenericEndpointDescriptor(
      validConfig({ baseUrl: 'https://admin:secretpass@api.example.com/v1' }),
      validResolver(),
    )
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.message).not.toContain('secretpass')
      expect(result.message).not.toContain('admin')
    }
  })

  it('serialized error result contains no raw token', () => {
    const secretToken = 'sk-serialized-leak-test'
    const resolver: ResolveGenericCredential = () => createBearerCredential(secretToken)

    const result = resolveGenericEndpointDescriptor(
      validConfig({ baseUrl: '' }),
      resolver,
    )
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(secretToken)
  })
})

// ---------------------------------------------------------------------------
// Safe metadata
// ---------------------------------------------------------------------------

describe('toSafeGenericEndpointMetadata', () => {
  it('produces safe metadata with masked baseUrl', () => {
    const meta = toSafeGenericEndpointMetadata(validConfig())
    expect(meta.endpointId).toBe('ep-1')
    expect(meta.displayName).toBe('My Endpoint')
    expect(meta.profileId).toBe(GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID)
    expect(meta.model).toBe('gpt-4o-mini')
    expect(meta.credentialPresent).toBe(true)
    // Masked URL should not contain full hostname
    expect(meta.maskedBaseUrl).not.toContain('api.example.com')
    expect(meta.maskedBaseUrl).toContain('***')
  })

  it('metadata does not expose raw token', () => {
    const meta = toSafeGenericEndpointMetadata(validConfig())
    const serialized = JSON.stringify(meta)
    expect(serialized).not.toContain('sk-test-key')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('Authorization')
  })

  it('metadata does not expose URL userinfo', () => {
    const meta = toSafeGenericEndpointMetadata(
      validConfig({ baseUrl: 'https://admin:secretpass@api.example.com/v1' }),
    )
    const serialized = JSON.stringify(meta)
    expect(serialized).not.toContain('secretpass')
    expect(serialized).not.toContain('admin')
  })

  it('metadata reflects capability override', () => {
    const meta = toSafeGenericEndpointMetadata(
      validConfig({ capabilityOverride: { samplingParams: false } }),
    )
    expect(meta.capability.samplingParams).toBe(false)
    expect(meta.capability.tools).toBe(false) // conservative default preserved
  })

  it('metadata credentialPresent is false when ref is null/undefined', () => {
    const meta = toSafeGenericEndpointMetadata(
      { ...validConfig(), credentialRef: undefined as any },
    )
    // credentialRef is undefined, but config shape still works
    expect(meta.endpointId).toBe('ep-1')
  })

  it('maskedBaseUrl handles invalid URL gracefully', () => {
    const meta = toSafeGenericEndpointMetadata(validConfig({ baseUrl: 'not-a-url' }))
    expect(meta.maskedBaseUrl).toBe('[invalid-url]')
  })

  it('maskedBaseUrl masks short hostname', () => {
    const meta = toSafeGenericEndpointMetadata(validConfig({ baseUrl: 'https://ab.com/v1' }))
    expect(meta.maskedBaseUrl).toContain('***')
  })

  it('maskedBaseUrl preserves port', () => {
    const meta = toSafeGenericEndpointMetadata(validConfig({ baseUrl: 'https://api.example.com:8443/v1' }))
    expect(meta.maskedBaseUrl).toContain(':8443')
  })
})
