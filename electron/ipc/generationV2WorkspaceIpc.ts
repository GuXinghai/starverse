import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { ConversationReadV2Repo } from '../../infra/db/repo/conversationReadV2Repo'
import { ConversationWorkspaceV2Repo } from '../../infra/db/repo/conversationWorkspaceV2Repo'
import { BranchContextFilterV2Repo } from '../../infra/db/repo/branchContextFilterV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { projectGenerationConfigLayerV2 } from '../../src/next/generation-v2/config/generationConfigLayerV2'
import type { RegisterInvoke } from './types'
import { SystemChatTemplateV2Repo } from '../../infra/db/repo/systemChatTemplateV2Repo'
import { ConversationRoutePreferenceV2Repo } from '../../infra/db/repo/conversationRoutePreferenceV2Repo'
import type { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'

export const GENERATION_V2_WORKSPACE_IPC_CHANNELS = Object.freeze([
  'generation-v2:workspace:ensure-default', 'generation-v2:workspace:list-projects',
  'generation-v2:workspace:list-conversations', 'generation-v2:workspace:read-branch',
  'generation-v2:workspace:get-message-candidate-navigation',
  'generation-v2:config:get', 'generation-v2:config:update',
  'generation-v2:workspace:create-project', 'generation-v2:workspace:rename-project', 'generation-v2:workspace:delete-project',
  'generation-v2:workspace:create-conversation', 'generation-v2:workspace:rename-conversation',
  'generation-v2:workspace:move-conversation', 'generation-v2:workspace:delete-conversation',
  'generation-v2:workspace:fork-branch', 'generation-v2:workspace:rename-branch', 'generation-v2:workspace:delete-branch',
  'generation-v2:workspace:truncate-from-question',
  'generation-v2:workspace:set-context-filter', 'generation-v2:workspace:clear-context-filter',
  'generation-v2:workspace:get-system-template', 'generation-v2:workspace:update-system-template-config',
  'generation-v2:workspace:reset-system-template', 'generation-v2:workspace:set-new-chat-lifecycle',
  'generation-v2:workspace:get-last-formal-conversation', 'generation-v2:workspace:set-last-formal-conversation',
  'generation-v2:workspace:get-conversation-route-preference',
  'generation-v2:workspace:update-conversation-route-preference',
  'generation-v2:workspace:clear-conversation-route-preference',
  'generation-v2:workspace:hide-answer',
  'generation-v2:workspace:list-branches',
] as const)

type Raw = Readonly<Record<string, unknown>>
function object(value: unknown, keys: readonly string[]): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('invalid')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((entry) => !entry.enumerable || !('value' in entry) || entry.value === undefined)) throw new Error('invalid')
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}
function text(value: unknown, max = 512): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value) throw new Error('invalid')
  return value
}
function scope(value: unknown): 'global' | 'project' | 'conversation' {
  if (value !== 'global' && value !== 'project' && value !== 'conversation') throw new Error('invalid')
  return value
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value)
}
function boundedInteger(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error('invalid')
  return value as number
}

