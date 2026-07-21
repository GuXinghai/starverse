import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getLastFormalConversationId,
  getNewChatLifecycleSettings,
  getSystemChatTemplate,
  resetSystemChatTemplate,
  setLastFormalConversationId,
  setNewChatLifecycleSettings,
  updateSystemChatTemplateConfig,
} from './systemChatTemplateClient'

const settings = Object.freeze({
  startupNavigation: 'open_new' as const,
  startupTemplateReset: Object.freeze({ modelConfig: true, draftAttachments: true }),
  postSendTemplateReset: 'reset_all' as const,
})

const snapshot = Object.freeze({
  conversation: Object.freeze({
    id: 'conversation:new-template', projectId: 'project:1', branchId: 'branch:new-template',
    title: '', createdAt: 1, updatedAt: 1, meta: null,
    systemKey: 'new_template' as const, templateRevision: 0,
  }),
  draft: Object.freeze({ conversationId: 'conversation:new-template', draftText: '', draftMode: 'compose' as const,
    editingSourceQuestionId: null, revision: 0, updatedAtMs: 1, attachments: Object.freeze([]) }),
  settings,
})

afterEach(() => vi.unstubAllGlobals())

describe('systemChatTemplateClient epoch-2 bridge', () => {
  it('uses only the Generation V2 workspace bridge for template and lifecycle state', async () => {
    const workspace = {
      getSystemTemplate: vi.fn(async () => ({ ok: true, value: snapshot })),
      updateSystemTemplateConfig: vi.fn(async () => ({ ok: true, value: snapshot })),
      resetSystemTemplate: vi.fn(async () => ({ ok: true, value: snapshot })),
      setNewChatLifecycle: vi.fn(async () => ({ ok: true, value: settings })),
      getLastFormalConversation: vi.fn(async () => ({ ok: true, value: { conversationId: 'conversation:formal' } })),
      setLastFormalConversation: vi.fn(async () => ({ ok: true, value: true })),
    }
    vi.stubGlobal('window', { generationV2: { workspace } })

    expect(await getSystemChatTemplate()).toEqual(snapshot)
    expect(await getNewChatLifecycleSettings()).toEqual(settings)
    await updateSystemChatTemplateConfig({
      templateConversationId: snapshot.conversation.id, expectedTemplateRevision: 0, meta: { selectedModel: 'm' },
    })
    await resetSystemChatTemplate({
      templateConversationId: snapshot.conversation.id, expectedTemplateRevision: 0,
      resetModelConfig: true, resetDraftAttachments: true,
    })
    await setNewChatLifecycleSettings(settings)
    expect(await getLastFormalConversationId()).toBe('conversation:formal')
    await setLastFormalConversationId('conversation:formal')

    expect(workspace.updateSystemTemplateConfig).toHaveBeenCalledWith({
      templateConversationId: snapshot.conversation.id, expectedTemplateRevision: 0, meta: { selectedModel: 'm' },
    })
    expect(workspace.setLastFormalConversation).toHaveBeenCalledWith('conversation:formal')
  })

  it('surfaces the exact V2 command error without consulting a legacy bridge', async () => {
    vi.stubGlobal('window', { generationV2: { workspace: {
      getSystemTemplate: vi.fn(async () => ({ ok: false, code: 'GENERATION_V2_SYSTEM_TEMPLATE_NOT_FOUND' })),
    } } })
    await expect(getSystemChatTemplate()).rejects.toThrow('GENERATION_V2_SYSTEM_TEMPLATE_NOT_FOUND')
  })
})
