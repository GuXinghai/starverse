import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import type { CompatibleHistoryReasoningReplay } from '../../../src/shared/provider/openai-chat-compatible/request/buildCompatibleChatRequest'
import { decodeAssistantAnswerGenerationSnapshotV2, type DecodedAssistantAnswerGenerationSnapshotV2 as Snapshot } from '../../../src/core/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { decodeGenerationIntentLayerV2, type AttachmentIntentV2 } from '../../../src/core/generation-v2/domain/generationIntentV2'
import { projectDecodedProviderBindingRecordV2 } from '../../../src/core/generation-v2/domain/providerBindingV2'
import { recordRequestAdaptationV2, restoreRequestAdaptationsV2, clearRequestAdaptationsV2, readRequestAdaptationV2 } from '../../../src/core/generation-v2/compiler/requestAdaptationV2'
import { createSemanticConsumptionLedgerV2 } from '../../../src/core/generation-v2/compiler/semanticConsumptionLedgerV2'
import { stableSerializeProviderRequestV2 } from '../../../src/core/generation-v2/compiler/stableSerialize'
import { classifyPortableHistoryReasoningV2 } from '../../../src/core/generation-v2/compiler/portableHistoryReasoningClassifierV2'
import { GENERATION_PORTABLE_HISTORY_RESERVED_BYTES_V1, generationPortableHistoryTargetMaxBytesV1 } from '../../../src/core/generation-v2/capacity/generationCapacityV1'
import { decodeOpenAIResponsesContinuationArtifactV2 } from '../../../src/core/generation-v2/providers/openai-responses/continuationArtifactV2'
import { decodeOpenRouterNativeHistoryArtifactV1 } from '../../../src/core/generation-v2/providers/openrouter/nativeMessagesV1'
import { decodeDeepSeekNativeHistoryArtifactV2 } from '../../../src/core/generation-v2/providers/deepseek/nativeMessagesV1'
import { decodeAnthropicNativeHistoryArtifactV1 } from '../../../src/core/generation-v2/providers/anthropic/nativeContentBlocksV1'
import { decodeGeminiGenerateContentNativeHistoryArtifactV1 } from '../../../src/core/generation-v2/providers/gemini/generateContentNativeHistoryV1'
import { decodeLmStudioOpenResponsesContinuationArtifactV1 } from '../../../src/core/generation-v2/providers/lmstudio-openresponses/continuationArtifactV1'
import { readLmStudioTerminalCheckpointV1 } from '../../../src/core/generation-v2/providers/lmstudio-openresponses/terminalCheckpointV1'
import { projectInterruptedCheckpointReplayV1, type InterruptedNativeSnapshotV1, type InterruptedProtocolV1 } from '../../../src/core/generation-v2/providers/interruptedReplayV1'
import { decodeOllamaNativeChatArtifactV1 } from '../../../src/core/generation-v2/providers/ollama-chat/nativeMessagesV1'
import { decodeGenericLocalOpenAIChatArtifactV1 } from '../../../src/core/generation-v2/providers/generic-local-openai-chat/nativeMessagesV1'
import { decodeOpenAIChatCompatibleNativeArtifactV2 } from '../../../src/core/generation-v2/providers/openai-chat-compatible/nativeMessagesV2'
import { AttachmentAssetV2Repo, type AttachmentAssetRevisionRepositoryFactV2 } from './attachmentAssetV2Repo'
import { GenerationContextProjectionV2Repo } from './generationContextProjectionV2Repo'
import { GenerationInterruptedReplayV2Repo } from './generationInterruptedReplayV2Repo'
import { loadNativeArtifactJsonV2 } from './nativeArtifactStorageV2'
import { loadInterruptedReplayJsonV2 } from './interruptedReplayStorageV2'
import { assertGenerationV2AuthorityTransactionContextV2, registerGenerationV2AuthorityTransactionParticipantV2, type GenerationV2AuthorityTransactionContextV2 as Context } from './generationV2AuthorityTransactionInternal'

type Json = Readonly<Record<string, unknown>>
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const array = (value: unknown): readonly Json[] => Array.isArray(value) ? value.map(object) : []
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
function invalid(): never { throw new Error('GENERATION_V2_PORTABLE_HISTORY_INVALID') }

// The bootstrap supplies the epoch lease-backed reader. No filesystem path is accepted here.
const readers = new WeakMap<BetterSqlite3.Database, (revision: AttachmentAssetRevisionRepositoryFactV2) => Uint8Array>()
export function registerGenerationHistoryByteReaderV2(db: BetterSqlite3.Database,
  read: (revision: AttachmentAssetRevisionRepositoryFactV2) => Uint8Array): () => void {
  readers.set(db, read)
  return () => { if (readers.get(db) === read) readers.delete(db) }
}

export function inspectRequestTextEncodingV2(db: BetterSqlite3.Database, revision: AttachmentAssetRevisionRepositoryFactV2): boolean | undefined {
  const reader = readers.get(db)
  if (!reader || !revision.blob.mime.startsWith('text/')) return undefined
  const bytes = reader(revision)
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true }
  catch { return false }
  finally { bytes.fill(0) }
}

export function readOpenAIInlineImageV2(db: BetterSqlite3.Database, context: Context,
  attachment: Extract<AttachmentIntentV2, { kind: 'managed_file' }>,
  options?: Readonly<{ requirePng: boolean }>): Readonly<{ type: 'input_image'; image_url: string }> {
  return new AttachmentAssetV2Repo(db).withSynchronousSnapshotReferenceAuthority(context, attachment, authority => {
    const revision = authority.revision
    const reader = readers.get(db)
    if (!reader || revision.assetKind !== 'image' || revision.blob.sizeBytes > Math.floor((4 * 1024 * 1024 - 256) * 3 / 4) ||
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(revision.blob.mime) ||
        (options?.requirePng && revision.blob.mime !== 'image/png')) invalid()
    const bytes = reader(revision)
    try { return Object.freeze({ type: 'input_image', image_url: `data:${revision.blob.mime};base64,${Buffer.from(bytes).toString('base64')}` }) }
    finally { bytes.fill(0) }
  })
}

