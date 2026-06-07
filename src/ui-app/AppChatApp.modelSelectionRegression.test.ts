import { nextTick } from 'vue'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp model selection regression', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronAPI = (globalThis as any).electronAPI
  let invoke: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const convo = { id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 10, meta: null as Record<string, unknown> | null }
    const branch = { id: 'b1', convoId: 'c1', headMessageId: null, name: 'Main', createdAt: 1, updatedAt: 10, deletedAt: null }

    invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'convo.list') return [convo]
      if (method === 'convo.save') {
        convo.meta = (params?.meta ?? null) as Record<string, unknown> | null
        return { ok: true }
      }
      if (method === 'project.list') return []
      if (method === 'project.getInbox') return null
      if (method === 'project.countConversationsBatch') return { counts: {} }
      if (method === 'settings.getReasoningPrefs') return { value: null }
      if (method === 'settings.getWebSearchDefaults') return { value: null }
      if (method === 'settings.getSamplingParamsDefaults') return { value: null }
      if (method === 'settings.getUserMessageRenderDefault') return { value: null }
      if (method === 'settings.getImageGenerationDefault') return { value: null }
      if (method === 'settings.getChatReasoningDisplayMode') return { value: 'inline' }
      if (method === 'settings.getChatDraft') return { value: null }
      if (method === 'settings.setChatDraft') return { ok: true }
      if (method === 'settings.deleteChatDraft') return { deleted: 0 }
      if (method === 'settings.deleteChatDraftsByPrefix') return { deleted: 0 }
      if (method === 'settings.setChatReasoningDisplayMode') return { ok: true }
      if (method === 'branch.ensureDefault') return branch
      if (method === 'branch.list') return [branch]
      if (method === 'context.getRenderableTurns') {
        return {
          messages: [],
          turns: [],
          debug: { branchId: String(params?.branchId ?? ''), excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} },
        }
      }
      if (method === 'context.buildForBranch') {
        return { messages: [], debug: { branchId: String(params?.branchId ?? ''), excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      }
      if (method === 'conversationDraft.restore') {
        return {
          conversationId: String(params?.conversationId ?? 'c1'),
          draftText: '',
          draftMode: 'compose',
          editingSourceMessageId: null,
          attachedAssetIds: [],
          attachments: [],
          updatedAt: 0,
        }
      }
      if (method === 'modelCatalog.list') {
        return [{ modelId: 'legacy/only-model', name: 'Legacy Only', vendor: 'legacy', status: 'visible' }]
      }
      if (method === 'modelCatalog.getCoreMeta') return { baseUrl: 'https://openrouter.ai/api/v1' }
      if (method === 'modelCatalog.queryCore') {
        return {
          items: [
            {
              providerKey: 'openrouter',
              modelId: 'legacy/only-model',
              modelKey: 'openrouter::legacy/only-model',
              displayName: 'Legacy Only',
              canonicalSlug: 'legacy/only-model',
              vendor: 'legacy',
              description: 'legacy',
              contextLength: 200000,
              createdAtSec: 1700000123,
              pricePrompt: '0.01',
              priceCompletion: '0.02',
              priceRequest: '0',
              priceImage: '0',
              capReasoning: 1,
              capTools: 0,
              capStructuredOutputs: 0,
              capVision: 0,
              capLongContext: 1,
            },
          ],
          nextCursor: null,
        }
      }
      if (method === 'reasoningModelIndex.list') return []
      if (method === 'modelPrefs.listFavorites') return []
      if (method === 'modelPrefs.listRecents') return []
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }
    ;(globalThis as any).electronAPI = {
      modelCatalogQueryScopedCurrent: vi.fn(async () => ({
        status: 'synced',
        catalogRevision: 'checksum-a',
        modelCount: 1,
        lastSyncAtMs: 123,
        items: [
          {
            providerKey: 'openrouter',
            modelId: 'anthropic/claude-3',
            modelKey: 'openrouter::anthropic/claude-3',
            canonicalSlug: 'anthropic/claude-3',
            displayName: 'Claude 3',
            description: 'scoped',
            vendor: 'anthropic',
            contextLength: 200000,
            maxOutputTokens: 8192,
            pricing: {
              prompt: '0.01',
              completion: '0.02',
              request: '0',
              image: '0',
            },
            capabilities: {
              reasoning: true,
              tools: false,
              structuredOutputs: false,
              vision: false,
              longContext: true,
            },
            visibility: 'visible',
            supportedParameters: ['reasoning'],
            inputModalities: ['text'],
            outputModalities: ['text'],
          },
        ],
        nextCursor: null,
      })),
      modelCatalogGetSyncStatus: vi.fn(async () => ({
        ok: true,
        providerKey: 'openrouter',
        status: 'synced',
        syncState: 'ok',
        failureReasonCode: null,
        lastSyncedAtMs: 123,
        modelCount: 1,
      })),
      modelCatalogSyncNow: vi.fn(async () => ({
        ok: true,
        providerKey: 'openrouter',
        status: 'synced',
        syncState: 'ok',
        syncAttempted: false,
        modelCount: 1,
        lastSyncedAtMs: 123,
      })),
    }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronAPI = originalElectronAPI
  })

  it('keeps a manual model selection after async flush', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    const currentModelPill = await screen.findByTestId('current-model-pill')
    await user.click(currentModelPill)

    const selectedItem = await screen.findByTestId('model-picker-item-anthropic/claude-3')
    await user.click(selectedItem)

    await waitFor(() => {
      expect(screen.getByTestId('current-model-pill').textContent).toContain('Claude 3')
    })

    await Promise.resolve()
    await nextTick()

    expect(screen.getByTestId('current-model-pill').textContent).toContain('Claude 3')
    expect(screen.getByTestId('current-model-pill').textContent).not.toContain('openrouter/auto')
    expect(screen.queryByTestId('model-picker-item-legacy/only-model')).toBeNull()
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('modelCatalog.list')
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('modelCatalog.queryCore')
    expect(invoke.mock.calls.map((call) => call[0])).not.toContain('reasoningIndex.list')
  })

  it('does not rehydrate the selection path with stale session state', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'ui-app', 'app', 'appChatApp.logic.ts'), 'utf8')
    const start = source.indexOf('async function onUpdateModel(nextModelKey: string)')
    const end = source.indexOf('async function recordRecentModelUsage(modelId: string)')

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)

    const onUpdateModelBody = source.slice(start, end)
    expect(onUpdateModelBody).not.toContain('hydrateSessionConfigUiFromActiveConvo()')
  })
})
