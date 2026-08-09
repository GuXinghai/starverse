import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENROUTER_TEST_MODEL, OPENROUTER_TEST_MODELS } from '@/next/openrouter/openRouterTestModels'
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

const ALL_COMMAND_ROUTE_PATHS = [
  'openRouter.chat',
  'openRouter.images',
  'openAIResponses',
  'anthropic',
  'deepSeek',
  'gemini.generateContent',
  'gemini.interactionsImage',
  'openAICompatible.commands',
  'lmStudio.openResponses',
  'genericLocal.openAIChatCompletions',
  'ollama.chat',
] as const

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
    sessionMeta = { selectedProviderId: route.providerId, selectedModelKey: modelId }
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

  function setSessionMeta(meta: Record<string, unknown>) {
    sessionMeta = { ...(sessionMeta ?? {}), ...meta }
  }

  async function expectProviderlessSendBlocked(user: ReturnType<typeof userEvent.setup>, prompt: string) {
    await user.click(draftBox())
    await user.type(draftBox(), prompt)
    await user.click(sendButton())
    await new Promise<void>((resolve) => originalSetTimeout(resolve, 20))
    expect(draftBox().value).toBe(prompt)
    for (const path of ALL_COMMAND_ROUTE_PATHS) {
      expect(getAtPath(bridge(), path).initial).not.toHaveBeenCalled()
    }
  }

  async function expectBlockedBeforeStream(
    user: ReturnType<typeof userEvent.setup>,
    prompt: string,
    path: string,
    rejectCode: string,
    commandSubmitted = true,
  ) {
    await user.click(draftBox())
    await user.type(draftBox(), prompt)
    await user.click(sendButton())
    await waitFor(() => {
      if (commandSubmitted) {
        expect(initialStubs[path]).toHaveBeenCalledTimes(1)
      } else {
        expect(getAtPath(bridge(), path).initial).not.toHaveBeenCalled()
      }
    })
    expect(draftBox().value).toBe(prompt)
    if (commandSubmitted) await screen.findByText(rejectCode)
  }

  beforeEach(() => {
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

  it('keeps provider selection unset when only legacy model storage is present', async () => {
    globalThis.localStorage?.removeItem('starverse.openRouterTextChat.enabled')
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.model', 'gpt-4.1-mini')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.model', 'local-model')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await expectProviderlessSendBlocked(user, 'legacy storage ignored ping')

    expect(globalThis.localStorage?.getItem('starverse.openAIResponsesTextChat.model')).toBeNull()
    expect(globalThis.localStorage?.getItem('starverse.localEndpointTextChat.model')).toBeNull()
  })

  it.each([
    { label: 'OpenRouter', providerId: 'openrouter', modelId: DEFAULT_OPENROUTER_TEST_MODEL, prompt: 'openrouter missing key ping' },
    { label: 'OpenAI Responses', providerId: 'openai_responses', modelId: 'gpt-4.1-mini', prompt: 'openai missing key ping' },
    { label: 'Anthropic', providerId: 'anthropic_messages', modelId: 'claude-sonnet-4-5', prompt: 'anthropic missing key ping' },
    { label: 'Google AI Studio', providerId: 'google_ai_studio', modelId: 'gemini-2.5-flash', prompt: 'gemini missing key ping' },
    { label: 'DeepSeek', providerId: 'deepseek', modelId: 'deepseek-chat', prompt: 'deepseek missing key ping' },
  ])('blocks $label before provider stream when credential is missing', async ({ providerId, modelId, prompt }) => {
    selectRuntimeProvider(providerId, modelId, { rejectCode: 'CREDENTIAL_MISSING' })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await expectBlockedBeforeStream(user, prompt, ROUTES[providerId].path, 'CREDENTIAL_MISSING')
  })

  it.each([
    { label: 'LocalEndpoint', providerId: 'local_endpoint', modelId: 'local-model', prompt: 'local endpoint down ping', submitted: true },
    { label: 'LM Studio', providerId: 'lm_studio', modelId: 'openai/gpt-oss-20b', prompt: 'lm studio down ping', submitted: false },
    { label: 'Ollama', providerId: 'ollama_local', modelId: 'llama3.2:latest', prompt: 'ollama down ping', submitted: false },
  ])('blocks $label before provider stream when endpoint probe is unavailable', async ({ providerId, modelId, prompt, submitted }) => {
    globalThis.localStorage?.setItem('starverse.lmStudio.chatMode', 'openai_compatible')
    selectRuntimeProvider(providerId, modelId, { rejectCode: 'ENDPOINT_PROBE_UNAVAILABLE' })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await expectBlockedBeforeStream(user, prompt, ROUTES[providerId].path, 'ENDPOINT_PROBE_UNAVAILABLE', submitted)
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

  it('routes experimental LocalEndpoint text chat through the genericLocal command without OpenRouter send', async () => {
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.url', 'http://localhost:1234/v1')
    selectRuntimeProvider('local_endpoint', 'local-model')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'local ping')
    await user.click(sendButton())

    await screen.findByText('local ping')
    await screen.findByText('local hi')
    await vi.runAllTimersAsync()

    expect(initialStubs['genericLocal.openAIChatCompletions']).toHaveBeenCalledWith(expect.objectContaining({
      userBody: 'local ping',
      modelId: 'local-model',
    }))
    expect(getAtPath(bridge(), 'openRouter.chat').initial).not.toHaveBeenCalled()
  })

  it('routes explicit Ollama Local text chat through the ollama command without OpenRouter send', async () => {
    globalThis.localStorage?.setItem('starverse.ollamaTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.ollama.endpointUrl', 'http://127.0.0.1:11434')
    globalThis.localStorage?.setItem('starverse.ollama.chatMode', 'native_rest')
    globalThis.localStorage?.setItem('starverse.ollama.nativeRest.preferredEndpoint', 'chat')
    globalThis.localStorage?.setItem('starverse.ollama.nativeRest.thinkingControl', 'effort')
    globalThis.localStorage?.setItem('starverse.ollama.nativeRest.toolsSupported', '1')
    selectRuntimeProvider('ollama_local', 'llama3.2:latest')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'ollama ping')
    await user.click(sendButton())

    await screen.findByText('ollama ping')
    await screen.findByText('ollama hi')
    await vi.runAllTimersAsync()

    expect(initialStubs['ollama.chat']).toHaveBeenCalledWith(expect.objectContaining({
      userBody: 'ollama ping',
      modelId: 'llama3.2:latest',
    }))
    expect(getAtPath(bridge(), 'openRouter.chat').initial).not.toHaveBeenCalled()
  })

  it('uses session-selected LocalEndpoint model with SettingsPanel endpoint updates', async () => {
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.enabled', '1')
    localEndpointProfileBaseUrl = 'http://localhost:4321'
    selectRuntimeProvider('local_endpoint', 'settings-selected-model')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    window.dispatchEvent(new CustomEvent('settings:localEndpointTextChatUpdated', {
      detail: {
        endpointUrl: 'http://localhost:4321/v1',
      },
    }))

    await user.click(draftBox())
    await user.type(draftBox(), 'settings local ping')
    await user.click(sendButton())

    await screen.findByText('settings local ping')
    await screen.findByText('local hi')

    expect(initialStubs['genericLocal.openAIChatCompletions']).toHaveBeenCalledWith(expect.objectContaining({
      userBody: 'settings local ping',
      modelId: 'settings-selected-model',
    }))
    expect(getAtPath(bridge(), 'openRouter.chat').initial).not.toHaveBeenCalled()
  })

  it('keeps provider selection unset when SettingsPanel only applies LocalEndpoint defaults', async () => {
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.url', 'http://localhost:4321/v1')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.model', 'settings-selected-model')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await expectProviderlessSendBlocked(user, 'default off ping')
  })

  it('routes explicit OpenAI Responses text chat through the openAIResponses command without OpenRouter send', async () => {
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
    selectRuntimeProvider('openai_responses', 'gpt-4.1-mini')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'openai ping')
    await user.click(sendButton())

    await screen.findByText('openai ping')
    await screen.findByText('openai hi')
    await vi.runAllTimersAsync()

    expect(initialStubs['openAIResponses']).toHaveBeenCalledWith(expect.objectContaining({
      userBody: 'openai ping',
      modelId: 'gpt-4.1-mini',
    }))
    expect(getAtPath(bridge(), 'openRouter.chat').initial).not.toHaveBeenCalled()
  })

  it('passes resolved generation params to the conversation semantic layer', async () => {
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
    selectRuntimeProvider('openai_responses', 'gpt-4.1-mini')
    setSessionMeta({
      generationParamsOverride: {
        version: 1,
        params: {
          temperature: { mode: 'custom', value: 0.2 },
          topP: { mode: 'omit' },
          maxOutputTokens: { mode: 'custom', value: 64 },
        },
      },
    })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'openai generation params ping')
    await user.click(sendButton())

    await screen.findByText('openai generation params ping')
    await screen.findByText('openai hi')
    await vi.runAllTimersAsync()

    const layer = updateConfigCalls[updateConfigCalls.length - 1]?.semanticLayer
    expect(layer?.generation).toMatchObject({ temperature: 0.2, maxOutputTokens: 64 })
    expect(layer?.generation).not.toHaveProperty('topP')
  })

  it('omits OpenAI Responses reasoning effort when provider auto is selected', async () => {
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
    selectRuntimeProvider('openai_responses', 'gpt-5.4-nano')
    setSessionMeta({
      generationParamsOverride: {
        version: 1,
        params: {
          reasoningEffort: { mode: 'custom', value: 'auto' },
          maxOutputTokens: { mode: 'custom', value: 64 },
        },
      },
    })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'openai auto reasoning ping')
    await user.click(sendButton())

    await screen.findByText('openai auto reasoning ping')
    await screen.findByText('openai hi')
    await vi.runAllTimersAsync()

    const layer = updateConfigCalls[updateConfigCalls.length - 1]?.semanticLayer
    expect(layer?.reasoning).toEqual({ mode: 'disabled' })
    expect(layer?.generation?.maxOutputTokens).toBe(64)
  })

  it('sends explicit OpenAI Responses reasoning effort when supported by the selected model', async () => {
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
    selectRuntimeProvider('openai_responses', 'gpt-5.4-nano')
    setSessionMeta({
      generationParamsOverride: {
        version: 1,
        params: {
          reasoningEffort: { mode: 'custom', value: 'low' },
        },
      },
    })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'openai explicit reasoning ping')
    await user.click(sendButton())

    await screen.findByText('openai explicit reasoning ping')
    await screen.findByText('openai hi')
    await vi.runAllTimersAsync()

    const layer = updateConfigCalls[updateConfigCalls.length - 1]?.semanticLayer
    expect(layer?.reasoning).toEqual({ mode: 'enabled', effort: 'low' })
  })

  it('sends OpenAI Responses reasoning summary without explicit effort when configured', async () => {
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
    selectRuntimeProvider('openai_responses', 'gpt-5.4-nano')
    setSessionMeta({
      generationParamsOverride: {
        version: 1,
        params: {
          reasoningEffort: { mode: 'custom', value: 'auto' },
          reasoningSummary: { mode: 'custom', value: 'concise' },
        },
      },
    })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'openai reasoning summary ping')
    await user.click(sendButton())

    await screen.findByText('openai reasoning summary ping')
    await screen.findByText('openai hi')
    await vi.runAllTimersAsync()

    const layer = updateConfigCalls[updateConfigCalls.length - 1]?.semanticLayer
    expect(layer?.reasoning).toEqual({ mode: 'enabled', summary: 'concise' })
  })

  it('omits OpenAI Responses reasoning summary when configured off', async () => {
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
    selectRuntimeProvider('openai_responses', 'gpt-5.4-nano')
    setSessionMeta({
      generationParamsOverride: {
        version: 1,
        params: {
          reasoningEffort: { mode: 'custom', value: 'auto' },
          reasoningSummary: { mode: 'omit' },
        },
      },
    })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'openai reasoning summary off ping')
    await user.click(sendButton())

    await screen.findByText('openai reasoning summary off ping')
    await screen.findByText('openai hi')
    await vi.runAllTimersAsync()

    const layer = updateConfigCalls[updateConfigCalls.length - 1]?.semanticLayer
    expect(layer?.reasoning).toEqual({ mode: 'disabled' })
  })

  it('does not send OpenAI Responses reasoning effort for models without explicit effort support', async () => {
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
    selectRuntimeProvider('openai_responses', 'gpt-4.1-mini')
    setSessionMeta({
      generationParamsOverride: {
        version: 1,
        params: {
          reasoningEffort: { mode: 'custom', value: 'high' },
        },
      },
    })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'openai unsupported reasoning ping')
    await user.click(sendButton())

    await screen.findByText('openai unsupported reasoning ping')
    await screen.findByText('openai hi')
    await vi.runAllTimersAsync()

    const layer = updateConfigCalls[updateConfigCalls.length - 1]?.semanticLayer
    expect(layer?.reasoning).toEqual({ mode: 'disabled' })
  })

  it('routes explicit Google AI Studio text chat through gemini generateContent with the thinking provider extension', async () => {
    globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.enabled', '1')
    selectRuntimeProvider('google_ai_studio', 'gemini-3.1-flash-lite')
    setSessionMeta({
      generationParamsOverride: {
        version: 1,
        params: {
          thinkingLevel: { mode: 'custom', value: 'medium' },
          includeThoughts: { mode: 'custom', value: true },
        },
      },
    })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()
    await vi.runAllTimersAsync()

    await user.click(draftBox())
    await user.type(draftBox(), 'gemini ping')
    await user.click(sendButton())

    await screen.findByText('gemini ping')
    await screen.findByText('gemini hi')
    await vi.runAllTimersAsync()

    expect(initialStubs['gemini.generateContent']).toHaveBeenCalledWith(expect.objectContaining({
      userBody: 'gemini ping',
      modelId: 'gemini-3.1-flash-lite',
    }))
    expect(getAtPath(bridge(), 'openRouter.chat').initial).not.toHaveBeenCalled()
    const layer = updateConfigCalls[updateConfigCalls.length - 1]?.semanticLayer
    expect(layer?.providerExtension).toEqual({
      kind: 'gemini_generate_content',
      thinkingMode: 'level',
      thinkingLevel: 'medium',
      includeThoughts: 'enabled',
    })
    expect(layer?.reasoning).toEqual({ mode: 'enabled', effort: 'medium' })
  })

  it('routes explicit DeepSeek official text chat through the deepSeek command without OpenRouter or Anthropic-compatible send', async () => {
    globalThis.localStorage?.setItem('starverse.deepSeekTextChat.enabled', '1')
    selectRuntimeProvider('deepseek', 'deepseek-chat')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'deepseek ping')
    await user.click(sendButton())

    await screen.findByText('deepseek ping')
    await screen.findByText('deepseek hi')
    await vi.runAllTimersAsync()

    expect(initialStubs['deepSeek']).toHaveBeenCalledWith(expect.objectContaining({
      userBody: 'deepseek ping',
      modelId: 'deepseek-chat',
    }))
    expect(getAtPath(bridge(), 'openRouter.chat').initial).not.toHaveBeenCalled()
    expect(getAtPath(bridge(), 'openRouter.chat').initial).not.toHaveBeenCalled()
  })

  it('keeps DeepSeek, Anthropic, Google AI Studio, OpenAI Responses, and LocalEndpoint experimental modes mutually exclusive', async () => {
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.url', 'http://localhost:1234/v1')
    globalThis.localStorage?.setItem('starverse.localEndpointTextChat.model', 'local-model')
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.openAIResponsesTextChat.model', 'gpt-4.1-mini')
    globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.googleAIStudioTextChat.model', 'gemini-2.5-flash')
    globalThis.localStorage?.setItem('starverse.anthropicMessagesTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.anthropicMessagesTextChat.model', 'claude-sonnet-4-5')
    globalThis.localStorage?.setItem('starverse.deepSeekTextChat.enabled', '1')
    globalThis.localStorage?.setItem('starverse.deepSeekTextChat.model', 'deepseek-chat')
    selectRuntimeProvider('deepseek', 'deepseek-chat')
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'mutual exclusion ping')
    await user.click(sendButton())

    await screen.findByText('mutual exclusion ping')
    await screen.findByText('deepseek hi')

    expect(initialStubs['deepSeek']).toHaveBeenCalledTimes(1)
    expect(getAtPath(bridge(), 'openRouter.chat').initial).not.toHaveBeenCalled()
    expect(getAtPath(bridge(), 'anthropic').initial).not.toHaveBeenCalled()
    expect(getAtPath(bridge(), 'gemini.generateContent').initial).not.toHaveBeenCalled()
    expect(getAtPath(bridge(), 'openAIResponses').initial).not.toHaveBeenCalled()
    expect(getAtPath(bridge(), 'genericLocal.openAIChatCompletions').initial).not.toHaveBeenCalled()
    expect(globalThis.localStorage?.getItem('starverse.anthropicMessagesTextChat.enabled')).toBe('0')
    expect(globalThis.localStorage?.getItem('starverse.googleAIStudioTextChat.enabled')).toBe('0')
    expect(globalThis.localStorage?.getItem('starverse.openAIResponsesTextChat.enabled')).toBe('0')
    expect(globalThis.localStorage?.getItem('starverse.localEndpointTextChat.enabled')).toBe('0')
  })

  it('uses the explicit OpenRouter path when OpenAI Responses chat is disabled or cleared', async () => {
    selectRuntimeProvider('openrouter', DEFAULT_OPENROUTER_TEST_MODEL)
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'cleared openai responses ping')
    await user.click(sendButton())

    await screen.findByText('cleared openai responses ping')
    await screen.findByText('hi')

    expect(initialStubs['openRouter.chat']).toHaveBeenCalledTimes(1)
    expect(getAtPath(bridge(), 'openAIResponses').initial).not.toHaveBeenCalled()
  })

  it('uses the explicit OpenRouter path when Google AI Studio chat is disabled or cleared', async () => {
    selectRuntimeProvider('openrouter', DEFAULT_OPENROUTER_TEST_MODEL)
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'cleared google ai studio ping')
    await user.click(sendButton())

    await screen.findByText('cleared google ai studio ping')
    await screen.findByText('hi')

    expect(initialStubs['openRouter.chat']).toHaveBeenCalledTimes(1)
    expect(getAtPath(bridge(), 'gemini.generateContent').initial).not.toHaveBeenCalled()
  })

  it('uses the explicit OpenRouter path when LocalEndpoint chat is disabled or cleared', async () => {
    selectRuntimeProvider('openrouter', DEFAULT_OPENROUTER_TEST_MODEL)
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'cleared local endpoint ping')
    await user.click(sendButton())

    await screen.findByText('cleared local endpoint ping')
    await screen.findByText('hi')

    expect(initialStubs['openRouter.chat']).toHaveBeenCalledTimes(1)
    expect(getAtPath(bridge(), 'genericLocal.openAIChatCompletions').initial).not.toHaveBeenCalled()
  })

  it('uses the explicit OpenRouter path when DeepSeek official chat is disabled or cleared', async () => {
    selectRuntimeProvider('openrouter', DEFAULT_OPENROUTER_TEST_MODEL)
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()

    await user.click(draftBox())
    await user.type(draftBox(), 'cleared deepseek ping')
    await user.click(sendButton())

    await screen.findByText('cleared deepseek ping')
    await screen.findByText('hi')

    expect(initialStubs['openRouter.chat']).toHaveBeenCalledTimes(1)
    expect(getAtPath(bridge(), 'deepSeek').initial).not.toHaveBeenCalled()
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

  it('passes persisted image generation config for an image-capable model', async () => {
    setRuntimeSelection('openrouter', imageCapableModel)
    installCommandStub('openRouter.images', {
      providerId: 'openrouter',
      contractId: 'openrouter-images-v1',
      modelId: imageCapableModel,
      answerText: 'hi',
    })
    setSessionMeta({
      imageGenerationMode: 'custom',
      imageGenerationCustom: {
        enabled: true,
        outputMode: 'image_only',
        aspectRatio: '16:9',
        imageSize: '2K',
      },
    })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()
    await vi.runAllTimersAsync()

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'draw a fox')
    await user.click(sendButton())

    await screen.findByText('draw a fox')
    await screen.findByText('hi')

    expect(initialStubs['openRouter.images']).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'draw a fox',
      modelId: imageCapableModel,
      requestedProviderTag: null,
      commandAttachments: [],
    }))
    expect(getAtPath(bridge(), 'openRouter.chat').initial).not.toHaveBeenCalled()
    const layer = updateConfigCalls[updateConfigCalls.length - 1]?.semanticLayer
    expect(layer?.image).toEqual({ mode: 'generate' })
  })

  it('uses persisted image size selection', async () => {
    setRuntimeSelection('openrouter', imageCapableModel)
    installCommandStub('openRouter.images', {
      providerId: 'openrouter',
      contractId: 'openrouter-images-v1',
      modelId: imageCapableModel,
      answerText: 'hi',
    })
    setSessionMeta({
      imageGenerationMode: 'custom',
      imageGenerationCustom: {
        enabled: true,
        outputMode: 'image_only',
        aspectRatio: '',
        imageSize: '4K',
      },
    })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()
    await vi.runAllTimersAsync()

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'persisted size should apply')
    await user.click(sendButton())

    await screen.findByText('persisted size should apply')
    await screen.findByText('hi')

    expect(initialStubs['openRouter.images']).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'persisted size should apply',
      modelId: imageCapableModel,
    }))
    expect(getAtPath(bridge(), 'openRouter.chat').initial).not.toHaveBeenCalled()
  })

  it('does not send legacy pixel image_size from persisted convo config', async () => {
    setRuntimeSelection('openrouter', imageCapableModel)
    installCommandStub('openRouter.images', {
      providerId: 'openrouter',
      contractId: 'openrouter-images-v1',
      modelId: imageCapableModel,
      answerText: 'hi',
    })
    setSessionMeta({
      imageGenerationMode: 'custom',
      imageGenerationCustom: {
        enabled: true,
        outputMode: 'image_only',
        aspectRatio: '',
        imageSize: '1024x1024',
      },
    })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()
    await vi.runAllTimersAsync()

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'legacy size config')
    await user.click(sendButton())

    await screen.findByText('legacy size config')
    await screen.findByText('hi')

    expect(initialStubs['openRouter.images']).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'legacy size config',
      modelId: imageCapableModel,
    }))
    expect(getAtPath(bridge(), 'openRouter.chat').initial).not.toHaveBeenCalled()
  })

  it('does not include image generation config when model is image-capable but toggle is off', async () => {
    installCommandStub('openRouter.chat', {
      providerId: 'openrouter',
      contractId: 'openrouter-chat-completions-v1',
      modelId: imageCapableModel,
      answerText: 'hi',
    })
    const user = userEvent.setup()
    render(AppChatApp)

    await waitForAppReady()
    await vi.runAllTimersAsync()
    await user.click(await screen.findByTestId('current-model-pill'))
    const imageCapableModelItems = await screen.findAllByTestId(`model-picker-item-${imageCapableModel}`)
    await user.click(imageCapableModelItems[0]!)
    await waitForAppReady()

    const box = draftBox()
    await user.click(box)
    await user.type(box, 'text only please')
    await user.click(sendButton())
    await screen.findByText('text only please')
    await screen.findByText('hi')

    expect(initialStubs['openRouter.chat']).toHaveBeenCalledWith(expect.objectContaining({
      userBody: 'text only please',
      modelId: imageCapableModel,
    }))
    expect(getAtPath(bridge(), 'openRouter.images').initial).not.toHaveBeenCalled()
  })
})