function snapshot(db: BetterSqlite3.Database, operationId: string): Snapshot {
  const row = db.prepare('SELECT canonical_json AS json,snapshot_hash AS hash FROM assistant_generation_snapshot_v2 WHERE operation_id=?').get(operationId) as Json | undefined
  if (typeof row?.json !== 'string') invalid()
  const value = decodeAssistantAnswerGenerationSnapshotV2(JSON.parse(row.json))
  if (value.operationId.value !== operationId || value.snapshotHash.value !== row.hash) invalid()
  return value
}

function scope(value: Snapshot): string {
  const binding = projectDecodedProviderBindingRecordV2(value.providerBinding)
  // Model, endpoint, account, protocol and revisions all participate in native replay authority.
  return stableSerializeProviderRequestV2({ binding, providerConfiguration: JSON.parse(value.canonicalJson).providerConfiguration ?? { kind: 'none' } })
}

function textOf(item: Json): string {
  if (typeof item.content === 'string') return item.content
  return [...array(item.content), ...array(item.parts)].filter(part => part.thought !== true &&
    ['text', 'input_text', 'output_text', 'refusal', undefined].includes(part.type as string | undefined))
    .map(part => typeof part.text === 'string' ? part.text : typeof part.refusal === 'string' ? part.refusal : '').join('')
}

/** Decode with the owning codec; the stored artifact hash is semantic, not SHA(JSON). */
function nativeArtifact(row: Json): { items: readonly Json[]; hash: string; singleResponse: boolean; reasoningReplay: readonly CompatibleHistoryReasoningReplay[] } {
  if (typeof row.artifactJson !== 'string') invalid()
  const raw = JSON.parse(row.artifactJson)
  const kind = row.artifactKind
  let value: { artifactHash: string }; let items: readonly unknown[]; let singleResponse = false
  let reasoningReplay: readonly CompatibleHistoryReasoningReplay[] = []
  switch (kind) {
    case 'openai_responses_ordered_native_items_v2': { const v = decodeOpenAIResponsesContinuationArtifactV2(raw); value = v; items = v.orderedItems; break }
    case 'openrouter_chat_ordered_native_messages_v1': { const v = decodeOpenRouterNativeHistoryArtifactV1(raw); value = v; items = v.orderedMessages; break }
    case 'deepseek_stable_ordered_native_messages_v2': { const v = decodeDeepSeekNativeHistoryArtifactV2(raw); value = v; items = v.orderedEntries.map(entry => entry.message); break }
    case 'anthropic_messages_native_history_v1': { const v = decodeAnthropicNativeHistoryArtifactV1(raw); value = v; items = [v.assistantMessage]; singleResponse = true; break }
    case 'gemini_generate_content_native_history_v1': { const v = decodeGeminiGenerateContentNativeHistoryArtifactV1(raw); value = v; items = v.orderedContents; break }
    case 'lmstudio_openresponses_native_items': { const v = decodeLmStudioOpenResponsesContinuationArtifactV1(raw); value = v; items = v.orderedItems; break }
    case 'ollama_chat_native_messages': { const v = decodeOllamaNativeChatArtifactV1(raw); value = v; items = v.messages; break }
    case 'generic_local_openai_chat_messages': { const v = decodeGenericLocalOpenAIChatArtifactV1(raw); value = v; items = v.messages; break }
    case 'openai_chat_compatible_messages_v2': { const v = decodeOpenAIChatCompatibleNativeArtifactV2(raw); value = v; items = v.messages; reasoningReplay = v.reasoningReplay; break }
    default: return invalid()
  }
  if (value.artifactHash !== row.artifactHash) invalid()
  return { items: items.map(object), hash: value.artifactHash, singleResponse, reasoningReplay }
}

function isQuestion(item: Json, question: string): boolean {
  if (item.role !== 'user') return false
  if ([...array(item.content), ...array(item.parts)].some(part => part.type === 'tool_result' || part.functionResponse)) return false
  const matches = (text: unknown) => text === question || typeof text === 'string' && text.startsWith(`${question}\n\n[Prior attachment `)
  return matches(item.content) || [...array(item.content), ...array(item.parts)]
    .some(part => part.thought !== true && matches(part.text))
}

export type PortableHistoryTargetV2 = 'openai' | 'openrouter' | 'deepseek' | 'anthropic' | 'gemini' | 'compatible' | 'generic' | 'ollama' | 'lmstudio'
const compatibleReplay = new WeakMap<object, readonly CompatibleHistoryReasoningReplay[]>()
export function portableCompatibleReasoningReplayV2(items: readonly unknown[]): readonly CompatibleHistoryReasoningReplay[] {
  return compatibleReplay.get(items) ?? []
}

function message(target: PortableHistoryTargetV2, role: 'user' | 'assistant' | 'system', text: string,
  parts: readonly Json[] = [], identity = ''): Json {
  if (target === 'gemini') return { role: role === 'assistant' ? 'model' : 'user', parts: [{ text }, ...parts] }
  if (target === 'openai' || target === 'lmstudio') {
    if (role !== 'assistant') return { role: 'user', content: [{ type: 'input_text', text }, ...parts] }
    return { type: 'message', role, id: `msg_portable_${sha(identity).slice(0, 32)}`, status: 'completed',
      content: [{ type: 'output_text', text, annotations: [], ...(target === 'lmstudio' ? { logprobs: [] } : {}) }] }
  }
  // Anthropic accepts assistant content only as native blocks (P3b-01).
  if (target === 'anthropic' && role === 'assistant') return { role, content: [{ type: 'text', text, citations: null }, ...parts] }
  if (target === 'anthropic' && parts.length) return { role, content: [{ type: 'text', text }, ...parts] }
  if (target === 'openrouter' && parts.length) return { role, content: [{ type: 'text', text }, ...parts] }
  return { role, content: [text, ...parts.map(part => part.text).filter(value => typeof value === 'string')].join('\n\n') }
}

