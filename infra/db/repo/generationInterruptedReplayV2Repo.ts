import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestV2 } from '../../../src/core/generation-v2/compiler/stableSerialize'
import { projectInterruptedCheckpointReplayV1, type InterruptedNativeSnapshotV1, type InterruptedProtocolV1 } from '../../../src/core/generation-v2/providers/interruptedReplayV1'
import { createLmStudioTerminalCheckpointV1 } from '../../../src/core/generation-v2/providers/lmstudio-openresponses/terminalCheckpointV1'
import { loadInterruptedReplayJsonV2, storeInterruptedReplayJsonV2 } from './interruptedReplayStorageV2'
import { assertGenerationV2AuthorityTransactionContextV2, type GenerationV2AuthorityTransactionContextV2 } from './generationV2AuthorityTransactionInternal'

const hash = (json: string) => createHash('sha256').update(json).digest('hex')
function invalid(): never { throw new Error('GENERATION_V2_INTERRUPTED_REPLAY_INVALID') }
type Row = Record<string, unknown>

/** Main-process-only native facts. These never enter renderer reasoning projections. */
export class GenerationInterruptedReplayV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  hasInterruptedTurn(answerRootId: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM message_v2 WHERE message_id=? AND role='assistant' AND status IN ('cancelled','failed')").get(answerRootId))
  }

  /** Local protocols retain received wire facts without pretending unfinished items are complete. */
  insertLocalCheckpoint(context: GenerationV2AuthorityTransactionContextV2, input: {
    answerRootId: string; operationId: string; requestSequence: number
    protocol: 'generic_local' | 'ollama' | 'openai_compatible' | 'lmstudio'
    requestBody: Readonly<Record<string, unknown>>; wireEvents: readonly unknown[]; terminalResult?: unknown
  }): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const row = this.db.prepare(`SELECT q.body_text AS question,b.body_text AS body,r.provider_id AS providerId
      FROM generation_operation_v2 o JOIN message_body_v2 q ON q.message_id=o.question_id
      JOIN message_body_v2 b ON b.message_id=o.target_answer_id JOIN generation_request_v2 r
      ON r.operation_id=o.operation_id AND r.request_sequence=? WHERE o.operation_id=? AND o.target_answer_id=?`)
      .get(input.requestSequence, input.operationId, input.answerRootId) as Row | undefined
    if (typeof row?.question !== 'string' || typeof row.body !== 'string' || row.providerId !== input.protocol) invalid()
    const question = input.protocol === 'lmstudio' ? { role: 'user', content: [{ type: 'input_text', text: row.question }] }
      : { role: 'user', content: row.question }
    if (input.terminalResult !== undefined && input.protocol !== 'lmstudio') invalid()
    const assistant = row.body && input.terminalResult === undefined ? [input.protocol === 'lmstudio'
      ? { role: 'user', content: [{ type: 'input_text', text: `[Prior interrupted assistant response]\n${row.body}` }] }
      : { role: 'assistant', content: row.body }] : []
    const json = stableSerializeProviderRequestV2({ schemaVersion: 1, protocol: input.protocol,
      native: input.terminalResult === undefined ? { wireEvents: input.wireEvents, complete: false }
        : createLmStudioTerminalCheckpointV1(input.wireEvents, input.terminalResult), replay: [question, ...assistant],
      responseLength: assistant.length, thinking: input.requestBody.think ?? null })
    const snapshotHash = hash(json)
    const storedJson = storeInterruptedReplayJsonV2(this.db, input, json, snapshotHash)
    this.db.prepare(`INSERT INTO generation_interrupted_replay_v2
      (answer_root_id,operation_id,request_sequence,snapshot_json,snapshot_hash) VALUES(?,?,?,?,?)`)
      .run(input.answerRootId, input.operationId, input.requestSequence, storedJson, snapshotHash)
  }

  insert(context: GenerationV2AuthorityTransactionContextV2, input: {
    answerRootId: string; operationId: string; requestSequence: number; protocol: InterruptedProtocolV1
    requestBody: Readonly<Record<string, unknown>>; native: InterruptedNativeSnapshotV1
  }): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const row = this.db.prepare(`SELECT q.body_text AS question FROM generation_operation_v2 o
      JOIN message_body_v2 q ON q.message_id=o.question_id WHERE o.operation_id=? AND o.target_answer_id=?`)
      .get(input.operationId, input.answerRootId) as Row | undefined
    if (typeof row?.question !== 'string') invalid()
    const raw = input.protocol === 'openai_responses' ? input.requestBody.input
      : input.protocol === 'gemini' ? input.requestBody.contents : input.requestBody.messages
    if (!Array.isArray(raw)) invalid()
    // Tool result messages may also have role=user. Match the actual question, not just the role.
    let start = -1
    const matches = (text: unknown) => text === row.question || typeof text === 'string' && text.startsWith(`${row.question}\n\n[Prior attachment `)
    raw.forEach((item: Row, index: number) => {
      if (item.role === 'user' && (matches(item.content) ||
        Array.isArray(item.content) && item.content.some((part: Row) => ['input_text', 'text'].includes(part.type as string) && matches(part.text)) ||
        Array.isArray(item.parts) && item.parts.some((part: Row) => part.thought !== true && matches(part.text)))) start = index
    })
    if (start < 0) invalid()
    const replay = raw.slice(start)
    const json = stableSerializeProviderRequestV2({ schemaVersion: 1, protocol: input.protocol,
      native: input.native, replay, replayProjection: 'native_assistant_v1', responseLength: 0,
      thinking: input.requestBody.thinking ?? null })
    const snapshotHash = hash(json)
    const storedJson = storeInterruptedReplayJsonV2(this.db, input, json, snapshotHash)
    this.db.prepare(`INSERT INTO generation_interrupted_replay_v2
      (answer_root_id,operation_id,request_sequence,snapshot_json,snapshot_hash) VALUES(?,?,?,?,?)`)
      .run(input.answerRootId, input.operationId, input.requestSequence, storedJson, snapshotHash)
  }

  load(context: GenerationV2AuthorityTransactionContextV2, answerRootId: string, protocol: InterruptedProtocolV1, requireCompleteReasoning = false): readonly unknown[] | null {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const row = this.db.prepare(`SELECT a.status,o.state,o.operation_id AS operationId,
      q.body_text AS question,b.body_text AS body,s.snapshot_json AS json,s.snapshot_hash AS hash,
      s.request_sequence AS requestSequence,r.provider_id AS providerId,
      json_extract(g.canonical_json,'$.semanticIntent.reasoning.mode') AS reasoningMode
      FROM message_v2 a JOIN generation_operation_v2 o ON o.target_answer_id=a.message_id
      JOIN message_body_v2 q ON q.message_id=o.question_id JOIN message_body_v2 b ON b.message_id=a.message_id
      JOIN generation_request_v2 r ON r.operation_id=o.operation_id AND r.request_sequence=1
      JOIN assistant_generation_snapshot_v2 g ON g.operation_id=o.operation_id
      LEFT JOIN generation_interrupted_replay_v2 s ON s.answer_root_id=a.message_id AND s.operation_id=o.operation_id
        AND s.request_sequence=(SELECT MAX(request_sequence) FROM generation_interrupted_replay_v2 WHERE answer_root_id=a.message_id)
      WHERE a.message_id=?`).get(answerRootId) as Row | undefined
    if (!row || !['cancelled', 'failed'].includes(row.status as string)) return null
    if (row.state !== row.status || typeof row.question !== 'string' || typeof row.body !== 'string' ||
        row.providerId !== ({ openai_responses: 'openai_responses', openrouter: 'openrouter', anthropic: 'anthropic', deepseek: 'deepseek', gemini: 'google_ai_studio' } as const)[protocol]) invalid()
    if (row.json !== null) {
      if (typeof row.json !== 'string' || typeof row.hash !== 'string') invalid()
      const json = loadInterruptedReplayJsonV2(this.db, { operationId: row.operationId as string,
        answerRootId, requestSequence: row.requestSequence as number }, row.json, row.hash)
      const snapshot = JSON.parse(json) as Row
      if (snapshot.schemaVersion !== 1 || snapshot.protocol !== protocol || !Array.isArray(snapshot.replay) ||
          !Number.isSafeInteger(snapshot.responseLength) || (snapshot.responseLength as number) < 0 ||
          (snapshot.responseLength as number) > snapshot.replay.length || !snapshot.native || typeof snapshot.native !== 'object') invalid()
      const projected = snapshot.replayProjection === 'native_assistant_v1'
        ? projectInterruptedCheckpointReplayV1({ protocol, native: snapshot.native as InterruptedNativeSnapshotV1,
          prefix: snapshot.replay, answerRootId })
        : { replay: snapshot.replay, responseLength: snapshot.responseLength as number }
      if (snapshot.replayProjection !== undefined && snapshot.replayProjection !== 'native_assistant_v1') invalid()
      if (protocol === 'deepseek' && requireCompleteReasoning && row.reasoningMode === 'enabled' &&
          (snapshot.native as InterruptedNativeSnapshotV1).complete !== true) {
        return projected.replay.slice(0, projected.replay.length - projected.responseLength)
      }
      return projected.replay
    }
    // Existing cancelled records predate native checkpoints. Only their persisted text is authoritative.
    if (protocol === 'openai_responses') return [
      { role: 'user', content: [{ type: 'input_text', text: row.question }] },
      ...(row.body ? [{ type: 'message', role: 'assistant', id: `msg_interrupted_${answerRootId.replace(/[^a-z0-9]/giu, '')}`,
        status: 'incomplete', content: [{ type: 'output_text', text: row.body, annotations: [] }] }] : []),
    ]
    if (protocol === 'gemini') return [{ role: 'user', parts: [{ text: row.question }] },
      ...(row.body ? [{ role: 'model', parts: [{ text: row.body }] }] : [])]
    return [{ role: 'user', content: row.question }, ...(row.body && !(protocol === 'deepseek' && requireCompleteReasoning && row.reasoningMode === 'enabled') ? [{ role: 'assistant', content: row.body }] : [])]
  }
}
