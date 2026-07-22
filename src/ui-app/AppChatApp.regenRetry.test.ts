import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import AppChatApp from './AppChatApp.vue'

type AnswerStatus = 'streaming' | 'completed' | 'failed' | 'cancelled'
type AnswerState = {
  answerRootId: string
  status: AnswerStatus
  body: string
  createdAtMs: number
  actionKind: 'initial' | 'regenerate' | 'retry_replace' | 'retry_as_new'
  modelId: string
}

describe('ui-app AppChatApp (Generation V2 regenerate + retry)', () => {
  let originalGenerationV2: any
  let originalRawGenerationDebug: any
  let answers: AnswerState[]
  let chosenAnswerRootId: string
  let headMessageId: string
  let readBranch: ReturnType<typeof vi.fn>
  let regenerate: ReturnType<typeof vi.fn>
  let retry: ReturnType<typeof vi.fn>

  const ok = <T>(value: T) => ({ ok: true as const, value })

  function answerView(answer: AnswerState) {
    return {
      ...answer,
      updatedAtMs: answer.createdAtMs,
      chosen: answer.answerRootId === chosenAnswerRootId,
      operationId: `operation:${answer.answerRootId}`,
      providerId: 'openrouter',
      errorCode: answer.status === 'failed' ? 'provider_error' : null,
      errorMessage: answer.status === 'failed' ? 'provider error' : null,
      endpointProfileId: 'openrouter-first-party-v1',
      protocolContractId: 'openrouter-chat-completions-v1',
      reasoningDetails: [],
      attachments: [],
      images: [],
    }
  }

  function branchView() {
    return {
      branchId: 'b1', conversationId: 'c1', projectId: 'project_inbox', title: 'Chat 1',
      branchName: 'Main', headMessageId,
      turns: [{
        questionId: 'u1', questionBody: 'Q1', questionCreatedAtMs: 1, chosenAnswerRootId,
        contextFilter: {
          questionMode: 'include', answerMode: 'include', effectiveMode: 'include',
          lockedByQuestionExclude: false,
        },
        answers: answers.map(answerView),
      }],
    }
  }

  function commandResult(actionKind: 'regenerate' | 'retry_replace' | 'retry_as_new') {
    return {
      ok: true as const,
      kind: 'created' as const,
      operationId: `operation:${actionKind}`,
      answerRootId: 'a2',
      actionKind,
      branch: {
        branchId: 'b1', conversationId: 'c1', questionId: 'u1',
        headMessageId: 'a2', chosenAnswerRootId: 'a2', deletedAtMs: null,
      },
      visibleAnswerRootIds: answers.map((answer) => answer.answerRootId),
      visibleQuestionIds: ['u1'],
    }
  }

  function commitNewAnswer(actionKind: 'regenerate' | 'retry_replace' | 'retry_as_new') {
    const next: AnswerState = {
      answerRootId: 'a2', status: 'streaming', body: '', createdAtMs: 3,
      actionKind, modelId: DEFAULT_OPENROUTER_TEST_MODEL,
    }
    answers = actionKind === 'retry_replace' ? [next] : [...answers, next]
    chosenAnswerRootId = 'a2'
    headMessageId = 'a2'
    return commandResult(actionKind)
  }

  beforeEach(() => {
    originalGenerationV2 = (globalThis as any).generationV2
    originalRawGenerationDebug = (globalThis as any).rawGenerationDebug
    answers = [{
      answerRootId: 'a1', status: 'completed', body: 'A1', createdAtMs: 2,
      actionKind: 'initial', modelId: 'historical/model',
    }]
    chosenAnswerRootId = 'a1'
    headMessageId = 'a1'
    for (const key of [
      'starverse.openAIResponsesTextChat.enabled',
      'starverse.googleAIStudioTextChat.enabled',
      'starverse.anthropicMessagesTextChat.enabled',
      'starverse.deepSeekTextChat.enabled',
      'starverse.localEndpointTextChat.enabled',
      'starverse.lmStudioTextChat.enabled',
      'starverse.ollamaTextChat.enabled',
    ]) globalThis.localStorage?.removeItem(key)
    globalThis.localStorage?.setItem('starverse.openRouterTextChat.enabled', '1')

    const baseTemplate = originalGenerationV2.workspace.getSystemTemplate
    readBranch = vi.fn(async () => ok(branchView()))
    regenerate = vi.fn(async () => commitNewAnswer('regenerate'))
    retry = vi.fn(async (command: any) => commitNewAnswer(command.actionKind))

    ;(globalThis as any).generationV2 = {
      ...originalGenerationV2,
      openRouter: {
        ...originalGenerationV2.openRouter,
        chat: { ...originalGenerationV2.openRouter.chat, regenerate, retry },
      },
      workspace: {
        ...originalGenerationV2.workspace,
        ensureDefault: vi.fn(async () => ok({
          projectId: 'project_inbox', conversationId: 'c1', branchId: 'b1', created: false,
        })),
        getSystemTemplate: vi.fn(async () => {
          const result = await baseTemplate()
          return ok({
            ...result.value,
            conversation: {
              ...result.value.conversation,
              id: 'c1', projectId: 'project_inbox', branchId: 'b1', title: 'Chat 1',
              meta: {
                selectedProviderId: 'openrouter',
                selectedModelKey: DEFAULT_OPENROUTER_TEST_MODEL,
              },
            },
            draft: { ...result.value.draft, conversationId: 'c1' },
          })
        }),
        listProjects: vi.fn(async () => ok([{
          projectId: 'project_inbox', name: 'Inbox', createdAtMs: 1, updatedAtMs: 3,
        }])),
        listConversations: vi.fn(async () => ok([{
          conversationId: 'c1', projectId: 'project_inbox', title: 'Chat 1', updatedAtMs: 3,
          meta: {
            selectedProviderId: 'openrouter',
            selectedModelKey: DEFAULT_OPENROUTER_TEST_MODEL,
          },
          branches: [{ branchId: 'b1', name: 'Main', headMessageId, updatedAtMs: 3 }],
        }])),
        readBranch,
        getConversationRoutePreference: vi.fn(async () => ok({
          conversationId: 'c1', revision: 1,
          selection: { schemaVersion: 1, kind: 'provider_model',
            providerId: 'openrouter', modelId: DEFAULT_OPENROUTER_TEST_MODEL },
        })),
      },
    }
  })

  afterEach(() => {
    ;(globalThis as any).generationV2 = originalGenerationV2
    ;(globalThis as any).rawGenerationDebug = originalRawGenerationDebug
    globalThis.localStorage?.removeItem('starverse.openRouterTextChat.enabled')
  })

  it('regenerate uses current configuration and immediately selects a preserved sibling', async () => {
    const user = userEvent.setup()
    render(AppChatApp)
    await screen.findByText('A1')

    await user.click(screen.getByTestId('regen-q-u1'))

    await waitFor(() => expect(regenerate).toHaveBeenCalledTimes(1))
    expect(regenerate).toHaveBeenCalledWith(expect.objectContaining({
      branchId: 'b1', questionId: 'u1', expectedHeadMessageId: 'a1',
      modelId: DEFAULT_OPENROUTER_TEST_MODEL,
    }))
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1')).toHaveTextContent('2/2'))
    expect(screen.getByTestId('retry-a-a2')).toBeDisabled()
    expect(answers.map((answer) => answer.answerRootId)).toEqual(['a1', 'a2'])
    expect(chosenAnswerRootId).toBe('a2')
    expect(headMessageId).toBe('a2')
  })

  it('retry as new binds the rendered chosen answer and preserves it as a sibling', async () => {
    const user = userEvent.setup()
    render(AppChatApp)
    await screen.findByText('A1')

    await user.click(screen.getByTestId('retry-new-a-a1'))

    await waitFor(() => expect(retry).toHaveBeenCalledWith(expect.objectContaining({
      actionKind: 'retry_as_new', branchId: 'b1', questionId: 'u1',
      targetAnswerRootId: 'a1', expectedHeadMessageId: 'a1',
    })))
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1')).toHaveTextContent('2/2'))
    expect(answers.map((answer) => answer.answerRootId)).toEqual(['a1', 'a2'])
    expect(chosenAnswerRootId).toBe('a2')
    expect(headMessageId).toBe('a2')
  })

  it('retry replace binds the rendered chosen answer and removes it from visible candidates', async () => {
    const user = userEvent.setup()
    render(AppChatApp)
    await screen.findByText('A1')

    await user.click(screen.getByTestId('retry-a-a1'))

    await waitFor(() => expect(retry).toHaveBeenCalledWith(expect.objectContaining({
      actionKind: 'retry_replace', branchId: 'b1', questionId: 'u1',
      targetAnswerRootId: 'a1', expectedHeadMessageId: 'a1',
    })))
    await waitFor(() => expect(screen.getByTestId('retry-a-a2')).toBeDisabled())
    expect(screen.queryByTestId('cand-pos-u1')).not.toBeInTheDocument()
    expect(answers.map((answer) => answer.answerRootId)).toEqual(['a2'])
    expect(chosenAnswerRootId).toBe('a2')
    expect(headMessageId).toBe('a2')
  })

  it.each(['failed', 'cancelled'] as const)(
    'keeps the committed answer chosen after a %s terminal projection',
    async (terminalState) => {
      const user = userEvent.setup()
      render(AppChatApp)
      await screen.findByText('A1')
      await user.click(screen.getByTestId('retry-new-a-a1'))
      await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))

      answers = answers.map((answer) => answer.answerRootId === 'a2'
        ? { ...answer, status: terminalState, body: 'partial output' }
        : answer)
      await (globalThis as any).generationV2.openRouter.chat.onProjection.mock.calls[0]?.[0]?.({
        type: 'terminal', operationId: 'operation:retry_as_new', answerRootId: 'a2',
        state: terminalState, errorCode: terminalState === 'failed' ? 'provider_error' : null,
        errorMessage: terminalState === 'failed' ? 'provider error' : null,
      })

      await waitFor(() => expect(readBranch.mock.calls.length).toBeGreaterThanOrEqual(3))
      expect(chosenAnswerRootId).toBe('a2')
      expect(headMessageId).toBe('a2')
    },
  )

  it('does not submit a second action while the chosen answer is streaming', async () => {
    answers[0] = { ...answers[0], status: 'streaming' }
    render(AppChatApp)
    await screen.findByText('Q1')

    expect(screen.getByTestId('regen-q-u1')).toBeDisabled()
    expect(screen.getByTestId('retry-a-a1')).toBeDisabled()
    expect(screen.getByTestId('retry-new-a-a1')).toBeDisabled()
  })

  it('shows the persisted exact request and original provider error for the answer', async () => {
    const user = userEvent.setup()
    ;(globalThis as any).rawGenerationDebug = {
      getStatus: vi.fn(async () => ({ available: true, schemaReady: true, errorCode: null })),
      listByAnswerRootId: vi.fn(async () => [{
        id: 'request-1', operationId: 'operation:a1', answerRootId: 'a1', requestSequence: 1,
        providerId: 'openrouter', modelId: DEFAULT_OPENROUTER_TEST_MODEL,
        serializedBody: '{"model":"raw-model"}', bodyBytes: 21,
        bodySha256: 'a'.repeat(64), capturedAtMs: 1,
      }]),
      listProviderErrorsByAnswerRootId: vi.fn(async () => [{
        id: 'error-1', operationId: 'operation:a1', answerRootId: 'a1', requestSequence: 1,
        providerId: 'openrouter', modelId: DEFAULT_OPENROUTER_TEST_MODEL,
        phase: 'sse_event', httpStatus: 200, contentType: 'text/event-stream',
        providerRequestId: 'gen-1', payloadBase64: '',
        payloadText: '{"error":{"code":429,"message":"raw provider error"}}',
        payloadBytes: 52, payloadSha256: 'b'.repeat(64), capturedAtMs: 2,
      }]),
    }
    render(AppChatApp)
    await screen.findByText('A1')

    await user.click(screen.getByTestId('raw-data-a-a1'))

    expect(await screen.findByTestId('raw-data-request-1')).toHaveTextContent('"raw-model"')
    expect(await screen.findByTestId('raw-data-provider-error-1')).toHaveTextContent('raw provider error')
  })
})