/** Returns null for the existing native path. Every included source is verified against the frozen projection. */
export function loadPortableGenerationHistoryV2(db: BetterSqlite3.Database, context: Context,
  operationId: string, target: PortableHistoryTargetV2): readonly Json[] | null {
  assertGenerationV2AuthorityTransactionContextV2(context, db)
  const projection = new GenerationContextProjectionV2Repo(db).load(context, operationId)
  const current = snapshot(db, operationId)
  const persisted = db.prepare(`SELECT compiler_ledger_json AS json FROM generation_request_v2 WHERE request_sequence=1 AND
    operation_id=COALESCE((SELECT operation_id FROM generation_request_v2 WHERE operation_id=? AND request_sequence=1),
    (SELECT s.operation_id FROM generation_operation_v2 o JOIN assistant_generation_snapshot_v2 s ON s.answer_root_id=o.source_answer_id
      WHERE o.operation_id=? AND o.action_kind IN ('retry_as_new','retry_replace')))`)
    .get(operationId, operationId) as Json | undefined
  if (typeof persisted?.json === 'string') restoreRequestAdaptationsV2(operationId, createSemanticConsumptionLedgerV2(JSON.parse(persisted.json)).entries)
  registerGenerationV2AuthorityTransactionParticipantV2(context, db, { preCommit: () => undefined,
    committed: () => clearRequestAdaptationsV2(operationId), rolledBack: () => clearRequestAdaptationsV2(operationId) })
  const turns = projection.turns.filter(turn => turn.answerRootId !== null && turn.mode === 'included').map(turn => {
    const row = db.prepare(`SELECT o.operation_id AS operationId,o.state,q.body_text AS question,a.body_text AS answer
      FROM generation_operation_v2 o JOIN message_body_v2 q ON q.message_id=o.question_id
      JOIN message_body_v2 a ON a.message_id=o.target_answer_id
      WHERE o.target_answer_id=? AND o.question_id=? AND o.conversation_id=(SELECT conversation_id FROM generation_operation_v2 WHERE operation_id=?)`).get(turn.answerRootId, turn.questionId, operationId) as Json | undefined
    if (typeof row?.operationId !== 'string' || typeof row.question !== 'string' || typeof row.answer !== 'string' ||
      !['completed', 'cancelled', 'failed'].includes(row.state as string)) invalid()
    return { row, source: snapshot(db, row.operationId), answerRootId: turn.answerRootId! }
  })
  const adapted = (id: string) => Boolean(db.prepare(`SELECT 1 FROM generation_request_v2 WHERE operation_id=?
    AND (compiler_ledger_json LIKE '%compatibility.history.%' OR compiler_ledger_json LIKE '%compatibility.requestedIntent%') LIMIT 1`).get(id))
  if (!turns.some(({ source, row }) => scope(source) !== scope(current) || adapted(row.operationId as string) ||
    ['cancelled', 'failed'].includes(row.state as string))) return null

  const output: Json[] = []
  const reasoningReplay: CompatibleHistoryReasoningReplay[] = []
  for (const { row, source, answerRootId } of turns) {
    const sourceId = row.operationId as string
    const decision = (suffix: string, outcome: 'converted' | 'deferred' | 'preserved', reason: string, reference?: unknown) =>
      recordRequestAdaptationV2(operationId, { path: `history.${answerRootId}.${suffix}`, outcome, reason,
        source: { operationId: sourceId, answerRootId, snapshotHash: source.snapshotHash.value, reference } })
    const artifactRows = db.prepare(`SELECT a.artifact_kind AS artifactKind,a.codec_version AS codecVersion,
      a.artifact_json AS artifactJson,a.artifact_hash AS artifactHash,a.request_sequence AS sequence FROM generation_native_artifact_v2 a JOIN generation_request_v2 r
      ON r.operation_id=a.operation_id AND r.request_sequence=a.request_sequence
      WHERE a.operation_id=? AND a.answer_root_id=? AND r.state='completed'
        AND a.artifact_kind NOT IN ('openai_responses_terminal_v1','openrouter_chat_terminal_result_v1',
          'deepseek_stable_terminal_result_v1','gemini_generate_content_response_v1')
      ORDER BY a.request_sequence`).all(sourceId, answerRootId) as Json[]
    let native: Json[] = []
    let sourceReasoningReplay: readonly CompatibleHistoryReasoningReplay[] = []
    let hashes: string[] = []
    for (const artifactRow of artifactRows) {
      const artifactJson = loadNativeArtifactJsonV2(db, { operationId: sourceId, answerRootId,
        requestSequence: Number(artifactRow.sequence), artifactKind: artifactRow.artifactKind as string }, artifactRow.artifactJson as string,
      { artifactCodecVersion: Number(artifactRow.codecVersion), artifactHash: artifactRow.artifactHash as string })
      if (artifactRow.artifactKind === 'gemini_interactions_image_terminal_v2') {
        const raw = object(JSON.parse(artifactJson))
        const { artifactHash, ...payload } = raw
        const text = object(raw.text)
        if (raw.artifactCodecVersion !== 2 || artifactHash !== artifactRow.artifactHash || sha(stableSerializeProviderRequestV2(payload)) !== artifactHash ||
          text.sha256 !== sha(row.answer as string) || text.byteLength !== Buffer.byteLength(row.answer as string, 'utf8')) invalid()
        hashes.push(artifactHash as string)
        const evidence = object(raw.searchEvidence)
        native.push({ role: 'assistant', content: row.answer, reasoning_details: raw.reasoningDetails,
          annotations: [...array(evidence.annotations), ...array(evidence.results), ...array(evidence.calls)] })
        continue
      }
      const artifact = nativeArtifact({ ...artifactRow, artifactJson }); hashes.push(artifact.hash)
      sourceReasoningReplay = artifact.reasoningReplay
      if (artifact.singleResponse) native.push(...artifact.items)
      else native = [...artifact.items]
    }
    if (native.length && native[0].role !== 'assistant') {
      let start = -1
      native.forEach((item, index) => { if (isQuestion(item, row.question as string)) start = index })
      if (start < 0) invalid()
      native = native.slice(start)
      sourceReasoningReplay = sourceReasoningReplay.filter(entry => entry.assistantMessageIndex >= start)
        .map(entry => ({ ...entry, assistantMessageIndex: entry.assistantMessageIndex - start }))
    }
    const interrupted = db.prepare(`SELECT snapshot_json AS json,snapshot_hash AS hash,request_sequence AS sequence FROM generation_interrupted_replay_v2
      WHERE answer_root_id=? AND operation_id=? ORDER BY request_sequence DESC LIMIT 1`).get(answerRootId, sourceId) as Json | undefined
    const currentCheckpoint = row.state !== 'completed' && typeof interrupted?.json === 'string' &&
      (!artifactRows.length || Number(interrupted.sequence) > Number(artifactRows[artifactRows.length - 1].sequence))
    const checkpointJson = row.state !== 'completed' && typeof interrupted?.json === 'string'
      ? loadInterruptedReplayJsonV2(db, { operationId: sourceId, answerRootId,
        requestSequence: Number(interrupted.sequence) }, interrupted.json, interrupted.hash as string) : null
    if (row.state !== 'completed' && typeof interrupted?.json === 'string' && !currentCheckpoint) {
      decision('earlierCheckpoint', 'deferred', 'earlier_native_checkpoint_retained_not_replayed', interrupted.hash)
    }
    if (currentCheckpoint && checkpointJson !== null) {
      const checkpoint = object(JSON.parse(checkpointJson))
      if (checkpoint.schemaVersion !== 1 || !Array.isArray(checkpoint.replay)) invalid()
      let terminalResult: ReturnType<typeof readLmStudioTerminalCheckpointV1> = null
      if (checkpoint.protocol === 'lmstudio') {
        try { terminalResult = readLmStudioTerminalCheckpointV1(checkpoint.native) } catch { invalid() }
      }
      if (terminalResult !== null) {
        native = [...terminalResult.returnedItems] as unknown as Json[]
        decision('interruptedNativeTerminal', 'deferred', 'receipt_terminal_items_retained', interrupted.hash)
      } else {
        if (checkpoint.replayProjection === 'native_assistant_v1') {
          if (!['openai_responses', 'openrouter', 'anthropic', 'deepseek', 'gemini'].includes(checkpoint.protocol as string)) invalid()
          native = [...projectInterruptedCheckpointReplayV1({ protocol: checkpoint.protocol as InterruptedProtocolV1,
            native: checkpoint.native as InterruptedNativeSnapshotV1, prefix: checkpoint.replay,
            answerRootId }).replay] as Json[]
        } else {
          if (checkpoint.replayProjection !== undefined) invalid()
          native = [...array(checkpoint.replay)]
        }
        decision('interruptedNative', 'deferred', 'unfinished_native_facts_retained', interrupted.hash)
      }
      hashes.push(interrupted.hash as string)
    }
    const imageRows = db.prepare(`SELECT asset_id AS assetId,asset_revision_id AS assetRevisionId,asset_sha256 AS assetSha256
      FROM generation_image_output_v2 WHERE operation_id=? AND answer_root_id=? ORDER BY request_sequence,output_index`).all(sourceId, answerRootId) as Json[]
    if (row.state === 'completed' && !native.length && !(imageRows.length && source.providerBinding.operation.startsWith('image_'))) invalid()
    if (scope(source) === scope(current) && row.state !== 'completed' &&
      (currentCheckpoint || !artifactRows.length) &&
      ['openai', 'openrouter', 'deepseek', 'anthropic', 'gemini'].includes(target)) {
      const protocol = ({ openai: 'openai_responses', openrouter: 'openrouter', deepseek: 'deepseek', anthropic: 'anthropic', gemini: 'gemini' } as const)[target as 'openai' | 'openrouter' | 'deepseek' | 'anthropic' | 'gemini']
      const replay = new GenerationInterruptedReplayV2Repo(db).load(context, answerRootId, protocol, current.semanticIntent.tools.mode === 'enabled')
      if (replay === null) invalid()
      if (target === 'deepseek') output.push(...replay.map(object).map(item => ({ kind: item.role === 'assistant' ? 'assistant' : 'client',
        ...(item.role === 'assistant' ? { generatedWithThinking: source.semanticIntent.reasoning.mode } : {}), message: item })))
      else output.push(...replay.map(object))
      decision('native', 'preserved', 'protocol_interrupted_replay', hashes)
      continue
    }
    // Rebuild Anthropic's response-only artifacts with their actual executed tool outputs.
    if (scope(source) === scope(current) && target === 'anthropic' && row.state === 'completed') {
      output.push(message(target, 'user', row.question as string,
        attachmentParts(db, context, current, target, readOriginalGenerationAttachmentsV2(db, source), decision, sourceId)))
      for (let index = 0; index < native.length; index++) {
        const response = native[index]
        output.push(response)
        const uses = array(response.content).filter(block => block.type === 'tool_use')
        if (!uses.length) continue
        const results = db.prepare(`SELECT tool_call_id AS id,content,is_error AS isError FROM generation_tool_output_v2
          WHERE operation_id=? AND request_sequence=? ORDER BY output_index`).all(sourceId, Number(artifactRows[index].sequence) + 1) as Json[]
        if (uses.length !== results.length || uses.some((use, i) => use.id !== results[i].id)) invalid()
        output.push({ role: 'user', content: results.map(result => ({ type: 'tool_result', tool_use_id: result.id,
          content: result.content, is_error: result.isError === 1 })) })
      }
      decision('native', 'preserved', 'same_scope_native_turn', hashes)
      continue
    }
    // Matching native scope remains lossless even when another earlier turn needed conversion.
    if (scope(source) === scope(current) && target !== 'anthropic' && native.length &&
      row.state === 'completed') {
      if (target === 'compatible') reasoningReplay.push(...sourceReasoningReplay.map(entry => ({ ...entry, assistantMessageIndex: output.length + entry.assistantMessageIndex })))
      if (target === 'deepseek') output.push(...native.map(item => ({ kind: item.role === 'assistant' ? 'assistant' : 'client',
        ...(item.role === 'assistant' ? { generatedWithThinking: source.semanticIntent.reasoning.mode } : {}), message: item })))
      else output.push(...native)
      decision('native', 'preserved', 'same_scope_native_turn', hashes)
      continue
    }
    const attachments = readOriginalGenerationAttachmentsV2(db, source)
    if (sourceReasoningReplay.length) decision('reasoningReplay', 'deferred', 'native_reasoning_scope_not_replayable', hashes)
    const userParts = attachmentParts(db, context, current, target, attachments, decision, sourceId)
    const user = message(target, 'user', row.question as string, userParts, `${answerRootId}.user`)
    const assistantText: string[] = []
    const nativeToolResultIds = new Set<string>()
    const nativeFunctionResponses = new Map<string, number>()
    for (let index = 0; index < native.length; index++) {
      const item = native[index]
      const reasoning = classifyPortableHistoryReasoningV2(item, source.providerBinding.protocolContractId.value)
      for (const summary of reasoning.publicSummaries) {
        assistantText.push(`[Prior public reasoning summary; source=${sourceId}; sequence=${index}; kind=${summary.source}]\n${summary.text}`)
        decision(`reasoning[${index}].summary[${summary.index}]`, 'converted', 'public_reasoning_summary_preserved_as_history',
          { hashes, source: summary.source })
      }
      if (item.role === 'assistant' || item.role === 'model') {
        const text = textOf(item); if (text) assistantText.push(text)
      }
      const calls = [...array(item.tool_calls), ...array(item.content).filter(part => ['tool_use', 'server_tool_use'].includes(part.type as string)),
        ...array(item.parts).filter(part => part.functionCall)]
      if (item.type === 'function_call' || item.type === 'web_search_call') calls.push(item)
      if (calls.length) assistantText.push(`[Prior tool calls; source=${sourceId}; sequence=${index}]\n${stableSerializeProviderRequestV2(
        calls.map(call => call.functionCall ? { functionCall: call.functionCall } : call))}`)
      const results = [...array(item.content).filter(part => ['tool_result', 'web_search_tool_result'].includes(part.type as string)),
        ...array(item.parts).filter(part => part.functionResponse)]
      if (item.role === 'tool' || item.type === 'function_call_output') results.push(item)
      for (const result of results) {
        const id = result.tool_call_id ?? result.call_id ?? result.tool_use_id
        if (typeof id === 'string') nativeToolResultIds.add(id)
        if (result.functionResponse) {
          const canonical = stableSerializeProviderRequestV2(object(result.functionResponse).response)
          nativeFunctionResponses.set(canonical, (nativeFunctionResponses.get(canonical) ?? 0) + 1)
        }
      }
      if (results.length) assistantText.push(`[Prior tool results; source=${sourceId}; sequence=${index}]\n${stableSerializeProviderRequestV2(results)}`)
      if (reasoning.hasOpaqueReasoning) {
        decision(`reasoning[${index}]`, 'deferred', 'native_reasoning_scope_not_replayable', { hashes, index })
      }
      const annotations = [...array(item.annotations), ...array(item.content).flatMap(part => [...array(part.annotations), ...array(part.citations)])]
      if (annotations.length) assistantText.push(`[Prior citations; source=${sourceId}]\n${stableSerializeProviderRequestV2(annotations)}`)
    }
    // Body text is the persisted display text, used for pre-checkpoint interrupted turns only.
    if (!assistantText.length && row.answer) assistantText.push(row.answer as string)
    else if (row.state !== 'completed' && row.answer && !assistantText.join('\n\n').includes(row.answer as string)) {
      assistantText.push(`[Persisted interrupted response; source=${sourceId}]\n${row.answer}`)
    }
    const toolOutputs = db.prepare(`SELECT request_sequence AS requestSequence,output_index AS outputIndex,tool_call_id AS toolCallId,
      tool_id AS toolId,content,is_error AS isError FROM generation_tool_output_v2 WHERE operation_id=?
      ORDER BY request_sequence,output_index`).all(sourceId) as Json[]
    const missingToolOutputs = toolOutputs.filter(item => {
      if (nativeToolResultIds.has(item.toolCallId as string)) return false
      const count = nativeFunctionResponses.get(item.content as string) ?? 0
      if (count) { nativeFunctionResponses.set(item.content as string, count - 1); return false }
      return true
    })
    if (missingToolOutputs.length) assistantText.push(`[Recorded tool executions; source=${sourceId}]\n${stableSerializeProviderRequestV2(missingToolOutputs)}`)
    const text = assistantText.join('\n\n')
    const assistant: Json = { ...message(target, 'assistant', text, [], answerRootId),
      ...(row.state !== 'completed' && target === 'openai' ? { status: 'incomplete' } : {}) }
    const messages = [user, ...(text ? [row.state !== 'completed' && target === 'lmstudio'
      ? message(target, 'user', `[Prior interrupted assistant response]\n${text}`) : assistant] : [])]
    const nativeImages: Json[] = []
    for (const [itemIndex, item] of native.entries()) {
      const references = array(item.images).map(image => object(image.image_url).url ?? image.url)
      for (const [partIndex, part] of array(item.parts).entries()) {
        const inline = object(part.inlineData), file = object(part.fileData)
        if (!part.inlineData && !part.fileData) continue
        let encoded: Json | null = null
        if (part.thought !== true && !part.thoughtSignature && typeof inline.mimeType === 'string' && typeof inline.data === 'string') {
          if (inline.mimeType.startsWith('image/')) encoded = nativeImageReferencePart(target, `data:${inline.mimeType};base64,${inline.data}`)
          else if (target === 'gemini' && /^(audio|video)\//u.test(inline.mimeType)) {
            const bytes = Buffer.from(inline.data, 'base64')
            if (bytes.length > 0 && bytes.toString('base64') === inline.data && bytes.length <= 4 * 1024 * 1024) encoded = { inlineData: inline }
            bytes.fill(0)
          }
        } else if (part.thought !== true && !part.thoughtSignature && typeof file.fileUri === 'string' &&
          typeof file.mimeType === 'string' && file.mimeType.startsWith('image/')) encoded = nativeImageReferencePart(target, file.fileUri)
        if (encoded) nativeImages.push(encoded)
        decision(`nativeMedia[${itemIndex}][${partIndex}]`, encoded ? 'converted' : 'deferred',
          encoded ? 'native_output_media_encoded_for_target' : 'target_native_media_reference_unavailable', { hashes, itemIndex, partIndex })
      }
      if (item.type === 'image_generation_call' && item.status !== 'completed') {
        decision(`nativeImages[${itemIndex}]`, 'deferred', 'unfinished_or_failed_image_output_retained', { hashes, status: item.status })
      }
      if (item.type === 'image_generation_call' && typeof item.result === 'string' && item.status === 'completed') {
        const bytes = Buffer.from(item.result, 'base64')
        const valid = bytes.length > 0 && bytes.toString('base64') === item.result
        const mime = !valid ? null : bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? 'image/png'
          : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
            : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null
        bytes.fill(0)
        if (mime) references.push(`data:${mime};base64,${item.result}`)
        else decision(`nativeImages[${itemIndex}]`, 'deferred', 'native_output_media_type_unrecognized', hashes)
      }
      for (const [imageIndex, reference] of references.entries()) {
        const part = typeof reference === 'string' ? nativeImageReferencePart(target, reference) : null
        if (part) nativeImages.push(part)
        decision(`nativeImages[${itemIndex}][${imageIndex}]`, part ? 'converted' : 'deferred',
          part ? 'native_output_image_encoded_for_target' : 'target_image_reference_unavailable', hashes)
      }
    }
    if (nativeImages.length) messages.push(message(target, 'user', '[Prior assistant images]', nativeImages))
    // Images produced by the assistant are assets too; encode actual bytes, never foreign file IDs.
    const images = imageRows
    if (images.length) {
      const intents = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: images.map(image => ({ kind: 'managed_file',
        ...image, include: true, sendAs: 'image_reference', conversion: 'none' })) }).attachments!
      const imageParts = attachmentParts(db, context, current, target, intents, (suffix, outcome, reason, reference) => decision(`output.${suffix}`, outcome, reason, reference))
      if (imageParts.length) messages.push(message(target, 'user', `[Prior assistant image; source=${sourceId}]`, imageParts))
    }
    if (target === 'deepseek') output.push(...messages.map(item => ({ kind: item.role === 'assistant' ? 'assistant' : 'client',
      ...(item.role === 'assistant' ? { generatedWithThinking: 'disabled' } : {}), message: item })))
    else output.push(...messages)
    decision('turn', 'converted', 'target_protocol_history', hashes)
  }
  // Fit media to the existing request codec, preserving text/tool history and
  // recording every deferred native part. Source snapshots and bytes stay intact.
  const row = db.prepare(`SELECT b.body_text AS text FROM generation_operation_v2 o JOIN message_body_v2 b ON b.message_id=o.question_id WHERE o.operation_id=?`).get(operationId) as Json
  const prefixLimit = generationPortableHistoryTargetMaxBytesV1(target) -
    Buffer.byteLength(stableSerializeProviderRequestV2(JSON.parse(current.canonicalJson).semanticIntent), 'utf8') -
    Buffer.byteLength(JSON.stringify(row.text), 'utf8') - GENERATION_PORTABLE_HISTORY_RESERVED_BYTES_V1
  let wireSize = Buffer.byteLength(stableSerializeProviderRequestV2(output), 'utf8')
  const media = (part: Json) => Boolean(part.inlineData || part.fileData || part.type === 'input_image' || part.type === 'image_url' ||
    part.type === 'file' || part.type === 'input_file' || ['image', 'document'].includes(part.type as string) && part.source)
  for (let index = output.length - 1; index >= 0 && wireSize > prefixLimit; index--) {
    const item = output[index]
    const key = Array.isArray(item.parts) ? 'parts' : Array.isArray(item.content) ? 'content' : null
    if (key) {
      const kept = [...array(item[key])]
      for (let partIndex = kept.length - 1; partIndex >= 0 && wireSize > prefixLimit; partIndex--) {
        if (!media(kept[partIndex])) continue
        const removed = kept.splice(partIndex, 1)[0]
        wireSize -= Buffer.byteLength(stableSerializeProviderRequestV2(removed), 'utf8') + 1
        recordRequestAdaptationV2(operationId, { path: `historyBudget[${index}].${key}[${partIndex}]`, outcome: 'deferred',
          reason: 'target_request_media_budget_exceeded', source: { sha256: sha(stableSerializeProviderRequestV2(removed)) } })
      }
      output[index] = { ...item, [key]: kept }
    }
    if (wireSize > prefixLimit && Array.isArray(item.images)) {
      wireSize -= Buffer.byteLength(stableSerializeProviderRequestV2(item.images), 'utf8')
      const { images, ...retained } = output[index]; output[index] = retained
      recordRequestAdaptationV2(operationId, { path: `historyBudget[${index}].images`, outcome: 'deferred',
        reason: 'target_request_media_budget_exceeded', source: { sha256: sha(stableSerializeProviderRequestV2(images)) } })
    }
    if (wireSize > prefixLimit && item.type === 'image_generation_call' && typeof item.result === 'string') {
      wireSize -= Buffer.byteLength(stableSerializeProviderRequestV2(item), 'utf8') + 1
      output.splice(index, 1)
      recordRequestAdaptationV2(operationId, { path: `historyBudget[${index}].imageGeneration`, outcome: 'deferred',
        reason: 'target_request_media_budget_exceeded', source: { sha256: sha(stableSerializeProviderRequestV2(item)) } })
      continue
    }
    const retained = output[index]
    if ((Array.isArray(retained.parts) && retained.parts.length === 0 || Array.isArray(retained.content) && retained.content.length === 0) ||
      Array.isArray(item.images) && !retained.images && retained.role === 'assistant' && retained.content == null && !retained.tool_calls && !retained.reasoning && !retained.reasoning_details) output.splice(index, 1)
  }
  wireSize = Buffer.byteLength(stableSerializeProviderRequestV2(output), 'utf8')
  if (wireSize > prefixLimit) {
    recordRequestAdaptationV2(operationId, { path: 'historyBudget.text', outcome: 'preserved',
      reason: 'history_preserved_pending_complete_request_budget_validation',
      source: { stage: 'portable_history_prefix', target, encodedBytes: wireSize, availableBytes: prefixLimit } })
  }
  const result = Object.freeze(output)
  compatibleReplay.set(result, Object.freeze(reasoningReplay))
  return result
}

