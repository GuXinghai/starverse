import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENROUTER_TEST_MODEL, OPENROUTER_TEST_MODELS } from '@/next/openrouter/openRouterTestModels'
import { installGenerationV2TestBridge } from '../../tests/helpers/generationV2Bridge'
import AppChatApp from './AppChatApp.vue'

const imageCapableModel = OPENROUTER_TEST_MODELS[1] ?? OPENROUTER_TEST_MODELS[0]

const draftBox = () => screen.getByTestId('composer-draft') as HTMLTextAreaElement
const sendButton = () => screen.getByTestId('composer-send')
const waitForAppReady = async () => {
  await waitFor(() => {
    expect(screen.getByTestId('current-model-pill')).toBeInTheDocument()
    expect(draftBox()).not.toBeDisabled()
  })
}

const ok = <T>(value: T) => ({ ok: true as const, value })

const bridge = () => (globalThis as any).generationV2

function getAtPath(obj: any, path: string): any {
  return path.split('.').reduce((node, part) => node?.[part], obj)
}

const ROUTES: Record<string, { path: string; providerId: string; contractId: string }> = {
  openrouter: { path: 'openRouter.chat', providerId: 'openrouter', contractId: 'openrouter-chat-completions-v1' },
  openai_responses: { path: 'openAIResponses', providerId: 'openai_responses', contractId: 'openai-responses-v1' },
  google_ai_studio: { path: 'gemini.generateContent', providerId: 'google_ai_studio', contractId: 'gemini-generate-content-v1' },
  deepseek: { path: 'deepSeek', providerId: 'deepseek', contractId: 'deepseek-chat-v1' },
  anthropic_messages: { path: 'anthropic', providerId: 'anthropic_messages', contractId: 'anthropic-messages-v1' },
  local_endpoint: { path: 'genericLocal.openAIChatCompletions', providerId: 'local_endpoint', contractId: 'generic-local-openai-chat-v1' },
  ollama_local: { path: 'ollama.chat', providerId: 'ollama_local', contractId: 'ollama-chat-v1' },
  lm_studio: { path: 'lmStudio.openResponses', providerId: 'lm_studio', contractId: 'lmstudio-openresponses-v1' },
}

const DEFAULT_ANSWER_TEXT: Record<string, string> = {
  openrouter: 'hi',
  openai_responses: 'openai hi',
  google_ai_studio: 'gemini hi',
  deepseek: 'deepseek hi',
  local_endpoint: 'local hi',
  ollama_local: 'ollama hi',
}

