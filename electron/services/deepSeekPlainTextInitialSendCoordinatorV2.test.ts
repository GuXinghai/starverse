import BetterSqlite3 from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  leases: new WeakSet<object>(),
  scopes: new WeakSet<object>(),
}))

vi.mock('electron', () => ({ session: { defaultSession: { fetch: mocks.fetch } } }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) =>
    Boolean(value && typeof value === 'object' && mocks.leases.has(value)),
  isEpoch2CredentialScopeBindingAuthority: (value: unknown) =>
    Boolean(value && typeof value === 'object' && mocks.scopes.has(value)),
}))

import { createDeepSeekPlainTextInitialSendCoordinatorV2 } from './deepSeekPlainTextInitialSendCoordinatorV2'

const scope = 'credential-scope-v2:'.concat('a'.repeat(64)) as never

function response(): Response {
  const value = new Response(JSON.stringify({
    object: 'list', data: [{ id: 'deepseek-v4-pro', object: 'model', owned_by: 'deepseek' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  return Object.freeze({
    status: 200, url: 'https://api.deepseek.com/models', headers: value.headers, body: value.body,
  }) as unknown as Response
}

function credentialService(fail = false) {
  return {
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      if (fail) throw new Error('credential unavailable')
      const state = { active: true }
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease', usage: 'provider_transport_only',
        providerKey: 'deepseek', credential: 'sk-test', revision: 1,
        credentialScopeId: scope,
        assertCurrent: () => { if (!state.active) throw new Error('stale credential') },
      })
      mocks.leases.add(lease)
      try { return await consume(lease as never) } finally {
        state.active = false
        mocks.leases.delete(lease)
      }
    },
  } as never
}

function database(filename = ':memory:'): BetterSqlite3.Database {
  const db = new BetterSqlite3(filename)
  applyGenerationV2SchemaForTest(db, process.cwd())
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, {
      projectId: 'project:1', conversationId: 'conversation:1', branchId: 'branch:1',
      title: 'Conversation', branchName: 'Main', createdAtMs: 2,
    })
  })
  return db
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
    userBody: 'hello', modelId: 'deepseek-v4-pro', commandAttachments: [], ...overrides,
  }
}

function coordinator(db: BetterSqlite3.Database, failCredential = false) {
  let next = 0
  return createDeepSeekPlainTextInitialSendCoordinatorV2({
    db, credentialService: credentialService(failCredential), nowMs: () => 100,
    createGraphId: (kind) => `${kind}:${++next}`,
  })
}

beforeEach(() => {
  mocks.fetch.mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-17T12:00:00.000Z'))
})
afterEach(() => vi.restoreAllMocks())

describe('DeepSeek plain-text initial-send coordinator V2', () => {
  it('commits once and immediately returns chosen/head/candidate projection', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
      const result = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(result.kind).toBe('created')
      expect(result.execution.operation).toMatchObject({
        operationId: { value: 'operation:1' }, resultAnswerRootId: { value: 'answer:2' },
      })
      expect(result.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:2' }, headMessageId: { value: 'answer:2' },
      })
      expect(result.projection.visibleCandidates.map((value) => value.value)).toEqual(['answer:2'])
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
    } finally { db.close() }
  })

  it('replays through a fresh coordinator without credential or network access', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
      const first = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const replay = await coordinator(db, true).submit({
        command: command(), expectedCredentialRevision: 999, expectedCredentialScopeId: scope,
      })
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.execution.operation.resultAnswerRootId.value)
        .toBe(first.execution.operation.resultAnswerRootId.value)
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
      expect(db.prepare('SELECT count(*) AS count FROM message_v2').get()).toEqual({ count: 2 })
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get()).toEqual({ count: 1 })
      expect(() => db.prepare("UPDATE message_body_v2 SET body_text='tampered' WHERE message_id='question:1'").run())
        .toThrow('GENERATION_V2_INITIAL_SEND_COMMAND_INPUT_IMMUTABLE')
    } finally { db.close() }
  })

  it('replays after database reopen even when config and credential have changed', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'starverse-initial-send-'))
    const filename = path.join(directory, 'starverse.db')
    let db = database(filename)
    try {
      mocks.fetch.mockResolvedValueOnce(response())
      const first = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, generation: { temperature: 0.7 },
      })
      db.close()
      db = new BetterSqlite3(filename)
      const replay = await coordinator(db, true).submit({
        command: command(), expectedCredentialRevision: 999, expectedCredentialScopeId: scope,
      })
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.execution.operation.resultAnswerRootId.value)
        .toBe(first.execution.operation.resultAnswerRootId.value)
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
    } finally {
      if (db.open) db.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('returns the transaction winner when two callers initially observe the operation as missing', async () => {
    const db = database()
    try {
      let releaseFirst!: (value: Response) => void
      const firstResponse = new Promise<Response>((resolve) => { releaseFirst = resolve })
      mocks.fetch.mockReturnValueOnce(firstResponse).mockResolvedValueOnce(response())
      const firstPromise = coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1))
      const winner = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      releaseFirst(response())
      const raced = await firstPromise
      expect(winner.kind).toBe('created')
      expect(raced.kind).toBe('idempotent_replay')
      expect(raced.execution.operation.resultAnswerRootId.value)
        .toBe(winner.execution.operation.resultAnswerRootId.value)
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get()).toEqual({ count: 1 })
      expect(db.prepare('SELECT count(*) AS count FROM message_v2').get()).toEqual({ count: 2 })
    } finally { db.close() }
  })

  it('replays without moving a branch that has advanced to a later turn', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response()).mockResolvedValueOnce(response())
      const service = coordinator(db)
      const first = await service.submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const firstAnswer = first.execution.operation.resultAnswerRootId.value
      const later = await service.submit({
        command: command({
          operationId: 'operation:2', expectedHeadMessageId: firstAnswer, userBody: 'later',
        }),
        expectedCredentialRevision: 1,
        expectedCredentialScopeId: scope,
      })
      const laterHead = later.execution.operation.resultAnswerRootId.value
      const replay = await coordinator(db, true).submit({
        command: command(), expectedCredentialRevision: 999, expectedCredentialScopeId: scope,
      })
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.projection.branchProjection.chosenAnswerRootId?.value).toBe(firstAnswer)
      expect(replay.projection.branchProjection.headMessageId?.value).toBe(laterHead)
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: laterHead })
      expect(mocks.fetch).toHaveBeenCalledTimes(2)
    } finally { db.close() }
  })

  it.each([
    ['body', { userBody: 'changed' }],
    ['head', { expectedHeadMessageId: 'answer:other' }],
    ['branch', { branchId: 'branch:other' }],
    ['model', { modelId: 'deepseek-chat' }],
  ])('rejects the same operation id with different %s', async (_name, override) => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
      await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await expect(coordinator(db, true).submit({
        command: command(override), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })).rejects.toThrow('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
    } finally { db.close() }
  })
})