function nativeImageReferencePart(target: PortableHistoryTargetV2, reference: string): Json | null {
  const data = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(reference)
  if (data) {
    const bytes = Buffer.from(data[2], 'base64')
    const valid = bytes.length > 0 && bytes.toString('base64') === data[2]
    bytes.fill(0)
    if (!valid) return null
    if (target === 'openai' && Buffer.byteLength(reference, 'utf8') > 4 * 1024 * 1024) return null
    const mime = data[1] === 'image/jpg' ? 'image/jpeg' : data[1]
    if (target === 'openai') return { type: 'input_image', image_url: reference }
    if (target === 'openrouter') return { type: 'image_url', image_url: { url: reference } }
    if (target === 'anthropic') return { type: 'image', source: { type: 'base64', media_type: mime, data: data[2] } }
    if (target === 'gemini') return { inlineData: { mimeType: mime, data: data[2] } }
    return null
  }
  let url: URL
  try { url = new URL(reference) } catch { return null }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
  if (target === 'openai') return { type: 'input_image', image_url: reference }
  if (target === 'openrouter') return { type: 'image_url', image_url: { url: reference } }
  if (target === 'anthropic') return { type: 'image', source: { type: 'url', url: reference } }
  return null
}

export function readOriginalGenerationAttachmentsV2(db: BetterSqlite3.Database, source: Snapshot): readonly AttachmentIntentV2[] {
  const mask = source.semanticIntent.image.mode === 'generate' ? source.semanticIntent.image.maskAsset : undefined
  // A mask is a tool input role, not an ordinary user reference image during history replay.
  const references = (attachments: readonly AttachmentIntentV2[]) => mask ? attachments.filter(attachment =>
    attachment.kind !== 'managed_file' || attachment.assetId.value !== mask.assetId.value ||
    attachment.assetRevisionId.value !== mask.assetRevisionId.value || attachment.assetSha256.value !== mask.assetSha256.value) : attachments
  if (source.requestPlan) return references(decodeGenerationIntentLayerV2(source.requestPlan.requestedIntent).attachments ?? [])
  const pending = readRequestAdaptationV2(source.operationId.value, 'requestedIntent')
  if (pending) return references(decodeGenerationIntentLayerV2(pending.source).attachments ?? [])
  // The request ledger retains requested references when its target could not send them.
  const row = db.prepare(`SELECT compiler_ledger_json AS json FROM generation_request_v2
    WHERE operation_id=? AND request_sequence=1 AND EXISTS (
      SELECT 1 FROM json_each(compiler_ledger_json) AS entry
      WHERE json_extract(entry.value,'$.path')='compatibility.requestedIntent'
    )`).get(source.operationId.value) as Json | undefined
  if (typeof row?.json === 'string') {
    const ledger = createSemanticConsumptionLedgerV2(JSON.parse(row.json))
    const requested = ledger.entries.find(entry => entry.path === 'compatibility.requestedIntent')
    if (requested) return references(decodeGenerationIntentLayerV2(object(JSON.parse(requested.evidence)).source).attachments ?? [])
  }
  return references(source.semanticIntent.attachments)
}

