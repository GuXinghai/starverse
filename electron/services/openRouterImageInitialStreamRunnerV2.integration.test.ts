import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { ConversationReadV2Repo } from '../../infra/db/repo/conversationReadV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { GenerationImageOutputV2Repo } from '../../infra/db/repo/generationImageOutputV2Repo'
import { GenerationNativeCompletionReceiptV2Repo } from '../../infra/db/repo/generationNativeCompletionReceiptV2Repo'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { mapOpenRouterModelToCatalogModel } from '../../src/shared/modelCatalog/providers/openrouter/openRouterCatalogClient'

vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))

import { createOpenRouterImageInitialSendCoordinatorV2 } from './openRouterImageInitialSendCoordinatorV2'
import { createOpenRouterImageInitialStreamRunnerV2 } from './openRouterImageInitialStreamRunnerV2'
import { createGenerationNativeCompletionRecoveryWorkSourceV2, recoverPendingGenerationNativeCompletionsV2 } from './generationNativeCompletionV2'

const modelId = 'google/gemini-3.1-flash-image'
const credentialScopeId = `credential-scope-v2:${'f'.repeat(64)}` as never
const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ZkAAAAASUVORK5CYII='
const imageBytes = new Uint8Array(Buffer.from(imageBase64, 'base64'))
const descriptorResponse = {
  id: modelId,
  endpoints: [{
    provider_name: 'Google AI Studio',
    provider_slug: 'google-ai-studio',
    provider_tag: 'google-ai-studio',
    supports_streaming: false,
    supported_parameters: { n: { type: 'range', min: 1, max: 1 } },
    allowed_passthrough_parameters: [],
  }],
}
const generatedImageResponse = {
  created: 1_700_000_000,
  data: [{ b64_json: imageBase64, media_type: 'image/png' }],
  usage: { provider: 'mock-openrouter', cost: 0.001 },
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

function credentialService() {
  return {
    getStatus: vi.fn(async () => ({ configured: true, revision: 1, credentialScopeId })),
    withCredential: vi.fn(async ({ consume }: { consume: (lease: never) => unknown }) => consume({
      providerKey: 'openrouter', credentialScopeId, credential: 'offline-test-token', assertCurrent: () => undefined,
    } as never)),
    withCredentialScopeBindingAuthority: vi.fn(async ({ consume }: { consume: (authority: never) => unknown }) => consume({
      assertCurrent: () => undefined,
    } as never)),
  } as never
}

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:openrouter-image', name: 'Offline image runner', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, { projectId: 'project:openrouter-image', conversationId: 'conversation:openrouter-image',
      branchId: 'branch:openrouter-image', title: 'Offline image runner', branchName: 'Main', createdAtMs: 2 })
  })

  const configs = new GenerationConfigV2Repo(db)
  const current = configs.getScope('conversation', 'conversation:openrouter-image')
  configs.compareAndSetScope('conversation', 'conversation:openrouter-image', current.configRevision.value, {
    schemaVersion: 2, image: { mode: 'generate' },
  })

  const item = mapOpenRouterModelToCatalogModel({
    id: modelId,
    name: 'Synthetic OpenRouter image model',
    canonical_slug: modelId,
    architecture: { modality: 'text->image', input_modalities: ['text'], output_modalities: ['image'] },
    supported_parameters: [],
  }, { providerKey: 'openrouter', source: 'models_user', fetchedAtMs: 10, baseUrl: 'https://openrouter.ai/api/v1' })
  if (!item) throw new Error('TEST_OPENROUTER_MODEL_FIXTURE_INVALID')
  const catalog = new ModelCatalogV2Repo(db, () => 10)
  const catalogScope = Object.freeze({ providerKey: 'openrouter' as const, credentialScopeId,
    endpointProfileId: 'openrouter-first-party-v1', operationContractId: 'openrouter-chat-models-v1', category: '' })
  catalog.beginSync(catalogScope, 'attempt:openrouter-image')
  catalog.commitSync({ scope: catalogScope, attemptId: 'attempt:openrouter-image', responseDigest: 'c'.repeat(64),
    observedAtMs: 10, applyMode: 'automatic', items: [item] })
  return db
}

