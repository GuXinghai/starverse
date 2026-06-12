import { describe, expect, it } from 'vitest'
import {
  GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
  buildChatCompletionsUrl,
  validateGenericEndpointDescriptor,
  validateCapabilityOverride,
  validateGenericRequestedCapabilities,
  type GenericEndpointDescriptor,
  type DescriptorValidationError,
} from '@/next/provider/generic/genericEndpointDescriptor'
import { isCredentialValid } from '@/next/provider/credentials/providerCredential'

function isValid(result: GenericEndpointDescriptor | DescriptorValidationError): result is GenericEndpointDescriptor {
  return 'profileId' in result
}

function isError(result: GenericEndpointDescriptor | DescriptorValidationError): result is DescriptorValidationError {
  return 'code' in result && 'message' in result
}

function isUrlOk(result: string | DescriptorValidationError): result is string {
  return typeof result === 'string'
}

function isUrlError(result: string | DescriptorValidationError): result is DescriptorValidationError {
  return typeof result !== 'string'
}

describe('buildChatCompletionsUrl', () => {
  it('appends /chat/completions to clean base', () => {
    const result = buildChatCompletionsUrl('https://api.example.com/v1')
    expect(isUrlOk(result)).toBe(true)
    if (isUrlOk(result)) expect(result).toBe('https://api.example.com/v1/chat/completions')
  })

  it('strips trailing slash before appending', () => {
    const result = buildChatCompletionsUrl('https://api.example.com/v1/')
    expect(isUrlOk(result)).toBe(true)
    if (isUrlOk(result)) expect(result).toBe('https://api.example.com/v1/chat/completions')
  })

  it('strips multiple trailing slashes', () => {
    const result = buildChatCompletionsUrl('https://api.example.com/v1///')
    expect(isUrlOk(result)).toBe(true)
    if (isUrlOk(result)) expect(result).toBe('https://api.example.com/v1/chat/completions')
  })

  it('leaves /chat/completions URL unchanged', () => {
    const result = buildChatCompletionsUrl('https://api.example.com/v1/chat/completions')
    expect(isUrlOk(result)).toBe(true)
    if (isUrlOk(result)) expect(result).toBe('https://api.example.com/v1/chat/completions')
  })

  it('accepts http://localhost with port', () => {
    const result = buildChatCompletionsUrl('http://localhost:1234/v1')
    expect(isUrlOk(result)).toBe(true)
    if (isUrlOk(result)) expect(result).toBe('http://localhost:1234/v1/chat/completions')
  })

  it('accepts https with port', () => {
    const result = buildChatCompletionsUrl('https://api.example.com:8443/v1')
    expect(isUrlOk(result)).toBe(true)
    if (isUrlOk(result)) expect(result).toBe('https://api.example.com:8443/v1/chat/completions')
  })

  it('trims whitespace', () => {
    const result = buildChatCompletionsUrl('  https://api.example.com/v1  ')
    expect(isUrlOk(result)).toBe(true)
    if (isUrlOk(result)) expect(result).toBe('https://api.example.com/v1/chat/completions')
  })

  it('rejects empty string', () => {
    const result = buildChatCompletionsUrl('')
    expect(isUrlError(result)).toBe(true)
    if (isUrlError(result)) expect(result.code).toBe('invalid_base_url')
  })

  it('rejects whitespace-only', () => {
    const result = buildChatCompletionsUrl('   ')
    expect(isUrlError(result)).toBe(true)
    if (isUrlError(result)) expect(result.code).toBe('invalid_base_url')
  })

  it('rejects invalid URL', () => {
    const result = buildChatCompletionsUrl('not a url')
    expect(isUrlError(result)).toBe(true)
    if (isUrlError(result)) expect(result.code).toBe('invalid_base_url')
  })

  it('rejects file: protocol', () => {
    const result = buildChatCompletionsUrl('file:///etc/passwd')
    expect(isUrlError(result)).toBe(true)
    if (isUrlError(result)) expect(result.code).toBe('url_scheme_not_allowed')
  })

  it('rejects data: protocol', () => {
    const result = buildChatCompletionsUrl('data:text/html,<h1>hi</h1>')
    expect(isUrlError(result)).toBe(true)
    if (isUrlError(result)) expect(result.code).toBe('url_scheme_not_allowed')
  })

  it('rejects javascript: protocol', () => {
    const result = buildChatCompletionsUrl('javascript:alert(1)')
    expect(isUrlError(result)).toBe(true)
    if (isUrlError(result)) expect(result.code).toBe('url_scheme_not_allowed')
  })

  it('rejects URL with username/password', () => {
    const result = buildChatCompletionsUrl('https://user:pass@api.example.com/v1')
    expect(isUrlError(result)).toBe(true)
    if (isUrlError(result)) expect(result.code).toBe('url_has_userinfo')
  })

  it('rejects URL with query string', () => {
    const result = buildChatCompletionsUrl('https://api.example.com/v1?key=val')
    expect(isUrlError(result)).toBe(true)
    if (isUrlError(result)) expect(result.code).toBe('url_has_query')
  })

  it('rejects URL with fragment', () => {
    const result = buildChatCompletionsUrl('https://api.example.com/v1#section')
    expect(isUrlError(result)).toBe(true)
    if (isUrlError(result)) expect(result.code).toBe('url_has_fragment')
  })
})

