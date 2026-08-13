import { ipcRenderer, contextBridge } from 'electron'

const epoch2SmokeFixtureAuthorityEnabled = process.env.SV_EPOCH2_SMOKE_FIXTURE_AUTHORITY === '1' &&
  process.argv.some((argument) => argument.startsWith('--user-data-dir='))
const packagedTestDocxFixtureAuthorityEnabled = process.env.NODE_ENV === 'production' && process.env.SV_ELECTRON_SMOKE === '1' &&
  process.env.SV_ELECTRON_SMOKE_DFC === '1' && process.env.SV_PACKAGED_TEST_AUTHORITY === 'packaged_test_docx_fixture_authority_v1' &&
  typeof process.env.SV_PACKAGED_TEST_AUTHORITY_NONCE === 'string' && process.argv.some((argument) => argument.startsWith('--user-data-dir='))

// Expose electron-store API
contextBridge.exposeInMainWorld('electronStore', {
  get: (key: string) => ipcRenderer.invoke('store-get', key),
  set: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
  delete: (key: string) => ipcRenderer.invoke('store-delete', key),
  clearSafe: (keepKeys?: string[]) => ipcRenderer.invoke('store-clear-safe', keepKeys),
  checkIntegrity: () => ipcRenderer.invoke('store-check-integrity'),
})

contextBridge.exposeInMainWorld('rawGenerationDebug', {
  getStatus: () => ipcRenderer.invoke('raw-generation:get-status'),
  listByAnswerRootId: (answerRootId: string) => ipcRenderer.invoke('raw-generation:list-by-answer', { answerRootId }),
  listProviderErrorsByAnswerRootId: (answerRootId: string) => ipcRenderer.invoke('raw-generation:list-provider-errors-by-answer', { answerRootId }),
})

contextBridge.exposeInMainWorld('networkProxy', {
  getSettings: () => ipcRenderer.invoke('network-proxy:get-settings'),
  updateSettings: (settings: unknown) => ipcRenderer.invoke('network-proxy:update-settings', settings),
  resetSettings: () => ipcRenderer.invoke('network-proxy:reset-settings'),
  reapplySettings: () => ipcRenderer.invoke('network-proxy:reapply-settings'),
  resolveProxy: (payload: unknown) => ipcRenderer.invoke('network-proxy:resolve-proxy', payload),
})

type GenerationV2TextChannels = Readonly<{
  initial: string
  retry: string
  regenerate: string
  editResend: string
  abort: string
  projection: string
  continueTool?: string
}>

function createGenerationV2TextBridge(channels: GenerationV2TextChannels) {
  return Object.freeze({
    initial: (command: unknown) => ipcRenderer.invoke(channels.initial, command),
    retry: (command: unknown) => ipcRenderer.invoke(channels.retry, command),
    regenerate: (command: unknown) => ipcRenderer.invoke(channels.regenerate, command),
    editResend: (command: unknown) => ipcRenderer.invoke(channels.editResend, command),
    ...(channels.continueTool ? { continueTool: (command: unknown) => ipcRenderer.invoke(channels.continueTool!, command) } : {}),
    abort: (operationId: string) => ipcRenderer.invoke(channels.abort, operationId),
    onProjection: (listener: (projection: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, projection: unknown) => listener(projection)
      ipcRenderer.on(channels.projection, handler)
      return () => ipcRenderer.removeListener(channels.projection, handler)
    },
  })
}

function createGenerationV2CredentialBridge(provider: 'openrouter' | 'openai-responses' | 'google-ai-studio' | 'anthropic' | 'deepseek') {
  const prefix = `generation-v2:credentials:${provider}`
  return Object.freeze({
    getStatus: () => ipcRenderer.invoke(`${prefix}:get-status`),
    update: (payload: unknown) => ipcRenderer.invoke(`${prefix}:update`, payload),
    clear: () => ipcRenderer.invoke(`${prefix}:clear`),
  })
}

