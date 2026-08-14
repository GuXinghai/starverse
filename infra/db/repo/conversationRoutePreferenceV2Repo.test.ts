import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest as applyGenerationV2Schema } from '../v2/testSchemaV2'
import {
  ConversationRoutePreferenceV2Repo,
  conversationRoutePreferenceSelectionV2Schema,
} from './conversationRoutePreferenceV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'

const root = path.resolve(process.cwd())

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, root)
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 2, 2)
  return db
}

const compatibleIntent = Object.freeze({
  schemaVersion: 2 as const,
  kind: 'openai_chat_compatible' as const,
  providerInstanceId: 'ocp_provider_12345678',
  modelId: 'vendor/model',
})

describe('ConversationRoutePreferenceV2Repo', () => {
  it('round-trips native selection and compatible current intent with monotonic CAS', () => {
    const db = createDb()
    try {
      const repo = new ConversationRoutePreferenceV2Repo(db, () => 10)
      expect(repo.get('conversation:1')).toBeNull()
      const native = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => repo.upsert(context, {
        conversationId: 'conversation:1', expectedRevision: 0,
        selection: { schemaVersion: 1, kind: 'provider_model', providerId: 'deepseek', modelId: 'deepseek-chat' },
      }))
      expect(native).toEqual({ conversationId: 'conversation:1', revision: 1,
        selection: { schemaVersion: 1, kind: 'provider_model', providerId: 'deepseek', modelId: 'deepseek-chat' } })

      const compatible = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => repo.upsert(context, {
        conversationId: 'conversation:1', expectedRevision: 1,
        selection: compatibleIntent,
      }))
      expect(compatible).toEqual({ conversationId: 'conversation:1', revision: 2,
        selection: compatibleIntent })
      expect(repo.get('conversation:1')).toEqual(compatible)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => repo.upsert(context, {
        conversationId: 'conversation:1', expectedRevision: 1, selection: native.selection,
      }))).toThrow('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_CONFLICT')

      expect(runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => repo.clear(context, {
        conversationId: 'conversation:1', expectedRevision: 2,
      }))).toBeNull()
      expect(repo.get('conversation:1')).toBeNull()
    } finally { db.close() }
  })

  it('requires authority context and rejects unknown fields, plaintext auth, and invalid provider ids', () => {
    const db = createDb()
    try {
      const repo = new ConversationRoutePreferenceV2Repo(db)
      expect(() => repo.upsert({ trust: 'generation_v2_authority_transaction_context' }, {
        conversationId: 'conversation:1', expectedRevision: 0,
        selection: { schemaVersion: 1, kind: 'provider_model', providerId: 'deepseek', modelId: 'model' },
      })).toThrow('GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT')
      expect(conversationRoutePreferenceSelectionV2Schema.safeParse({
        schemaVersion: 1, kind: 'provider_model', providerId: 'unknown', modelId: 'model',
      }).success).toBe(false)
      expect(conversationRoutePreferenceSelectionV2Schema.safeParse({
        schemaVersion: 1, kind: 'provider_model', providerId: 'deepseek', modelId: 'model', credential: 'secret',
      }).success).toBe(false)
      expect(conversationRoutePreferenceSelectionV2Schema.safeParse({ ...compatibleIntent,
        endpointRevisionId: 'ocp_endpoint_12345678' }).success).toBe(false)
      expect(conversationRoutePreferenceSelectionV2Schema.safeParse({ ...compatibleIntent,
        providerName: 'Historical display name' }).success).toBe(false)
      expect(conversationRoutePreferenceSelectionV2Schema.safeParse({ ...compatibleIntent,
        extraBody: { authorization: 'Bearer plaintext' } }).success).toBe(false)
      expect(conversationRoutePreferenceSelectionV2Schema.safeParse({ ...compatibleIntent,
        auth: 'secret' }).success).toBe(false)
    } finally { db.close() }
  })

  it('cascades with its owning conversation and guards direct non-CAS updates', () => {
    const db = createDb()
    try {
      const repo = new ConversationRoutePreferenceV2Repo(db)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => repo.upsert(context, {
        conversationId: 'conversation:1', expectedRevision: 0,
        selection: { schemaVersion: 1, kind: 'provider_model', providerId: 'openrouter', modelId: 'openrouter/auto' },
      }))
      expect(() => db.prepare(`UPDATE conversation_route_preference_v2
        SET selection_json=selection_json,revision=revision WHERE conversation_id='conversation:1'`).run())
        .toThrow('GENERATION_V2_CONVERSATION_ROUTE_PREFERENCE_UPDATE_INVALID')
      db.prepare("DELETE FROM conversation_v2 WHERE conversation_id='conversation:1'").run()
      expect(repo.get('conversation:1')).toBeNull()
    } finally { db.close() }
  })
})
