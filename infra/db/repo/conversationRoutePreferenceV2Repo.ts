import type BetterSqlite3 from 'better-sqlite3'
import { z } from 'zod'
import type { RuntimeProviderKey } from '../../../src/next/provider/runtimeSelection'
import {
  compatibleConfigurationSelectionSchema,
  type CompatibleConfigurationSelection,
} from '../../../src/next/provider/openai-chat-compatible/ui/compatibleConfigurationSelection'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

const runtimeProviderKeySchema = z.enum([
  'openrouter',
  'openai_responses',
  'google_ai_studio',
  'anthropic_messages',
  'deepseek',
  'lm_studio',
  'ollama_local',
  'local_endpoint',
]) satisfies z.ZodType<RuntimeProviderKey>

const nativeConversationRoutePreferenceSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('provider_model'),
  providerId: runtimeProviderKeySchema,
  modelId: z.string().trim().min(1).max(512),
}).strict()

const compatibleConversationRoutePreferenceSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('openai_chat_compatible'),
  selection: compatibleConfigurationSelectionSchema,
}).strict()

export const conversationRoutePreferenceSelectionV2Schema = z.discriminatedUnion('kind', [
  nativeConversationRoutePreferenceSchema,
  compatibleConversationRoutePreferenceSchema,
])

export type ConversationRoutePreferenceSelectionV2 =
  | Readonly<{ schemaVersion: 1; kind: 'provider_model'; providerId: RuntimeProviderKey; modelId: string }>
  | Readonly<{ schemaVersion: 1; kind: 'openai_chat_compatible'; selection: CompatibleConfigurationSelection }>

export type ConversationRoutePreferenceSnapshotV2 = Readonly<{
  conversationId: string
  revision: number
  selection: ConversationRoutePreferenceSelectionV2
}>

export class ConversationRoutePreferenceV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_INPUT_INVALID'
    | 'GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_NOT_FOUND'
    | 'GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_CONFLICT'
    | 'GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_STATE_INVALID') {
    super(code)
    this.name = 'ConversationRoutePreferenceV2RepoError'
  }
}

type PreferenceRow = Readonly<{
  conversation_id: unknown
  revision: unknown
  selection_kind: unknown
  selection_json: unknown
}>

function conversationId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 || value.trim() !== value) {
    throw new ConversationRoutePreferenceV2RepoError('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_INPUT_INVALID')
  }
  return value
}

function revision(value: unknown, allowZero = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < (allowZero ? 0 : 1) ||
      (value as number) >= Number.MAX_SAFE_INTEGER) {
    throw new ConversationRoutePreferenceV2RepoError('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_INPUT_INVALID')
  }
  return value as number
}

function decodeSelection(value: unknown): ConversationRoutePreferenceSelectionV2 {
  const parsed = conversationRoutePreferenceSelectionV2Schema.safeParse(value)
  if (!parsed.success) {
    throw new ConversationRoutePreferenceV2RepoError('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_INPUT_INVALID')
  }
  return Object.freeze(parsed.data) as ConversationRoutePreferenceSelectionV2
}

export class ConversationRoutePreferenceV2Repo {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new ConversationRoutePreferenceV2RepoError('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_STATE_INVALID')
    }
  }

  get(conversationIdValue: string): ConversationRoutePreferenceSnapshotV2 | null {
    const id = conversationId(conversationIdValue)
    const row = this.db.prepare(`SELECT conversation_id,revision,selection_kind,selection_json
      FROM conversation_route_preference_v2 WHERE conversation_id=?`).get(id) as PreferenceRow | undefined
    if (!row) return null
    if (row.conversation_id !== id || !Number.isSafeInteger(row.revision) || (row.revision as number) < 1 ||
        typeof row.selection_kind !== 'string' || typeof row.selection_json !== 'string') {
      throw new ConversationRoutePreferenceV2RepoError('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_STATE_INVALID')
    }
    let raw: unknown
    try { raw = JSON.parse(row.selection_json) } catch {
      throw new ConversationRoutePreferenceV2RepoError('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_STATE_INVALID')
    }
    const parsed = conversationRoutePreferenceSelectionV2Schema.safeParse(raw)
    if (!parsed.success || parsed.data.kind !== row.selection_kind) {
      throw new ConversationRoutePreferenceV2RepoError('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_STATE_INVALID')
    }
    return Object.freeze({ conversationId: id, revision: row.revision as number,
      selection: Object.freeze(parsed.data) as ConversationRoutePreferenceSelectionV2 })
  }

  upsert(
    context: GenerationV2AuthorityTransactionContextV2,
    input: Readonly<{ conversationId: string; expectedRevision: number; selection: unknown }>,
  ): ConversationRoutePreferenceSnapshotV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const id = conversationId(input.conversationId)
    const expected = revision(input.expectedRevision, true)
    const selection = decodeSelection(input.selection)
    const json = JSON.stringify(selection)
    const now = this.readTime()
    const result = expected === 0
      ? this.db.prepare(`INSERT INTO conversation_route_preference_v2
          (conversation_id,revision,selection_kind,selection_json,created_at_ms,updated_at_ms)
          VALUES (?,1,?,?,?,?) ON CONFLICT(conversation_id) DO NOTHING`)
        .run(id, selection.kind, json, now, now)
      : this.db.prepare(`UPDATE conversation_route_preference_v2 SET revision=revision+1,
          selection_kind=?,selection_json=?,updated_at_ms=? WHERE conversation_id=? AND revision=?`)
        .run(selection.kind, json, now, id, expected)
    if (result.changes !== 1) {
      throw new ConversationRoutePreferenceV2RepoError('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_CONFLICT')
    }
    const snapshot = this.get(id)
    if (!snapshot) {
      throw new ConversationRoutePreferenceV2RepoError('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_STATE_INVALID')
    }
    return snapshot
  }

  clear(
    context: GenerationV2AuthorityTransactionContextV2,
    input: Readonly<{ conversationId: string; expectedRevision: number }>,
  ): null {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const id = conversationId(input.conversationId)
    const expected = revision(input.expectedRevision)
    const result = this.db.prepare(`DELETE FROM conversation_route_preference_v2
      WHERE conversation_id=? AND revision=?`).run(id, expected)
    if (result.changes !== 1) {
      throw new ConversationRoutePreferenceV2RepoError('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_CONFLICT')
    }
    return null
  }

  private readTime(): number {
    const value = this.nowMs()
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ConversationRoutePreferenceV2RepoError('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_INPUT_INVALID')
    }
    return value
  }
}