/** Existing extracted text remains usable even when the target has no attachment codec. */
export function currentGenerationQuestionWithFallbackV2(db: BetterSqlite3.Database, context: Context,
  operationId: string, question: string): string {
  const current = snapshot(db, operationId)
  const effective = new Set(current.semanticIntent.attachments.filter(attachment => attachment.include && attachment.kind === 'managed_file')
    .map(attachment => attachment.kind === 'managed_file' ? attachment.assetRevisionId.value : ''))
  const extra: string[] = []
  for (const attachment of readOriginalGenerationAttachmentsV2(db, current)) {
    if (!attachment.include) continue
    if (attachment.kind === 'url_reference') {
      if (!current.semanticIntent.attachments.some(value => value.kind === 'url_reference' && value.referenceId.value === attachment.referenceId.value)) {
        extra.push(`[Prior attachment URL; ${attachment.mediaKind}] ${attachment.originalUrl}`)
        recordRequestAdaptationV2(operationId, { path: `currentUrls.${attachment.referenceId.value}`, outcome: 'converted', reason: 'url_reference_preserved' })
      }
      continue
    }
    if (effective.has(attachment.assetRevisionId.value)) continue
    const parts = attachmentParts(db, context, current, 'generic', [attachment], (suffix, outcome, reason, source) => {
      recordRequestAdaptationV2(operationId, { path: `currentAttachments.${attachment.assetRevisionId.value}.${suffix}`, outcome, reason, source })
    })
    extra.push(...parts.map(part => part.text).filter((text): text is string => typeof text === 'string'))
  }
  return [question, ...extra].join('\n\n')
}