function mockProviderFetch() {
  return vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === 'GET') return jsonResponse(descriptorResponse)
    if (init.method === 'POST') return jsonResponse(generatedImageResponse)
    throw new Error(`UNEXPECTED_OFFLINE_FETCH_METHOD:${String(init.method)}`)
  })
}

async function createInitialCommand(db: BetterSqlite3.Database, fetchImpl: ReturnType<typeof mockProviderFetch>) {
  return createOpenRouterImageInitialSendCoordinatorV2({ db, credentialService: credentialService(), fetchImpl,
    nowMs: () => 100, createGraphId: (kind) => `${kind}:openrouter-image` }).submit({
    command: { operationId: 'operation:openrouter-image', branchId: 'branch:openrouter-image', expectedHeadMessageId: null,
      prompt: 'Draw a small blue bird.', modelId, requestedProviderTag: null, commandAttachments: [] },
    expectedCredentialRevision: 1, expectedCredentialScopeId: credentialScopeId,
  })
}

function createRunner(input: Readonly<{
  db: BetterSqlite3.Database
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>
  attachmentBlobStore: { persist(bytes: Uint8Array): unknown }
  publish: (projection: unknown) => void
  nowMs: () => number
}>) {
  return createOpenRouterImageInitialStreamRunnerV2({ ...input, credentialService: credentialService() as never,
    attachmentBlobStore: input.attachmentBlobStore as never, streamProjectionSink: { publish: input.publish },
    timeoutMs: 30_000 })
}

afterEach(() => vi.restoreAllMocks())