export function registerGenerationV2WorkspaceIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  db: BetterSqlite3.Database
  runtimeRegistry: Pick<GenerationOperationRuntimeRegistryV2,
    'runWithBranchQuiesced' | 'runWithConversationQuiesced' | 'runWithProjectQuiesced'>
  nowMs?: () => number
}>): readonly string[] {
  const nowMs = input.nowMs ?? Date.now
  const graph = new ConversationGraphV2Repo(input.db)
  const read = new ConversationReadV2Repo(input.db)
  const workspace = new ConversationWorkspaceV2Repo(input.db)
  const contextFilters = new BranchContextFilterV2Repo(input.db)
  const config = new GenerationConfigV2Repo(input.db, nowMs)
  const systemTemplate = new SystemChatTemplateV2Repo(input.db, nowMs)
  const routePreference = new ConversationRoutePreferenceV2Repo(input.db, nowMs)
  const safe = (fn: (payload: unknown) => unknown | Promise<unknown>) => async (_event: unknown, payload?: unknown) => {
    try { return Object.freeze({ ok: true, value: await fn(payload) }) } catch (error) {
      return Object.freeze({ ok: false, code: error instanceof Error ? error.message : 'GENERATION_V2_WORKSPACE_COMMAND_FAILED' })
    }
  }

  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[0], safe(() => {
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const at = nowMs()
      const existingProject = input.db.prepare(`SELECT project_id AS projectId FROM project_v2
        ORDER BY updated_at_ms DESC,project_id ASC LIMIT 1`).get() as { projectId?: unknown } | undefined
      const projectId = typeof existingProject?.projectId === 'string'
        ? existingProject.projectId
        : graph.createProject(context, { projectId: `project:${randomUUID()}`, name: 'Starverse', createdAtMs: at }).value
      const existingTemplate = input.db.prepare(`SELECT 1 FROM system_chat_template_v2 WHERE system_key='new_template'`).get()
      const template = systemTemplate.ensure(context, { projectId,
        conversationId: `conversation:new-template:${randomUUID()}`, branchId: `branch:new-template:${randomUUID()}`,
        createdAtMs: at })
      return Object.freeze({ projectId, conversationId: template.conversation.id,
        branchId: template.conversation.branchId, created: !existingTemplate })
    })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[1], safe(() => read.listProjects()))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[2], safe((payload) => {
    const raw = object(payload, ['projectId', 'cursor', 'limit'])
    const cursorRaw = raw.cursor === null ? null : object(raw.cursor, ['updatedAtMs', 'conversationId'])
    return read.listConversationPage(
      text(raw.projectId),
      cursorRaw === null ? null : Object.freeze({
        updatedAtMs: boundedInteger(cursorRaw.updatedAtMs, 0, Number.MAX_SAFE_INTEGER),
        conversationId: text(cursorRaw.conversationId),
      }),
      boundedInteger(raw.limit, 1, 50),
    )
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[3], safe((payload) => {
    const raw = object(payload, ['branchId', 'beforeMessageId', 'limit'])
    return read.readBranch(
      text(raw.branchId),
      nullableText(raw.beforeMessageId),
      boundedInteger(raw.limit, 1, 50),
    )
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[4], safe((payload) => {
    const raw = object(payload, ['branchId', 'messageId'])
    return read.getMessageCandidateNavigation(text(raw.branchId), text(raw.messageId))
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[5], safe((payload) => {
    const raw = object(payload, ['ownerKind', 'ownerId'])
    const fact = config.getScope(scope(raw.ownerKind), text(raw.ownerId))
    return Object.freeze({ ownerKind: fact.ownerKind, ownerId: fact.ownerId,
      configRevision: fact.configRevision.value, semanticLayer: projectGenerationConfigLayerV2(fact.semanticLayer) })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[6], safe((payload) => {
    const raw = object(payload, ['ownerKind', 'ownerId', 'expectedConfigRevision', 'semanticLayer'])
    const fact = config.compareAndSetScope(scope(raw.ownerKind), text(raw.ownerId), text(raw.expectedConfigRevision, 1024), raw.semanticLayer)
    return Object.freeze({ ownerKind: fact.ownerKind, ownerId: fact.ownerId,
      configRevision: fact.configRevision.value, semanticLayer: projectGenerationConfigLayerV2(fact.semanticLayer) })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[7], safe((payload) => {
    const raw = object(payload, ['name'])
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const id = graph.createProject(context, { projectId: `project:${randomUUID()}`, name: text(raw.name, 4096), createdAtMs: nowMs() })
      return Object.freeze({ projectId: id.value })
    })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[8], safe((payload) => {
    const raw = object(payload, ['projectId', 'name'])
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      workspace.renameProject(context, { projectId: text(raw.projectId), name: text(raw.name, 4096), updatedAtMs: nowMs() }); return true
    })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[9], safe((payload) => {
    const raw = object(payload, ['projectId'])
    const projectId = text(raw.projectId)
    return input.runtimeRegistry.runWithProjectQuiesced(projectId, () =>
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
        workspace.deleteProject(context, { projectId })
        return true
      }))
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[10], safe((payload) => {
    const raw = object(payload, ['projectId', 'title'])
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const created = graph.createConversationAndDefaultBranch(context, { projectId: text(raw.projectId),
        conversationId: `conversation:${randomUUID()}`, branchId: `branch:${randomUUID()}`,
        title: typeof raw.title === 'string' ? raw.title : '', branchName: null, createdAtMs: nowMs() })
      return Object.freeze({ conversationId: created.conversationId.value, branchId: created.branchId.value })
    })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[11], safe((payload) => {
    const raw = object(payload, ['conversationId', 'title'])
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => { workspace.renameConversation(context,
      { conversationId: text(raw.conversationId), title: typeof raw.title === 'string' ? raw.title : '', updatedAtMs: nowMs() }); return true })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[12], safe((payload) => {
    const raw = object(payload, ['conversationId', 'projectId'])
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => { workspace.moveConversation(context,
      { conversationId: text(raw.conversationId), projectId: text(raw.projectId), updatedAtMs: nowMs() }); return true })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[13], safe((payload) => {
    const raw = object(payload, ['conversationId'])
    const conversationId = text(raw.conversationId)
    return input.runtimeRegistry.runWithConversationQuiesced(conversationId, () =>
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
        workspace.deleteConversation(context, { conversationId })
        return true
      }))
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[14], safe((payload) => {
    const raw = object(payload, ['sourceBranchId', 'headMessageId', 'name'])
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const branchId = `branch:${randomUUID()}`; workspace.forkBranch(context, { sourceBranchId: text(raw.sourceBranchId),
        branchId, headMessageId: text(raw.headMessageId), name: raw.name === null ? null : text(raw.name, 4096), createdAtMs: nowMs() })
      return Object.freeze({ branchId })
    })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[15], safe((payload) => {
    const raw = object(payload, ['branchId', 'name'])
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => { workspace.renameBranch(context,
      { branchId: text(raw.branchId), name: raw.name === null ? null : text(raw.name, 4096), updatedAtMs: nowMs() }); return true })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[16], safe((payload) => {
    const raw = object(payload, ['branchId'])
    const branchId = text(raw.branchId)
    return input.runtimeRegistry.runWithBranchQuiesced(branchId, () =>
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => { workspace.deleteBranch(context,
        { branchId, deletedAtMs: nowMs() }); return true }))
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[17], safe((payload) => {
    const raw = object(payload, ['branchId', 'questionId', 'expectedHeadMessageId'])
    const branchId = text(raw.branchId)
    return input.runtimeRegistry.runWithBranchQuiesced(branchId, () =>
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => workspace.truncateBranchFromQuestion(context, {
        branchId, questionId: text(raw.questionId), expectedHeadMessageId: text(raw.expectedHeadMessageId), updatedAtMs: nowMs(),
      })))
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[18], safe((payload) => {
    const raw = object(payload, ['branchId', 'targetType', 'targetId', 'mode'])
    if (raw.targetType !== 'question' && raw.targetType !== 'answer') throw new Error('invalid')
    if (raw.mode !== 'include' && raw.mode !== 'exclude') throw new Error('invalid')
    const targetType = raw.targetType as 'question' | 'answer'
    const mode = raw.mode as 'include' | 'exclude'
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      contextFilters.set(context, { branchId: text(raw.branchId), targetType,
        targetId: text(raw.targetId), mode, updatedAtMs: nowMs() })
      return true
    })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[19], safe((payload) => {
    const raw = object(payload, ['branchId', 'targetType', 'targetId'])
    if (raw.targetType !== 'question' && raw.targetType !== 'answer') throw new Error('invalid')
    const targetType = raw.targetType as 'question' | 'answer'
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      contextFilters.clear(context, { branchId: text(raw.branchId), targetType, targetId: text(raw.targetId) })
      return true
    })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[20], safe(() => systemTemplate.get()))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[21], safe((payload) => {
    const raw = object(payload, ['templateConversationId', 'expectedTemplateRevision', 'meta'])
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => systemTemplate.updateConfig(context, {
      templateConversationId: text(raw.templateConversationId),
      expectedTemplateRevision: boundedInteger(raw.expectedTemplateRevision, 0, Number.MAX_SAFE_INTEGER),
      meta: raw.meta,
    }))
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[22], safe((payload) => {
    const raw = object(payload, ['templateConversationId', 'expectedTemplateRevision', 'resetModelConfig', 'resetDraftAttachments'])
    if (typeof raw.resetModelConfig !== 'boolean' || typeof raw.resetDraftAttachments !== 'boolean') throw new Error('invalid')
    const resetModelConfig = raw.resetModelConfig
    const resetDraftAttachments = raw.resetDraftAttachments
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => systemTemplate.reset(context, {
      templateConversationId: text(raw.templateConversationId),
      expectedTemplateRevision: boundedInteger(raw.expectedTemplateRevision, 0, Number.MAX_SAFE_INTEGER),
      resetModelConfig, resetDraftAttachments,
    }))
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[23], safe((payload) =>
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => systemTemplate.setLifecycleSettings(context, payload))))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[24], safe(() => Object.freeze({
    conversationId: systemTemplate.getLastFormalConversationId(),
  })))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[25], safe((payload) => {
    const raw = object(payload, ['conversationId'])
    const conversationId = raw.conversationId === null ? null : text(raw.conversationId)
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      systemTemplate.setLastFormalConversationId(context, conversationId); return true
    })
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[26], safe((payload) => {
    const raw = object(payload, ['conversationId'])
    return routePreference.get(text(raw.conversationId))
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[27], safe((payload) => {
    const raw = object(payload, ['conversationId', 'expectedRevision', 'selection'])
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => routePreference.upsert(context, {
      conversationId: text(raw.conversationId),
      expectedRevision: boundedInteger(raw.expectedRevision, 0, Number.MAX_SAFE_INTEGER - 1),
      selection: raw.selection,
    }))
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[28], safe((payload) => {
    const raw = object(payload, ['conversationId', 'expectedRevision'])
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => routePreference.clear(context, {
      conversationId: text(raw.conversationId),
      expectedRevision: boundedInteger(raw.expectedRevision, 1, Number.MAX_SAFE_INTEGER - 1),
    }))
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[29], safe((payload) => {
    const raw = object(payload, ['branchId', 'answerId'])
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) =>
      workspace.hideAnswer(context, {
        branchId: text(raw.branchId),
        answerId: text(raw.answerId),
        hiddenAtMs: nowMs(),
      }))
  }))
  input.registerInvoke(GENERATION_V2_WORKSPACE_IPC_CHANNELS[30], safe((payload) => {
    const raw = object(payload, ['conversationId', 'cursor', 'limit'])
    const cursorRaw = raw.cursor === null ? null : object(raw.cursor, ['updatedAtMs', 'branchId'])
    return read.listBranchPage(
      text(raw.conversationId),
      cursorRaw === null ? null : Object.freeze({
        updatedAtMs: boundedInteger(cursorRaw.updatedAtMs, 0, Number.MAX_SAFE_INTEGER),
        branchId: text(cursorRaw.branchId),
      }),
      boundedInteger(raw.limit, 1, 50),
    )
  }))
  return GENERATION_V2_WORKSPACE_IPC_CHANNELS
}
