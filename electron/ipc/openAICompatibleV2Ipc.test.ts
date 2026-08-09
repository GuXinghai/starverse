import BetterSqlite3 from 'better-sqlite3'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { OPENAI_COMPATIBLE_V2_IPC_CHANNELS, registerOpenAICompatibleV2Ipc } from './openAICompatibleV2Ipc'

describe('OpenAI-compatible V2 IPC', () => {
  let db: BetterSqlite3.Database
  let handlers: Map<string, (event: unknown, payload?: unknown) => unknown>
  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    handlers = new Map()
    expect(registerOpenAICompatibleV2Ipc({ db, registerInvoke: (channel, handler) => handlers.set(channel, handler), credentialService: {
      getStatus: async () => ({ credentialVersionRef: 'ocp_credential_12345678', providerInstanceId: 'ocp_provider_12345678', configured: false, revision: 0 }),
      write: async () => ({ credentialVersionRef: 'ocp_credential_12345678', providerInstanceId: 'ocp_provider_12345678', configured: true, revision: 1, credentialScopeId: 'credential-scope-v2:'.concat('0'.repeat(64)) }),
      clear: async () => ({ credentialVersionRef: 'ocp_credential_12345678', providerInstanceId: 'ocp_provider_12345678', configured: false, revision: 2 }),
      withCredential: async () => { throw new Error('not expected') },
    } as never, fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
      proxyMode: () => 'direct' }))
      .toEqual(OPENAI_COMPATIBLE_V2_IPC_CHANNELS)
  })
  afterEach(() => db.close())

  it('creates a closed default compatible configuration through V2-only channels', async () => {
    const create = handlers.get('generation-v2:openai-compatible:create')!
    const result = await create({}, { displayName: 'Endpoint', baseUrl: 'https://example.test/', securityPolicy: 'strict_ssrf', credential: { mode: 'none' }, ordinaryHeaders: [], query: [] }) as any
    expect(result.ok).toBe(true)
    expect(result.value.details.protocolContractId).toBe('openai_chat_compatible')
    expect(result.value.activeConfiguration.requestProfile.payload.extraBody.enabled).toBe(true)
    expect(handlers.get('generation-v2:openai-compatible:list')!({}, undefined)).toMatchObject({ ok: true, value: [expect.any(Object)] })
  })

  it('rejects extension-shaped unknown IPC payload fields before repository access', async () => {
    const create = handlers.get('generation-v2:openai-compatible:create')!
    await expect(create({}, { displayName: 'Endpoint', baseUrl: 'https://example.test/', securityPolicy: 'strict_ssrf', credential: { mode: 'none' }, ordinaryHeaders: [], query: [], protocol: 'responses' }))
      .resolves.toEqual({ ok: false, code: 'GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID' })
  })
})
