import { GenerationInterruptedReplayV2Repo } from '../../infra/db/repo/generationInterruptedReplayV2Repo'
import { session } from "electron";
import type BetterSqlite3 from "better-sqlite3";
import { ConversationGraphV2Repo } from "../../infra/db/repo/conversationGraphV2Repo";
import { GenerationExecutionV2Repo } from "../../infra/db/repo/generationExecutionV2Repo";
import { GenerationRequestV2Repo } from "../../infra/db/repo/generationRequestV2Repo";
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from "../../infra/db/repo/generationV2AuthorityTransactionInternal";
import { OllamaChatNativeHistoryV2Repo } from "../../infra/db/repo/ollamaChatNativeHistoryV2Repo";
import { LocalEndpointProfileV2Repo } from "../../infra/db/repo/localEndpointProfileV2Repo";
import type { RawGenerationRequestStore } from "../debug/rawGenerationRequestStore";
import { isPreparedProviderRequestV2 } from "../../src/core/generation-v2/compiler/preparedProviderRequestV2";
import {
  OllamaNativeChatNdjsonDecoderV1,
  OllamaNativeChatStreamAssemblerV1,
  type OllamaNativeChatStreamResultV1,
} from "../../src/core/generation-v2/providers/ollama-chat/chatStreamV1";
import { buildOllamaNativeChatRequestHistoryV1, createOllamaNativeChatArtifactV1 } from "../../src/core/generation-v2/providers/ollama-chat/nativeMessagesV1";
import {
  isGenerationTextCommandResultV2,
  type GenerationTextCommandResultV2,
} from "./generationTextCommandResultV2";
import {
  publishGenerationStreamProjectionV2,
  type GenerationStreamProjectionSinkV2,
} from "./generationStreamProjectionV2";
import { createGenerationTextBodyCheckpointV2 } from "./generationBodyCheckpointV2";
import { abortableGenerationReadV2, createGenerationAbortScope } from './generationTimeoutPolicyV2'
import {
  hasPendingGenerationNativeCompletionForOperationV2,
  isGenerationNativeCompletionMaterializationPendingV2Error,
  materializeNewGenerationNativeCompletionV2,
  persistGenerationNativeCompletionReceiptV2,
  preserveGenerationNativeCompletionPendingFailureV2,
  registerGenerationNativeCompletionMaterializerV2,
} from './generationNativeCompletionV2'
import { settleProviderFinishV2 } from './generationProviderFinishV2'
const receivedLocalWireFacts = new WeakMap<object, unknown[]>()

