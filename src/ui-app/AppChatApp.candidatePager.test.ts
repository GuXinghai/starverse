import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp (candidate pager)', () => {
  let originalGenerationV2: any
  let chosen: 'a1' | 'a2'
  let streaming: boolean
  let selectAnswer: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalGenerationV2 = (globalThis as any).generationV2
    const ok = <T>(value: T) => ({ ok: true as const, value })
    const baseTemplate = originalGenerationV2.workspace.getSystemTemplate
    chosen = 'a1'
    streaming = false
    const answer = (answerRootId: 'a1' | 'a2') => ({
      answerRootId, status: streaming && answerRootId === chosen ? 'streaming' : 'completed',
      body: answerRootId === 'a1' ? 'A1' : 'A2', createdAtMs: answerRootId === 'a1' ? 2 : 3,
      updatedAtMs: answerRootId === 'a1' ? 2 : 3, chosen: answerRootId === chosen,
      operationId: `operation:${answerRootId}`, actionKind: 'initial', providerId: 'openrouter',
      modelId: 'openai/gpt-4.1-nano', errorCode: null, errorMessage: null,
      endpointProfileId: 'openrouter-first-party-v1', protocolContractId: 'openrouter-chat-completions-v1',
      reasoningDetails: [], attachments: [], images: [],
    })
    const readBranch = vi.fn(async () => ok({
      branchId: 'b1', conversationId: 'c1', projectId: 'project_inbox', title: 'Chat 1',
      branchName: 'Main', headMessageId: chosen,
      turns: [{
        questionId: 'u1', questionBody: 'Q1', questionCreatedAtMs: 1, chosenAnswerRootId: chosen,
        contextFilter: { questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
        answers: [answer('a1'), answer('a2')],
      }],
    }))
    selectAnswer = vi.fn(async (input: any) => {
      chosen = input.targetAnswerRootId
      return ok({ headMessageId: chosen, chosenAnswerRootId: chosen })
    })

    ;(globalThis as any).generationV2 = {
      ...originalGenerationV2,
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
        listConversations: vi.fn(async () => ok([{
          conversationId: 'c1', projectId: 'project_inbox', title: 'Chat 1', updatedAtMs: 3,
          branches: [{ branchId: 'b1', name: 'Main', headMessageId: chosen, updatedAtMs: 3 }],
        }])),
        readBranch,
        selectAnswer,
      },
    }
  })

  afterEach(() => {
    ;(globalThis as any).generationV2 = originalGenerationV2
  })

  it('renders old-to-new position and atomically selects through the V2 workspace', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByText('Q1')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('1/2'))
    expect(screen.getByTestId('cand-prev-u1')).toBeDisabled()
    expect(screen.getByTestId('cand-next-u1')).toBeEnabled()

    await user.click(screen.getByTestId('cand-next-u1'))
    await screen.findByText('A2')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('2/2'))
    expect(selectAnswer).toHaveBeenCalledWith({
      branchId: 'b1', questionId: 'u1', expectedChosenAnswerRootId: 'a1', targetAnswerRootId: 'a2',
    })
  })

  it('locks both candidate controls while the chosen answer is streaming', async () => {
    streaming = true
    render(AppChatApp)
    await screen.findByText('Q1')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('1/2'))
    expect(screen.getByTestId('cand-prev-u1')).toBeDisabled()
    expect(screen.getByTestId('cand-next-u1')).toBeDisabled()
  })
})
