import { describe, expect, it, vi } from 'vitest'
import {
  Epoch2RuntimeCredentialError,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import { registerGenerationV2CredentialSettingsIpc } from './generationV2CredentialSettingsIpc'
import type { IpcInvokeHandler } from './types'

function registerWith(
  getStatus: Epoch2RuntimeCredentialService['getStatus'],
  updateCredential: Epoch2RuntimeCredentialService['updateCredential'] = vi.fn(),
) {
  const handlers = new Map<string, IpcInvokeHandler>()
  const credentialService = {
    getStatus,
    updateCredential,
    clearCredential: vi.fn(),
  } as unknown as Epoch2RuntimeCredentialService
  registerGenerationV2CredentialSettingsIpc({
    credentialService,
    registerInvoke: (channel, handler) => { handlers.set(channel, handler) },
  })
  return handlers
}

describe('generationV2CredentialSettingsIpc', () => {
  it('returns credential metadata only, never the stored API key', async () => {
    const rawStatus = Object.freeze({
      providerKey: 'openrouter' as const, configured: true, revision: 3,
      credentialScopeId: `credential-scope-v2:${'a'.repeat(64)}` as CredentialScopeIdV2,
      availability: 'available' as const, sessionOverridesPersistent: false, diagnosticCode: undefined,
      // Deliberately hostile extra field: the public IPC projection must ignore it.
      apiKey: 'sk-private-api-key',
    })
    const handlers = registerWith(vi.fn(async () => rawStatus as Awaited<ReturnType<Epoch2RuntimeCredentialService['getStatus']>>))

    const result = await handlers.get('generation-v2:credentials:openrouter:get-status')?.(undefined) as any
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({ ok: true, status: { apiKeyConfigured: true, maskedApiKey: '***' } })
    expect(serialized).not.toContain('sk-private-api-key')
    expect(result.status).not.toHaveProperty('apiKey')
    expect(result.status).not.toHaveProperty('credential')
  })

  it.each([
    'EPOCH2_RUNTIME_CREDENTIAL_DRIFT',
    'EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE',
  ] as const)('preserves known Epoch2 credential diagnostic %s instead of collapsing it', async (code) => {
    const handlers = registerWith(vi.fn(async () => {
      throw new Epoch2RuntimeCredentialError(code)
    }))

    const result = await handlers.get('generation-v2:credentials:openrouter:get-status')?.(undefined) as any

    expect(result).toMatchObject({
      ok: false,
      code,
      message: code,
      providerFailure: {
        origin: 'secure_storage',
        operationId: 'credential:status:openrouter',
        starverseDiagnosticCode: code,
        transportError: {
          name: 'Epoch2RuntimeCredentialError',
          message: code,
        },
      },
    })
  })

  it('preserves an exact safe-storage diagnostic from the update path', async () => {
    const status = Object.freeze({
      providerKey: 'openrouter' as const,
      configured: false,
      revision: 0,
      availability: 'unknown' as const,
      sessionOverridesPersistent: false,
    })
    const handlers = registerWith(
      vi.fn(async () => status),
      vi.fn(async () => {
        throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE')
      }),
    )

    const result = await handlers.get('generation-v2:credentials:openrouter:update')?.(
      undefined,
      { apiKey: 'sk-write-only' },
    ) as any

    expect(result).toMatchObject({
      ok: false,
      code: 'EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE',
      providerFailure: {
        starverseDiagnosticCode: 'EPOCH2_RUNTIME_CREDENTIAL_SAFE_STORAGE_UNAVAILABLE',
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-write-only')
  })

  it('retains useful unknown-error context while redacting credentials and local paths', async () => {
    const handlers = registerWith(vi.fn(async () => {
      throw new Error('read failed at C:\\Users\\alice\\vault.db; apiKey=sk-test-secret')
    }))

    const result = await handlers.get('generation-v2:credentials:openrouter:get-status')?.(undefined) as any
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      ok: false,
      code: 'PROVIDER_CREDENTIAL_STORE_FAILED',
      providerFailure: {
        starverseDiagnosticCode: 'PROVIDER_CREDENTIAL_STORE_FAILED',
      },
    })
    expect(result.message).toContain('read failed at [local path redacted]')
    expect(result.message).toContain('apiKey=[redacted]')
    expect(serialized).not.toContain('sk-test-secret')
    expect(serialized).not.toContain('C:\\Users\\alice')
  })
})
