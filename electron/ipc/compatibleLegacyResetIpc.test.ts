import { describe, expect, it, vi } from 'vitest'
import { registerCompatibleLegacyResetIpc } from './compatibleLegacyResetIpc'

describe('compatibleLegacyResetIpc', () => {
  it('exposes redacted preview and requires the exact destructive confirmation', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
    const service = { preview: vi.fn(async () => ({ schemaVersion: 1, database: { counts: {}, total: 0 }, config: { deprecatedKeyCount: 0 }, secureStore: { orphanRefCount: 0, cleanupFailed: 0 } })), apply: vi.fn(async () => ({ ok: true })) }
    registerCompatibleLegacyResetIpc({ registerInvoke: ((channel: string, handler: any) => handlers.set(channel, handler)) as any, service: service as any })
    await expect(handlers.get('compatible-reset:preview')!({}, {})).resolves.toMatchObject({ schemaVersion: 1 })
    expect(() => handlers.get('compatible-reset:apply')!({}, { confirmation: 'yes' })).toThrow()
    await expect(handlers.get('compatible-reset:apply')!({}, { confirmation: 'delete_incompatible_compatible_state' })).resolves.toEqual({ ok: true })
    expect(service.apply).toHaveBeenCalledTimes(1)
  })
})
