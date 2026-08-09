/**
 * Vitest 测试环境全局设置
 */

import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { config } from '@vue/test-utils'

type DbInvoke = <T = unknown>(method: string, params?: unknown) => Promise<T>

// Enable DB branch invariants during tests (fail fast on semantic regressions).
process.env.SV_BRANCH_INVARIANTS = '1'

// When VS_TEST_VERBOSE_OPENROUTER is explicitly set in tests, propagate to runtime gate.
if (process.env.SV_TEST_VERBOSE_OPENROUTER === '1') {
  ;(globalThis as any).__SV_TEST_VERBOSE_OPENROUTER = '1'
}

const createDbBridgeMock = () => {
  const convos = new Map<string, any>()
  const projects = new Map<string, any>()
  const messagesByConvo = new Map<string, any[]>()

  const invoke: DbInvoke = async (method, params) => {
    switch (method) {
      case 'health.ping':
        return { ok: true } as any
      case 'health.stats':
        return { ok: true } as any

      case 'project.list':
        return Array.from(projects.values()) as any
      case 'project.create': {
        const payload = params as any
        const record = { id: payload?.id ?? `project-${projects.size + 1}`, ...payload }
        projects.set(record.id, record)
        return record as any
      }
      case 'project.save':
      case 'project.delete':
      case 'project.countConversations':
        return { ok: true, count: 0 } as any
      case 'project.findById':
      case 'project.findByName':
        return null as any

      case 'convo.create': {
        const payload = params as any
        const record = { id: payload?.id ?? `convo-${convos.size + 1}`, ...payload }
        convos.set(record.id, record)
        if (!messagesByConvo.has(record.id)) messagesByConvo.set(record.id, [])
        return record as any
      }
      case 'convo.save':
      case 'convo.saveWithMessages':
      case 'convo.archive':
      case 'convo.restore':
        return { ok: true } as any
      case 'convo.list':
        return Array.from(convos.values()) as any
      case 'convo.delete': {
        const payload = params as any
        const id = payload?.id
        if (id) convos.delete(id)
        if (id) messagesByConvo.delete(id)
        return { ok: true } as any
      }
      case 'convo.deleteMany':
        return { deleted: 0 } as any
      case 'convo.archiveMany':
        return { archived: 0, failed: [] } as any
      case 'convo.listArchived':
        return [] as any

      case 'message.append':
        return { ok: true } as any
      case 'message.appendDelta':
        return { ok: true } as any
      case 'message.list': {
        const payload = params as any
        return (messagesByConvo.get(payload?.convoId) ?? []) as any
      }
      case 'message.replace':
        return { ok: true } as any

      case 'search.fulltext':
        return [] as any
      case 'maintenance.optimize':
        return { ok: true } as any

      // Usage statistics are unit-tested elsewhere; return safe defaults.
      case 'usage.log':
        return { ok: true } as any
      case 'usage.getProjectStats':
      case 'usage.getConvoStats':
      case 'usage.getModelStats':
      case 'usage.getDateRangeStats':
        return [] as any
      case 'usage.aggregate':
      case 'usage.reasoningTrend':
      case 'usage.reasoningModelComparison':
        return { data: [] } as any
      case 'usage.drillDown':
        return { data: [] } as any
      case 'prefs.save':
        return { id: 'pref-1' } as any
      case 'prefs.list':
        return { data: [] } as any
      case 'prefs.delete':
        return { deleted: 0 } as any
      case 'prefs.default':
        return null as any

      default:
        return { ok: true } as any
    }
  }

  return {
    invoke: vi.fn(invoke)
  }
}

// Mock Electron preload bridges expected by src/utils/electronBridge.ts
const w = window as any
w.electronStore = {
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => true),
  delete: vi.fn(async () => true)
}

w.electronAPI = {
  selectImage: vi.fn(async () => null),
  selectFile: vi.fn(async () => null),
  openExternal: vi.fn(async () => ({ success: true })),
  openInAppLink: vi.fn(async () => ({ tabId: undefined, windowId: undefined }))
}

w.ipcRenderer = {
  on: vi.fn(),
  off: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(async () => undefined)
}

w.dbBridge = createDbBridgeMock()

