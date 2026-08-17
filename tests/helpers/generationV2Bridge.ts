import { vi } from 'vitest'

export const createGenerationV2CommandBridgeMock = () => ({
  initial: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_COMMAND_NOT_CONFIGURED' })),
  retry: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_COMMAND_NOT_CONFIGURED' })),
  regenerate: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_COMMAND_NOT_CONFIGURED' })),
  editResend: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_COMMAND_NOT_CONFIGURED' })),
  abort: vi.fn(async () => ({ ok: true })),
  onProjection: vi.fn(() => () => undefined),
})

/**
 * Production-shaped Generation V2 preload fixture.  The default command and
 * catalog authorities fail closed so a test must opt into the behavior it is
 * exercising instead of accidentally making a real IPC/network request.
 */
export function createGenerationV2TestBridge() {
  const now = 1
  const projectId = 'project:test'
  const conversationId = 'c1'
  const branchId = 'branch:c1'
  let draft: {
    conversationId: string
    draftText: string
    draftMode: 'compose' | 'edit'
    editingSourceQuestionId: string | null
    revision: number
    updatedAtMs: number
    attachments: unknown[]
  } = {
    conversationId,
    draftText: '',
    draftMode: 'compose',
    editingSourceQuestionId: null,
    revision: 0,
    updatedAtMs: now,
    attachments: [],
  }
  let routePreference: any = null
  const template = () => ({
    conversation: {
      id: conversationId,
      projectId,
      branchId,
      title: 'New Chat',
      createdAt: now,
      updatedAt: now,
      meta: null,
      systemKey: 'new_template' as const,
      templateRevision: 0,
    },
    draft,
    settings: {
      startupNavigation: 'open_new' as const,
      startupTemplateReset: { modelConfig: false, draftAttachments: false },
      postSendTemplateReset: 'reset_all' as const,
    },
  })
  const ok = <T>(value: T) => ({ ok: true as const, value })
  const credentialStatus = (profileId: string) => ({
    ok: true as const,
    status: {
      configured: true,
      credentialRevision: 1,
      credentialScopeId: `credential-scope:${profileId}`,
      profileId,
    },
  })
  const credentialBridge = (profileId: string) => ({
    getStatus: vi.fn(async () => credentialStatus(profileId)),
    update: vi.fn(async () => credentialStatus(profileId)),
    clear: vi.fn(async () => ({ ok: true as const })),
  })
  const replaceDraft = (input: any) => {
    draft = {
      ...draft,
      draftText: String(input?.draftText ?? draft.draftText),
      draftMode: input?.draftMode === 'edit' ? 'edit' : 'compose',
      editingSourceQuestionId: input?.editingSourceQuestionId ?? null,
      revision: draft.revision + 1,
      updatedAtMs: draft.updatedAtMs + 1,
      attachments: Array.isArray(input?.attachments) ? input.attachments : draft.attachments,
    }
    return ok(draft)
  }

  return {
    openRouter: { chat: createGenerationV2CommandBridgeMock(), images: createGenerationV2CommandBridgeMock() },
    openAIResponses: createGenerationV2CommandBridgeMock(),
    anthropic: createGenerationV2CommandBridgeMock(),
    deepSeek: createGenerationV2CommandBridgeMock(),
    gemini: {
      generateContent: createGenerationV2CommandBridgeMock(),
      interactionsImage: createGenerationV2CommandBridgeMock(),
    },
    openAICompatible: { commands: createGenerationV2CommandBridgeMock() },
    lmStudio: { openResponses: createGenerationV2CommandBridgeMock() },
    genericLocal: { openAIChatCompletions: createGenerationV2CommandBridgeMock() },
    ollama: { chat: createGenerationV2CommandBridgeMock() },
    capabilities: {
      resolve: vi.fn(async (request: any) => ({
        ok: true,
        value: {
          resolvedCapability: {
            schemaVersion: 1,
            binding: {
              providerId: request.providerId,
              credentialScopeId: request.credentialScopeId,
              endpointProfileId: request.endpointProfileId,
              protocolContractId: request.protocolId,
              modelId: request.modelId,
              operation: request.operation,
            },
            evidence: [],
            fields: [],
            continuation: { kind: 'unavailable', evidenceIds: [] },
            evidenceDigest: 'a'.repeat(64),
            semanticFieldsDigest: 'b'.repeat(64),
            capabilityRevision: 'capability-v2:test',
          },
          controlsProjection: {
            schemaVersion: 1,
            binding: {
              providerId: request.providerId,
              endpointProfileId: request.endpointProfileId,
              protocolContractId: request.protocolId,
              modelId: request.modelId,
              operation: request.operation,
            },
            capabilityRevision: 'capability-v2:test',
            controls: {},
          },
        },
      })),
    },
    credentials: {
      openRouter: credentialBridge('openrouter-first-party-v1'),
      openAIResponses: credentialBridge('openai-responses-v1'),
      googleAIStudio: credentialBridge('google-ai-studio-v1'),
      anthropic: credentialBridge('anthropic-messages-v1'),
      deepSeek: credentialBridge('deepseek-stable-v1'),
    },
    localRuntime: {
      lmStudio: {
        probe: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_LOCAL_RUNTIME_NOT_CONFIGURED' })),
        loadModel: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_LOCAL_RUNTIME_NOT_CONFIGURED' })),
        unloadModel: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_LOCAL_RUNTIME_NOT_CONFIGURED' })),
      },
      ollama: {
        probe: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_LOCAL_RUNTIME_NOT_CONFIGURED' })),
        loadModel: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_LOCAL_RUNTIME_NOT_CONFIGURED' })),
        unloadModel: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_LOCAL_RUNTIME_NOT_CONFIGURED' })),
      },
      generic: {
        probe: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_LOCAL_RUNTIME_NOT_CONFIGURED' })),
      },
    },
    plugins: {
      listOfficial: vi.fn(async () => ({ ok: true, value: [] })),
      listInstalled: vi.fn(async () => []),
      registerLocalOfficial: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_PLUGIN_NOT_CONFIGURED' })),
      installOfficial: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_PLUGIN_NOT_CONFIGURED' })),
      installStatus: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_PLUGIN_NOT_CONFIGURED' })),
      cancelInstall: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_PLUGIN_NOT_CONFIGURED' })),
      enable: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_PLUGIN_NOT_CONFIGURED' })),
      disable: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_PLUGIN_NOT_CONFIGURED' })),
      uninstall: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_PLUGIN_NOT_CONFIGURED' })),
      health: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_PLUGIN_NOT_CONFIGURED' })),
      registerLocalPackage: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_PLUGIN_NOT_CONFIGURED' })),
      diagnostics: vi.fn(async () => ({ ok: true, value: { engines: [] } })),
      probeLibreOfficeDownload: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_PLUGIN_NOT_CONFIGURED' })),
    },
    runtime: {
      subscribe: vi.fn(async () => ok([])),
      snapshot: vi.fn(async () => ok(null)),
      abort: vi.fn(async () => ok({ aborted: false })),
      onEvent: vi.fn(() => () => undefined),
    },
    models: {
      listOpenRouter: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_CATALOG_NOT_CONFIGURED' })),
      listOpenAIResponses: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_CATALOG_NOT_CONFIGURED' })),
      listAnthropic: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_CATALOG_NOT_CONFIGURED' })),
      listGoogleAIStudio: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_CATALOG_NOT_CONFIGURED' })),
      listDeepSeek: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_CATALOG_NOT_CONFIGURED' })),
      sync: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_CATALOG_NOT_CONFIGURED' })),
      status: vi.fn(async () => ({ ok: true, status: 'not_synced', modelCount: 0, visibleModelCount: 0,
        hiddenModelCount: 0, responseDigest: null, observedAtMs: null, errorCode: null })),
      clearCurrent: vi.fn(async () => ({ ok: true, deletedScopes: 0 })),
      clearAll: vi.fn(async () => ({ ok: true, deletedScopes: 0 })),
    },
    modelPreferences: {
      listFavorites: vi.fn(async () => []),
      addFavorite: vi.fn(async () => null),
      removeFavorite: vi.fn(async () => ({ removed: 0 })),
      reorderFavorites: vi.fn(async () => []),
      listRecents: vi.fn(async () => []),
    },
    workspace: {
      ensureDefault: vi.fn(async () => ok({ projectId, conversationId, branchId, created: false })),
      listProjects: vi.fn(async () => ok([{ projectId, name: 'Default', createdAtMs: now, updatedAtMs: now }])),
      listConversations: vi.fn(async () => ok({ items: [], nextCursor: null, totalCount: 0 })),
      listBranches: vi.fn(async () => ok({ items: [], nextCursor: null, totalCount: 0 })),
      readBranch: vi.fn(async () => ok({ branchId, conversationId, projectId, title: 'New Chat', branchName: null,
        headMessageId: null, beforeMessageId: null, hasMoreTurns: false, turns: [] })),
      getMessageCandidateNavigation: vi.fn(async (inputBranchId: string, messageId: string) => ok({
        conversationId, currentBranchId: inputBranchId, messageId, parentMessageId: null,
        role: 'user', currentIndex: 0, total: 1, previous: null, next: null,
      })),
      hideAnswer: vi.fn(async () => ok({ created: true })),
      setContextFilter: vi.fn(async () => ok({})),
      clearContextFilter: vi.fn(async () => ok({})),
      getConfig: vi.fn(async (ownerKind: string, ownerId: string) => ok({ ownerKind, ownerId,
        configRevision: 'config-revision:test', semanticLayer: { schemaVersion: 2 } })),
      updateConfig: vi.fn(async (input: any) => ok({ ownerKind: input.ownerKind, ownerId: input.ownerId,
        configRevision: 'config-revision:test-next', semanticLayer: input.semanticLayer ?? {} })),
      getConversationRoutePreference: vi.fn(async () => ok(routePreference)),
      updateConversationRoutePreference: vi.fn(async (input: any) => {
        routePreference = { conversationId: input.conversationId,
          revision: (routePreference?.revision ?? 0) + 1, selection: input.selection }
        return ok(routePreference)
      }),
      clearConversationRoutePreference: vi.fn(async () => { routePreference = null; return ok(null) }),
      createProject: vi.fn(async () => ok({ projectId })), renameProject: vi.fn(async () => ok({})),
      deleteProject: vi.fn(async () => ok({})), createConversation: vi.fn(async () => ok({ conversationId, branchId })),
      renameConversation: vi.fn(async () => ok({})), moveConversation: vi.fn(async () => ok({})),
      deleteConversation: vi.fn(async () => ok({})), forkBranch: vi.fn(async () => ok({ branchId })),
      renameBranch: vi.fn(async () => ok({})), deleteBranch: vi.fn(async () => ok({})),
      truncateFromQuestion: vi.fn(async () => ok({ headMessageId: null })),
      getSystemTemplate: vi.fn(async () => ok(template())),
      updateSystemTemplateConfig: vi.fn(async () => ok(template())),
      resetSystemTemplate: vi.fn(async () => ok(template())),
      setNewChatLifecycle: vi.fn(async (value: unknown) => ok(value)),
      getLastFormalConversation: vi.fn(async () => ok({ conversationId: null })),
      setLastFormalConversation: vi.fn(async () => ok({})),
    },
    composer: {
      get: vi.fn(async () => ok(draft)),
      updateText: vi.fn(async (input: unknown) => replaceDraft(input)),
      replace: vi.fn(async (input: unknown) => replaceDraft(input)),
      replaceFromAnswerSnapshot: vi.fn(async (input: unknown) => replaceDraft(input)),
      clearCommitted: vi.fn(async () => { draft = { ...draft, draftText: '', draftMode: 'compose',
        editingSourceQuestionId: null, attachments: [], revision: draft.revision + 1 }; return ok(draft) }),
      importLocal: vi.fn(async () => ok(draft)), addUrlReference: vi.fn(async () => ok(draft)),
      importUrlFile: vi.fn(async () => ok(draft)), removeAttachment: vi.fn(async () => ok(draft)),
      readPreview: vi.fn(async () => ok({ status: 'missing', dataUrl: null, mime: 'application/octet-stream' })),
      dfcOptions: vi.fn(async () => ok({ status: 'ready', options: [] })),
      dfcSelect: vi.fn(async () => ok(draft)),
      dfcPreview: vi.fn(async () => ok({ status: 'unavailable', preview: null })),
      retryFileTypeDetection: vi.fn(async () => ok(draft)),
      onFileTypeDetectionUpdated: vi.fn(() => () => undefined),
    },
  }
}

export function installGenerationV2TestBridge(target: any = globalThis) {
  const bridge = createGenerationV2TestBridge()
  target.generationV2 = bridge
  return bridge
}