function attachmentParts(db: BetterSqlite3.Database, context: Context, current: Snapshot, target: PortableHistoryTargetV2,
  attachments: readonly AttachmentIntentV2[], decision: (suffix: string, outcome: 'converted' | 'deferred' | 'preserved', reason: string, source?: unknown) => void, sourceOperationId = current.operationId.value): Json[] {
  const parts: Json[] = []
  const assets = new AttachmentAssetV2Repo(db)
  attachments.forEach((attachment, index) => {
    if (!attachment.include) return
    if (attachment.kind === 'url_reference') {
      // A URL is retained as a reference; converting it never claims to have fetched its contents.
      const native = attachment.mediaKind === 'image' ? nativeImageReferencePart(target, attachment.originalUrl) : null
      if (native) {
        parts.push(native)
        decision(`attachments[${index}]`, 'converted', 'source_url_image_encoded_for_target', attachment.referenceId.value)
        return
      }
      const text = `[Prior attachment URL; ${attachment.mediaKind}] ${attachment.originalUrl}`
      parts.push(target === 'gemini' ? { text } : { type: target === 'openai' || target === 'lmstudio' ? 'input_text' : 'text', text })
      decision(`attachments[${index}]`, 'converted', 'url_reference_preserved', attachment.referenceId.value)
      return
    }
    assets.withSynchronousSnapshotReferenceAuthority(context, attachment, authority => {
      const revision = authority.revision
      const mime = revision.blob.mime
      const reader = readers.get(db)
      const supported = ['openai', 'openrouter', 'anthropic', 'gemini'].includes(target)
      const image = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(mime)
      const audiovisual = target === 'gemini' && /^(audio|video)\//u.test(mime)
      const text = mime.startsWith('text/') || attachment.sendAs === 'inline_text' || attachment.conversion === 'plain_text'
      const inlineLimit = target === 'openai' ? Math.floor((4 * 1024 * 1024 - 256) * 3 / 4)
        : target === 'gemini' ? 4 * 1024 * 1024 : 12 * 1024 * 1024
      if (!reader || revision.blob.sizeBytes > inlineLimit || !text && (!supported || !image && !audiovisual && mime !== 'application/pdf')) {
        const fallback = reader ? existingTextRevision(db, attachment, sourceOperationId) : null
        if (fallback) {
          parts.push(...attachmentParts(db, context, current, target, [fallback], (suffix, outcome, reason, reference) =>
            decision(`attachments[${index}].textFallback.${suffix}`, outcome, reason, reference), sourceOperationId))
          decision(`attachments[${index}]`, 'converted', 'existing_extracted_text_fallback', {
            original: attachment.assetRevisionId.value, textRevision: fallback.assetRevisionId.value })
          return
        }
        decision(`attachments[${index}]`, 'deferred', !reader ? 'source_bytes_unavailable' : revision.blob.sizeBytes > inlineLimit ? 'target_inline_budget_exceeded' : 'target_media_not_supported', attachment.assetRevisionId.value)
        return
      }
      const bytes = reader(revision)
      try {
        if (text) {
          const content = `[Prior attachment ${revision.filename}; revision=${attachment.assetRevisionId.value}]\n${new TextDecoder('utf-8', { fatal: true }).decode(bytes)}`
          parts.push(target === 'gemini' ? { text: content } : { type: ['openai', 'lmstudio'].includes(target) ? 'input_text' : 'text', text: content })
        } else {
          const data = Buffer.from(bytes).toString('base64')
          if (target === 'gemini') parts.push({ inlineData: { mimeType: mime, data } })
          else if (target === 'anthropic') parts.push({ type: image ? 'image' : 'document', source: { type: 'base64', media_type: mime, data } })
          else if (target === 'openrouter') parts.push(image ? { type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } }
            : { type: 'file', file: { filename: revision.filename, file_data: `data:${mime};base64,${data}` } })
          else parts.push(image ? { type: 'input_image', image_url: `data:${mime};base64,${data}` }
            : { type: 'input_file', filename: revision.filename, file_data: `data:${mime};base64,${data}` })
        }
        decision(`attachments[${index}]`, 'converted', 'source_revision_encoded_for_target', { revision: attachment.assetRevisionId.value, sha256: revision.blob.sha256.value })
      } catch {
        decision(`attachments[${index}]`, 'deferred', 'invalid_text_encoding', attachment.assetRevisionId.value)
      } finally { bytes.fill(0) }
    })
  })
  // Text-only target codecs accept string content, so fold extracted text into their message at the caller.
  return parts
}

function existingTextRevision(db: BetterSqlite3.Database,
  attachment: Extract<AttachmentIntentV2, { kind: 'managed_file' }>, operationId: string): Extract<AttachmentIntentV2, { kind: 'managed_file' }> | null {
  const row = db.prepare(`SELECT r.asset_id AS assetId,r.asset_revision_id AS assetRevisionId,b.sha256 AS assetSha256
    FROM asset_revision_v2 r JOIN file_blob_v2 b ON b.blob_id=r.blob_id
    WHERE r.parent_asset_revision_id=? AND r.conversion_kind='plain_text'
      AND r.created_at_ms<=(SELECT created_at_ms FROM generation_operation_v2 WHERE operation_id=?)
    ORDER BY r.created_at_ms DESC,r.asset_revision_id LIMIT 1`).get(attachment.assetRevisionId.value, operationId) as Json | undefined
  if (!row) return null
  const value = decodeGenerationIntentLayerV2({ schemaVersion: 2, attachments: [{ ...row, kind: 'managed_file',
    include: true, sendAs: 'inline_text', conversion: 'plain_text' }] }).attachments![0]
  return value.kind === 'managed_file' ? value : null
}
