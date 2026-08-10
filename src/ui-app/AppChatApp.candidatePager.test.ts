import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installGenerationV2TestBridge } from '../../tests/helpers/generationV2Bridge'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp (candidate pager)', () => {
  let originalGenerationV2: any
  let streaming: boolean
  let getMessageCandidateNavigation: ReturnType<typeof vi.fn>
  let readBranch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    installGenerationV2TestBridge()
    originalGenerationV2 = (globalThis as any).generationV2
    const ok = <T>(value: T) => ({ ok: true as const, value })
    const baseTemplate = originalGenerationV2.workspace.getSystemTemplate
    streaming = false
    ;(HTMLElement.prototype as any).scrollIntoView = vi.fn()
    const answer = (answerRootId: 'a1' | 'a2' | 'a3') => ({
      answerRootId, status: streaming && answerRootId === 'a1' ? 'streaming' : 'completed',
      body: answerRootId.toUpperCase(), createdAtMs: answerRootId === 'a1' ? 2 : answerRootId === 'a2' ? 3 : 4,
      updatedAtMs: answerRootId === 'a1' ? 2 : answerRootId === 'a2' ? 3 : 4, chosen: true,
      operationId: `operation:${answerRootId}`, actionKind: 'initial', providerId: 'openrouter',
      modelId: 'openai/gpt-4.1-nano', errorCode: null, errorMessage: null,
      endpointProfileId: 'openrouter-first-party-v1', protocolContractId: 'openrouter-chat-completions-v1',
      reasoningDetails: [], attachments: [], images: [],
    })
    readBranch = vi.fn(async (branchId: string) => {
      const answerRootId = branchId === 'b2' ? 'a2' : branchId === 'b3' ? 'a3' : 'a1'
      const questionId = branchId === 'b3' ? 'u2' : 'u1'
      return ok({
      branchId, conversationId: 'c1', projectId: 'project_inbox', title: 'Chat 1',
      branchName: branchId === 'b2' ? 'Retry' : branchId === 'b3' ? 'Edited' : 'Main',
      headMessageId: answerRootId,
      beforeMessageId: null, hasMoreTurns: false,
      turns: [{
        questionId, questionBody: questionId === 'u2' ? 'Q2' : 'Q1',
        questionCreatedAtMs: questionId === 'u2' ? 4 : 1, chosenAnswerRootId: answerRootId,
        contextFilter: { questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
        answers: [answer(answerRootId)],
      }],
    })
    })
    getMessageCandidateNavigation = vi.fn(async (branchId: string, messageId: string) => {
      if (messageId === 'u1' || messageId === 'u2') return ok({
        conversationId: 'c1', currentBranchId: branchId, messageId, parentMessageId: null,
        role: 'user', currentIndex: messageId === 'u1' ? 0 : 1, total: 2,
        previous: messageId === 'u2' ? { messageId: 'u1', branchId: 'b1' } : null,
        next: messageId === 'u1' ? { messageId: 'u2', branchId: 'b3' } : null,
      })
      if (messageId === 'a3') return ok({
        conversationId: 'c1', currentBranchId: branchId, messageId, parentMessageId: 'u2',
        role: 'assistant', currentIndex: 0, total: 1, previous: null, next: null,
      })
      const first = messageId === 'a1'
      return ok({
        conversationId: 'c1', currentBranchId: branchId, messageId, parentMessageId: 'u1',
        role: 'assistant', currentIndex: first ? 0 : 1, total: 2,
        previous: first ? null : { messageId: 'a1', branchId: 'b1' },
        next: first ? { messageId: 'a2', branchId: 'b2' } : null,
      })
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
            conversation: { ...result.value.conversation, id: 'c1', projectId: 'project_inbox', branchId: 'b1', title: 'Chat 1' },
            draft: { ...result.value.draft, conversationId: 'c1' },
          })
        }),
        listProjects: vi.fn(async () => ok([{ projectId: 'project_inbox', name: 'Inbox', createdAtMs: 1, updatedAtMs: 3 }])),
        listConversations: vi.fn(async () => ok({ items: [{
          conversationId: 'c1', projectId: 'project_inbox', title: 'Chat 1', updatedAtMs: 3,
          branches: [
            { branchId: 'b1', name: 'Main', headMessageId: 'a1', updatedAtMs: 3 },
            { branchId: 'b2', name: 'Retry', headMessageId: 'a2', updatedAtMs: 4 },
            { branchId: 'b3', name: 'Edited', headMessageId: 'a3', updatedAtMs: 5 },
          ],
          branchesHasMore: false,
        }], nextCursor: null, totalCount: 1 })),
        listBranches: vi.fn(async () => ok({ items: [
          { branchId: 'b1', name: 'Main', headMessageId: 'a1', updatedAtMs: 3 },
          { branchId: 'b2', name: 'Retry', headMessageId: 'a2', updatedAtMs: 4 },
          { branchId: 'b3', name: 'Edited', headMessageId: 'a3', updatedAtMs: 5 },
        ], nextCursor: null, totalCount: 3 })),
        readBranch,
        getMessageCandidateNavigation,
      },
    }
  })

  afterEach(() => {
    ;(globalThis as any).generationV2 = originalGenerationV2
  })

  it('renders old-to-new position and browses by switching to the candidate introduction branch', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q1')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('1/2'))
    expect(screen.getByTestId('cand-prev-u1')).toBeDisabled()
    expect(screen.getByTestId('cand-next-u1')).toBeEnabled()

    await user.click(screen.getByTestId('cand-next-u1'))
    await screen.findByText('A2')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('2/2'))
    expect(readBranch).toHaveBeenCalledWith('b2', null, 50)
    expect(getMessageCandidateNavigation).toHaveBeenCalledWith('b1', 'a1')
    expect(getMessageCandidateNavigation).toHaveBeenCalledWith('b2', 'a2')
  })

  it('keeps candidate branch navigation available while the current answer is streaming', async () => {
    streaming = true
    const user = userEvent.setup()
    render(AppChatApp)
    await screen.findByText('Q1')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('1/2'))
    expect(screen.getByTestId('cand-prev-u1')).toBeDisabled()
    expect(screen.getByTestId('cand-next-u1')).toBeEnabled()
    await user.click(screen.getByTestId('cand-next-u1'))
    await screen.findByText('A2')
  })

  it('uses the same read-only branch navigation for question siblings', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q1')
    await waitFor(() => expect(screen.getByTestId('qvar-pos-u1').textContent).toBe('1/2'))
    await user.click(screen.getByTestId('qvar-next-u1'))
    await screen.findByText('Q2')
    await waitFor(() => expect(screen.getByTestId('qvar-pos-u2').textContent).toBe('2/2'))
    expect(readBranch).toHaveBeenCalledWith('b3', null, 50)
  })
})
