import { z } from 'zod'
import { sanitizeForIpc } from '@/next/ipc/sanitizeForIpc'

type Result<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: string }>

function bridge() {
  const value = window.generationV2?.workspace
  if (!value) throw new Error('GENERATION_V2_WORKSPACE_BRIDGE_UNAVAILABLE')
  return value
}

function unwrap<T>(raw: unknown): T {
  const result = raw as Result<T>
  if (!result || result.ok !== true) {
    throw new Error(result && 'code' in result ? result.code : 'GENERATION_V2_WORKSPACE_COMMAND_FAILED')
  }
  return result.value
}

const lifecycleSchema = z.object({
  startupNavigation: z.enum(['open_new', 'restore_last_formal', 'projects_only']),
  startupTemplateReset: z.object({ modelConfig: z.boolean(), draftAttachments: z.boolean() }).strict(),
  postSendTemplateReset: z.enum(['reset_all', 'preserve_model_config']),
}).strict()

const conversationSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  branchId: z.string().min(1),
  title: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  meta: z.record(z.unknown()).nullable(),
  systemKey: z.literal('new_template'),
  templateRevision: z.number().int().nonnegative(),
}).strict()

const attachmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('managed_file') }).passthrough(),
  z.object({ kind: z.literal('url_reference') }).passthrough(),
])

const draftSchema = z.object({
  conversationId: z.string().min(1),
  draftText: z.string(),
  draftMode: z.enum(['compose', 'edit']),
  editingSourceQuestionId: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  updatedAtMs: z.number().int().nonnegative(),
  attachments: z.array(attachmentSchema),
}).strict()

const snapshotSchema = z.object({
  conversation: conversationSchema,
  draft: draftSchema,
  settings: lifecycleSchema,
}).strict()

export type SystemChatTemplateSnapshot = z.infer<typeof snapshotSchema>
export type NewChatLifecycleSettings = z.infer<typeof lifecycleSchema>

export async function getSystemChatTemplate(): Promise<SystemChatTemplateSnapshot> {
  return snapshotSchema.parse(unwrap(await bridge().getSystemTemplate()))
}

export async function updateSystemChatTemplateConfig(input: Readonly<{
  templateConversationId: string
  expectedTemplateRevision: number
  meta: Record<string, unknown> | null
}>): Promise<SystemChatTemplateSnapshot> {
  return snapshotSchema.parse(unwrap(await bridge().updateSystemTemplateConfig(sanitizeForIpc(input))))
}

export async function resetSystemChatTemplate(input: Readonly<{
  templateConversationId: string
  expectedTemplateRevision: number
  resetModelConfig: boolean
  resetDraftAttachments: boolean
}>): Promise<SystemChatTemplateSnapshot> {
  return snapshotSchema.parse(unwrap(await bridge().resetSystemTemplate(sanitizeForIpc(input))))
}

export async function getNewChatLifecycleSettings(): Promise<NewChatLifecycleSettings> {
  return (await getSystemChatTemplate()).settings
}

export async function setNewChatLifecycleSettings(value: NewChatLifecycleSettings): Promise<void> {
  lifecycleSchema.parse(unwrap(await bridge().setNewChatLifecycle(sanitizeForIpc(lifecycleSchema.parse(value)))))
}

export async function getLastFormalConversationId(): Promise<string | null> {
  const raw = unwrap<Readonly<{ conversationId: unknown }>>(await bridge().getLastFormalConversation())
  if (raw.conversationId === null) return null
  if (typeof raw.conversationId !== 'string' || raw.conversationId.trim() !== raw.conversationId || !raw.conversationId) {
    throw new Error('GENERATION_V2_SYSTEM_TEMPLATE_STATE_INVALID')
  }
  return raw.conversationId
}

export async function setLastFormalConversationId(conversationId: string | null): Promise<void> {
  unwrap(await bridge().setLastFormalConversation(conversationId))
}
