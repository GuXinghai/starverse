import { createDeepSeekPlainTextInitialSendCoordinatorV2 } from './deepSeekPlainTextInitialSendCoordinatorV2'
import BetterSqlite3 from 'better-sqlite3'
import path from 'node:path'
import os from 'node:os'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { registerGenerationHistoryByteReaderV2 } from '../../infra/db/repo/portableGenerationHistoryV2'
import { FileTypeDetectionV2Repo } from '../../infra/db/repo/fileTypeDetectionV2Repo'
import { detectBasicFileTypeV2 } from '../../infra/files/fileTypeRuntimeBoundary'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ProviderCatalogAuthorityRegistryV2 } from '../../src/core/model-catalog/providerCatalogAuthorityRegistryV2'
import { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from '../data-epoch/rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from '../data-epoch/rootManifestStore'
import { createEpoch2ResetJournal } from '../data-epoch/resetJournal'
import { writeEpoch2ResetJournalAtomic } from '../data-epoch/resetJournalStore'
import { acquireWin32EpochRootLease, ensureEpoch2RootAuthority } from '../data-epoch/win32EpochRootLease'
import { createAnthropicPlainTextInitialSendCoordinatorV2 } from './anthropicPlainTextInitialSendCoordinatorV2'
import { createGeminiPlainTextInitialSendCoordinatorV2 } from './geminiPlainTextInitialSendCoordinatorV2'
import { createOpenRouterChatPlainTextInitialSendCoordinatorV2 } from './openRouterChatPlainTextInitialSendCoordinatorV2'
import { ComposerDraftV2Repo } from '../../infra/db/repo/composerDraftV2Repo'
import { ConversationReadV2Repo } from '../../infra/db/repo/conversationReadV2Repo'
import { registerGenerationV2ComposerIpc } from '../ipc/generationV2ComposerIpc'
import type { IpcInvokeHandler } from '../ipc/types'

vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))

const providers = ['anthropic_messages', 'google_ai_studio', 'openrouter', 'deepseek'] as const
const scope = `credential-scope-v2:${'b'.repeat(64)}` as never