// Epoch-2 generation commands. Provider and operation contracts are selected
// by these fixed channel maps, never inferred from command payload shape.
contextBridge.exposeInMainWorld('generationV2', Object.freeze({
  ...(epoch2SmokeFixtureAuthorityEnabled ? {
    smokeFixture: Object.freeze({
      requestLocalFileGrant: (fixtureName: 'markdown' | 'html' | 'docx') =>
        ipcRenderer.invoke('generation-v2:smoke-fixture:request-local-file-grant', { fixtureName }),
    }),
  } : {}),
  runtime: Object.freeze({
    subscribe: () => ipcRenderer.invoke('generation-v2:runtime:subscribe'),
    snapshot: (operationId: string | null = null) => ipcRenderer.invoke('generation-v2:runtime:snapshot', operationId),
    abort: (operationId: string) => ipcRenderer.invoke('generation-v2:runtime:abort', operationId),
    onEvent: (listener: (event: unknown) => void) => {
      const handler = (_event: unknown, value: unknown) => listener(value)
      ipcRenderer.on('generation-v2:runtime:event', handler)
      return () => ipcRenderer.removeListener('generation-v2:runtime:event', handler)
    },
  }),
  credentials: Object.freeze({
    openRouter: createGenerationV2CredentialBridge('openrouter'),
    openAIResponses: createGenerationV2CredentialBridge('openai-responses'),
    googleAIStudio: createGenerationV2CredentialBridge('google-ai-studio'),
    anthropic: createGenerationV2CredentialBridge('anthropic'),
    deepSeek: createGenerationV2CredentialBridge('deepseek'),
  }),
  localRuntime: Object.freeze({
    generic: Object.freeze({
      probe: (payload: unknown) => ipcRenderer.invoke('generation-v2:local-runtime:generic:probe', payload),
      streamProbe: (payload: unknown) => ipcRenderer.invoke('generation-v2:local-runtime:generic:stream-probe', payload),
    }),
    lmStudio: Object.freeze({
      probe: (payload: unknown) => ipcRenderer.invoke('generation-v2:local-runtime:lmstudio:probe', payload),
      loadModel: (payload: unknown) => ipcRenderer.invoke('generation-v2:local-runtime:lmstudio:load-model', payload),
      unloadModel: (payload: unknown) => ipcRenderer.invoke('generation-v2:local-runtime:lmstudio:unload-model', payload),
    }),
    ollama: Object.freeze({
      probe: (payload: unknown) => ipcRenderer.invoke('generation-v2:local-runtime:ollama:probe', payload),
      loadModel: (payload: unknown) => ipcRenderer.invoke('generation-v2:local-runtime:ollama:load-model', payload),
      unloadModel: (payload: unknown) => ipcRenderer.invoke('generation-v2:local-runtime:ollama:unload-model', payload),
    }),
  }),
  openAICompatible: Object.freeze({
    list: () => ipcRenderer.invoke('generation-v2:openai-compatible:list'),
    get: (providerInstanceId: string) => ipcRenderer.invoke('generation-v2:openai-compatible:get', { providerInstanceId }),
    create: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:create', payload),
    reviseConfiguration: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:revise-configuration', payload),
    getCredentialStatus: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:get-credential-status', payload),
    update: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:update', payload),
    updateEndpoint: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:update-endpoint', payload),
    delete: (providerInstanceId: string) => ipcRenderer.invoke('generation-v2:openai-compatible:delete', { providerInstanceId }),
    clearCredential: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:clear-credential', payload),
    testConnection: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:test-connection', payload),
    abortConnectionTest: (requestId: string) => ipcRenderer.invoke('generation-v2:openai-compatible:abort-connection-test', { requestId }),
    syncModels: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:model-sync', payload),
    abortModelSync: (requestId: string) => ipcRenderer.invoke('generation-v2:openai-compatible:model-abort-sync', { requestId }),
    queryModels: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:model-query', payload),
    getModelStatus: (providerInstanceId: string) => ipcRenderer.invoke('generation-v2:openai-compatible:model-status', { providerInstanceId }),
    upsertManualModel: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:model-upsert-manual', payload),
    deleteManualModel: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:model-delete-manual', payload),
    listDiscovery: (providerInstanceId: string) => ipcRenderer.invoke('generation-v2:openai-compatible:list-discovery', { providerInstanceId }),
    ignoreDiscovery: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:ignore-discovery', payload),
    confirmDiscovery: (payload: unknown) => ipcRenderer.invoke('generation-v2:openai-compatible:confirm-discovery', payload),
    commands: createGenerationV2TextBridge({
      initial: 'generation-v2:openai-compatible:initial', retry: 'generation-v2:openai-compatible:retry',
      regenerate: 'generation-v2:openai-compatible:regenerate', editResend: 'generation-v2:openai-compatible:edit-resend',
      abort: 'generation-v2:openai-compatible:abort', projection: 'generation-v2:openai-compatible:projection',
    }),
  }),
  workspace: Object.freeze({
    ensureDefault: () => ipcRenderer.invoke('generation-v2:workspace:ensure-default'),
    listProjects: () => ipcRenderer.invoke('generation-v2:workspace:list-projects'),
    listConversations: (projectId: string, cursor: Readonly<{ updatedAtMs: number;
      conversationId: string }> | null = null, limit = 50) =>
      ipcRenderer.invoke('generation-v2:workspace:list-conversations', { projectId, cursor, limit }),
    readBranch: (branchId: string, beforeMessageId: string | null = null, limit = 50) =>
      ipcRenderer.invoke('generation-v2:workspace:read-branch', { branchId, beforeMessageId, limit }),
    getMessageCandidateNavigation: (branchId: string, messageId: string) =>
      ipcRenderer.invoke('generation-v2:workspace:get-message-candidate-navigation', {
        branchId, messageId,
      }),
    setContextFilter: (payload: Readonly<{ branchId:string;targetType:'question'|'answer';targetId:string;mode:'include'|'exclude' }>) =>
      ipcRenderer.invoke('generation-v2:workspace:set-context-filter', payload),
    clearContextFilter: (payload: Readonly<{ branchId:string;targetType:'question'|'answer';targetId:string }>) =>
      ipcRenderer.invoke('generation-v2:workspace:clear-context-filter', payload),
    getConfig: (ownerKind: 'global' | 'project' | 'conversation', ownerId: string) =>
      ipcRenderer.invoke('generation-v2:config:get', { ownerKind, ownerId }),
    updateConfig: (payload: Readonly<{ ownerKind: 'global' | 'project' | 'conversation'; ownerId: string;
      expectedConfigRevision: string; semanticLayer: unknown }>) => ipcRenderer.invoke('generation-v2:config:update', payload),
    createProject: (name: string) => ipcRenderer.invoke('generation-v2:workspace:create-project', { name }),
    renameProject: (projectId: string, name: string) => ipcRenderer.invoke('generation-v2:workspace:rename-project', { projectId, name }),
    deleteProject: (projectId: string) => ipcRenderer.invoke('generation-v2:workspace:delete-project', { projectId }),
    createConversation: (projectId: string, title: string) => ipcRenderer.invoke('generation-v2:workspace:create-conversation', { projectId, title }),
    renameConversation: (conversationId: string, title: string) => ipcRenderer.invoke('generation-v2:workspace:rename-conversation', { conversationId, title }),
    moveConversation: (conversationId: string, projectId: string) => ipcRenderer.invoke('generation-v2:workspace:move-conversation', { conversationId, projectId }),
    deleteConversation: (conversationId: string) => ipcRenderer.invoke('generation-v2:workspace:delete-conversation', { conversationId }),
    forkBranch: (sourceBranchId: string, headMessageId: string, name: string | null) =>
      ipcRenderer.invoke('generation-v2:workspace:fork-branch', { sourceBranchId, headMessageId, name }),
    renameBranch: (branchId: string, name: string | null) => ipcRenderer.invoke('generation-v2:workspace:rename-branch', { branchId, name }),
    deleteBranch: (branchId: string) => ipcRenderer.invoke('generation-v2:workspace:delete-branch', { branchId }),
    truncateFromQuestion: (payload: Readonly<{branchId:string;questionId:string;expectedHeadMessageId:string}>) =>
      ipcRenderer.invoke('generation-v2:workspace:truncate-from-question', payload),
    getSystemTemplate: () => ipcRenderer.invoke('generation-v2:workspace:get-system-template'),
    updateSystemTemplateConfig: (payload: unknown) => ipcRenderer.invoke('generation-v2:workspace:update-system-template-config', payload),
    resetSystemTemplate: (payload: unknown) => ipcRenderer.invoke('generation-v2:workspace:reset-system-template', payload),
    setNewChatLifecycle: (payload: unknown) => ipcRenderer.invoke('generation-v2:workspace:set-new-chat-lifecycle', payload),
    getLastFormalConversation: () => ipcRenderer.invoke('generation-v2:workspace:get-last-formal-conversation'),
    setLastFormalConversation: (conversationId: string | null) =>
      ipcRenderer.invoke('generation-v2:workspace:set-last-formal-conversation', { conversationId }),
    getConversationRoutePreference: (conversationId: string) =>
      ipcRenderer.invoke('generation-v2:workspace:get-conversation-route-preference', { conversationId }),
    updateConversationRoutePreference: (payload: unknown) =>
      ipcRenderer.invoke('generation-v2:workspace:update-conversation-route-preference', payload),
    clearConversationRoutePreference: (conversationId: string, expectedRevision: number) =>
      ipcRenderer.invoke('generation-v2:workspace:clear-conversation-route-preference', { conversationId, expectedRevision }),
    hideAnswer: (branchId: string, answerId: string) =>
      ipcRenderer.invoke('generation-v2:workspace:hide-answer', { branchId, answerId }),
    listBranches: (conversationId: string, cursor: Readonly<{
      updatedAtMs: number; branchId: string }> | null = null, limit = 50) =>
      ipcRenderer.invoke('generation-v2:workspace:list-branches', { conversationId, cursor, limit }),
  }),
  composer: Object.freeze({
    get: (conversationId: string) => ipcRenderer.invoke('generation-v2:composer:get', { conversationId }),
    updateText: (payload: Readonly<{conversationId:string;expectedRevision:number;draftText:string;
      draftMode:'compose'|'edit';editingSourceQuestionId:string|null}>) =>
      ipcRenderer.invoke('generation-v2:composer:update-text', payload),
    importLocal: (payload: Readonly<{conversationId:string;expectedRevision:number;filePath:string;selectionGrantToken:string}>) =>
      ipcRenderer.invoke('generation-v2:composer:import-local', payload),
    addUrlReference: (payload: Readonly<{conversationId:string;expectedRevision:number;url:string}>) =>
      ipcRenderer.invoke('generation-v2:composer:add-url-reference', payload),
    importUrlFile: (payload: Readonly<{conversationId:string;expectedRevision:number;url:string}>) =>
      ipcRenderer.invoke('generation-v2:composer:import-url-file', payload),
    removeAttachment: (payload: Readonly<{conversationId:string;expectedRevision:number;assetRevisionId:string}>) =>
      ipcRenderer.invoke('generation-v2:composer:remove-attachment', payload),
    clearCommitted: (payload: Readonly<{conversationId:string;expectedRevision:number}>) =>
      ipcRenderer.invoke('generation-v2:composer:clear-committed', payload),
    readPreview: (payload: Readonly<{assetId:string;assetRevisionId:string}>) =>
      ipcRenderer.invoke('generation-v2:composer:read-preview', payload),
    replace: (payload: Readonly<{conversationId:string;expectedRevision:number;draftText:string;draftMode:'compose'|'edit';
      editingSourceQuestionId:string|null;attachments:readonly unknown[]}>) => ipcRenderer.invoke('generation-v2:composer:replace', payload),
    replaceFromAnswerSnapshot: (payload: Readonly<{conversationId:string;expectedRevision:number;questionId:string;answerRootId:string;draftText:string}>) =>
      ipcRenderer.invoke('generation-v2:composer:replace-from-answer-snapshot', payload),
    dfcOptions: (payload: Readonly<{conversationId:string;assetId:string;providerId:string;operation:'chat_completions'|'images'|'responses'}>) => ipcRenderer.invoke('generation-v2:composer:dfc-options', payload),
    dfcSelect: (payload: Readonly<{conversationId:string;expectedRevision:number;assetId:string;optionId:string;providerId:string;operation:'chat_completions'|'images'|'responses'}>) => ipcRenderer.invoke('generation-v2:composer:dfc-select', payload),
    dfcPreview: (payload: Readonly<{conversationId:string;assetId:string;maxCharacters:number}>) => ipcRenderer.invoke('generation-v2:composer:dfc-preview', payload),
    retryFileTypeDetection: (payload: Readonly<{conversationId:string;assetRevisionId:string}>) =>
      ipcRenderer.invoke('generation-v2:composer:retry-file-type-detection', payload),
    onFileTypeDetectionUpdated: (listener: (event: unknown) => void) => {
      const handler = (_event: unknown, value: unknown) => listener(value)
      ipcRenderer.on('generation-v2:file-type-detection:updated', handler)
      return () => ipcRenderer.removeListener('generation-v2:file-type-detection:updated', handler)
    },
  }),
  search: Object.freeze({
    query: (payload: unknown) => ipcRenderer.invoke('generation-v2:search:query', payload),
    rebuild: () => ipcRenderer.invoke('generation-v2:search:rebuild'),
  }),
  plugins: Object.freeze({
    listOfficial: (payload?: unknown) => ipcRenderer.invoke('generation-v2:plugins:list-official', payload),
    listInstalled: () => ipcRenderer.invoke('generation-v2:plugins:list-installed'),
    registerLocalOfficial: (payload: unknown) => ipcRenderer.invoke('generation-v2:plugins:register-local-official', payload),
    installOfficial: (payload: unknown) => ipcRenderer.invoke('generation-v2:plugins:install-official', payload),
    installStatus: (payload?: unknown) => ipcRenderer.invoke('generation-v2:plugins:install-status', payload),
    cancelInstall: (payload?: unknown) => ipcRenderer.invoke('generation-v2:plugins:cancel-install', payload),
    enable: (payload: unknown) => ipcRenderer.invoke('generation-v2:plugins:enable', payload),
    disable: (payload: unknown) => ipcRenderer.invoke('generation-v2:plugins:disable', payload),
    uninstall: (payload: unknown) => ipcRenderer.invoke('generation-v2:plugins:uninstall', payload),
    health: (payload: unknown) => ipcRenderer.invoke('generation-v2:plugins:health', payload),
    registerLocalPackage: (payload: unknown) => ipcRenderer.invoke('generation-v2:plugins:register-local-package', payload),
    quarantineLibreOffice: () => ipcRenderer.invoke('generation-v2:plugins:quarantine-libreoffice'),
    diagnostics: () => ipcRenderer.invoke('generation-v2:plugins:diagnostics'),
    probeLibreOfficeDownload: () => ipcRenderer.invoke('generation-v2:plugins:probe-libreoffice-download'),
  }),
  models: Object.freeze({
    listOpenRouter: (payload?: unknown) => ipcRenderer.invoke('generation-v2:openrouter-models:list', payload),
    listOpenAIResponses: (payload?: unknown) => ipcRenderer.invoke('openai-responses-models:list-availability', payload),
    listAnthropic: (payload?: unknown) => ipcRenderer.invoke('anthropic-models:list-availability', payload),
    listGoogleAIStudio: (payload?: unknown) => ipcRenderer.invoke('google-ai-studio-models:list-availability', payload),
    listDeepSeek: (payload?: unknown) => ipcRenderer.invoke('deepseek-models:list-availability', payload),
    sync: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-catalog:sync', payload),
    status: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-catalog:status', payload),
    clearCurrent: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-catalog:clear-current', payload),
    clearAll: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-catalog:clear-all', payload),
    applyPending: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-catalog:apply-pending', payload),
    discardPending: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-catalog:discard-pending', payload),
  }),
  modelPreferences: Object.freeze({
    listFavorites: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-preferences:list-favorites', payload),
    addFavorite: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-preferences:add-favorite', payload),
    removeFavorite: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-preferences:remove-favorite', payload),
    reorderFavorites: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-preferences:reorder-favorites', payload),
    listRecents: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-preferences:list-recents', payload),
    recordRecent: (payload: unknown) => ipcRenderer.invoke('generation-v2:model-preferences:record-recent', payload),
  }),
  localProfiles: Object.freeze({
    list: () => ipcRenderer.invoke('generation-v2:local-profile:list'),
    create: (payload: Readonly<{ providerId: 'lmstudio' | 'ollama' | 'generic_local';
      protocolContractId: string; baseUrl: string; protocolConfig?: Readonly<Record<string, unknown>> }>) => ipcRenderer.invoke('generation-v2:local-profile:create', payload),
    delete: (endpointProfileId: string) => ipcRenderer.invoke('generation-v2:local-profile:delete', { endpointProfileId }),
  }),
  lmStudio: Object.freeze({ openResponses: createGenerationV2TextBridge({
    initial: 'generation-v2:lmstudio:openresponses:initial', retry: 'generation-v2:lmstudio:openresponses:retry',
    regenerate: 'generation-v2:lmstudio:openresponses:regenerate', editResend: 'generation-v2:lmstudio:openresponses:edit-resend',
    continueTool: 'generation-v2:lmstudio:openresponses:continue-tool',
    abort: 'generation-v2:lmstudio:openresponses:abort', projection: 'generation-v2:lmstudio:projection',
  }) }),
  genericLocal: Object.freeze({ openAIChatCompletions: createGenerationV2TextBridge({
    initial: 'generation-v2:generic-local:openai-chat:initial', retry: 'generation-v2:generic-local:openai-chat:retry',
    regenerate: 'generation-v2:generic-local:openai-chat:regenerate', editResend: 'generation-v2:generic-local:openai-chat:edit-resend',
    abort: 'generation-v2:generic-local:openai-chat:abort', projection: 'generation-v2:generic-local:projection',
  }) }),
  ollama: Object.freeze({ chat: createGenerationV2TextBridge({
    initial: 'generation-v2:ollama:chat:initial', retry: 'generation-v2:ollama:chat:retry',
    regenerate: 'generation-v2:ollama:chat:regenerate', editResend: 'generation-v2:ollama:chat:edit-resend',
    abort: 'generation-v2:ollama:chat:abort', projection: 'generation-v2:ollama:projection',
  }) }),
  openRouter: Object.freeze({
    chat: createGenerationV2TextBridge({
      initial: 'generation-v2:openrouter:chat:initial', retry: 'generation-v2:openrouter:chat:retry',
      regenerate: 'generation-v2:openrouter:chat:regenerate', editResend: 'generation-v2:openrouter:chat:edit-resend',
      continueTool: 'generation-v2:openrouter:chat:continue-tool', abort: 'generation-v2:openrouter:chat:abort',
      projection: 'generation-v2:openrouter:projection',
    }),
    images: Object.freeze({
      ...createGenerationV2TextBridge({
        initial: 'generation-v2:openrouter:images:initial', retry: 'generation-v2:openrouter:images:retry',
        regenerate: 'generation-v2:openrouter:images:regenerate', editResend: 'generation-v2:openrouter:images:edit-resend',
        abort: 'generation-v2:openrouter:images:abort', projection: 'generation-v2:openrouter:projection',
      }),
      getEndpointSelection: (payload: unknown) => ipcRenderer.invoke('generation-v2:openrouter:images:endpoints:get', payload),
      selectEndpoint: (payload: unknown) => ipcRenderer.invoke('generation-v2:openrouter:images:endpoints:select', payload),
      updateEndpointSettings: (payload: unknown) => ipcRenderer.invoke('generation-v2:openrouter:images:endpoints:update-settings', payload),
    }),
  }),
  openAIResponses: createGenerationV2TextBridge({
    initial: 'generation-v2:openai-responses:initial', retry: 'generation-v2:openai-responses:retry',
    regenerate: 'generation-v2:openai-responses:regenerate', editResend: 'generation-v2:openai-responses:edit-resend',
    continueTool: 'generation-v2:openai-responses:continue-tool', abort: 'generation-v2:openai-responses:abort',
    projection: 'generation-v2:openai-responses:projection',
  }),
  anthropic: createGenerationV2TextBridge({
    initial: 'generation-v2:anthropic:initial', retry: 'generation-v2:anthropic:retry',
    regenerate: 'generation-v2:anthropic:regenerate', editResend: 'generation-v2:anthropic:edit-resend',
    continueTool: 'generation-v2:anthropic:continue-tool', abort: 'generation-v2:anthropic:abort',
    projection: 'generation-v2:anthropic:projection',
  }),
  deepSeek: createGenerationV2TextBridge({
    initial: 'generation-v2:deepseek:initial', retry: 'generation-v2:deepseek:retry',
    regenerate: 'generation-v2:deepseek:regenerate', editResend: 'generation-v2:deepseek:edit-resend',
    continueTool: 'generation-v2:deepseek:continue-tool', abort: 'generation-v2:deepseek:abort',
    projection: 'generation-v2:deepseek:projection',
  }),
  gemini: Object.freeze({
    generateContent: createGenerationV2TextBridge({
      initial: 'generation-v2:gemini:generate-content:initial', retry: 'generation-v2:gemini:generate-content:retry',
      regenerate: 'generation-v2:gemini:generate-content:regenerate', editResend: 'generation-v2:gemini:generate-content:edit-resend',
      continueTool: 'generation-v2:gemini:generate-content:continue-tool',
      abort: 'generation-v2:gemini:generate-content:abort', projection: 'generation-v2:gemini:projection',
    }),
    interactionsImage: createGenerationV2TextBridge({
      initial: 'generation-v2:gemini:interactions-image:initial', retry: 'generation-v2:gemini:interactions-image:retry',
      regenerate: 'generation-v2:gemini:interactions-image:regenerate', editResend: 'generation-v2:gemini:interactions-image:edit-resend',
      abort: 'generation-v2:gemini:interactions-image:abort', projection: 'generation-v2:gemini:interactions-image:projection',
    }),
  }),
}))

