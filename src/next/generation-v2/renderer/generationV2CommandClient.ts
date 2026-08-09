import type { ProviderFailureV2 } from '../../../shared/provider/providerFailureV2'
import type {
  GenerationOperationRuntimeSnapshotV2,
  GenerationStreamEventV2,
  GenerationStreamPayloadV2,
} from '../domain/generationStreamEventV2'

export type GenerationV2CommandResult = Readonly<{ ok: true; kind: 'created'|'idempotent_replay'; operationId:string;
  answerRootId:string; actionKind:string; branch:Readonly<{branchId:string;conversationId:string;questionId:string;
    headMessageId:string|null;chosenAnswerRootId:string|null;deletedAtMs:number|null}> }> | Readonly<{ok:false;code:string}>
export type GenerationV2Projection = Readonly<{type:'assistant_body';operationId:string;answerRootId:string;content:string}>|
  Readonly<{type:'reasoning_detail';operationId:string;answerRootId:string;detail:Readonly<Record<string,unknown>>}>|
  Readonly<{type:'image_output';operationId:string;answerRootId:string;assetId:string;assetRevisionId:string;mime:string}>|
  Readonly<{type:'terminal';operationId:string;answerRootId:string;state:'completed'|'failed'|'cancelled';errorCode:string|null;errorMessage:string|null;errorFact?:ProviderFailureV2}>
export type GenerationV2RuntimeUpdate =
  | Readonly<{ type: 'snapshot'; snapshot: GenerationOperationRuntimeSnapshotV2 }>
  | Readonly<{ type: 'event'; event: GenerationStreamEventV2; snapshot: GenerationOperationRuntimeSnapshotV2 }>
  | Readonly<{ type: 'sync_error'; operationId: string | null; code: string }>
type Bridge = Readonly<{
  initial: (command: unknown) => Promise<unknown>
  retry: (command: unknown) => Promise<unknown>
  regenerate: (command: unknown) => Promise<unknown>
  editResend: (command: unknown) => Promise<unknown>
}>
export type GenerationV2Route =
  | Readonly<{kind:'openrouter_chat'}>|Readonly<{kind:'openrouter_images'}>|Readonly<{kind:'openai_responses'}>
  | Readonly<{kind:'anthropic'}>|Readonly<{kind:'deepseek'}>|Readonly<{kind:'gemini_generate_content'}>|Readonly<{kind:'gemini_interactions_image'}>
  | Readonly<{kind:'openai_chat_compatible'}>|Readonly<{kind:'lmstudio_openresponses'}>|Readonly<{kind:'generic_local_openai_chat'}>|Readonly<{kind:'ollama_chat'}>
function root(){const v=window.generationV2;if(!v)throw new Error('GENERATION_V2_BRIDGE_UNAVAILABLE');return v}
function select(route:GenerationV2Route):Bridge{const v=root();switch(route.kind){case'openrouter_chat':return v.openRouter.chat as Bridge;case'openrouter_images':return v.openRouter.images as Bridge;case'openai_responses':return v.openAIResponses as Bridge;case'anthropic':return v.anthropic as Bridge;case'deepseek':return v.deepSeek as Bridge;case'gemini_generate_content':return v.gemini.generateContent as Bridge;case'gemini_interactions_image':return v.gemini.interactionsImage as Bridge;case'openai_chat_compatible':return v.openAICompatible.commands as Bridge;case'lmstudio_openresponses':return v.lmStudio.openResponses as Bridge;case'generic_local_openai_chat':return v.genericLocal.openAIChatCompletions as Bridge;case'ollama_chat':return v.ollama.chat as Bridge}}
function accepted(value:unknown):GenerationV2CommandResult{const r=value as GenerationV2CommandResult;if(!r||typeof r!=='object'||typeof r.ok!=='boolean')throw new Error('GENERATION_V2_IPC_RESULT_INVALID');return r}
export async function submitGenerationV2Initial(route:GenerationV2Route,command:unknown){return accepted(await select(route).initial(command))}
export async function submitGenerationV2Retry(route:GenerationV2Route,command:unknown){return accepted(await select(route).retry(command))}
export async function submitGenerationV2Regenerate(route:GenerationV2Route,command:unknown){return accepted(await select(route).regenerate(command))}
export async function submitGenerationV2EditResend(route:GenerationV2Route,command:unknown){return accepted(await select(route).editResend(command))}
export async function abortGenerationV2(_route:GenerationV2Route,operationId:string){
  return runtimeBridge().abort(operationId)
}

type RuntimeBridgeResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: string }>
function runtimeBridge() {
  const value = root().runtime
  if (!value) throw new Error('GENERATION_V2_RUNTIME_BRIDGE_UNAVAILABLE')
  return value
}
function runtimeResult<T>(value: unknown): T {
  const result = value as RuntimeBridgeResult<T>
  if (!result || result.ok !== true) throw new Error(result && 'code' in result
    ? result.code
    : 'GENERATION_V2_RUNTIME_RESULT_INVALID')
  return result.value
}
function reduceRuntimeSnapshot(
  previous: GenerationOperationRuntimeSnapshotV2,
  event: GenerationStreamEventV2,
): GenerationOperationRuntimeSnapshotV2 {
  const payload = event.payload
  if (payload.type === 'assistant_body') return Object.freeze({
    ...previous, body: payload.content, lastSequence: event.sequence,
  })
  if (payload.type === 'reasoning_detail') return Object.freeze({
    ...previous,
    reasoning: Object.freeze([...previous.reasoning, Object.freeze({ ...payload.detail })]),
    lastSequence: event.sequence,
  })
  if (payload.type === 'image_output') return Object.freeze({
    ...previous,
    images: Object.freeze([
      ...previous.images.filter((image) => image.outputIndex !== payload.outputIndex),
      Object.freeze({
        outputIndex: payload.outputIndex,
        assetId: payload.assetId,
        assetRevisionId: payload.assetRevisionId,
        mime: payload.mime,
      }),
    ].sort((left, right) => left.outputIndex - right.outputIndex)),
    lastSequence: event.sequence,
  })
  return Object.freeze({
    ...previous,
    status: payload.state === 'awaiting_tool' ? 'generating' : payload.state,
    errorFact: payload.errorFact,
    lastSequence: event.sequence,
  })
}
function isStreamEvent(value: unknown): value is GenerationStreamEventV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const event = value as Partial<GenerationStreamEventV2>
  return typeof event.operationId === 'string' && Number.isSafeInteger(event.sequence) &&
    (event.sequence ?? 0) > 0 && Boolean(event.payload && typeof event.payload === 'object')
}

export function subscribeGenerationV2Runtime(listener: (update: GenerationV2RuntimeUpdate) => void): () => void {
  const bridge = runtimeBridge()
  const snapshots = new Map<string, GenerationOperationRuntimeSnapshotV2>()
  const pending: GenerationStreamEventV2[] = []
  let hydrated = false
  let stopped = false
  let recovery = Promise.resolve()

  const recover = async (operationId: string, code: string) => {
    try {
      const snapshot = runtimeResult<GenerationOperationRuntimeSnapshotV2 | null>(await bridge.snapshot(operationId))
      if (!snapshot) {
        listener(Object.freeze({ type: 'sync_error', operationId, code }))
        return
      }
      snapshots.set(operationId, snapshot)
      listener(Object.freeze({ type: 'snapshot', snapshot }))
    } catch (error) {
      listener(Object.freeze({
        type: 'sync_error',
        operationId,
        code: error instanceof Error ? error.message : code,
      }))
    }
  }
  const apply = (event: GenerationStreamEventV2) => {
    const previous = snapshots.get(event.operationId)
    if (!previous) {
      recovery = recovery.then(() => recover(event.operationId, 'GENERATION_V2_RUNTIME_EVENT_OPERATION_UNKNOWN'))
      return
    }
    if (event.sequence <= previous.lastSequence) return
    if (event.sequence !== previous.lastSequence + 1) {
      recovery = recovery.then(() => recover(event.operationId, 'GENERATION_V2_RUNTIME_EVENT_SEQUENCE_GAP'))
      return
    }
    const snapshot = reduceRuntimeSnapshot(previous, event)
    snapshots.set(event.operationId, snapshot)
    listener(Object.freeze({ type: 'event', event, snapshot }))
  }
  const stopEvents = bridge.onEvent((value: unknown) => {
    if (stopped) return
    if (!isStreamEvent(value)) {
      listener(Object.freeze({ type: 'sync_error', operationId: null, code: 'GENERATION_V2_RUNTIME_EVENT_INVALID' }))
      return
    }
    if (!hydrated) pending.push(value)
    else apply(value)
  })
  void bridge.subscribe().then((value: unknown) => {
    if (stopped) return
    const initial = runtimeResult<readonly GenerationOperationRuntimeSnapshotV2[]>(value)
    for (const snapshot of initial) {
      snapshots.set(snapshot.binding.operationId, snapshot)
      listener(Object.freeze({ type: 'snapshot', snapshot }))
    }
    hydrated = true
    for (const event of pending.splice(0)) apply(event)
  }).catch((error: unknown) => {
    if (!stopped) listener(Object.freeze({
      type: 'sync_error',
      operationId: null,
      code: error instanceof Error ? error.message : 'GENERATION_V2_RUNTIME_SUBSCRIBE_FAILED',
    }))
  })
  return () => {
    stopped = true
    stopEvents()
  }
}

function projectionFromRuntimeUpdate(update: GenerationV2RuntimeUpdate): GenerationV2Projection | null {
  if (update.type !== 'event') return null
  const answerRootId = update.snapshot.binding.targetAnswerId
  const payload: GenerationStreamPayloadV2 = update.event.payload
  if (payload.type === 'assistant_body') return Object.freeze({
    type: 'assistant_body', operationId: update.event.operationId, answerRootId, content: payload.content,
  })
  if (payload.type === 'reasoning_detail') return Object.freeze({
    type: 'reasoning_detail', operationId: update.event.operationId, answerRootId, detail: payload.detail,
  })
  if (payload.type === 'image_output') return Object.freeze({
    type: 'image_output', operationId: update.event.operationId, answerRootId,
    assetId: payload.assetId, assetRevisionId: payload.assetRevisionId, mime: payload.mime,
  })
  if (payload.state === 'awaiting_tool') return null
  return Object.freeze({
    type: 'terminal', operationId: update.event.operationId, answerRootId, state: payload.state,
    errorCode: payload.errorCode, errorMessage: payload.errorMessage, ...(payload.errorFact ? { errorFact: payload.errorFact } : {}),
  })
}

export function subscribeGenerationV2Projections(listener:(projection:GenerationV2Projection)=>void):()=>void {
  return subscribeGenerationV2Runtime((update) => {
    if (update.type === 'sync_error') throw new Error(update.code)
    const projection = projectionFromRuntimeUpdate(update)
    if (projection) listener(projection)
  })
}
