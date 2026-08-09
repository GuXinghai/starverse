import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp (filters: include/exclude)', () => {
  let originalGenerationV2: any
  let setContextFilter: ReturnType<typeof vi.fn>
  let readBranch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalGenerationV2 = (globalThis as any).generationV2
    const ok = <T>(value: T) => ({ ok: true as const, value })
    let questionMode: 'include' | 'exclude' = 'include'
    const baseTemplate = originalGenerationV2.workspace.getSystemTemplate

    readBranch = vi.fn(async () => ok({
      branchId: 'b1', conversationId: 'c1', projectId: 'project_inbox', title: 'Chat 1',
      branchName: 'Main', headMessageId: 'a1', beforeMessageId: null, hasMoreTurns: false,
      turns: [{
        questionId: 'u1', questionBody: 'Q1', questionCreatedAtMs: 1, chosenAnswerRootId: 'a1',
        contextFilter: {
          questionMode, answerMode: 'include', effectiveMode: questionMode,
          lockedByQuestionExclude: questionMode === 'exclude',
        },
        answers: [{
          answerRootId: 'a1', status: 'failed', body: 'A1', createdAtMs: 2, updatedAtMs: 2,
          chosen: true, operationId: 'operation:a1', actionKind: 'initial', providerId: 'openrouter',
          modelId: 'openai/gpt-4.1-nano', errorCode: 'provider_error', errorMessage: 'provider error',
          endpointProfileId: 'openrouter-first-party-v1', protocolContractId: 'openrouter-chat-completions-v1',
          reasoningDetails: [], attachments: [], images: [],
        }],
      }],
    }))
    setContextFilter = vi.fn(async (input: any) => {
      questionMode = input.mode
      return ok({})
    })

    ;(globalThis as any).generationV2 = {
      ...originalGenerationV2,
      runtime: {
        subscribe: vi.fn(async () => ok([])),
        snapshot: vi.fn(async () => ok(null)),
        abort: vi.fn(async () => ok(false)),
        onEvent: vi.fn(() => () => undefined),
      },
      workspace: {
        ...originalGenerationV2.workspace,
        ensureDefault: vi.fn(async () => ok({ projectId: 'project_inbox', conversationId: 'c1', branchId: 'b1', created: false })),
        getSystemTemplate: vi.fn(async () => {
          const result = await baseTemplate()
          return ok({ ...result.value,
            conversation: { ...result.value.conversation, id: 'c1', projectId: 'project_inbox', branchId: 'b1',
              title: 'Chat 1', meta: { selectedProviderId: 'openrouter', selectedModelKey: 'openai/gpt-4.1-nano' } },
            draft: { ...result.value.draft, conversationId: 'c1' },
          })
        }),
        listProjects: vi.fn(async () => ok([{ projectId: 'project_inbox', name: 'Inbox', createdAtMs: 1, updatedAtMs: 2 }])),
        listConversations: vi.fn(async () => ok({ items: [{
          conversationId: 'c1', projectId: 'project_inbox', title: 'Chat 1', updatedAtMs: 2,
          branches: [{ branchId: 'b1', name: 'Main', headMessageId: 'a1', updatedAtMs: 2 }],
          branchesHasMore: false,
        }], nextCursor: null, totalCount: 1 })),
        listBranches: vi.fn(async () => ok({ items: [{
          branchId: 'b1', name: 'Main', headMessageId: 'a1', updatedAtMs: 3,
        }], nextCursor: null, totalCount: 1 })),
        readBranch,
        getMessageCandidateNavigation: vi.fn(async (branchId: string, messageId: string) => ok({
          conversationId: 'c1', currentBranchId: branchId, messageId,
          parentMessageId: messageId === 'a1' ? 'u1' : null,
          role: messageId === 'a1' ? 'assistant' : 'user',
          currentIndex: 0, total: 1, previous: null, next: null,
        })),
        setContextFilter,
      },
    }
  })

  afterEach(() => {
    ;(globalThis as any).generationV2 = originalGenerationV2
  })

  it('excludes the complete selected turn through the V2 workspace projection', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q1')
    expect(await screen.findByTestId('copy-assistant-text-a1')).toBeEnabled()
    expect(await screen.findByTestId('raw-data-a-a1')).toBeEnabled()
    expect(await screen.findByTestId('retry-a-a1')).toBeEnabled()
    expect(screen.queryByText('该回答未选入上下文')).not.toBeInTheDocument()

    await user.click(await screen.findByTestId('toggle-q-u1'))

    await waitFor(() => expect(setContextFilter).toHaveBeenCalledWith({
      branchId: 'b1', targetType: 'question', targetId: 'u1', mode: 'exclude',
    }))
    await waitFor(() => expect(readBranch.mock.calls.length).toBeGreaterThanOrEqual(2))
  })
})
