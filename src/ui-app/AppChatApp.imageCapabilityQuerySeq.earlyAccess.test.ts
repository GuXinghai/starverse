import { render, waitFor } from '@testing-library/vue'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type LogSpy = ReturnType<typeof vi.spyOn>

function stringifyLogArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`
  }
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function collectMatchedLogs(spy: LogSpy, pattern: RegExp): string[] {
  return spy.mock.calls
    .map((call) => call.map((arg) => stringifyLogArg(arg)).join(' '))
    .filter((line) => pattern.test(line))
}

async function flushEarlyTicks(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('AppChatApp imageCapabilityQuerySeq early access regression', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore
  let invoke: ReturnType<typeof vi.fn>

  beforeEach(() => {
    invoke = vi.fn(async (method: string) => {
      if (method === 'project.getInbox') {
        return { id: 'p_inbox', name: 'Inbox', createdAt: 1, updatedAt: 1, meta: null, isSystemProject: true }
      }
      if (method === 'project.list') {
        return [{ id: 'p_inbox', name: 'Inbox', createdAt: 1, updatedAt: 1, meta: null, isSystemProject: true }]
      }
      if (method === 'project.countConversationsBatch') {
        return { counts: { p_inbox: 1 } }
      }
      if (method === 'convo.list') {
        return [
          {
            id: 'c1',
            projectId: 'p_inbox',
            title: 'Chat 1',
            createdAt: 1,
            updatedAt: 2,
            meta: null,
          },
        ]
      }
      if (method === 'branch.ensureDefault') {
        return { id: 'b1', convoId: 'c1', headMessageId: null, name: 'Main', createdAt: 1, updatedAt: 2, deletedAt: null }
      }
      if (method === 'branch.list') {
        return [{ id: 'b1', convoId: 'c1', headMessageId: null, name: 'Main', createdAt: 1, updatedAt: 2, deletedAt: null }]
      }
      if (method === 'context.getRenderableTurns') {
        return {
          messages: [],
          turns: [],
          debug: {
            branchId: 'b1',
            excludedQuestionIds: [],
            includedMessageIds: [],
            chosenAnswerRootByQuestionId: {},
          },
        }
      }
      if (method === 'context.buildForBranch') {
        return {
          messages: [],
          debug: {
            branchId: 'b1',
            excludedQuestionIds: [],
            includedMessageIds: [],
            chosenAnswerRootByQuestionId: {},
          },
        }
      }
      if (method === 'settings.getReasoningPrefs') {
        return { value: { mode: 'auto', effort: 'auto', exclude: false } }
      }
      if (method === 'settings.getWebSearchDefaults') {
        return { value: null }
      }
      if (method === 'settings.getSamplingParamsDefaults') {
        return { value: null }
      }
      if (method === 'settings.getImageGenerationDefault') {
        return { value: null }
      }
      if (method === 'settings.getUserMessageRenderDefault') {
        return { value: false }
      }
      if (method === 'modelCatalog.list') {
        return [
          {
            modelId: 'anthropic/claude-3',
            name: 'Claude 3',
            vendor: 'anthropic',
            isHidden: 0,
            supportedParametersJson: '[]',
            lastSeenSnapshotId: 'snap_1',
          },
        ]
      }
      if (method === 'reasoningIndex.list') return []
      if (method === 'modelPrefs.listFavorites') return []
      if (method === 'modelPrefs.listRecents') return []
      if (method === 'modelCatalog.getModelDetail') {
        return {
          providerKey: 'openrouter',
          modelId: 'anthropic/claude-3',
          modelKey: 'openrouter::anthropic/claude-3',
          canonicalSlug: 'anthropic/claude-3',
          displayName: 'Claude 3',
          status: 'active',
          visibility: 'visible',
          architectureModality: 'text->text,image',
          inputModalitiesJson: '["text"]',
          outputModalitiesJson: '["text","image"]',
          supportedParametersJson: '[]',
          capabilitiesJson: '{"reasoning":true}',
          firstSeenAtMs: 1,
          lastSeenAtMs: 1,
          syncedAtMs: 1,
        }
      }
      if (method === 'modelCatalog.queryCore') return { items: [], nextCursor: null }
      if (method === 'modelCatalog.getCoreMeta') return { providerKey: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' }
      if (method === 'modelCatalog.listEndpointMeta') return []
      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }
    ;(globalThis as any).electronStore = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => true),
      delete: vi.fn(async () => true),
    }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    vi.restoreAllMocks()
  })

  it(
    'does not throw during module import (top-level evaluation)',
    async () => {
      const module = await import('./AppChatApp.vue')
      expect(module).toHaveProperty('default')
    },
    15000,
  )

  it('does not throw or emit ReferenceError/imageCapabilityQuerySeq logs during mount + first ticks', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const keywordPattern = /referenceerror|imageCapabilityQuerySeq/i

    const module = await import('./AppChatApp.vue')
    render(module.default)

    await flushEarlyTicks()
    await waitFor(() => {
      const samplingRow = document.querySelector('[data-testid="composer-sampling-params-row"]')
      expect(samplingRow).toBeTruthy()
    }, { timeout: 5000 })

    const matched = [...collectMatchedLogs(errorSpy, keywordPattern), ...collectMatchedLogs(warnSpy, keywordPattern)]
    expect(matched).toEqual([])
  })
})
