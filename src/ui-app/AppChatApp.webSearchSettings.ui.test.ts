import { render, screen, waitFor } from '@testing-library/vue'
import { within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp (web search settings UI)', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  function getWebSearchChipBody() {
    return within(screen.getByTestId('web-search-chip')).getByTestId('capability-chip-body')
  }

  beforeEach(() => {
    let projectMeta: Record<string, unknown> | null = {
      webSearchDefaults: { searchMode: 'enable', searchDepth: 'low' },
    }

    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'project.getInbox') return null
      if (method === 'project.list') {
        return [{ id: 'p1', name: 'Project 1', createdAt: 1, updatedAt: 1, meta: projectMeta }]
      }
      if (method === 'project.countConversationsBatch') {
        return { counts: { p1: 1 } }
      }
      if (method === 'project.save') {
        projectMeta = (params?.meta ?? null) as Record<string, unknown> | null
        return { ok: true }
      }
      if (method === 'convo.list') {
        return [
          {
            id: 'c1',
            title: 'Chat 1',
            createdAt: 1,
            updatedAt: 2,
            projectId: 'p1',
            meta: { webSearchOverride: { searchMode: 'default' } },
          },
        ]
      }
      if (method === 'branch.ensureDefault') {
        return { id: 'b1', convoId: 'c1', headMessageId: 'm1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: 'b1', convoId: 'c1', headMessageId: 'm1', name: 'Main', createdAt: 1, updatedAt: 1, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        return {
          messages: [
            {
              id: 'm1',
              convoId: 'c1',
              role: 'assistant',
              seq: 1,
              createdAt: 1,
              parentId: null,
              status: 'final',
              answerRootId: null,
              questionId: null,
              body: 'hello',
              meta: null,
            },
          ],
          turns: [],
          debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: ['m1'], chosenAnswerRootByQuestionId: {} },
        }
      }
      if (method === 'context.buildForBranch') {
        return { messages: [], debug: { branchId: 'b1', excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      }
      if (method === 'settings.getReasoningPrefs') return { value: { mode: 'auto', effort: 'auto', exclude: false } }
      if (method === 'settings.getUserMessageRenderDefault') return { value: false }
      if (method === 'settings.getWebSearchDefaults') return { value: { searchMode: 'disable', searchDepth: 'medium' } }
      if (method === 'settings.getGenerationParamsDefaults') return { value: null }
      if (method === 'settings.getImageGenerationDefault') return { value: null }
      if (method === 'settings.getDfcAttachmentDefaults') return { value: null }
      if (method === 'settings.getChatReasoningDisplayMode') return { value: 'inline' }
      if (method === 'settings.setChatReasoningDisplayMode') return { ok: true }
      if (method === 'messageAsset.listByMessageIds') return []
      if (method === 'message.listReasoningDisplayBlocksByMessageIds') return []
      if (method === 'conversationDraft.restore') {
        return {
          conversationId: String(params?.conversationId ?? 'c1'),
          draftText: '',
          draftMode: 'compose',
          editingSourceMessageId: null,
          attachedAssetIds: [],
          attachments: [],
          updatedAt: 1,
        }
      }
      if (method === 'conversationDraft.updateText') {
        return {
          conversationId: String(params?.conversationId ?? 'c1'),
          draftText: String(params?.draftText ?? ''),
          draftMode: 'compose',
          editingSourceMessageId: null,
          attachedAssetIds: [],
          attachments: [],
          updatedAt: 2,
        }
      }
      if (method === 'sendPlan.buildCurrent') {
        return {
          sendPlan: {
            status: 'sendable',
            warnings: [],
            blockingReasons: [],
            includedAttachments: [],
            excludedAttachments: [],
            attachmentPlans: [],
            requiresModelChange: false,
            canProceedAfterDroppingExcluded: false,
            requiresUserConfirmation: false,
            plannerVersion: 'phase-5/v1',
          },
          draftText: String(params?.draftText ?? ''),
          assets: [],
        }
      }
      if (method === 'reasoningIndex.list') return []
      if (method === 'modelCatalog.list') return []
      if (method === 'modelCatalog.queryCore') return { items: [], nextCursor: null }
      if (method === 'modelCatalog.getCoreMeta') return { providerKey: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' }
      if (method === 'modelCatalog.listEndpointMeta') return []
      if (method === 'modelCatalog.replaceEndpointMeta') return { ok: true }
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
  })

  it('updates composer web search chip when project defaults change and session stays default', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('hello')

    expect(getWebSearchChipBody().textContent ?? '').toContain('low')

    await user.click(screen.getByTestId('project-settings-p1'))
    await user.click(await screen.findByTestId('search-mode-default'))
    await user.click(screen.getByTestId('project-web-search-save'))

    await waitFor(() => {
      expect(getWebSearchChipBody().textContent ?? '').toContain('搜索')
    })

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith(
      'project.save',
      expect.objectContaining({
        id: 'p1',
        meta: expect.objectContaining({
          webSearchDefaults: expect.objectContaining({ searchMode: 'default' }),
        }),
      }),
    )
  })

  it('renders composer web search row and persists quick overrides', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('hello')
    await screen.findByTestId('web-search-chip')

    await user.click(getWebSearchChipBody())
    await waitFor(() => {
      expect(getWebSearchChipBody().textContent ?? '').toContain('搜索')
    })

    await user.click(getWebSearchChipBody())
    await waitFor(() => {
      expect(getWebSearchChipBody().textContent ?? '').toContain('low')
    })

    await user.click(within(screen.getByTestId('web-search-chip')).getByTestId('capability-chip-chevron'))
    await user.click(screen.getAllByTestId('capability-chip-option').find((node) => node.textContent === 'high')!)

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith(
      'convo.save',
      expect.objectContaining({
        id: 'c1',
        meta: expect.objectContaining({
          webSearchOverride: expect.objectContaining({ searchMode: 'disable' }),
        }),
      }),
    )

    expect(invoke).toHaveBeenCalledWith(
      'convo.save',
      expect.objectContaining({
        id: 'c1',
        meta: expect.objectContaining({
          webSearchOverride: expect.objectContaining({ searchMode: 'enable', searchDepth: 'high' }),
        }),
      }),
    )

    const convoSaveCalls = invoke.mock.calls.filter((entry) => entry[0] === 'convo.save')
    expect(convoSaveCalls.length).toBeGreaterThan(0)
    expect(convoSaveCalls.every((entry) => entry[1]?.id === 'c1')).toBe(true)
  })
})
