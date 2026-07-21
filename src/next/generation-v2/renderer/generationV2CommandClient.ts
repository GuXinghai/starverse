export type GenerationV2CommandResult = Readonly<{ ok: true; kind: 'created'|'idempotent_replay'; operationId:string;
  answerRootId:string; actionKind:string; branch:Readonly<{branchId:string;conversationId:string;questionId:string;
    headMessageId:string|null;chosenAnswerRootId:string|null;deletedAtMs:number|null}>;visibleAnswerRootIds:readonly string[];
  visibleQuestionIds:readonly string[] }> | Readonly<{ok:false;code:string}>
export type GenerationV2Projection = Readonly<{type:'assistant_body';operationId:string;answerRootId:string;content:string}>|
  Readonly<{type:'reasoning_detail';operationId:string;answerRootId:string;detail:Readonly<Record<string,unknown>>}>|
  Readonly<{type:'image_output';operationId:string;answerRootId:string;assetId:string;assetRevisionId:string;mime:string}>|
  Readonly<{type:'terminal';operationId:string;answerRootId:string;state:'completed'|'failed'|'cancelled';errorCode:string|null;errorMessage:string|null}>
type Bridge = NonNullable<Window['generationV2']> extends infer V ? V extends {openAIResponses:infer B}?B:never:never
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
export async function abortGenerationV2(route:GenerationV2Route,operationId:string){return select(route).abort(operationId)}
export function subscribeGenerationV2Projections(listener:(projection:GenerationV2Projection)=>void):()=>void{const v=root();const bridges=[v.openRouter.chat,v.openRouter.images,v.openAIResponses,v.anthropic,v.deepSeek,v.gemini.generateContent,v.gemini.interactionsImage,v.openAICompatible.commands,v.lmStudio.openResponses,v.genericLocal.openAIChatCompletions,v.ollama.chat];const stops=bridges.map((bridge)=>bridge.onProjection((value)=>listener(value as GenerationV2Projection)));return()=>{for(const stop of stops)stop()}}
