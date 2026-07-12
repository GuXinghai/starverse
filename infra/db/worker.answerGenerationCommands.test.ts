import path from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { DbWorkerRuntime } from './worker'

const snapshot = (modelId = 'model-a') => ({
  schemaVersion: 1,
  route: { providerId: 'openrouter', modelId, endpointId: 'openrouter-official', profileId: 'openrouter_v1_chat' },
  generationParams: { requestPatch: { temperature: 0.2 }, requestParams: { temperature: 0.2 } },
  reasoning: { mode: 'auto', effort: null, exclude: false },
  webSearch: { enabled: false },
  imageGeneration: {},
  providerOptions: {},
  tools: { enabled: false, allowedToolIds: [], requireExternalSideEffectConfirmation: true },
  attachments: { sourceQuestionId: 'placeholder', items: [] },
})

async function fixture() {
  const runtime = new DbWorkerRuntime({ dbPath: ':memory:', schemaPath: path.resolve('infra/db/schema.sql') })
  const created = await runtime.handleMessage({ id: '1', method: 'convo.create', params: { title: 'Chat' } }) as any
  const convoId = String(created.result.id)
  const question = await runtime.handleMessage({ id: '2', method: 'message.append', params: { convoId, role: 'user', body: 'Q' } }) as any
  const questionId = String(question.result.id)
  const answer = await runtime.handleMessage({ id: '3', method: 'message.append', params: { convoId, role: 'assistant', body: 'A', parentId: questionId } }) as any
  const answerId = String(answer.result.id)
  const branch = await runtime.handleMessage({ id: '4', method: 'branch.ensureDefault', params: { convoId, name: 'Main' } }) as any
  const branchId = String(branch.result.id)
  await runtime.handleMessage({ id: '5', method: 'branchChoice.set', params: { branchId, questionId, chosenAnswerRootId: answerId } })
  await runtime.handleMessage({ id: '6', method: 'answerGeneration.persistSnapshot', params: { answerRootId: answerId, snapshot: { ...snapshot(), attachments: { sourceQuestionId: questionId, items: [] } } } })
  return { runtime, convoId, branchId, questionId, answerId }
}

