import { z, type ZodType } from 'zod'
import type {
  AppendMessageInput,
  AppendMessageDeltaInput,
  CreateConvoInput,
  SaveConvoInput,
  SaveConvoWithMessagesInput,
  DeleteConvoInput,
  CreateProjectInput,
  SaveProjectInput,
  DeleteProjectInput,
  ListProjectParams,
  FulltextQueryParams,
  ListConvoParams,
  ListMessageParams,
  ReplaceMessagesInput,
  MessageSnapshot,
  BatchDeleteInput
} from './types'

export const jsonSchema = z.record(z.any())

// ========== Project Schemas ==========

export const CreateProjectSchema: ZodType<CreateProjectInput> = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  createdAt: z.number().int().optional(),
  meta: jsonSchema.optional().nullable()
})

export const SaveProjectSchema: ZodType<SaveProjectInput> = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
  meta: jsonSchema.optional().nullable()
})

export const DeleteProjectSchema: ZodType<DeleteProjectInput> = z.object({
  id: z.string().min(1)
})

export const ListProjectSchema: ZodType<ListProjectParams> = z
  .object({
    limit: z.number().int().positive().max(1000).optional(),
    offset: z.number().int().nonnegative().optional(),
    order: z.enum(['updatedAt', 'createdAt', 'name']).optional()
  })
  .partial()

export const FindProjectByIdSchema = z.object({
  id: z.string().min(1)
})

export const FindProjectByNameSchema = z.object({
  name: z.string().min(1)
})

export const CountConversationsSchema = z.object({
  projectId: z.string().min(1)
})

// ========== Conversation Schemas ==========

export const CreateConvoSchema: ZodType<CreateConvoInput> = z.object({
  id: z.string().min(1).optional(),
  projectId: z.string().min(1).optional().nullable(),
  title: z.string().min(1),
  meta: jsonSchema.optional().nullable()
})

export const ListConvoSchema: ZodType<ListConvoParams> = z
  .object({
    projectId: z.string().min(1).optional().nullable(),
    limit: z.number().int().positive().max(10000).optional(),
    offset: z.number().int().nonnegative().optional(),
    order: z.enum(['updatedAt', 'createdAt']).optional()
  })
  .partial()

export const AppendMessageSchema: ZodType<AppendMessageInput> = z.object({
  convoId: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  body: z.string(),
  createdAt: z.number().int().optional(),
  seq: z.number().int().positive().optional(),
  meta: jsonSchema.optional().nullable()
})

export const AppendMessageDeltaSchema: ZodType<AppendMessageDeltaInput> = z.object({
  convoId: z.string().min(1),
  seq: z.number().int().positive(),
  appendBody: z.string().min(1)
})

export const SaveConvoSchema: ZodType<SaveConvoInput> = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1).optional().nullable(),
  title: z.string().min(1),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
  meta: jsonSchema.optional().nullable()
})

export const DeleteConvoSchema: ZodType<DeleteConvoInput> = z.object({
  id: z.string().min(1)
})

const MessageSnapshotSchema: ZodType<MessageSnapshot> = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  body: z.string(),
  createdAt: z.number().int().optional(),
  seq: z.number().int().positive().optional(),
  meta: jsonSchema.optional().nullable()
})

export const SaveConvoWithMessagesSchema: ZodType<SaveConvoWithMessagesInput> = z.object({
  convo: SaveConvoSchema,
  messages: z.array(MessageSnapshotSchema)
})

export const ArchiveConvoSchema = z.object({
  id: z.string().min(1)
})

export const RestoreConvoSchema = z.object({
  id: z.string().min(1)
})

export const ListArchivedSchema = z
  .object({
    limit: z.number().int().positive().max(1000).optional(),
    offset: z.number().int().nonnegative().optional()
  })
  .partial()

// ========== Message Schemas ==========

export const ListMessageSchema: ZodType<ListMessageParams> = z.object({
  convoId: z.string().min(1),
  fromSeq: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(500).optional(),
  direction: z.enum(['asc', 'desc']).optional()
})

export const ReplaceMessagesSchema: ZodType<ReplaceMessagesInput> = z.object({
  convoId: z.string().min(1),
  messages: z.array(MessageSnapshotSchema)
})

export const FulltextQuerySchema: ZodType<FulltextQueryParams> = z.object({
  query: z.string().min(1),
  projectId: z.string().min(1).optional().nullable(),
  tagIds: z.array(z.string().min(1)).optional(),
  after: z.number().int().optional(),
  before: z.number().int().optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
  highlight: z.boolean().optional()
})

// ========== Batch Operation Schemas ==========

export const BatchDeleteSchema: ZodType<BatchDeleteInput> = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100) // 限制一次最多删除 100 个
})
