import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { AnswerReasoningProjectionV2Repo } from '../../infra/db/repo/answerReasoningProjectionV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'

vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))

import { createGeminiInteractionsImageInitialSendCoordinatorV2 } from './geminiInteractionsImageInitialSendCoordinatorV2'
import { createGeminiInteractionsImageActionCoordinatorV2 } from './geminiInteractionsImageActionCoordinatorV2'
import { createGeminiInteractionsImageStreamRunnerV2 } from './geminiInteractionsImageStreamRunnerV2'

const scope = `credential-scope-v2:${'a'.repeat(64)}` as never
function database() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, { projectId: 'project:1', conversationId: 'conversation:1',
      branchId: 'branch:1', title: 'Conversation', branchName: 'Main', createdAtMs: 2 })
  })
  const configs = new GenerationConfigV2Repo(db)
  const current = configs.getScope('conversation', 'conversation:1')
  configs.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
    schemaVersion: 2, generation: { candidateCount: 1 }, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
    image: { mode: 'generate', aspectRatio: '1:1', resolution: '1K', format: 'jpeg', stream: true },
    tools: { mode: 'disabled' }, providerExtension: { kind: 'none' },
  })
  return db
}
function credentialService() {
  return {
    getStatus: async () => ({ configured: true, revision: 1, credentialScopeId: scope }),
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => consume({
      credential: 'test-key', assertCurrent: () => undefined,
    } as never),
  } as never
}
function streamResponse(): Response {
  const interaction = { id: 'interaction:1', model: 'gemini-3.1-flash-image', status: 'completed',
    usage: { total_input_tokens: 1, total_output_tokens: 2 } }
  const events = [
    { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } },
    { event_type: 'step.start', index: 1, step: { type: 'thought' } },
    { event_type: 'step.delta', index: 1,
      delta: { type: 'thought_summary', text: 'I will draw one apple.' } },
    { event_type: 'step.stop', index: 1 },
    { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
    { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/jpeg' } },
    { event_type: 'step.stop', index: 0 },
    { event_type: 'interaction.completed', interaction },
  ]
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}`).join('\n\n')}\n\ndata: [DONE]\n\n`
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

describe('Gemini Interactions image generation V2', () => {
  it('commits chosen/head before streaming and keeps a failed retry-as-new current', async () => {
    const db = database(); let ids = 0; let clock = 100
    try {
      const initial = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db, nowMs: () => clock++,
        createGraphId: (kind) => `${kind}:${++ids}` }).submit({
        command: { operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
          prompt: 'draw', modelId: 'gemini-3.1-flash-image', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(initial.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:2' }, headMessageId: { value: 'answer:2' },
      })
      expect(JSON.parse(initial.preparedRequest!.body.copyUtf8Text())).toEqual({
        input: 'draw', model: 'gemini-3.1-flash-image',
        response_format: { aspect_ratio: '1:1', image_size: '1K', mime_type: 'image/jpeg', type: 'image' },
        store: false, stream: true,
      })
      const fetchImpl = vi.fn(async () => streamResponse())
      await createGeminiInteractionsImageStreamRunnerV2({ db, credentialService: credentialService(),
        attachmentBlobStore: { persist: vi.fn() } as never, fetchImpl, nowMs: () => clock++ }).run(initial)
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:2'").get()).toEqual({ status: 'completed' })
      expect(db.prepare('SELECT count(*) AS count FROM generation_image_output_v2').get()).toEqual({ count: 1 })
      expect(db.prepare("SELECT artifact_kind AS kind FROM generation_native_artifact_v2 WHERE answer_root_id='answer:2'").get())
        .toEqual({ kind: 'gemini_interactions_image_terminal_v1' })
      expect(new AnswerReasoningProjectionV2Repo(db).list('answer:2')).toEqual([
        { type: 'thought_summary', summary: 'I will draw one apple.' },
      ])

      const actions = createGeminiInteractionsImageActionCoordinatorV2({ db, credentialService: credentialService(),
        nowMs: () => clock++, createAnswerId: () => 'answer:retry' })
      const retry = await actions.retry({ actionKind: 'retry_as_new', operationId: 'operation:retry', branchId: 'branch:1',
        questionId: 'question:1', targetAnswerRootId: 'answer:2', expectedHeadMessageId: 'answer:2' })
      expect(retry.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:retry' }, headMessageId: { value: 'answer:retry' },
      })
      await createGeminiInteractionsImageStreamRunnerV2({ db, credentialService: credentialService(),
        attachmentBlobStore: { persist: vi.fn() } as never,
        fetchImpl: async () => new Response('denied', { status: 503 }), nowMs: () => clock++ }).run(retry)
      expect(db.prepare("SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen: 'answer:retry' })
      expect(db.prepare("SELECT head_message_id AS head FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head: 'answer:retry' })
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:retry'").get()).toEqual({ status: 'failed' })
    } finally { db.close() }
  })
})
