import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { LOCAL_ENDPOINT_PROFILE_V2_IPC_CHANNELS, registerLocalEndpointProfileV2Ipc } from './localEndpointProfileV2Ipc'

describe('localEndpointProfileV2Ipc', () => {
  it('does not acknowledge committed profile mutations until materialization completes', async () => {
    const db = new BetterSqlite3(':memory:')
    const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown>()
    let releaseMaterialization!: () => void
    const materialization = new Promise<void>((resolve) => { releaseMaterialization = resolve })
    const onCommittedSubjectMutation = vi.fn(() => materialization)
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    try {
      registerLocalEndpointProfileV2Ipc({
        db,
        registerInvoke: (channel, handler) => { handlers.set(channel, handler) },
        onCommittedSubjectMutation,
      })
      const create = handlers.get(LOCAL_ENDPOINT_PROFILE_V2_IPC_CHANNELS[1])!
      const createResult = create({}, {
        providerId: 'generic_local', protocolContractId: 'generic-local-openai-chat-completions',
        baseUrl: 'http://127.0.0.1:1234/', protocolConfig: { modelId: 'local-model' },
      })
      await vi.waitFor(() => expect(onCommittedSubjectMutation).toHaveBeenCalledTimes(1))
      expect(createResult).toBeInstanceOf(Promise)
      let acknowledged = false
      void Promise.resolve(createResult).then(() => { acknowledged = true })
      await Promise.resolve()
      expect(acknowledged).toBe(false)
      releaseMaterialization()
      const created = await createResult as { ok: true; value: { endpointProfileId: string } }
      expect(created.ok).toBe(true)
      expect(onCommittedSubjectMutation).toHaveBeenCalledTimes(1)

      const remove = handlers.get(LOCAL_ENDPOINT_PROFILE_V2_IPC_CHANNELS[2])!
      await expect(remove({}, { endpointProfileId: created.value.endpointProfileId })).resolves.toEqual({
        ok: true, value: { deleted: true },
      })
      expect(onCommittedSubjectMutation).toHaveBeenCalledTimes(2)
      await expect(remove({}, { endpointProfileId: created.value.endpointProfileId })).resolves.toEqual({
        ok: true, value: { deleted: false },
      })
      expect(onCommittedSubjectMutation).toHaveBeenCalledTimes(2)
    } finally {
      db.close()
    }
  })
})