describe('validateGenericEndpointDescriptor', () => {
  const validInput = {
    profileId: GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'sk-test-123',
  }

  it('produces valid descriptor with normalized URL and trimmed model', () => {
    const result = validateGenericEndpointDescriptor(validInput)
    expect(isValid(result)).toBe(true)
    if (isValid(result)) {
      expect(result.profileId).toBe(GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID)
      expect(result.baseUrl).toBe('https://api.example.com/v1/chat/completions')
      expect(result.model).toBe('gpt-4o-mini')
      expect(isCredentialValid(result.credential)).toBe(true)
    }
  })

  it('trims model whitespace', () => {
    const result = validateGenericEndpointDescriptor({ ...validInput, model: '  gpt-4o  ' })
    expect(isValid(result)).toBe(true)
    if (isValid(result)) expect(result.model).toBe('gpt-4o')
  })

  it('rejects unknown profile id', () => {
    const result = validateGenericEndpointDescriptor({ ...validInput, profileId: 'deepseek_v3' })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_profile')
  })

  it('rejects empty baseUrl', () => {
    const result = validateGenericEndpointDescriptor({ ...validInput, baseUrl: '' })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_base_url')
  })

  it('rejects invalid baseUrl', () => {
    const result = validateGenericEndpointDescriptor({ ...validInput, baseUrl: 'not-a-url' })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_base_url')
  })

  it('rejects file: baseUrl', () => {
    const result = validateGenericEndpointDescriptor({ ...validInput, baseUrl: 'file:///tmp' })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('url_scheme_not_allowed')
  })

  it('rejects baseUrl with userinfo', () => {
    const result = validateGenericEndpointDescriptor({ ...validInput, baseUrl: 'https://user:pass@api.example.com/v1' })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('url_has_userinfo')
  })

  it('rejects empty model', () => {
    const result = validateGenericEndpointDescriptor({ ...validInput, model: '' })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_model')
  })

  it('rejects whitespace-only model', () => {
    const result = validateGenericEndpointDescriptor({ ...validInput, model: '   ' })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_model')
  })

  it('rejects empty apiKey', () => {
    const result = validateGenericEndpointDescriptor({ ...validInput, apiKey: '' })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.code).toBe('invalid_credential')
  })

  it('validation errors do not expose raw token', () => {
    const result = validateGenericEndpointDescriptor({ ...validInput, apiKey: '' })
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.message).not.toContain('sk-test')
    }
  })

  it('validation errors do not expose URL userinfo', () => {
    const secretUrl = 'https://admin:secretpass@api.example.com/v1'
    const result = validateGenericEndpointDescriptor({ ...validInput, baseUrl: secretUrl })
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.message).not.toContain('secretpass')
      expect(result.message).not.toContain('admin')
    }
  })
})

describe('GenericRuntimeCapability', () => {
  it('defaults are conservative', () => {
    const result = validateGenericEndpointDescriptor({
      profileId: GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
    })
    expect(isValid(result)).toBe(true)
    if (isValid(result)) {
      const cap = result.capability
      expect(cap.textChat).toBe(true)
      expect(cap.basicMessages).toBe(true)
      expect(cap.streamingText).toBe(true)
      expect(cap.basicHttpError).toBe(true)
      expect(cap.samplingParams).toBe(true)
      expect(cap.tools).toBe(false)
      expect(cap.functionCalling).toBe(false)
      expect(cap.files).toBe(false)
      expect(cap.pdf).toBe(false)
      expect(cap.vision).toBe(false)
      expect(cap.multimodal).toBe(false)
      expect(cap.reasoning).toBe(false)
      expect(cap.webSearch).toBe(false)
      expect(cap.structuredOutput).toBe(false)
      expect(cap.imageGeneration).toBe(false)
      expect(cap.audio).toBe(false)
      expect(cap.video).toBe(false)
      expect(cap.parallelToolCalls).toBe(false)
      expect(cap.providerHostedTools).toBe(false)
      expect(cap.usageFinalGuaranteed).toBe(false)
    }
  })
})

