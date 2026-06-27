import { describe, expect, it } from 'vitest'

import { checkConfigIntegrity, validateAndCleanConfig } from './configSchema'

describe('configSchema provider credential secure-store keys', () => {
  it('keeps provider credential secure-store records during config cleanup', () => {
    const secureRecord = {
      version: 1,
      providerKey: 'openrouter',
      backend: 'electron_safe_storage',
      ciphertextBase64: 'encrypted',
      updatedAtMs: 1,
    }

    const result = validateAndCleanConfig({
      configVersion: 2,
      providerCredentials: {
        v1: {
          openrouter: secureRecord,
        },
      },
      'providerCredentials.v1.openrouter': secureRecord,
      unknownLargeField: { removed: true },
    })

    expect(result.cleaned.providerCredentials).toEqual({ v1: { openrouter: secureRecord } })
    expect(result.cleaned['providerCredentials.v1.openrouter']).toEqual(secureRecord)
    expect(result.removed.map((item) => item.key)).toEqual(['unknownLargeField'])
  })

  it('does not report provider credential secure-store records as illegal keys', () => {
    const store = {
      store: {
        configVersion: 2,
        providerCredentials: {
          v1: {
            deepseek: {
              version: 1,
              providerKey: 'deepseek',
              backend: 'electron_safe_storage',
              ciphertextBase64: 'encrypted',
              updatedAtMs: 1,
            },
          },
        },
      },
    }

    expect(checkConfigIntegrity(store)).toEqual({ ok: true })
  })
})