export function createOllamaChatStreamRunnerV2(
  input: Readonly<{
    db: BetterSqlite3.Database;
    rawGenerationRequestStore?: RawGenerationRequestStore;
    streamProjectionSink?: GenerationStreamProjectionSinkV2;
    fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
    nowMs?: () => number;
    timeoutMs?: number;
  }>,
) {
  const now = input.nowMs ?? Date.now,
    fetcher =
      input.fetchImpl ??
      session.defaultSession.fetch.bind(session.defaultSession),
    exec = new GenerationExecutionV2Repo(input.db, now),
    requests = new GenerationRequestV2Repo(input.db, now),
    graph = new ConversationGraphV2Repo(input.db),
    history = new OllamaChatNativeHistoryV2Repo(input.db),
    profiles = new LocalEndpointProfileV2Repo(input.db, now);
  function begin(cmd: GenerationTextCommandResultV2) {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (c) => {
      const e = exec.findOperationInTransaction(
        c,
        cmd.preparedRequest.operationId,
      );
      if (!e) throw new Error("GENERATION_V2_OLLAMA_RUNNER_AUTHORITY_INVALID");
      const r = requests.replayPrepared(c, e, cmd.preparedRequest);
      if (
        exec.openAttempt(
          c,
          {
            operationId: cmd.preparedRequest.operationId,
            requestSequence: 1,
            attempt: 1,
          },
          now(),
        ).kind !== "created"
      )
        throw new Error("GENERATION_V2_OLLAMA_RUNNER_ALREADY_STARTED");
      requests.markStreaming(c, r, now());
      if (e.operation.state === "committed")
        exec.markOperationStreaming(c, e, now());
    });
  }
  function terminal(
    cmd: GenerationTextCommandResultV2,
    state: "completed" | "failed" | "cancelled",
    result: OllamaNativeChatStreamResultV1 | null,
    code: string | null,
    message: string | null,
    phase: "pre_stream" | "mid_stream",
  ) {
    // A truncated or blocked finish is not a completed answer (P4a-15).
    const finish = settleProviderFinishV2({
      state,
      finishReason: result?.doneReason,
      errorCode: code,
      errorMessage: message,
    });
    state = finish.state;
    code = finish.errorCode;
    message = finish.errorMessage;
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (c) => {
      const e = exec.findOperationInTransaction(
        c,
        cmd.preparedRequest.operationId,
      );
      if (!e) throw new Error("GENERATION_V2_OLLAMA_RUNNER_AUTHORITY_INVALID");
      const r = requests.replayPrepared(c, e, cmd.preparedRequest);
      exec.terminalizeAttempt(
        c,
        {
          key: {
            operationId: cmd.preparedRequest.operationId,
            requestSequence: 1,
            attempt: 1,
          },
          outcome:
            state === "completed"
              ? { kind: "provider_completed", phase }
              : state === "cancelled"
                ? { kind: "user_cancelled", phase }
                : {
                    kind: "provider_failed",
                    phase,
                    failure: { code: code!, message: message! },
                  },
        },
        now(),
      );
      const tr = requests.terminalize(c, r, state, now());
      graph.terminalizeAssistantMessage(
        c,
        cmd.preparedRequest.answerRootId,
        state,
        state === "completed" ? result!.assistantMessage.content : null,
        now(),
      );
      const te = exec.terminalizeOperation(
        c,
        e,
        { state, errorCode: code, errorMessage: message },
        now(),
      );
      if (state !== 'completed') { new GenerationInterruptedReplayV2Repo(input.db).insertLocalCheckpoint(c, { answerRootId: cmd.preparedRequest.answerRootId, operationId: cmd.preparedRequest.operationId, requestSequence: cmd.preparedRequest.requestSequence, protocol: 'ollama', requestBody: JSON.parse(cmd.preparedRequest.body.copyUtf8Text()), wireEvents: receivedLocalWireFacts.get(cmd) ?? [] }) }
      if (state === "completed" && result) {
        const fact = history.loadRequestHistory(
          c,
          cmd.preparedRequest.operationId,
        );
        history.persistCompletedArtifact({
          context: c,
          execution: te,
          request: tr,
          requestMessages: buildOllamaNativeChatRequestHistoryV1(fact),
          assistantMessage: result.assistantMessage,
          createdAtMs: now(),
        });
      }
    });
    publishGenerationStreamProjectionV2(input.streamProjectionSink, {
      type: "terminal",
      operationId: cmd.preparedRequest.operationId,
      answerRootId: cmd.preparedRequest.answerRootId,
      state,
      errorCode: code,
      errorMessage: message,
    });
    return {
      operationId: cmd.preparedRequest.operationId,
      answerRootId: cmd.preparedRequest.answerRootId,
      state,
      errorCode: code,
      errorMessage: message,
    };
  }
  registerGenerationNativeCompletionMaterializerV2(input.db, 'ollama-chat-v1', (_receipt, command, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('GENERATION_V2_OLLAMA_RUNNER_RESPONSE_INVALID')
    const raw = value as Record<string, unknown>
    const normalized = createOllamaNativeChatArtifactV1([raw.assistantMessage as import('../../src/core/generation-v2/providers/ollama-chat/nativeMessagesV1').OllamaNativeChatMessageV1])
    if (normalized.messages[0]?.role !== 'assistant' || typeof raw.model !== 'string' || typeof raw.doneReason !== 'string' ||
        !raw.usage || typeof raw.usage !== 'object' || Array.isArray(raw.usage) ||
        Object.values(raw.usage as Record<string, unknown>).some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error('GENERATION_V2_OLLAMA_RUNNER_RESPONSE_INVALID')
    }
    const result = Object.freeze({ assistantMessage: normalized.messages[0], model: raw.model,
      doneReason: raw.doneReason, usage: raw.usage }) as OllamaNativeChatStreamResultV1
    return terminal(command, 'completed', result, null, null, 'mid_stream')
  }, (command, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('GENERATION_V2_OLLAMA_RUNNER_RESPONSE_INVALID')
    const raw = value as Record<string, unknown>
    const normalized = createOllamaNativeChatArtifactV1([raw.assistantMessage as import('../../src/core/generation-v2/providers/ollama-chat/nativeMessagesV1').OllamaNativeChatMessageV1])
    if (normalized.messages[0]?.role !== 'assistant' || typeof raw.model !== 'string' || typeof raw.doneReason !== 'string' ||
        !raw.usage || typeof raw.usage !== 'object' || Array.isArray(raw.usage) ||
        Object.values(raw.usage as Record<string, unknown>).some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
      throw new Error('GENERATION_V2_OLLAMA_RUNNER_RESPONSE_INVALID')
    }
    const calls = (normalized.messages[0] as Record<string, unknown> | undefined)?.tool_calls
    if (Array.isArray(calls) && calls.length > 0 && command.execution.snapshot.semanticIntent.tools.mode !== 'enabled') {
      throw new Error('GENERATION_V2_OLLAMA_RUNNER_RESPONSE_INVALID')
    }
  })
  return Object.freeze({
    run: async (cmd: GenerationTextCommandResultV2, signal?: AbortSignal) => {
      if (
        !isGenerationTextCommandResultV2(cmd) ||
        !isPreparedProviderRequestV2(cmd.preparedRequest) ||
        cmd.preparedRequest.providerId !== "ollama" ||
        cmd.preparedRequest.contractId !== "ollama-chat-v1" ||
        cmd.preparedRequest.headersPlan.credential.kind !== "no_credential"
      )
        throw new Error("GENERATION_V2_OLLAMA_RUNNER_AUTHORITY_INVALID");
      const p = profiles.get(cmd.preparedRequest.endpointProfileId),
        b = cmd.execution.snapshot.providerBinding.endpointBinding,
        rev =
          b.kind === "provider_managed_set"
            ? b.endpointSetRevision.value
            : null;
      if (
        p.credentialScopeId !== cmd.preparedRequest.credentialScopeId ||
        p.profileRevision !== rev
      )
        throw new Error("GENERATION_V2_OLLAMA_RUNNER_PROFILE_STALE");
      receivedLocalWireFacts.set(cmd, []);
      begin(cmd);
      const s = createGenerationAbortScope(signal, input.timeoutMs);
      let started = false,
        visible = "";
      const checkpoint = createGenerationTextBodyCheckpointV2({
        db: input.db,
        graphRepo: graph,
        command: cmd,
        initialBody: visible,
        streamProjectionSink: input.streamProjectionSink,
        nowMs: now,
        onFailure: () => undefined,
      });
      try {
        try {
          input.rawGenerationRequestStore?.tryPersistPreparedV2(
            {
              operationId: cmd.preparedRequest.operationId,
              answerRootId: cmd.preparedRequest.answerRootId,
              requestSequence: 1,
              providerId: "ollama",
              modelId: cmd.preparedRequest.modelId,
              conversationId: cmd.execution.operation.conversationId.value,
              branchId: cmd.execution.operation.branchId.value,
              questionId: cmd.execution.operation.questionId.value,
              actionKind: cmd.execution.operation.actionKind,
            },
            cmd.preparedRequest.body,
          );
        } catch {}
        const bytes = cmd.preparedRequest.body.copyBytes();
        let response: Response;
        try {
          response = await fetcher(cmd.preparedRequest.endpoint, {
            method: "POST",
            redirect: "error",
            signal: s.signal,
            headers: {
              "content-type": "application/json",
              accept: "application/x-ndjson",
            },
            body: Buffer.from(bytes),
          });
        } finally {
          bytes.fill(0);
        }
        if (!response.ok || !response.body) {
          try {
            await response.body?.cancel();
          } catch {}
          throw new Error("GENERATION_V2_OLLAMA_RUNNER_HTTP_FAILED");
        }
        const decoder = new OllamaNativeChatNdjsonDecoderV1(),
          assembler = new OllamaNativeChatStreamAssemblerV1(),
          reader = response.body.getReader();
        try {
          while (true) {
            const item = await abortableGenerationReadV2(reader.read(), s.signal);
            if (item.done) break;
            if (item.value.byteLength) started = true;
            for (const row of decoder.push(item.value)) {
              receivedLocalWireFacts.get(cmd)!.push(row);
              const delta = assembler.push(row);
              if (delta.contentDelta) {
                visible += delta.contentDelta;
                checkpoint.update(visible);
              }
              if (delta.thinkingDelta)
                publishGenerationStreamProjectionV2(
                  input.streamProjectionSink,
                  {
                    type: "reasoning_detail",
                    operationId: cmd.preparedRequest.operationId,
                    answerRootId: cmd.preparedRequest.answerRootId,
                    detail: Object.freeze({
                      type: "thought",
                      text: delta.thinkingDelta,
                    }),
                  },
                );
            }
          }
          for (const row of decoder.finish()) { receivedLocalWireFacts.get(cmd)!.push(row); assembler.push(row); }
        } finally {
          try {
            await reader.cancel();
          } catch {}
          reader.releaseLock();
        }
        // result.model is reported provenance; a mismatch with the requested model ID is not a failure
        const result = assembler.finish();
        persistGenerationNativeCompletionReceiptV2(input.db, cmd, result, now())
        checkpoint.flush();
        return materializeNewGenerationNativeCompletionV2({
          db: input.db, command: cmd, nativeResult: result, nowMs: now,
          materialize: () => terminal(cmd, "completed", result, null, null, "mid_stream"),
        });
      } catch (e) {
        if (isGenerationNativeCompletionMaterializationPendingV2Error(e)) throw e
        if (hasPendingGenerationNativeCompletionForOperationV2(input.db, cmd.preparedRequest.operationId)) {
          throw preserveGenerationNativeCompletionPendingFailureV2(input.db, cmd, e)
        }
        let failure: unknown = e;
        try {
          checkpoint.flush();
        } catch (checkpointError) {
          failure = checkpointError;
        }
        const cancelled = signal?.aborted === true && !s.timedOut(),
          code = cancelled
            ? "user_cancelled"
            : s.timedOut()
              ? "GENERATION_V2_OLLAMA_RUNNER_TIMEOUT"
              : failure instanceof Error
                ? failure.message
                : "GENERATION_V2_OLLAMA_RUNNER_TRANSPORT_FAILED";
        return terminal(
          cmd,
          cancelled ? "cancelled" : "failed",
          null,
          code,
          cancelled ? "Generation cancelled by user." : code,
          started ? "mid_stream" : "pre_stream",
        );
      } finally {
        receivedLocalWireFacts.delete(cmd);
        checkpoint.dispose();
        s.dispose();
      }
    },
  });
}