describe('validateCapabilityOverride', () => {
  it('accepts empty override', () => {
    expect(validateCapabilityOverride({})).toBeNull()
  })

  it('blocks tools enable', () => {
    const result = validateCapabilityOverride({ tools: true })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('blocked_capability_override')
  })

  it('blocks vision enable', () => {
    const result = validateCapabilityOverride({ vision: true })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('blocked_capability_override')
  })

  it('blocks reasoning enable', () => {
    const result = validateCapabilityOverride({ reasoning: true })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('blocked_capability_override')
  })

  it('blocks webSearch enable', () => {
    const result = validateCapabilityOverride({ webSearch: true })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('blocked_capability_override')
  })

  it('blocks imageGeneration enable', () => {
    const result = validateCapabilityOverride({ imageGeneration: true })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('blocked_capability_override')
  })

  it('blocks structuredOutput enable', () => {
    const result = validateCapabilityOverride({ structuredOutput: true })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('blocked_capability_override')
  })

  it('allows disabling a supported feature', () => {
    // Disabling samplingParams is allowed — it's a conservative supported feature
    expect(validateCapabilityOverride({ samplingParams: false })).toBeNull()
  })

  it('allows setting blocked feature to false', () => {
    expect(validateCapabilityOverride({ tools: false })).toBeNull()
  })
})

describe('profileId safety', () => {
  const secretToken = 'sk-super-secret-token-12345'

  it('token-bearing profileId fails with static safe message', () => {
    const result = validateGenericEndpointDescriptor({
      profileId: secretToken,
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
    })
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.code).toBe('invalid_profile')
      expect(result.message).not.toContain(secretToken)
      expect(result.message).toBe('Unsupported Generic endpoint profile id.')
    }
  })

  it('Bearer-token profileId fails with static safe message', () => {
    const bearerProfileId = `Bearer ${secretToken}`
    const result = validateGenericEndpointDescriptor({
      profileId: bearerProfileId,
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
    })
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.message).not.toContain(secretToken)
      expect(result.message).not.toContain('Bearer')
      expect(result.message).toBe('Unsupported Generic endpoint profile id.')
    }
  })

  it('serialized descriptor validation result does not contain raw token', () => {
    const result = validateGenericEndpointDescriptor({
      profileId: secretToken,
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(secretToken)
  })
})

describe('validateGenericRequestedCapabilities', () => {
  const baseConfig = {
    model: 'gpt-4o-mini',
    requestedReasoningMode: 'auto' as const,
  }

  it('accepts empty config', () => {
    expect(validateGenericRequestedCapabilities(baseConfig)).toBeNull()
  })

  it('accepts sampling params', () => {
    expect(validateGenericRequestedCapabilities({
      ...baseConfig,
      samplingParams: { temperature: 0.7, top_p: 0.9, max_tokens: 1024 },
    })).toBeNull()
  })

  it('rejects tools', () => {
    const result = validateGenericRequestedCapabilities({
      ...baseConfig,
      tools: [{ type: 'function', function: { name: 'fn' } }],
    })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('blocked_capability_override')
  })

  it('rejects webSearch', () => {
    const result = validateGenericRequestedCapabilities({
      ...baseConfig,
      webSearch: { requestPatch: {}, resolvedMode: 'enable' },
    })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('blocked_capability_override')
  })

  it('rejects imageGeneration', () => {
    const result = validateGenericRequestedCapabilities({
      ...baseConfig,
      imageGeneration: { capabilityClass: 'text-to-image' },
    })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('blocked_capability_override')
  })

  it('rejects additionalPlugins', () => {
    const result = validateGenericRequestedCapabilities({
      ...baseConfig,
      additionalPlugins: [{ id: 'file-parser' }],
    })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('blocked_capability_override')
  })

  it('rejects reasoning mode effort', () => {
    const result = validateGenericRequestedCapabilities({
      ...baseConfig,
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: 'high',
    })
    expect(result).not.toBeNull()
    expect(result?.code).toBe('blocked_capability_override')
  })

  it('accepts reasoning mode auto', () => {
    expect(validateGenericRequestedCapabilities({
      ...baseConfig,
      requestedReasoningMode: 'auto',
    })).toBeNull()
  })

  it('accepts empty tools array', () => {
    expect(validateGenericRequestedCapabilities({
      ...baseConfig,
      tools: [],
    })).toBeNull()
  })

  it('accepts empty additionalPlugins array', () => {
    expect(validateGenericRequestedCapabilities({
      ...baseConfig,
      additionalPlugins: [],
    })).toBeNull()
  })

  it('error messages do not expose raw token', () => {
    const result = validateGenericRequestedCapabilities({
      ...baseConfig,
      tools: ['sk-secret-token-12345'],
    })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.message).not.toContain('sk-secret-token-12345')
    }
  })
})