describe('current original text through production coordinator and attachment bytes', () => {
  it.each(providers.flatMap(provider => [true, false].map(valid => [provider, valid] as const)))(
    '%s prepares an original revision with valid UTF8=%s without inventing a conversion', async (provider, valid) => {
      const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'sv-current-text-'))
      const layout = resolveEpoch2WorkspaceLayout({ appDataRoot: temporaryRoot, homeRoot: os.homedir(), repositoryRoot: process.cwd() })
      mkdirSync(layout.productRoot, { recursive: true })
      const lease = acquireWin32EpochRootLease(layout)
      writeEpoch2TransitionOwnershipManifestAtomic({ layout, lease, manifest: createEpoch2RootManifest({ layout }) })
      writeEpoch2ResetJournalAtomic({ layout, lease, journal: createEpoch2ResetJournal({ layout, operationId: '123e4567-e89b-42d3-a456-426614174000' }) })
      const blobs = new Epoch2AttachmentBlobStoreV2({ layout, lease, rootAuthority: ensureEpoch2RootAuthority({ layout, lease }) })
      const db = new BetterSqlite3(':memory:')
      const unregister = registerGenerationHistoryByteReaderV2(db, revision => blobs.readRevisionBytes(revision))
      try {
        applyGenerationV2SchemaForTest(db, process.cwd())
        db.prepare("INSERT INTO project_v2 VALUES('project:test','Test',1,1)").run()
        db.prepare("INSERT INTO conversation_v2 VALUES('conversation:test','project:test','Test',1,1)").run()
        db.prepare("INSERT INTO branch_v2 VALUES('branch:test','conversation:test',NULL,NULL,1,1,NULL,NULL)").run()
        const registry = ProviderCatalogAuthorityRegistryV2.get(provider)!
        const modelId = provider === 'anthropic_messages' ? 'claude-opus-4-6' : provider === 'google_ai_studio' ? 'gemini-2.5-flash' : provider === 'deepseek' ? 'deepseek-flash' : 'test/model'
        const catalogScope = { providerKey: provider, credentialScopeId: scope, endpointProfileId: registry.endpointProfileId,
          operationContractId: registry.modelsContractId, category: '' }
        const catalog = new ModelCatalogV2Repo(db, () => 100)
        catalog.beginSync(catalogScope, 'attempt:test')
        const rawProviderRecord = provider === 'google_ai_studio'
          ? { name: `models/${modelId}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 65536 }
          : provider === 'openrouter' ? { id: modelId, architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: ['max_tokens'] }
            : { id: modelId, max_tokens: 65536 }
        catalog.commitSync({ scope: catalogScope, attemptId: 'attempt:test', responseDigest: 'c'.repeat(64), observedAtMs: 100, applyMode: 'automatic', items: [{
          providerKey: provider, nativeModelId: modelId, modelId, modelKey: `${provider}::${modelId}`, displayName: modelId,
          raw: { schemaVersion: 1, buckets: [{ source: 'models', fetchedAtMs: 100, baseUrl: 'https://example.test', payload: { observation: {
            schemaVersion: 2, providerKey: provider, nativeModelId: modelId, endpointId: registry.endpointProfileId, observedAtMs: 100,
            rawProviderRecord, facts: {}, provenance: { sourceKind: 'provider_api', sourceLabel: 'fixture', observedAtMs: 100, parserVersion: 2 },
          } } }] },
        }] })
        const configs = new GenerationConfigV2Repo(db)
        configs.compareAndSetScope('conversation', 'conversation:test', configs.getScope('conversation', 'conversation:test').configRevision.value,
          { schemaVersion: 2, generation: { maxOutputTokens: 1024 }, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
            image: { mode: 'disabled' }, tools: { mode: 'disabled' }, providerExtension: { kind: 'none' } })
        const bytes = valid ? new TextEncoder().encode('CURRENT_ORIGINAL_TEXT_7319') : new Uint8Array([0xff, 0xfe, 0xfd])
        blobs.persist(bytes)
        const assets = new AttachmentAssetV2Repo(db)
        const blob = assets.recordBlobFromBytes(bytes, 'text/markdown')
        assets.createAsset({ assetId: 'asset:source', assetKind: 'file', filename: 'source.md', sourceKind: 'user_import' })
        const source = assets.appendSourceRevision({ assetId: 'asset:source', assetRevisionId: 'revision:source', blob })
        const detections = new FileTypeDetectionV2Repo(db)
        const detected = detectBasicFileTypeV2({ bytes, filename: 'source.md', declaredMime: 'text/markdown', detectionTrigger: 'upload' })
        runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => detections.createPendingInAuthorityTransaction(context, {
          assetRevisionId: source.assetRevisionId.value, assetSha256: source.blob.sha256.value, attemptId: 'detection:source',
        }))
        detections.completeReady({ assetRevisionId: source.assetRevisionId.value, attemptId: 'detection:source', revision: 1,
          verdict: detected.verdict, staticPolicy: detected.staticPolicy })
        const credentialService = { withCredentialScopeBindingAuthority: async ({ consume }: any) => consume({ assertCurrent: () => undefined }) } as never
        const fetchImpl = vi.fn(async () => { throw new Error('NETWORK_FORBIDDEN') })
        const input = { db, credentialService, attachmentBlobStore: blobs, fetchImpl, nowMs: () => 200 }
        const coordinator = provider === 'anthropic_messages' ? createAnthropicPlainTextInitialSendCoordinatorV2(input)
          : provider === 'google_ai_studio' ? createGeminiPlainTextInitialSendCoordinatorV2(input) : provider === 'deepseek' ? createDeepSeekPlainTextInitialSendCoordinatorV2(input) : createOpenRouterChatPlainTextInitialSendCoordinatorV2(input)
        const result = await coordinator.submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: scope, command: {
          operationId: 'operation:current', branchId: 'branch:test', expectedHeadMessageId: null, userBody: 'Read the original attachment', modelId,
          commandAttachments: [{ kind: 'managed_file', assetId: source.assetId.value, assetRevisionId: source.assetRevisionId.value,
            assetSha256: source.blob.sha256.value, include: true, sendAs: provider === 'anthropic_messages' ? 'inline_text' : 'provider_file', conversion: 'none' }],
        } })
        expect(result.preparedRequest.body.copyUtf8Text().includes('CURRENT_ORIGINAL_TEXT_7319')).toBe(valid)
        expect(fetchImpl).not.toHaveBeenCalled()
        if (valid && provider !== 'deepseek') expect(result.execution.snapshot.semanticIntent.attachments[0]).toMatchObject({ sendAs: 'inline_text', conversion: 'none' })
        else expect(result.execution.snapshot.semanticIntent.attachments).toHaveLength(0)
        expect(assets.getRevision('asset:source', 'revision:source').conversionKind).toBe('none')
        expect(new ConversationReadV2Repo(db).readBranch('branch:test').turns[0].answers[0].attachments).toEqual([
          expect.objectContaining({ assetRevisionId: 'revision:source', filename: 'source.md', include: true,
            conversion: 'none', sendAs: provider === 'anthropic_messages' ? 'inline_text' : 'provider_file' }),
        ])
        const handlers = new Map<string, IpcInvokeHandler>()
        registerGenerationV2ComposerIpc({ registerInvoke: (channel, handler) => handlers.set(channel, handler), db,
          attachmentBlobStore: blobs, fileSelectionGrants: {} as never, cloudFetch: fetchImpl as never,
          fileTypeDetectionService: {} as never, tempRoot: temporaryRoot, runtimesRoot: temporaryRoot })
        const draft = new ComposerDraftV2Repo(db).getOrCreate('conversation:test')
        const restored = await handlers.get('generation-v2:composer:replace-from-answer-snapshot')!({} as never, {
          conversationId: 'conversation:test', branchId: 'branch:test', expectedRevision: draft.revision,
          questionId: result.execution.operation.questionId.value, answerRootId: result.preparedRequest.answerRootId, draftText: 'Edit original attachment',
        })
        expect(restored).toMatchObject({ ok: true, value: { attachments: [expect.objectContaining({
          assetRevisionId: 'revision:source', include: true, conversion: 'none',
          sendAs: provider === 'anthropic_messages' ? 'inline_text' : 'provider_file',
        })] } })
      } finally {
        unregister(); db.close(); lease.release()
        if (path.dirname(temporaryRoot) !== path.resolve(os.tmpdir()) || !path.basename(temporaryRoot).startsWith('sv-current-text-')) throw new Error('Invalid cleanup root')
        rmSync(temporaryRoot, { recursive: true, force: true })
      }
    })
})