describe('assistant answer generation commands', () => {
  it('regenerate atomically creates, snapshots, chooses and moves head using the supplied current config', async () => {
    const { runtime, convoId, branchId, questionId, answerId } = await fixture()
    const current = { ...snapshot('model-current'), attachments: { sourceQuestionId: questionId, items: [] } }
    const result = await runtime.handleMessage({
      id: '7', method: 'branch.regenerateQuestionWithCurrentConfig',
      params: { operationId: 'op-regen', branchId, questionId, snapshot: current },
    }) as any
    expect(result.ok).toBe(true)
    expect(result.result.newAnswerRootId).not.toBe(answerId)
    expect(result.result.chosenAnswerRootId).toBe(result.result.newAnswerRootId)
    expect(result.result.headMessageId).toBe(result.result.newAnswerRootId)
    expect(result.result.snapshot.route.modelId).toBe('model-current')
    const candidates = await runtime.handleMessage({ id: '8', method: 'branch.getCandidates', params: { branchId, questionId } }) as any
    expect(candidates.result.map((item: any) => item.answerRootId)).toEqual(expect.arrayContaining([answerId, result.result.newAnswerRootId]))
    const branches = await runtime.handleMessage({ id: '9', method: 'branch.list', params: { convoId } }) as any
    expect(branches.result[0].headMessageId).toBe(result.result.newAnswerRootId)
  })

  it('retry-as-new copies the chosen target snapshot, keeps the target visible and is operation-idempotent', async () => {
    const { runtime, branchId, questionId, answerId } = await fixture()
    const request = { operationId: 'op-new', branchId, questionId, targetAnswerRootId: answerId }
    const first = await runtime.handleMessage({ id: '7', method: 'branch.retryChosenAnswerAsNew', params: request }) as any
    const replay = await runtime.handleMessage({ id: '8', method: 'branch.retryChosenAnswerAsNew', params: request }) as any
    expect(first.ok).toBe(true)
    expect(replay.result.newAnswerRootId).toBe(first.result.newAnswerRootId)
    expect(replay.result.idempotentReplay).toBe(true)
    expect(first.result.snapshot.route.modelId).toBe('model-a')
    const concurrent = await runtime.handleMessage({
      id: '8b', method: 'branch.regenerateQuestionWithCurrentConfig',
      params: { operationId: 'op-concurrent', branchId, questionId, snapshot: { ...snapshot(), attachments: { sourceQuestionId: questionId, items: [] } } },
    })
    expect(concurrent.ok).toBe(false)
    const candidates = await runtime.handleMessage({ id: '9', method: 'branch.getCandidates', params: { branchId, questionId } }) as any
    expect(candidates.result.map((item: any) => item.answerRootId)).toEqual(expect.arrayContaining([answerId, first.result.newAnswerRootId]))
  })

  it('retry-replace hides the chosen target at commit and terminal failure never restores choice/head', async () => {
    const { runtime, convoId, branchId, questionId, answerId } = await fixture()
    const result = await runtime.handleMessage({
      id: '7', method: 'branch.retryChosenAnswerReplacing',
      params: { operationId: 'op-replace', branchId, questionId, targetAnswerRootId: answerId },
    }) as any
    expect(result.ok).toBe(true)
    const replacementId = result.result.newAnswerRootId
    expect(result.result.state).toBe('committed')
    const claimed = await runtime.handleMessage({
      id: '7-claim', method: 'answerGeneration.claimStream',
      params: { operationId: 'op-replace', answerRootId: replacementId },
    }) as any
    expect(claimed.result.claimed).toBe(true)
    const duplicateClaim = await runtime.handleMessage({
      id: '7-claim-duplicate', method: 'answerGeneration.claimStream',
      params: { operationId: 'op-replace', answerRootId: replacementId },
    }) as any
    expect(duplicateClaim.result.claimed).toBe(false)
    await runtime.handleMessage({
      id: '8', method: 'answerGeneration.finalize',
      params: { answerRootId: replacementId, state: 'failed', errorCode: 'provider_failed' },
    })
    const candidates = await runtime.handleMessage({ id: '9', method: 'branch.getCandidates', params: { branchId, questionId } }) as any
    expect(candidates.result.map((item: any) => item.answerRootId)).toEqual([replacementId])
    const rendered = await runtime.handleMessage({ id: '10', method: 'context.getRenderableTurns', params: { branchId, limit: 100, debug: true } }) as any
    expect(rendered.result.debug.chosenAnswerRootByQuestionId[questionId]).toBe(replacementId)
    const branches = await runtime.handleMessage({ id: '11', method: 'branch.list', params: { convoId } }) as any
    expect(branches.result[0].headMessageId).toBe(replacementId)
    const terminalMessage = (runtime as any).db.prepare(`SELECT status FROM message WHERE id=?`).get(replacementId) as any
    expect(terminalMessage.status).toBe('error')
  })

  it('rejects missing snapshots, stale chosen targets, conflicting operation reuse and sensitive fields without mutation', async () => {
    const { runtime, branchId, questionId, answerId } = await fixture()
    const second = await runtime.handleMessage({ id: '7', method: 'message.append', params: { convoId: (runtime as any).branchRepo.get(branchId).convoId, role: 'assistant', body: 'B', parentId: questionId } }) as any
    const stale = await runtime.handleMessage({
      id: '8', method: 'branch.retryChosenAnswerAsNew',
      params: { operationId: 'op-stale', branchId, questionId, targetAnswerRootId: String(second.result.id) },
    })
    expect(stale.ok).toBe(false)
    const missing = await runtime.handleMessage({ id: '9', method: 'branchChoice.set', params: { branchId, questionId, chosenAnswerRootId: String(second.result.id) } })
    expect(missing.ok).toBe(true)
    const missingRetry = await runtime.handleMessage({
      id: '10', method: 'branch.retryChosenAnswerAsNew',
      params: { operationId: 'op-missing', branchId, questionId, targetAnswerRootId: String(second.result.id) },
    })
    expect(missingRetry.ok).toBe(false)
    const unsafe = await runtime.handleMessage({
      id: '11', method: 'branch.regenerateQuestionWithCurrentConfig',
      params: { operationId: 'op-secret', branchId, questionId, snapshot: { ...snapshot(), providerOptions: { apiKey: 'nope' } } },
    })
    expect(unsafe.ok).toBe(false)
    const legacyGemini = await runtime.handleMessage({
      id: '12', method: 'branch.regenerateQuestionWithCurrentConfig',
      params: {
        operationId: 'op-legacy-gemini',
        branchId,
        questionId,
        snapshot: { ...snapshot(), providerOptions: { geminiThinking: { mode: 'level', thinkingLevel: 'medium' } } },
      },
    })
    expect(legacyGemini.ok).toBe(false)
    expect(answerId).toBeTruthy()
  })

  it('recovers an orphaned operation atomically without changing chosen answer or branch head', async () => {
    const { runtime, convoId, branchId, questionId, answerId } = await fixture()
    const created = await runtime.handleMessage({
      id: 'recover-create', method: 'branch.retryChosenAnswerAsNew',
      params: { operationId: 'op-orphan', branchId, questionId, targetAnswerRootId: answerId },
    }) as any
    const replacementId = String(created.result.newAnswerRootId)
    await runtime.handleMessage({
      id: 'recover-claim', method: 'answerGeneration.claimStream',
      params: { operationId: 'op-orphan', answerRootId: replacementId },
    })

    const recovered = await runtime.handleMessage({
      id: 'recover-run', method: 'answerGeneration.recoverInterrupted', params: { atMs: Date.now() },
    }) as any
    expect(recovered.result).toEqual({
      recovered: 1,
      interrupted: 1,
      operationless: 0,
      reconciledCompleted: 0,
      reconciledFailed: 0,
      reconciledCancelled: 0,
    })

    const operation = (runtime as any).db.prepare(`
      SELECT state, error_code AS errorCode, terminal_at_ms AS terminalAtMs
      FROM assistant_answer_generation_operations WHERE operation_id='op-orphan'
    `).get() as any
    expect(operation).toMatchObject({ state: 'failed', errorCode: 'stream_interrupted' })
    expect(operation.terminalAtMs).toEqual(expect.any(Number))

    const message = (runtime as any).db.prepare(`SELECT status, meta FROM message WHERE id=?`).get(replacementId) as any
    expect(message.status).toBe('error')
    expect(JSON.parse(String(message.meta))).toMatchObject({
      answerGenerationState: 'failed',
      answerGenerationErrorCode: 'stream_interrupted',
      error_ref: true,
      error_summary: { completionClass: 'error', phase: 'mid_stream', code: 'stream_interrupted' },
    })
    const error = (runtime as any).db.prepare(`SELECT envelope_json AS envelopeJson FROM message_error WHERE message_id=?`)
      .get(replacementId) as any
    expect(JSON.parse(String(error.envelopeJson))).toMatchObject({
      completionClass: 'error', phase: 'mid_stream', openrouter: { code: 'stream_interrupted' },
    })

    const rendered = await runtime.handleMessage({
      id: 'recover-rendered', method: 'context.getRenderableTurns', params: { branchId, limit: 100, debug: true },
    }) as any
    expect(rendered.result.debug.chosenAnswerRootByQuestionId[questionId]).toBe(replacementId)
    const branches = await runtime.handleMessage({ id: 'recover-branches', method: 'branch.list', params: { convoId } }) as any
    expect(branches.result[0].headMessageId).toBe(replacementId)

    const replay = await runtime.handleMessage({
      id: 'recover-replay', method: 'answerGeneration.recoverInterrupted', params: { atMs: Date.now() + 1 },
    }) as any
    expect(replay.result.recovered).toBe(0)
    await runtime.handleMessage({
      id: 'recover-late-finalize', method: 'answerGeneration.finalize',
      params: { answerRootId: replacementId, state: 'completed' },
    })
    expect((runtime as any).db.prepare(`SELECT state FROM assistant_answer_generation_operations WHERE operation_id='op-orphan'`).get().state)
      .toBe('failed')
  })

  it('recovers operationless initial-send answers and preserves their chosen/head projection', async () => {
    const { runtime, convoId, branchId } = await fixture()
    const turn = await runtime.handleMessage({
      id: 'operationless-turn', method: 'branch.beginTurn', params: { branchId, userBody: 'next question' },
    }) as any
    const questionId = String(turn.result.questionId)
    const assistantId = String(turn.result.assistantId)

    const recovered = await runtime.handleMessage({
      id: 'operationless-recover', method: 'answerGeneration.recoverInterrupted', params: { atMs: Date.now() },
    }) as any
    expect(recovered.result).toEqual({
      recovered: 1,
      interrupted: 1,
      operationless: 1,
      reconciledCompleted: 0,
      reconciledFailed: 0,
      reconciledCancelled: 0,
    })
    expect((runtime as any).db.prepare(`SELECT status FROM message WHERE id=?`).get(assistantId).status).toBe('error')
    expect((runtime as any).db.prepare(`SELECT 1 FROM message_error WHERE message_id=?`).get(assistantId)).toBeTruthy()

    const rendered = await runtime.handleMessage({
      id: 'operationless-rendered', method: 'context.getRenderableTurns', params: { branchId, limit: 100, debug: true },
    }) as any
    expect(rendered.result.debug.chosenAnswerRootByQuestionId[questionId]).toBe(assistantId)
    const branches = await runtime.handleMessage({ id: 'operationless-branches', method: 'branch.list', params: { convoId } }) as any
    expect(branches.result[0].headMessageId).toBe(assistantId)
  })

  it('rolls back operation, message and error writes together when recovery cannot update the answer', async () => {
    const { runtime, branchId, questionId, answerId } = await fixture()
    const created = await runtime.handleMessage({
      id: 'rollback-create', method: 'branch.retryChosenAnswerAsNew',
      params: { operationId: 'op-rollback', branchId, questionId, targetAnswerRootId: answerId },
    }) as any
    const replacementId = String(created.result.newAnswerRootId)
    await runtime.handleMessage({
      id: 'rollback-claim', method: 'answerGeneration.claimStream',
      params: { operationId: 'op-rollback', answerRootId: replacementId },
    })
    ;(runtime as any).db.exec(`
      CREATE TRIGGER reject_orphan_message_update
      BEFORE UPDATE OF status ON message
      WHEN NEW.id='${replacementId}' AND NEW.status='error'
      BEGIN SELECT RAISE(ABORT, 'injected_recovery_failure'); END;
    `)

    const failed = await runtime.handleMessage({
      id: 'rollback-recover', method: 'answerGeneration.recoverInterrupted', params: { atMs: Date.now() },
    }) as any
    expect(failed.ok).toBe(false)
    expect((runtime as any).db.prepare(`SELECT state FROM assistant_answer_generation_operations WHERE operation_id='op-rollback'`).get().state)
      .toBe('streaming')
    expect((runtime as any).db.prepare(`SELECT status FROM message WHERE id=?`).get(replacementId).status).toBe('streaming')
    expect((runtime as any).db.prepare(`SELECT 1 FROM message_error WHERE message_id=?`).get(replacementId)).toBeUndefined()
  })

  it('reconciles already-persisted message terminals instead of misreporting them as interrupted', async () => {
    const cases = [
      { messageStatus: 'final', meta: { answerGenerationState: 'completed' }, expected: 'completed', count: 'reconciledCompleted' },
      {
        messageStatus: 'error',
        meta: {
          answerGenerationState: 'failed',
          answerGenerationErrorCode: 'provider_failed',
          answerGenerationErrorMessage: 'provider said no',
        },
        expected: 'failed',
        count: 'reconciledFailed',
      },
      { messageStatus: 'final', meta: { answerGenerationState: 'cancelled' }, expected: 'cancelled', count: 'reconciledCancelled' },
    ] as const

    for (const [index, item] of cases.entries()) {
      const { runtime, branchId, questionId, answerId } = await fixture()
      try {
        const operationId = `op-reconcile-${index}`
        const created = await runtime.handleMessage({
          id: `reconcile-create-${index}`, method: 'branch.retryChosenAnswerAsNew',
          params: { operationId, branchId, questionId, targetAnswerRootId: answerId },
        }) as any
        const replacementId = String(created.result.newAnswerRootId)
        await runtime.handleMessage({
          id: `reconcile-claim-${index}`, method: 'answerGeneration.claimStream',
          params: { operationId, answerRootId: replacementId },
        })
        ;(runtime as any).db.prepare(`UPDATE message SET status=?, meta=? WHERE id=?`)
          .run(item.messageStatus, JSON.stringify(item.meta), replacementId)

        const recovered = await runtime.handleMessage({
          id: `reconcile-run-${index}`, method: 'answerGeneration.recoverInterrupted', params: { atMs: Date.now() },
        }) as any
        expect(recovered.result.interrupted).toBe(0)
        expect(recovered.result[item.count]).toBe(1)
        const operation = (runtime as any).db.prepare(`
          SELECT state, error_code AS errorCode, error_message AS errorMessage
          FROM assistant_answer_generation_operations WHERE operation_id=?
        `).get(operationId) as any
        expect(operation.state).toBe(item.expected)
        if (item.expected === 'failed') {
          expect(operation).toMatchObject({ errorCode: 'provider_failed', errorMessage: 'provider said no' })
        }
        const persistedMessage = (runtime as any).db.prepare(`SELECT status, meta FROM message WHERE id=?`).get(replacementId) as any
        expect(persistedMessage.status).toBe(item.messageStatus)
        expect(JSON.parse(String(persistedMessage.meta))).toEqual(item.meta)
      } finally {
        runtime.shutdown()
      }
    }
  })

  it('does not recover active streams merely because the DB worker is reconstructed', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'starverse-orphan-stream-'))
    const dbPath = path.join(directory, 'chat.db')
    let first: DbWorkerRuntime | null = null
    let restarted: DbWorkerRuntime | null = null
    try {
      first = new DbWorkerRuntime({ dbPath, schemaPath: path.resolve('infra/db/schema.sql') })
      const convo = await first.handleMessage({ id: 'restart-convo', method: 'convo.create', params: { title: 'Chat' } }) as any
      const question = await first.handleMessage({ id: 'restart-question', method: 'message.append', params: { convoId: convo.result.id, role: 'user', body: 'Q' } }) as any
      const answer = await first.handleMessage({ id: 'restart-answer', method: 'message.append', params: { convoId: convo.result.id, role: 'assistant', body: '' } }) as any
      expect((first as any).db.prepare(`SELECT status FROM message WHERE id=?`).get(answer.result.id).status).toBe('streaming')
      first.shutdown()
      first = null

      restarted = new DbWorkerRuntime({ dbPath, schemaPath: path.resolve('infra/db/schema.sql') })
      expect((restarted as any).db.prepare(`SELECT status FROM message WHERE id=?`).get(answer.result.id).status).toBe('streaming')
      const recovered = await restarted.handleMessage({
        id: 'restart-recover', method: 'answerGeneration.recoverInterrupted', params: { atMs: Date.now() },
      }) as any
      expect(recovered.result.operationless).toBe(1)
      expect((restarted as any).db.prepare(`SELECT status FROM message WHERE id=?`).get(answer.result.id).status).toBe('error')
      expect(question.result.id).toBeTruthy()
    } finally {
      first?.shutdown()
      restarted?.shutdown()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