// Renderer tests execute the production Generation V2 clients, so the global
// harness must expose the same fixed preload topology even when a test does not
// exercise generation. Individual command tests replace the relevant leaf with
// a scenario-specific authority; the default deliberately fails commands
// closed instead of reviving the removed V1 bridge.
const createGenerationV2CommandBridgeMock = () => ({
  initial: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_COMMAND_NOT_CONFIGURED' })),
  retry: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_COMMAND_NOT_CONFIGURED' })),
  regenerate: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_COMMAND_NOT_CONFIGURED' })),
  editResend: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_TEST_COMMAND_NOT_CONFIGURED' })),
  abort: vi.fn(async () => ({ ok: true })),
  onProjection: vi.fn(() => () => undefined),
})

const createGenerationV2TestBridge = () => {
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
    conversationId, draftText: '', draftMode: 'compose' as const, editingSourceQuestionId: null,
    revision: 0, updatedAtMs: now, attachments: [] as unknown[],
  }
  let routePreference: any = null
  const template = () => ({
    conversation: { id: conversationId, projectId, branchId, title: 'New Chat', createdAt: now, updatedAt: now,
      meta: null, systemKey: 'new_template' as const, templateRevision: 0 },
    draft,
    settings: { startupNavigation: 'open_new' as const,
      startupTemplateReset: { modelConfig: false, draftAttachments: false },
      postSendTemplateReset: 'reset_all' as const },
  })
  const ok = <T>(value: T) => ({ ok: true as const, value })
  const replaceDraft = (input: any) => {
    draft = { ...draft, draftText: String(input?.draftText ?? draft.draftText),
      draftMode: input?.draftMode === 'edit' ? 'edit' : 'compose',
      editingSourceQuestionId: input?.editingSourceQuestionId ?? null,
      revision: draft.revision + 1, updatedAtMs: draft.updatedAtMs + 1,
      attachments: Array.isArray(input?.attachments) ? input.attachments : draft.attachments }
    return ok(draft)
  }
  return ({
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
  workspace: {
    ensureDefault: vi.fn(async () => ok({ projectId, conversationId, branchId, created: false })),
    listProjects: vi.fn(async () => ok([{ projectId, name: 'Default', createdAtMs: now, updatedAtMs: now }])),
    listConversations: vi.fn(async () => ok({ items: [], nextCursor: null, totalCount: 0 })),
    listBranches: vi.fn(async () => ok({ items: [], nextCursor: null, totalCount: 0 })),
    readBranch: vi.fn(async () => ok({ branchId, conversationId, projectId, title: 'New Chat', branchName: null,
      headMessageId: null, beforeMessageId: null, hasMoreTurns: false, turns: [] })),
    getMessageCandidateNavigation: vi.fn(async (inputBranchId: string, messageId: string) => ok({
      conversationId,
      currentBranchId: inputBranchId,
      messageId,
      parentMessageId: null,
      role: 'user',
      currentIndex: 0,
      total: 1,
      previous: null,
      next: null,
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
    deleteProject: vi.fn(async () => ok({})),
    createConversation: vi.fn(async () => ok({ conversationId, branchId })),
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
  },
  })
}

w.generationV2 = createGenerationV2TestBridge()

// Keep legacy mock shape for older tests that still reference window.electron
w.electron = {
  store: w.electronStore,
  api: w.electronAPI,
  ipc: w.ipcRenderer,
  db: w.dbBridge
}

// 配置 Vue Test Utils
config.global.mocks = {
  $electron: (global.window as any).electron
}

// 每个测试前重置所有 mocks
beforeEach(() => {
  vi.clearAllMocks()

  // Every test gets a fresh epoch-2 workspace/composer and fresh command
  // listeners. File-local beforeEach hooks may then replace only the authority
  // they exercise without state leaking from a prior case.
  w.generationV2 = createGenerationV2TestBridge()

  // Ensure Pinia is active for all tests (including component setup()).
  setActivePinia(createPinia())
})

// Default fetch stub: fail fast on unexpected real network.
// Individual tests can override with vi.stubGlobal('fetch', ...)
if (typeof (globalThis as any).fetch === 'function') {
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    throw new Error(`[tests] Unexpected fetch call: ${String(input)}`)
  }))
}