describe('OpenRouter image initial stream runner integration', () => {
  it('persists a mocked successful image response and publishes matching branch image and terminal projections', async () => {
    const db = database()
    const fetchImpl = mockProviderFetch()
    const persistedBytes: Uint8Array[] = []
    const persist = vi.fn((bytes: Uint8Array): { storageRef: string } => {
      persistedBytes.push(bytes.slice())
      return { storageRef: `offline/mock-image:${persistedBytes.length}` }
    })
    const projections: Record<string, unknown>[] = []
    let clock = 200
    try {
      const command = await createInitialCommand(db, fetchImpl)
      expect(command.kind).toBe('created')
      expect(fetchImpl.mock.calls.map(([, init]) => init.method)).toEqual(['GET'])

      await createRunner({ db, fetchImpl, attachmentBlobStore: { persist }, publish: (value) => projections.push(value as Record<string, unknown>),
        nowMs: () => clock++ }).run(command)

      expect(fetchImpl.mock.calls.map(([, init]) => init.method)).toEqual(['GET', 'POST'])
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      const [imageUrl, imageRequest] = fetchImpl.mock.calls[1]!
      expect(new URL(imageUrl).pathname).toBe('/api/v1/images')
      expect(new Headers(imageRequest.headers).get('authorization')).toBe('Bearer offline-test-token')
      expect(JSON.parse(Buffer.from(imageRequest.body as Uint8Array).toString('utf8'))).toMatchObject({
        model: modelId, prompt: 'Draw a small blue bird.',
      })
      expect(persist).toHaveBeenCalledTimes(1)
      expect(persistedBytes[0]).toEqual(imageBytes)
      for (const table of ['file_blob_v2', 'file_asset_v2', 'asset_revision_v2', 'generation_image_output_v2']) {
        expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 1 })
      }
      expect(db.prepare("SELECT count(*) AS n FROM file_asset_v2 WHERE source_kind='generated' AND asset_kind='image'").get())
        .toEqual({ n: 1 })
      const output = db.prepare(`SELECT asset_id AS assetId, asset_revision_id AS assetRevisionId, asset_sha256 AS sha256, mime
        FROM generation_image_output_v2 WHERE operation_id='operation:openrouter-image'`).get() as {
          assetId: string; assetRevisionId: string; sha256: string; mime: string
        }
      const answer = new ConversationReadV2Repo(db).readBranch('branch:openrouter-image').turns[0]!.answers[0]!
      expect(answer).toMatchObject({ status: 'completed', body: '', images: [{
        assetId: output.assetId, assetRevisionId: output.assetRevisionId, sha256: output.sha256, mime: 'image/png',
      }] })
      expect(output.mime).toBe('image/png')
      expect(projections.map((projection) => projection.type)).toEqual(['image_output', 'terminal'])
      expect(projections[0]).toMatchObject({ type: 'image_output', operationId: 'operation:openrouter-image',
        answerRootId: answer.answerRootId, outputIndex: 0, assetId: output.assetId,
        assetRevisionId: output.assetRevisionId, mime: output.mime })
      expect(projections[1]).toMatchObject({ type: 'terminal', operationId: 'operation:openrouter-image',
        answerRootId: answer.answerRootId, state: 'completed', errorCode: null })
    } finally { db.close() }
  })

  it('recovers a failed output transaction after reopen without another provider fetch', async () => {
    let db = database()
    const fetchImpl = mockProviderFetch()
    const persistedBytes: Uint8Array[] = []
    const persist = vi.fn((bytes: Uint8Array): { storageRef: string } => {
      persistedBytes.push(bytes.slice())
      return { storageRef: `offline/mock-image:${persistedBytes.length}` }
    })
    const projections: Record<string, unknown>[] = []
    let clock = 200
    const outputSpy = vi.spyOn(GenerationImageOutputV2Repo.prototype, 'insertCompletedOutput')
      .mockImplementationOnce(() => { throw new Error('injected OpenRouter image output transaction failure') })
    try {
      const command = await createInitialCommand(db, fetchImpl)
      const firstRunner = createRunner({ db, fetchImpl, attachmentBlobStore: { persist }, publish: (value) => projections.push(value as Record<string, unknown>),
        nowMs: () => clock++ })
      await expect(firstRunner.run(command)).rejects.toMatchObject({
        code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING', receiptPersisted: true,
      })
      outputSpy.mockRestore()
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(1)
      for (const table of ['file_blob_v2', 'file_asset_v2', 'asset_revision_v2', 'generation_image_output_v2']) {
        expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 })
      }

      await createGenerationNativeCompletionRecoveryWorkSourceV2(db).quiesce()
      const serialized = db.serialize()
      db.close()
      db = new BetterSqlite3(serialized)
      const recoveryFetch = vi.fn(async () => { throw new Error('RECOVERY_MUST_NOT_FETCH') })
      createRunner({ db, fetchImpl: recoveryFetch, attachmentBlobStore: { persist },
        publish: (value) => projections.push(value as Record<string, unknown>), nowMs: () => clock++ })

      expect(recoverPendingGenerationNativeCompletionsV2(db, () => clock++, false))
        .toEqual({ recovered: 1, pending: 0, unavailable: 0 })
      expect(recoveryFetch).not.toHaveBeenCalled()
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(0)
      expect(persist).toHaveBeenCalledTimes(2)
      expect(persistedBytes).toEqual([imageBytes, imageBytes])
      expect(db.prepare('SELECT count(*) AS n FROM generation_image_output_v2').get()).toEqual({ n: 1 })
      const answer = new ConversationReadV2Repo(db).readBranch('branch:openrouter-image').turns[0]!.answers[0]!
      expect(answer).toMatchObject({ status: 'completed', body: '', images: [{ mime: 'image/png' }] })
      expect(projections.map((projection) => projection.type)).toEqual(['image_output', 'terminal'])
      expect(projections[1]).toMatchObject({ type: 'terminal', operationId: 'operation:openrouter-image', state: 'completed' })
    } finally { outputSpy.mockRestore(); if (db.open) db.close() }
  })
})
