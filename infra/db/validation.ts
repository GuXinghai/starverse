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
  ids: z.array(z.string().min(1)).min(1).max(100) // 闄愬埗涓€娆℃渶澶氬垹闄?100 涓?})
})

// ========== Usage Log & Stats Schemas ==========

export const LogUsageSchema = z.object({
  project_id: z.string().nullable().optional(),
  convo_id: z.string().nullable().optional(),
  provider: z.string(),
  model: z.string(),
  tokens_input: z.number().int().nonnegative().default(0),
  tokens_output: z.number().int().nonnegative().default(0),
  tokens_cached: z.number().int().nonnegative().default(0),
  tokens_reasoning: z.number().int().nonnegative().default(0),
  cost: z.number().nonnegative().default(0.0),
  request_id: z.string().nullable().optional(),
  attempt: z.number().int().positive().optional(),
  duration_ms: z.number().int().nonnegative().default(0),
  ttft_ms: z.number().int().nonnegative().nullable().optional(),
  timestamp: z.number().int(),
  status: z.enum(['success', 'error', 'canceled']).default('success'),
  error_code: z.string().optional().nullable(),
  meta: z.record(z.any()).nullable().optional()
})

export const GetProjectUsageStatsSchema = z.object({
  projectId: z.string(),
  days: z.number().int().positive().optional()
})

export const GetConvoUsageStatsSchema = z.object({
  convoId: z.string(),
  days: z.number().int().positive().optional()
})

export const GetModelUsageStatsSchema = z.object({
  model: z.string(),
  days: z.number().int().positive().optional()
})

export const GetDateRangeUsageStatsSchema = z.object({
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative()
})

const metaFilterSchema = z
  .object({
    feature: z.string().optional().nullable(),
    entry: z.string().optional().nullable(),
    experiment_id: z.string().optional().nullable(),
    user_id: z.string().optional().nullable()
  })
  .partial()

export const UsageAggregateSchema = z.object({
  filters: z
    .object({
      projectId: z.string().nullable().optional(),
      convoId: z.string().nullable().optional(),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      status: z.enum(['success', 'error', 'canceled']).nullable().optional(),
      errorCode: z.string().nullable().optional(),
      startTime: z.number().int().nonnegative().optional(),
      endTime: z.number().int().nonnegative().optional(),
      meta: metaFilterSchema.optional()
    })
    .optional(),
  bucket: z.enum(['hour', 'day', 'week']).nullable().optional(),
  groupBy: z
    .array(
      z.enum([
        'project_id',
        'convo_id',
        'provider',
        'model',
        'status',
        'error_code',
        'meta.feature',
        'meta.entry',
        'meta.experiment_id',
        'meta.user_id'
      ])
    )
    .optional(),
  timezoneOffsetMinutes: z.number().int().optional(),
  limit: z.number().int().positive().max(500).optional(),
  offset: z.number().int().nonnegative().optional(),
  order: z.enum(['asc', 'desc']).optional()
})

export const UsageDrillDownSchema = z.object({
  filters: z
    .object({
      projectId: z.string().nullable().optional(),
      convoId: z.string().nullable().optional(),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      status: z.enum(['success', 'error', 'canceled']).nullable().optional(),
      errorCode: z.string().nullable().optional(),
      startTime: z.number().int().nonnegative().optional(),
      endTime: z.number().int().nonnegative().optional(),
      meta: metaFilterSchema.optional()
    })
    .optional(),
  limit: z.number().int().positive().max(200).optional(),
  sort: z.enum(['timestamp', 'cost', 'duration_ms']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  cursor: z
    .object({
      value: z.number().int().nonnegative(),
      id: z.string().min(1)
    })
    .optional()
})

const layoutWidgetSchema = z.object({
  id: z.string().min(1),
  visible: z.boolean().default(true),
  order: z.number().int().nonnegative()
})

const dashboardFiltersSchema = z.object({
  days: z.number().int().positive().optional(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  status: z.enum(['success', 'error', 'canceled']).nullable().optional(),
  projectId: z.string().nullable().optional()
})

export const SaveDashboardPrefSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1),
  viewId: z.string().min(1),
  name: z.string().min(1).max(200),
  layout: z.array(layoutWidgetSchema).min(1),
  filters: dashboardFiltersSchema.optional().nullable(),
  isDefault: z.boolean().optional()
})

export const DeleteDashboardPrefSchema = z.object({
  userId: z.string().min(1),
  viewId: z.string().min(1)
})

export const GetDashboardPrefsSchema = z.object({
  userId: z.string().min(1)
})
