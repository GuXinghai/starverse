import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp (web search settings UI)', () => {
  const originalDbBridge = (globalThis as any).dbBridge

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
      if (method === 'settings.getSamplingParamsDefaults') return { value: null }
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

  it('updates session effective label immediately when project defaults change and session stays default', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('hello')

    const sessionButton = await screen.findByTestId('session-web-search-open')
    expect(sessionButton.textContent ?? '').toContain('Web: On')
    expect(sessionButton.textContent ?? '').toContain('project')

    await user.click(screen.getByTestId('project-settings-p1'))
    await user.click(await screen.findByTestId('search-mode-default'))
    await user.click(screen.getByTestId('project-web-search-save'))

    await waitFor(() => {
      const label = screen.getByTestId('session-web-search-open').textContent ?? ''
      expect(label).toContain('Web: Off')
      expect(label).toContain('global')
    })

    window.dispatchEvent(new CustomEvent('settings:webSearchDefaultsUpdated', {
      detail: { searchMode: 'enable', searchDepth: 'high' },
    }))

    await waitFor(() => {
      const label = screen.getByTestId('session-web-search-open').textContent ?? ''
      expect(label).toContain('Web: On')
      expect(label).toContain('global')
    })
  })

  it('renders composer web search row and persists quick overrides', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('hello')
    await screen.findByTestId('composer-web-search-row')

    await user.click(screen.getByTestId('composer-web-mode-toggle'))
    await waitFor(() => {
      const label = screen.getByTestId('session-web-search-open').textContent ?? ''
      expect(label).toContain('Web: On')
      expect(label).toContain('session')
    })

    await user.click(screen.getByTestId('composer-web-mode-toggle'))
    await waitFor(() => {
      const label = screen.getByTestId('session-web-search-open').textContent ?? ''
      expect(label).toContain('Web: Off')
      expect(label).toContain('session')
    })

    await user.selectOptions(screen.getByTestId('composer-web-depth-select'), 'custom')
    await user.selectOptions(screen.getByTestId('composer-web-max-results'), '7')

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
          webSearchOverride: expect.objectContaining({ searchDepth: 'custom', maxResults: 7 }),
        }),
      }),
    )

    const convoSaveCalls = invoke.mock.calls.filter((entry) => entry[0] === 'convo.save')
    expect(convoSaveCalls.length).toBeGreaterThan(0)
    expect(convoSaveCalls.every((entry) => entry[1]?.id === 'c1')).toBe(true)
  })
})
