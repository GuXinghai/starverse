import { render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import { t } from '@/shared/i18n'
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
  let childAnswer: AnswerState | null
  let chosenAnswerRootId: string
  let headMessageId: string
  let readBranch: ReturnType<typeof vi.fn>
  let regenerate: ReturnType<typeof vi.fn>
  let retry: ReturnType<typeof vi.fn>
  let runtimeAbort: ReturnType<typeof vi.fn>
  let runtimeEventListener: ((value: unknown) => void) | null

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

  function branchView(branchId = 'b1') {
    const branchAnswers = branchId === 'b2' && childAnswer ? [childAnswer] : answers
    const branchChosen = branchId === 'b2' && childAnswer ? childAnswer.answerRootId : chosenAnswerRootId
    const branchHead = branchId === 'b2' && childAnswer ? childAnswer.answerRootId : headMessageId
    return {
      branchId, conversationId: 'c1', projectId: 'project_inbox', title: 'Chat 1',
      branchName: branchId === 'b1' ? 'Main' : 'Generated branch', headMessageId: branchHead,
      beforeMessageId: null, hasMoreTurns: false,
      turns: [{
        questionId: 'u1', questionBody: 'Q1', questionCreatedAtMs: 1, chosenAnswerRootId: branchChosen,
        contextFilter: {
          questionMode: 'include', answerMode: 'include', effectiveMode: 'include',
          lockedByQuestionExclude: false,
        },
        answers: branchAnswers.map((answer) => ({
          ...answerView(answer),
          chosen: answer.answerRootId === branchChosen,
        })),
      }],
    }
  }

  function commandResult(actionKind: 'regenerate' | 'retry_replace' | 'retry_as_new') {
    const targetBranchId = actionKind === 'retry_replace' ? 'b1' : 'b2'
    return {
      ok: true as const,
      kind: 'created' as const,
      operationId: `operation:${actionKind}`,
      answerRootId: 'a2',
      actionKind,
      branch: {
        branchId: targetBranchId, conversationId: 'c1', questionId: 'u1',
        headMessageId: 'a2', chosenAnswerRootId: 'a2', deletedAtMs: null,
      },
    }
  }

  function commitNewAnswer(actionKind: 'regenerate' | 'retry_replace' | 'retry_as_new') {
    const next: AnswerState = {
      answerRootId: 'a2', status: 'streaming', body: '', createdAtMs: 3,
      actionKind, modelId: DEFAULT_OPENROUTER_TEST_MODEL,
    }
    if (actionKind === 'retry_replace') {
      answers = [next]
      chosenAnswerRootId = 'a2'
      headMessageId = 'a2'
    } else {
      childAnswer = next
    }
    return commandResult(actionKind)
  }

  function runtimeSnapshot(
    operationId: string,
    targetAnswerId: string,
    branchId: string,
    status: 'generating' | 'completed' | 'failed' | 'cancelled',
    lastSequence = 0,
    reasoning: readonly Readonly<Record<string, unknown>>[] = [],
  ) {
    const target = branchId === 'b2' ? childAnswer : answers.find((answer) => answer.answerRootId === targetAnswerId)
    return {
      binding: {
        operationId,
        conversationId: 'c1',
        branchId,
        targetAnswerId,
        sourceAnswerId: targetAnswerId === 'a1' ? null : 'a1',
        snapshotHash: 'a'.repeat(64),
        providerId: 'openrouter',
        contractId: 'openrouter-chat-completions-v1',
      },
      status,
      body: target?.body ?? '',
      reasoning,
      images: [],
      lastSequence,
      errorFact: null,
      updatedAtMs: 10 + lastSequence,
    }
  }

  beforeEach(() => {
    originalGenerationV2 = (globalThis as any).generationV2
    originalRawGenerationDebug = (globalThis as any).rawGenerationDebug
    answers = [{
      answerRootId: 'a1', status: 'completed', body: 'A1', createdAtMs: 2,
      actionKind: 'initial', modelId: 'historical/model',
    }]
    childAnswer = null
    chosenAnswerRootId = 'a1'
    headMessageId = 'a1'
    runtimeEventListener = null
    runtimeAbort = vi.fn(async () => ok({ aborted: true }))
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
    readBranch = vi.fn(async (branchId = 'b1') => ok(branchView(branchId)))
    regenerate = vi.fn(async () => commitNewAnswer('regenerate'))
    retry = vi.fn(async (command: any) => commitNewAnswer(command.actionKind))

    ;(globalThis as any).generationV2 = {
      ...originalGenerationV2,
      runtime: {
        subscribe: vi.fn(async () => ok(answers
          .filter((answer) => answer.status === 'streaming')
          .map((answer) => runtimeSnapshot(`operation:${answer.answerRootId}`, answer.answerRootId, 'b1', 'generating')))),
        snapshot: vi.fn(async (operationId: string) => {
          if (operationId === 'operation:retry_as_new' && childAnswer) {
            const status = childAnswer.status === 'streaming' ? 'generating' : childAnswer.status
            return ok(runtimeSnapshot(operationId, 'a2', 'b2', status, 1))
          }
          return ok(null)
        }),
        abort: runtimeAbort,
        onEvent: vi.fn((listener: (value: unknown) => void) => {
          runtimeEventListener = listener
          return () => {
            if (runtimeEventListener === listener) runtimeEventListener = null
          }
        }),
      },
      openRouter: {
        ...originalGenerationV2.openRouter,
        chat: { ...originalGenerationV2.openRouter.chat, regenerate, retry },
      },
      workspace: {
        ...originalGenerationV2.workspace,
        ensureDefault: vi.fn(async () => ok({
          projectId: 'project_inbox', conversationId: 'template:c1', branchId: 'template:b1', created: false,
        })),
        getSystemTemplate: vi.fn(async () => {
          const result = await baseTemplate()
          return ok({
            ...result.value,
            settings: {
              ...result.value.settings,
              startupNavigation: 'restore_last_formal',
            },
            conversation: {
              ...result.value.conversation,
              id: 'template:c1', projectId: 'project_inbox', branchId: 'template:b1', title: 'New Chat',
              meta: {
                selectedProviderId: 'openrouter',
                selectedModelKey: DEFAULT_OPENROUTER_TEST_MODEL,
              },
            },
            draft: { ...result.value.draft, conversationId: 'template:c1' },
          })
        }),
        listProjects: vi.fn(async () => ok([{
          projectId: 'project_inbox', name: 'Inbox', createdAtMs: 1, updatedAtMs: 3,
        }])),
        getLastFormalConversation: vi.fn(async () => ok({ conversationId: 'c1' })),
        listConversations: vi.fn(async () => ok({ items: [{
          conversationId: 'c1', projectId: 'project_inbox', title: 'Chat 1', updatedAtMs: 3,
          meta: {
            selectedProviderId: 'openrouter',
            selectedModelKey: DEFAULT_OPENROUTER_TEST_MODEL,
          },
          branches: [{ branchId: 'b1', name: 'Main', headMessageId, updatedAtMs: 3 }],
          branchesHasMore: false,
        }], nextCursor: null, totalCount: 1 })),
        listBranches: vi.fn(async () => ok({ items: [
          { branchId: 'b1', name: 'Main', headMessageId, updatedAtMs: 3 },
          ...(childAnswer ? [{ branchId: 'b2', name: 'Generated branch', headMessageId: 'a2', updatedAtMs: 4 }] : []),
        ], nextCursor: null, totalCount: childAnswer ? 2 : 1 })),
        readBranch,
        getMessageCandidateNavigation: vi.fn(async (branchId: string, messageId: string) => ok({
          conversationId: 'c1', currentBranchId: branchId, messageId,
          parentMessageId: messageId.startsWith('a') ? 'u1' : null,
          role: messageId.startsWith('a') ? 'assistant' : 'user',
          currentIndex: messageId === 'a2' ? 1 : 0,
          total: childAnswer && messageId.startsWith('a') ? 2 : 1,
          previous: messageId === 'a2' ? { messageId: 'a1', branchId: 'b1' } : null,
          next: childAnswer && messageId === 'a1' ? { messageId: 'a2', branchId: 'b2' } : null,
        })),
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
      sourceBranchId: 'b1', questionId: 'u1', expectedHeadMessageId: 'a1',
      modelId: DEFAULT_OPENROUTER_TEST_MODEL,
    }))
    await screen.findByTestId('msg-wrap-a2')
    await waitFor(() => expect(screen.getByTestId('cand-pos-u1').textContent).toBe('2/2'))
    expect(screen.getByTestId('retry-a-a2')).toBeDisabled()
    expect(answers.map((answer) => answer.answerRootId)).toEqual(['a1'])
    expect(childAnswer?.answerRootId).toBe('a2')
    expect(chosenAnswerRootId).toBe('a1')
    expect(headMessageId).toBe('a1')
  })

  it('applies a live reasoning projection to the branch-keyed runtime without a refresh', async () => {
    const user = userEvent.setup()
    answers[0] = { ...answers[0], status: 'streaming' }
    render(AppChatApp)
    await screen.findByText('A1')
    const readsBeforeProjection = readBranch.mock.calls.length

    runtimeEventListener?.({
      operationId: 'operation:a1',
      sequence: 1,
      payload: {
        type: 'reasoning_detail',
        detail: { type: 'reasoning.text', text: 'live reasoning detail' },
      },
    })

    const answer = screen.getByTestId('msg-wrap-a1')
    const reasoningToggle = await within(answer).findByRole('button', { name: t('chat.reasoning.title') })
    await user.click(reasoningToggle)
    await within(answer).findByText('live reasoning detail')
    expect(readBranch).toHaveBeenCalledTimes(readsBeforeProjection)
  })

  it('retry as new binds the rendered chosen answer and preserves it as a sibling', async () => {
    const user = userEvent.setup()
    render(AppChatApp)
    await screen.findByText('A1')

    await user.click(screen.getByTestId('retry-new-a-a1'))

    await waitFor(() => expect(retry).toHaveBeenCalledWith(expect.objectContaining({
      actionKind: 'retry_as_new', sourceBranchId: 'b1', questionId: 'u1',
      sourceAnswerId: 'a1', expectedHeadMessageId: 'a1',
    })))
    await screen.findByTestId('msg-wrap-a2')
    expect(answers.map((answer) => answer.answerRootId)).toEqual(['a1'])
    expect(childAnswer?.answerRootId).toBe('a2')
    expect(chosenAnswerRootId).toBe('a1')
    expect(headMessageId).toBe('a1')
  })

  it('retry replace binds the rendered chosen answer and removes it from visible candidates', async () => {
    const user = userEvent.setup()
    render(AppChatApp)
    await screen.findByText('A1')

    await user.click(screen.getByTestId('retry-a-a1'))

    await waitFor(() => expect(retry).toHaveBeenCalledWith(expect.objectContaining({
      actionKind: 'retry_replace', sourceBranchId: 'b1', questionId: 'u1',
      sourceAnswerId: 'a1', expectedHeadMessageId: 'a1',
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

      childAnswer = childAnswer ? { ...childAnswer, status: terminalState, body: 'partial output' } : null
      runtimeEventListener?.({
        operationId: 'operation:retry_as_new',
        sequence: 1,
        payload: {
          type: 'terminal',
          state: terminalState,
          errorCode: terminalState === 'failed' ? 'provider_error' : null,
          errorMessage: terminalState === 'failed' ? 'provider error' : null,
          errorFact: null,
        },
      })

      await waitFor(() => expect(readBranch.mock.calls.length).toBeGreaterThanOrEqual(3))
      expect(childAnswer?.answerRootId).toBe('a2')
      expect(chosenAnswerRootId).toBe('a1')
      expect(headMessageId).toBe('a1')
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

  it('keeps an inactive branch generating in cache and scopes stop to the visible branch', async () => {
    const user = userEvent.setup()
    answers[0] = { ...answers[0], status: 'streaming', body: 'initial partial' }
    childAnswer = {
      answerRootId: 'a2',
      status: 'completed',
      body: 'other branch',
      createdAtMs: 3,
      actionKind: 'regenerate',
      modelId: DEFAULT_OPENROUTER_TEST_MODEL,
    }
    render(AppChatApp)

    await screen.findByText('initial partial')
    await screen.findByTestId('composer-stop')
    await user.selectOptions(screen.getByTestId('branch-selector'), 'b2')
    await screen.findByText('other branch')
    expect(screen.queryByTestId('composer-stop')).not.toBeInTheDocument()

    runtimeEventListener?.({
      operationId: 'operation:a1',
      sequence: 1,
      payload: { type: 'assistant_body', content: 'background partial update' },
    })
    await user.selectOptions(screen.getByTestId('branch-selector'), 'b1')
    await screen.findByText('background partial update')

    await user.click(await screen.findByTestId('composer-stop'))
    await waitFor(() => expect(runtimeAbort).toHaveBeenCalledWith('operation:a1'))
  })

  it('does not steal navigation when a child-branch command commits after the user leaves', async () => {
    const user = userEvent.setup()
    childAnswer = {
      answerRootId: 'a2',
      status: 'completed',
      body: 'other branch',
      createdAtMs: 3,
      actionKind: 'regenerate',
      modelId: DEFAULT_OPENROUTER_TEST_MODEL,
    }
    let complete!: (value: any) => void
    regenerate.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    render(AppChatApp)
    await screen.findByText('A1')

    await user.click(screen.getByTestId('regen-q-u1'))
    await waitFor(() => expect(regenerate).toHaveBeenCalledTimes(1))
    await user.selectOptions(screen.getByTestId('branch-selector'), 'b2')
    await screen.findByText('other branch')

    complete({
      ok: true,
      kind: 'created',
      operationId: 'operation:late',
      answerRootId: 'a3',
      actionKind: 'regenerate',
      branch: {
        branchId: 'b3',
        conversationId: 'c1',
        questionId: 'u1',
        headMessageId: 'a3',
        chosenAnswerRootId: 'a3',
        deletedAtMs: null,
      },
    })

    await waitFor(() => expect(screen.getByTestId('branch-selector')).toHaveValue('b2'))
    expect(screen.getByText('other branch')).toBeInTheDocument()
  })

  it('loads additional conversations and branches without replacing the active route', async () => {
    const user = userEvent.setup()
    const firstConversationCursor = { updatedAtMs: 3, conversationId: 'c1' }
    const firstBranchCursor = { updatedAtMs: 3, branchId: 'b1' }
    const workspace = (globalThis as any).generationV2.workspace
    ;(globalThis as any).generationV2 = {
      ...(globalThis as any).generationV2,
      workspace: {
        ...workspace,
        listConversations: vi.fn(async (_projectId: string, cursor: unknown) => ok(cursor
          ? {
              items: [{
                conversationId: 'c2', projectId: 'project_inbox', title: 'Chat 2', updatedAtMs: 2,
                meta: { selectedProviderId: null, selectedModelKey: null },
                branches: [], branchesHasMore: false,
              }],
              nextCursor: null,
              totalCount: 2,
            }
          : {
              items: [{
                conversationId: 'c1', projectId: 'project_inbox', title: 'Chat 1', updatedAtMs: 3,
                meta: {
                  selectedProviderId: 'openrouter',
                  selectedModelKey: DEFAULT_OPENROUTER_TEST_MODEL,
                },
                branches: [{ branchId: 'b1', name: 'Main', headMessageId, updatedAtMs: 3 }],
                branchesHasMore: true,
              }],
              nextCursor: firstConversationCursor,
              totalCount: 2,
            })),
        listBranches: vi.fn(async (_conversationId: string, cursor: unknown) => ok(cursor
          ? {
              items: [{ branchId: 'b2', name: 'Branch 2', headMessageId: 'a2', updatedAtMs: 2 }],
              nextCursor: null,
              totalCount: 2,
            }
          : {
              items: [{ branchId: 'b1', name: 'Main', headMessageId, updatedAtMs: 3 }],
              nextCursor: firstBranchCursor,
              totalCount: 2,
            })),
      },
    }

    render(AppChatApp)
    await screen.findByText('A1')

    await user.click(await screen.findByTestId('conversation-load-more'))
    await screen.findByTestId('convo-row-c2')
    expect(screen.getByTestId('branch-selector')).toHaveValue('b1')

    await user.click(await screen.findByTestId('branch-load-more'))
    expect(await screen.findByRole('option', { name: 'Branch 2' })).toBeInTheDocument()
    expect(screen.getByTestId('branch-selector')).toHaveValue('b1')
  })

  it('prepends an earlier transcript page without dropping the current page', async () => {
    const user = userEvent.setup()
    const currentPage = {
      ...branchView('b1'),
      beforeMessageId: 'u0',
      hasMoreTurns: true,
    }
    const olderPage = {
      ...branchView('b1'),
      beforeMessageId: null,
      hasMoreTurns: false,
      turns: [{
        questionId: 'u0',
        questionBody: 'Earlier question',
        questionCreatedAtMs: 0,
        chosenAnswerRootId: 'a0',
        contextFilter: {
          questionMode: 'include',
          answerMode: 'include',
          effectiveMode: 'include',
          lockedByQuestionExclude: false,
        },
        answers: [{
          ...answerView({
            answerRootId: 'a0',
            status: 'completed',
            body: 'Earlier answer',
            createdAtMs: 0,
            actionKind: 'initial',
            modelId: 'historical/model',
          }),
          chosen: true,
        }],
      }],
    }
    readBranch.mockImplementation(async (_branchId: string, beforeMessageId: string | null = null) =>
      ok(beforeMessageId === 'u0' ? olderPage : currentPage))

    render(AppChatApp)
    await screen.findByText('Q1')
    await user.click(await screen.findByTestId('transcript-load-earlier'))

    expect(await screen.findByText('Earlier question')).toBeInTheDocument()
    expect(screen.getByText('Earlier answer')).toBeInTheDocument()
    expect(screen.getByText('Q1')).toBeInTheDocument()
    expect(screen.queryByTestId('transcript-load-earlier')).not.toBeInTheDocument()
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
