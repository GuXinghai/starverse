import { z } from 'zod'
import { sanitizeForIpc } from '@/next/ipc/sanitizeForIpc'

type DbBridge = Readonly<{ invoke: (method: string, params?: unknown) => Promise<unknown> }>
const bridge = (): DbBridge => {
  const value = (globalThis as any).dbBridge as DbBridge | undefined
  if (!value?.invoke) throw new Error('Missing dbBridge')
  return value
}

const lifecycleSchema = z.object({
  startupNavigation: z.enum(['open_new', 'restore_last_formal', 'projects_only']),
  startupTemplateReset: z.object({ modelConfig: z.boolean(), draftAttachments: z.boolean() }).strict(),
  postSendTemplateReset: z.enum(['reset_all', 'preserve_model_config']),
}).strict()

const conversationSchema = z.object({
  id: z.string().min(1), projectId: z.string().min(1), title: z.string(),
  createdAt: z.number(), updatedAt: z.number(), meta: z.record(z.unknown()).nullable(),
  systemKey: z.literal('new_template'), templateRevision: z.number().int().nonnegative(),
}).strict()
const attachmentSchema = z.object({
  id: z.string(), conversationId: z.string(), assetId: z.string(), attachmentOrder: z.number(),
}).passthrough()
const draftSchema = z.object({
  conversationId: z.string(), draftText: z.string(), draftMode: z.enum(['compose', 'edit']),
  editingSourceMessageId: z.string().nullable(), attachedAssetIds: z.array(z.string()),
  attachments: z.array(attachmentSchema), updatedAt: z.number(),
}).passthrough()
const snapshotSchema = z.object({ conversation: conversationSchema, draft: draftSchema, settings: lifecycleSchema }).strict()
const materializedSchema = z.object({
  ok: z.literal(true), idempotent: z.boolean(), templateConversationId: z.string(), templateRevision: z.number(),
  convoId: z.string(), branchId: z.string(), questionId: z.string(), questionSeq: z.number(),
  assistantId: z.string(), assistantSeq: z.number(),
  routeProvenanceId: z.string().optional(),
}).passthrough()

export type SystemChatTemplateSnapshot = z.infer<typeof snapshotSchema>
export type NewChatLifecycleSettings = z.infer<typeof lifecycleSchema>

export async function getSystemChatTemplate(): Promise<SystemChatTemplateSnapshot> {
  return snapshotSchema.parse(await bridge().invoke('systemChatTemplate.get'))
}

export async function updateSystemChatTemplateConfig(input: Readonly<{
  templateConversationId: string; expectedTemplateRevision: number; meta: Record<string, unknown> | null
}>): Promise<SystemChatTemplateSnapshot> {
  return snapshotSchema.parse(await bridge().invoke('systemChatTemplate.updateConfig', sanitizeForIpc(input)))
}

export async function resetSystemChatTemplate(input: Readonly<{
  templateConversationId: string; expectedTemplateRevision: number
  resetModelConfig: boolean; resetDraftAttachments: boolean
}>): Promise<SystemChatTemplateSnapshot> {
  return snapshotSchema.parse(await bridge().invoke('systemChatTemplate.reset', sanitizeForIpc(input)))
}

export async function materializeSystemChatTemplate(input: Readonly<{
  templateConversationId: string; expectedTemplateRevision: number; requestId: string
  userMeta?: Record<string, unknown> | null; sentAssetIds?: string[]; dfcAttachmentSendSnapshots?: unknown[]
  compatibleRoute?: Readonly<{
    route: Readonly<{
      routeProvenanceId: string; requestId: string; providerInstanceId: string; modelId: string; createdAtMs: number
    }>
    pins: Readonly<{
      providerInstanceId: string; modelId: string; endpointRevisionId: string; credentialVersionRef: string | null
      requestProfileId: string; requestProfileVersion: number; responseProfileId: string; responseProfileVersion: number
      reasoningMappingId: string; reasoningMappingVersion: number; inlinePolicyId: string; inlinePolicyVersion: number
    }>
  }>
}>) {
  return materializedSchema.parse(await bridge().invoke('systemChatTemplate.materializeAndBeginTurn', sanitizeForIpc(input)))
}

export async function getNewChatLifecycleSettings(): Promise<NewChatLifecycleSettings> {
  const raw = await bridge().invoke('settings.getNewChatLifecycle')
  return lifecycleSchema.parse((raw as any)?.value)
}

export async function setNewChatLifecycleSettings(value: NewChatLifecycleSettings): Promise<void> {
  await bridge().invoke('settings.setNewChatLifecycle', sanitizeForIpc({ value: lifecycleSchema.parse(value) }))
}

export async function getLastFormalConversationId(): Promise<string | null> {
  const raw = await bridge().invoke('settings.getLastFormalConversation') as { conversationId?: unknown }
  const value = typeof raw?.conversationId === 'string' ? raw.conversationId.trim() : ''
  return value || null
}

export async function setLastFormalConversationId(conversationId: string | null): Promise<void> {
  await bridge().invoke('settings.setLastFormalConversation', sanitizeForIpc({ conversationId }))
}