if (packagedTestDocxFixtureAuthorityEnabled) {
  contextBridge.exposeInMainWorld('packagedTestDocxFixtureV1', Object.freeze({
    issueGrant: () => ipcRenderer.invoke('packaged-smoke:issue-docx-fixture-grant-v1', {}),
  }))
}

// Expose file dialog API for image selection
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  /**
   * 选择图片文件并返回 base64 data URI
   * @returns {Promise<string | null>} base64 data URI 或 null（如果用户取消）
   */
  selectImage: () => ipcRenderer.invoke('dialog:select-image'),
  selectFile: (options?: { filters?: Array<{ name: string; extensions: string[] }>; defaultMimeType?: string }) =>
    ipcRenderer.invoke('dialog:select-file', options),
  selectLocalFiles: (options?: { context?: 'file' | 'image'; allowMultiple?: boolean }) =>
    ipcRenderer.invoke('dialog:select-local-files', options),
  importLibreOfficeSvpkg: () => ipcRenderer.invoke('dialog:import-libreoffice-svpkg'),
  quarantineLibreOfficeRuntime: () => ipcRenderer.invoke('dialog:quarantine-libreoffice-runtime'),

  /**
   * 使用系统默认应用打开图片
   * 支持 data URI (base64)、HTTP(S) URL 和本地文件路径
   * @param imageUrl - 图片的 URL 或 data URI
   * @returns {Promise<{success: boolean, path?: string, url?: string, error?: string}>}
   */
  openImage: (imageUrl: string) => ipcRenderer.invoke('shell:open-image', imageUrl),
  copyImageToClipboard: (imageUrl: string) =>
    ipcRenderer.invoke('clipboard:write-image', { imageUrl }),
  resolveImagePath: (imageUrl: string) =>
    ipcRenderer.invoke('shell:resolve-image-path', { imageUrl }),
  exportImage: (imageUrl: string, options?: { suggestedName?: string }) =>
    ipcRenderer.invoke('dialog:export-image', { imageUrl, ...(options ?? {}) }),

  /**
   * 在新的 BrowserWindow 中打开外部链接（类似微信/QQ 内的外链弹窗）
   */
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  /**
   * 打开应用内链（In-App WebView，默认复用同一窗口）
   */
  openInAppLink: (url: string, windowId?: number) => ipcRenderer.invoke('inapp:open-link', { url, windowId }),

})