describe('ui-app AppChatApp (send: Generation V2 command contract)', () => {
  const originalElectronStore = (globalThis as any).electronStore
  const originalSetTimeout = globalThis.setTimeout
  let sessionMeta: Record<string, unknown> | null
  let routePreference: any
  let turns: Array<{
    questionId: string
    questionBody: string
    answerRootId: string
    answerBody: string
    status: 'streaming' | 'completed'
    modelId: string
    providerId: string
    contractId: string
    operationId: string
  }>
  let headMessageId: string | null
  let turnSeq: number
  let updateConfigCalls: any[]
  let updateRoutePreferenceCalls: any[]
  let commandInitialCalls: Array<{ path: string; command: any }>
  let localEndpointProfileBaseUrl: string
  const initialStubs: Record<string, any> = {}

  function commitTurn(input: {
    questionBody: string
    answerBody: string
    modelId: string
    providerId: string
    contractId: string
    status: 'streaming' | 'completed'
  }) {
    turnSeq += 1
    const turn = {
      questionId: `u${turnSeq}`,
      questionBody: input.questionBody,
      answerRootId: `a${turnSeq}`,
      answerBody: input.answerBody,
      status: input.status,
      modelId: input.modelId,
      providerId: input.providerId,
      contractId: input.contractId,
      operationId: `operation:a${turnSeq}`,
    }
    turns.push(turn)
    headMessageId = turn.answerRootId
    return turn
  }

  function snapshotForTurn(turn: (typeof turns)[number]) {
    return {
      binding: {
        operationId: turn.operationId,
        conversationId: 'c1',
        branchId: 'b1',
        targetAnswerId: turn.answerRootId,
        sourceAnswerId: null,
        snapshotHash: 'a'.repeat(64),
        providerId: turn.providerId,
        contractId: turn.contractId,
      },
      status: turn.status === 'completed' ? 'completed' : 'generating',
      body: turn.answerBody,
      reasoning: [],
      images: [],
      lastSequence: 1,
      errorFact: null,
      updatedAtMs: 2,
    }
  }

  function branchView() {
    return ok({
      branchId: 'b1',
      conversationId: 'c1',
      projectId: 'project:test',
      title: 'Chat 1',
      branchName: 'Main',
      headMessageId,
      beforeMessageId: null,
      hasMoreTurns: false,
      turns: turns.map((turn) => ({
        questionId: turn.questionId,
        questionBody: turn.questionBody,
        questionCreatedAtMs: 1,
        chosenAnswerRootId: turn.answerRootId,
        contextFilter: {
          questionMode: 'include',
          answerMode: 'include',
          effectiveMode: 'include',
          lockedByQuestionExclude: false,
        },
        answers: [
          {
            answerRootId: turn.answerRootId,
            status: turn.status,
            body: turn.answerBody,
            updatedAtMs: 2,
            chosen: true,
            operationId: turn.operationId,
            actionKind: 'initial',
            modelId: turn.modelId,
            providerId: turn.providerId,
            errorCode: null,
            errorMessage: null,
            endpointProfileId: 'openrouter-first-party-v1',
            protocolContractId: turn.contractId,
            reasoningDetails: [],
            attachments: [],
            images: [],
          },
        ],
      })),
    })
  }

  function installCommandStub(path: string, opts: {
    providerId: string
    contractId: string
    modelId: string
    answerText?: string
    rejectCode?: string
    status?: 'streaming' | 'completed'
  }) {
    const node = getAtPath(bridge(), path)
    const initial = vi.fn(async (command: any) => {
      commandInitialCalls.push({ path, command })
      if (opts.rejectCode) {
        return { ok: false, code: opts.rejectCode }
      }
      const turn = commitTurn({
        questionBody: String(command?.userBody ?? command?.prompt ?? ''),
        answerBody: opts.answerText ?? 'hi',
        modelId: opts.modelId,
        providerId: opts.providerId,
        contractId: opts.contractId,
        status: opts.status ?? 'completed',
      })
      return {
        ok: true,
        kind: 'created',
        operationId: turn.operationId,
        answerRootId: turn.answerRootId,
        actionKind: 'initial',
        branch: {
          branchId: 'b1',
          conversationId: 'c1',
          questionId: turn.questionId,
          headMessageId: turn.answerRootId,
          chosenAnswerRootId: turn.answerRootId,
          deletedAtMs: null,
        },
      }
    })
    node.initial = initial
    initialStubs[path] = initial
    return initial
  }

  function setRuntimeSelection(providerId: string, modelId: string) {
    const route = ROUTES[providerId]
    if (!route) throw new Error(`unknown runtime provider: ${providerId}`)
    routePreference = {
      conversationId: 'c1',
      revision: 1,
      selection: { schemaVersion: 1, kind: 'provider_model', providerId: route.providerId, modelId },
    }
  }

  function selectRuntimeProvider(providerId: string, modelId: string, opts: {
    rejectCode?: string
    status?: 'streaming' | 'completed'
    answerText?: string
  } = {}) {
    const route = ROUTES[providerId]
    setRuntimeSelection(providerId, modelId)
    installCommandStub(route.path, {
      providerId: route.providerId,
      contractId: route.contractId,
      modelId,
      answerText: opts.answerText ?? DEFAULT_ANSWER_TEXT[providerId] ?? 'hi',
      rejectCode: opts.rejectCode,
      status: opts.status,
    })
  }

  beforeEach(() => {
    installGenerationV2TestBridge()
    vi.useFakeTimers()
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.url')
    globalThis.localStorage?.removeItem('starverse.localEndpointTextChat.model')
    globalThis.localStorage?.removeItem('starverse.lmStudioTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.lmStudio.endpointUrl')
    globalThis.localStorage?.removeItem('starverse.lmStudio.model')
    globalThis.localStorage?.removeItem('starverse.lmStudio.chatMode')
    globalThis.localStorage?.removeItem('starverse.lmStudio.openAICompatible.preferredEndpoint')
    globalThis.localStorage?.removeItem('starverse.ollamaTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.ollama.endpointUrl')
    globalThis.localStorage?.removeItem('starverse.ollama.model')
    globalThis.localStorage?.removeItem('starverse.ollama.chatMode')
    globalThis.localStorage?.removeItem('starverse.ollama.nativeRest.preferredEndpoint')
    globalThis.localStorage?.removeItem('starverse.ollama.openAICompatible.preferredEndpoint')
    globalThis.localStorage?.removeItem('starverse.openAIResponsesTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.openAIResponsesTextChat.model')
    globalThis.localStorage?.removeItem('starverse.googleAIStudioTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.googleAIStudioTextChat.model')
    globalThis.localStorage?.removeItem('starverse.anthropicMessagesTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.anthropicMessagesTextChat.model')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.enabled')
    globalThis.localStorage?.removeItem('starverse.deepSeekTextChat.model')
    globalThis.localStorage?.removeItem('starverse.openRouterTextChat.enabled')
    globalThis.localStorage?.setItem('starverse.openRouterTextChat.enabled', '1')
    sessionMeta = null
    routePreference = null
    turns = []
    headMessageId = null
    turnSeq = 0
    updateConfigCalls = []
    updateRoutePreferenceCalls = []
    commandInitialCalls = []
    localEndpointProfileBaseUrl = 'http://localhost:1234'
    for (const key of Object.keys(initialStubs)) delete initialStubs[key]
    // Make throttle immediate in tests (while still exercising scheduling code paths).
    globalThis.setTimeout = ((fn: (...args: any[]) => void) => originalSetTimeout(fn, 0)) as any

    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'redacted-test-key'
        if (key === 'generationV2UiPreferences') {
          return {
            reasoningPrefs: { mode: 'auto', effort: 'auto', exclude: false },
            webSearchDefaults: {},
            generationParamsDefaults: {},
            imageGenerationDefault: null,
          }
        }
        return undefined
      }),
    }

    const g = bridge()
    const openRouterItems = [
      {
        providerKey: 'openrouter',
        modelId: DEFAULT_OPENROUTER_TEST_MODEL,
        modelKey: `openrouter::${DEFAULT_OPENROUTER_TEST_MODEL}`,
        canonicalSlug: DEFAULT_OPENROUTER_TEST_MODEL,
        displayName: DEFAULT_OPENROUTER_TEST_MODEL,
        status: 'active',
        visibility: 'visible',
        inputModalities: ['text'],
        outputModalities: ['text'],
      },
      {
        providerKey: 'openrouter',
        modelId: imageCapableModel,
        modelKey: `openrouter::${imageCapableModel}`,
        canonicalSlug: imageCapableModel,
        displayName: 'Image-Capable Test Model',
        status: 'active',
        visibility: 'visible',
        inputModalities: ['text'],
        outputModalities: ['text', 'image'],
      },
    ]
    const googleItems = [
      {
        providerKey: 'google_ai_studio',
        modelId: 'gemini-3.1-flash-lite',
        modelKey: 'google_ai_studio::gemini-3.1-flash-lite',
        canonicalSlug: 'gemini-3.1-flash-lite',
        displayName: 'Gemini 3.1 Flash Lite',
        status: 'active',
        visibility: 'visible',
        inputModalities: ['text'],
        outputModalities: ['text'],
        raw: {
          buckets: [
            {
              payload: {
                observation: {
                  schemaVersion: 2,
                  providerKey: 'google_ai_studio',
                  nativeModelId: 'gemini-3.1-flash-lite',
                  observedAtMs: 1,
                  rawProviderRecord: {
                    thinking: true,
                    supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
                  },
                  facts: {
                    textChat: { presence: 'missing', value: null, providerPath: null },
                    reasoning: { presence: 'missing', value: null, providerPath: null },
                    tools: { presence: 'missing', value: null, providerPath: null },
                    structuredOutputs: { presence: 'missing', value: null, providerPath: null },
                    vision: { presence: 'missing', value: null, providerPath: null },
                  },
                  provenance: {},
                },
              },
            },
          ],
        },
      },
    ]
    const catalogResponse = (items: any[]) => ({
      ok: true,
      status: 'synced',
      responseDigest: 'a'.repeat(64),
      modelCount: items.length,
      visibleModelCount: items.length,
      hiddenModelCount: 0,
      items,
      nextCursor: null,
    })
    g.models.listOpenRouter = vi.fn(async () => catalogResponse(openRouterItems))
    g.models.listOpenAIResponses = vi.fn(async () => catalogResponse([]))
    g.models.listAnthropic = vi.fn(async () => catalogResponse([]))
    g.models.listGoogleAIStudio = vi.fn(async () => catalogResponse(googleItems))
    g.models.listDeepSeek = vi.fn(async () => catalogResponse([]))

    g.workspace.ensureDefault = vi.fn(async () => ok({ projectId: 'project:test', conversationId: 'c1', branchId: 'b1', created: false }))
    g.workspace.getSystemTemplate = vi.fn(async () => ok({
      conversation: {
        id: 'c1',
        projectId: 'project:test',
        branchId: 'b1',
        title: 'New Chat',
        createdAt: 1,
        updatedAt: 1,
        meta: sessionMeta,
        systemKey: 'new_template',
        templateRevision: 0,
      },
      draft: {
        conversationId: 'c1',
        draftText: '',
        draftMode: 'compose',
        editingSourceQuestionId: null,
        revision: 0,
        updatedAtMs: 1,
        attachments: [],
      },
      settings: {
        startupNavigation: 'open_new',
        startupTemplateReset: { modelConfig: false, draftAttachments: false },
        postSendTemplateReset: 'reset_all',
      },
    }))
    g.workspace.listConversations = vi.fn(async () => ok({
      items: [
        {
          conversationId: 'c1',
          projectId: 'project:test',
          title: 'Chat 1',
          updatedAtMs: 1,
          meta: sessionMeta,
          branches: [{ branchId: 'b1', name: 'Main', headMessageId, updatedAtMs: 1 }],
          branchesHasMore: false,
        },
      ],
      nextCursor: null,
      totalCount: 1,
    }))
    g.workspace.getConversationRoutePreference = vi.fn(async () => ok(routePreference))
    g.workspace.readBranch = vi.fn(async () => branchView())
    g.workspace.updateConfig = vi.fn(async (input: any) => {
      updateConfigCalls.push(input)
      return ok({
        ownerKind: input.ownerKind,
        ownerId: input.ownerId,
        configRevision: 'config-revision:test-next',
        semanticLayer: input.semanticLayer ?? {},
      })
    })
    g.workspace.updateConversationRoutePreference = vi.fn(async (input: any) => {
      updateRoutePreferenceCalls.push(input)
      routePreference = { conversationId: input.conversationId, revision: 1, selection: input.selection }
      return ok(routePreference)
    })
    g.runtime.subscribe = vi.fn(async () => ok(turns
      .filter((turn) => turn.status === 'streaming')
      .map(snapshotForTurn)))
    g.runtime.snapshot = vi.fn(async (operationId: string) => {
      const turn = turns.find((candidate) => candidate.operationId === operationId)
      return ok(turn ? snapshotForTurn(turn) : null)
    })
    g.runtime.abort = vi.fn(async () => ok({ aborted: false }))
    g.runtime.onEvent = vi.fn(() => () => undefined)
    g.localProfiles = {
      list: vi.fn(async () => ok([
        {
          providerId: 'generic_local',
          protocolContractId: 'generic-local-openai-chat-completions',
          baseUrl: localEndpointProfileBaseUrl,
          endpointProfileId: 'generic-local-http',
          protocolConfig: {},
        },
        {
          providerId: 'ollama',
          protocolContractId: 'ollama-chat-v1',
          baseUrl: 'http://127.0.0.1:11434',
          endpointProfileId: 'ollama-http',
          protocolConfig: { modelId: 'llama3.2:latest', thinkingControl: 'effort', tools: true },
        },
      ])),
    }
  })

  afterEach(() => {
    ;(globalThis as any).electronStore = originalElectronStore
    globalThis.setTimeout = originalSetTimeout
    globalThis.localStorage?.removeItem('starverse.openRouterTextChat.enabled')
    vi.useRealTimers()
  })

  it('appends user+assistant, submits the initial command, renders the streamed answer', async () => {
    selectRuntimeProvider('openrouter', DEFAULT_OPENROUTER_TEST_MODEL)
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'ping')
    expect((draftBox() as HTMLTextAreaElement).value).toBe('ping')

    const send = sendButton()
    expect(send).not.toBeDisabled()
    await user.click(send)

    await screen.findByText('ping')
    await screen.findByText('hi')
    await vi.runAllTimersAsync()

    expect(initialStubs['openRouter.chat']).toHaveBeenCalledWith(expect.objectContaining({
      branchId: 'b1',
      expectedHeadMessageId: null,
      userBody: 'ping',
      modelId: DEFAULT_OPENROUTER_TEST_MODEL,
      commandAttachments: [],
    }))
    expect((draftBox() as HTMLTextAreaElement).value).toBe('')
    const layer = updateConfigCalls[updateConfigCalls.length - 1]?.semanticLayer
    expect(layer?.schemaVersion).toBe(2)
    expect(layer?.image).toEqual({ mode: 'disabled' })
    expect(layer?.web).toEqual({ mode: 'disabled' })
    expect(layer?.tools).toEqual({ mode: 'disabled' })
  })

  it('uses selected model for next send and persists the conversation route preference', async () => {
    selectRuntimeProvider('openrouter', DEFAULT_OPENROUTER_TEST_MODEL)
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    const warmupBox = draftBox()
    await user.click(warmupBox)
    await user.type(warmupBox, 'warmup')
    await user.click(sendButton())
    await screen.findByText('warmup')
    await screen.findByText('hi')

    await vi.runAllTimersAsync()
    await user.click(await screen.findByTestId('current-model-pill'))
    const imageCapableModelItems = await screen.findAllByTestId(`model-picker-item-${imageCapableModel}`)
    await user.click(imageCapableModelItems[0]!)

    await waitFor(() => {
      expect(updateRoutePreferenceCalls).toHaveLength(1)
      expect(updateRoutePreferenceCalls[0]).toEqual({
        conversationId: 'c1',
        expectedRevision: 1,
        selection: { schemaVersion: 1, kind: 'provider_model', providerId: 'openrouter', modelId: imageCapableModel },
      })
    })

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'selected model send')
    await user.click(sendButton())

    await waitFor(() => {
      expect(screen.getByText('selected model send')).toBeInTheDocument()
      const lastCall = commandInitialCalls.filter((call) => call.path === 'openRouter.chat').pop()
      expect(lastCall?.command).toMatchObject({ modelId: imageCapableModel })
    })
  })

})
