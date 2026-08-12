import { describe, expect, it, vi } from 'vitest'
import {
  Epoch2RuntimeCredentialError,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import { registerGenerationV2CredentialSettingsIpc } from './generationV2CredentialSettingsIpc'
import type { IpcInvokeHandler } from './types'

function registerWith(getStatus: Epoch2RuntimeCredentialService['getStatus']) {
  const handlers = new Map<string, IpcInvokeHandler>()
  const credentialService = {
    getStatus,
    updateCredential: vi.fn(),
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

  it('preserves known Epoch2 credential diagnostics instead of collapsing them to a generic store error', async () => {
    const handlers = registerWith(vi.fn(async () => {
      throw new Epoch2RuntimeCredentialError('EPOCH2_RUNTIME_CREDENTIAL_DRIFT')
    }))

    const result = await handlers.get('generation-v2:credentials:openrouter:get-status')?.(undefined) as any

    expect(result).toMatchObject({
      ok: false,
      code: 'EPOCH2_RUNTIME_CREDENTIAL_DRIFT',
      message: 'EPOCH2_RUNTIME_CREDENTIAL_DRIFT',
      providerFailure: {
        origin: 'secure_storage',
        operationId: 'credential:status:openrouter',
        starverseDiagnosticCode: 'EPOCH2_RUNTIME_CREDENTIAL_DRIFT',
        transportError: {
          name: 'Epoch2RuntimeCredentialError',
          message: 'EPOCH2_RUNTIME_CREDENTIAL_DRIFT',
        },
      },
    })
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
